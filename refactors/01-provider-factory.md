# Refactor 01: Create a Generic Provider Factory

## Problem

All 8+ provider files in `src/providers/` follow an identical pattern with ~600 lines of boilerplate code. Each provider file contains:

1. An interface `{Name}Config` with optional `apiKey` and `baseURL` fields
2. A function `create{Name}Provider(config?)` that wraps the AI SDK factory
3. A default export `const {name} = create{Name}Provider()`
4. A models object `{Name}Models` with model ID constants
5. A type `{Name}Model` derived from the models object

## Current Pattern (repeated in each file)

```typescript
// src/providers/mistral.ts (and similar for openai.ts, anthropic.ts, etc.)
import { createMistral } from '@ai-sdk/mistral';

export interface MistralConfig {
  apiKey?: string;
  baseURL?: string;
}

export function createMistralProvider(config?: MistralConfig) {
  return createMistral({
    apiKey: config?.apiKey || process.env.MISTRAL_API_KEY,
    baseURL: config?.baseURL,
  });
}

export const mistral = createMistralProvider();

export const MistralModels = {
  LARGE_LATEST: 'mistral-large-latest',
  // ... more models
} as const;

export type MistralModel = typeof MistralModels[keyof typeof MistralModels];
```

## Proposed Solution

Create a generic provider factory in `src/providers/factory.ts` that generates these components automatically.

### Step 1: Create the factory module

Create `src/providers/factory.ts`:

```typescript
/**
 * Generic provider factory to reduce boilerplate across provider modules.
 */

export interface BaseProviderConfig {
  apiKey?: string;
  baseURL?: string;
}

export interface ProviderDefinition<
  TConfig extends BaseProviderConfig,
  TModels extends Record<string, string>
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
  TConfig extends BaseProviderConfig,
  TModels extends Record<string, string>
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
  TConfig extends BaseProviderConfig,
  TModels extends Record<string, string>
>(
  definition: ProviderDefinition<TConfig, TModels>
): ProviderModule<TConfig, TModels> {
  const { name, envKey, sdkFactory, mapConfig, models } = definition;

  const createProvider = (config?: TConfig) => {
    const baseConfig = {
      apiKey: config?.apiKey || process.env[envKey],
      baseURL: config?.baseURL,
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
```

### Step 2: Refactor each provider file

Refactor each provider to use the factory. Example for `src/providers/mistral.ts`:

```typescript
import { createMistral } from '@ai-sdk/mistral';
import { defineProvider, BaseProviderConfig } from './factory';

export interface MistralConfig extends BaseProviderConfig {}

const module = defineProvider({
  name: 'mistral',
  envKey: 'MISTRAL_API_KEY',
  sdkFactory: createMistral,
  models: {
    LARGE_LATEST: 'mistral-large-latest',
    MEDIUM_LATEST: 'mistral-medium-latest',
    SMALL_LATEST: 'mistral-small-latest',
    TINY: 'mistral-tiny',
    CODESTRAL: 'codestral-latest',
    MIXTRAL_8X7B: 'open-mixtral-8x7b',
    MIXTRAL_8X22B: 'open-mixtral-8x22b',
  },
});

export const createMistralProvider = module.createProvider;
export const mistral = module.provider;
export const MistralModels = module.models;
export type MistralModel = typeof MistralModels[keyof typeof MistralModels];
```

### Step 3: Handle providers with extra config options

For providers like OpenAI that have additional config options:

```typescript
// src/providers/openai.ts
import { createOpenAI } from '@ai-sdk/openai';
import { defineProvider, BaseProviderConfig } from './factory';

export interface OpenAIConfig extends BaseProviderConfig {
  organization?: string;
  project?: string;
}

const module = defineProvider<OpenAIConfig, typeof OpenAIModels>({
  name: 'openai',
  envKey: 'OPENAI_API_KEY',
  sdkFactory: createOpenAI,
  mapConfig: (config) => ({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization,
    project: config.project,
  }),
  models: {
    GPT4O: 'gpt-4o',
    GPT4O_MINI: 'gpt-4o-mini',
    // ... rest of models
  },
});

// ... exports
```

## Files to Modify

1. **Create:** `src/providers/factory.ts` - The new factory module
2. **Modify:** `src/providers/openai.ts` - Refactor to use factory
3. **Modify:** `src/providers/anthropic.ts` - Refactor to use factory
4. **Modify:** `src/providers/google.ts` - Refactor to use factory
5. **Modify:** `src/providers/mistral.ts` - Refactor to use factory
6. **Modify:** `src/providers/groq.ts` - Refactor to use factory
7. **Modify:** `src/providers/cohere.ts` - Refactor to use factory
8. **Modify:** `src/providers/azure.ts` - Refactor to use factory (may need special handling)
9. **Modify:** `src/providers/bedrock.ts` - Refactor to use factory (may need special handling)
10. **Modify:** `src/providers/vertex.ts` - Refactor to use factory (may need special handling)
11. **Modify:** `src/providers/index.ts` - Export the factory if needed

## Expected Outcome

- Reduce total provider code from ~600 lines to ~200 lines
- Each provider file becomes 15-25 lines instead of 55-75 lines
- Adding a new provider requires only defining config + models
- Consistent behavior across all providers
- Easier to maintain and test

## Testing

1. Run existing tests: `npm test`
2. Verify all provider exports work correctly
3. Test model resolution still works via `src/providers/resolver.ts`
4. Test custom provider creation for each refactored provider

## Notes

- Preserve all existing JSDoc comments and examples
- Maintain backward compatibility - all existing exports must still work
- The `azure.ts`, `bedrock.ts`, and `vertex.ts` providers may have more complex configs - handle them carefully
