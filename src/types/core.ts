/**
 * Core type definitions for lmthing prompts.
 */

import type { ZodType } from 'zod';
import type { ToolCollection, SystemCollection, VariableCollection } from './collections';

/**
 * Type alias for Zod schemas used in tool and agent definitions.
 * Using ZodType<any> allows any Zod schema while providing basic type info.
 *
 * @category Types
 */
export type ZodSchema<T = any> = ZodType<T>;

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
