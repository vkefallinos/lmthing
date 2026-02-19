import { z } from 'zod';
import { StatefulPrompt } from '../../StatefulPrompt';
import type { MethodDefinition } from './types';
import { MethodRegistry } from './MethodRegistry';
import { createZeroStepTransformer } from './streamProcessor';

// Symbol keys for per-instance state
const METHOD_REGISTRY = Symbol('zeroStepMethodRegistry');
const TRANSFORMER_REGISTERED = Symbol('zeroStepTransformerRegistered');

/**
 * Gets or creates the method registry on a prompt instance.
 */
function getRegistry(prompt: StatefulPrompt): MethodRegistry {
  if (!(prompt as any)[METHOD_REGISTRY]) {
    (prompt as any)[METHOD_REGISTRY] = new MethodRegistry();
  }
  return (prompt as any)[METHOD_REGISTRY];
}

/**
 * Ensures the stream transformer is registered exactly once per prompt instance.
 */
function ensureTransformerRegistered(prompt: StatefulPrompt): void {
  if ((prompt as any)[TRANSFORMER_REGISTERED]) return;
  const registry = getRegistry(prompt);
  (prompt as any).addStreamTransformer(createZeroStepTransformer(registry));
  (prompt as any)[TRANSFORMER_REGISTERED] = true;
}

/**
 * Generates a system prompt section describing how to use the registered methods.
 */
function buildSystemDescription(registry: MethodRegistry): string {
  const lines: string[] = [
    '# Zero-Step Methods',
    '',
    'You can call the following methods directly in your response by writing',
    'JavaScript code inside <run_code> XML tags.',
    '',
    'Rules:',
    '- Use `await` for all method calls (they are async).',
    '- If you need to return a value to the conversation, end the block with a `return` statement.',
    '- If no `return` is present, execution runs silently and the stream continues.',
    '- Errors are reported inside <code_error> tags.',
    '',
    '## Available Methods',
    '',
  ];

  for (const [name, def] of registry.getAll()) {
    lines.push(`### ${name}`);
    lines.push(def.description);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Define a method that the LLM can call via <run_code> blocks in its text response.
 *
 * @param this - The StatefulPrompt instance (automatically bound by plugin system)
 * @param name - Method name used inside <run_code> code
 * @param description - Human-readable description of what the method does
 * @param parameterSchema - Zod schema for validating method arguments
 * @param handler - Implementation function receiving validated args
 * @param responseSchema - Zod schema for validating the return value
 *
 * @example
 * defMethod(
 *   'fetchUser',
 *   'Fetch a user record by ID',
 *   z.object({ id: z.string() }),
 *   async ({ id }) => ({ name: 'Jane', role: 'Admin' }),
 *   z.object({ name: z.string(), role: z.string() })
 * );
 *
 * // LLM can then write:
 * // <run_code>
 * //   const user = await fetchUser({ id: '123' });
 * //   return user.name;
 * // </run_code>
 */
export function defMethod<TInput = any, TOutput = any>(
  this: StatefulPrompt,
  name: string,
  description: string,
  parameterSchema: z.ZodType<TInput>,
  handler: (args: TInput) => TOutput | Promise<TOutput>,
  responseSchema: z.ZodType<TOutput>
): void {
  const registry = getRegistry(this);

  const definition: MethodDefinition<TInput, TOutput> = {
    name,
    description,
    parameterSchema,
    handler,
    responseSchema,
  };

  registry.register(definition as MethodDefinition);

  // Register the stream transformer the first time a method is defined
  ensureTransformerRegistered(this);

  // Update the system prompt with the current method list
  this.defSystem('zero_step_methods', buildSystemDescription(registry));
}

/**
 * Zero-Step Tool Calling plugin.
 *
 * Exposes `defMethod` on every prompt, allowing the LLM to call registered
 * functions by embedding `<run_code>` blocks in its text output — no tool-call
 * round-trip required.
 *
 * @example
 * import { zeroStepPlugin } from 'lmthing/plugins';
 *
 * runPrompt(async ({ defMethod, $ }) => {
 *   defMethod('greet', 'Return a greeting', z.object({ name: z.string() }),
 *     async ({ name }) => `Hello, ${name}!`,
 *     z.string()
 *   );
 *   $`Greet the user whose name is Alice.`;
 * }, { model: 'openai:gpt-4o' });
 */
export const zeroStepPlugin = { defMethod };
