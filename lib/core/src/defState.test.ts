import { describe, it, expect } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { z } from 'zod';

/**
 * Comprehensive test suite for defState functionality.
 * Validates state persistence, updater semantics, and consistency across re-executions.
 */
describe('defState - Comprehensive Validation', () => {
  describe('Initial value creation and reads', () => {
    it('should create state with initial primitive value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      let capturedValue: any;
      const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
        const [value] = defState('counter', 42);
        capturedValue = value;
        $`Value: ${value}`;
      }, { model: mockModel });

      await result.text;
      expect(capturedValue).toBe(42);
      expect(prompt.getState('counter')).toBe(42);
    });

    it('should create state with initial string value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      let capturedValue: any;
      const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
        const [value] = defState('name', 'Alice');
        capturedValue = value;
        $`Name: ${value}`;
      }, { model: mockModel });

      await result.text;
      expect(capturedValue).toBe('Alice');
      expect(prompt.getState('name')).toBe('Alice');
    });

    it('should create state with initial object value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      let capturedValue: any;
      const initialUser = { name: 'Bob', age: 30 };
      
      const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
        const [value] = defState('user', initialUser);
        capturedValue = value;
        $`User: ${value.name}`;
      }, { model: mockModel });

      await result.text;
      expect(capturedValue).toEqual(initialUser);
      expect(prompt.getState('user')).toEqual(initialUser);
    });

    it('should create state with initial array value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      let capturedValue: any;
      const initialTasks = ['task1', 'task2'];
      
      const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
        const [value] = defState('tasks', initialTasks);
        capturedValue = value;
        $`Tasks: ${value.length}`;
      }, { model: mockModel });

      await result.text;
      expect(capturedValue).toEqual(initialTasks);
      expect(prompt.getState('tasks')).toEqual(initialTasks);
    });

    it('should not reinitialize existing state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateValue', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      let firstValue: any;
      let secondValue: any;
      let executionCount = 0;
      
      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [value, setValue] = defState('counter', 0);
        const [execCount, setExecCount] = defState('executionCount', 0);
        
        if (execCount === 0) {
          // First execution
          firstValue = value;
          setExecCount(1);
        } else {
          // Re-execution after tool call
          secondValue = value;
        }

        defTool('updateValue', 'Update the value',
          z.object({}),
          async () => {
            setValue(100);
            return { success: true };
          }
        );

        $`Current value: ${value}`;
      }, { model: mockModel });

      await result.text;
      
      expect(firstValue).toBe(0);
      expect(secondValue).toBe(100); // Should reflect updated value after re-execution
    });
  });

  describe('Direct value updates', () => {
    it('should update primitive state with direct value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('counter', 0);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            setCount(count + 1);
            return { newValue: count + 1 };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('counter')).toBe(1);
    });

    it('should update string state with direct value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'changeName', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [name, setName] = defState('name', 'Alice');

        defTool('changeName', 'Change name',
          z.object({}),
          async () => {
            setName('Bob');
            return { success: true };
          }
        );

        $`Name: ${name}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('name')).toBe('Bob');
    });

    it('should update object state with direct value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateUser', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [user, setUser] = defState('user', { name: 'Alice', age: 25 });

        defTool('updateUser', 'Update user',
          z.object({}),
          async () => {
            setUser({ name: 'Bob', age: 30 });
            return { success: true };
          }
        );

        $`User: ${user.name}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('user')).toEqual({ name: 'Bob', age: 30 });
    });

    it('should update array state with direct value', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateTasks', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [tasks, setTasks] = defState('tasks', ['task1']);

        defTool('updateTasks', 'Update tasks',
          z.object({}),
          async () => {
            setTasks(['task1', 'task2', 'task3']);
            return { success: true };
          }
        );

        $`Tasks: ${tasks.length}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('tasks')).toEqual(['task1', 'task2', 'task3']);
    });
  });

  describe('Functional updater forms', () => {
    it('should update state with function updater for primitives', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('counter', 10);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            setCount(prev => prev + 5);
            return { success: true };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('counter')).toBe(15);
    });

    it('should update state with function updater for objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateAge', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [user, setUser] = defState('user', { name: 'Alice', age: 25 });

        defTool('updateAge', 'Update age',
          z.object({}),
          async () => {
            setUser(prev => ({ ...prev, age: prev.age + 1 }));
            return { success: true };
          }
        );

        $`User: ${user.name}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('user')).toEqual({ name: 'Alice', age: 26 });
    });

    it('should update state with function updater for arrays', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'addTask', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [tasks, setTasks] = defState('tasks', ['task1', 'task2']);

        defTool('addTask', 'Add task',
          z.object({}),
          async () => {
            setTasks(prev => [...prev, 'task3']);
            return { success: true };
          }
        );

        $`Tasks: ${tasks.length}`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getState('tasks')).toEqual(['task1', 'task2', 'task3']);
    });

    it('should handle multiple function updates in sequence', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'doubleIncrement', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('counter', 0);

        defTool('doubleIncrement', 'Increment twice',
          z.object({}),
          async () => {
            setCount(prev => prev + 1);
            setCount(prev => prev + 1);
            return { success: true };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      // Both updates should be applied
      expect(prompt.getState('counter')).toBe(2);
    });
  });

  describe('State continuity across multiple steps/re-executions', () => {
    it('should maintain state across multiple tool calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'call_2', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 3' }
      ]);

      const stateValues: number[] = [];

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('counter', 0);
        stateValues.push(count);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            setCount(prev => prev + 1);
            return { newValue: count + 1 };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      
      // Should have 3 values: initial (0), after first increment (1), after second increment (2)
      expect(stateValues).toEqual([0, 1, 2]);
      expect(prompt.getState('counter')).toBe(2);
    });

    it('should reflect state changes in re-executed prompt function', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updatePhase', args: { phase: 'processing' } },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'call_2', toolName: 'updatePhase', args: { phase: 'completed' } },
        { type: 'text', text: 'Step 3' }
      ]);

      const phaseHistory: string[] = [];

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [phase, setPhase] = defState('phase', 'init');
        phaseHistory.push(phase);

        defTool('updatePhase', 'Update phase',
          z.object({ phase: z.string() }),
          async ({ phase }) => {
            setPhase(phase);
            return { success: true };
          }
        );

        $`Current phase: ${phase}`;
      }, { model: mockModel });

      await result.text;
      
      expect(phaseHistory).toEqual(['init', 'processing', 'completed']);
      expect(prompt.getState('phase')).toBe('completed');
    });

    it('should handle state updates with complex logic across steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'processItem', args: { item: 'A' } },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'call_2', toolName: 'processItem', args: { item: 'B' } },
        { type: 'text', text: 'Step 3' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [processed, setProcessed] = defState('processed', [] as string[]);
        const [count, setCount] = defState('count', 0);

        defTool('processItem', 'Process an item',
          z.object({ item: z.string() }),
          async ({ item }) => {
            setProcessed(prev => [...prev, item]);
            setCount(prev => prev + 1);
            return { processed: item };
          }
        );

        $`Processed ${count} items`;
      }, { model: mockModel });

      await result.text;
      
      expect(prompt.getState('processed')).toEqual(['A', 'B']);
      expect(prompt.getState('count')).toBe(2);
    });
  });

  describe('Complex object updates', () => {
    it('should handle nested object updates', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateAddress', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [user, setUser] = defState('user', {
          name: 'Alice',
          address: { city: 'NYC', zip: '10001' }
        });

        defTool('updateAddress', 'Update address',
          z.object({}),
          async () => {
            setUser(prev => ({
              ...prev,
              address: { ...prev.address, city: 'LA' }
            }));
            return { success: true };
          }
        );

        $`User: ${user.name}`;
      }, { model: mockModel });

      await result.text;
      
      const finalUser = prompt.getState<any>('user');
      expect(finalUser.name).toBe('Alice');
      expect(finalUser.address.city).toBe('LA');
      expect(finalUser.address.zip).toBe('10001');
    });

    it('should handle object with multiple property updates', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateProfile', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [profile, setProfile] = defState('profile', {
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          verified: false
        });

        defTool('updateProfile', 'Update profile',
          z.object({}),
          async () => {
            setProfile(prev => ({
              ...prev,
              age: 26,
              verified: true
            }));
            return { success: true };
          }
        );

        $`Profile: ${profile.name}`;
      }, { model: mockModel });

      await result.text;
      
      const finalProfile = prompt.getState<any>('profile');
      expect(finalProfile).toEqual({
        name: 'Alice',
        age: 26,
        email: 'alice@example.com',
        verified: true
      });
    });
  });

  describe('Complex array updates', () => {
    it('should handle array filtering', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'removeTask', args: { id: 2 } },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [tasks, setTasks] = defState('tasks', [
          { id: 1, name: 'Task 1' },
          { id: 2, name: 'Task 2' },
          { id: 3, name: 'Task 3' }
        ]);

        defTool('removeTask', 'Remove a task',
          z.object({ id: z.number() }),
          async ({ id }) => {
            setTasks(prev => prev.filter(t => t.id !== id));
            return { success: true };
          }
        );

        $`Tasks: ${tasks.length}`;
      }, { model: mockModel });

      await result.text;
      
      const finalTasks = prompt.getState<any>('tasks');
      expect(finalTasks).toHaveLength(2);
      expect(finalTasks.find((t: any) => t.id === 2)).toBeUndefined();
    });

    it('should handle array mapping', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'completeTask', args: { id: 2 } },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [tasks, setTasks] = defState('tasks', [
          { id: 1, name: 'Task 1', done: false },
          { id: 2, name: 'Task 2', done: false }
        ]);

        defTool('completeTask', 'Complete a task',
          z.object({ id: z.number() }),
          async ({ id }) => {
            setTasks(prev => prev.map(t => 
              t.id === id ? { ...t, done: true } : t
            ));
            return { success: true };
          }
        );

        $`Tasks: ${tasks.length}`;
      }, { model: mockModel });

      await result.text;
      
      const finalTasks = prompt.getState<any>('tasks');
      expect(finalTasks[1].done).toBe(true);
      expect(finalTasks[0].done).toBe(false);
    });

    it('should handle array of complex objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'addUser', args: { name: 'Charlie', age: 35 } },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [users, setUsers] = defState('users', [
          { name: 'Alice', age: 25, roles: ['user'] },
          { name: 'Bob', age: 30, roles: ['admin', 'user'] }
        ]);

        defTool('addUser', 'Add a user',
          z.object({ name: z.string(), age: z.number() }),
          async ({ name, age }) => {
            setUsers(prev => [...prev, { name, age, roles: ['user'] }]);
            return { success: true };
          }
        );

        $`Users: ${users.length}`;
      }, { model: mockModel });

      await result.text;
      
      const finalUsers = prompt.getState<any>('users');
      expect(finalUsers).toHaveLength(3);
      expect(finalUsers[2]).toEqual({ name: 'Charlie', age: 35, roles: ['user'] });
    });
  });

  describe('Consistency between defState and getState', () => {
    it('should return same value from defState and getState', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      let defStateValue: any;
      let getStateValue: any;

      const { result, prompt } = await runPrompt(async ({ defState, getState, $ }) => {
        const [value] = defState('counter', 42);
        defStateValue = value;
        getStateValue = getState('counter');
        $`Value: ${value}`;
      }, { model: mockModel });

      await result.text;
      
      expect(defStateValue).toBe(42);
      expect(getStateValue).toBe(42);
      expect(defStateValue).toBe(getStateValue);
    });

    it('should reflect updates in both defState and getState', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const getStateValues: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defState, getState, defTool, $ }) => {
        const [value, setValue] = defState('counter', 0);
        
        // Capture getState value on each execution
        getStateValues.push(getState('counter'));

        defTool('update', 'Update value',
          z.object({}),
          async () => {
            setValue(100);
            return { success: true };
          }
        );

        $`Value: ${value}`;
      }, { model: mockModel });

      await result.text;
      
      // getState should reflect the same values as defState
      expect(getStateValues).toEqual([0, 100]);
      expect(prompt.getState('counter')).toBe(100);
    });

    it('should work with getState for non-existent keys', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      let getStateValue: any;

      const { result } = await runPrompt(async ({ getState, $ }) => {
        getStateValue = getState('nonExistent');
        $`Hello`;
      }, { model: mockModel });

      await result.text;
      
      expect(getStateValue).toBeUndefined();
    });
  });

  describe('Edge cases: stale closures and updater ordering', () => {
    it('should handle stale closure scenario correctly', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('counter', 0);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            // This closure captures the current count value at tool definition time
            // Using direct value update with captured count could be stale
            const capturedCount = count;
            setCount(capturedCount + 1);
            return { capturedValue: capturedCount };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      
      // Even though the closure captures a stale value, the update should work
      // because we're using the captured value + 1
      expect(prompt.getState('counter')).toBe(1);
    });

    it('should prefer function updater to avoid stale closures', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('counter', 0);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            // Function updater always gets the latest value
            setCount(prev => prev + 1);
            return { success: true };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      
      expect(prompt.getState('counter')).toBe(1);
    });

    it('should apply updates in order of setter calls', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'multiUpdate', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [value, setValue] = defState('value', 0);

        defTool('multiUpdate', 'Multiple updates',
          z.object({}),
          async () => {
            setValue(10);
            setValue(prev => prev + 5);
            setValue(prev => prev * 2);
            return { success: true };
          }
        );

        $`Value: ${value}`;
      }, { model: mockModel });

      await result.text;
      
      // Should apply in order: 10, then +5 (15), then *2 (30)
      expect(prompt.getState('value')).toBe(30);
    });

    it('should handle re-execution with effects that depend on state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const effectExecutions: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [count, setCount] = defState('counter', 0);

        defEffect((context) => {
          effectExecutions.push({
            stepNumber: context.stepNumber,
            countValue: count
          });
        }, [count]);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            setCount(prev => prev + 1);
            return { success: true };
          }
        );

        $`Count: ${count}`;
      }, { model: mockModel });

      await result.text;
      
      // Effect should run on initial execution and after count changes
      expect(effectExecutions.length).toBeGreaterThan(0);
      // First execution should see count = 0
      expect(effectExecutions[0].countValue).toBe(0);
      // After tool call, should see count = 1
      const lastExecution = effectExecutions[effectExecutions.length - 1];
      expect(lastExecution.countValue).toBe(1);
    });

    it('should handle multiple state variables with interdependencies', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'processData', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [data, setData] = defState('data', [] as number[]);
        const [sum, setSum] = defState('sum', 0);
        const [count, setCount] = defState('count', 0);

        defTool('processData', 'Process data',
          z.object({}),
          async () => {
            const newData = [...data, 10, 20, 30];
            const newSum = newData.reduce((a, b) => a + b, 0);
            const newCount = newData.length;
            
            setData(newData);
            setSum(newSum);
            setCount(newCount);
            
            return { success: true };
          }
        );

        $`Data count: ${count}, sum: ${sum}`;
      }, { model: mockModel });

      await result.text;
      
      expect(prompt.getState('data')).toEqual([10, 20, 30]);
      expect(prompt.getState('sum')).toBe(60);
      expect(prompt.getState('count')).toBe(3);
    });
  });

  describe('Mutation safety', () => {
    it('should not mutate original state object when using direct update', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateUser', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const originalUser = { name: 'Alice', age: 25 };
      let capturedInitialUser: any;

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [user, setUser] = defState('user', originalUser);
        
        if (!capturedInitialUser) {
          capturedInitialUser = { ...user };
        }

        defTool('updateUser', 'Update user',
          z.object({}),
          async () => {
            // Update with spread to avoid mutation
            setUser({ ...user, age: 30 });
            return { success: true };
          }
        );

        $`User: ${user.name}`;
      }, { model: mockModel });

      await result.text;
      
      // Original object should not be mutated
      expect(originalUser).toEqual({ name: 'Alice', age: 25 });
      // State should have the updated value
      expect(prompt.getState('user')).toEqual({ name: 'Alice', age: 30 });
    });

    it('should not mutate original state array when using direct update', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'addTask', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const originalTasks = ['task1', 'task2'];

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [tasks, setTasks] = defState('tasks', originalTasks);

        defTool('addTask', 'Add task',
          z.object({}),
          async () => {
            // Update with spread to avoid mutation
            setTasks([...tasks, 'task3']);
            return { success: true };
          }
        );

        $`Tasks: ${tasks.length}`;
      }, { model: mockModel });

      await result.text;
      
      // Original array should not be mutated
      expect(originalTasks).toEqual(['task1', 'task2']);
      // State should have the updated value
      expect(prompt.getState('tasks')).toEqual(['task1', 'task2', 'task3']);
    });

    it('should handle function updater with immutable pattern for objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'updateNested', args: {} },
        { type: 'text', text: 'Step 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [config, setConfig] = defState('config', {
          user: { name: 'Alice', preferences: { theme: 'dark' } }
        });

        defTool('updateNested', 'Update nested property',
          z.object({}),
          async () => {
            setConfig(prev => ({
              ...prev,
              user: {
                ...prev.user,
                preferences: {
                  ...prev.user.preferences,
                  theme: 'light'
                }
              }
            }));
            return { success: true };
          }
        );

        $`Config`;
      }, { model: mockModel });

      await result.text;
      
      const finalConfig = prompt.getState<any>('config');
      expect(finalConfig.user.preferences.theme).toBe('light');
      expect(finalConfig.user.name).toBe('Alice');
    });
  });

  describe('Deterministic behavior', () => {
    it('should produce deterministic results across multiple runs with same mock', async () => {
      const getMockModel = () => createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'process', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const runTest = async () => {
        const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
          const [count, setCount] = defState('counter', 0);
          const [items, setItems] = defState('items', [] as string[]);

          defTool('process', 'Process',
            z.object({}),
            async () => {
              setCount(prev => prev + 1);
              setItems(prev => [...prev, 'item']);
              return { success: true };
            }
          );

          $`Processing`;
        }, { model: getMockModel() });

        await result.text;
        return {
          count: prompt.getState('counter'),
          items: prompt.getState('items')
        };
      };

      // Run multiple times
      const results = await Promise.all([runTest(), runTest(), runTest()]);

      // All runs should produce same results
      results.forEach(result => {
        expect(result.count).toBe(1);
        expect(result.items).toEqual(['item']);
      });
    });

    it('should maintain consistent state across re-executions', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'step1', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'call_2', toolName: 'step2', args: {} },
        { type: 'text', text: 'Step 3' },
        { type: 'tool-call', toolCallId: 'call_3', toolName: 'step3', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const executionLog: any[] = [];

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [counter, setCounter] = defState('counter', 0);
        
        executionLog.push({ execution: executionLog.length + 1, counter });

        defTool('step1', 'Step 1', z.object({}), async () => {
          setCounter(1);
          return { step: 1 };
        });

        defTool('step2', 'Step 2', z.object({}), async () => {
          setCounter(2);
          return { step: 2 };
        });

        defTool('step3', 'Step 3', z.object({}), async () => {
          setCounter(3);
          return { step: 3 };
        });

        $`Execute steps`;
      }, { model: mockModel });

      await result.text;

      // Verify the execution log shows consistent state progression
      expect(executionLog[0].counter).toBe(0); // Initial
      expect(executionLog[1].counter).toBe(1); // After step1
      expect(executionLog[2].counter).toBe(2); // After step2
      expect(executionLog[3].counter).toBe(3); // After step3
      expect(prompt.getState('counter')).toBe(3); // Final state
    });
  });
});
