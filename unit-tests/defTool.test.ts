import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatefulPrompt, tool } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';
import { z } from 'zod';

describe('defTool()', () => {
  let prompt: StatefulPrompt;

  beforeEach(() => {
    const mockModel = createMockModel([
      { type: 'text', text: 'ok' }
    ]);
    prompt = new StatefulPrompt(mockModel);
  });

  describe('single tool', () => {
    it('defines a basic tool', async () => {
      const fn = vi.fn().mockResolvedValue({ result: 'ok' });
      prompt.defTool('calc', 'Calculate', z.object({ x: z.number() }), fn);
      prompt.$`msg`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls tool when model uses it', async () => {
      const fn = vi.fn().mockResolvedValue({ sum: 3 });
      const mockModel = createMockModel([
        { type: 'text', text: 'Let me calc' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'add', args: { a: 1, b: 2 } },
        { type: 'text', text: 'Result is 3' }
      ]);
      prompt = new StatefulPrompt(mockModel);
      prompt.defTool('add', 'Add', z.object({ a: z.number(), b: z.number() }), fn);
      prompt.$`Add 1 + 2`;
      const result = await prompt.run();
      await result.text;
      expect(fn).toHaveBeenCalledWith({ a: 1, b: 2 }, expect.anything());
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy with toString', () => {
      const t = prompt.defTool('t', 'Tool', z.object({}), async () => ({}));
      expect(String(t)).toBe('<t>');
    });

    it('supports .remind() method', async () => {
      const fn = vi.fn().mockResolvedValue({});
      const t = prompt.defTool('t', 'Tool', z.object({}), fn);
      (t as any).remind();
      prompt.$`msg`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.getRemindedItems()).toMatchSnapshot();
    });
  });

  describe('composite tool', () => {
    it('defines composite tool with sub-tools', async () => {
      const fn1 = vi.fn().mockResolvedValue({ ok: 1 });
      const fn2 = vi.fn().mockResolvedValue({ ok: 2 });

      prompt.defTool('file', 'File ops', [
        tool('write', 'Write', z.object({ path: z.string() }), fn1),
        tool('read', 'Read', z.object({ path: z.string() }), fn2),
      ]);
      prompt.$`msg`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls sub-tools when model uses composite tool', async () => {
      const fn1 = vi.fn().mockResolvedValue({ written: true });
      const fn2 = vi.fn().mockResolvedValue({ content: 'data' });

      const mockModel = createMockModel([
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
      prompt = new StatefulPrompt(mockModel);

      prompt.defTool('file', 'File ops', [
        tool('write', 'Write', z.object({ path: z.string() }), fn1),
        tool('read', 'Read', z.object({ path: z.string() }), fn2),
      ]);
      prompt.$`Use file`;
      const result = await prompt.run();
      await result.text;

      expect(fn1).toHaveBeenCalledWith({ path: '/a.txt' }, expect.anything());
      expect(fn2).toHaveBeenCalledWith({ path: '/a.txt' }, expect.anything());
      expect(prompt.steps).toMatchSnapshot();
    });

    it('handles sub-tool errors gracefully', async () => {
      const fn1 = vi.fn().mockRejectedValue(new Error('fail'));
      const fn2 = vi.fn().mockResolvedValue({ ok: true });

      const mockModel = createMockModel([
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
      prompt = new StatefulPrompt(mockModel);

      prompt.defTool('ops', 'Operations', [
        tool('bad', 'Bad', z.object({}), fn1),
        tool('good', 'Good', z.object({}), fn2),
      ]);
      prompt.$`Run`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy for composite tool', () => {
      const fn = vi.fn().mockResolvedValue({});
      const t = prompt.defTool('t', 'Tool', [
        tool('a', 'A', z.object({}), fn),
      ]);
      expect(String(t)).toBe('<t>');
    });
  });
});
