import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  scanCustomProviders,
  createCustomProvider,
  getCustomProviders,
  getCustomProvider,
  isCustomProvider,
  listCustomProviders,
  resetCustomProvidersRegistry,
  type CustomProviderConfig,
} from './custom';

describe('Custom Providers', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear the registry before each test
    resetCustomProvidersRegistry();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clear the registry after each test
    resetCustomProvidersRegistry();
  });

  describe('scanCustomProviders', () => {
    it('should find custom providers in environment variables', () => {
      process.env.ZAI_API_KEY = 'test-zai-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(1);
      expect(configs[0]).toEqual({
        name: 'zai',
        apiKey: 'test-zai-key',
        baseURL: 'https://api.z.ai/v1',
        prefix: 'ZAI',
      });
    });

    it('should find multiple custom providers', () => {
      process.env.ZAI_API_KEY = 'test-zai-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';
      process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
      process.env.OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
      process.env.OPENROUTER_API_TYPE = 'openai';

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(2);
      expect(configs.find(c => c.name === 'zai')).toBeDefined();
      expect(configs.find(c => c.name === 'openrouter')).toBeDefined();
    });

    it('should use custom display name if provided', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';
      process.env.ZAI_API_NAME = 'custom-zai';

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('custom-zai');
    });

    it('should ignore providers with missing API key', () => {
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(0);
    });

    it('should ignore providers with missing base URL', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_TYPE = 'openai';

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(0);
    });

    it('should ignore providers with missing or wrong API_TYPE', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      // No API_TYPE set

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(0);
    });

    it('should handle underscores in provider names', () => {
      process.env.MY_PROVIDER_API_KEY = 'test-key';
      process.env.MY_PROVIDER_API_BASE = 'https://api.example.com';
      process.env.MY_PROVIDER_API_TYPE = 'openai';

      const configs = scanCustomProviders();

      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('my_provider');
      expect(configs[0].prefix).toBe('MY_PROVIDER');
    });

    it('should return empty array when no custom providers are configured', () => {
      const configs = scanCustomProviders();

      expect(configs).toEqual([]);
    });
  });

  describe('createCustomProvider', () => {
    it('should create a provider instance from config', () => {
      const config: CustomProviderConfig = {
        name: 'test',
        apiKey: 'test-key',
        baseURL: 'https://api.test.com',
        prefix: 'TEST',
      };

      const provider = createCustomProvider(config);

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
    });

    it('should create a provider that can create models', () => {
      const config: CustomProviderConfig = {
        name: 'test',
        apiKey: 'test-key',
        baseURL: 'https://api.test.com',
        prefix: 'TEST',
      };

      const provider = createCustomProvider(config);
      const model = provider('gpt-4o');

      expect(model).toBeDefined();
      expect(model.modelId).toBe('gpt-4o');
    });
  });

  describe('getCustomProviders', () => {
    it('should return an empty map when no providers are configured', () => {
      const providers = getCustomProviders();

      expect(providers).toBeInstanceOf(Map);
      expect(providers.size).toBe(0);
    });

    it('should return a map with custom providers', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      const providers = getCustomProviders();

      expect(providers.size).toBe(1);
      expect(providers.has('zai')).toBe(true);
    });

    it('should cache providers after first initialization', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      const providers1 = getCustomProviders();
      const providers2 = getCustomProviders();

      expect(providers1).toBe(providers2); // Same instance
    });
  });

  describe('isCustomProvider', () => {
    it('should return true for configured custom providers', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      expect(isCustomProvider('zai')).toBe(true);
    });

    it('should return false for non-existent providers', () => {
      expect(isCustomProvider('unknown')).toBe(false);
    });

    it('should return false for built-in providers', () => {
      expect(isCustomProvider('openai')).toBe(false);
      expect(isCustomProvider('anthropic')).toBe(false);
    });
  });

  describe('getCustomProvider', () => {
    it('should return provider instance for configured providers', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      const provider = getCustomProvider('zai');

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
    });

    it('should return undefined for non-existent providers', () => {
      const provider = getCustomProvider('unknown');

      expect(provider).toBeUndefined();
    });

    it('should create models correctly', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      const provider = getCustomProvider('zai');
      const model = provider?.('gpt-4o');

      expect(model).toBeDefined();
      expect(model?.modelId).toBe('gpt-4o');
    });
  });

  describe('listCustomProviders', () => {
    it('should return empty array when no providers are configured', () => {
      const names = listCustomProviders();

      expect(names).toEqual([]);
    });

    it('should return array of provider names', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';
      process.env.OPENROUTER_API_KEY = 'test-key2';
      process.env.OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
      process.env.OPENROUTER_API_TYPE = 'openai';

      const names = listCustomProviders();

      expect(names).toHaveLength(2);
      expect(names).toContain('zai');
      expect(names).toContain('openrouter');
    });
  });

  describe('Integration with resolver', () => {
    it('should work with resolveModel', async () => {
      // We'll need to import resolveModel to test this
      const { resolveModel } = await import('./resolver');

      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_API_BASE = 'https://api.z.ai/v1';
      process.env.ZAI_API_TYPE = 'openai';

      // Clear the registry to force re-initialization
      resetCustomProvidersRegistry();

      const model = resolveModel('zai:gpt-4o');

      expect(model).toBeDefined();
      expect(model.modelId).toBe('gpt-4o');
    });

    it('should throw error for unknown custom provider', async () => {
      const { resolveModel } = await import('./resolver');

      expect(() => resolveModel('unknowncustom:model')).toThrow(
        'Unknown provider: "unknowncustom"'
      );
    });
  });

  describe('Real-world examples', () => {
    it('should configure Z.AI provider', () => {
      process.env.ZAI_API_KEY = 'zai-key-123';
      process.env.ZAI_API_BASE = 'https://api.z.ai/api/coding/paas/v4';
      process.env.ZAI_API_TYPE = 'openai';
      process.env.ZAI_API_NAME = 'zai';

      const configs = scanCustomProviders();
      const config = configs.find(c => c.name === 'zai');

      expect(config).toEqual({
        name: 'zai',
        apiKey: 'zai-key-123',
        baseURL: 'https://api.z.ai/api/coding/paas/v4',
        prefix: 'ZAI',
      });
    });

    it('should configure OpenRouter provider', () => {
      process.env.OPENROUTER_API_KEY = 'or-key-456';
      process.env.OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
      process.env.OPENROUTER_API_TYPE = 'openai';

      const configs = scanCustomProviders();
      const config = configs.find(c => c.name === 'openrouter');

      expect(config).toEqual({
        name: 'openrouter',
        apiKey: 'or-key-456',
        baseURL: 'https://openrouter.ai/api/v1',
        prefix: 'OPENROUTER',
      });
    });

    it('should configure Together AI provider', () => {
      process.env.TOGETHER_API_KEY = 'together-key-789';
      process.env.TOGETHER_API_BASE = 'https://api.together.xyz/v1';
      process.env.TOGETHER_API_TYPE = 'openai';
      process.env.TOGETHER_API_NAME = 'together';

      const configs = scanCustomProviders();
      const config = configs.find(c => c.name === 'together');

      expect(config).toEqual({
        name: 'together',
        apiKey: 'together-key-789',
        baseURL: 'https://api.together.xyz/v1',
        prefix: 'TOGETHER',
      });
    });

    it('should configure Perplexity provider', () => {
      process.env.PERPLEXITY_API_KEY = 'pplx-key-abc';
      process.env.PERPLEXITY_API_BASE = 'https://api.perplexity.ai';
      process.env.PERPLEXITY_API_TYPE = 'openai';
      process.env.PERPLEXITY_API_NAME = 'perplexity';

      const configs = scanCustomProviders();
      const config = configs.find(c => c.name === 'perplexity');

      expect(config).toEqual({
        name: 'perplexity',
        apiKey: 'pplx-key-abc',
        baseURL: 'https://api.perplexity.ai',
        prefix: 'PERPLEXITY',
      });
    });

    it('should configure GitHub Models provider', () => {
      process.env.GITHUB_MODELS_API_KEY = 'github-token-xyz';
      process.env.GITHUB_MODELS_API_BASE = 'https://models.inference.ai.azure.com';
      process.env.GITHUB_MODELS_API_TYPE = 'openai';
      process.env.GITHUB_MODELS_API_NAME = 'github';

      const configs = scanCustomProviders();
      const config = configs.find(c => c.name === 'github');

      expect(config).toEqual({
        name: 'github',
        apiKey: 'github-token-xyz',
        baseURL: 'https://models.inference.ai.azure.com',
        prefix: 'GITHUB_MODELS',
      });
    });

    it('should configure GitHub Models provider with GITHUB_TOKEN', () => {
      process.env.GITHUB_MODELS_API_KEY = 'ghp_abcdef123456';
      process.env.GITHUB_MODELS_API_BASE = 'https://models.inference.ai.azure.com';
      process.env.GITHUB_MODELS_API_TYPE = 'openai';

      const configs = scanCustomProviders();
      const config = configs.find(c => c.prefix === 'GITHUB_MODELS');

      expect(config).toBeDefined();
      expect(config?.name).toBe('github_models');
      expect(config?.apiKey).toBe('ghp_abcdef123456');
      expect(config?.baseURL).toBe('https://models.inference.ai.azure.com');
    });
  });
});
