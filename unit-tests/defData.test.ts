import { describe, it, expect, beforeEach } from 'vitest';
import { StatefulPrompt } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defData()', () => {
  let prompt: StatefulPrompt;

  beforeEach(() => {
    const mockModel = createMockModel([
      { type: 'text', text: 'ok' }
    ]);
    prompt = new StatefulPrompt(mockModel);
  });

  it('defines a data variable with YAML formatting', async () => {
    const cfg = prompt.defData('CFG', { x: 1, y: 2 });
    prompt.$`Use ${cfg}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles nested objects', async () => {
    const data = prompt.defData('DATA', {
      user: { name: 'Alice', age: 30 },
      settings: { theme: 'dark' }
    });
    prompt.$`Config: ${data}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles arrays', async () => {
    const list = prompt.defData('LIST', ['a', 'b', 'c']);
    prompt.$`Items: ${list}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('returns proxy with toString', () => {
    const d = prompt.defData('D', { x: 1 });
    expect(String(d)).toBe('<D>');
  });


  it('supports .remind() method', async () => {
    const d = prompt.defData('D', { x: 1 });
    (d as any).remind();
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.getRemindedItems()).toMatchSnapshot();
    expect(prompt.steps).toMatchSnapshot();
  });


  it('handles complex data structures', async () => {
    const complex = prompt.defData('COMPLEX', {
      users: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' }
      ],
      config: {
        enabled: true,
        options: ['x', 'y']
      }
    });
    prompt.$`${complex}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles empty objects', async () => {
    const empty = prompt.defData('EMPTY', {});
    prompt.$`${empty}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
