/**
 * Tool example using mock model (for testing without API keys)
 *
 * Run with: npx lmthing run examples/mock-tools.lmt.mjs
 *
 * Demonstrates tool usage with a mock model
 */
import { MockLanguageModelV2 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { z } from 'zod';

// Track which step we're on for multi-step responses
let stepCount = 0;

const mockModel = new MockLanguageModelV2({
  doStream: async () => {
    stepCount++;

    if (stepCount === 1) {
      // First step: model decides to call the calculator tool
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'response-metadata', id: 'r1' },
            { type: 'text-start', id: '0' },
            { type: 'text-delta', id: '0', delta: 'Let me calculate that for you. ' },
            {
              type: 'tool-call',
              toolCallId: 'calc_1',
              toolName: 'calculator',
              input: JSON.stringify({ a: 42, b: 17, operation: 'add' })
            },
            { type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 } }
          ]
        }),
        rawCall: { rawPrompt: null, rawSettings: {} }
      };
    } else {
      // Second step: model provides final response after tool result
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'response-metadata', id: 'r2' },
            { type: 'text-start', id: '0' },
            { type: 'text-delta', id: '0', delta: 'The result of 42 + 17 is 59. ' },
            { type: 'text-delta', id: '0', delta: 'Is there anything else you\'d like me to calculate?' },
            { type: 'finish', finishReason: 'stop', usage: { inputTokens: 20, outputTokens: 20, totalTokens: 40 } }
          ]
        }),
        rawCall: { rawPrompt: null, rawSettings: {} }
      };
    }
  }
});

export default async ({ defSystem, defTool, $ }) => {
  defSystem('role', 'You are a helpful calculator assistant.');

  defTool(
    'calculator',
    'Perform basic arithmetic operations',
    z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Operation to perform')
    }),
    async ({ a, b, operation }) => {
      const ops = {
        add: a + b,
        subtract: a - b,
        multiply: a * b,
        divide: b !== 0 ? a / b : 'Error: Division by zero'
      };
      console.error(`[Tool] Calculating ${a} ${operation} ${b} = ${ops[operation]}`);
      return { result: ops[operation] };
    }
  );

  $`What is 42 + 17?`;
};

export const config = {
  model: mockModel
};
