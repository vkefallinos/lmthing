export { runPrompt } from './runPrompt';

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
  DefinitionProxy,
  PromptContext,
  ToolCollection,
  SystemCollection,
  VariableCollection,
  LastToolInfo,
  StepModifier,
  // Plugin system types
  Plugin,
  PluginMethod,
  MergePlugins,
  PromptWithPlugins
} from './types';

// Export PromptConfig from runPrompt
export type { PromptConfig } from './runPrompt';

// Export all provider-related functionality
export * from './providers';
