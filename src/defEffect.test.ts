import { describe, it, expect, vi } from 'vitest';
import { runPrompt } from './runPrompt';
import { createMockModel } from './test/createMockModel';
import { z } from 'zod';
import { tool } from './StatefulPrompt';

describe('defEffect()', () => {


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
