/**
 * Effect system type definitions.
 */

import type { ModelMessage } from 'ai';
import type { PromptContext } from './core';
import type { SystemEntry, VariableEntry, ToolEntry } from './collections';

/**
 * Items that can be added via step modifier for each aspect
 *
 * @category Hooks
 */
export type StepModifierItems = {
  messages: ModelMessage[];
  tools: ToolEntry[];
  systems: SystemEntry[];
  variables: VariableEntry[];
};

/**
 * Step modifier function type
 *
 * @category Hooks
 */
export type StepModifier = <K extends keyof StepModifierItems>(
  aspect: K,
  items: StepModifierItems[K]
) => void;

/**
 * Effect definition for StatefulPrompt
 *
 * @category Hooks
 */
export interface Effect {
  id: number;
  callback: (prompt: PromptContext, step: StepModifier) => void;
  dependencies?: unknown[];
}

/**
 * Step modifications accumulator for StatefulPrompt
 *
 * @category Types
 */
export interface StepModifications {
  messages?: ModelMessage[];
  tools?: ToolEntry[];
  systems?: SystemEntry[];
  variables?: VariableEntry[];
}
