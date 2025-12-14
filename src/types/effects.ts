/**
 * Effect system type definitions.
 */

import type { PromptContext } from './core';

/**
 * Step modifier function type
 */
export type StepModifier = (
  aspect: 'messages' | 'tools' | 'systems' | 'variables',
  items: any[]
) => void;

/**
 * Effect definition for StatefulPrompt
 */
export interface Effect {
  id: number;
  callback: (prompt: PromptContext, step: StepModifier) => void;
  dependencies?: any[];
}

/**
 * Step modifications accumulator for StatefulPrompt
 */
export interface StepModifications {
  messages?: any[];
  tools?: any[];
  systems?: { name: string; value: string }[];
  variables?: { name: string; type: string; value: any }[];
}
