export { runPrompt, createPluginArray } from './runPrompt';

// Re-export built-in plugins array for reference
export { builtInPlugins } from './plugins';

// Export error classes
export {
  LmthingError,
  ProviderError,
  ValidationError,
  PluginError,
  PromptError,
  ErrorCodes,
  type ErrorCode
} from './errors';

// Export prompt functionality (StatefulPrompt is now the main Prompt class)
export {
  StatefulPrompt,
  StatefulPrompt as Prompt,  // Export as Prompt for backward compatibility
  tool,
  type SubToolDefinition,
  agent,
  type SubAgentDefinition,
  type DefHookResult
} from './StatefulPrompt';

// Export types for the stateful prompt system
export type {
  // Core types
  DefinitionProxy,
  PromptContext,
  LastToolInfo,
  ZodSchema,
  // Collection types
  ToolCollection,
  SystemCollection,
  VariableCollection,
  SystemEntry,
  VariableEntry,
  VariableType,
  ToolEntry,
  // Effect types
  StepModifier,
  StepModifierItems,
  Effect,
  StepModifications,
  // Tool options & callbacks
  ToolOptions,
  ToolEventCallback,
  ToolCallbackResult,
  // Agent options
  AgentOptions,
  // Plugin system types
  Plugin,
  PluginMethod,
  MergePlugins,
  PromptWithPlugins
} from './types/index';

// Export definition types for advanced usage
export type { DefinitionType } from './definitions';

// Export PromptConfig from runPrompt
export type { PromptConfig } from './runPrompt';

// Export all provider-related functionality
export * from './providers';
