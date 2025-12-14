import { createAnthropic } from '@ai-sdk/anthropic';
import { defineProvider, BaseProviderConfig } from './factory';

/**
 * Anthropic Provider Configuration
 *
 * Supports Claude models including Claude 3.5 Sonnet, Claude 3 Opus, and Claude 3 Haiku
 *
 * @category Providers
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic
 */

export interface AnthropicConfig extends BaseProviderConfig {}

const module = defineProvider({
  name: 'anthropic',
  envKey: 'ANTHROPIC_API_KEY',
  sdkFactory: createAnthropic,
  models: {
    CLAUDE_3_5_SONNET: 'claude-3-5-sonnet-20241022',
    CLAUDE_3_5_SONNET_LEGACY: 'claude-3-5-sonnet-20240620',
    CLAUDE_3_OPUS: 'claude-3-opus-20240229',
    CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
    CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
  },
});

/**
 * Create an Anthropic provider instance
 *
 * @category Providers
 *
 * @param config - Configuration options for Anthropic
 * @returns Anthropic provider instance
 *
 * @example
 * ```typescript
 * const anthropic = createAnthropicProvider({
 *   apiKey: process.env.ANTHROPIC_API_KEY
 * });
 *
 * const model = anthropic('claude-3-5-sonnet-20241022');
 * ```
 */
export const createAnthropicProvider = module.createProvider;

/**
 * Default Anthropic provider instance
 * Uses environment variables for configuration
 *
 * @category Providers
 */
export const anthropic = module.provider;

/**
 * Common Anthropic model identifiers
 *
 * @category Providers
 */
export const AnthropicModels = module.models;

export type AnthropicModel = typeof AnthropicModels[keyof typeof AnthropicModels];
