import { createAzure } from '@ai-sdk/azure';

/**
 * Azure OpenAI Provider Configuration
 *
 * Supports Azure OpenAI Service models
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/azure
 */

export interface AzureConfig {
  apiKey?: string;
  resourceName?: string;
  baseURL?: string;
}

/**
 * Create an Azure OpenAI provider instance
 *
 * @param config - Configuration options for Azure OpenAI
 * @returns Azure OpenAI provider instance
 *
 * @example
 * ```typescript
 * const azure = createAzureProvider({
 *   apiKey: process.env.AZURE_API_KEY,
 *   resourceName: process.env.AZURE_RESOURCE_NAME
 * });
 *
 * const model = azure('your-deployment-name');
 * ```
 */
export function createAzureProvider(config?: AzureConfig) {
  return createAzure({
    apiKey: config?.apiKey || process.env.AZURE_API_KEY,
    resourceName: config?.resourceName || process.env.AZURE_RESOURCE_NAME,
    baseURL: config?.baseURL,
  });
}

/**
 * Default Azure OpenAI provider instance
 * Uses environment variables for configuration
 */
export const azure = createAzureProvider();
