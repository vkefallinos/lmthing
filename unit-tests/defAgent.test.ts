import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatefulPrompt, agent } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';
import { z } from 'zod';

describe('defAgent()', () => {
  let prompt: StatefulPrompt;

  beforeEach(() => {
    const mockModel = createMockModel([
      { type: 'text', text: 'ok' }
    ]);
    prompt = new StatefulPrompt(mockModel);
  });

  describe('single agent', () => {
    it('defines a basic agent', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`Agent msg`;
      });

      prompt.defAgent('worker', 'Worker', z.object({ task: z.string() }), fn);
      prompt.$`msg`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls agent when model uses it', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`Hi`;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Delegating' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: { task: 'do it' } },
        { type: 'text', text: 'Done' }
      ]);
      prompt = new StatefulPrompt(mockModel);

      prompt.defAgent('worker', 'Worker', z.object({ task: z.string() }), fn);
      prompt.$`Delegate`;
      const result = await prompt.run();
      await result.text;

      expect(fn).toHaveBeenCalled();
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns agent response', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`Task`;
      });

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'agent', args: {} },
        { type: 'text', text: 'ok' }
      ]);
      prompt = new StatefulPrompt(mockModel);

      prompt.defAgent('agent', 'Agent', z.object({}), fn);
      prompt.$`Run`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy with toString', () => {
      const a = prompt.defAgent('a', 'Agent', z.object({}), async (_args, p) => {
        p.$`msg`;
      });
      expect(String(a)).toBe('<a>');
    });

    it('supports .remind() method', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`msg`;
      });
      const a = prompt.defAgent('a', 'Agent', z.object({}), fn);
      (a as any).remind();
      prompt.$`msg`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.getRemindedItems()).toMatchSnapshot();
    });

    it('supports custom model per agent', async () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`msg`;
      });
      const childMock = createMockModel([{ type: 'text', text: 'child' }]);

      const mockModel = createMockModel([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'agent', args: {} },
        { type: 'text', text: 'parent' }
      ]);
      prompt = new StatefulPrompt(mockModel);

      prompt.defAgent('agent', 'Agent', z.object({}), fn, { model: childMock });
      prompt.$`Run`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });
  });

  describe('composite agent', () => {
    it('defines composite agent with sub-agents', async () => {
      const fn1 = vi.fn(async (_args, p) => {
        p.$`Research`;
      });
      const fn2 = vi.fn(async (_args, p) => {
        p.$`Analyze`;
      });

      prompt.defAgent('team', 'Team', [
        agent('researcher', 'Research', z.object({ topic: z.string() }), fn1),
        agent('analyst', 'Analyze', z.object({ data: z.string() }), fn2),
      ]);
      prompt.$`msg`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('calls sub-agents when model uses composite agent', async () => {
      const fn1 = vi.fn(async (_args, p) => {
        p.$`Research AI`;
      });
      const fn2 = vi.fn(async (_args, p) => {
        p.$`Analyze data`;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Using team' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'team',
          args: {
            calls: [
              { name: 'researcher', args: { topic: 'AI' } },
              { name: 'analyst', args: { data: 'x' } }
            ]
          }
        },
        { type: 'text', text: 'Done' }
      ]);
      prompt = new StatefulPrompt(mockModel);

      prompt.defAgent('team', 'Team', [
        agent('researcher', 'Research', z.object({ topic: z.string() }), fn1),
        agent('analyst', 'Analyze', z.object({ data: z.string() }), fn2),
      ]);
      prompt.$`Use team`;
      const result = await prompt.run();
      await result.text;

      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
      expect(prompt.steps).toMatchSnapshot();
    });

    it('handles sub-agent errors gracefully', async () => {
      const fn1 = vi.fn().mockRejectedValue(new Error('fail'));
      const fn2 = vi.fn(async (_args, p) => {
        p.$`ok`;
      });

      const mockModel = createMockModel([
        { type: 'text', text: 'Try' },
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'team',
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

      prompt.defAgent('team', 'Team', [
        agent('bad', 'Bad', z.object({}), fn1),
        agent('good', 'Good', z.object({}), fn2),
      ]);
      prompt.$`Run`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });

    it('returns proxy for composite agent', () => {
      const fn = vi.fn(async (_args, p) => {
        p.$`msg`;
      });
      const a = prompt.defAgent('a', 'Agent', [
        agent('sub', 'Sub', z.object({}), fn),
      ]);
      expect(String(a)).toBe('<a>');
    });

    it('supports custom models per sub-agent', async () => {
      const fn1 = vi.fn(async (_args, p) => {
        p.$`a`;
      });
      const fn2 = vi.fn(async (_args, p) => {
        p.$`b`;
      });

      const model1 = createMockModel([{ type: 'text', text: 'm1' }]);
      const model2 = createMockModel([{ type: 'text', text: 'm2' }]);

      const mockModel = createMockModel([
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'team',
          args: {
            calls: [
              { name: 'a1', args: {} },
              { name: 'a2', args: {} }
            ]
          }
        },
        { type: 'text', text: 'done' }
      ]);
      prompt = new StatefulPrompt(mockModel);

      prompt.defAgent('team', 'Team', [
        agent('a1', 'A1', z.object({}), fn1, { model: model1 }),
        agent('a2', 'A2', z.object({}), fn2, { model: model2 }),
      ]);
      prompt.$`Run`;
      const result = await prompt.run();
      await result.text;
      expect(prompt.steps).toMatchSnapshot();
    });
  });
});
