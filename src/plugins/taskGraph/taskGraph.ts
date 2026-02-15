/**
 * Task Graph (DAG) Plugin for lmthing
 *
 * Provides a dependency-aware task system using a Directed Acyclic Graph (DAG)
 * architecture for multi-agent orchestration. Tasks declare dependencies and
 * downstream relationships, enabling topological execution ordering and
 * automatic unblocking of downstream tasks.
 *
 * @example
 * import { taskGraphPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defTaskGraph, $ }) => {
 *   const [graph, setGraph] = defTaskGraph([
 *     { id: 'research', title: 'Research', description: 'Research the topic',
 *       status: 'pending', dependencies: [], unblocks: ['write'],
 *       required_capabilities: ['web-search'] },
 *     { id: 'write', title: 'Write', description: 'Write the report',
 *       status: 'pending', dependencies: ['research'], unblocks: [],
 *       required_capabilities: ['writing'] },
 *   ]);
 *
 *   $`Execute the task graph. Use getUnblockedTasks to find ready tasks and updateTaskStatus to track progress.`;
 * }, { model: 'openai:gpt-4o', plugins: [taskGraphPlugin] });
 */

import { z } from 'zod';
import type { StatefulPrompt } from '../../StatefulPrompt';
import type {
  TaskNode,
  TaskNodeStatus,
  GenerateTaskGraphResult,
  GetUnblockedTasksResult,
  UpdateTaskStatusResult,
} from '../types';

const TASK_GRAPH_STATE_KEY = 'taskGraph';

// ============================================================
// DAG Validation Utilities
// ============================================================

/**
 * Detects circular dependencies in the task graph using Kahn's algorithm.
 * Returns an array of task IDs involved in cycles, or empty array if no cycles.
 */
export function detectCycles(tasks: TaskNode[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const allIds = new Set(tasks.map(t => t.id));

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (allIds.has(dep)) {
        adjacency.get(dep)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm: process nodes with in-degree 0
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // Any remaining nodes with in-degree > 0 are in cycles
  return tasks
    .filter(t => !sorted.includes(t.id))
    .map(t => t.id);
}

/**
 * Validates the consistency of the task graph:
 * - All referenced dependency IDs exist
 * - All referenced unblocks IDs exist
 * - No circular dependencies
 * - dependencies/unblocks are symmetric (if A depends on B, B should unblock A)
 *
 * Returns an array of validation error messages, or empty array if valid.
 */
export function validateTaskGraph(tasks: TaskNode[]): string[] {
  const errors: string[] = [];
  const allIds = new Set(tasks.map(t => t.id));

  // Check for duplicate IDs
  if (allIds.size !== tasks.length) {
    const seen = new Set<string>();
    for (const task of tasks) {
      if (seen.has(task.id)) {
        errors.push(`Duplicate task ID: "${task.id}"`);
      }
      seen.add(task.id);
    }
  }

  for (const task of tasks) {
    // Validate dependency references
    for (const dep of task.dependencies) {
      if (!allIds.has(dep)) {
        errors.push(`Task "${task.id}" depends on unknown task "${dep}"`);
      }
    }

    // Validate unblocks references
    for (const unblock of task.unblocks) {
      if (!allIds.has(unblock)) {
        errors.push(`Task "${task.id}" unblocks unknown task "${unblock}"`);
      }
    }
  }

  // Check for cycles
  const cycleNodes = detectCycles(tasks);
  if (cycleNodes.length > 0) {
    errors.push(`Circular dependency detected involving tasks: ${cycleNodes.join(', ')}`);
  }

  return errors;
}

/**
 * Normalizes the task graph by ensuring symmetric dependency/unblocks relationships.
 * If A depends on B, then B.unblocks should include A, and vice versa.
 */
export function normalizeTaskGraph(tasks: TaskNode[]): TaskNode[] {
  const taskMap = new Map(tasks.map(t => [t.id, { ...t, dependencies: [...t.dependencies], unblocks: [...t.unblocks] }]));

  for (const task of taskMap.values()) {
    // For each dependency, ensure the dependency's unblocks includes this task
    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (dep && !dep.unblocks.includes(task.id)) {
        dep.unblocks.push(task.id);
      }
    }
    // For each unblocks, ensure the unblocked task's dependencies includes this task
    for (const unblockId of task.unblocks) {
      const unblocked = taskMap.get(unblockId);
      if (unblocked && !unblocked.dependencies.includes(task.id)) {
        unblocked.dependencies.push(task.id);
      }
    }
  }

  return Array.from(taskMap.values());
}

/**
 * Returns all tasks whose dependencies are fully completed (i.e., ready to start).
 */
export function getUnblockedTasks(tasks: TaskNode[]): TaskNode[] {
  const completedIds = new Set(
    tasks.filter(t => t.status === 'completed').map(t => t.id)
  );

  return tasks.filter(t => {
    if (t.status !== 'pending') return false;
    return t.dependencies.every(depId => completedIds.has(depId));
  });
}

// ============================================================
// Plugin Implementation
// ============================================================

/**
 * Creates a dependency-aware task graph (DAG) with tools for managing
 * task execution, status updates, and automatic dependency resolution.
 *
 * @category Plugins
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @param tasks - Initial array of TaskNode objects forming the DAG
 * @returns Tuple of [taskGraph, setTaskGraph] for accessing and updating the graph
 */
export function defTaskGraph(
  this: StatefulPrompt,
  tasks: TaskNode[] = []
): [TaskNode[], (newValue: TaskNode[] | ((prev: TaskNode[]) => TaskNode[])) => void] {
  // Normalize and validate initial graph
  const normalized = tasks.length > 0 ? normalizeTaskGraph(tasks) : tasks;
  const validationErrors = tasks.length > 0 ? validateTaskGraph(normalized) : [];
  if (validationErrors.length > 0) {
    // Log warnings but don't throw - allow the graph to be used
    console.warn(`Task graph validation warnings: ${validationErrors.join('; ')}`);
  }

  // Create persistent state for the task graph
  const [taskGraph, setTaskGraph] = this.defState<TaskNode[]>(TASK_GRAPH_STATE_KEY, normalized);

  // Helper to get current task graph state
  const getCurrentGraph = (): TaskNode[] => {
    return this.getState<TaskNode[]>(TASK_GRAPH_STATE_KEY) || taskGraph;
  };

  // --------------------------------------------------------
  // Tool: generateTaskGraph
  // --------------------------------------------------------
  this.defTool(
    'generateTaskGraph',
    'Create or replace the task graph DAG from a list of task nodes. ' +
    'Each task must have an id, title, description, status, dependencies (array of upstream task IDs), ' +
    'unblocks (array of downstream task IDs), and required_capabilities. ' +
    'The graph is validated for cycles and missing references.',
    z.object({
      tasks: z.array(z.object({
        id: z.string().describe('Unique task identifier'),
        title: z.string().describe('Concise task name'),
        description: z.string().describe('Detailed execution instructions'),
        dependencies: z.array(z.string()).describe('IDs of upstream tasks that must complete first'),
        unblocks: z.array(z.string()).describe('IDs of downstream tasks this unblocks'),
        required_capabilities: z.array(z.string()).describe('Capabilities needed, e.g. ["database", "web-search"]'),
        assigned_subagent: z.string().optional().describe('Subagent to handle this task'),
        input_context: z.string().optional().describe('Context from upstream tasks'),
      }))
    }),
    async ({ tasks: newTasks }: { tasks: Array<Omit<TaskNode, 'status' | 'output_result'>> }): Promise<GenerateTaskGraphResult> => {
      // Assign initial status to all tasks
      const tasksWithStatus: TaskNode[] = newTasks.map(t => ({
        ...t,
        status: 'pending' as TaskNodeStatus,
        output_result: undefined,
      }));

      // Normalize (ensure symmetric edges)
      const normalized = normalizeTaskGraph(tasksWithStatus);

      // Validate
      const errors = validateTaskGraph(normalized);
      if (errors.length > 0) {
        return {
          success: false,
          message: `Invalid task graph: ${errors.join('; ')}`,
        };
      }

      setTaskGraph(normalized);

      return {
        success: true,
        message: `Task graph created with ${normalized.length} tasks. ` +
          `${getUnblockedTasks(normalized).length} task(s) are immediately ready for execution.`,
        taskCount: normalized.length,
        tasks: normalized,
      };
    }
  );

  // --------------------------------------------------------
  // Tool: getUnblockedTasks
  // --------------------------------------------------------
  this.defTool(
    'getUnblockedTasks',
    'Get all tasks whose upstream dependencies are fully completed and are ready to be started. ' +
    'Use this to find the next tasks to work on.',
    z.object({}),
    async (): Promise<GetUnblockedTasksResult> => {
      const currentGraph = getCurrentGraph();
      const unblocked = getUnblockedTasks(currentGraph);

      if (unblocked.length === 0) {
        const inProgress = currentGraph.filter(t => t.status === 'in_progress');
        const pending = currentGraph.filter(t => t.status === 'pending');
        if (inProgress.length > 0) {
          return {
            success: true,
            message: `No tasks are unblocked. ${inProgress.length} task(s) are currently in progress. Waiting for them to complete.`,
            tasks: [],
          };
        }
        if (pending.length > 0) {
          return {
            success: true,
            message: `No tasks are currently unblocked. ${pending.length} task(s) are still pending but have unmet dependencies.`,
            tasks: [],
          };
        }
        return {
          success: true,
          message: 'All tasks have been completed or failed. No tasks remaining.',
          tasks: [],
        };
      }

      return {
        success: true,
        message: `${unblocked.length} task(s) are ready for execution.`,
        tasks: unblocked,
      };
    }
  );

  // --------------------------------------------------------
  // Tool: updateTaskStatus
  // --------------------------------------------------------
  this.defTool(
    'updateTaskStatus',
    'Update the status of a task in the graph. When a task is completed, ' +
    'downstream tasks that have all dependencies met will be automatically unblocked. ' +
    'Use status "in_progress" to start a task, "completed" when done (attach output_result), ' +
    'or "failed" if it cannot be completed.',
    z.object({
      taskId: z.string().describe('The ID of the task to update'),
      status: z.enum(['in_progress', 'completed', 'failed']).describe('New status for the task'),
      output_result: z.string().optional().describe('Summary/artifact produced upon completion'),
    }),
    async ({ taskId, status, output_result }: {
      taskId: string;
      status: 'in_progress' | 'completed' | 'failed';
      output_result?: string;
    }): Promise<UpdateTaskStatusResult> => {
      const currentGraph = getCurrentGraph();
      const task = currentGraph.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task "${taskId}" not found. Available IDs: ${currentGraph.map(t => t.id).join(', ')}`,
        };
      }

      // Validate status transitions
      if (task.status === 'completed' && status !== 'completed') {
        return {
          success: false,
          taskId,
          message: `Task "${task.title}" is already completed and cannot be changed to "${status}".`,
          task,
        };
      }

      if (status === 'in_progress') {
        if (task.status === 'in_progress') {
          return {
            success: true,
            taskId,
            message: `Task "${task.title}" is already in progress.`,
            task,
          };
        }
        // Check that dependencies are met
        const completedIds = new Set(
          currentGraph.filter(t => t.status === 'completed').map(t => t.id)
        );
        const unmetDeps = task.dependencies.filter(d => !completedIds.has(d));
        if (unmetDeps.length > 0) {
          return {
            success: false,
            taskId,
            message: `Cannot start task "${task.title}". Unmet dependencies: ${unmetDeps.join(', ')}`,
            task,
          };
        }
      }

      // Apply update
      const updatedTask: TaskNode = {
        ...task,
        status,
        ...(output_result !== undefined ? { output_result } : {}),
      };

      // If completed, check for newly unblocked downstream tasks and
      // propagate output_result as input_context in a single state update
      let newlyUnblockedTasks: TaskNode[] = [];
      if (status === 'completed') {
        // Compute the updated graph to find newly unblocked tasks
        const currentGraph2 = getCurrentGraph();
        const updatedGraph = currentGraph2.map(t => t.id === taskId ? updatedTask : t);
        const completedIds = new Set(
          updatedGraph.filter(t => t.status === 'completed').map(t => t.id)
        );

        newlyUnblockedTasks = updatedGraph.filter(t => {
          if (t.status !== 'pending') return false;
          if (!task.unblocks.includes(t.id)) return false;
          return t.dependencies.every(d => completedIds.has(d));
        });

        const unblockedIds = new Set(newlyUnblockedTasks.map(u => u.id));

        // Single state update: apply task completion + context propagation
        setTaskGraph(prev => prev.map(t => {
          if (t.id === taskId) return updatedTask;
          if (output_result && unblockedIds.has(t.id)) {
            const existingContext = t.input_context ? t.input_context + '\n\n' : '';
            return {
              ...t,
              input_context: existingContext + `[From ${task.title}]: ${output_result}`,
            };
          }
          return t;
        }));
      } else {
        setTaskGraph(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      }

      const message = status === 'completed' && newlyUnblockedTasks.length > 0
        ? `Task "${task.title}" completed. Newly unblocked: ${newlyUnblockedTasks.map(t => t.title).join(', ')}.`
        : status === 'completed'
          ? `Task "${task.title}" completed.`
          : status === 'failed'
            ? `Task "${task.title}" marked as failed.`
            : `Task "${task.title}" is now in progress.`;

      return {
        success: true,
        taskId,
        message,
        task: updatedTask,
        newlyUnblockedTasks: newlyUnblockedTasks.length > 0 ? newlyUnblockedTasks : undefined,
      };
    }
  );

  // --------------------------------------------------------
  // Effect: Update system prompt with DAG status
  // --------------------------------------------------------
  this.defEffect((_ctx, stepModifier) => {
    const currentGraph = getCurrentGraph();
    if (currentGraph.length === 0) return;

    const pending = currentGraph.filter(t => t.status === 'pending');
    const inProgress = currentGraph.filter(t => t.status === 'in_progress');
    const completed = currentGraph.filter(t => t.status === 'completed');
    const failed = currentGraph.filter(t => t.status === 'failed');

    const unblockedTasks = getUnblockedTasks(currentGraph);
    const unblockedIds = new Set(unblockedTasks.map(t => t.id));

    const formatNode = (t: TaskNode) => {
      const deps = t.dependencies.length > 0
        ? ` (depends on: ${t.dependencies.join(', ')})`
        : '';
      const caps = t.required_capabilities.length > 0
        ? ` [${t.required_capabilities.join(', ')}]`
        : '';
      const agent = t.assigned_subagent ? ` → ${t.assigned_subagent}` : '';
      return `  - [${t.id}] ${t.title}${deps}${caps}${agent}`;
    };

    const formatNodes = (nodes: TaskNode[]) =>
      nodes.map(formatNode).join('\n') || '  (none)';

    const readySection = unblockedTasks.length > 0
      ? `\n### Ready to Start (${unblockedTasks.length})\n${formatNodes(unblockedTasks)}\n`
      : '';

    const blockedPending = pending.filter(t => !unblockedIds.has(t.id));

    const content = `
## Task Graph Status

### In Progress (${inProgress.length})
${formatNodes(inProgress)}
${readySection}
### Blocked / Pending (${blockedPending.length})
${formatNodes(blockedPending)}

### Completed (${completed.length})
${formatNodes(completed)}

${failed.length > 0 ? `### Failed (${failed.length})\n${formatNodes(failed)}\n` : ''}Use "getUnblockedTasks" to find tasks ready for execution, "updateTaskStatus" to update task progress.
`.trim();

    stepModifier('systems', [{
      name: 'taskGraph',
      value: content,
    }]);
  }, [taskGraph]);

  return [taskGraph, setTaskGraph];
}

/**
 * Task Graph Plugin
 *
 * Provides dependency-aware task management using a DAG architecture.
 *
 * @category Plugins
 *
 * @example
 * import { taskGraphPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defTaskGraph }) => {
 *   // defTaskGraph is now available
 * }, { plugins: [taskGraphPlugin] });
 */
export const taskGraphPlugin = {
  defTaskGraph,
};
