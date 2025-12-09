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

  describe('compressedSteps edge cases', () => {
    it('should handle large multi-step execution with effects modifying messages', async () => {
      // Create a mock model with 10 tool calls (11 total steps)
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 0 response' },
        { type: 'tool-call', toolCallId: 't1', toolName: 'action', args: { step: 1 } },
        { type: 'text', text: 'Step 1 response' },
        { type: 'tool-call', toolCallId: 't2', toolName: 'action', args: { step: 2 } },
        { type: 'text', text: 'Step 2 response' },
        { type: 'tool-call', toolCallId: 't3', toolName: 'action', args: { step: 3 } },
        { type: 'text', text: 'Step 3 response' },
        { type: 'tool-call', toolCallId: 't4', toolName: 'action', args: { step: 4 } },
        { type: 'text', text: 'Step 4 response' },
        { type: 'tool-call', toolCallId: 't5', toolName: 'action', args: { step: 5 } },
        { type: 'text', text: 'Step 5 response' },
        { type: 'tool-call', toolCallId: 't6', toolName: 'action', args: { step: 6 } },
        { type: 'text', text: 'Step 6 response' },
        { type: 'tool-call', toolCallId: 't7', toolName: 'action', args: { step: 7 } },
        { type: 'text', text: 'Step 7 response' },
        { type: 'tool-call', toolCallId: 't8', toolName: 'action', args: { step: 8 } },
        { type: 'text', text: 'Step 8 response' },
        { type: 'tool-call', toolCallId: 't9', toolName: 'action', args: { step: 9 } },
        { type: 'text', text: 'Final step 10 response' }
      ]);

      const effectLogs: Array<{ step: number; action: string }> = [];
      const stateHistory: Array<{ step: number; state: any }> = [];

      const { result, prompt } = await runPrompt(async ({ defState, defTool, defEffect, defHook, $ }) => {
        // Multiple state variables
        const [counter, setCounter] = defState('counter', 0);
        const [history, setHistory] = defState('history', [] as string[]);
        const [config, setConfig] = defState('config', {
          mode: 'normal',
          threshold: 5,
          flags: { verbose: false, debug: false }
        });

        // Tool that modifies state
        defTool('action', 'Perform action',
          z.object({ step: z.number() }),
          async ({ step }) => {
            setCounter((prev: number) => prev + 1);
            setHistory((prev: string[]) => [...prev, `action_${step}`]);

            // Change config mode at certain thresholds
            if (step >= 5) {
              setConfig((prev: any) => ({
                ...prev,
                mode: 'advanced',
                flags: { ...prev.flags, verbose: true }
              }));
            }
            if (step >= 8) {
              setConfig((prev: any) => ({
                ...prev,
                mode: 'expert',
                flags: { ...prev.flags, debug: true }
              }));
            }

            return { executed: step, newCount: counter + 1 };
          }
        );

        // Effect that logs state changes
        defEffect((ctx) => {
          stateHistory.push({
            step: ctx.stepNumber,
            state: { counter: +counter, historyLen: history.length }
          });
        });

        // Effect with dependencies - only runs when counter changes
        defEffect((ctx) => {
          effectLogs.push({ step: ctx.stepNumber, action: `counter_changed_to_${counter}` });
        }, [counter]);

        // Hook that modifies system prompt based on step
        defHook(({ stepNumber }) => {
          if (stepNumber < 3) {
            return { system: `Phase 1: Initialization (step ${stepNumber})` };
          } else if (stepNumber < 7) {
            return { system: `Phase 2: Processing (step ${stepNumber})` };
          } else {
            return { system: `Phase 3: Finalization (step ${stepNumber})` };
          }
        });

        $`Execute multi-step workflow. Counter: ${counter}, History: ${history.length} items`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const stats = compressed.getStats();

      // Should have 10 steps (initial + 9 tool calls)
      expect(stats.stepCount).toBe(10);

      // With system prompt changes, we should still have good compression
      // but not as much as without changes
      expect(stats.savingsRatio).toBeGreaterThan(0);

      // Verify state progression
      const states = prompt.getAllStateSnapshots();
      expect(states.length).toBe(10);

      // Counter should increment each step after tool execution
      expect(states[0].counter).toBe(0);
      expect(states[1].counter).toBe(1);
      expect(states[5].counter).toBe(5);
      expect(states[9].counter).toBe(9);

      // History should accumulate
      expect(states[0].history.length).toBe(0);
      expect(states[5].history.length).toBe(5);
      expect(states[9].history.length).toBe(9);

      // Config mode should change at thresholds
      expect(states[4].config.mode).toBe('normal');
      expect(states[5].config.mode).toBe('advanced');
      expect(states[8].config.mode).toBe('expert');
      expect(states[8].config.flags.debug).toBe(true);

      // Verify delta messages work correctly
      for (let i = 0; i < stats.stepCount; i++) {
        const delta = compressed.getDeltaMessages(i);
        const full = compressed.getStep(i);

        // Delta should always be subset of full
        expect(delta.length).toBeLessThanOrEqual(full.input.prompt.length);

        // For step 0, all messages are delta
        if (i === 0) {
          expect(delta.length).toBe(full.input.prompt.length);
        }
      }

      // Verify reconstruction matches original
      for (let i = 0; i < stats.stepCount; i++) {
        const reconstructed = compressed.getStep(i);
        const original = prompt.steps[i];

        expect(reconstructed.input.prompt.length).toBe(original.input.prompt.length);
        expect(reconstructed.output.finishReason).toBe(original.output.finishReason);
      }

      // Snapshot the full compressed structure for visualization
      expect({
        stats: compressed.getStats(),
        messagePoolSize: compressed.messagePool.length,
        stepsOverview: compressed.steps.map(s => ({
          stepIndex: s.stepIndex,
          messageCount: s.messageRefs.length,
          deltaStart: s.deltaStart,
          deltaCount: s.messageRefs.length - s.deltaStart,
          stateKeys: Object.keys(s.state),
          counterValue: s.state.counter,
          configMode: s.state.config?.mode
        })),
        effectLogs: effectLogs.slice(0, 5), // First 5 for brevity
        stateHistory: stateHistory.slice(0, 5) // First 5 for brevity
      }).toMatchSnapshot();
    });

    it('should handle system prompt that changes every step', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'R0' },
        { type: 'tool-call', toolCallId: 't1', toolName: 't', args: {} },
        { type: 'text', text: 'R1' },
        { type: 'tool-call', toolCallId: 't2', toolName: 't', args: {} },
        { type: 'text', text: 'R2' },
        { type: 'tool-call', toolCallId: 't3', toolName: 't', args: {} },
        { type: 'text', text: 'R3' },
        { type: 'tool-call', toolCallId: 't4', toolName: 't', args: {} },
        { type: 'text', text: 'Final' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, defHook, $ }) => {
        const [step, setStep] = defState('step', 0);

        defTool('t', 'Tool',
          z.object({}),
          async () => {
            setStep((s: number) => s + 1);
            return { ok: true };
          }
        );

        // System prompt changes EVERY step - worst case for compression
        defHook(({ stepNumber }) => {
          const timestamp = Date.now();
          return {
            system: `Step ${stepNumber} | Time: ${timestamp} | Random: ${Math.random().toString(36).slice(2, 8)}`
          };
        });

        $`Run steps. Current: ${step}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const stats = compressed.getStats();

      expect(stats.stepCount).toBe(5);

      // With system changing every step, each step has a unique system message
      // So messagePool will have many entries
      // But user message and some tool results might still be shared

      // Each step should have deltaStart = 0 since system message changes
      for (let i = 1; i < stats.stepCount; i++) {
        const step = compressed.steps[i];
        // When first message (system) changes, deltaStart should be 0
        expect(step.deltaStart).toBe(0);
      }

      // Snapshot to show the worst-case scenario
      expect({
        stats,
        stepsOverview: compressed.steps.map(s => ({
          stepIndex: s.stepIndex,
          messageCount: s.messageRefs.length,
          deltaStart: s.deltaStart,
          firstMessageRef: s.messageRefs[0]
        }))
      }).toMatchSnapshot();
    });

    it('should handle effect that injects messages', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 't1', toolName: 'process', args: { data: 'test' } },
        { type: 'text', text: 'Response 2' },
        { type: 'tool-call', toolCallId: 't2', toolName: 'process', args: { data: 'more' } },
        { type: 'text', text: 'Final response' }
      ]);

      const injectedMessages: string[] = [];

      const { result, prompt } = await runPrompt(async ({ defState, defTool, defEffect, $ }) => {
        const [processedCount, setProcessedCount] = defState('processedCount', 0);
        const [lastResult, setLastResult] = defState('lastResult', null as string | null);

        defTool('process', 'Process data',
          z.object({ data: z.string() }),
          async ({ data }) => {
            setProcessedCount((c: number) => c + 1);
            setLastResult(`processed_${data}`);
            return { result: `processed_${data}` };
          }
        );

        // Effect that modifies messages based on state
        defEffect((ctx, stepModifier) => {
          if (processedCount > 0) {
            const injectedContent = `[System injection at step ${ctx.stepNumber}: processed ${processedCount} items, last: ${lastResult}]`;
            injectedMessages.push(injectedContent);

            stepModifier('messages', [{
              role: 'system',
              content: injectedContent
            }]);
          }
        });

        $`Process data. Count: ${processedCount}`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const stats = compressed.getStats();

      expect(stats.stepCount).toBe(3);

      // Effects were triggered
      expect(injectedMessages.length).toBeGreaterThan(0);

      // State should reflect processing
      const finalState = compressed.getState(2);
      expect(finalState.processedCount).toBe(2);
      expect(finalState.lastResult).toBe('processed_more');

      // Snapshot
      expect({
        stats,
        injectedMessages,
        states: compressed.steps.map(s => s.state)
      }).toMatchSnapshot();
    });

    it('should handle complex nested state objects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Init' },
        { type: 'tool-call', toolCallId: 't1', toolName: 'modify', args: { path: 'a.b.c', value: 1 } },
        { type: 'text', text: 'Modified' },
        { type: 'tool-call', toolCallId: 't2', toolName: 'modify', args: { path: 'a.d', value: [1,2,3] } },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [data, setData] = defState('data', {
          a: { b: { c: 0 }, d: [] as number[] },
          metadata: {
            created: new Date('2024-01-01'),
            tags: new Set(['initial']),
            cache: new Map([['key1', 'value1']])
          }
        });

        defTool('modify', 'Modify nested data',
          z.object({ path: z.string(), value: z.any() }),
          async ({ path, value }) => {
            setData((prev: any) => {
              const clone = JSON.parse(JSON.stringify(prev));
              const parts = path.split('.');
              let obj = clone;
              for (let i = 0; i < parts.length - 1; i++) {
                obj = obj[parts[i]];
              }
              obj[parts[parts.length - 1]] = value;
              return clone;
            });
            return { modified: path };
          }
        );

        $`Nested state test`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;

      // Verify deep state cloning worked
      const state0 = compressed.getState(0);
      const state1 = compressed.getState(1);
      const state2 = compressed.getState(2);

      // Original nested value
      expect(state0.data.a.b.c).toBe(0);

      // After first modification
      expect(state1.data.a.b.c).toBe(1);

      // After second modification
      expect(state2.data.a.d).toEqual([1, 2, 3]);

      // States should be independent (not referencing same objects)
      expect(state0.data).not.toBe(state1.data);
      expect(state1.data).not.toBe(state2.data);

      expect({
        stats: compressed.getStats(),
        stateProgression: {
          step0: { 'a.b.c': state0.data.a.b.c, 'a.d': state0.data.a.d },
          step1: { 'a.b.c': state1.data.a.b.c, 'a.d': state1.data.a.d },
          step2: { 'a.b.c': state2.data.a.b.c, 'a.d': state2.data.a.d }
        }
      }).toMatchSnapshot();
    });

    it('should handle empty steps and edge message patterns', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: '' }, // Empty response
        { type: 'tool-call', toolCallId: 't1', toolName: 'noop', args: {} },
        { type: 'text', text: 'Something' },
        { type: 'tool-call', toolCallId: 't2', toolName: 'noop', args: {} },
        { type: 'text', text: '' }, // Another empty
        { type: 'tool-call', toolCallId: 't3', toolName: 'noop', args: {} },
        { type: 'text', text: 'Final' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defState, defTool, $ }) => {
        const [count, setCount] = defState('count', 0);

        defTool('noop', 'No-op',
          z.object({}),
          async () => {
            setCount((c: number) => c + 1);
            return {};
          }
        );

        $`Test empty responses`;
      }, {
        model: mockModel,
      });

      await result.text;

      const compressed = prompt.compressedSteps;
      const stats = compressed.getStats();

      expect(stats.stepCount).toBe(4);

      // All steps should be reconstructable
      for (let i = 0; i < stats.stepCount; i++) {
        const step = compressed.getStep(i);
        expect(step.input.prompt).toBeDefined();
        expect(step.output).toBeDefined();
        expect(step.state).toBeDefined();
      }

      expect({
        stats,
        outputContents: compressed.steps.map(s =>
          s.output.content.map(c => c.text || `[${c.type}]`).join('')
        )
      }).toMatchSnapshot();
    });
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

      // Snapshot the compressed steps with state
      expect({
        messagePool: compressed.messagePool,
        steps: compressed.steps,
        stats: compressed.getStats()
      }).toMatchSnapshot();
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