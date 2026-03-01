import { createCohere } from '@ai-sdk/cohere';
import { defineProvider, BaseProviderConfig } from './factory';

/**
 * Cohere Provider Configuration
 *
 * Supports Cohere's Command models
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/cohere
 */

export interface CohereConfig extends BaseProviderConfig {}

const module = defineProvider({
  name: 'cohere',
  envKey: 'COHERE_API_KEY',
  sdkFactory: createCohere,
  models: {
    COMMAND_R_PLUS: 'command-r-plus',
    COMMAND_R: 'command-r',
    COMMAND: 'command',
    COMMAND_LIGHT: 'command-light',
  },
});

/**
 * Create a Cohere provider instance
 *
 * @param config - Configuration options for Cohere
 * @returns Cohere provider instance
 *
 * @example
 * ```typescript
 * const cohere = createCohereProvider({
 *   apiKey: process.env.COHERE_API_KEY
 * });
 *
 * const model = cohere('command-r-plus');
 * ```
 */
export const createCohereProvider = module.createProvider;

/**
 * Default Cohere provider instance
 * Uses environment variables for configuration
 */
export const cohere = module.provider;

/**
 * Common Cohere model identifiers
 */
export const CohereModels = module.models;

export type CohereModel = typeof CohereModels[keyof typeof CohereModels];
