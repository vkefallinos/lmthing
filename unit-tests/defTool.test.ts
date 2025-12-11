import { describe, it, expect, vi } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { tool } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';
import { z } from 'zod';

describe('defTool()', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'ok' }
  ]);

  describe('single tool', () => {
    it('defines a basic tool', async () => {
      const fn = vi.fn().mockResolvedValue({ result: 'ok' });

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('calc', 'Calculate', z.object({ x: z.number() }), fn);
        $`msg`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls tool when model uses it', async () => {
      const fn = vi.fn().mockResolvedValue({ sum: 3 });
      const mockModelWithCall = createMockModel([
        { type: 'text', text: 'Let me calc' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'add', args: { a: 1, b: 2 } },
        { type: 'text', text: 'Result is 3' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('add', 'Add', z.object({ a: z.number(), b: z.number() }), fn);
        $`Add 1 + 2`;
      }, { model: mockModelWithCall });

      await result.text;
      expect(fn).toHaveBeenCalledWith({ a: 1, b: 2 }, expect.anything());
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy with toString', async () => {
      await runPrompt(async ({ defTool }) => {
        const t = defTool('t', 'Tool', z.object({}), async () => ({}));
        expect(String(t)).toBe('<t>');
      }, { model: mockModel });
    });

    it('supports .remind() method', async () => {
      const fn = vi.fn().mockResolvedValue({});

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        const t = defTool('t', 'Tool', z.object({}), fn);
        (t as any).remind();
        $`msg`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.getRemindedItems()).toMatchSnapshot();
    });
  });

  describe('composite tool', () => {
    it('defines composite tool with sub-tools', async () => {
      const fn1 = vi.fn().mockResolvedValue({ ok: 1 });
      const fn2 = vi.fn().mockResolvedValue({ ok: 2 });

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('file', 'File ops', [
          tool('write', 'Write', z.object({ path: z.string() }), fn1),
          tool('read', 'Read', z.object({ path: z.string() }), fn2),
        ]);
        $`msg`;
      }, { model: mockModel });

      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls sub-tools when model uses composite tool', async () => {
      const fn1 = vi.fn().mockResolvedValue({ written: true });
      const fn2 = vi.fn().mockResolvedValue({ content: 'data' });

      const mockModelWithCall = createMockModel([
        { type: 'text', text: 'Using file' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'file',
          args: {
            calls: [
              { name: 'write', args: { path: '/a.txt' } },
              { name: 'read', args: { path: '/a.txt' } }
            ]
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('file', 'File ops', [
          tool('write', 'Write', z.object({ path: z.string() }), fn1),
          tool('read', 'Read', z.object({ path: z.string() }), fn2),
        ]);
        $`Use file`;
      }, { model: mockModelWithCall });

      await result.text;

      expect(fn1).toHaveBeenCalledWith({ path: '/a.txt' }, expect.anything());
      expect(fn2).toHaveBeenCalledWith({ path: '/a.txt' }, expect.anything());
      expect(prompt.steps).toMatchSnapshot();
    });

    it('handles sub-tool errors gracefully', async () => {
      const fn1 = vi.fn().mockRejectedValue(new Error('fail'));
      const fn2 = vi.fn().mockResolvedValue({ ok: true });

      const mockModelWithCall = createMockModel([
        { type: 'text', text: 'Try' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'ops',
          args: {
            calls: [
              { name: 'bad', args: {} },
              { name: 'good', args: {} }
            ]
          }
        },
        { type: 'text', text: 'Done' }
      ]);

      const { result, prompt } = await runPrompt(async ({ defTool, $ }) => {
        defTool('ops', 'Operations', [
          tool('bad', 'Bad', z.object({}), fn1),
          tool('good', 'Good', z.object({}), fn2),
        ]);
        $`Run`;
      }, { model: mockModelWithCall });

      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy for composite tool', async () => {
      const fn = vi.fn().mockResolvedValue({});

      await runPrompt(async ({ defTool }) => {
        const t = defTool('t', 'Tool', [
          tool('a', 'A', z.object({}), fn),
        ]);
        expect(String(t)).toBe('<t>');
      }, { model: mockModel });
    });
  });
});
