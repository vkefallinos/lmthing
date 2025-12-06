/**
 * Demo example using mock model (for testing without API keys)
 *
 * Run with: npx lmthing run examples/mock-demo.lmt.mjs
 *
 * This example uses a mock model to demonstrate the CLI works
 */
import { MockLanguageModelV2 } from 'ai/test';
import { simulateReadableStream } from 'ai';

// Create a mock model for demonstration
const mockModel = new MockLanguageModelV2({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: 'response-metadata', id: 'r1' },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: 'Hello! ' },
        { type: 'text-delta', id: '0', delta: 'Welcome to lmthing! ' },
        { type: 'text-delta', id: '0', delta: 'This is a demo running with a mock model. ' },
        { type: 'text-delta', id: '0', delta: 'In real usage, you would configure a real model like openai:gpt-4o.' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 30, totalTokens: 40 }
        }
      ]
    }),
    rawCall: { rawPrompt: null, rawSettings: {} }
  })
});

export default async ({ def, defSystem, $ }) => {
  defSystem('role', 'You are a helpful assistant demonstrating lmthing.');

  const feature = def('FEATURE', 'CLI');
  $`Welcome the user to lmthing and explain the ${feature} feature briefly.`;
};

export const config = {
  model: mockModel
};
