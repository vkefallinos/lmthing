/**
 * Task List Plugin for lmthing
 *
 * Provides a defTaskList method that creates a managed task list with
 * tools for starting and completing tasks, plus automatic system prompt
 * updates showing task status.
 *
 * @example
 * import { taskListPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defTaskList, $ }) => {
 *   const [tasks, setTasks] = defTaskList([
 *     { id: '1', name: 'Research the topic', status: 'pending' },
 *     { id: '2', name: 'Write implementation', status: 'pending' },
 *   ]);
 *
 *   $`Complete the tasks. Use startTask when beginning and completeTask when done.`;
 * }, { model: 'openai:gpt-4o', plugins: [taskListPlugin] });
 */

import { z } from 'zod';
import yaml from 'js-yaml';
import type { StatefulPrompt } from '../StatefulPrompt';
import type { Task, TaskStatus, StartTaskResult, CompleteTaskResult, SystemPart } from './types';

/**
 * Creates a managed task list with tools and effects.
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @param tasks - Initial array of tasks
 * @returns Tuple of [taskList, setTaskList] for accessing and updating tasks
 */
export function defTaskList(
  this: StatefulPrompt,
  tasks: Task[] = []
): [Task[], (newValue: Task[] | ((prev: Task[]) => Task[])) => void] {
  // Create persistent state for the task list
  const [taskList, setTaskList] = this.defState<Task[]>('taskList', tasks);

  // Define tool to start a task
  this.defTool(
    'startTask',
    'Mark a task as started/in-progress. Call this before beginning work on a task.',
    z.object({
      taskId: z.string().describe('The ID of the task to start')
    }),
    async ({ taskId }: { taskId: string }): Promise<StartTaskResult> => {
      const task = taskList.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task with ID "${taskId}" not found`
        };
      }

      if (task.status === 'in_progress') {
        return {
          success: true,
          taskId,
          message: `Task "${task.name}" is already in progress`
        };
      }

      if (task.status === 'completed') {
        return {
          success: false,
          taskId,
          message: `Task "${task.name}" is already completed`
        };
      }

      // Update task status
      setTaskList(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'in_progress' as TaskStatus } : t
      ));

      return {
        success: true,
        taskId,
        message: `Started task: "${task.name}"`
      };
    }
  );

  // Define tool to complete a task
  this.defTool(
    'completeTask',
    'Mark a task as completed. Call this when you have finished work on a task.',
    z.object({
      taskId: z.string().describe('The ID of the task to complete')
    }),
    async ({ taskId }: { taskId: string }): Promise<CompleteTaskResult> => {
      const task = taskList.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task with ID "${taskId}" not found`
        };
      }

      if (task.status === 'completed') {
        return {
          success: true,
          taskId,
          message: `Task "${task.name}" is already completed`
        };
      }

      // Update task status
      setTaskList(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'completed' as TaskStatus } : t
      ));

      return {
        success: true,
        taskId,
        message: `Completed task: "${task.name}"`
      };
    }
  );

  // Define effect to update system prompt with task list status
  this.defEffect((ctx, stepModifier) => {
    // Format task list for display
    const pendingTasks = taskList.filter(t => t.status === 'pending');
    const inProgressTasks = taskList.filter(t => t.status === 'in_progress');
    const completedTasks = taskList.filter(t => t.status === 'completed');

    const formatTasks = (tasks: Task[]) =>
      tasks.map(t => `  - [${t.id}] ${t.name}`).join('\n') || '  (none)';

    const taskListContent = `
## Current Task Status

### In Progress (${inProgressTasks.length})
${formatTasks(inProgressTasks)}

### Pending (${pendingTasks.length})
${formatTasks(pendingTasks)}

### Completed (${completedTasks.length})
${formatTasks(completedTasks)}

Use "startTask" to begin a pending task and "completeTask" when finished.
`.trim();

    // Add as system part (will be included in system prompt)
    stepModifier('systems', [{
      name: 'taskList',
      value: taskListContent
    }]);
  }, [taskList]);

  // Define effect to handle per-task extensions (tools, variables, system)
  this.defEffect((ctx, stepModifier) => {
    // Find the currently active task (in_progress)
    const activeTask = taskList.find(t => t.status === 'in_progress');

    if (!activeTask) {
      // No active task, nothing to inject
      return;
    }

    // === Per-Task Tools ===
    if (activeTask.tools && activeTask.tools.length > 0) {
      const toolMode = activeTask.toolMode || 'extend';

      // Register task-specific tools
      const toolsToAdd = activeTask.tools.map(toolDef => ({
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        execute: toolDef.execute
      }));

      stepModifier('tools', toolsToAdd);

      // If exclusive mode, filter to only show task tools
      if (toolMode === 'exclusive') {
        const taskToolNames = activeTask.tools.map(t => t.name);
        // Add startTask and completeTask to the allowed list
        taskToolNames.push('startTask', 'completeTask');
        stepModifier('activeTools', taskToolNames);
      }
    }

    // === Per-Task Variables ===
    if (activeTask.variables && Object.keys(activeTask.variables).length > 0) {
      // Format variables as YAML for injection
      const variablesYaml = yaml.dump(activeTask.variables, { indent: 2 });
      const variablesContent = `
## Current Task Context

Variables for task "${activeTask.name}":

\`\`\`yaml
${variablesYaml.trim()}
\`\`\`
`.trim();

      stepModifier('variables', [{
        name: 'current_task_context',
        value: variablesContent
      }]);
    }

    // === Per-Task System Prompts ===
    if (activeTask.system) {
      const systemParts: SystemPart[] = [];

      if (typeof activeTask.system === 'string') {
        // Single string: wrap in a default-named system part
        systemParts.push({
          name: `task_${activeTask.id}_instructions`,
          value: activeTask.system
        });
      } else if (Array.isArray(activeTask.system)) {
        // Array of SystemPart objects
        systemParts.push(...activeTask.system);
      } else {
        // Single SystemPart object
        systemParts.push(activeTask.system);
      }

      stepModifier('systems', systemParts);
    }
  }, [taskList]);

  return [taskList, setTaskList];
}

/**
 * Task List Plugin
 *
 * Export this plugin object to use with runPrompt:
 *
 * @example
 * import { taskListPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defTaskList }) => {
 *   // defTaskList is now available
 * }, { plugins: [taskListPlugin] });
 */
export const taskListPlugin = {
  defTaskList
};
