import { describe, it, expect } from 'vitest';
import {
  LmthingError,
  ProviderError,
  ValidationError,
  PluginError,
  PromptError,
  ErrorCodes,
} from './errors';

describe('Error classes', () => {
  describe('LmthingError', () => {
    it('creates error with message and code', () => {
      const error = new LmthingError('test message', 'TEST_CODE');
      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('LmthingError');
    });

    it('is an instance of Error', () => {
      const error = new LmthingError('test', 'CODE');
      expect(error instanceof Error).toBe(true);
    });

    it('maintains proper prototype chain for instanceof', () => {
      const error = new LmthingError('test', 'CODE');
      expect(error instanceof LmthingError).toBe(true);
    });

    it('has proper stack trace', () => {
      const error = new LmthingError('test', 'CODE');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('LmthingError');
    });
  });

  describe('ProviderError', () => {
    it('creates error with message, code, and details', () => {
      const details = { provider: 'xyz', available: ['openai', 'anthropic'] };
      const error = new ProviderError('Unknown provider', 'UNKNOWN_PROVIDER', details);
      expect(error.message).toBe('Unknown provider');
      expect(error.code).toBe('UNKNOWN_PROVIDER');
      expect(error.details).toBe(details);
      expect(error.name).toBe('ProviderError');
    });

    it('creates error without details', () => {
      const error = new ProviderError('Unknown provider', 'UNKNOWN_PROVIDER');
      expect(error.details).toBeUndefined();
    });

    it('is instanceof LmthingError', () => {
      const error = new ProviderError('test', 'CODE');
      expect(error instanceof LmthingError).toBe(true);
      expect(error instanceof ProviderError).toBe(true);
    });

    it('maintains proper prototype chain', () => {
      const error = new ProviderError('test', 'CODE');
      expect(error instanceof ProviderError).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('creates error with message, code, and optional details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new ValidationError('Invalid input', 'INVALID_SCHEMA', details);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('INVALID_SCHEMA');
      expect(error.details).toBe(details);
      expect(error.name).toBe('ValidationError');
    });

    it('creates error with default code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('is instanceof LmthingError', () => {
      const error = new ValidationError('test');
      expect(error instanceof LmthingError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });
  });

  describe('PluginError', () => {
    it('creates error with message, plugin name, and code', () => {
      const error = new PluginError('Plugin init failed', 'taskListPlugin', 'PLUGIN_INIT_FAILED');
      expect(error.message).toBe('Plugin init failed');
      expect(error.pluginName).toBe('taskListPlugin');
      expect(error.code).toBe('PLUGIN_INIT_FAILED');
      expect(error.name).toBe('PluginError');
    });

    it('creates error with default code', () => {
      const error = new PluginError('Plugin failed', 'myPlugin');
      expect(error.code).toBe('PLUGIN_ERROR');
    });

    it('is instanceof LmthingError', () => {
      const error = new PluginError('test', 'plugin');
      expect(error instanceof LmthingError).toBe(true);
      expect(error instanceof PluginError).toBe(true);
    });
  });

  describe('PromptError', () => {
    it('creates error with message and code', () => {
      const error = new PromptError('Execution failed', 'EXECUTION_FAILED');
      expect(error.message).toBe('Execution failed');
      expect(error.code).toBe('EXECUTION_FAILED');
      expect(error.name).toBe('PromptError');
    });

    it('creates error with default code', () => {
      const error = new PromptError('Something went wrong');
      expect(error.code).toBe('PROMPT_ERROR');
    });

    it('is instanceof LmthingError', () => {
      const error = new PromptError('test');
      expect(error instanceof LmthingError).toBe(true);
      expect(error instanceof PromptError).toBe(true);
    });
  });

  describe('Error catching and handling', () => {
    it('can catch specific error types', () => {
      try {
        throw new ProviderError('test', 'CODE');
      } catch (e) {
        expect(e instanceof ProviderError).toBe(true);
        expect(e instanceof LmthingError).toBe(true);
      }
    });

    it('can catch base LmthingError', () => {
      const errors = [
        new ProviderError('p', 'C1'),
        new ValidationError('v'),
        new PluginError('pl', 'plugin'),
        new PromptError('pr'),
      ];

      for (const error of errors) {
        try {
          throw error;
        } catch (e) {
          expect(e instanceof LmthingError).toBe(true);
        }
      }
    });

    it('preserves error type through try-catch', () => {
      const original = new ProviderError(
        'Unknown provider: xyz',
        'UNKNOWN_PROVIDER',
        { provider: 'xyz' }
      );

      let caught: any = null;
      try {
        throw original;
      } catch (e) {
        caught = e;
      }

      expect(caught).toBe(original);
      expect(caught instanceof ProviderError).toBe(true);
      expect(caught.details.provider).toBe('xyz');
    });
  });

  describe('ErrorCodes constants', () => {
    it('has all provider error codes', () => {
      expect(ErrorCodes.UNKNOWN_PROVIDER).toBe('UNKNOWN_PROVIDER');
      expect(ErrorCodes.MISSING_API_KEY).toBe('MISSING_API_KEY');
      expect(ErrorCodes.MISSING_API_BASE).toBe('MISSING_API_BASE');
      expect(ErrorCodes.PROVIDER_NOT_CONFIGURED).toBe('PROVIDER_NOT_CONFIGURED');
    });

    it('has all validation error codes', () => {
      expect(ErrorCodes.INVALID_CONFIG).toBe('INVALID_CONFIG');
      expect(ErrorCodes.INVALID_SCHEMA).toBe('INVALID_SCHEMA');
      expect(ErrorCodes.MISSING_REQUIRED).toBe('MISSING_REQUIRED');
    });

    it('has all prompt error codes', () => {
      expect(ErrorCodes.MODEL_REQUIRED).toBe('MODEL_REQUIRED');
      expect(ErrorCodes.EXECUTION_FAILED).toBe('EXECUTION_FAILED');
    });

    it('has all plugin error codes', () => {
      expect(ErrorCodes.PLUGIN_INIT_FAILED).toBe('PLUGIN_INIT_FAILED');
      expect(ErrorCodes.PLUGIN_METHOD_FAILED).toBe('PLUGIN_METHOD_FAILED');
    });

    it('can be used with errors', () => {
      const error = new ProviderError('test', ErrorCodes.UNKNOWN_PROVIDER);
      expect(error.code).toBe(ErrorCodes.UNKNOWN_PROVIDER);
    });
  });

  describe('Error messages', () => {
    it('preserves error messages exactly', () => {
      const messages = [
        'Simple message',
        'Message with special chars: @#$%^&*()',
        'Message with newlines\nand\ttabs',
        'Message with unicode: 日本語',
      ];

      for (const message of messages) {
        const error = new LmthingError(message, 'CODE');
        expect(error.message).toBe(message);
      }
    });

    it('handles empty messages', () => {
      const error = new LmthingError('', 'CODE');
      expect(error.message).toBe('');
    });
  });

  describe('Error serialization', () => {
    it('provides useful error info', () => {
      const error = new ProviderError(
        'Unknown provider: xyz',
        'UNKNOWN_PROVIDER',
        { provider: 'xyz', available: ['openai', 'anthropic'] }
      );

      expect(error.toString()).toContain('ProviderError');
      expect(error.message).toBe('Unknown provider: xyz');
      expect(error.code).toBe('UNKNOWN_PROVIDER');
    });

    it('includes error name correctly', () => {
      const errors = [
        { error: new LmthingError('m', 'c'), expected: 'LmthingError' },
        { error: new ProviderError('m', 'c'), expected: 'ProviderError' },
        { error: new ValidationError('m'), expected: 'ValidationError' },
        { error: new PluginError('m', 'p'), expected: 'PluginError' },
        { error: new PromptError('m'), expected: 'PromptError' },
      ];

      for (const { error, expected } of errors) {
        expect(error.name).toBe(expected);
      }
    });
  });

  describe('Multiple inheritance patterns', () => {
    it('works with spread operator on error details', () => {
      const details = { field: 'email', value: 'invalid' };
      const error = new ProviderError('test', 'CODE', { ...details, extra: 'info' });
      expect(error.details?.field).toBe('email');
      expect(error.details?.extra).toBe('info');
    });

    it('allows null/undefined details', () => {
      const e1 = new ProviderError('test', 'CODE', undefined);
      expect(e1.details).toBeUndefined();

      const e2 = new ProviderError('test', 'CODE', null as any);
      expect(e2.details).toBeNull();
    });
  });
});
