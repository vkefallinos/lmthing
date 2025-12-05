import { describe, it, expect, vi } from 'vitest';
import { resolveModel } from './resolver';
import { openai } from './openai';
import { google } from './google';

describe('resolveModel', () => {
  it('should pass through a LanguageModelV2 instance unchanged', () => {
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

  it('should throw an error for invalid format (no colon)', () => {
    expect(() => resolveModel('gpt-4o')).toThrow(
      'Invalid model format: "gpt-4o". Expected format is "provider:modelId"'
    );
  });

  it('should throw an error for invalid format (empty string)', () => {
    expect(() => resolveModel('')).toThrow(
      'Invalid model format'
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
});
