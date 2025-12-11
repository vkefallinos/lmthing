import { describe, it, expect } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defSystem()', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'ok' }
  ]);

  it('defines a system prompt part', async () => {
    const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
      defSystem('role', 'You are helpful.');
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('defines multiple system parts', async () => {
    const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
      defSystem('role', 'You are helpful.');
      defSystem('rules', 'Be polite.');
      defSystem('context', 'User is new.');
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('returns proxy with toString', async () => {
    await runPrompt(async ({ defSystem }) => {
      const s = defSystem('role', 'You are AI.');
      expect(String(s)).toBe('<role>');
    }, { model: mockModel });
  });

  it('supports .remind() method', async () => {
    const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
      const s = defSystem('role', 'AI');
      (s as any).remind();
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.getRemindedItems()).toMatchSnapshot();
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles multiline system content', async () => {
    const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
      defSystem('instructions', 'Line 1\nLine 2\nLine 3');
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('overwrites when same name used twice', async () => {
    const { result, prompt } = await runPrompt(async ({ defSystem, $ }) => {
      defSystem('role', 'First');
      defSystem('role', 'Second');
      $`msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
