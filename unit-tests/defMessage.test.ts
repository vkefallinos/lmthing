import { describe, it, expect } from 'vitest';
import { runPrompt } from '../src/runPrompt';
import { createMockModel } from '../src/test/createMockModel';

describe('defMessage()', () => {
  const mockModel = createMockModel([
    { type: 'text', text: 'ok' }
  ]);

  it('adds user message', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage }) => {
      defMessage('user', 'Hello');
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('adds assistant message', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage }) => {
      defMessage('assistant', 'Hi there');
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('adds multiple messages', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage }) => {
      defMessage('user', 'First');
      defMessage('assistant', 'Second');
      defMessage('user', 'Third');
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('integrates with $() template', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage, $ }) => {
      defMessage('user', 'First msg');
      $`Second msg`;
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles multiline content', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage }) => {
      defMessage('user', 'Line 1\nLine 2\nLine 3');
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('handles empty content', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage }) => {
      defMessage('user', '');
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });

  it('maintains message order', async () => {
    const { result, prompt } = await runPrompt(async ({ defMessage }) => {
      defMessage('user', 'A');
      defMessage('assistant', 'B');
      defMessage('user', 'C');
      defMessage('assistant', 'D');
    }, { model: mockModel });

    await result.text;
    expect(prompt.steps).toMatchSnapshot();
  });
});
