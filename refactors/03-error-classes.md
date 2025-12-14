# Refactor 03: Centralize Error Classes

## Problem

The CLI has a well-designed `CliError` class with exit codes, but the rest of the codebase throws generic `Error` objects. This makes:

1. Error handling harder (can't catch specific error types)
2. Testing more difficult (can't assert on error types)
3. Error messages inconsistent
4. Debugging more challenging

## Current State

```typescript
// src/cli.ts - Has a custom error class
export class CliError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
    this.name = 'CliError';
  }
}

// src/providers/resolver.ts - Throws generic Error
throw new Error(`Unknown provider: ${provider}. Available: ${Object.keys(providers).join(', ')}`);

// src/providers/custom.ts - Throws generic Error
throw new Error(`Provider ${name} requires ${name}_API_BASE to be set`);

// src/StatefulPrompt.ts - Throws generic Error
throw new Error('Model is required to execute streamText');
```

## Proposed Solution

### Step 1: Create `src/errors.ts`

```typescript
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
```

### Step 2: Update `src/providers/resolver.ts`

```typescript
import { ProviderError, ErrorCodes } from '../errors';

// Before:
throw new Error(`Unknown provider: ${provider}. Available: ${Object.keys(providers).join(', ')}`);

// After:
throw new ProviderError(
  `Unknown provider: ${provider}. Available: ${available.join(', ')}`,
  ErrorCodes.UNKNOWN_PROVIDER,
  { provider, available: Object.keys(providers) }
);
```

### Step 3: Update `src/providers/custom.ts`

```typescript
import { ProviderError, ErrorCodes } from '../errors';

// Before:
throw new Error(`Provider ${name} requires ${name}_API_BASE to be set`);

// After:
throw new ProviderError(
  `Provider ${name} requires ${name}_API_BASE environment variable`,
  ErrorCodes.MISSING_API_BASE,
  { provider: name, envVar: `${name}_API_BASE` }
);
```

### Step 4: Update `src/StatefulPrompt.ts`

```typescript
import { PromptError, ErrorCodes } from './errors';

// Before:
throw new Error('Model is required to execute streamText');

// After:
throw new PromptError(
  'Model is required to execute streamText',
  ErrorCodes.MODEL_REQUIRED
);
```

### Step 5: Update `src/cli.ts`

Move `CliError` to extend `LmthingError`:

```typescript
import { LmthingError } from './errors';

export class CliError extends LmthingError {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message, 'CLI_ERROR');
    this.name = 'CliError';
  }
}
```

### Step 6: Export from `src/index.ts`

```typescript
// Error classes
export {
  LmthingError,
  ProviderError,
  ValidationError,
  PluginError,
  PromptError,
  ErrorCodes,
  type ErrorCode,
} from './errors';
```

## Files to Modify

1. **Create:** `src/errors.ts` - New error classes module
2. **Modify:** `src/providers/resolver.ts` - Use ProviderError
3. **Modify:** `src/providers/custom.ts` - Use ProviderError
4. **Modify:** `src/StatefulPrompt.ts` - Use PromptError
5. **Modify:** `src/cli.ts` - Extend LmthingError
6. **Modify:** `src/index.ts` - Export error classes
7. **Modify:** `src/plugins/function/sandbox.ts` - Use PluginError if applicable
8. **Modify:** `src/plugins/function/typeChecker.ts` - Use ValidationError if applicable

## Expected Outcome

- All errors are typed and catchable by type
- Error codes enable programmatic error handling
- Consistent error format across the library
- Better debugging with structured error details
- Improved testing with specific error assertions

## Testing

1. Run existing tests: `npm test`
2. Add tests for each error class in `src/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  LmthingError,
  ProviderError,
  ValidationError,
  ErrorCodes
} from './errors';

describe('Error classes', () => {
  it('LmthingError has code property', () => {
    const error = new LmthingError('test', 'TEST_CODE');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('LmthingError');
    expect(error instanceof Error).toBe(true);
  });

  it('ProviderError includes details', () => {
    const error = new ProviderError(
      'Unknown provider',
      ErrorCodes.UNKNOWN_PROVIDER,
      { provider: 'xyz' }
    );
    expect(error.details?.provider).toBe('xyz');
    expect(error instanceof LmthingError).toBe(true);
  });

  it('errors can be caught by type', () => {
    try {
      throw new ProviderError('test', 'CODE');
    } catch (e) {
      expect(e instanceof ProviderError).toBe(true);
      expect(e instanceof LmthingError).toBe(true);
    }
  });
});
```

3. Update existing tests that check for `Error` to check for specific error types

## Notes

- Keep error messages user-friendly and actionable
- Include relevant context in the `details` object
- Use `ErrorCodes` constants for consistency
- Document error codes in CLAUDE.md if they're part of public API
