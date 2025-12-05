import { createOpenAI } from '@ai-sdk/openai';

/**
 * Custom Provider Configuration
 *
 * Allows creating custom OpenAI-compatible providers from environment variables.
 *
 * Environment variable format:
 * - {PREFIX}_API_KEY: API key for the provider
 * - {PREFIX}_BASE_URL: Base URL for the API endpoint
 * - {PREFIX}_NAME: (Optional) Human-readable name for the provider
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/openai#provider-instance
 */

export interface CustomProviderConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  prefix: string;
}

/**
 * Scans environment variables for custom provider configurations
 *
 * Looks for patterns like:
 * - CUSTOM_PROVIDER_{NAME}_API_KEY
 * - CUSTOM_PROVIDER_{NAME}_BASE_URL
 *
 * @returns Array of custom provider configurations
 *
 * @example
 * ```bash
 * # .env
 * CUSTOM_PROVIDER_ZAI_API_KEY=your-key
 * CUSTOM_PROVIDER_ZAI_BASE_URL=https://api.z.ai/v1
 * CUSTOM_PROVIDER_OPENROUTER_API_KEY=your-key
 * CUSTOM_PROVIDER_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
 * ```
 */
export function scanCustomProviders(): CustomProviderConfig[] {
  const configs: CustomProviderConfig[] = [];
  const processedPrefixes = new Set<string>();

  // Scan all environment variables
  for (const key in process.env) {
    // Look for CUSTOM_PROVIDER_{NAME}_API_KEY pattern
    const match = key.match(/^CUSTOM_PROVIDER_([A-Z0-9_]+)_API_KEY$/);
    if (match) {
      const name = match[1];

      if (processedPrefixes.has(name)) {
        continue;
      }

      const apiKey = process.env[key];
      const baseURL = process.env[`CUSTOM_PROVIDER_${name}_BASE_URL`];
      const displayName = process.env[`CUSTOM_PROVIDER_${name}_NAME`] || name.toLowerCase();

      if (apiKey && baseURL) {
        configs.push({
          name: displayName,
          apiKey,
          baseURL,
          prefix: name,
        });
        processedPrefixes.add(name);
      }
    }
  }

  return configs;
}

/**
 * Creates a provider instance from a custom configuration
 *
 * @param config - Custom provider configuration
 * @returns OpenAI-compatible provider instance
 *
 * @example
 * ```typescript
 * const config = {
 *   name: 'zai',
 *   apiKey: 'your-key',
 *   baseURL: 'https://api.z.ai/v1',
 *   prefix: 'ZAI'
 * };
 * const provider = createCustomProvider(config);
 * const model = provider('gpt-4');
 * ```
 */
export function createCustomProvider(config: CustomProviderConfig) {
  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    compatibility: 'compatible',
  });
}

/**
 * Registry of custom providers loaded from environment variables
 */
let customProvidersRegistry: Map<string, ReturnType<typeof createOpenAI>> | null = null;

/**
 * Gets or initializes the custom providers registry
 *
 * @returns Map of custom provider names to provider instances
 */
export function getCustomProviders(): Map<string, ReturnType<typeof createOpenAI>> {
  if (!customProvidersRegistry) {
    customProvidersRegistry = new Map();
    const configs = scanCustomProviders();

    for (const config of configs) {
      const provider = createCustomProvider(config);
      customProvidersRegistry.set(config.name, provider);
    }
  }

  return customProvidersRegistry;
}

/**
 * Checks if a provider name is a custom provider
 *
 * @param name - Provider name to check
 * @returns True if the provider is a custom provider
 */
export function isCustomProvider(name: string): boolean {
  return getCustomProviders().has(name);
}

/**
 * Gets a custom provider by name
 *
 * @param name - Name of the custom provider
 * @returns Custom provider instance or undefined
 */
export function getCustomProvider(name: string) {
  return getCustomProviders().get(name);
}

/**
 * Lists all available custom provider names
 *
 * @returns Array of custom provider names
 */
export function listCustomProviders(): string[] {
  return Array.from(getCustomProviders().keys());
}

/**
 * Resets the custom providers registry
 * This is primarily used for testing purposes
 *
 * @internal
 */
export function resetCustomProvidersRegistry(): void {
  customProvidersRegistry = null;
}
