/**
 * Plugin system type definitions.
 */

import type { StatefulPrompt } from '../StatefulPrompt';

/**
 * A plugin method that receives StatefulPrompt as `this` context.
 * Plugin methods can use all StatefulPrompt methods like defState, defTool, etc.
 *
 * @category Plugins
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
 * @category Plugins
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
 *
 * @category Plugins
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
 *
 * @category Plugins
 */
export type PromptWithPlugins<P extends readonly Plugin[]> = StatefulPrompt & MergePlugins<P>;
