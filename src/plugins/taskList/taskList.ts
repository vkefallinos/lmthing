/**
 * Task List Plugin for lmthing
 *
 * Provides a defTaskList method that creates a managed task list with
 * tools for starting, completing, and failing tasks, plus automatic system prompt
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
import type { StatefulPrompt } from '../../StatefulPrompt';
import type { Task, TaskStatus, StartTaskResult, CompleteTaskResult, FailTaskResult } from '../types';

const TASK_LIST_STATE_KEY = 'taskList';

/**
 * Creates a managed task list with tools and effects.
 *
 * @category Plugins
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
  const [taskList, setTaskList] = this.defState<Task[]>(TASK_LIST_STATE_KEY, tasks);

  // Helper to get current task list state
  const getCurrentTasks = (): Task[] => {
    return this.getState<Task[]>(TASK_LIST_STATE_KEY) || taskList;
  };

  // Define tool to start a task
  this.defTool(
    'startTask',
    'Mark a task as started/in-progress. Call this before beginning work on a task.',
    z.object({
      taskId: z.string().describe('The ID of the task to start')
    }),
    async ({ taskId }: { taskId: string }): Promise<StartTaskResult> => {
      const currentTasks = getCurrentTasks();
      const task = currentTasks.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task with ID "${taskId}" not found. Available task IDs: ${currentTasks.map(t => t.id).join(', ')}`
        };
      }

      if (task.status === 'in_progress') {
        return {
          success: true,
          taskId,
          message: `Task "${task.name}" is already in progress`,
          task
        };
      }

      if (task.status === 'completed') {
        return {
          success: false,
          taskId,
          message: `Task "${task.name}" is already completed and cannot be restarted`,
          task
        };
      }

      if (task.status === 'failed') {
        // Allow restarting failed tasks
        setTaskList(prev => prev.map(t =>
          t.id === taskId ? { ...t, status: 'in_progress' as TaskStatus } : t
        ));
        return {
          success: true,
          taskId,
          message: `Restarted failed task: "${task.name}"`,
          task: { ...task, status: 'in_progress' as TaskStatus }
        };
      }

      // Update task status to in_progress
      setTaskList(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'in_progress' as TaskStatus } : t
      ));

      return {
        success: true,
        taskId,
        message: `Started task: "${task.name}"`,
        task: { ...task, status: 'in_progress' as TaskStatus }
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
      const currentTasks = getCurrentTasks();
      const task = currentTasks.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task with ID "${taskId}" not found. Available task IDs: ${currentTasks.map(t => t.id).join(', ')}`
        };
      }

      if (task.status === 'completed') {
        return {
          success: true,
          taskId,
          message: `Task "${task.name}" is already completed`,
          task
        };
      }

      if (task.status === 'pending') {
        return {
          success: false,
          taskId,
          message: `Task "${task.name}" is still pending. Use startTask first to begin work on it.`,
          task
        };
      }

      // Update task status to completed
      setTaskList(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'completed' as TaskStatus } : t
      ));

      return {
        success: true,
        taskId,
        message: `Completed task: "${task.name}"`,
        task: { ...task, status: 'completed' as TaskStatus }
      };
    }
  );

  // Define tool to fail a task
  this.defTool(
    'failTask',
    'Mark a task as failed. Call this when a task cannot be completed due to an error or blocker.',
    z.object({
      taskId: z.string().describe('The ID of the task to fail'),
      reason: z.string().optional().describe('The reason why the task failed')
    }),
    async ({ taskId, reason }: { taskId: string; reason?: string }): Promise<FailTaskResult> => {
      const currentTasks = getCurrentTasks();
      const task = currentTasks.find(t => t.id === taskId);

      if (!task) {
        return {
          success: false,
          taskId,
          message: `Task with ID "${taskId}" not found. Available task IDs: ${currentTasks.map(t => t.id).join(', ')}`
        };
      }

      if (task.status === 'failed') {
        return {
          success: true,
          taskId,
          message: `Task "${task.name}" is already failed`,
          task
        };
      }

      if (task.status === 'completed') {
        return {
          success: false,
          taskId,
          message: `Task "${task.name}" is already completed and cannot be failed`,
          task
        };
      }

      // Update task status to failed
      setTaskList(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'failed' as TaskStatus, metadata: { ...t.metadata, failureReason: reason } }
          : t
      ));

      return {
        success: true,
        taskId,
        message: `Failed task: "${task.name}"${reason ? ` - ${reason}` : ''}`,
        task: { ...task, status: 'failed' as TaskStatus, metadata: { ...task.metadata, failureReason: reason } }
      };
    }
  );

  // Define effect to update system prompt with task list status
  this.defEffect((_ctx, stepModifier) => {
    const currentTasks = getCurrentTasks();

    // Format task list for display
    const pendingTasks = currentTasks.filter(t => t.status === 'pending');
    const inProgressTasks = currentTasks.filter(t => t.status === 'in_progress');
    const completedTasks = currentTasks.filter(t => t.status === 'completed');
    const failedTasks = currentTasks.filter(t => t.status === 'failed');

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

${failedTasks.length > 0 ? `### Failed (${failedTasks.length})\n${formatTasks(failedTasks)}\n` : ''}Use "startTask" to begin a pending task, "completeTask" when finished, and "failTask" if there is an error.
`.trim();

    // Add as system part (will be included in system prompt)
    stepModifier('systems', [{
      name: 'taskList',
      value: taskListContent
    }]);
  }, [taskList]);

  return [taskList, setTaskList];
}

/**
 * Task List Plugin
 *
 * Export this plugin object to use with runPrompt:
 *
 * @category Plugins
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
