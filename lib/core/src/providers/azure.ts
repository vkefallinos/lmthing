import { createAzure } from '@ai-sdk/azure';
import { defineProvider, BaseProviderConfig } from './factory';

/**
 * Azure OpenAI Provider Configuration
 *
 * Supports Azure OpenAI Service models
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/azure
 */

export interface AzureConfig extends BaseProviderConfig {
  resourceName?: string;
}

const module = defineProvider<AzureConfig, {}>({
  name: 'azure',
  envKey: 'AZURE_API_KEY',
  sdkFactory: createAzure,
  mapConfig: (config) => ({
    apiKey: config.apiKey,
    resourceName: config.resourceName || process.env.AZURE_RESOURCE_NAME,
    baseURL: config.baseURL,
  }),
  models: {},
});

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
export const createAzureProvider = module.createProvider;

/**
 * Default Azure OpenAI provider instance
 * Uses environment variables for configuration
 */
export const azure = module.provider;
