/**
 * Function Plugin for lmthing
 *
 * Provides defFunction method for defining JavaScript functions that can be
 * called by the LLM through TypeScript-validated code execution.
 *
 * @example
 * import { functionPlugin, func } from 'lmthing/plugins';
 *
 * runPrompt(async ({ defFunction, $ }) => {
 *   // Single function
 *   defFunction('calculate', 'Add two numbers',
 *     z.object({ a: z.number(), b: z.number() }),
 *     async ({ a, b }) => ({ sum: a + b }),
 *     { responseSchema: z.object({ sum: z.number() }) }
 *   );
 *
 *   // Composite function
 *   defFunction('math', 'Math operations', [
 *     func('add', 'Add numbers', z.object({ a: z.number(), b: z.number() }),
 *       async ({ a, b }) => ({ result: a + b }),
 *       { responseSchema: z.object({ result: z.number() }) }
 *     ),
 *     func('multiply', 'Multiply numbers', z.object({ a: z.number(), b: z.number() }),
 *       async ({ a, b }) => ({ result: a * b }),
 *       { responseSchema: z.object({ result: z.number() }) }
 *     )
 *   ]);
 *
 *   $`Calculate 5 + 3 using the calculate function.`;
 * }, {
 *   model: 'openai:gpt-4o',
 *   plugins: [functionPlugin]
 * });
 */

export { functionPlugin, defFunction, defFunctionAgent } from './FunctionPlugin';
export type {
  FunctionDefinition,
  FunctionOptions,
  FunctionBeforeCallback,
  FunctionSuccessCallback,
  FunctionErrorCallback,
  CompositeFunctionDefinition,
  FunctionAgentDefinition,
  FunctionAgentOptions,
  CompositeFunctionAgentDefinition,
  TypeScriptError,
  ValidationResult,
} from './types';

import type { FunctionOptions, CompositeFunctionDefinition, FunctionAgentOptions, CompositeFunctionAgentDefinition } from './types';

/**
 * Helper function to create a sub-function definition for use with defFunction arrays.
 *
 * @example
 * import { func } from 'lmthing/plugins';
 *
 * defFunction('math', 'Math operations', [
 *   func('add', 'Add numbers', z.object({ a: z.number(), b: z.number() }),
 *     async ({ a, b }) => ({ result: a + b }),
 *     { responseSchema: z.object({ result: z.number() }) }
 *   ),
 *   func('multiply', 'Multiply numbers', z.object({ a: z.number(), b: z.number() }),
 *     async ({ a, b }) => ({ result: a * b }),
 *     { responseSchema: z.object({ result: z.number() }) }
 *   )
 * ]);
 */
export function func<TInput = any, TOutput = any>(
  name: string,
  description: string,
  inputSchema: any,
  execute: (args: TInput) => TOutput | Promise<TOutput>,
  options: FunctionOptions<TInput, TOutput>
): CompositeFunctionDefinition<TInput, TOutput> {
  return { name, description, inputSchema, execute, options };
}

/**
 * Helper function to create a sub-agent definition for use with defFunctionAgent arrays.
 *
 * @example
 * import { funcAgent } from 'lmthing/plugins';
 *
 * defFunctionAgent('specialists', 'Specialist agents', [
 *   funcAgent('researcher', 'Research topics', z.object({ topic: z.string() }),
 *     async ({ topic }, prompt) => { prompt.$`Research: ${topic}`; },
 *     { responseSchema: z.object({ findings: z.array(z.string()) }) }
 *   ),
 *   funcAgent('analyst', 'Analyze data', z.object({ data: z.string() }),
 *     async ({ data }, prompt) => { prompt.$`Analyze: ${data}`; },
 *     { responseSchema: z.object({ summary: z.string() }) }
 *   )
 * ]);
 */
export function funcAgent<TInput = any, TOutput = any>(
  name: string,
  description: string,
  inputSchema: any,
  execute: (args: TInput, prompt: any) => void | Promise<void>,
  options: FunctionAgentOptions<TInput, TOutput>
): CompositeFunctionAgentDefinition<TInput, TOutput> {
  return { name, description, inputSchema, execute, options };
}
