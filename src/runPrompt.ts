import { StreamTextResult } from "ai";
import { StatefulPrompt } from "./StatefulPrompt";
import { StreamTextOptions } from "./StreamText";
import { type ModelInput } from "./providers/resolver";
import type { Plugin, MergePlugins, PromptWithPlugins } from "./types";

/**
 * Helper function to create a plugin array without requiring 'as const'.
 * This preserves the tuple type for better TypeScript inference.
 *
 * @example
 * import { taskListPlugin, greetingPlugin } from 'lmthing/plugins';
 *
 * const plugins = createPluginArray(taskListPlugin, greetingPlugin);
 *
 * runPrompt(({ defTaskList, defGreeting }) => {
 *   // Plugin methods are properly typed
 * }, { model: 'openai:gpt-4o', plugins });
 */
export function createPluginArray<P extends Plugin[]>(...plugins: P): P {
  return plugins;
}

/**
 * Configuration options for runPrompt
 */
export interface PromptConfig<
  const P extends readonly Plugin[] = []
> {
  model: ModelInput;
  // Allow passing any streamText options except the ones we handle internally
  options?: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>>;
  /**
   * Array of plugins to extend the prompt context with additional methods.
   * Each plugin is an object containing methods that receive StatefulPrompt as `this`.
   *
   * You can now pass plugins directly without requiring 'as const':
   *
   * @example
   * import { taskListPlugin } from 'lmthing/plugins';
   *
   * runPrompt(({ defTaskList }) => {
   *   defTaskList([{ id: '1', name: 'Task 1' }]);
   * }, { model: 'openai:gpt-4o', plugins: [taskListPlugin] });
   */
  plugins?: P;
}

interface RunPromptResult {
  prompt: StatefulPrompt;
  result: StreamTextResult<any, any>;
}

/**
 * Creates a proxy around the StatefulPrompt instance that automatically binds methods
 * (including plugin methods) so they can be destructured without losing 'this' context.
 *
 * @param prompt - The StatefulPrompt instance to wrap
 * @param plugins - Array of plugins whose methods will be bound to the prompt
 * @returns A proxy that provides auto-bound methods from both StatefulPrompt and plugins
 */
function createPromptProxyWithPlugins<P extends readonly Plugin[]>(
  prompt: StatefulPrompt,
  plugins: P
): PromptWithPlugins<P> {
  // Pre-bind plugin methods to the prompt instance
  const boundPluginMethods: Record<string, Function> = {};

  for (const plugin of plugins) {
    for (const [methodName, method] of Object.entries(plugin)) {
      if (typeof method === 'function') {
        boundPluginMethods[methodName] = method.bind(prompt);
      }
    }
  }

  return new Proxy(prompt, {
    get(target, prop) {
      // Check plugin methods first (allows plugins to override if needed, though not recommended)
      if (typeof prop === 'string' && prop in boundPluginMethods) {
        return boundPluginMethods[prop];
      }

      // Fall back to StatefulPrompt methods
      const value = target[prop as keyof StatefulPrompt];
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
    // Support 'in' operator for checking method existence
    has(target, prop) {
      if (typeof prop === 'string' && prop in boundPluginMethods) {
        return true;
      }
      return prop in target;
    }
  }) as PromptWithPlugins<P>;
}

/**
 * Runs a prompt with optional plugins.
 *
 * @param promptFn - Async function that configures the prompt using def*, defState, defEffect, etc.
 * @param config - Configuration including model, options, and plugins
 * @returns Promise resolving to the result and prompt instance
 *
 * @example
 * // Basic usage
 * const { result } = await runPrompt(async ({ def, $ }) => {
 *   def('NAME', 'World');
 *   $`Hello <NAME>!`;
 * }, { model: 'openai:gpt-4o' });
 *
 * @example
 * // With plugins
 * import { taskListPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defTaskList, $ }) => {
 *   defTaskList([{ id: '1', name: 'Research' }]);
 *   $`Complete the tasks`;
 * }, { model: 'openai:gpt-4o', plugins: [taskListPlugin] });
 */
export const runPrompt = async <
  const P extends readonly Plugin[] = []
>(
  promptFn: (prompt: PromptWithPlugins<P>) => Promise<void>,
  config: PromptConfig<P>
): Promise<RunPromptResult> => {
  // Always create a StatefulPrompt
  const prompt = new StatefulPrompt(config.model);

  // Apply any additional options if provided
  if (config.options) {
    prompt.withOptions(config.options);
  }

  // Get plugins (default to empty array)
  const plugins = (config.plugins ?? []) as P;

  // Set plugins on the prompt for re-execution support
  prompt.setPlugins(plugins);

  // Set the prompt function for re-execution
  prompt.setPromptFn(promptFn as (prompt: any) => Promise<void>);

  // Wrap prompt in a proxy that auto-binds methods (including plugin methods)
  const proxiedPrompt = createPromptProxyWithPlugins(prompt, plugins);

  // Execute the prompt function once to set up initial state
  await promptFn(proxiedPrompt);

  // Run with stateful re-execution (will re-execute promptFn on subsequent steps)
  const result = prompt.run();

  return { result, prompt };
};