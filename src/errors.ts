/**
 * Custom error classes for lmthing library.
 * Provides typed, catchable errors with error codes and structured details.
 */

/**
 * Base error class for all lmthing errors.
 * Provides consistent error structure with error codes.
 */
export class LmthingError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'LmthingError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when provider resolution fails.
 *
 * @example
 * ```typescript
 * throw new ProviderError(
 *   'Unknown provider: xyz',
 *   'UNKNOWN_PROVIDER',
 *   { provider: 'xyz', available: ['openai', 'anthropic'] }
 * );
 * ```
 */
export class ProviderError extends LmthingError {
  constructor(
    message: string,
    code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message, code);
    this.name = 'ProviderError';
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/**
 * Error thrown when input validation fails.
 * Used for schema validation, config validation, etc.
 */
export class ValidationError extends LmthingError {
  constructor(
    message: string,
    code: string = 'VALIDATION_ERROR',
    public readonly details?: Record<string, any>
  ) {
    super(message, code);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when a plugin fails.
 */
export class PluginError extends LmthingError {
  constructor(
    message: string,
    public readonly pluginName: string,
    code: string = 'PLUGIN_ERROR'
  ) {
    super(message, code);
    this.name = 'PluginError';
    Object.setPrototypeOf(this, PluginError.prototype);
  }
}

/**
 * Error thrown when prompt execution fails.
 */
export class PromptError extends LmthingError {
  constructor(
    message: string,
    code: string = 'PROMPT_ERROR'
  ) {
    super(message, code);
    this.name = 'PromptError';
    Object.setPrototypeOf(this, PromptError.prototype);
  }
}

/**
 * Error codes used throughout lmthing.
 * Use these constants instead of string literals for consistency.
 */
export const ErrorCodes = {
  // Provider errors
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  MISSING_API_KEY: 'MISSING_API_KEY',
  MISSING_API_BASE: 'MISSING_API_BASE',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',

  // Validation errors
  INVALID_CONFIG: 'INVALID_CONFIG',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  MISSING_REQUIRED: 'MISSING_REQUIRED',

  // Prompt errors
  MODEL_REQUIRED: 'MODEL_REQUIRED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',

  // Plugin errors
  PLUGIN_INIT_FAILED: 'PLUGIN_INIT_FAILED',
  PLUGIN_METHOD_FAILED: 'PLUGIN_METHOD_FAILED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
