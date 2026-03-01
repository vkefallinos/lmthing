/**
 * Generic provider factory to reduce boilerplate across provider modules.
 */

export interface BaseProviderConfig {
  apiKey?: string;
  baseURL?: string;
}

export interface ProviderDefinition<
  TConfig = BaseProviderConfig,
  TModels extends Record<string, string> = Record<string, string>
> {
  /** Name of the provider (e.g., 'mistral', 'openai') */
  name: string;
  /** Environment variable name for the API key (e.g., 'MISTRAL_API_KEY') */
  envKey: string;
  /** The AI SDK factory function (e.g., createMistral from @ai-sdk/mistral) */
  sdkFactory: (config: any) => any;
  /** Map config to SDK-specific format (for providers with extra options) */
  mapConfig?: (config: TConfig) => any;
  /** Model ID constants */
  models: TModels;
}

export interface ProviderModule<
  TConfig = BaseProviderConfig,
  TModels extends Record<string, string> = Record<string, string>
> {
  /** Create a configured provider instance */
  createProvider: (config?: TConfig) => ReturnType<any>;
  /** Default provider instance using env vars */
  provider: ReturnType<any>;
  /** Model ID constants */
  models: TModels;
}

/**
 * Create a provider module with standard exports.
 *
 * @example
 * ```typescript
 * import { createMistral } from '@ai-sdk/mistral';
 *
 * const { createProvider, provider, models } = defineProvider({
 *   name: 'mistral',
 *   envKey: 'MISTRAL_API_KEY',
 *   sdkFactory: createMistral,
 *   models: {
 *     LARGE_LATEST: 'mistral-large-latest',
 *     SMALL_LATEST: 'mistral-small-latest',
 *   }
 * });
 *
 * export { createProvider as createMistralProvider, provider as mistral, models as MistralModels };
 * ```
 */
export function defineProvider<
  TConfig = BaseProviderConfig,
  TModels extends Record<string, string> = Record<string, string>
>(
  definition: ProviderDefinition<TConfig, TModels>
): ProviderModule<TConfig, TModels> {
  const { name, envKey, sdkFactory, mapConfig, models } = definition;

  const createProvider = (config?: TConfig) => {
    const baseConfig = {
      apiKey: (config as any)?.apiKey || process.env[envKey],
      baseURL: (config as any)?.baseURL,
    };

    const finalConfig = mapConfig
      ? mapConfig({ ...baseConfig, ...config } as TConfig)
      : baseConfig;

    return sdkFactory(finalConfig);
  };

  return {
    createProvider,
    provider: createProvider(),
    models,
  };
}
