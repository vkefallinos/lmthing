/**
 * Function Plugin Demo
 *
 * This example demonstrates the defFunction plugin with TypeScript validation.
 * Functions are called via code execution with compile-time type checking.
 *
 * Run with: npx lmthing run examples/function-demo.lmt.mjs
 */

import { z } from 'zod';
import { functionPlugin, func } from 'lmthing/plugins';

export default async ({ defFunction, defSystem, $ }) => {
  // Define system role
  defSystem('role', 'You are a helpful calculator assistant.');

  // Define a single function
  defFunction(
    'calculate',
    'Add two numbers together',
    z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number')
    }),
    async ({ a, b }) => {
      console.log(`[Function] Calculating ${a} + ${b}`);
      return { sum: a + b };
    },
    {
      responseSchema: z.object({
        sum: z.number().describe('The sum of a and b')
      }),
      // Optional: Log before execution
      beforeCall: async (input) => {
        console.log('[beforeCall] Input:', input);
        return undefined; // Continue execution
      },
      // Optional: Log after successful execution
      onSuccess: async (input, output) => {
        console.log('[onSuccess] Output:', output);
        return undefined; // Use original output
      }
    }
  );

  // Define composite functions (namespace)
  defFunction(
    'math',
    'Mathematical operations',
    [
      func(
        'multiply',
        'Multiply two numbers',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => {
          console.log(`[Function] Multiplying ${a} * ${b}`);
          return { product: a * b };
        },
        { responseSchema: z.object({ product: z.number() }) }
      ),
      func(
        'divide',
        'Divide two numbers',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => {
          if (b === 0) {
            throw new Error('Cannot divide by zero');
          }
          console.log(`[Function] Dividing ${a} / ${b}`);
          return { quotient: a / b };
        },
        {
          responseSchema: z.object({ quotient: z.number() }),
          // Handle division by zero gracefully
          onError: async (input, error) => {
            console.error('[onError]', error.message);
            return { quotient: null, error: error.message };
          }
        }
      )
    ]
  );

  // Ask the LLM to perform calculations
  $`
    Please help me with these calculations:
    1. Calculate 15 + 27
    2. Multiply 8 by 12
    3. Divide 100 by 4

    Use the available functions via TypeScript code.
    Write clean, well-formatted code that calls the functions.
  `;
};

export const config = {
  model: 'mock',
  plugins: [functionPlugin]
};

// Mock responses for demo
export const mock = [
  { type: 'text', text: 'I\'ll help you with those calculations. Let me write some TypeScript code to call the functions.\n\n' },
  {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'runToolCode',
    args: {
      code: `
// Calculation 1: Add 15 + 27
const sum = await calculate({ a: 15, b: 27 });
console.log('Sum:', sum);

// Calculation 2: Multiply 8 * 12
const product = await math.multiply({ a: 8, b: 12 });
console.log('Product:', product);

// Calculation 3: Divide 100 / 4
const quotient = await math.divide({ a: 100, b: 4 });
console.log('Quotient:', quotient);

return {
  sum: sum.sum,
  product: product.product,
  quotient: quotient.quotient
};
      `.trim()
    }
  },
  { type: 'text', text: '\n\nHere are your results:\n1. 15 + 27 = 42\n2. 8 × 12 = 96\n3. 100 ÷ 4 = 25' }
];
