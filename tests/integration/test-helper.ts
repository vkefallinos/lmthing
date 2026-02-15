/**
 * Shared test helper for LLM integration tests
 *
 * Environment variables:
 * - LM_TEST_MODEL: Model to use for integration tests (e.g., openai:gpt-4o, anthropic:claude-3-5-sonnet-20241022)
 *
 * Running:
 * LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration
 * LM_TEST_MODEL=anthropic:claude-3-5-sonnet-20241022 npm test -- --run tests/integration
 */

// Check if integration test model is configured
export const hasTestModel = !!process.env.LM_TEST_MODEL;

/**
 * Get the model to use from environment variable
 */
export function getTestModel(): string {
  return process.env.LM_TEST_MODEL || 'openai:gpt-4o-mini';
}

/**
 * Get timeout (90 seconds for LLM calls)
 */
export function getTestTimeout(): number {
  return 90000;
}

/**
 * Get model display name for logging
 */
export function getModelDisplayName(model: string): string {
  return model;
}

// Export the model to use
export const TEST_MODEL = getTestModel();
export const TEST_TIMEOUT = getTestTimeout();
