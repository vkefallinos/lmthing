/**
 * Central type exports for lmthing.
 *
 * This file re-exports all types for backward compatibility.
 * Types are organized into focused modules:
 * - core.ts: PromptContext, DefinitionProxy, LastToolInfo, Resettable, ZodSchema
 * - collections.ts: ToolCollection, SystemCollection, VariableCollection, SystemEntry, VariableEntry, ToolEntry
 * - tools.ts: ToolOptions, ToolEventCallback, ToolCallbackResult
 * - agents.ts: AgentOptions
 * - effects.ts: Effect, StepModifier, StepModifications, StepModifierItems
 * - plugins.ts: Plugin, PluginMethod, MergePlugins, PromptWithPlugins
 */

// Core types
export type { DefinitionProxy, Resettable, LastToolInfo, PromptContext, ZodSchema } from './core';

// Collection types (including entry types for advanced usage)
export type {
  ToolCollection,
  SystemCollection,
  VariableCollection,
  SystemEntry,
  VariableEntry,
  VariableType,
  ToolEntry
} from './collections';

// Tool types
export type { ToolCallbackResult, ToolEventCallback, ToolOptions } from './tools';

// Agent types
export type { AgentOptions } from './agents';

// Effect types
export type { StepModifier, Effect, StepModifications, StepModifierItems } from './effects';

// Plugin types
export type { PluginMethod, Plugin, MergePlugins, PromptWithPlugins } from './plugins';
