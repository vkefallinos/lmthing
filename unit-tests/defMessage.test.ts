import { describe, it, expect, beforeEach } from 'vitest';
import { StatefulPrompt } from '../src/StatefulPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defMessage()', () => {
  let prompt: StatefulPrompt;

  beforeEach(() => {
    const mockModel = createMockModel([
      { type: 'text', text: 'ok' }
    ]);
    prompt = new StatefulPrompt(mockModel);
  });

  it('adds user message', async () => {
    prompt.defMessage('user', 'Hello');
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('adds assistant message', async () => {
    prompt.defMessage('assistant', 'Hi there');
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('adds multiple messages', async () => {
    prompt.defMessage('user', 'First');
    prompt.defMessage('assistant', 'Second');
    prompt.defMessage('user', 'Third');
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('integrates with $() template', async () => {
    prompt.defMessage('user', 'First msg');
    prompt.$`Second msg`;
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles multiline content', async () => {
    prompt.defMessage('user', 'Line 1\nLine 2\nLine 3');
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles empty content', async () => {
    prompt.defMessage('user', '');
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('maintains message order', async () => {
    prompt.defMessage('user', 'A');
    prompt.defMessage('assistant', 'B');
    prompt.defMessage('user', 'C');
    prompt.defMessage('assistant', 'D');
    const result = await prompt.run();
    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
