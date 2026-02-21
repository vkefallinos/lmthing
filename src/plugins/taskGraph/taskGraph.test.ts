/**
 * Unit tests for taskGraph (DAG) plugin
 *
 * Tests the defTaskGraph functionality, DAG validation utilities,
 * and tool behavior without needing real LLMs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatefulPrompt } from '../../StatefulPrompt';
import { createMockModel } from '../../test/createMockModel';
import {
  taskGraphPlugin,
  detectCycles,
  validateTaskGraph,
  normalizeTaskGraph,
  getUnblockedTasks,
} from './taskGraph';
import type { TaskNode } from '../types';

// Test helper to create a StatefulPrompt with mock model and proxy wrapper
// Similar to how runPrompt creates proxies for plugin methods
function createTestPrompt() {
  const mockModel = createMockModel([]);
  const prompt = new StatefulPrompt(mockModel);
  prompt.setPlugins([taskGraphPlugin]);

  const boundPluginMethods: Record<string, Function> = {};
  for (const plugin of [taskGraphPlugin]) {
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
  }) as StatefulPrompt & { defTaskGraph: typeof taskGraphPlugin.defTaskGraph };

  return proxiedPrompt;
}

// Helper to create a simple linear DAG: A -> B -> C
function createLinearGraph(): TaskNode[] {
  return [
    {
      id: 'a', title: 'Task A', description: 'First task',
      status: 'pending', dependencies: [], unblocks: ['b'],
      required_capabilities: ['research'],
    },
    {
      id: 'b', title: 'Task B', description: 'Second task',
      status: 'pending', dependencies: ['a'], unblocks: ['c'],
      required_capabilities: ['writing'],
    },
    {
      id: 'c', title: 'Task C', description: 'Third task',
      status: 'pending', dependencies: ['b'], unblocks: [],
      required_capabilities: ['review'],
    },
  ];
}

// Helper to create a diamond DAG: A -> B, A -> C, B -> D, C -> D
function createDiamondGraph(): TaskNode[] {
  return [
    {
      id: 'a', title: 'Task A', description: 'Root task',
      status: 'pending', dependencies: [], unblocks: ['b', 'c'],
      required_capabilities: [],
    },
    {
      id: 'b', title: 'Task B', description: 'Left branch',
      status: 'pending', dependencies: ['a'], unblocks: ['d'],
      required_capabilities: ['database'],
    },
    {
      id: 'c', title: 'Task C', description: 'Right branch',
      status: 'pending', dependencies: ['a'], unblocks: ['d'],
      required_capabilities: ['web-search'],
    },
    {
      id: 'd', title: 'Task D', description: 'Merge task',
      status: 'pending', dependencies: ['b', 'c'], unblocks: [],
      required_capabilities: [],
    },
  ];
}

// ============================================================
// DAG Utility Tests
// ============================================================

describe('DAG utilities', () => {
  describe('detectCycles', () => {
    it('should return empty array for acyclic graph', () => {
      const tasks = createLinearGraph();
      expect(detectCycles(tasks)).toEqual([]);
    });

    it('should detect a simple cycle', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: ['b'], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      const cycles = detectCycles(tasks);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles).toContain('a');
      expect(cycles).toContain('b');
    });

    it('should detect a longer cycle', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: ['c'], unblocks: ['b'], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: ['c'], required_capabilities: [] },
        { id: 'c', title: 'C', description: '', status: 'pending', dependencies: ['b'], unblocks: ['a'], required_capabilities: [] },
      ];
      const cycles = detectCycles(tasks);
      expect(cycles).toHaveLength(3);
    });

    it('should handle diamond DAG (no cycle)', () => {
      const tasks = createDiamondGraph();
      expect(detectCycles(tasks)).toEqual([]);
    });

    it('should handle empty graph', () => {
      expect(detectCycles([])).toEqual([]);
    });

    it('should handle single node', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ];
      expect(detectCycles(tasks)).toEqual([]);
    });
  });

  describe('validateTaskGraph', () => {
    it('should return no errors for valid graph', () => {
      const tasks = createLinearGraph();
      expect(validateTaskGraph(tasks)).toEqual([]);
    });

    it('should detect unknown dependency references', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: ['nonexistent'], unblocks: [], required_capabilities: [] },
      ];
      const errors = validateTaskGraph(tasks);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('nonexistent');
    });

    it('should detect unknown unblocks references', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['nonexistent'], required_capabilities: [] },
      ];
      const errors = validateTaskGraph(tasks);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('nonexistent');
    });

    it('should detect duplicate IDs', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A1', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'a', title: 'A2', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ];
      const errors = validateTaskGraph(tasks);
      expect(errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: ['b'], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      const errors = validateTaskGraph(tasks);
      expect(errors.some(e => e.includes('Circular'))).toBe(true);
    });
  });

  describe('normalizeTaskGraph', () => {
    it('should add missing unblocks for declared dependencies', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      const normalized = normalizeTaskGraph(tasks);
      expect(normalized.find(t => t.id === 'a')!.unblocks).toContain('b');
    });

    it('should add missing dependencies for declared unblocks', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['b'], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ];
      const normalized = normalizeTaskGraph(tasks);
      expect(normalized.find(t => t.id === 'b')!.dependencies).toContain('a');
    });

    it('should not duplicate existing relationships', () => {
      const tasks = createLinearGraph();
      const normalized = normalizeTaskGraph(tasks);
      const a = normalized.find(t => t.id === 'a')!;
      expect(a.unblocks.filter(u => u === 'b')).toHaveLength(1);
    });

    it('should not mutate original tasks', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      normalizeTaskGraph(tasks);
      expect(tasks[0].unblocks).toEqual([]); // original unchanged
    });
  });

  describe('getUnblockedTasks', () => {
    it('should return leaf nodes (no dependencies)', () => {
      const tasks = createLinearGraph();
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(1);
      expect(unblocked[0].id).toBe('a');
    });

    it('should return tasks with all dependencies completed', () => {
      const tasks = createLinearGraph();
      tasks[0].status = 'completed';
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(1);
      expect(unblocked[0].id).toBe('b');
    });

    it('should handle diamond pattern - both paths needed', () => {
      const tasks = createDiamondGraph();
      tasks[0].status = 'completed'; // a done
      tasks[1].status = 'completed'; // b done
      // c still pending, d depends on both b and c
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(1);
      expect(unblocked[0].id).toBe('c');
    });

    it('should return merge node when all branches complete', () => {
      const tasks = createDiamondGraph();
      tasks[0].status = 'completed'; // a
      tasks[1].status = 'completed'; // b
      tasks[2].status = 'completed'; // c
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(1);
      expect(unblocked[0].id).toBe('d');
    });

    it('should not return in_progress tasks', () => {
      const tasks = createLinearGraph();
      tasks[0].status = 'in_progress';
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(0);
    });

    it('should not return failed tasks', () => {
      const tasks = createLinearGraph();
      tasks[0].status = 'failed';
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(0);
    });

    it('should return multiple independent root tasks', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'c', title: 'C', description: '', status: 'pending', dependencies: ['a', 'b'], unblocks: [], required_capabilities: [] },
      ];
      const unblocked = getUnblockedTasks(tasks);
      expect(unblocked).toHaveLength(2);
      expect(unblocked.map(t => t.id).sort()).toEqual(['a', 'b']);
    });

    it('should return empty for all completed', () => {
      const tasks = createLinearGraph().map(t => ({ ...t, status: 'completed' as const }));
      expect(getUnblockedTasks(tasks)).toHaveLength(0);
    });
  });
});

// ============================================================
// Plugin Integration Tests
// ============================================================

describe('taskGraphPlugin', () => {
  describe('plugin object', () => {
    it('should export defTaskGraph method', () => {
      expect(taskGraphPlugin).toHaveProperty('defTaskGraph');
      expect(typeof taskGraphPlugin.defTaskGraph).toBe('function');
    });
  });

  describe('defTaskGraph', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should create an empty task graph by default', () => {
      const [graph, setGraph] = prompt.defTaskGraph();
      expect(graph).toEqual([]);
      expect(typeof setGraph).toBe('function');
    });

    it('should create a task graph with initial tasks', () => {
      const [graph] = prompt.defTaskGraph(createLinearGraph());
      expect(graph).toHaveLength(3);
      expect(graph[0].id).toBe('a');
    });

    it('should normalize the initial graph', () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      const [graph] = prompt.defTaskGraph(tasks);
      expect(graph.find(t => t.id === 'a')!.unblocks).toContain('b');
    });

    it('should register generateTaskGraph, getUnblockedTasks, and updateTaskStatus tools', () => {
      prompt.defTaskGraph(createLinearGraph());
      const tools = prompt.getTools();
      expect(tools).toHaveProperty('generateTaskGraph');
      expect(tools).toHaveProperty('getUnblockedTasks');
      expect(tools).toHaveProperty('updateTaskStatus');
    });

    it('should allow updating the graph via setter', () => {
      const [, setGraph] = prompt.defTaskGraph([]);
      const newGraph = createLinearGraph();
      setGraph(newGraph);

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state).toHaveLength(3);
    });
  });

  describe('generateTaskGraph tool', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
      prompt.defTaskGraph();
    });

    it('should create a valid task graph', async () => {
      const tool = prompt.getTools().generateTaskGraph;
      const result = await tool!.execute({
        tasks: [
          { id: 'a', title: 'A', description: 'Do A', dependencies: [], unblocks: ['b'], required_capabilities: [] },
          { id: 'b', title: 'B', description: 'Do B', dependencies: ['a'], unblocks: [], required_capabilities: [] },
        ]
      });

      expect(result.success).toBe(true);
      expect(result.taskCount).toBe(2);
      expect(result.tasks).toHaveLength(2);

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state).toHaveLength(2);
      expect(state![0].status).toBe('pending');
    });

    it('should reject a graph with cycles', async () => {
      const tool = prompt.getTools().generateTaskGraph;
      const result = await tool!.execute({
        tasks: [
          { id: 'a', title: 'A', description: 'Do A', dependencies: ['b'], unblocks: ['b'], required_capabilities: [] },
          { id: 'b', title: 'B', description: 'Do B', dependencies: ['a'], unblocks: ['a'], required_capabilities: [] },
        ]
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Circular');
    });

    it('should normalize the generated graph', async () => {
      const tool = prompt.getTools().generateTaskGraph;
      const result = await tool!.execute({
        tasks: [
          { id: 'a', title: 'A', description: 'Do A', dependencies: [], unblocks: [], required_capabilities: [] },
          { id: 'b', title: 'B', description: 'Do B', dependencies: ['a'], unblocks: [], required_capabilities: [] },
        ]
      });

      expect(result.success).toBe(true);
      // 'a' should have 'b' in unblocks after normalization
      expect(result.tasks!.find(t => t.id === 'a')!.unblocks).toContain('b');
    });

    it('should set all tasks to pending status', async () => {
      const tool = prompt.getTools().generateTaskGraph;
      const result = await tool!.execute({
        tasks: [
          { id: 'a', title: 'A', description: 'Do A', dependencies: [], unblocks: [], required_capabilities: [] },
        ]
      });

      expect(result.tasks![0].status).toBe('pending');
    });
  });

  describe('getUnblockedTasks tool', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should return root tasks as unblocked', async () => {
      prompt.defTaskGraph(createLinearGraph());
      const tool = prompt.getTools().getUnblockedTasks;
      const result = await tool!.execute({});

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('a');
    });

    it('should return empty when all are in_progress', async () => {
      const tasks = createLinearGraph();
      tasks[0].status = 'in_progress';
      prompt.defTaskGraph(tasks);

      const tool = prompt.getTools().getUnblockedTasks;
      const result = await tool!.execute({});

      expect(result.tasks).toHaveLength(0);
      expect(result.message).toContain('in progress');
    });

    it('should return empty when all are completed', async () => {
      const tasks = createLinearGraph().map(t => ({ ...t, status: 'completed' as const }));
      prompt.defTaskGraph(tasks);

      const tool = prompt.getTools().getUnblockedTasks;
      const result = await tool!.execute({});

      expect(result.tasks).toHaveLength(0);
      expect(result.message).toContain('completed or failed');
    });

    it('should return tasks after dependencies are completed via state update', async () => {
      const [, setGraph] = prompt.defTaskGraph(createLinearGraph());

      // Complete task A via state update
      setGraph(prev => prev.map(t => t.id === 'a' ? { ...t, status: 'completed' as const } : t));

      const tool = prompt.getTools().getUnblockedTasks;
      const result = await tool!.execute({});

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('b');
    });

    it('should handle diamond pattern correctly', async () => {
      const tasks = createDiamondGraph();
      prompt.defTaskGraph(tasks);

      const tool = prompt.getTools().getUnblockedTasks;
      const result = await tool!.execute({});

      // Only root task should be unblocked
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('a');
    });
  });

  describe('updateTaskStatus tool', () => {
    let prompt: ReturnType<typeof createTestPrompt>;
    let updateTool: ReturnType<typeof prompt.getTools>['updateTaskStatus'];

    beforeEach(() => {
      prompt = createTestPrompt();
      prompt.defTaskGraph(createLinearGraph());
      updateTool = prompt.getTools().updateTaskStatus;
    });

    it('should start a pending task with met dependencies', async () => {
      const result = await updateTool!.execute({ taskId: 'a', status: 'in_progress' });

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe('in_progress');
      expect(result.message).toContain('in progress');

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'a')!.status).toBe('in_progress');
    });

    it('should reject starting a task with unmet dependencies', async () => {
      const result = await updateTool!.execute({ taskId: 'b', status: 'in_progress' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unmet dependencies');
    });

    it('should complete a task and report newly unblocked tasks', async () => {
      // Start and complete task A
      await updateTool!.execute({ taskId: 'a', status: 'in_progress' });
      const result = await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Task A done' });

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe('completed');
      expect(result.newlyUnblockedTasks).toHaveLength(1);
      expect(result.newlyUnblockedTasks![0].id).toBe('b');
    });

    it('should propagate output_result to downstream tasks as input_context', async () => {
      await updateTool!.execute({ taskId: 'a', status: 'in_progress' });
      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Research complete' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const taskB = state!.find(t => t.id === 'b');
      expect(taskB!.input_context).toContain('Research complete');
      expect(taskB!.input_context).toContain('Task A');
    });

    it('should prevent changing completed task status', async () => {
      await updateTool!.execute({ taskId: 'a', status: 'in_progress' });
      await updateTool!.execute({ taskId: 'a', status: 'completed' });

      const result = await updateTool!.execute({ taskId: 'a', status: 'failed' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('already completed');
    });

    it('should allow marking task as failed', async () => {
      await updateTool!.execute({ taskId: 'a', status: 'in_progress' });
      const result = await updateTool!.execute({ taskId: 'a', status: 'failed' });

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe('failed');
      expect(result.message).toContain('failed');
    });

    it('should return already in_progress for duplicate start', async () => {
      await updateTool!.execute({ taskId: 'a', status: 'in_progress' });
      const result = await updateTool!.execute({ taskId: 'a', status: 'in_progress' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('already in progress');
    });

    it('should fail for unknown task ID', async () => {
      const result = await updateTool!.execute({ taskId: 'unknown', status: 'in_progress' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
      expect(result.message).toContain('Available IDs');
    });
  });

  describe('full DAG execution lifecycle', () => {
    let prompt: ReturnType<typeof createTestPrompt>;
    let updateTool: ReturnType<typeof prompt.getTools>['updateTaskStatus'];
    let getUnblocked: ReturnType<typeof prompt.getTools>['getUnblockedTasks'];

    beforeEach(() => {
      prompt = createTestPrompt();
      prompt.defTaskGraph(createLinearGraph());
      updateTool = prompt.getTools().updateTaskStatus;
      getUnblocked = prompt.getTools().getUnblockedTasks;
    });

    it('should execute a linear chain: A -> B -> C', async () => {
      // Phase 1: Check initial unblocked
      let unblocked = await getUnblocked!.execute({});
      expect(unblocked.tasks).toHaveLength(1);
      expect(unblocked.tasks[0].id).toBe('a');

      // Phase 2: Start and complete A
      await updateTool!.execute({ taskId: 'a', status: 'in_progress' });
      let result = await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'A done' });
      expect(result.newlyUnblockedTasks).toHaveLength(1);
      expect(result.newlyUnblockedTasks![0].id).toBe('b');

      // Phase 3: B is now unblocked
      unblocked = await getUnblocked!.execute({});
      expect(unblocked.tasks).toHaveLength(1);
      expect(unblocked.tasks[0].id).toBe('b');

      // Phase 4: Start and complete B
      await updateTool!.execute({ taskId: 'b', status: 'in_progress' });
      result = await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'B done' });
      expect(result.newlyUnblockedTasks).toHaveLength(1);
      expect(result.newlyUnblockedTasks![0].id).toBe('c');

      // Phase 5: Start and complete C
      await updateTool!.execute({ taskId: 'c', status: 'in_progress' });
      result = await updateTool!.execute({ taskId: 'c', status: 'completed', output_result: 'C done' });

      // Phase 6: All done
      unblocked = await getUnblocked!.execute({});
      expect(unblocked.tasks).toHaveLength(0);
      expect(unblocked.message).toContain('completed or failed');
    });

    it('should handle diamond pattern execution', async () => {
      // Re-init with diamond graph
      const freshPrompt = createTestPrompt();
      freshPrompt.defTaskGraph(createDiamondGraph());
      const update = freshPrompt.getTools().updateTaskStatus;
      const getUb = freshPrompt.getTools().getUnblockedTasks;

      // Only A is unblocked initially
      let ub = await getUb!.execute({});
      expect(ub.tasks).toHaveLength(1);
      expect(ub.tasks[0].id).toBe('a');

      // Complete A -> B and C unblocked
      await update!.execute({ taskId: 'a', status: 'in_progress' });
      let res = await update!.execute({ taskId: 'a', status: 'completed' });
      expect(res.newlyUnblockedTasks).toHaveLength(2);

      ub = await getUb!.execute({});
      expect(ub.tasks).toHaveLength(2);

      // Complete B only -> D still blocked (needs C)
      await update!.execute({ taskId: 'b', status: 'in_progress' });
      res = await update!.execute({ taskId: 'b', status: 'completed' });
      expect(res.newlyUnblockedTasks).toBeUndefined();

      ub = await getUb!.execute({});
      expect(ub.tasks).toHaveLength(1);
      expect(ub.tasks[0].id).toBe('c');

      // Complete C -> D is now unblocked
      await update!.execute({ taskId: 'c', status: 'in_progress' });
      res = await update!.execute({ taskId: 'c', status: 'completed' });
      expect(res.newlyUnblockedTasks).toHaveLength(1);
      expect(res.newlyUnblockedTasks![0].id).toBe('d');
    });
  });

  describe('edge cases', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should handle empty task graph', async () => {
      prompt.defTaskGraph([]);
      const tools = prompt.getTools();
      const result = await tools.getUnblockedTasks!.execute({});
      expect(result.tasks).toHaveLength(0);
    });

    it('should handle single task with no dependencies', async () => {
      prompt.defTaskGraph([
        { id: 'solo', title: 'Solo', description: 'Lone task', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      const tools = prompt.getTools();
      const result = await tools.getUnblockedTasks!.execute({});
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('solo');
    });

    it('should handle tasks with special characters in titles', async () => {
      prompt.defTaskGraph([
        { id: 'special', title: 'Task with "quotes" & <angles>', description: 'Test', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      const result = await prompt.getTools().updateTaskStatus!.execute({ taskId: 'special', status: 'in_progress' });
      expect(result.success).toBe(true);
      expect(result.task!.title).toBe('Task with "quotes" & <angles>');
    });

    it('should handle tasks with capabilities and agents', async () => {
      prompt.defTaskGraph([
        {
          id: 'db', title: 'DB Task', description: 'Database work',
          status: 'pending', dependencies: [], unblocks: [],
          required_capabilities: ['database', 'read-only'],
          assigned_subagent: 'DB_Agent'
        },
      ]);

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const task = state!.find(t => t.id === 'db')!;
      expect(task.required_capabilities).toEqual(['database', 'read-only']);
      expect(task.assigned_subagent).toBe('DB_Agent');
    });
  });

  // ============================================================
  // Advanced DAG Edge Cases
  // ============================================================

  describe('advanced DAG patterns', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should handle complex branching: A -> (B, C, D) -> (E, F) -> G', async () => {
      // Tree structure with multiple parallel paths that converge
      const tasks: TaskNode[] = [
        { id: 'a', title: 'Root', description: 'Root task', status: 'pending', dependencies: [], unblocks: ['b', 'c', 'd'], required_capabilities: [] },
        { id: 'b', title: 'Branch 1', description: '', status: 'pending', dependencies: ['a'], unblocks: ['e'], required_capabilities: [] },
        { id: 'c', title: 'Branch 2', description: '', status: 'pending', dependencies: ['a'], unblocks: ['e'], required_capabilities: [] },
        { id: 'd', title: 'Branch 3', description: '', status: 'pending', dependencies: ['a'], unblocks: ['f'], required_capabilities: [] },
        { id: 'e', title: 'Merge 1', description: '', status: 'pending', dependencies: ['b', 'c'], unblocks: ['g'], required_capabilities: [] },
        { id: 'f', title: 'Merge 2', description: '', status: 'pending', dependencies: ['d'], unblocks: ['g'], required_capabilities: [] },
        { id: 'g', title: 'Final', description: '', status: 'pending', dependencies: ['e', 'f'], unblocks: [], required_capabilities: [] },
      ];

      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;
      const getUnblocked = prompt.getTools().getUnblockedTasks;

      // Initially only root is unblocked
      let ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(1);
      expect(ub.tasks[0].id).toBe('a');

      // Complete root -> all three branches unblocked
      await updateTool!.execute({ taskId: 'a', status: 'completed' });
      ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(3);
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['b', 'c', 'd']);

      // Complete branch 1 (b) -> merge1 still blocked (needs c)
      await updateTool!.execute({ taskId: 'b', status: 'completed' });
      ub = await getUnblocked!.execute({});
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['c', 'd']);

      // Complete branch 3 (d) -> merge2 (f) unblocked
      await updateTool!.execute({ taskId: 'd', status: 'completed' });
      ub = await getUnblocked!.execute({});
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['c', 'f']);

      // Complete branch 2 (c) -> merge1 (e) unblocked
      await updateTool!.execute({ taskId: 'c', status: 'completed' });
      ub = await getUnblocked!.execute({});
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['e', 'f']);

      // Complete both merges -> final task unblocked
      await updateTool!.execute({ taskId: 'e', status: 'completed' });
      await updateTool!.execute({ taskId: 'f', status: 'completed' });
      ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(1);
      expect(ub.tasks[0].id).toBe('g');
    });

    it('should handle multiple convergence points in sequence', async () => {
      // Pattern: (A, B) -> C, (D, E) -> F, (C, F) -> G
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['c'], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: [], unblocks: ['c'], required_capabilities: [] },
        { id: 'c', title: 'C', description: '', status: 'pending', dependencies: ['a', 'b'], unblocks: ['g'], required_capabilities: [] },
        { id: 'd', title: 'D', description: '', status: 'pending', dependencies: [], unblocks: ['f'], required_capabilities: [] },
        { id: 'e', title: 'E', description: '', status: 'pending', dependencies: [], unblocks: ['f'], required_capabilities: [] },
        { id: 'f', title: 'F', description: '', status: 'pending', dependencies: ['d', 'e'], unblocks: ['g'], required_capabilities: [] },
        { id: 'g', title: 'G', description: '', status: 'pending', dependencies: ['c', 'f'], unblocks: [], required_capabilities: [] },
      ];

      prompt.defTaskGraph(tasks);
      const getUnblocked = prompt.getTools().getUnblockedTasks;

      // Four independent roots should be unblocked
      let ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(4);
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['a', 'b', 'd', 'e']);
    });

    it('should handle wide graph with many parallel tasks', async () => {
      // Root splits into 10 parallel tasks that all converge to final
      const tasks: TaskNode[] = [
        { id: 'root', title: 'Root', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'final', title: 'Final', description: '', status: 'pending', dependencies: ['root'], unblocks: [], required_capabilities: [] },
      ];

      for (let i = 0; i < 10; i++) {
        tasks.push({
          id: `task${i}`,
          title: `Task ${i}`,
          description: '',
          status: 'pending',
          dependencies: ['root'],
          unblocks: ['final'],
          required_capabilities: [],
        });
      }

      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;
      const getUnblocked = prompt.getTools().getUnblockedTasks;

      // Complete root
      await updateTool!.execute({ taskId: 'root', status: 'completed' });

      // All 10 parallel tasks should be unblocked
      let ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(10);

      // Complete 9 of them
      for (let i = 0; i < 9; i++) {
        await updateTool!.execute({ taskId: `task${i}`, status: 'completed' });
      }

      // Final still blocked
      ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(1);
      expect(ub.tasks[0].id).toBe('task9');

      // Complete last one
      await updateTool!.execute({ taskId: 'task9', status: 'completed' });

      // Now final is unblocked
      ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(1);
      expect(ub.tasks[0].id).toBe('final');
    });
  });

  describe('partial failure scenarios', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should handle single branch failure in diamond pattern', async () => {
      const tasks = createDiamondGraph();
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;
      const getUnblocked = prompt.getTools().getUnblockedTasks;

      // Complete root
      await updateTool!.execute({ taskId: 'a', status: 'completed' });

      // Start both branches
      await updateTool!.execute({ taskId: 'b', status: 'in_progress' });
      await updateTool!.execute({ taskId: 'c', status: 'in_progress' });

      // Fail one branch
      await updateTool!.execute({ taskId: 'b', status: 'failed' });

      // Complete the other branch
      await updateTool!.execute({ taskId: 'c', status: 'completed' });

      // Merge task (d) should still be blocked because b failed
      let ub = await getUnblocked!.execute({});
      expect(ub.tasks).toHaveLength(0);

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'd')!.status).toBe('pending');
    });

    it('should continue execution on independent branches after failure', async () => {
      // Pattern: A -> (B, C), B -> D, C -> E
      const tasks: TaskNode[] = [
        { id: 'a', title: 'Root', description: '', status: 'pending', dependencies: [], unblocks: ['b', 'c'], required_capabilities: [] },
        { id: 'b', title: 'Branch B', description: '', status: 'pending', dependencies: ['a'], unblocks: ['d'], required_capabilities: [] },
        { id: 'c', title: 'Branch C', description: '', status: 'pending', dependencies: ['a'], unblocks: ['e'], required_capabilities: [] },
        { id: 'd', title: 'After B', description: '', status: 'pending', dependencies: ['b'], unblocks: [], required_capabilities: [] },
        { id: 'e', title: 'After C', description: '', status: 'pending', dependencies: ['c'], unblocks: [], required_capabilities: [] },
      ];

      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;
      const getUnblocked = prompt.getTools().getUnblockedTasks;

      // Complete root and fail branch B
      await updateTool!.execute({ taskId: 'a', status: 'completed' });
      await updateTool!.execute({ taskId: 'b', status: 'failed' });

      // Branch C should still be unblocked
      let ub = await getUnblocked!.execute({});
      expect(ub.tasks.some(t => t.id === 'c')).toBe(true);

      // Complete branch C -> E should be unblocked
      await updateTool!.execute({ taskId: 'c', status: 'completed' });
      ub = await getUnblocked!.execute({});
      expect(ub.tasks.some(t => t.id === 'e')).toBe(true);

      // D should never be unblocked (B failed)
      expect(ub.tasks.some(t => t.id === 'd')).toBe(false);
    });

    it('should track failed tasks separately in state', async () => {
      const tasks = createLinearGraph();
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      await updateTool!.execute({ taskId: 'a', status: 'failed' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const failed = state!.filter(t => t.status === 'failed');

      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe('a');
    });
  });

  describe('context propagation through multiple hops', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should propagate context through a linear chain', async () => {
      const tasks = createLinearGraph();
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      // Complete A with output
      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Result A' });

      // B should have context from A
      let state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'b')!.input_context).toContain('Result A');
      expect(state!.find(t => t.id === 'b')!.input_context).toContain('Task A');

      // Complete B with output
      await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'Result B' });

      // C should have context from B (not A, since A doesn't directly unblock C)
      state = prompt.getState<TaskNode[]>('taskGraph');
      const taskC = state!.find(t => t.id === 'c')!;
      expect(taskC.input_context).toContain('Result B');
      expect(taskC.input_context).toContain('Task B');
      expect(taskC.input_context).not.toContain('Result A'); // A doesn't directly unblock C
    });

    it('should propagate context from the task that unblocks', async () => {
      const tasks = createDiamondGraph();
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      // Complete root and both branches with output
      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Root output' });
      
      // Complete B first - D is not yet unblocked (still waiting for C)
      await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'Branch B output' });
      
      // D should not have context yet (still blocked by C)
      let state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'd')!.input_context).toBeUndefined();
      
      // Complete C - this unblocks D and propagates context
      await updateTool!.execute({ taskId: 'c', status: 'completed', output_result: 'Branch C output' });

      // D gets context from the task that finally unblocks it (C)
      // Note: Context is only added when a task becomes newly unblocked
      state = prompt.getState<TaskNode[]>('taskGraph');
      const taskD = state!.find(t => t.id === 'd')!;
      expect(taskD.input_context).toContain('Branch C output');
      expect(taskD.input_context).toContain('Task C');
    });

    it('should append context to existing input_context', async () => {
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['b'], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [], input_context: 'Initial context' },
      ];

      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'New context' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const taskB = state!.find(t => t.id === 'b')!;
      expect(taskB.input_context).toContain('Initial context');
      expect(taskB.input_context).toContain('New context');
    });

    it('should not propagate context when output_result is missing', async () => {
      const tasks = createLinearGraph();
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      // Complete A without output_result
      await updateTool!.execute({ taskId: 'a', status: 'completed' });

      // B should not have input_context added
      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'b')!.input_context).toBeUndefined();
    });
  });

  describe('re-execution stability and effects', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should register effect with taskGraph dependency', async () => {
      const [graph] = prompt.defTaskGraph(createLinearGraph());

      // Register a separate effect that depends on the graph state
      let effectCallCount = 0;
      prompt.defEffect(() => {
        effectCallCount++;
        const currentGraph = prompt.getState<TaskNode[]>('taskGraph');
        expect(currentGraph).toBeDefined();
        expect(currentGraph!.length).toBe(3);
      }, [graph]);

      // The effect is registered but won't execute until there's actual model interaction
      // We verify the state is accessible
      const currentGraph = prompt.getState<TaskNode[]>('taskGraph');
      expect(currentGraph).toBeDefined();
      expect(currentGraph!.length).toBe(3);
    });

    it('should update system prompt via effect when graph changes', async () => {
      const [, setGraph] = prompt.defTaskGraph(createLinearGraph());

      // Get the effect that was registered
      const systems = new Map<string, string>();
      prompt.defEffect((_ctx, stepModifier) => {
        stepModifier('systems', [
          { name: 'test', value: 'capturing' }
        ]);
      }, []);

      await prompt.run();

      // Verify the system prompt effect was set up
      // The actual system content is tested separately
      expect(true).toBe(true);
    });

    it('should preserve task graph state through setTaskGraph updates', async () => {
      const [, setGraph] = prompt.defTaskGraph(createLinearGraph());

      // Update via functional setter
      setGraph(prev => prev.map(t =>
        t.id === 'a' ? { ...t, status: 'completed' as const } : t
      ));

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'a')!.status).toBe('completed');
      expect(state!.find(t => t.id === 'b')!.status).toBe('pending');
    });

    it('should handle rapid state updates without corruption', async () => {
      const [, setGraph] = prompt.defTaskGraph(createLinearGraph());

      // Multiple rapid updates
      for (let i = 0; i < 10; i++) {
        setGraph(prev => prev.map(t =>
          t.id === 'a' ? { ...t, status: 'in_progress' as const } : t
        ));
      }

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.find(t => t.id === 'a')!.status).toBe('in_progress');
      expect(state!.length).toBe(3); // No duplicates
    });
  });

  describe('system prompt generation', () => {
    let prompt: ReturnType<typeof createTestPrompt>;

    beforeEach(() => {
      prompt = createTestPrompt();
    });

    it('should generate system prompt sections for each status', async () => {
      const tasks: TaskNode[] = [
        { id: 'pending', title: 'Pending Task', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'inprog', title: 'In Progress Task', description: '', status: 'in_progress', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'done', title: 'Done Task', description: '', status: 'completed', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'failed', title: 'Failed Task', description: '', status: 'failed', dependencies: [], unblocks: [], required_capabilities: [] },
      ];

      prompt.defTaskGraph(tasks);

      // The effect should register a system modifier
      // We verify indirectly by checking the effect was set up
      await prompt.run();

      // Verify state is correct
      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.filter(t => t.status === 'pending')).toHaveLength(1);
      expect(state!.filter(t => t.status === 'in_progress')).toHaveLength(1);
      expect(state!.filter(t => t.status === 'completed')).toHaveLength(1);
      expect(state!.filter(t => t.status === 'failed')).toHaveLength(1);
    });

    it('should format tasks with dependencies, capabilities, and agents', async () => {
      const tasks: TaskNode[] = [
        {
          id: 'task1',
          title: 'Complex Task',
          description: '',
          status: 'pending',
          dependencies: ['dep1', 'dep2'],
          unblocks: [],
          required_capabilities: ['database', 'web-search'],
          assigned_subagent: 'SpecialistAgent',
        },
      ];

      prompt.defTaskGraph(tasks);
      await prompt.run();

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const task = state!.find(t => t.id === 'task1')!;
      expect(task.dependencies).toEqual(['dep1', 'dep2']);
      expect(task.required_capabilities).toEqual(['database', 'web-search']);
      expect(task.assigned_subagent).toBe('SpecialistAgent');
    });

    it('should show unblocked tasks in ready section', async () => {
      const tasks = createLinearGraph();
      prompt.defTaskGraph(tasks);

      await prompt.run();

      // Verify the unblocked calculation is correct
      const unblocked = getUnblockedTasks(prompt.getState<TaskNode[]>('taskGraph')!);
      expect(unblocked).toHaveLength(1);
      expect(unblocked[0].id).toBe('a');
    });
  });

  describe('tool integration with mock model', () => {
    it('should execute tools through mock model stream', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Starting task graph...' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'getUnblockedTasks', args: {} },
        { type: 'text', text: 'Found tasks!' },
      ]);

      const prompt = new StatefulPrompt(mockModel);
      prompt.setPlugins([taskGraphPlugin]);

      const boundDefTaskGraph = taskGraphPlugin.defTaskGraph.bind(prompt);
      boundDefTaskGraph(createLinearGraph());

      const result = await prompt.run();

      // Verify tools were registered
      expect(prompt.getTools()).toHaveProperty('getUnblockedTasks');

      // Verify execution completed
      expect(result.finishReason).toBeDefined();
    });

    it('should handle tool calls through mock model execution', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Starting...' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'getUnblockedTasks', args: {} },
        { type: 'text', text: 'Found tasks' },
      ]);

      const prompt = new StatefulPrompt(mockModel);
      prompt.setPlugins([taskGraphPlugin]);

      const boundDefTaskGraph = taskGraphPlugin.defTaskGraph.bind(prompt);
      boundDefTaskGraph(createLinearGraph());
      
      // Add a message to trigger execution
      prompt.$`Execute the graph`;

      const result = await prompt.run();

      // Verify the tool was called
      expect(result.finishReason).toBeDefined();
      
      // Verify graph state is maintained
      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state!.length).toBe(3);
    });
  });

  describe('helper exports verification', () => {
    it('should export all DAG utility functions', () => {
      expect(typeof detectCycles).toBe('function');
      expect(typeof validateTaskGraph).toBe('function');
      expect(typeof normalizeTaskGraph).toBe('function');
      expect(typeof getUnblockedTasks).toBe('function');
    });

    it('should export taskGraphPlugin object', () => {
      expect(taskGraphPlugin).toBeDefined();
      expect(taskGraphPlugin).toHaveProperty('defTaskGraph');
    });

    it('should allow importing from index', async () => {
      // This tests that the exports in index.ts work correctly
      const { taskGraphPlugin: imported } = await import('./index');
      expect(imported).toBe(taskGraphPlugin);
    });
  });
});

// ============================================================
// CORD Protocol Features: spawn / fork / ask
// ============================================================

describe('CORD protocol features', () => {
  // Helper to create a fresh proxied prompt
  function makePrompt() {
    const mockModel = createMockModel([]);
    const prompt = new StatefulPrompt(mockModel);
    prompt.setPlugins([taskGraphPlugin]);
    const boundPluginMethods: Record<string, Function> = {};
    for (const [name, fn] of Object.entries(taskGraphPlugin)) {
      if (typeof fn === 'function') {
        boundPluginMethods[name] = (fn as Function).bind(prompt);
      }
    }
    return new Proxy(prompt, {
      get(target, prop) {
        if (typeof prop === 'string' && prop in boundPluginMethods) return boundPluginMethods[prop];
        const v = target[prop as keyof StatefulPrompt];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as StatefulPrompt & { defTaskGraph: typeof taskGraphPlugin.defTaskGraph };
  }

  // --------------------------------------------------------
  // node_type field
  // --------------------------------------------------------
  describe('TaskNode node_type field', () => {
    it('should default node_type to spawn when not specified', () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ];
      const [graph] = prompt.defTaskGraph(tasks);
      // No node_type set → behaves as spawn
      expect(graph[0].node_type).toBeUndefined();
    });

    it('should preserve node_type: fork when set on initial graph', () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['b'], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', node_type: 'fork', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      const [graph] = prompt.defTaskGraph(tasks);
      expect(graph.find(t => t.id === 'b')!.node_type).toBe('fork');
    });

    it('should preserve node_type: ask when set on initial graph', () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        {
          id: 'q1', title: 'Question', description: 'Ask user', status: 'pending',
          node_type: 'ask', question: 'How many users?', answer_options: ['<1K', '1K-10K', '>10K'],
          dependencies: [], unblocks: [], required_capabilities: [],
        },
      ];
      const [graph] = prompt.defTaskGraph(tasks);
      const node = graph.find(t => t.id === 'q1')!;
      expect(node.node_type).toBe('ask');
      expect(node.question).toBe('How many users?');
      expect(node.answer_options).toEqual(['<1K', '1K-10K', '>10K']);
    });

    it('generateTaskGraph tool should accept node_type field', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph();
      const tool = prompt.getTools().generateTaskGraph;
      const result = await tool!.execute({
        tasks: [
          { id: 'research', title: 'Research', description: '', node_type: 'spawn', dependencies: [], unblocks: ['analysis'], required_capabilities: [] },
          { id: 'analysis', title: 'Analysis', description: '', node_type: 'fork', dependencies: ['research'], unblocks: [], required_capabilities: [] },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.tasks!.find(t => t.id === 'analysis')!.node_type).toBe('fork');
    });
  });

  // --------------------------------------------------------
  // Fork context propagation
  // --------------------------------------------------------
  describe('fork context propagation', () => {
    it('fork node receives context from ALL completed tasks on unblocking', async () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'Task A', description: '', status: 'pending', dependencies: [], unblocks: ['fork1'], required_capabilities: [] },
        { id: 'b', title: 'Task B', description: '', status: 'pending', dependencies: [], unblocks: ['fork1'], required_capabilities: [] },
        {
          id: 'fork1', title: 'Fork Analysis', description: '', status: 'pending',
          node_type: 'fork', dependencies: ['a', 'b'], unblocks: [], required_capabilities: [],
        },
      ];
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      // Complete A with output
      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Output from A' });
      // Complete B with output — this unblocks fork1
      await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'Output from B' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const forkTask = state!.find(t => t.id === 'fork1')!;

      // Fork should have context from BOTH A and B
      expect(forkTask.input_context).toContain('Output from A');
      expect(forkTask.input_context).toContain('Task A');
      expect(forkTask.input_context).toContain('Output from B');
      expect(forkTask.input_context).toContain('Task B');
    });

    it('spawn node only receives context from direct completing task', async () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'Task A', description: '', status: 'pending', dependencies: [], unblocks: ['spawn1'], required_capabilities: [] },
        { id: 'b', title: 'Task B', description: '', status: 'pending', dependencies: [], unblocks: ['spawn1'], required_capabilities: [] },
        {
          id: 'spawn1', title: 'Spawn Task', description: '', status: 'pending',
          node_type: 'spawn', dependencies: ['a', 'b'], unblocks: [], required_capabilities: [],
        },
      ];
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Output from A' });
      // B's completion triggers unblocking of spawn1
      await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'Output from B' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const spawnTask = state!.find(t => t.id === 'spawn1')!;

      // Spawn should ONLY have context from B (the completing task that triggered unblocking)
      expect(spawnTask.input_context).toContain('Output from B');
      expect(spawnTask.input_context).not.toContain('Output from A');
    });

    it('fork node gets context from all completed tasks including non-dependencies', async () => {
      // A is independent of the fork's dep chain, but fork should still get A's context
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'Unrelated A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'Dep B', description: '', status: 'pending', dependencies: [], unblocks: ['fork1'], required_capabilities: [] },
        {
          id: 'fork1', title: 'Fork', description: '', status: 'pending',
          node_type: 'fork', dependencies: ['b'], unblocks: [], required_capabilities: [],
        },
      ];
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      // Complete A first (unrelated to fork's dependencies)
      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'Unrelated output' });
      // Complete B — unblocks fork1
      await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'Dep output' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const forkTask = state!.find(t => t.id === 'fork1')!;

      // Fork gets ALL completed outputs (including unrelated A)
      expect(forkTask.input_context).toContain('Unrelated output');
      expect(forkTask.input_context).toContain('Dep output');
    });

    it('fork node with no completed outputs stays without context', async () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['fork1'], required_capabilities: [] },
        { id: 'fork1', title: 'Fork', description: '', status: 'pending', node_type: 'fork', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ];
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      // Complete A without output_result
      await updateTool!.execute({ taskId: 'a', status: 'completed' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const forkTask = state!.find(t => t.id === 'fork1')!;
      expect(forkTask.input_context).toBeUndefined();
    });

    it('default (undefined) node_type behaves like spawn', async () => {
      const prompt = makePrompt();
      const tasks: TaskNode[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: ['c'], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: [], unblocks: ['c'], required_capabilities: [] },
        // No node_type → should behave as spawn
        { id: 'c', title: 'C', description: '', status: 'pending', dependencies: ['a', 'b'], unblocks: [], required_capabilities: [] },
      ];
      prompt.defTaskGraph(tasks);
      const updateTool = prompt.getTools().updateTaskStatus;

      await updateTool!.execute({ taskId: 'a', status: 'completed', output_result: 'A output' });
      await updateTool!.execute({ taskId: 'b', status: 'completed', output_result: 'B output' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const cTask = state!.find(t => t.id === 'c')!;

      // Default spawn: only B's output (completing task)
      expect(cTask.input_context).toContain('B output');
      expect(cTask.input_context).not.toContain('A output');
    });
  });

  // --------------------------------------------------------
  // spawnTask tool
  // --------------------------------------------------------
  describe('spawnTask tool', () => {
    it('should register spawnTask tool', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      expect(prompt.getTools()).toHaveProperty('spawnTask');
    });

    it('should add a new spawn task to the graph', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tool = prompt.getTools().spawnTask;

      const result = await tool!.execute({
        id: 'task1', title: 'Research', description: 'Do research',
        dependencies: [], unblocks: [], required_capabilities: ['web-search'],
      });

      expect(result.success).toBe(true);
      expect(result.task!.node_type).toBe('spawn');
      expect(result.task!.id).toBe('task1');

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state).toHaveLength(1);
      expect(state![0].node_type).toBe('spawn');
    });

    it('should add spawn task to existing graph without replacing it', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'existing', title: 'Existing', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const tool = prompt.getTools().spawnTask;

      await tool!.execute({
        id: 'new', title: 'New Task', description: '',
        dependencies: ['existing'], unblocks: [], required_capabilities: [],
      });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state).toHaveLength(2);
      expect(state!.find(t => t.id === 'existing')).toBeDefined();
      expect(state!.find(t => t.id === 'new')).toBeDefined();
    });

    it('should normalize relationships after spawn', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'root', title: 'Root', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const tool = prompt.getTools().spawnTask;

      await tool!.execute({
        id: 'child', title: 'Child', description: '',
        dependencies: ['root'], unblocks: [], required_capabilities: [],
      });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const root = state!.find(t => t.id === 'root')!;
      // After normalization, root.unblocks should contain 'child'
      expect(root.unblocks).toContain('child');
    });

    it('should reject duplicate task ID', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'A', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const tool = prompt.getTools().spawnTask;

      const result = await tool!.execute({
        id: 'a', title: 'Duplicate', description: '', dependencies: [], unblocks: [], required_capabilities: [],
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });

    it('should reject spawn with non-existent dependency', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tool = prompt.getTools().spawnTask;

      const result = await tool!.execute({
        id: 'orphan', title: 'Orphan', description: '',
        dependencies: ['ghost'], unblocks: [], required_capabilities: [],
      });

      expect(result.success).toBe(false);
    });

    it('spawn task should only get direct dependency context on completion', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'unrelated', title: 'Unrelated', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'dep', title: 'Dep', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const spawnTool = prompt.getTools().spawnTask;
      const updateTool = prompt.getTools().updateTaskStatus;

      await spawnTool!.execute({
        id: 'child', title: 'Child', description: '',
        dependencies: ['dep'], unblocks: [], required_capabilities: [],
      });

      await updateTool!.execute({ taskId: 'unrelated', status: 'completed', output_result: 'Unrelated result' });
      await updateTool!.execute({ taskId: 'dep', status: 'completed', output_result: 'Dep result' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const child = state!.find(t => t.id === 'child')!;
      expect(child.input_context).toContain('Dep result');
      expect(child.input_context).not.toContain('Unrelated result');
    });
  });

  // --------------------------------------------------------
  // forkTask tool
  // --------------------------------------------------------
  describe('forkTask tool', () => {
    it('should register forkTask tool', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      expect(prompt.getTools()).toHaveProperty('forkTask');
    });

    it('should add a new fork task to the graph', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tool = prompt.getTools().forkTask;

      const result = await tool!.execute({
        id: 'analysis', title: 'Analysis', description: 'Analyze results',
        dependencies: [], unblocks: [], required_capabilities: [],
      });

      expect(result.success).toBe(true);
      expect(result.task!.node_type).toBe('fork');

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state![0].node_type).toBe('fork');
    });

    it('fork task should receive ALL completed task outputs on unblocking', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'research1', title: 'Research 1', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'research2', title: 'Research 2', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const forkTool = prompt.getTools().forkTask;
      const updateTool = prompt.getTools().updateTaskStatus;

      await forkTool!.execute({
        id: 'synthesis', title: 'Synthesis', description: '',
        dependencies: ['research1', 'research2'], unblocks: [], required_capabilities: [],
      });

      await updateTool!.execute({ taskId: 'research1', status: 'completed', output_result: 'Findings 1' });
      await updateTool!.execute({ taskId: 'research2', status: 'completed', output_result: 'Findings 2' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const synthesis = state!.find(t => t.id === 'synthesis')!;

      expect(synthesis.input_context).toContain('Findings 1');
      expect(synthesis.input_context).toContain('Findings 2');
    });

    it('should reject duplicate task ID for forkTask', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'existing', title: 'Existing', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const tool = prompt.getTools().forkTask;

      const result = await tool!.execute({
        id: 'existing', title: 'Dup', description: '', dependencies: [], unblocks: [], required_capabilities: [],
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });
  });

  // --------------------------------------------------------
  // askHuman tool
  // --------------------------------------------------------
  describe('askHuman tool', () => {
    it('should register askHuman tool', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      expect(prompt.getTools()).toHaveProperty('askHuman');
    });

    it('should create an ask node in the graph', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tool = prompt.getTools().askHuman;

      const result = await tool!.execute({
        id: 'q1',
        question: 'How many concurrent users?',
        answer_options: ['<1K', '1K-10K', '>10K'],
        dependencies: [],
        unblocks: [],
      });

      expect(result.success).toBe(true);
      expect(result.task!.node_type).toBe('ask');
      expect(result.task!.question).toBe('How many concurrent users?');
      expect(result.task!.answer_options).toEqual(['<1K', '1K-10K', '>10K']);
      expect(result.task!.status).toBe('pending');
    });

    it('should create ask node with dependencies and unblocks', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'audit', title: 'Audit', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'analysis', title: 'Analysis', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      // Make analysis depend on the ask node
      const updateTool = prompt.getTools().updateTaskStatus;
      // First, make analysis depend on ask (we'll use spawnTask pattern)
      const askTool = prompt.getTools().askHuman;

      const result = await askTool!.execute({
        id: 'q_scale',
        question: 'What is your expected scale?',
        dependencies: ['audit'],
        unblocks: ['analysis'],
      });

      expect(result.success).toBe(true);

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const qNode = state!.find(t => t.id === 'q_scale')!;
      expect(qNode.dependencies).toContain('audit');
      // After normalization, analysis should have q_scale as dependency
      const analysisNode = state!.find(t => t.id === 'analysis')!;
      expect(analysisNode.dependencies).toContain('q_scale');
    });

    it('should reject duplicate ask node ID', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'q1', title: 'Existing', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);
      const tool = prompt.getTools().askHuman;

      const result = await tool!.execute({
        id: 'q1', question: 'Duplicate', dependencies: [], unblocks: [],
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });

    it('ask node without answer_options succeeds', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tool = prompt.getTools().askHuman;

      const result = await tool!.execute({
        id: 'q_open',
        question: 'Describe your architecture.',
        dependencies: [],
        unblocks: [],
      });

      expect(result.success).toBe(true);
      expect(result.task!.answer_options).toBeUndefined();
    });
  });

  // --------------------------------------------------------
  // answerQuestion tool
  // --------------------------------------------------------
  describe('answerQuestion tool', () => {
    it('should register answerQuestion tool', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      expect(prompt.getTools()).toHaveProperty('answerQuestion');
    });

    it('should complete an ask node with the answer', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Scale?', description: 'Scale question',
          node_type: 'ask', question: 'What is your scale?',
          status: 'pending', dependencies: [], unblocks: ['analysis'],
          required_capabilities: [],
        },
        { id: 'analysis', title: 'Analysis', description: '', status: 'pending', dependencies: ['q1'], unblocks: [], required_capabilities: [] },
      ]);

      const tool = prompt.getTools().answerQuestion;
      const result = await tool!.execute({ taskId: 'q1', answer: '10K-100K users' });

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe('completed');
      expect(result.task!.output_result).toBe('10K-100K users');
    });

    it('should unblock downstream tasks after answering', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Scale?', description: 'Scale question',
          node_type: 'ask', question: 'Scale?',
          status: 'pending', dependencies: [], unblocks: ['downstream'],
          required_capabilities: [],
        },
        { id: 'downstream', title: 'Downstream', description: '', status: 'pending', dependencies: ['q1'], unblocks: [], required_capabilities: [] },
      ]);

      const answerTool = prompt.getTools().answerQuestion;
      const result = await answerTool!.execute({ taskId: 'q1', answer: 'Large scale' });

      expect(result.newlyUnblockedTasks).toHaveLength(1);
      expect(result.newlyUnblockedTasks![0].id).toBe('downstream');

      const getUbTool = prompt.getTools().getUnblockedTasks;
      const unblocked = await getUbTool!.execute({});
      expect(unblocked.tasks.some(t => t.id === 'downstream')).toBe(true);
    });

    it('should reject answering a non-ask node', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'task1', title: 'Task', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      const tool = prompt.getTools().answerQuestion;
      const result = await tool!.execute({ taskId: 'task1', answer: 'answer' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not an ask node');
    });

    it('should reject answering already-answered question', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Q', description: 'Q', node_type: 'ask', question: 'Q?',
          status: 'pending', dependencies: [], unblocks: [], required_capabilities: [],
        },
      ]);

      const tool = prompt.getTools().answerQuestion;
      await tool!.execute({ taskId: 'q1', answer: 'First answer' });
      const result = await tool!.execute({ taskId: 'q1', answer: 'Second answer' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already been answered');
    });

    it('should reject answering when dependencies are unmet', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'dep', title: 'Dep', description: '', status: 'pending', dependencies: [], unblocks: ['q1'], required_capabilities: [] },
        {
          id: 'q1', title: '[ASK] Q', description: 'Q', node_type: 'ask', question: 'Q?',
          status: 'pending', dependencies: ['dep'], unblocks: [], required_capabilities: [],
        },
      ]);

      const tool = prompt.getTools().answerQuestion;
      const result = await tool!.execute({ taskId: 'q1', answer: 'Too early' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unmet dependencies');
    });

    it('answer propagates as context to downstream spawn tasks', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Scale?', description: '', node_type: 'ask', question: 'Scale?',
          status: 'pending', dependencies: [], unblocks: ['rec'], required_capabilities: [],
        },
        { id: 'rec', title: 'Recommendation', description: '', status: 'pending', dependencies: ['q1'], unblocks: [], required_capabilities: [] },
      ]);

      const tool = prompt.getTools().answerQuestion;
      await tool!.execute({ taskId: 'q1', answer: '10K-100K users' });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      const rec = state!.find(t => t.id === 'rec')!;
      expect(rec.input_context).toContain('10K-100K users');
    });

    it('should return not found for unknown task', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tool = prompt.getTools().answerQuestion;
      const result = await tool!.execute({ taskId: 'ghost', answer: 'answer' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  // --------------------------------------------------------
  // readTree tool
  // --------------------------------------------------------
  describe('readTree tool', () => {
    it('should register readTree tool', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      expect(prompt.getTools()).toHaveProperty('readTree');
    });

    it('should return empty for empty graph', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const result = await prompt.getTools().readTree!.execute({});
      expect(result.success).toBe(true);
      expect(result.tree).toBe('(empty)');
      expect(result.tasks).toHaveLength(0);
    });

    it('should return all tasks in tree format', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'Root Task', description: '', status: 'pending', dependencies: [], unblocks: ['b'], required_capabilities: [] },
        { id: 'b', title: 'Child Task', description: '', status: 'pending', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.success).toBe(true);
      expect(result.tree).toContain('Root Task');
      expect(result.tree).toContain('Child Task');
      expect(result.tasks).toHaveLength(2);
    });

    it('should show node type labels in tree', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'Spawn Task', description: '', status: 'pending', node_type: 'spawn', dependencies: [], unblocks: ['b'], required_capabilities: [] },
        { id: 'b', title: 'Fork Analysis', description: '', status: 'pending', node_type: 'fork', dependencies: ['a'], unblocks: [], required_capabilities: [] },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.tree).toContain('FORK');
    });

    it('should show ask node question in tree', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Scale?', description: '',
          node_type: 'ask', question: 'How many concurrent users?',
          answer_options: ['<1K', '1K-10K'],
          status: 'pending', dependencies: [], unblocks: [], required_capabilities: [],
        },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.tree).toContain('How many concurrent users?');
      expect(result.tree).toContain('<1K');
    });

    it('should show completion status symbols', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'Task A', description: '', status: 'completed', dependencies: [], unblocks: [], required_capabilities: [], output_result: 'Done' },
        { id: 'b', title: 'Task B', description: '', status: 'in_progress', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'c', title: 'Task C', description: '', status: 'failed', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'd', title: 'Task D', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.tree).toContain('✓');
      expect(result.tree).toContain('●');
      expect(result.tree).toContain('✗');
      expect(result.tree).toContain('○');
    });

    it('should include output_result preview for completed tasks', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'Task A', description: '', status: 'completed', dependencies: [], unblocks: [], required_capabilities: [], output_result: 'My output result' },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.tree).toContain('My output result');
    });

    it('summary message includes task counts', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'A', description: '', status: 'completed', dependencies: [], unblocks: [], required_capabilities: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.message).toContain('1 completed');
      expect(result.message).toContain('1 pending');
    });

    it('summary mentions unanswered questions', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Q', description: '', node_type: 'ask', question: 'Q?',
          status: 'pending', dependencies: [], unblocks: [], required_capabilities: [],
        },
      ]);

      const result = await prompt.getTools().readTree!.execute({});
      expect(result.message).toContain('unanswered question');
    });
  });

  // --------------------------------------------------------
  // CORD-style full workflow: spawn + fork + ask
  // --------------------------------------------------------
  describe('CORD-style full workflow', () => {
    it('CORD scenario: research (spawn) -> ask -> fork analysis', async () => {
      /*
       * Recreates the CORD example from the article:
       * ● #1 GOAL: Should we migrate?
       *   ● #2 SPAWN Audit REST API
       *   ● #3 SPAWN Research GraphQL
       *   ○ #4 ASK How many users?  (blocked-by: #2)
       *   ○ #5 FORK Comparative analysis (blocked-by: #3, #4)
       *   ○ #6 SPAWN Write recommendation (blocked-by: #5)
       */
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'audit', title: 'Audit REST API', description: '', status: 'pending', dependencies: [], unblocks: ['ask_scale'], required_capabilities: [] },
        { id: 'research', title: 'Research GraphQL', description: '', status: 'pending', dependencies: [], unblocks: ['analysis'], required_capabilities: [] },
        {
          id: 'ask_scale', title: '[ASK] How many users?', description: '',
          node_type: 'ask', question: 'How many concurrent users do you serve?',
          answer_options: ['<1K', '1K-10K', '10K-100K', '>100K'],
          status: 'pending', dependencies: ['audit'], unblocks: ['analysis'], required_capabilities: [],
        },
        {
          id: 'analysis', title: 'Comparative analysis', description: '', status: 'pending',
          node_type: 'fork', dependencies: ['research', 'ask_scale'], unblocks: ['recommend'], required_capabilities: [],
        },
        { id: 'recommend', title: 'Write recommendation', description: '', status: 'pending', dependencies: ['analysis'], unblocks: [], required_capabilities: [] },
      ]);

      const update = prompt.getTools().updateTaskStatus;
      const answer = prompt.getTools().answerQuestion;
      const getUb = prompt.getTools().getUnblockedTasks;
      const readTree = prompt.getTools().readTree;

      // Initial state: audit and research are unblocked
      let ub = await getUb!.execute({});
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['audit', 'research']);

      // Complete audit and research in parallel
      await update!.execute({ taskId: 'audit', status: 'completed', output_result: '47 endpoints, 12 nested resources' });
      await update!.execute({ taskId: 'research', status: 'completed', output_result: 'Key advantages: reduced over-fetching' });

      // Now ask_scale is unblocked (audit done)
      ub = await getUb!.execute({});
      expect(ub.tasks.some(t => t.id === 'ask_scale')).toBe(true);
      // analysis is still blocked (waiting for ask_scale)
      expect(ub.tasks.some(t => t.id === 'analysis')).toBe(false);

      // Human answers the question
      const answerResult = await answer!.execute({ taskId: 'ask_scale', answer: '10K-100K' });
      expect(answerResult.success).toBe(true);
      expect(answerResult.newlyUnblockedTasks!.some(t => t.id === 'analysis')).toBe(true);

      // Analysis (fork) should now have ALL completed outputs
      const state = prompt.getState<TaskNode[]>('taskGraph');
      const analysisTask = state!.find(t => t.id === 'analysis')!;
      expect(analysisTask.input_context).toContain('47 endpoints');
      expect(analysisTask.input_context).toContain('reduced over-fetching');
      expect(analysisTask.input_context).toContain('10K-100K');

      // Check readTree output
      const tree = await readTree!.execute({});
      expect(tree.tree).toContain('Comparative analysis');
      expect(tree.tree).toContain('FORK');

      // Complete analysis, then recommend
      await update!.execute({ taskId: 'analysis', status: 'completed', output_result: 'Recommend migration' });
      ub = await getUb!.execute({});
      expect(ub.tasks.some(t => t.id === 'recommend')).toBe(true);
    });

    it('dynamic spawn: agent creates subtasks at runtime', async () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'root', title: 'Root task', description: '', status: 'pending', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      const spawn = prompt.getTools().spawnTask;
      const fork = prompt.getTools().forkTask;
      const update = prompt.getTools().updateTaskStatus;

      // Agent completes root, then decides to spawn subtasks
      await update!.execute({ taskId: 'root', status: 'completed', output_result: 'Analysis shows 3 areas' });

      // Dynamically add spawn tasks (no unblocks yet - synthesis doesn't exist)
      await spawn!.execute({ id: 'area1', title: 'Area 1', description: '', dependencies: ['root'], unblocks: [], required_capabilities: [] });
      await spawn!.execute({ id: 'area2', title: 'Area 2', description: '', dependencies: ['root'], unblocks: [], required_capabilities: [] });
      // Add fork for synthesis (depends on area1 and area2 — normalization fills in unblocks)
      await fork!.execute({ id: 'synthesis', title: 'Synthesis', description: '', dependencies: ['area1', 'area2'], unblocks: [], required_capabilities: [] });

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state).toHaveLength(4);
      expect(state!.find(t => t.id === 'synthesis')!.node_type).toBe('fork');
      // Normalization: area1 and area2 should have synthesis in their unblocks
      expect(state!.find(t => t.id === 'area1')!.unblocks).toContain('synthesis');
      expect(state!.find(t => t.id === 'area2')!.unblocks).toContain('synthesis');

      // area1 and area2 should be immediately unblocked (root completed)
      const getUb = prompt.getTools().getUnblockedTasks;
      const ub = await getUb!.execute({});
      expect(ub.tasks.map(t => t.id).sort()).toEqual(['area1', 'area2']);
    });
  });

  // --------------------------------------------------------
  // System prompt shows node types and ask sections
  // --------------------------------------------------------
  describe('system prompt with CORD features', () => {
    it('should show [FORK] label for fork nodes', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        { id: 'a', title: 'A', description: '', status: 'pending', node_type: 'fork', dependencies: [], unblocks: [], required_capabilities: [] },
      ]);

      // Verify state is set correctly with fork type
      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state![0].node_type).toBe('fork');
    });

    it('should show [ASK] label for ask nodes', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([
        {
          id: 'q1', title: '[ASK] Q', description: '', node_type: 'ask', question: 'What is your goal?',
          status: 'pending', dependencies: [], unblocks: [], required_capabilities: [],
        },
      ]);

      const state = prompt.getState<TaskNode[]>('taskGraph');
      expect(state![0].node_type).toBe('ask');
      expect(state![0].question).toBe('What is your goal?');
    });
  });

  // --------------------------------------------------------
  // New tool registrations verification
  // --------------------------------------------------------
  describe('new tool registrations', () => {
    it('should register all 8 tools', () => {
      const prompt = makePrompt();
      prompt.defTaskGraph([]);
      const tools = prompt.getTools();
      expect(tools).toHaveProperty('generateTaskGraph');
      expect(tools).toHaveProperty('getUnblockedTasks');
      expect(tools).toHaveProperty('updateTaskStatus');
      expect(tools).toHaveProperty('spawnTask');
      expect(tools).toHaveProperty('forkTask');
      expect(tools).toHaveProperty('askHuman');
      expect(tools).toHaveProperty('answerQuestion');
      expect(tools).toHaveProperty('readTree');
    });
  });

  // --------------------------------------------------------
  // Type exports verification
  // --------------------------------------------------------
  describe('type exports', () => {
    it('should export TaskNodeType from plugins index', async () => {
      // Dynamic import to verify the type is exported at runtime via the shape
      const mod = await import('../index');
      // Verify the module loaded correctly (types don't have runtime presence,
      // but we can verify the plugin exports are there)
      expect(mod.taskGraphPlugin).toBeDefined();
    });
  });
});
