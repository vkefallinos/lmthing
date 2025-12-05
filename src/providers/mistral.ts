import { createMistral } from '@ai-sdk/mistral';

/**
 * Mistral AI Provider Configuration
 *
 * Supports Mistral models including Mistral Large, Medium, and Small
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/mistral
 */

export interface MistralConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Create a Mistral provider instance
 *
 * @param config - Configuration options for Mistral
 * @returns Mistral provider instance
 *
 * @example
 * ```typescript
 * const mistral = createMistralProvider({
 *   apiKey: process.env.MISTRAL_API_KEY
 * });
 *
 * const model = mistral('mistral-large-latest');
 * ```
 */
export function createMistralProvider(config?: MistralConfig) {
  return createMistral({
    apiKey: config?.apiKey || process.env.MISTRAL_API_KEY,
    baseURL: config?.baseURL,
  });
}

/**
 * Default Mistral provider instance
 * Uses environment variables for configuration
 */
export const mistral = createMistralProvider();

/**
 * Common Mistral model identifiers
 */
export const MistralModels = {
  LARGE_LATEST: 'mistral-large-latest',
  MEDIUM_LATEST: 'mistral-medium-latest',
  SMALL_LATEST: 'mistral-small-latest',
  TINY: 'mistral-tiny',
  CODESTRAL: 'codestral-latest',
  MIXTRAL_8X7B: 'open-mixtral-8x7b',
  MIXTRAL_8X22B: 'open-mixtral-8x22b',
} as const;

export type MistralModel = typeof MistralModels[keyof typeof MistralModels];
