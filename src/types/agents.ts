/**
 * Agent-related type definitions.
 */

import type { Plugin } from './plugins';

/**
 * Options for defAgent and agent functions
 *
 * @property model - Override the language model for this agent
 * @property responseSchema - Optional Zod schema for validating/formatting agent responses
 * @property system - Custom system prompt for the agent
 * @property plugins - Additional plugins for the agent context
 */
export interface AgentOptions {
  model?: any;  // ModelInput from providers/resolver
  responseSchema?: any;  // Zod schema
  system?: string;
  plugins?: readonly Plugin[];
  [key: string]: any;  // Allow additional options
}
