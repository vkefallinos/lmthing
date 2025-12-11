import { describe, it, expect } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('def()', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'ok' },
    { type: 'tool-call', toolCallId: 'c1', toolName: 'worker', args: { task: 'do it' } },
    { type: 'text', text: 'done' }
  ]);

  it('defines a string variable', async () => {
    const { result, prompt } = await runPrompt(async ({ def, $ }) => {
      const name = def('NAME', 'Alice');
      $`Hi ${name}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('returns proxy with toString', async () => {
    await runPrompt(async ({ def }) => {
      const name = def('NAME', 'Bob');
      expect(String(name)).toBe('<NAME>');
    }, { model: mockModel });
  });

  it('supports template literal interpolation', async () => {
    const { result, prompt } = await runPrompt(async ({ def, $ }) => {
      const x = def('X', 'val1');
      const y = def('Y', 'val2');
      $`Use ${x} and ${y}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('supports .value property', async () => {
    await runPrompt(async ({ def }) => {
      const v = def('V', 'test');
      expect((v as any).value).toBe('<V>');
    }, { model: mockModel });
  });

  it('supports .remind() method', async () => {
    const { result, prompt } = await runPrompt(async ({ def, $ }) => {
      const v = def('V', 'x');
      (v as any).remind();
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.getRemindedItems()).toMatchSnapshot();
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles multiple variables', async () => {
    const { result, prompt } = await runPrompt(async ({ def, $ }) => {
      const a = def('A', '1');
      const b = def('B', '2');
      const c = def('C', '3');
      $`${a} ${b} ${c}`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
