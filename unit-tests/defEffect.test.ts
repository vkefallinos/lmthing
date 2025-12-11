import { describe, it, expect, vi } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';
import { z } from 'zod';

describe('defEffect()', () => {
  it('runs effect without dependencies every step', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'text', text: 'c' }
    ]);

    let runs = 0;
    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect(() => {
        runs++;
      });
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(runs).toBeGreaterThanOrEqual(1);
    expect(prompt.steps).toMatchSnapshot();
  });

  it('runs effect when dependencies change', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'text', text: 'c' }
    ]);

    let runs = 0;
    const { result, prompt } = await runPrompt(async ({ defState, defEffect, $ }) => {
      const [count, setCount] = defState('count', 0);
      defEffect(() => {
        runs++;
      }, [count]);
      if (count < 2) setCount(count + 1);
      $`${count}`;
    }, { model: mockModel });

    await result.text;
    expect(runs).toBeGreaterThan(0);
    expect(prompt.steps).toMatchSnapshot();
  });

  it('provides prompt context to effect', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    let ctx: any;
    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((context) => {
        ctx = context;
      });
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(ctx).toBeDefined();
    expect(ctx.stepNumber).toBeDefined();
    expect(ctx.messages).toBeDefined();
    expect(prompt.steps).toMatchSnapshot();
  });

  it('modifies messages via stepModifier', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect((_ctx, step) => {
        step('messages', [{ role: 'user', content: 'Extra' }]);
      });
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('filters tools via stepModifier', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    const fn1 = vi.fn().mockResolvedValue({});
    const fn2 = vi.fn().mockResolvedValue({});

    const { result, prompt } = await runPrompt(async ({ defTool, defEffect, $ }) => {
      defTool('t1', 'Tool 1', z.object({}), fn1);
      defTool('t2', 'Tool 2', z.object({}), fn2);
      defEffect((_ctx, step) => {
        step('tools', [{ name: 't1' }]);
      });
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles empty dependency array', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' }
    ]);

    let runs = 0;
    const { result, prompt } = await runPrompt(async ({ defEffect, $ }) => {
      defEffect(() => {
        runs++;
      }, []);
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(runs).toBe(1);
    expect(prompt.steps).toMatchSnapshot();
  });
});
