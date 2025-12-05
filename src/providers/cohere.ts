import { createCohere } from '@ai-sdk/cohere';

/**
 * Cohere Provider Configuration
 *
 * Supports Cohere's Command models
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/cohere
 */

export interface CohereConfig {
  apiKey?: string;
  baseURL?: string;
}

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
export function createCohereProvider(config?: CohereConfig) {
  return createCohere({
    apiKey: config?.apiKey || process.env.COHERE_API_KEY,
    baseURL: config?.baseURL,
  });
}

/**
 * Default Cohere provider instance
 * Uses environment variables for configuration
 */
export const cohere = createCohereProvider();

/**
 * Common Cohere model identifiers
 */
export const CohereModels = {
  COMMAND_R_PLUS: 'command-r-plus',
  COMMAND_R: 'command-r',
  COMMAND: 'command',
  COMMAND_LIGHT: 'command-light',
} as const;

export type CohereModel = typeof CohereModels[keyof typeof CohereModels];
