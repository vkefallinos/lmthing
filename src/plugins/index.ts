/**
 * lmthing Plugin System
 *
 * This module exports built-in plugins and utilities for creating custom plugins.
 *
 * @example
 * // Import built-in plugins
 * import { taskListPlugin } from 'lmthing/plugins';
 *
 * // Use with runPrompt
 * runPrompt(({ defTaskList }) => {
 *   defTaskList([...]);
 * }, { plugins: [taskListPlugin] });
 *
 * @example
 * // Create a custom plugin
 * import { StatefulPrompt } from 'lmthing';
 *
 * export function defCustomFeature(this: StatefulPrompt, config: Config) {
 *   const [state, setState] = this.defState('customState', initialValue);
 *   this.defTool('customTool', 'description', schema, handler);
 *   return [state, setState];
 * }
 *
 * export const customPlugin = { defCustomFeature };
 */

// Built-in plugins
export { taskListPlugin, defTaskList } from './taskList';

// Plugin types
export type { Task, TaskStatus, StartTaskResult, CompleteTaskResult } from './types';
