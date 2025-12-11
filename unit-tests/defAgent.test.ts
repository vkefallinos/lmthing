import { describe, it, expect, vi } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';
import { z } from 'zod';

describe('defAgent()', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'ok' }
  ]);

  describe('single agent', () => {
    it('defines a basic agent', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`Agent msg`;
      });

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent('worker', 'Worker', z.object({ task: z.string() }), fn);
        $`msg`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls agent when model uses it', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`Hi`;
      });

      const mockModelWithCall = createMockModel([
        { type: 'text', text: 'Delegating' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: { task: 'do it' } },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent('worker', 'Worker', z.object({ task: z.string() }), fn);
        $`Delegate`;
      }, { model: mockModelWithCall });

      await result.text;

      expect(fn).toHaveBeenCalled();
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns agent response', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`Task`;
      });

      const mockModelWithCall = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'agent', args: {} },
        { type: 'text', text: 'ok' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent('agent', 'Agent', z.object({}), fn);
        $`Run`;
      }, { model: mockModelWithCall });

      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy with toString', async () => {
      await runPrompt(async ({ defAgent }) => {
        const a = defAgent('a', 'Agent', z.object({}), async (_args, p) => {
          p.$`msg`;
        });
        expect(String(a)).toBe('<a>');
      }, { model: mockModel });
    });

    it('supports .remind() method', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`msg`;
      });

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        const a = defAgent('a', 'Agent', z.object({}), fn);
        (a as any).remind();
        $`msg`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getRemindedItems()).toMatchSnapshot();
    });

    it('supports custom model per agent', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`msg`;
      });
      const childMock = createMockModel([{ type: 'text', text: 'child' }]);

      const mockModelWithCall = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'agent', args: {} },
        { type: 'text', text: 'parent' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defAgent, $ }) => {
        defAgent('agent', 'Agent', z.object({}), fn, { model: childMock });
        $`Run`;
      }, { model: mockModelWithCall });

      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });
  });


});
