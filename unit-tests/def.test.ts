import { describe, it, expect, beforeEach } from 'vitest';
import { StatefulPrompt } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('def()', () => {
  let prompt: StatefulPrompt;

  beforeEach(() => {
    const mockModel = createMockModel([
      { type: 'text', text: 'ok' }
    ]);
    prompt = new StatefulPrompt(mockModel);
  });

  it('defines a string variable', async () => {
    const name = prompt.def('NAME', 'Alice');
    prompt.$`Hi ${name}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('returns proxy with toString', () => {
    const name = prompt.def('NAME', 'Bob');
    expect(String(name)).toBe('<NAME>');
  });

  it('supports template literal interpolation', async () => {
    const x = prompt.def('X', 'val1');
    const y = prompt.def('Y', 'val2');
    prompt.$`Use ${x} and ${y}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('supports .value property', () => {
    const v = prompt.def('V', 'test');
    expect((v as any).value).toBe('<V>');
  });

  it('supports .remind() method', async () => {
    const v = prompt.def('V', 'x');
    (v as any).remind();
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.getRemindedItems()).toMatchSnapshot();
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles multiple variables', async () => {
    const a = prompt.def('A', '1');
    const b = prompt.def('B', '2');
    const c = prompt.def('C', '3');
    prompt.$`${a} ${b} ${c}`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
