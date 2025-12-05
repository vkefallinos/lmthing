import { createOpenAI } from '@ai-sdk/openai';

/**
 * OpenAI Provider Configuration
 *
 * Supports GPT-4, GPT-3.5, and other OpenAI models
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/openai
 */

export interface OpenAIConfig {
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  project?: string;
}

/**
 * Create an OpenAI provider instance
 *
 * @param config - Configuration options for OpenAI
 * @returns OpenAI provider instance
 *
 * @example
 * ```typescript
 * const openai = createOpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY
 * });
 *
 * const model = openai('gpt-4o');
 * ```
 */
export function createOpenAIProvider(config?: OpenAIConfig) {
  return createOpenAI({
    apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
    baseURL: config?.baseURL,
    organization: config?.organization,
    project: config?.project,
  });
}

/**
 * Default OpenAI provider instance
 * Uses environment variables for configuration
 */
export const openai = createOpenAIProvider();

/**
 * Common OpenAI model identifiers
 */
export const OpenAIModels = {
  GPT4O: 'gpt-4o',
  GPT4O_MINI: 'gpt-4o-mini',
  GPT4_TURBO: 'gpt-4-turbo',
  GPT4: 'gpt-4',
  GPT35_TURBO: 'gpt-3.5-turbo',
  O1_PREVIEW: 'o1-preview',
  O1_MINI: 'o1-mini',
} as const;

export type OpenAIModel = typeof OpenAIModels[keyof typeof OpenAIModels];
