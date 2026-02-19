/**
 * Zero-Step Tool Calling Plugin for lmthing
 *
 * Provides `defMethod` for registering functions the LLM can call
 * inline via <run_code> blocks — without a tool-call round-trip.
 *
 * @example
 * import { zeroStepPlugin } from 'lmthing/plugins';
 *
 * runPrompt(async ({ defMethod, $ }) => {
 *   defMethod(
 *     'fetchUser',
 *     'Fetch user by ID',
 *     z.object({ id: z.string() }),
 *     async ({ id }) => ({ name: 'Jane', role: 'Admin' }),
 *     z.object({ name: z.string(), role: z.string() })
 *   );
 *   $`Look up user 123 and tell me their name.`;
 * }, { model: 'openai:gpt-4o' });
 */

export { zeroStepPlugin, defMethod } from './ZeroStepPlugin';
export type { MethodDefinition } from './types';
export type { TypeCheckError, TypeCheckResult } from './typeChecker';
export { MethodRegistry } from './MethodRegistry';
export { createZeroStepTransformer } from './streamProcessor';
export { validateTypeScript } from './typeChecker';
export { generateTypeDeclarations } from './typeGenerator';
