import { describe, it, expect } from 'vitest';
import { resolveModel } from './resolver';
import { openai } from './openai';

describe('resolveModel', () => {
  it('should pass through a LanguageModelV3 instance unchanged', () => {
    const model = openai('gpt-4o');
    const resolved = resolveModel(model);
    expect(resolved).toBe(model);
  });

  it('should resolve "openai:gpt-4o" to an OpenAI model', () => {
    const resolved = resolveModel('openai:gpt-4o');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('gpt-4o');
  });

  it('should resolve "anthropic:claude-3-5-sonnet-20241022" to an Anthropic model', () => {
    const resolved = resolveModel('anthropic:claude-3-5-sonnet-20241022');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('claude-3-5-sonnet-20241022');
  });

  it('should resolve "google:gemini-1.5-pro" to a Google model', () => {
    const resolved = resolveModel('google:gemini-1.5-pro');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('gemini-1.5-pro');
  });

  it('should resolve "mistral:mistral-large-latest" to a Mistral model', () => {
    const resolved = resolveModel('mistral:mistral-large-latest');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('mistral-large-latest');
  });

  it('should resolve "groq:llama-3.3-70b-versatile" to a Groq model', () => {
    const resolved = resolveModel('groq:llama-3.3-70b-versatile');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('llama-3.3-70b-versatile');
  });

  it('should resolve "cohere:command-r-plus" to a Cohere model', () => {
    const resolved = resolveModel('cohere:command-r-plus');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('command-r-plus');
  });

  it('should resolve "bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0" to a Bedrock model', () => {
    const resolved = resolveModel('bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
  });

  it('should resolve "vertex:gemini-1.5-pro" to a Vertex model', () => {
    // Vertex requires project and location env vars, skip if not set
    if (!process.env.GOOGLE_VERTEX_PROJECT) {
      // Set minimal env for test
      process.env.GOOGLE_VERTEX_PROJECT = 'test-project';
      process.env.GOOGLE_VERTEX_LOCATION = 'us-central1';
    }
    const resolved = resolveModel('vertex:gemini-1.5-pro');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('gemini-1.5-pro');
  });

  it('should resolve "azure:deployment-name" to an Azure model', () => {
    const resolved = resolveModel('azure:deployment-name');
    expect(resolved).toBeDefined();
    expect(resolved.modelId).toBe('deployment-name');
  });

  it('should throw an error for undefined alias (no colon and no env var)', () => {
    // Ensure the env var is not set
    delete process.env.LM_MODEL_UNDEFINED;
    expect(() => resolveModel('undefined')).toThrow(
      'Model alias "undefined" not found. Please set the environment variable LM_MODEL_UNDEFINED'
    );
  });

  it('should throw an error for empty string (treated as alias)', () => {
    delete process.env.LM_MODEL_;
    expect(() => resolveModel('')).toThrow(
      'Model alias "" not found'
    );
  });

  it('should throw an error for unknown provider', () => {
    expect(() => resolveModel('unknown:model-id')).toThrow(
      'Unknown provider: "unknown"'
    );
  });

  it('should list available providers in error message', () => {
    try {
      resolveModel('invalid:model');
    } catch (error) {
      expect((error as Error).message).toContain('Available providers:');
      expect((error as Error).message).toContain('openai');
      expect((error as Error).message).toContain('anthropic');
    }
  });

  describe('Model Aliases (LM_MODEL_*)', () => {
    it('should resolve a simple alias to a provider:modelId', () => {
      process.env.LM_MODEL_TEST = 'openai:gpt-4o';
      const resolved = resolveModel('test');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('gpt-4o');
      delete process.env.LM_MODEL_TEST;
    });

    it('should resolve aliases in uppercase format', () => {
      process.env.LM_MODEL_LARGE = 'anthropic:claude-3-5-sonnet-20241022';
      const resolved = resolveModel('large');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('claude-3-5-sonnet-20241022');
      delete process.env.LM_MODEL_LARGE;
    });

    it('should resolve lowercase alias name by converting to uppercase env var', () => {
      process.env.LM_MODEL_FAST = 'openai:gpt-4o-mini';
      const resolved = resolveModel('fast');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('gpt-4o-mini');
      delete process.env.LM_MODEL_FAST;
    });

    it('should resolve mixed-case alias name by converting to uppercase env var', () => {
      process.env.LM_MODEL_SMART = 'anthropic:claude-3-opus-20240229';
      const resolved = resolveModel('SmArT');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('claude-3-opus-20240229');
      delete process.env.LM_MODEL_SMART;
    });

    it('should support chained alias resolution (alias -> alias -> provider:modelId)', () => {
      process.env.LM_MODEL_PRODUCTION = 'default';
      process.env.LM_MODEL_DEFAULT = 'openai:gpt-4o';
      const resolved = resolveModel('production');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('gpt-4o');
      delete process.env.LM_MODEL_PRODUCTION;
      delete process.env.LM_MODEL_DEFAULT;
    });

    it('should work with all built-in providers via aliases', () => {
      // Test that aliases can point to any provider
      process.env.LM_MODEL_MYOPENAI = 'openai:gpt-4o';
      process.env.LM_MODEL_MYANTHROPIC = 'anthropic:claude-3-5-sonnet-20241022';
      process.env.LM_MODEL_MYGOOGLE = 'google:gemini-1.5-pro';

      const resolved1 = resolveModel('myopenai');
      expect(resolved1.modelId).toBe('gpt-4o');

      const resolved2 = resolveModel('myanthropic');
      expect(resolved2.modelId).toBe('claude-3-5-sonnet-20241022');

      const resolved3 = resolveModel('mygoogle');
      expect(resolved3.modelId).toBe('gemini-1.5-pro');

      delete process.env.LM_MODEL_MYOPENAI;
      delete process.env.LM_MODEL_MYANTHROPIC;
      delete process.env.LM_MODEL_MYGOOGLE;
    });

    it('should work with Bedrock models (model IDs with colons)', () => {
      process.env.LM_MODEL_BEDROCK = 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0';
      const resolved = resolveModel('bedrock');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
      delete process.env.LM_MODEL_BEDROCK;
    });

    it('should throw a helpful error when alias is not found', () => {
      delete process.env.LM_MODEL_NOTFOUND;
      expect(() => resolveModel('notfound')).toThrow(
        'Model alias "notfound" not found. Please set the environment variable LM_MODEL_NOTFOUND (e.g., LM_MODEL_NOTFOUND=openai:gpt-4o)'
      );
    });

    it('should throw error if alias points to invalid provider', () => {
      process.env.LM_MODEL_INVALID = 'invalidprovider:model';
      expect(() => resolveModel('invalid')).toThrow(
        'Unknown provider: "invalidprovider"'
      );
      delete process.env.LM_MODEL_INVALID;
    });

    it('should allow underscore-separated alias names', () => {
      process.env.LM_MODEL_MY_LARGE_MODEL = 'openai:gpt-4o';
      const resolved = resolveModel('my_large_model');
      expect(resolved).toBeDefined();
      expect(resolved.modelId).toBe('gpt-4o');
      delete process.env.LM_MODEL_MY_LARGE_MODEL;
    });
  });
});
