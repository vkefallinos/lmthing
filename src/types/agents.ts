/**
 * Agent-related type definitions.
 */

import type { Plugin } from './plugins';
import type { ZodSchema } from './core';
import type { ModelInput } from '../providers/resolver';

/**
 * Options for defAgent and agent functions
 *
 * @category Agents
 *
 * @property model - Override the language model for this agent
 * @property responseSchema - Optional Zod schema for validating/formatting agent responses
 * @property system - Custom system prompt for the agent
 * @property plugins - Additional plugins for the agent context
 */
export interface AgentOptions {
  model?: ModelInput;
  responseSchema?: ZodSchema;
  system?: string;
  plugins?: readonly Plugin[];
  [key: string]: unknown;  // Allow additional options
}
