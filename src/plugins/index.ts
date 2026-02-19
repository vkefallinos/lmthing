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

// Import built-in plugins for the builtInPlugins array
import { taskListPlugin } from './taskList';
import { taskGraphPlugin } from './taskGraph';
import { functionPlugin } from './function';
import { zeroStepPlugin } from './zeroStep';

// Re-export individual plugins and utilities
export { taskListPlugin, defTaskList } from './taskList';
export { taskGraphPlugin, defTaskGraph, detectCycles, validateTaskGraph, normalizeTaskGraph, getUnblockedTasks } from './taskGraph';
export { functionPlugin, defFunction, defFunctionAgent, func, funcAgent } from './function';
export { zeroStepPlugin, defMethod } from './zeroStep';
export type { MethodDefinition } from './zeroStep';

/**
 * Array of all built-in plugins that are auto-loaded on every prompt instance.
 *
 * These plugins are automatically included when using runPrompt(), so you don't
 * need to manually specify them in the plugins array.
 *
 * @category Plugins
 *
 * @example
 * // Built-in plugins are automatically available
 * const { result } = await runPrompt(async ({ defTaskList, defTaskGraph, defFunction, $ }) => {
 *   const [tasks, setTasks] = defTaskList([...]);
 *   const [graph, setGraph] = defTaskGraph([...]);
 *   defFunction('calculate', 'Add numbers', schema, handler);
 *   $`Complete the tasks`;
 * }, { model: 'openai:gpt-4o' });
 */
export const builtInPlugins = [taskListPlugin, taskGraphPlugin, functionPlugin, zeroStepPlugin] as const;

// Plugin types
export type {
  Task, TaskStatus, StartTaskResult, CompleteTaskResult, FailTaskResult,
  TaskNode, TaskNodeStatus, GenerateTaskGraphResult, GetUnblockedTasksResult, UpdateTaskStatusResult,
} from './types';
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
} from './function';
