import { describe, it, expect } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defData()', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'ok' }
  ]);

  it('defines a data variable with YAML formatting', async () => {
    const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
      const cfg = defData('CFG', { x: 1, y: 2 });
      $`Use ${cfg}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles nested objects', async () => {
    const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
      const data = defData('DATA', {
        user: { name: 'Alice', age: 30 },
        settings: { theme: 'dark' }
      });
      $`Config: ${data}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles arrays', async () => {
    const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
      const list = defData('LIST', ['a', 'b', 'c']);
      $`Items: ${list}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('returns proxy with toString', async () => {
    await runPrompt(async ({ defData }) => {
      const d = defData('D', { x: 1 });
      expect(String(d)).toBe('<D>');
    }, { model: mockModel });
  });

  it('supports .remind() method', async () => {
    const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
      const d = defData('D', { x: 1 });
      (d as any).remind();
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.getRemindedItems()).toMatchSnapshot();
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles complex data structures', async () => {
    const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
      const complex = defData('COMPLEX', {
        users: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' }
        ],
        config: {
          enabled: true,
          options: ['x', 'y']
        }
      });
      $`${complex}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles empty objects', async () => {
    const { result, prompt } = await runPrompt(async ({ defData, $ }) => {
      const empty = defData('EMPTY', {});
      $`${empty}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
