/**
 * Lifecycle Hooks Plugin for lmthing
 *
 * Provides a defLifecycleHook method that registers lifecycle callbacks
 * at the prompt level, similar to Claude Code's PostToolUse/PreToolUse hooks.
 *
 * Available hooks:
 * - onBeforeStep: Runs before each step execution
 * - onAfterStep: Runs after each step completes
 * - onBeforeToolUse: Runs before any tool is executed
 * - onAfterToolUse: Runs after any tool completes
 *
 * @example
 * import { lifecycleHooksPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defLifecycleHook, defTool, $ }) => {
 *   defLifecycleHook('onAfterToolUse', async ({ toolName, args, output }) => {
 *     console.log(`Tool ${toolName} completed with:`, output);
 *   });
 *
 *   defTool('search', 'Search', z.object({ q: z.string() }), searchFn);
 *   $`Search for something`;
 * }, { model: 'openai:gpt-4o', plugins: [lifecycleHooksPlugin] });
 */

import type { StatefulPrompt } from '../StatefulPrompt';
import type { PromptContext } from '../types';

/**
 * Lifecycle hook event types
 */
export type LifecycleHookType =
  | 'onBeforeStep'
  | 'onAfterStep'
  | 'onBeforeToolUse'
  | 'onAfterToolUse';

/**
 * Context provided to step-level lifecycle hooks
 */
export interface StepHookContext {
  stepNumber: number;
  messages: any[];
}

/**
 * Context provided to tool-level lifecycle hooks
 */
export interface ToolHookContext {
  toolName: string;
  args: any;
  output?: any;
  error?: Error | unknown;
}

/**
 * Callback signature for step hooks
 */
export type StepHookCallback = (context: StepHookContext) => void | Promise<void>;

/**
 * Callback signature for tool hooks
 */
export type ToolHookCallback = (context: ToolHookContext) => void | Promise<void>;

/**
 * Union of hook callbacks based on hook type
 */
export type LifecycleHookCallback<T extends LifecycleHookType> =
  T extends 'onBeforeStep' | 'onAfterStep' ? StepHookCallback :
  T extends 'onBeforeToolUse' | 'onAfterToolUse' ? ToolHookCallback :
  never;

const HOOKS_STATE_KEY = '_lifecycleHooks';

/**
 * Internal hook storage structure
 */
interface LifecycleHooksState {
  onBeforeStep: StepHookCallback[];
  onAfterStep: StepHookCallback[];
  onBeforeToolUse: ToolHookCallback[];
  onAfterToolUse: ToolHookCallback[];
}

/**
 * Creates a lifecycle hook registration system.
 *
 * @category Plugins
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @param hookType - The lifecycle event to hook into
 * @param callback - Function to call when the event occurs
 */
export function defLifecycleHook<T extends LifecycleHookType>(
  this: StatefulPrompt,
  hookType: T,
  callback: LifecycleHookCallback<T>
): void {
  // Get or initialize hooks state
  let hooks = this.getState<LifecycleHooksState>(HOOKS_STATE_KEY);
  if (!hooks) {
    const [, setHooks] = this.defState<LifecycleHooksState>(HOOKS_STATE_KEY, {
      onBeforeStep: [],
      onAfterStep: [],
      onBeforeToolUse: [],
      onAfterToolUse: [],
    });
    hooks = this.getState<LifecycleHooksState>(HOOKS_STATE_KEY)!;
  }

  // Register the callback
  hooks[hookType].push(callback as any);

  // Set up step-level hooks via defEffect (runs once due to stable dependency)
  this.defEffect((ctx: PromptContext) => {
    const currentHooks = this.getState<LifecycleHooksState>(HOOKS_STATE_KEY);
    if (!currentHooks) return;

    // Execute onBeforeStep hooks
    for (const hook of currentHooks.onBeforeStep) {
      hook({ stepNumber: ctx.stepNumber, messages: ctx.messages });
    }

    // Execute onAfterToolUse hooks if a tool was just called
    if (ctx.lastTool) {
      for (const hook of currentHooks.onAfterToolUse) {
        hook({
          toolName: ctx.lastTool.toolName,
          args: ctx.lastTool.args,
          output: ctx.lastTool.output,
        });
      }
    }
  });
}

/**
 * Lifecycle Hooks Plugin
 *
 * @category Plugins
 *
 * @example
 * import { lifecycleHooksPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defLifecycleHook }) => {
 *   defLifecycleHook('onAfterToolUse', async ({ toolName, output }) => {
 *     console.log(`Tool ${toolName} returned:`, output);
 *   });
 * }, { plugins: [lifecycleHooksPlugin] });
 */
export const lifecycleHooksPlugin = {
  defLifecycleHook,
};
