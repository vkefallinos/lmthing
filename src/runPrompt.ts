import { StreamTextResult } from "ai";
import { StatefulPrompt } from "./StatefulPrompt";
import { StreamTextOptions } from "./StreamText";
import { type ModelInput } from "./providers/resolver";
import type { Plugin, MergePlugins, PromptWithPlugins } from "./types";
import { builtInPlugins } from "./plugins";

/**
 * Helper function to create a plugin array without requiring 'as const'.
 * This preserves the tuple type for better TypeScript inference.
 *
 * @category Plugins
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
 *
 * @category Core
 */
export interface PromptConfig<P extends readonly Plugin[] = []> {
  model: ModelInput;
  // Allow passing any streamText options except the ones we handle internally
  options?: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'prepareStep'>> & {
    onFinish?: StreamTextOptions['onFinish'];
    onStepFinish?: StreamTextOptions['onStepFinish'];
  };
  /**
   * Array of additional plugins to extend the prompt context.
   * Built-in plugins (taskListPlugin, taskGraphPlugin, functionPlugin) are
   * automatically included and don't need to be specified here.
   *
   * Each plugin is an object containing methods that receive StatefulPrompt as `this`.
   *
   * @example
   * // Built-in plugins are automatically available
   * runPrompt(({ defTaskList, defTaskGraph, defFunction }) => {
   *   // Use built-in plugin methods without importing them
   * }, { model: 'openai:gpt-4o' });
   *
   * @example
   * // Add custom plugins alongside built-in ones
   * import { customPlugin } from './customPlugin';
   *
   * runPrompt(({ defCustomFeature }) => {
   *   // Both built-in and custom plugins are available
   * }, { model: 'openai:gpt-4o', plugins: [customPlugin] });
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
 * Runs a prompt with plugins.
 * Main entry point for running prompts with lmthing.
 *
 * Built-in plugins (taskListPlugin, taskGraphPlugin, functionPlugin) are
 * automatically loaded on every prompt instance.
 *
 * @category Core
 *
 * @param promptFn - Async function that configures the prompt using def*, defState, defEffect, etc.
 * @param config - Configuration including model, options, and optional additional plugins
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
 * // Built-in plugins are automatically available
 * const { result } = await runPrompt(async ({ defTaskList, defTaskGraph, $ }) => {
 *   const [tasks, setTasks] = defTaskList([{ id: '1', name: 'Research' }]);
 *   const [graph, setGraph] = defTaskGraph([...]);
 *   $`Complete the tasks`;
 * }, { model: 'openai:gpt-4o' });
 *
 * @example
 * // Add custom plugins alongside built-in ones
 * import { customPlugin } from './customPlugin';
 *
 * const { result } = await runPrompt(async ({ defCustomFeature, $ }) => {
 *   // Both built-in plugins and customPlugin are available
 * }, { model: 'openai:gpt-4o', plugins: [customPlugin] });
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
    const { onStepFinish, onFinish, ...otherOptions } = config.options;

    // Wire up hooks through the builder's hook system
    if (onStepFinish) {
      prompt.addOnStepFinish(onStepFinish as any);
    }
    if (onFinish) {
      prompt.addOnFinish(onFinish as any);
    }

    // Apply remaining options
    prompt.withOptions(otherOptions);
  }

  // Get plugins (default to empty array) and merge with built-in plugins
  const userPlugins = (config.plugins ?? []) as P;
  const allPlugins = [...builtInPlugins, ...userPlugins] as readonly Plugin[];

  // Set plugins on the prompt for re-execution support
  prompt.setPlugins(allPlugins);

  // Set the prompt function for re-execution
  prompt.setPromptFn(promptFn as (prompt: any) => Promise<void>);

  // Wrap prompt in a proxy that auto-binds methods (including plugin methods)
  const proxiedPrompt = createPromptProxyWithPlugins(prompt, allPlugins);

  // Execute the prompt function once to set up initial state
  await promptFn(proxiedPrompt as any);

  // Run with stateful re-execution (will re-execute promptFn on subsequent steps)
  const result = prompt.run();

  return { result, prompt };
};