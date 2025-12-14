/**
 * Core type definitions for lmthing prompts.
 */

import type { ToolCollection, SystemCollection, VariableCollection } from './collections';

/**
 * Interface for the proxy objects returned by def, defSystem, defTool, defAgent
 *
 * @category Types
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
 *
 * @category Types
 */
export interface Resettable {
  /**
   * Reset the manager to its initial state.
   * Clears all stored data and resets any internal counters.
   */
  reset(): void;
}

/**
 * Information about the last tool call
 *
 * @category Types
 */
export interface LastToolInfo {
  toolName: string;
  args: any;
  output: any;
}

/**
 * Interface for the prompt context passed to effects
 *
 * @category Types
 */
export interface PromptContext {
  messages: any[];
  tools: ToolCollection;
  systems: SystemCollection;
  variables: VariableCollection;
  lastTool: LastToolInfo | null;
  stepNumber: number;
}
