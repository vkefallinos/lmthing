import { createOpenAI } from '@ai-sdk/openai';

/**
 * Custom Provider Configuration
 *
 * Allows creating custom OpenAI-compatible providers from environment variables.
 *
 * Environment variable format:
 * - {NAME}_API_KEY: API key for the provider
 * - {NAME}_API_BASE: Base URL for the API endpoint
 * - {NAME}_API_TYPE: Must be set to "openai" to identify as custom provider
 * - {NAME}_API_NAME: (Optional) Human-readable name for the provider
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
 * - {NAME}_API_KEY
 * - {NAME}_API_BASE
 * - {NAME}_API_TYPE (must be "openai")
 *
 * @returns Array of custom provider configurations
 *
 * @example
 * ```bash
 * # .env
 * ZAI_API_KEY=your-key
 * ZAI_API_BASE=https://api.z.ai/api/coding/paas/v4
 * ZAI_API_TYPE=openai
 * OPENROUTER_API_KEY=your-key
 * OPENROUTER_API_BASE=https://openrouter.ai/api/v1
 * OPENROUTER_API_TYPE=openai
 * ```
 */
export function scanCustomProviders(): CustomProviderConfig[] {
  const configs: CustomProviderConfig[] = [];
  const processedPrefixes = new Set<string>();

  // Scan all environment variables
  for (const key in process.env) {
    // Look for {NAME}_API_KEY pattern
    const match = key.match(/^([A-Z0-9_]+)_API_KEY$/);
    if (match) {
      const name = match[1];

      // Skip if already processed
      if (processedPrefixes.has(name)) {
        continue;
      }

      // Skip built-in providers (they don't use this pattern)
      const builtInPrefixes = ['OPENAI', 'ANTHROPIC', 'GOOGLE_GENERATIVE_AI', 'GOOGLE_VERTEX', 'MISTRAL', 'AZURE', 'GROQ', 'COHERE', 'AWS'];
      if (builtInPrefixes.includes(name)) {
        continue;
      }

      const apiType = process.env[`${name}_API_TYPE`];

      // Only process if API_TYPE is set to "openai"
      if (apiType !== 'openai') {
        continue;
      }

      const apiKey = process.env[key];
      const baseURL = process.env[`${name}_API_BASE`];
      const displayName = process.env[`${name}_API_NAME`] || name.toLowerCase();

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
