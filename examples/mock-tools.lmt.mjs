/**
 * Tool example using mock model (for testing without API keys)
 *
 * Run with: npx lmthing run examples/mock-tools.lmt.mjs
 *
 * Demonstrates tool usage with a mock model.
 * When config.model is "mock", the CLI uses the exported mock array.
 */
import { z } from 'zod';

// Mock response data - simulates model calling a tool then responding
export const mock = [
  { type: 'text', text: 'Let me calculate that for you. ' },
  {
    type: 'tool-call',
    toolCallId: 'calc_1',
    toolName: 'calculator',
    args: { a: 42, b: 17, operation: 'add' }
  },
  { type: 'text', text: 'The result of 42 + 17 is 59. ' },
  { type: 'text', text: 'Is there anything else you\'d like me to calculate?' }
];

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
  model: 'mock'
};
