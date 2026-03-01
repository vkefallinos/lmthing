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
  TaskNodeType,
  GenerateTaskGraphResult,
  GetUnblockedTasksResult,
  UpdateTaskStatusResult,
  SpawnTaskResult,
  AskHumanResult,
  AnswerQuestionResult,
  ReadTreeResult,
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

// --------------------------------------------------------
// Internal helpers
// --------------------------------------------------------

/**
 * Builds the input_context string for a newly unblocked task.
 * - `spawn` nodes (default): only direct dependency outputs.
 * - `fork` nodes: outputs from ALL completed tasks in the graph.
 */
function buildContextForUnblockedTask(
  task: TaskNode,
  updatedGraph: TaskNode[],
  completingTask: TaskNode,
  completingOutput: string | undefined
): string | undefined {
  const nodeType = task.node_type ?? 'spawn';

  if (nodeType === 'fork') {
    // Fork: collect ALL completed tasks' outputs
    const completedWithOutput = updatedGraph.filter(
      t => t.status === 'completed' && t.output_result
    );
    if (completedWithOutput.length === 0) return task.input_context;

    const parts: string[] = [];
    if (task.input_context) parts.push(task.input_context);
    for (const ct of completedWithOutput) {
      parts.push(`[From ${ct.title}]: ${ct.output_result}`);
    }
    return parts.join('\n\n');
  }

  // Spawn (default): only from the completing task
  if (!completingOutput) return task.input_context;
  const existing = task.input_context ? task.input_context + '\n\n' : '';
  return existing + `[From ${completingTask.title}]: ${completingOutput}`;
}

/**
 * Returns a short, CORD-style status symbol + node-type label for a task.
 */
function nodeLabel(t: TaskNode): string {
  const sym = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '●' : t.status === 'failed' ? '✗' : '○';
  const typeTag = t.node_type && t.node_type !== 'spawn' ? ` [${t.node_type.toUpperCase()}]` : '';
  return `${sym}${typeTag}`;
}

/**
 * Creates a dependency-aware task graph (DAG) with tools for managing
 * task execution, status updates, and automatic dependency resolution.
 *
 * Implements the CORD protocol primitives: spawn, fork, ask.
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
  // Shared: complete a task and propagate context
  // Returns { updatedGraph, newlyUnblockedTasks }
  // --------------------------------------------------------
  const applyCompletion = (
    graph: TaskNode[],
    taskId: string,
    output_result?: string
  ): { updatedGraph: TaskNode[]; newlyUnblockedTasks: TaskNode[] } => {
    const task = graph.find(t => t.id === taskId)!;
    const updatedTask: TaskNode = {
      ...task,
      status: 'completed' as TaskNodeStatus,
      ...(output_result !== undefined ? { output_result } : {}),
    };

    // Graph with just this task updated (to compute completed set)
    const graphAfterUpdate = graph.map(t => t.id === taskId ? updatedTask : t);
    const completedIds = new Set(
      graphAfterUpdate.filter(t => t.status === 'completed').map(t => t.id)
    );

    const newlyUnblockedTasks = graphAfterUpdate.filter(t => {
      if (t.status !== 'pending') return false;
      if (!task.unblocks.includes(t.id)) return false;
      return t.dependencies.every(d => completedIds.has(d));
    });

    const unblockedIds = new Set(newlyUnblockedTasks.map(u => u.id));

    // Apply completion + context propagation in one pass
    const updatedGraph = graphAfterUpdate.map(t => {
      if (unblockedIds.has(t.id)) {
        const newContext = buildContextForUnblockedTask(t, graphAfterUpdate, updatedTask, output_result);
        if (newContext !== t.input_context) {
          return { ...t, input_context: newContext };
        }
      }
      return t;
    });

    return { updatedGraph, newlyUnblockedTasks };
  };

  // --------------------------------------------------------
  // Tool: generateTaskGraph
  // --------------------------------------------------------
  this.defTool(
    'generateTaskGraph',
    'Create or replace the task graph DAG from a list of task nodes. ' +
    'All new tasks are initialized with status "pending". ' +
    'Each task must have an id, title, description, dependencies (array of upstream task IDs), ' +
    'unblocks (array of downstream task IDs), and required_capabilities. ' +
    'Optionally set node_type to "spawn" (default, clean-slate context), ' +
    '"fork" (inherits ALL completed results), or "ask" (human-in-the-loop question). ' +
    'The graph is validated for cycles and missing references.',
    z.object({
      tasks: z.array(z.object({
        id: z.string().describe('Unique task identifier'),
        title: z.string().describe('Concise task name'),
        description: z.string().describe('Detailed execution instructions'),
        node_type: z.enum(['spawn', 'fork', 'ask']).optional()
          .describe('Node type: spawn (default), fork (inherits all context), or ask (human question)'),
        dependencies: z.array(z.string()).describe('IDs of upstream tasks that must complete first'),
        unblocks: z.array(z.string()).describe('IDs of downstream tasks this unblocks'),
        required_capabilities: z.array(z.string()).describe('Capabilities needed, e.g. ["database", "web-search"]'),
        assigned_subagent: z.string().optional().describe('Subagent to handle this task'),
        input_context: z.string().optional().describe('Context from upstream tasks'),
        question: z.string().optional().describe('For ask nodes: the question to ask the human'),
        answer_options: z.array(z.string()).optional().describe('For ask nodes: optional answer choices'),
      }))
    }),
    async ({ tasks: newTasks }: {
      tasks: Array<Omit<TaskNode, 'status' | 'output_result'>>;
    }): Promise<GenerateTaskGraphResult> => {
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
    'Fork nodes will receive context from ALL completed tasks; spawn nodes only from direct dependencies. ' +
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

      let newlyUnblockedTasks: TaskNode[] = [];

      if (status === 'completed') {
        // Use shared completion helper (handles fork/spawn context propagation)
        const { updatedGraph, newlyUnblockedTasks: unblocked } =
          applyCompletion(currentGraph, taskId, output_result);
        newlyUnblockedTasks = unblocked;
        setTaskGraph(updatedGraph);
      } else {
        const updatedTask: TaskNode = {
          ...task,
          status,
          ...(output_result !== undefined ? { output_result } : {}),
        };
        setTaskGraph(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      }

      const updatedTask = getCurrentGraph().find(t => t.id === taskId)!;

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
  // Tool: spawnTask  (CORD: spawn primitive)
  // --------------------------------------------------------
  this.defTool(
    'spawnTask',
    'Dynamically add a new spawn task to the running graph. ' +
    'A spawned task gets a clean slate: only the outputs of its declared dependencies are injected as context. ' +
    'Equivalent to CORD\'s spawn() primitive.',
    z.object({
      id: z.string().describe('Unique task identifier'),
      title: z.string().describe('Concise task name'),
      description: z.string().describe('Detailed execution instructions'),
      dependencies: z.array(z.string()).default([]).describe('IDs of upstream tasks that must complete first'),
      unblocks: z.array(z.string()).default([]).describe('IDs of downstream tasks this unblocks'),
      required_capabilities: z.array(z.string()).default([]).describe('Capabilities needed'),
      assigned_subagent: z.string().optional().describe('Subagent to handle this task'),
    }),
    async (args: {
      id: string;
      title: string;
      description: string;
      dependencies: string[];
      unblocks: string[];
      required_capabilities: string[];
      assigned_subagent?: string;
    }): Promise<SpawnTaskResult> => {
      const currentGraph = getCurrentGraph();

      if (currentGraph.find(t => t.id === args.id)) {
        return { success: false, message: `Task ID "${args.id}" already exists.` };
      }

      const newTask: TaskNode = {
        ...args,
        node_type: 'spawn',
        status: 'pending',
      };

      const newGraph = normalizeTaskGraph([...currentGraph, newTask]);
      const errors = validateTaskGraph(newGraph);
      if (errors.length > 0) {
        return { success: false, message: `Invalid task: ${errors.join('; ')}` };
      }

      setTaskGraph(newGraph);
      return {
        success: true,
        message: `Spawned task "${args.title}" (${args.id}). ` +
          `Dependencies: ${args.dependencies.length ? args.dependencies.join(', ') : 'none'}.`,
        task: newGraph.find(t => t.id === args.id),
      };
    }
  );

  // --------------------------------------------------------
  // Tool: forkTask  (CORD: fork primitive)
  // --------------------------------------------------------
  this.defTool(
    'forkTask',
    'Dynamically add a new fork task to the running graph. ' +
    'A forked task inherits ALL completed tasks\' outputs as context when it becomes unblocked. ' +
    'Use fork for synthesis or analysis steps that need the full picture of what the team has learned. ' +
    'Equivalent to CORD\'s fork() primitive.',
    z.object({
      id: z.string().describe('Unique task identifier'),
      title: z.string().describe('Concise task name'),
      description: z.string().describe('Detailed execution instructions'),
      dependencies: z.array(z.string()).default([]).describe('IDs of upstream tasks that must complete first'),
      unblocks: z.array(z.string()).default([]).describe('IDs of downstream tasks this unblocks'),
      required_capabilities: z.array(z.string()).default([]).describe('Capabilities needed'),
      assigned_subagent: z.string().optional().describe('Subagent to handle this task'),
    }),
    async (args: {
      id: string;
      title: string;
      description: string;
      dependencies: string[];
      unblocks: string[];
      required_capabilities: string[];
      assigned_subagent?: string;
    }): Promise<SpawnTaskResult> => {
      const currentGraph = getCurrentGraph();

      if (currentGraph.find(t => t.id === args.id)) {
        return { success: false, message: `Task ID "${args.id}" already exists.` };
      }

      const newTask: TaskNode = {
        ...args,
        node_type: 'fork',
        status: 'pending',
      };

      const newGraph = normalizeTaskGraph([...currentGraph, newTask]);
      const errors = validateTaskGraph(newGraph);
      if (errors.length > 0) {
        return { success: false, message: `Invalid task: ${errors.join('; ')}` };
      }

      setTaskGraph(newGraph);
      return {
        success: true,
        message: `Forked task "${args.title}" (${args.id}) added. ` +
          `It will inherit ALL completed task outputs when unblocked. ` +
          `Dependencies: ${args.dependencies.length ? args.dependencies.join(', ') : 'none'}.`,
        task: newGraph.find(t => t.id === args.id),
      };
    }
  );

  // --------------------------------------------------------
  // Tool: askHuman  (CORD: ask primitive)
  // --------------------------------------------------------
  this.defTool(
    'askHuman',
    'Create a human-in-the-loop question node. The question will appear in the task graph ' +
    'and downstream tasks will be blocked until it is answered via the "answerQuestion" tool. ' +
    'Use this when the agent needs information that cannot be researched autonomously. ' +
    'Equivalent to CORD\'s ask() primitive.',
    z.object({
      id: z.string().describe('Unique task identifier for the question node'),
      question: z.string().describe('The question to present to the human'),
      answer_options: z.array(z.string()).optional().describe('Optional list of answer choices'),
      dependencies: z.array(z.string()).default([]).describe('IDs of upstream tasks that must complete first'),
      unblocks: z.array(z.string()).default([]).describe('IDs of downstream tasks blocked until answered'),
    }),
    async (args: {
      id: string;
      question: string;
      answer_options?: string[];
      dependencies: string[];
      unblocks: string[];
    }): Promise<AskHumanResult> => {
      const currentGraph = getCurrentGraph();

      if (currentGraph.find(t => t.id === args.id)) {
        return { success: false, message: `Task ID "${args.id}" already exists.` };
      }

      const newTask: TaskNode = {
        id: args.id,
        title: `[ASK] ${args.question.length > 60 ? args.question.slice(0, 60) + '…' : args.question}`,
        description: args.question,
        node_type: 'ask',
        question: args.question,
        answer_options: args.answer_options,
        status: 'pending',
        dependencies: args.dependencies,
        unblocks: args.unblocks,
        required_capabilities: [],
      };

      const newGraph = normalizeTaskGraph([...currentGraph, newTask]);
      const errors = validateTaskGraph(newGraph);
      if (errors.length > 0) {
        return { success: false, message: `Invalid ask node: ${errors.join('; ')}` };
      }

      setTaskGraph(newGraph);

      const optionsText = args.answer_options?.length
        ? ` Options: ${args.answer_options.join(', ')}.`
        : '';
      return {
        success: true,
        message: `Question node "${args.id}" created: "${args.question}".${optionsText} ` +
          `Downstream tasks (${args.unblocks.join(', ') || 'none'}) are blocked until answered.`,
        task: newGraph.find(t => t.id === args.id),
      };
    }
  );

  // --------------------------------------------------------
  // Tool: answerQuestion
  // --------------------------------------------------------
  this.defTool(
    'answerQuestion',
    'Provide a human answer to a pending ask node, completing it and unblocking downstream tasks. ' +
    'The answer becomes the output_result of the ask node and is propagated as context to dependents.',
    z.object({
      taskId: z.string().describe('The ID of the ask node to answer'),
      answer: z.string().describe('The human\'s answer to the question'),
    }),
    async ({ taskId, answer }: {
      taskId: string;
      answer: string;
    }): Promise<AnswerQuestionResult> => {
      const currentGraph = getCurrentGraph();
      const task = currentGraph.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task "${taskId}" not found. Available IDs: ${currentGraph.map(t => t.id).join(', ')}`,
        };
      }

      if (task.node_type !== 'ask') {
        return {
          success: false,
          taskId,
          message: `Task "${taskId}" is not an ask node (type: ${task.node_type ?? 'spawn'}).`,
        };
      }

      if (task.status === 'completed') {
        return {
          success: false,
          taskId,
          message: `Ask node "${task.title}" has already been answered.`,
        };
      }

      // Check dependencies are met
      const completedIds = new Set(
        currentGraph.filter(t => t.status === 'completed').map(t => t.id)
      );
      const unmetDeps = task.dependencies.filter(d => !completedIds.has(d));
      if (unmetDeps.length > 0) {
        return {
          success: false,
          taskId,
          message: `Cannot answer "${task.title}" yet. Unmet dependencies: ${unmetDeps.join(', ')}`,
        };
      }

      const { updatedGraph, newlyUnblockedTasks } =
        applyCompletion(currentGraph, taskId, answer);
      setTaskGraph(updatedGraph);

      const updatedTask = updatedGraph.find(t => t.id === taskId)!;

      return {
        success: true,
        taskId,
        message: `Question answered: "${answer}". ` +
          (newlyUnblockedTasks.length > 0
            ? `Newly unblocked: ${newlyUnblockedTasks.map(t => t.title).join(', ')}.`
            : 'No tasks newly unblocked.'),
        task: updatedTask,
        newlyUnblockedTasks: newlyUnblockedTasks.length > 0 ? newlyUnblockedTasks : undefined,
      };
    }
  );

  // --------------------------------------------------------
  // Tool: readTree  (CORD: read_tree() primitive)
  // --------------------------------------------------------
  this.defTool(
    'readTree',
    'View the full task coordination tree in a hierarchical CORD-style format. ' +
    'Shows all tasks with their types (SPAWN/FORK/ASK), statuses, and dependency relationships. ' +
    'Use this to understand the current state of the entire task tree. ' +
    'Equivalent to CORD\'s read_tree() primitive.',
    z.object({}),
    async (): Promise<ReadTreeResult> => {
      const currentGraph = getCurrentGraph();

      if (currentGraph.length === 0) {
        return {
          success: true,
          message: 'Task tree is empty.',
          tree: '(empty)',
          tasks: [],
        };
      }

      // Build tree lines in CORD style
      const lines: string[] = [];

      // Root tasks (no dependencies)
      const rootTasks = currentGraph.filter(t => t.dependencies.length === 0);

      // Render all tasks not already printed as children
      const rendered = new Set<string>();
      const renderWithDedup = (task: TaskNode, indent: number): void => {
        if (rendered.has(task.id)) return;
        rendered.add(task.id);

        const pad = '  '.repeat(indent);
        const label = nodeLabel(task);
        const typeTag = task.node_type ? task.node_type.toUpperCase() : 'SPAWN';
        const statusTag = `[${task.status.replace('_', ' ')}]`;
        const blockedBy = task.dependencies.length > 0 && task.status === 'pending'
          ? ` blocked-by: ${task.dependencies.join(', ')}`
          : '';
        lines.push(`${pad}${label} ${statusTag} ${typeTag} ${task.title}${blockedBy}`);

        if (task.node_type === 'ask' && task.question && task.status !== 'completed') {
          lines.push(`${pad}  ? ${task.question}`);
          if (task.answer_options?.length) {
            lines.push(`${pad}  Options: ${task.answer_options.join(', ')}`);
          }
        }
        if (task.output_result && task.status === 'completed') {
          const preview = task.output_result.length > 80
            ? task.output_result.slice(0, 80) + '…'
            : task.output_result;
          lines.push(`${pad}  result: ${preview}`);
        }

        const children = currentGraph.filter(t => t.dependencies.includes(task.id));
        for (const child of children) {
          renderWithDedup(child, indent + 1);
        }
      };

      for (const root of rootTasks) {
        renderWithDedup(root, 0);
      }
      // Any tasks not reachable from roots (shouldn't happen in valid graph)
      for (const task of currentGraph) {
        if (!rendered.has(task.id)) {
          renderWithDedup(task, 0);
        }
      }

      const pending = currentGraph.filter(t => t.status === 'pending').length;
      const inProgress = currentGraph.filter(t => t.status === 'in_progress').length;
      const completed = currentGraph.filter(t => t.status === 'completed').length;
      const failed = currentGraph.filter(t => t.status === 'failed').length;
      const pendingAsks = currentGraph.filter(
        t => t.node_type === 'ask' && t.status !== 'completed'
      );

      const summary = `${currentGraph.length} tasks: ${completed} completed, ${inProgress} in progress, ${pending} pending, ${failed} failed`;
      const askNote = pendingAsks.length > 0
        ? ` | ${pendingAsks.length} unanswered question(s) — use answerQuestion to unblock.`
        : '';

      return {
        success: true,
        message: summary + askNote,
        tree: lines.join('\n'),
        tasks: currentGraph,
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

    const pendingAsks = currentGraph.filter(
      t => t.node_type === 'ask' && t.status !== 'completed'
    );

    const formatNode = (t: TaskNode) => {
      const typeTag = t.node_type && t.node_type !== 'spawn' ? ` [${t.node_type.toUpperCase()}]` : '';
      const deps = t.dependencies.length > 0
        ? ` (depends on: ${t.dependencies.join(', ')})`
        : '';
      const caps = t.required_capabilities.length > 0
        ? ` [${t.required_capabilities.join(', ')}]`
        : '';
      const agent = t.assigned_subagent ? ` → ${t.assigned_subagent}` : '';
      const askQ = t.node_type === 'ask' && t.question ? `\n    ? ${t.question}` : '';
      return `  - [${t.id}]${typeTag} ${t.title}${deps}${caps}${agent}${askQ}`;
    };

    const formatNodes = (nodes: TaskNode[]) =>
      nodes.map(formatNode).join('\n') || '  (none)';

    const readySection = unblockedTasks.length > 0
      ? `\n### Ready to Start (${unblockedTasks.length})\n${formatNodes(unblockedTasks)}\n`
      : '';

    const blockedPending = pending.filter(t => !unblockedIds.has(t.id));

    const askSection = pendingAsks.length > 0
      ? `\n### ⚠ Pending Human Questions (${pendingAsks.length})\n` +
        pendingAsks.map(t => {
          const opts = t.answer_options?.length ? `\n    Options: ${t.answer_options.join(', ')}` : '';
          return `  - [${t.id}] ${t.question}${opts}`;
        }).join('\n') + '\n  Use "answerQuestion" to unblock downstream tasks.\n'
      : '';

    const content = `
## Task Graph Status
${askSection}
### In Progress (${inProgress.length})
${formatNodes(inProgress)}
${readySection}
### Blocked / Pending (${blockedPending.length})
${formatNodes(blockedPending)}

### Completed (${completed.length})
${formatNodes(completed)}

${failed.length > 0 ? `### Failed (${failed.length})\n${formatNodes(failed)}\n` : ''}Use "getUnblockedTasks" to find tasks ready for execution, "updateTaskStatus" to update task progress.
Use "spawnTask" or "forkTask" to add tasks dynamically. Use "readTree" to view the full coordination tree.
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
 * Provides dependency-aware task management using a DAG architecture
 * with CORD protocol primitives: spawn, fork, ask.
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
