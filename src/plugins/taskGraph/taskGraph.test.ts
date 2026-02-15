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
});
