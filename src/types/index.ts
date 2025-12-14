/**
 * Central type exports for lmthing.
 *
 * This file re-exports all types for backward compatibility.
 * Types are organized into focused modules:
 * - core.ts: PromptContext, DefinitionProxy, LastToolInfo, Resettable
 * - collections.ts: ToolCollection, SystemCollection, VariableCollection
 * - tools.ts: ToolOptions, ToolEventCallback, ToolCallbackResult
 * - agents.ts: AgentOptions
 * - effects.ts: Effect, StepModifier, StepModifications
 * - plugins.ts: Plugin, PluginMethod, MergePlugins, PromptWithPlugins
 */

// Core types
export type { DefinitionProxy, Resettable, LastToolInfo, PromptContext } from './core';

// Collection types
export type { ToolCollection, SystemCollection, VariableCollection } from './collections';

// Tool types
export type { ToolCallbackResult, ToolEventCallback, ToolOptions } from './tools';

// Agent types
export type { AgentOptions } from './agents';

// Effect types
export type { StepModifier, Effect, StepModifications } from './effects';

// Plugin types
export type { PluginMethod, Plugin, MergePlugins, PromptWithPlugins } from './plugins';
