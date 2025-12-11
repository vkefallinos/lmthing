import { describe, it, expect, beforeEach } from 'vitest';
import { StatefulPrompt } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defSystem()', () => {
  let prompt: StatefulPrompt;

  beforeEach(() => {
    const mockModel = createMockModel([
      { type: 'text', text: 'ok' }
    ]);
    prompt = new StatefulPrompt(mockModel);
  });

  it('defines a system prompt part', async () => {
    prompt.defSystem('role', 'You are helpful.');
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('defines multiple system parts', async () => {
    prompt.defSystem('role', 'You are helpful.');
    prompt.defSystem('rules', 'Be polite.');
    prompt.defSystem('context', 'User is new.');
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('returns proxy with toString', () => {
    const s = prompt.defSystem('role', 'You are AI.');
    expect(String(s)).toBe('<role>');
  });

  it('supports .remind() method', async () => {
    const s = prompt.defSystem('role', 'AI');
    (s as any).remind();
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.getRemindedItems()).toMatchSnapshot();
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles multiline system content', async () => {
    prompt.defSystem('instructions', 'Line 1\nLine 2\nLine 3');
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('overwrites when same name used twice', async () => {
    prompt.defSystem('role', 'First');
    prompt.defSystem('role', 'Second');
    prompt.$`msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
