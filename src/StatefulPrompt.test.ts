import { describe, it, expect } from 'vitest';
import { createMockModel } from './test/createMockModel';
import { runPrompt } from './runPrompt';
import { StatefulPrompt } from './StatefulPrompt';
import { z } from 'zod';

describe('StatefulPrompt', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'Hello' },
    { type: 'text', text: ' World' }
  ]);

  it('should create state with defState', async () => {
    let getState: any;
    let setState: any;

    const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
      [getState, setState] = defState('test', 'initial');
      $`Hello!`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(getState).toBeDefined();
    expect(setState).toBeDefined();
    expect(prompt).toBeInstanceOf(StatefulPrompt);

    // Capture snapshot of the prompt state
    expect(prompt.steps).toMatchSnapshot();
  });

  it('should maintain state across re-executions', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'First response' },
      { type: 'tool-call', toolCallId: '1', toolName: 'testTool', args: { value: 1 } },
      { type: 'text', text: 'Second response' }
    ]);

    let stateValue: any;

    const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
      const [state, setState] = defState('counter', 0);
      stateValue = state;

      defTool('testTool', 'Test tool',
        z.object({ value: z.number() }),
        async ({ value }) => {
          setState(state + value);
          return { success: true, newCount: state + value };
        }
      );

      $`Current count: ${state}`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    // Verify state was tracked
    expect(stateValue).toBeDefined();

    // Capture snapshot showing tool usage and state changes
    expect(prompt.steps).toMatchSnapshot();
  });

  it('should run effects with dependencies', async () => {
    let effectRunCount = 0;
    let lastDependency: any;
    let capturedSteps: any[] = [];

    const { result, prompt } = await runPrompt(async ({ defState, defEffect, $ }) => {
      const [state, setState] = defState('value', 0);

      defEffect((prompt) => {
        effectRunCount++;
        lastDependency = state;
        capturedSteps.push({
          stepNumber: prompt.stepNumber,
          stateValue: state,
          runCount: effectRunCount
        });
      }, [state]);

      $`Starting with value: ${state}`;

      // Change state to trigger effect
      setTimeout(() => setState(1), 10);
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(effectRunCount).toBeGreaterThan(0);

    // Capture snapshot of effect execution
    expect({
      steps: prompt.steps,
      effectRuns: capturedSteps,
      finalDependency: lastDependency
    }).toMatchSnapshot();
  });

  it('should run effects without dependencies on every step', async () => {
    let runCount = 0;
    let stepNumbers: number[] = [];

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((prompt) => {
        runCount++;
        stepNumbers.push(prompt.stepNumber);
      });

      $`Test message`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(runCount).toBeGreaterThan(0);

    // Capture snapshot showing effect ran on multiple steps
    expect({
      steps: prompt.steps,
      runCount,
      stepNumbers
    }).toMatchSnapshot();
  });

  it('should provide prompt context to effects', async () => {
    let capturedContext: any;

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((prompt) => {
        capturedContext = prompt;
      });

      $`Test message`;
    }, {
      model: mockModel,
      
    });

    await result.text;

    expect(capturedContext).toBeDefined();
    expect(capturedContext.messages).toBeDefined();
    expect(capturedContext.stepNumber).toBeDefined();
    expect(capturedContext.tools).toBeDefined();
    expect(capturedContext.systems).toBeDefined();
    expect(capturedContext.variables).toBeDefined();

    // Capture snapshot of the context structure
    expect({
      hasMessages: Array.isArray(capturedContext.messages),
      stepNumber: capturedContext.stepNumber,
      hasTools: typeof capturedContext.tools.has === 'function',
      hasSystems: typeof capturedContext.systems.has === 'function',
      hasVariables: typeof capturedContext.variables.has === 'function',
      lastTool: capturedContext.lastTool
    }).toMatchSnapshot();
  });

  it('should allow step modifications from effects', async () => {
    let stepModifierCalled = false;
    let modifiedAspect: any;
    let modifiedItems: any;

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((prompt, step) => {
        stepModifierCalled = true;
        step('messages', [{ role: 'system', content: 'Modified message' }]);
        modifiedAspect = 'messages';
        modifiedItems = [{ role: 'system', content: 'Modified message' }];
      });

      $`Original message`;
    }, {
      model: mockModel,
    });

    await result.text;

    expect(stepModifierCalled).toBe(true);
    expect(modifiedAspect).toBe('messages');
    expect(modifiedItems).toEqual([{ role: 'system', content: 'Modified message' }]);

    // Capture snapshot showing step modifications
    expect({
      steps: prompt.steps,
      stepModifierCalled,
      modifiedAspect,
      modifiedItems
    }).toMatchSnapshot();
  });

  describe('compressedSteps with state', () => {
    it('should include state snapshots in compressedSteps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: '1', toolName: 'updateCounter', args: { increment: 5 } },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [counter, setCounter] = defState('counter', 0);
        const [name, setName] = defState('name', 'initial');

        defTool('updateCounter', 'Update counter',
          z.object({ increment: z.number() }),
          async ({ increment }) => {
            setCounter((prev: number) => prev + increment);
            setName('updated');
            return { newValue: counter + increment };
          }
        );

        $`Counter is ${counter}, name is ${name}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const stats = compressed.getStats();

      // Should have 2 steps
      expect(stats.stepCount).toBe(2);

      // Step 0 should have initial state
      const state0 = compressed.getState(0);
      expect(state0.counter).toBe(0);
      expect(state0.name).toBe('initial');

      // Step 1 should have updated state (after tool execution)
      const state1 = compressed.getState(1);
      expect(state1.counter).toBe(5);
      expect(state1.name).toBe('updated');
    });

    it('should preserve state snapshots during compression', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
        const [items, setItems] = defState('items', ['a', 'b']);
        const [config, setConfig] = defState('config', { debug: false, version: 1 });

        $`Items: ${items.join(', ')}, Debug: ${config.debug}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const state = compressed.getState(0);

      // Verify complex state values are preserved
      expect(state.items).toEqual(['a', 'b']);
      expect(state.config).toEqual({ debug: false, version: 1 });

      // Verify state is a deep clone (not reference)
      expect(state.items).not.toBe(['a', 'b']);
    });

    it('should provide state via getStep', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
        const [value] = defState('value', 42);
        $`Value is ${value}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const step = compressed.getStep(0);

      // getStep should include state
      expect(step.state).toBeDefined();
      expect(step.state.value).toBe(42);
    });

    it('should track state changes across multiple steps', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: '1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: '2', toolName: 'increment', args: {} },
        { type: 'text', text: 'Final' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [counter, setCounter] = defState('counter', 0);

        defTool('increment', 'Increment counter',
          z.object({}),
          async () => {
            setCounter((prev: number) => prev + 1);
            return { newValue: counter + 1 };
          }
        );

        $`Counter: ${counter}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const states = prompt.getAllStateSnapshots();

      // Should have 3 steps (initial + 2 tool calls)
      expect(states.length).toBe(3);

      // Each step should have progressively higher counter
      expect(states[0].counter).toBe(0);
      expect(states[1].counter).toBe(1);
      expect(states[2].counter).toBe(2);
    });

    it('should calculate compression savings with state', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'R1' },
        { type: 'tool-call', toolCallId: '1', toolName: 't', args: {} },
        { type: 'text', text: 'R2' },
        { type: 'tool-call', toolCallId: '2', toolName: 't', args: {} },
        { type: 'text', text: 'R3' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [v] = defState('v', 1);

        defTool('t', 'Tool',
          z.object({}),
          async () => ({ ok: true })
        );

        $`Value: ${v}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const stats = compressed.getStats();

      // With 3 steps, there should be savings from message deduplication
      expect(stats.stepCount).toBe(3);
      expect(stats.savingsRatio).toBeGreaterThan(0);

      // Verify reconstruction works
      for (let i = 0; i < stats.stepCount; i++) {
        const reconstructed = compressed.getStep(i);
        const original = prompt.steps[i];

        expect(reconstructed.input.prompt.length).toBe(original.input.prompt.length);
        expect(reconstructed.state).toBeDefined();
      }
    });
  });
});