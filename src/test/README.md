# Test Setup

This directory contains the test infrastructure for the lmthing project.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

- `__tests__/` - Contains all test files
- `createMockModel.ts` - Mock model implementation for testing

## createMockModel

The `createMockModel` utility allows you to create mock language models for testing without making actual API calls.

### Basic Usage

```typescript
import { createMockModel } from './createMockModel';

const mockModel = createMockModel([
  { type: 'text', text: 'Hello, world!' }
]);
```

### With Tool Calls

```typescript
const mockModel = createMockModel([
  { type: 'text', text: 'I will calculate that' },
  {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'calculator',
    args: { a: 5, b: 3 }
  },
  { type: 'text', text: 'The result is 8' }
]);
```

### Configuration Options

```typescript
const mockModel = createMockModel(
  [{ type: 'text', text: 'Response' }],
  {
    delay: 100, // Simulate network delay
    usage: {
      promptTokens: 50,
      completionTokens: 100
    },
    streaming: true
  }
);
```

### Helper Functions

```typescript
// Simple text response
const textModel = createTextMockModel('Simple response');

// Single tool call
const toolModel = createToolCallMockModel('myTool', { param: 'value' });
```

## Test Coverage

The test suite includes:

- ✅ Basic text responses
- ✅ Tool call handling
- ✅ Mixed content (text + tool calls)
- ✅ Configuration options
- ✅ Streaming behavior
- ✅ Helper functions
- ✅ Edge cases
- ✅ Type safety
- ✅ Delay simulation

## Writing New Tests

When adding new tests, follow these conventions:

1. Group related tests using `describe` blocks
2. Use clear, descriptive test names
3. Test both success and edge cases
4. Include async/await for stream testing
5. Verify expected behavior with appropriate assertions

Example:

```typescript
describe('New Feature', () => {
  it('should handle the expected case', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Expected response' }
    ]);

    const result = await mockModel.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: []
    });

    expect(result).toBeDefined();
  });
});
```
