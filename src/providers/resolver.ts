import { LanguageModelV2 } from '@ai-sdk/provider';
import { providers } from './index';

/**
 * Resolves a model identifier to a LanguageModelV2 instance
 *
 * @param model - Either a LanguageModelV2 instance or a string in the format "provider:modelId"
 * @returns A LanguageModelV2 instance
 * @throws Error if the provider is not found or the format is invalid
 *
 * @example
 * ```typescript
 * // Using string format
 * const model1 = resolveModel('openai:gpt-4o');
 * const model2 = resolveModel('anthropic:claude-3-5-sonnet-20241022');
 *
 * // Using direct model instance (passes through)
 * import { openai } from 'lmthing/providers';
 * const model3 = resolveModel(openai('gpt-4o'));
 * ```
 */
export function resolveModel(model: LanguageModelV2 | string): LanguageModelV2 {
  // If it's already a model instance, return it
  if (typeof model !== 'string') {
    return model;
  }

  // Parse the string format "provider:modelId"
  // Use indexOf to handle model IDs that contain colons (e.g., bedrock models like "anthropic.claude-3-5-sonnet-20241022-v2:0")
  const colonIndex = model.indexOf(':');

  if (colonIndex === -1) {
    throw new Error(
      `Invalid model format: "${model}". Expected format is "provider:modelId" (e.g., "openai:gpt-4o")`
    );
  }

  const providerName = model.slice(0, colonIndex);
  const modelId = model.slice(colonIndex + 1);

  // Get the provider from the registry
  const provider = providers[providerName as keyof typeof providers];

  if (!provider) {
    const availableProviders = Object.keys(providers).join(', ');
    throw new Error(
      `Unknown provider: "${providerName}". Available providers: ${availableProviders}`
    );
  }

  // Create and return the model instance
  return provider(modelId);
}

/**
 * Type for model input - can be either a model instance or a string identifier
 */
export type ModelInput = LanguageModelV2 | string;
