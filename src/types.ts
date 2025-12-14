/**
 * Interface for the proxy objects returned by def, defSystem, defTool, defAgent
 */
export interface DefinitionProxy {
  name: string;
  value: any;
  toString(): string;
  remind(): void;
}

/**
 * Interface for managers that can be reset to their initial state.
 * Used by StateManager, EffectsManager, and DefinitionTracker.
 */
export interface Resettable {
  /**
   * Reset the manager to its initial state.
   * Clears all stored data and resets any internal counters.
   */
  reset(): void;
}

/**
 * Interface for the prompt context passed to effects
 */
export interface PromptContext {
  messages: any[];
  tools: ToolCollection;
  systems: SystemCollection;
  variables: VariableCollection;
  lastTool: LastToolInfo | null;
  stepNumber: number;
}

/**
 * Collection utility for tools
 */
export interface ToolCollection {
  has(name: string): boolean;
  filter(predicate: (tool: any) => boolean): any[];
  [Symbol.iterator](): Iterator<any>;
  map<U>(callback: (tool: any) => U): U[];
}

/**
 * Collection utility for systems
 */
export interface SystemCollection {
  has(name: string): boolean;
  filter(predicate: (system: { name: string; value: string }) => boolean): { name: string; value: string }[];
  [Symbol.iterator](): Iterator<{ name: string; value: string }>;
  map<U>(callback: (system: { name: string; value: string }) => U): U[];
}

/**
 * Collection utility for variables
 */
export interface VariableCollection {
  has(name: string): boolean;
  filter(predicate: (variable: { name: string; type: string; value: any }) => boolean): { name: string; type: string; value: any }[];
  [Symbol.iterator](): Iterator<{ name: string; type: string; value: any }>;
  map<U>(callback: (variable: { name: string; type: string; value: any }) => U): U[];
}

/**
 * Information about the last tool call
 */
export interface LastToolInfo {
  toolName: string;
  args: any;
  output: any;
}

/**
 * Step modifier function type
 */
export type StepModifier = (
  aspect: 'messages' | 'tools' | 'systems' | 'variables',
  items: any[]
) => void;

/**
 * Effect definition for StatefulPrompt
 */
export interface Effect {
  id: number;
  callback: (prompt: PromptContext, step: StepModifier) => void;
  dependencies?: any[];
}

/**
 * Step modifications accumulator for StatefulPrompt
 */
export interface StepModifications {
  messages?: any[];
  tools?: any[];
  systems?: { name: string; value: string }[];
  variables?: { name: string; type: string; value: any }[];
}

// ============================================================================
// Tool Options & Callbacks Types
// ============================================================================

/**
 * Result returned by tool callbacks (beforeCall, onSuccess, onError)
 * - undefined: output is returned as is
 * - string: returned string is used as the tool output
 * - object: stringified or formatted according to responseSchema
 */
export type ToolCallbackResult = undefined | string | Record<string, any>;

/**
 * Tool event callback signature
 * Receives input and output, returns optional modified output
 */
export type ToolEventCallback = (input: any, output: any) => Promise<ToolCallbackResult> | ToolCallbackResult;

/**
 * Options for defTool and tool functions
 *
 * @property responseSchema - Optional Zod schema for validating/formatting tool responses
 * @property onSuccess - Callback fired when tool executes successfully
 * @property onError - Callback fired when tool throws an error
 * @property beforeCall - Callback fired before tool execution
 */
export interface ToolOptions {
  responseSchema?: any;  // Zod schema
  onSuccess?: ToolEventCallback;
  onError?: ToolEventCallback;
  beforeCall?: ToolEventCallback;
}

// ============================================================================
// Agent Options Types
// ============================================================================

/**
 * Options for defAgent and agent functions
 *
 * @property model - Override the language model for this agent
 * @property responseSchema - Optional Zod schema for validating/formatting agent responses
 * @property system - Custom system prompt for the agent
 * @property plugins - Additional plugins for the agent context
 */
export interface AgentOptions {
  model?: any;  // ModelInput from providers/resolver
  responseSchema?: any;  // Zod schema
  system?: string;
  plugins?: readonly Plugin[];
  [key: string]: any;  // Allow additional options
}

// ============================================================================
// Plugin System Types
// ============================================================================

/**
 * Import StatefulPrompt type for plugin context
 * Note: This creates a forward reference to avoid circular imports
 */
import type { StatefulPrompt } from './StatefulPrompt';

/**
 * A plugin method that receives StatefulPrompt as `this` context.
 * Plugin methods can use all StatefulPrompt methods like defState, defTool, etc.
 *
 * @example
 * function defTaskList(this: StatefulPrompt, tasks: Task[]) {
 *   const [taskList, setTaskList] = this.defState('taskList', tasks);
 *   this.defTool('startTask', ...);
 *   return [taskList, setTaskList];
 * }
 */
export type PluginMethod<Args extends any[] = any[], Return = any> =
  (this: StatefulPrompt, ...args: Args) => Return;

/**
 * A plugin is an object containing named plugin methods.
 * Each method receives the StatefulPrompt instance as `this` when called.
 *
 * @example
 * export const taskListPlugin = {
 *   defTaskList(this: StatefulPrompt, tasks: Task[]) { ... },
 *   defDynamicTaskList(this: StatefulPrompt) { ... }
 * };
 */
export type Plugin = Record<string, PluginMethod>;

/**
 * Utility type to remove the 'this' parameter from a function type.
 * This is needed because plugin methods are pre-bound to the StatefulPrompt instance.
 */
type OmitThisParameter<T> = T extends (this: any, ...args: infer A) => infer R
  ? (...args: A) => R
  : T;

/**
 * Utility type to transform a plugin's methods by removing their 'this' parameter.
 * This reflects that the methods are pre-bound when exposed to users.
 */
type BoundPlugin<P extends Plugin> = {
  [K in keyof P]: OmitThisParameter<P[K]>;
};

/**
 * Utility type to merge multiple plugin types into a single intersection type.
 * Used to combine methods from multiple plugins into one extended prompt type.
 * The 'this' parameter is removed from all plugin methods since they are pre-bound.
 */
export type MergePlugins<P extends readonly Plugin[]> =
  P extends readonly [infer First extends Plugin, ...infer Rest extends readonly Plugin[]]
    ? BoundPlugin<First> & MergePlugins<Rest>
    : P extends readonly Plugin[]
      ? P[number] extends Plugin
        ? { [K in keyof P[number]]: P[number][K] extends PluginMethod ? OmitThisParameter<P[number][K]> : never }
        : {}
      : {};

/**
 * Extended StatefulPrompt type with plugin methods merged in.
 * This type is what the user's prompt function receives.
 * Plugin methods have their 'this' parameter removed since they are pre-bound.
 */
export type PromptWithPlugins<P extends readonly Plugin[]> = StatefulPrompt & MergePlugins<P>;