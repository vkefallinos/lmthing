/**
 * Unit tests for taskList plugin
 *
 * Tests the defTaskList functionality without needing real LLMs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { StatefulPrompt } from '../../StatefulPrompt';
import { createMockModel } from '../../test/createMockModel';
import { runPrompt } from '../../runPrompt';
import { taskListPlugin } from './taskList';
import type { Task, TaskStatus } from '../types';

interface ToolResultValue {
  success: boolean;
  message?: string;
}

// Test helper to create a StatefulPrompt with mock model and proxy wrapper
// Similar to how runPrompt creates proxies for plugin methods
function createTestPrompt() {
  const mockModel = createMockModel([]);
  const prompt = new StatefulPrompt(mockModel);
  prompt.setPlugins([taskListPlugin]);

  // Create a proxy that provides access to plugin methods (similar to runPrompt)
  const boundPluginMethods: Record<string, Function> = {};
  for (const plugin of [taskListPlugin]) {
    for (const [methodName, method] of Object.entries(plugin)) {
      if (typeof method === 'function') {
        boundPluginMethods[methodName] = method.bind(prompt);
      }
    }
  }

  const proxiedPrompt = new Proxy(prompt, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in boundPluginMethods) {
        return boundPluginMethods[prop];
      }
      const value = target[prop as keyof StatefulPrompt];
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
    has(target, prop) {
      if (typeof prop === 'string' && prop in boundPluginMethods) {
        return true;
      }
      return prop in target;
    }
  }) as StatefulPrompt & { defTaskList: typeof taskListPlugin.defTaskList };

  return proxiedPrompt;
}

describe('taskListPlugin', () => {
  describe('plugin object', () => {
    it('should export defTaskList method', () => {
      expect(taskListPlugin).toHaveProperty('defTaskList');
      expect(typeof taskListPlugin.defTaskList).toBe('function');
    });
  });

  describe('defTaskList', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should create an empty task list by default', () => {
      const [tasks, setTasks] = prompt.defTaskList();

      expect(tasks).toEqual([]);
      expect(typeof setTasks).toBe('function');
    });

    it('should create a task list with initial tasks', () => {
      const initialTasks: Task[] = [
        { id: '1', name: 'Task 1', status: 'pending' },
        { id: '2', name: 'Task 2', status: 'pending' }
      ];

      const [tasks, setTasks] = prompt.defTaskList(initialTasks);

      expect(tasks).toEqual(initialTasks);
      expect(typeof setTasks).toBe('function');
    });

    it('should register startTask, completeTask, and failTask tools', () => {
      prompt.defTaskList([
        { id: '1', name: 'Task 1', status: 'pending' }
      ]);

      const tools = prompt.getTools();
      expect(tools).toHaveProperty('startTask');
      expect(tools).toHaveProperty('completeTask');
      expect(tools).toHaveProperty('failTask');
    });

    it('should allow updating task list via setter', () => {
      const initialTasks: Task[] = [
        { id: '1', name: 'Task 1', status: 'pending' }
      ];

      const [, setTasks] = prompt.defTaskList(initialTasks);

      const newTasks: Task[] = [
        { id: '1', name: 'Task 1', status: 'pending' },
        { id: '2', name: 'Task 2', status: 'pending' }
      ];

      setTasks(newTasks);

      // After update, getState should reflect new state
      const updatedState = prompt.getState<Task[]>('taskList');
      expect(updatedState).toEqual(newTasks);
    });

    it('should allow updating task list via function setter', () => {
      const initialTasks: Task[] = [
        { id: '1', name: 'Task 1', status: 'pending' },
        { id: '2', name: 'Task 2', status: 'pending' }
      ];

      const [, setTasks] = prompt.defTaskList(initialTasks);

      setTasks(prev => [
        ...prev,
        { id: '3', name: 'Task 3', status: 'pending' }
      ]);

      const updatedState = prompt.getState<Task[]>('taskList');
      expect(updatedState).toHaveLength(3);
      expect(updatedState?.[2].id).toBe('3');
    });
  });

  describe('startTask tool', () => {
    let prompt: ReturnType<typeof createTestPrompt>;
    let startTool: ReturnType<typeof prompt.getTools>['startTask'];

    beforeEach(() => {
      prompt = createTestPrompt();
      prompt.defTaskList([
        { id: '1', name: 'Task 1', status: 'pending' },
        { id: '2', name: 'Task 2', status: 'pending' },
        { id: '3', name: 'Task 3', status: 'completed' }
      ]);
      startTool = prompt.getTools().startTask;
    });

    it('should start a pending task', async () => {
      const result = await startTool!.execute({ taskId: '1' });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('1');
      expect(result.message).toContain('Started task');
      expect(result.task?.status).toBe('in_progress');

      // Verify state was updated
      const state = prompt.getState<Task[]>('taskList');
      expect(state?.find(t => t.id === '1')?.status).toBe('in_progress');
    });

    it('should return success but not change status if already in progress', async () => {
      // First start
      await startTool!.execute({ taskId: '1' });

      // Second start
      const result = await startTool!.execute({ taskId: '1' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('already in progress');
    });

    it('should fail if task is completed', async () => {
      const result = await startTool!.execute({ taskId: '3' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already completed');
    });

    it('should restart a failed task', async () => {
      // Create a fresh prompt with a failed task
      const freshPrompt = createTestPrompt();
      freshPrompt.defTaskList([
        { id: '1', name: 'Failed Task', status: 'failed' }
      ]);

      const freshStartTool = freshPrompt.getTools().startTask;
      const result = await freshStartTool!.execute({ taskId: '1' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Restarted failed task');
      expect(result.task?.status).toBe('in_progress');
    });

    it('should fail if task not found', async () => {
      const result = await startTool!.execute({ taskId: '999' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
      expect(result.message).toContain('Available task IDs');
    });
  });

  describe('completeTask tool', () => {
    let prompt: ReturnType<typeof createTestPrompt>;
    let completeTool: ReturnType<typeof prompt.getTools>['completeTask'];

    beforeEach(() => {
      prompt = createTestPrompt();
      prompt.defTaskList([
        { id: '1', name: 'Task 1', status: 'in_progress' },
        { id: '2', name: 'Task 2', status: 'pending' },
        { id: '3', name: 'Task 3', status: 'completed' }
      ]);
      completeTool = prompt.getTools().completeTask;
    });

    it('should complete an in_progress task', async () => {
      const result = await completeTool!.execute({ taskId: '1' });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('1');
      expect(result.message).toContain('Completed task');
      expect(result.task?.status).toBe('completed');

      // Verify state was updated
      const state = prompt.getState<Task[]>('taskList');
      expect(state?.find(t => t.id === '1')?.status).toBe('completed');
    });

    it('should return success but not change if already completed', async () => {
      const result = await completeTool!.execute({ taskId: '3' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('already completed');
    });

    it('should fail if task is still pending', async () => {
      const result = await completeTool!.execute({ taskId: '2' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('still pending');
      expect(result.message).toContain('startTask');
    });

    it('should fail if task not found', async () => {
      const result = await completeTool!.execute({ taskId: '999' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
      expect(result.message).toContain('Available task IDs');
    });
  });

  describe('failTask tool', () => {
    let prompt: ReturnType<typeof createTestPrompt>;
    let failTool: ReturnType<typeof prompt.getTools>['failTask'];

    beforeEach(() => {
      prompt = createTestPrompt();
      prompt.defTaskList([
        { id: '1', name: 'Task 1', status: 'in_progress' },
        { id: '2', name: 'Task 2', status: 'pending' },
        { id: '3', name: 'Task 3', status: 'completed' }
      ]);
      failTool = prompt.getTools().failTask;
    });

    it('should fail an in_progress task with reason', async () => {
      const result = await failTool!.execute({ taskId: '1', reason: 'Network error' });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('1');
      expect(result.message).toContain('Failed task');
      expect(result.message).toContain('Network error');
      expect(result.task?.status).toBe('failed');
      expect(result.task?.metadata?.failureReason).toBe('Network error');

      // Verify state was updated
      const state = prompt.getState<Task[]>('taskList');
      expect(state?.find(t => t.id === '1')?.status).toBe('failed');
    });

    it('should fail an in_progress task without reason', async () => {
      const result = await failTool!.execute({ taskId: '1' });

      expect(result.success).toBe(true);
      expect(result.message).not.toContain('-');
      expect(result.task?.status).toBe('failed');
    });

    it('should fail a pending task', async () => {
      const result = await failTool!.execute({ taskId: '2', reason: 'Cannot start' });

      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('failed');
    });

    it('should return success but not change if already failed', async () => {
      // First fail
      await failTool!.execute({ taskId: '1', reason: 'First error' });

      // Second fail
      const result = await failTool!.execute({ taskId: '1', reason: 'Second error' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('already failed');
    });

    it('should fail if task is completed', async () => {
      const result = await failTool!.execute({ taskId: '3', reason: 'Too late' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already completed');
    });

    it('should fail if task not found', async () => {
      const result = await failTool!.execute({ taskId: '999', reason: 'Not found' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
      expect(result.message).toContain('Available task IDs');
    });
  });

  describe('task status transitions', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should handle full lifecycle: pending -> in_progress -> completed', async () => {
      prompt.defTaskList([
        { id: '1', name: 'Full lifecycle task', status: 'pending' }
      ]);

      const tools = prompt.getTools();

      // Start
      let result = await tools.startTask!.execute({ taskId: '1' });
      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('in_progress');

      // Complete
      result = await tools.completeTask!.execute({ taskId: '1' });
      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('completed');

      const state = prompt.getState<Task[]>('taskList');
      expect(state?.[0].status).toBe('completed');
    });

    it('should handle failure and recovery: pending -> in_progress -> failed -> in_progress -> completed', async () => {
      prompt.defTaskList([
        { id: '1', name: 'Recovery task', status: 'pending' }
      ]);

      const tools = prompt.getTools();

      // Start
      let result = await tools.startTask!.execute({ taskId: '1' });
      expect(result.success).toBe(true);

      // Fail
      result = await tools.failTask!.execute({ taskId: '1', reason: 'Error' });
      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('failed');

      // Restart
      result = await tools.startTask!.execute({ taskId: '1' });
      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('in_progress');

      // Complete
      result = await tools.completeTask!.execute({ taskId: '1' });
      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('completed');
    });
  });

  describe('defEffect integration', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should register effect with taskList dependency', () => {
      prompt.defTaskList([
        { id: '1', name: 'Task 1', status: 'pending' }
      ]);

      // The effect should have been registered
      // We can't directly access effects, but we can verify the plugin works
      // by checking tools are registered
      const tools = prompt.getTools();
      expect(tools.startTask).toBeDefined();
    });
  });

  describe('edge cases', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should handle empty task list', async () => {
      prompt.defTaskList([]);

      const tools = prompt.getTools();

      // Try to start a task that doesn't exist
      const result = await tools.startTask!.execute({ taskId: '1' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle tasks with special characters in names', async () => {
      prompt.defTaskList([
        { id: '1', name: 'Task with "quotes" and \'apostrophes\'', status: 'pending' },
        { id: '2', name: 'Task with <xml> tags', status: 'pending' }
      ]);

      const tools = prompt.getTools();

      const result = await tools.startTask!.execute({ taskId: '1' });
      expect(result.success).toBe(true);
      expect(result.task?.name).toBe('Task with "quotes" and \'apostrophes\'');
    });

    it('should handle multiple tasks in various states', async () => {
      prompt.defTaskList([
        { id: '1', name: 'Pending', status: 'pending' },
        { id: '2', name: 'In Progress', status: 'in_progress' },
        { id: '3', name: 'Completed', status: 'completed' },
        { id: '4', name: 'Failed', status: 'failed' }
      ]);

      const tools = prompt.getTools();
      const state = prompt.getState<Task[]>('taskList');

      expect(state).toHaveLength(4);

      // Each should be in correct state
      expect(state?.[0].status).toBe('pending');
      expect(state?.[1].status).toBe('in_progress');
      expect(state?.[2].status).toBe('completed');
      expect(state?.[3].status).toBe('failed');
    });
  });

  describe('mock-model step lifecycle validation', () => {
    it('should expose initial task state and persist task updates across steps', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'startTask', args: { taskId: 't1' } },
        { type: 'text', text: 'Task started' }
      ]);

      const initialTasks: Task[] = [
        { id: 't1', name: 'Investigate plugin', status: 'pending' }
      ];
      let initialExposedStatus: TaskStatus | undefined;

      const { result, prompt } = await runPrompt(async ({ defTaskList, $ }) => {
        const [tasks] = defTaskList(initialTasks);
        initialExposedStatus ??= tasks[0]?.status;
        $`Start task t1`;
      }, { model: mockModel, plugins: [taskListPlugin] });

      await result.text;

      expect(initialExposedStatus).toBe('pending');
      expect(prompt.getState<Task[]>('taskList')?.[0].status).toBe('in_progress');
    });

    it('should enforce invalid transitions and allow restart from failed across steps', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'completeTask', args: { taskId: 't1' } },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'failTask', args: { taskId: 't1', reason: 'blocked' } },
        { type: 'tool-call', toolCallId: 'c3', toolName: 'startTask', args: { taskId: 't1' } },
        { type: 'tool-call', toolCallId: 'c4', toolName: 'completeTask', args: { taskId: 't1' } },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTaskList, $ }) => {
        defTaskList([{ id: 't1', name: 'Transition task', status: 'pending' }]);
        $`Run full lifecycle for t1`;
      }, { model: mockModel, plugins: [taskListPlugin] });

      await result.text;

      const toolOutputs = prompt.fullSteps
        .flatMap(step => step.input.prompt.filter(msg => msg.role === 'tool'))
        .flatMap(msg => Array.isArray(msg.content) ? msg.content : [])
        .filter(content => content.type === 'tool-result')
        .map(content => (content as { output?: { value?: ToolResultValue } }).output?.value)
        .filter((value): value is ToolResultValue => !!value);

      expect(toolOutputs.some(output => output.success === false && output.message?.includes('still pending'))).toBe(true);
      expect(toolOutputs.some(output => output.success === true && output.message?.includes('Restarted failed task'))).toBe(true);
      expect(prompt.getState<Task[]>('taskList')?.[0].status).toBe('completed');
    });

    it('should render updated task status into system step modifications via defEffect', async () => {
      const prompt = createTestPrompt();
      prompt.defTaskList([{ id: 't1', name: 'Render status', status: 'pending' }]);
      await prompt.getTools().startTask!.execute({ taskId: 't1' });

      (prompt as any)._processEffects({ messages: [], stepNumber: 2 });
      const taskListSystem = (prompt as any)._stepModifications.systems?.[0]?.value as string;

      expect(taskListSystem).toContain('## Current Task Status');
      expect(taskListSystem).toContain('### In Progress (1)');
      expect(taskListSystem).toContain('- [t1] Render status');
      expect(taskListSystem).toContain('### Pending (0)');
    });

    it('should keep plugin tool definitions stable and avoid duplicate user messages during re-execution', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'startTask', args: { taskId: 't1' } },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'failTask', args: { taskId: 't1', reason: 'retry' } },
        { type: 'text', text: 'Finished re-executions' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTaskList, $ }) => {
        defTaskList([{ id: 't1', name: 'Dedup task', status: 'pending' }]);
        $`Manage task t1`;
      }, { model: mockModel, plugins: [taskListPlugin] });

      await result.text;

      for (const step of prompt.fullSteps) {
        const userMessages = step.input.prompt.filter(m => m.role === 'user');
        expect(userMessages).toHaveLength(1);
      }

      for (const step of prompt.steps) {
        expect(step.activeTools).toEqual(['startTask', 'completeTask', 'failTask']);
        expect(new Set(step.activeTools).size).toBe(step.activeTools.length);
      }

      expect(Object.keys(prompt.getTools()).sort()).toEqual(['completeTask', 'failTask', 'startTask']);
    });

    it('should interoperate with def, defSystem, defState, and defTool in mixed scenarios', async () => {
      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'startTask', args: { taskId: 't1' } },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'setMode', args: { mode: 'execution' } },
        { type: 'text', text: 'Mixed scenario complete' }
      ]);

      const { result, prompt } = await runPrompt(async ({ def, defSystem, defState, defTool, defTaskList, $ }) => {
        const project = def('PROJECT', 'Apollo');
        defSystem('role', `Coordinate work for ${project}`);
        const [, setMode] = defState('mode', 'planning');
        defTaskList([{ id: 't1', name: 'Mixed task', status: 'pending' }]);
        defTool('setMode', 'Set mode', z.object({ mode: z.string() }), async ({ mode }) => {
          setMode(mode);
          return { success: true, mode };
        });

        $`Work on ${project}`;
      }, { model: mockModel, plugins: [taskListPlugin] });

      await result.text;

      expect(prompt.getState<string>('mode')).toBe('execution');
      expect(prompt.getState<Task[]>('taskList')?.[0].status).toBe('in_progress');
      expect(prompt.variables.PROJECT?.value).toBe('Apollo');
      expect((prompt as any).systems.role).toContain('<PROJECT>');
    });
  });
});
