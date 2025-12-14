import { createOpenAI } from '@ai-sdk/openai';
import { defineProvider, BaseProviderConfig } from './factory';

/**
 * OpenAI Provider Configuration
 *
 * Supports GPT-4, GPT-3.5, and other OpenAI models
 *
 * @category Providers
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/openai
 */

export interface OpenAIConfig extends BaseProviderConfig {
  organization?: string;
  project?: string;
}

const OpenAIModelsObj = {
  GPT4O: 'gpt-4o',
  GPT4O_MINI: 'gpt-4o-mini',
  GPT4_TURBO: 'gpt-4-turbo',
  GPT4: 'gpt-4',
  GPT35_TURBO: 'gpt-3.5-turbo',
  O1_PREVIEW: 'o1-preview',
  O1_MINI: 'o1-mini',
} as const;

const module = defineProvider<OpenAIConfig, typeof OpenAIModelsObj>({
  name: 'openai',
  envKey: 'OPENAI_API_KEY',
  sdkFactory: createOpenAI,
  mapConfig: (config) => ({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization,
    project: config.project,
  }),
  models: OpenAIModelsObj,
});

/**
 * Create an OpenAI provider instance
 *
 * @category Providers
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
export const createOpenAIProvider = module.createProvider;

/**
 * Default OpenAI provider instance
 * Uses environment variables for configuration
 *
 * @category Providers
 */
export const openai = module.provider;

/**
 * Common OpenAI model identifiers
 *
 * @category Providers
 */
export const OpenAIModels = OpenAIModelsObj;

export type OpenAIModel = typeof OpenAIModels[keyof typeof OpenAIModels];
