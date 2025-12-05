import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * Anthropic Provider Configuration
 *
 * Supports Claude models including Claude 3.5 Sonnet, Claude 3 Opus, and Claude 3 Haiku
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic
 */

export interface AnthropicConfig {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Create an Anthropic provider instance
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
export function createAnthropicProvider(config?: AnthropicConfig) {
  return createAnthropic({
    apiKey: config?.apiKey || process.env.ANTHROPIC_API_KEY,
    baseURL: config?.baseURL,
  });
}

/**
 * Default Anthropic provider instance
 * Uses environment variables for configuration
 */
export const anthropic = createAnthropicProvider();

/**
 * Common Anthropic model identifiers
 */
export const AnthropicModels = {
  CLAUDE_3_5_SONNET: 'claude-3-5-sonnet-20241022',
  CLAUDE_3_5_SONNET_LEGACY: 'claude-3-5-sonnet-20240620',
  CLAUDE_3_OPUS: 'claude-3-opus-20240229',
  CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
  CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
} as const;

export type AnthropicModel = typeof AnthropicModels[keyof typeof AnthropicModels];
