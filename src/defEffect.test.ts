import { describe, it, expect, vi } from 'vitest';
import { runPrompt } from './runPrompt';
import { createMockModel } from './test/createMockModel';
import { z } from 'zod';
import { tool } from './StatefulPrompt';

describe('defEffect()', () => {
  describe('Effects without dependencies', () => {
    it('runs on every step', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'worker', args: {} },
        { type: 'text', text: 'Step 3' }
      ]);

      const effectFn = vi.fn();
      const toolFn = vi.fn().mockResolvedValue({ ok: true });

      const { result, prompt } = await runPrompt(async ({ defEffect, defTool, $ }) => {
        defEffect((ctx, step) => {
          effectFn(ctx.stepNumber);
        }); // No dependencies - runs every step

        defTool('worker', 'A worker tool', z.object({}), toolFn);
        $`Do work`;
      }, { model: mockModel });

      await result.text;

      // Effect should run on every step (0, 1, 2)
      expect(effectFn).toHaveBeenCalledTimes(3);
      expect(effectFn).toHaveBeenCalledWith(0);
      expect(effectFn).toHaveBeenCalledWith(1);
      expect(effectFn).toHaveBeenCalledWith(2);
    });

    it('runs on first step even with empty dependencies array', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const effectFn = vi.fn();

      const { result } = await runPrompt(async ({ defEffect, $ }) => {
        defEffect((ctx) => {
          effectFn(ctx.stepNumber);
        }, []); // Empty dependencies

        $`Do work`;
      }, { model: mockModel });

      await result.text;

      // Should run once on first step
      expect(effectFn).toHaveBeenCalledTimes(1);
      expect(effectFn).toHaveBeenCalledWith(0);
    });
  });

  describe('Effects with dependencies', () => {
    it('runs when dependency value changes', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'increment', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'increment', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const effectFn = vi.fn();

      const { result, prompt } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [count, setCount] = defState('count', 0);

        defEffect((ctx) => {
          effectFn(ctx.stepNumber, count);
        }, [count]); // Depends on count

        defTool('increment', 'Increment counter', z.object({}), async () => {
          setCount(prev => prev + 1);
          return { ok: true };
        });

        $`Increment twice`;
      }, { model: mockModel });

      await result.text;

      // Effect should run on each step because count changes
      expect(effectFn).toHaveBeenCalledTimes(3);
      expect(effectFn.mock.calls[0][1]).toBe(0); // Initial value
      expect(effectFn.mock.calls[1][1]).toBe(1); // After first increment
      expect(effectFn.mock.calls[2][1]).toBe(2); // After second increment
    });

    it('does not run when dependency value stays the same', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'noop', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'noop', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const effectFn = vi.fn();

      const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [value] = defState('value', 'constant');

        defEffect((ctx) => {
          effectFn(ctx.stepNumber);
        }, [value]); // Depends on value (which never changes)

        defTool('noop', 'Do nothing', z.object({}), async () => ({ ok: true }));

        $`Do work`;
      }, { model: mockModel });

      await result.text;

      // Effect should only run on first step (dependency doesn't change)
      expect(effectFn).toHaveBeenCalledTimes(1);
      expect(effectFn).toHaveBeenCalledWith(0);
    });

    it('handles multiple dependencies correctly', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'updateA', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'updateB', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const effectFn = vi.fn();

      const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [a, setA] = defState('a', 1);
        const [b, setB] = defState('b', 1);

        defEffect((ctx) => {
          effectFn(ctx.stepNumber, a, b);
        }, [a, b]); // Depends on both

        defTool('updateA', 'Update A', z.object({}), async () => {
          setA(prev => prev + 1);
          return { ok: true };
        });

        defTool('updateB', 'Update B', z.object({}), async () => {
          setB(prev => prev + 1);
          return { ok: true };
        });

        $`Update values`;
      }, { model: mockModel });

      await result.text;

      // Effect runs on initial step and when either dependency changes
      expect(effectFn).toHaveBeenCalledTimes(3);
      expect(effectFn.mock.calls[0]).toEqual([0, 1, 1]); // Initial
      expect(effectFn.mock.calls[1]).toEqual([1, 2, 1]); // A changed
      expect(effectFn.mock.calls[2]).toEqual([2, 2, 2]); // B changed
    });

    it('handles primitive dependency changes', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'toggle', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const effectFn = vi.fn();

      const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [flag, setFlag] = defState('flag', false);

        defEffect((ctx) => {
          effectFn(flag);
        }, [flag]);

        defTool('toggle', 'Toggle flag', z.object({}), async () => {
          setFlag(prev => !prev);
          return { ok: true };
        });

        $`Toggle`;
      }, { model: mockModel });

      await result.text;

      expect(effectFn).toHaveBeenCalledTimes(2);
      expect(effectFn.mock.calls[0][0]).toBe(false);
      expect(effectFn.mock.calls[1][0]).toBe(true);
    });
  });

  describe('Step modifier functionality', () => {
    it('adds messages via step modifier', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'trigger', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defEffect, defTool, $ }) => {
        defEffect((ctx, step) => {
          if (ctx.stepNumber === 1) {
            step('messages', [{ role: 'user', content: 'Additional context' }]);
          }
        });

        defTool('trigger', 'Trigger', z.object({}), async () => ({ ok: true }));
        $`Work`;
      }, { model: mockModel });

      await result.text;

      // Check that message was added in step 1
      const step1 = prompt.steps[1];
      const messages = step1.input.prompt;
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.role).toBe('user');
      const content = typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : lastMessage.content[0].text;
      expect(content).toContain('Additional context');
    });

    it('modifies systems via step modifier', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'trigger', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defEffect, defSystem, defTool, $ }) => {
        defSystem('role', 'You are helpful');
        defSystem('extra', 'Additional instructions');

        defEffect((ctx, step) => {
          if (ctx.stepNumber === 1) {
            // Filter to only include 'role' system
            const roleSystem = Array.from(ctx.systems).find(s => s.name === 'role');
            if (roleSystem) {
              step('systems', [roleSystem]);
            }
          }
        });

        defTool('trigger', 'Trigger', z.object({}), async () => ({ ok: true }));
        $`Work`;
      }, { model: mockModel });

      await result.text;

      // Step 0 should have both systems
      const step0System = prompt.steps[0].input.prompt.find((m: any) => m.role === 'system');
      expect(step0System).toBeDefined();
      if (step0System) {
        expect(step0System.content).toContain('<role>');
        expect(step0System.content).toContain('<extra>');
      }

      // Step 1 should only have 'role' system (filtered by effect)
      const step1System = prompt.steps[1].input.prompt.find((m: any) => m.role === 'system');
      expect(step1System).toBeDefined();
      if (step1System) {
        expect(step1System.content).toContain('<role>');
        expect(step1System.content).not.toContain('<extra>');
      }
    });

    it('modifies variables via step modifier', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'trigger', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defEffect, def, defTool, $ }) => {
        def('NAME', 'Alice');

        defEffect((ctx, step) => {
          if (ctx.stepNumber === 1) {
            // Add a new variable
            step('variables', [{ name: 'EXTRA', type: 'string', value: 'Extra value' }]);
          }
        });

        defTool('trigger', 'Trigger', z.object({}), async () => ({ ok: true }));
        $`Work`;
      }, { model: mockModel });

      await result.text;

      // Step 1 should have the extra variable
      const step1System = prompt.steps[1].input.prompt.find((m: any) => m.role === 'system');
      expect(step1System).toBeDefined();
      if (step1System) {
        expect(step1System.content).toContain('<NAME>');
        expect(step1System.content).toContain('<EXTRA>');
      }
    });
  });

  describe('Interaction with definitions', () => {
    it('disables definitions via effects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defEffect, def, defTool, $ }) => {
        const name = def('NAME', 'Alice');
        const age = def('AGE', '30');

        defEffect((ctx) => {
          if (ctx.stepNumber === 1) {
            name.disable(); // Remove NAME from step 1
          }
        });

        defTool('worker', 'Worker', z.object({}), async () => ({ ok: true }));
        $`Work`;
      }, { model: mockModel });

      await result.text;

      // Step 0 should have both variables
      const step0System = prompt.steps[0].input.prompt.find((m: any) => m.role === 'system');
      expect(step0System?.content).toContain('<NAME>');
      expect(step0System?.content).toContain('<AGE>');

      // Step 1 should only have AGE (NAME disabled)
      const step1System = prompt.steps[1].input.prompt.find((m: any) => m.role === 'system');
      expect(step1System?.content).not.toContain('<NAME>');
      expect(step1System?.content).toContain('<AGE>');
    });

    it('reminds about definitions via effects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defEffect, defTool, $ }) => {
        const tool1 = defTool('tool1', 'Tool 1', z.object({}), async () => ({ ok: true }));
        const tool2 = defTool('worker', 'Worker', z.object({}), async () => ({ ok: true }));

        defEffect((ctx) => {
          if (ctx.stepNumber === 1) {
            tool1.remind(); // Remind about tool1
          }
        });

        $`Work`;
      }, { model: mockModel });

      await result.text;

      // Step 1 should have a reminder about tool1
      const step1Messages = prompt.steps[1].input.prompt;
      const reminderMsg = step1Messages.find((m: any) => 
        m.role === 'assistant' && 
        (typeof m.content === 'string' ? m.content : m.content[0]?.text)?.includes('Reminder')
      );
      expect(reminderMsg).toBeDefined();
      if (reminderMsg) {
        const content = typeof reminderMsg.content === 'string' 
          ? reminderMsg.content 
          : reminderMsg.content[0]?.text;
        expect(content).toContain('tool1');
      }
    });

    it('disables tools via effects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defEffect, defTool, $ }) => {
        const tool1 = defTool('tool1', 'Tool 1', z.object({}), async () => ({ ok: true }));
        const worker = defTool('worker', 'Worker', z.object({}), async () => ({ ok: true }));

        defEffect((ctx) => {
          if (ctx.stepNumber === 1) {
            tool1.disable(); // Disable tool1 in step 1
          }
        });

        $`Work`;
      }, { model: mockModel });

      await result.text;

      // Step 0 should have both tools
      expect(prompt.steps[0].activeTools).toContain('tool1');
      expect(prompt.steps[0].activeTools).toContain('worker');

      // Step 1 should only have worker (tool1 disabled)
      expect(prompt.steps[1].activeTools).not.toContain('tool1');
      expect(prompt.steps[1].activeTools).toContain('worker');
    });
  });

  describe('Effect execution order', () => {
    it('executes effects in registration order', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Done' }
      ]);

      const order: number[] = [];

      const { result } = await runPrompt(async ({ defEffect, $ }) => {
        defEffect(() => { order.push(1); });
        defEffect(() => { order.push(2); });
        defEffect(() => { order.push(3); });

        $`Work`;
      }, { model: mockModel });

      await result.text;

      expect(order).toEqual([1, 2, 3]);
    });

    it('allows later effects to see modifications from earlier effects', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Response 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'trigger', args: {} },
        { type: 'text', text: 'Response 2' }
      ]);

      const secondEffectSawModification = vi.fn();

      const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [value, setValue] = defState('value', 0);

        // First effect modifies state
        defEffect((ctx) => {
          if (ctx.stepNumber === 0) {
            setValue(100);
          }
        });

        // Second effect should see the modified value
        defEffect((ctx) => {
          if (ctx.stepNumber === 1) {
            secondEffectSawModification(value);
          }
        });

        defTool('trigger', 'Trigger', z.object({}), async () => ({ ok: true }));
        $`Work`;
      }, { model: mockModel });

      await result.text;

      // The second effect should see value=100 from the first effect
      expect(secondEffectSawModification).toHaveBeenCalledWith(100);
    });
  });

  describe('Complex scenarios', () => {
    it('handles multiple effects with different dependency patterns', async () => {
      const mockModel = createMockModel([
        { type: 'text', text: 'Step 1' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'update', args: {} },
        { type: 'text', text: 'Step 2' },
        { type: 'tool-call', toolCallId: 'c2', toolName: 'update', args: {} },
        { type: 'text', text: 'Done' }
      ]);

      const noDepsEffect = vi.fn();
      const withDepsEffect = vi.fn();
      const emptyDepsEffect = vi.fn();

      const { result } = await runPrompt(async ({ defState, defEffect, defTool, $ }) => {
        const [counter, setCounter] = defState('counter', 0);

        // No dependencies - runs every step
        defEffect((ctx) => {
          noDepsEffect(ctx.stepNumber);
        });

        // With dependencies - runs when counter changes
        defEffect((ctx) => {
          withDepsEffect(ctx.stepNumber, counter);
        }, [counter]);

        // Empty dependencies - runs only on first step
        defEffect((ctx) => {
          emptyDepsEffect(ctx.stepNumber);
        }, []);

        defTool('update', 'Update', z.object({}), async () => {
          setCounter(prev => prev + 1);
          return { ok: true };
        });

        $`Work`;
      }, { model: mockModel });

      await result.text;

      // No deps effect runs every step
      expect(noDepsEffect).toHaveBeenCalledTimes(3);

      // With deps effect runs every step (counter changes each time)
      expect(withDepsEffect).toHaveBeenCalledTimes(3);

      // Empty deps effect runs only once
      expect(emptyDepsEffect).toHaveBeenCalledTimes(1);
      expect(emptyDepsEffect).toHaveBeenCalledWith(0);
    });
  });

  it('filters tools via stepModifier', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: { task: 'do it' } },
      { type: 'text', text: 'b' },
      { type: 'tool-call', toolCallId: 'c2', toolName: 'worker', args: { task: 'do it' } },
      { type: 'text', text: 'c' },
      { type: 'tool-call', toolCallId: 'c3', toolName: 'worker', args: { task: 'do it' } },
      { type: 'text', text: 'done' }
    ]);

    const fn1 = vi.fn().mockResolvedValue({});
    const fn2 = vi.fn().mockResolvedValue({});

    const { result, prompt } = await runPrompt(async ({ defTool, defEffect, def, $ }) => {
      const tool1 = defTool('t1', 'Tool 1', z.object({}), fn1);
      const tool2 = defTool('t2', 'Tool 2', z.object({}), fn2);
      const data = def('data', 'initial');
      defEffect((_ctx, step) => {
        console.log(_ctx.stepNumber);
        if (_ctx.stepNumber === 0) {
          console.log('disabling t1 and reminding t2');
          tool1.disable();
          tool2.remind();
          data.disable()
        } else if (_ctx.stepNumber === 2) {
          tool2.disable();
          step('messages', [..._ctx.messages, { role: 'user', content: 'add message' }]);
        }else if (_ctx.stepNumber === 1) {
          data.remind();
        }
      });
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

});
