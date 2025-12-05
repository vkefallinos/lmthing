# Testing Guide

## Mock Model Implementation

For testing purposes, you can use a mock model implementation that simulates LLM responses without contacting any external provider. This is useful for:

- Unit testing your agentic workflows
- Testing tool integrations without API costs
- Debugging prompt construction and context management
- CI/CD pipelines where external API access is restricted

### Basic Usage

The mock model accepts predefined messages (text responses and tool calls) in a single array to maintain execution order:

```typescript
import { runPrompt } from 'lmthing';
import { createMockModel } from 'lmthing/test'; // or your mock implementation path

const mockModel = createMockModel([
  { type: 'text', text: 'First response' },
  { type: 'text', text: 'Second response' },
  { type: 'text', text: 'Third response' }
]);

const result = await runPrompt(
  (ctx) => {
    ctx.$`What is 2 + 2?`;
  },
  {
    model: mockModel, // Use mock instead of real provider
  }
);

const text = await result.text;
console.log(text); // "First response"
```

### Testing Tool Calls

The mock model can simulate tool calls by including them in the message array. Text responses and tool calls are executed in order:

```typescript
import { z } from 'zod';

const mockModel = createMockModel([
  { type: 'text', text: 'I will calculate that for you.' },
  {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'calculator',
    args: { a: 5, b: 3 }
  },
  { type: 'text', text: 'The result is 8.' }
]);

const result = await runPrompt(
  (ctx) => {
    ctx.defTool(
      'calculator',
      'Add two numbers',
      z.object({ a: z.number(), b: z.number() }),
      async ({ a, b }) => String(a + b)
    );
    
    ctx.$`What is 5 + 3?`;
  },
  {
    model: mockModel,
  }
);

// The mock will:
// 1. Return "I will calculate that for you."
// 2. Call calculator tool with args { a: 5, b: 3 }
// 3. Receive tool result "8"
// 4. Return "The result is 8."
```

### Testing Agents

Mock models work seamlessly with `defAgent` for testing multi-agent workflows:

```typescript
const mockModel = createMockModel([
  { type: 'text', text: 'I will delegate to the researcher.' },
  {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'researcher',
    args: { topic: 'AI' }
  },
  { type: 'text', text: 'Research results: Mock data about AI' }
]);

const result = await runPrompt(
  (ctx) => {
    ctx.defAgent(
      'researcher',
      'Research a topic',
      z.object({ topic: z.string() }),
      async (args, agentCtx) => {
        // The sub-agent can also use a mock model
        return agentCtx.$`Research: ${args.topic}`;
      },
      {
        model: createMockModel([
          { type: 'text', text: 'Detailed research about AI...' }
        ])
      }
    );
    
    ctx.$`Tell me about AI`;
  },
  {
    model: mockModel,
  }
);
```

### Testing Task Lists

Mock models are particularly useful for testing `defTaskList` and `defDynamicTaskList`:

```typescript
const mockModel = createMockModel([
  { type: 'text', text: 'Calculating 5 + 3...' },
  {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'finishTask',
    args: { result: '8' }
  },
  { type: 'text', text: 'Task 1 complete. Now multiplying by 2...' },
  {
    type: 'tool-call',
    toolCallId: 'call_2',
    toolName: 'finishTask',
    args: { result: '16' }
  },
  { type: 'text', text: 'All tasks completed!' }
]);

const result = await runPrompt(
  (ctx) => {
    ctx.defTaskList([
      {
        task: 'Calculate 5 + 3',
        validation: (result) => {
          if (result.trim() !== '8') {
            return `Expected 8, got ${result}`;
          }
        },
      },
      {
        task: 'Multiply result by 2',
        validation: (result) => {
          if (result.trim() !== '16') {
            return `Expected 16, got ${result}`;
          }
        },
      },
    ]);
    
    ctx.$`Complete all tasks.`;
  },
  {
    model: mockModel,
  }
);
```

### Configuration Options

The mock model accepts an array of messages that can be text responses or tool calls, executed in order:

```typescript
const mockModel = createMockModel([
  // Text response
  { 
    type: 'text', 
    text: 'Response text'
  },
  
  // Tool call
  {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'toolName',
    args: { key: 'value' }
  },
  
  // Multiple tool calls can be made in sequence
  {
    type: 'tool-call',
    toolCallId: 'call_2',
    toolName: 'anotherTool',
    args: { data: 'example' }
  },
  
  // Final response
  {
    type: 'text',
    text: 'Final response after tool calls'
  }
]);
```

**Message Types:**

- **Text Message**: `{ type: 'text', text: string }`
  - Returns text content to the user
  
- **Tool Call Message**: `{ type: 'tool-call', toolCallId: string, toolName: string, args: object }`
  - Simulates calling a registered tool
  - The tool will be executed and its result included in the conversation
  - Must match a tool registered via `defTool` or `defAgent`

**Advanced Configuration:**

You can also pass configuration options as a second parameter:

```typescript
const mockModel = createMockModel(
  [
    { type: 'text', text: 'Response' }
  ],
  {
    // Simulate delays (optional)
    delay: 100, // milliseconds
    
    // Simulate token usage (optional)
    usage: {
      promptTokens: 50,
      completionTokens: 100,
      totalTokens: 150
    },
    
    // Simulate streaming (optional, default: true)
    streaming: true,
  }
);
```

### Best Practices

1. **Separate mock configuration**: Keep mock responses in separate test fixture files for reusability

2. **Test both success and failure**: Create mocks that simulate errors, retries, and edge cases

3. **Verify tool calls**: Assert that tools are called with expected arguments

4. **Test validation logic**: Use mocks to test task validation and error handling

5. **Keep mocks simple**: Don't try to simulate complex LLM behavior; focus on testing your workflow logic

### Example Test Suite

```typescript
import { describe, it, expect } from 'vitest'; // or jest
import { runPrompt } from 'lmthing';
import { createMockModel } from 'lmthing/test';

describe('Weather Agent', () => {
  it('should call weather tool and format response', async () => {
    const mockModel = createMockModel([
      { type: 'text', text: 'Let me check the weather.' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'getWeather',
        args: { city: 'NYC' }
      },
      { type: 'text', text: 'The weather in NYC is sunny and 72°F.' }
    ]);
    
    const result = await runPrompt(
      (ctx) => {
        ctx.defTool(
          'getWeather',
          'Get weather for a city',
          z.object({ city: z.string() }),
          async ({ city }) => `Weather in ${city}: Sunny, 72°F`
        );
        
        ctx.$`What's the weather in NYC?`;
      },
      { model: mockModel }
    );
    
    const text = await result.text;
    expect(text).toContain('sunny');
    expect(text).toContain('72°F');
  });
  
  it('should handle multiple tool calls in sequence', async () => {
    const mockModel = createMockModel([
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'search',
        args: { query: 'weather NYC' }
      },
      {
        type: 'tool-call',
        toolCallId: 'call_2',
        toolName: 'format',
        args: { data: 'raw weather data' }
      },
      { type: 'text', text: 'Here is the formatted weather information.' }
    ]);
    
    // Test implementation...
  });
});
```

## See Also

Implementation:

```ts
import { MockLanguageModelV2 } from 'ai/test';
import { simulateReadableStream } from 'ai';

type MockContent = 
  | { type: 'text'; text: string }
  | { 
      type: 'tool-call'; 
      toolCallId: string; 
      toolName: string; 
      args: Record<string, any> 
    };

export function createMockModel(content: MockContent[]) {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          // Start the text part
          { type: 'text-start', id: '0' },
          
          // Convert content to stream chunks
          ...content.flatMap((item, index) => {
            if (item.type === 'text') {
              return [
                { type: 'text-delta', id: '0', delta: item.text }
              ];
            } else if (item.type === 'tool-call') {
              return [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: item.toolCallId,
                  toolName: item. toolName,
                  input: JSON.stringify(item.args)
                }
              ];
            }
            return [];
          }),
          
          // End the text part
          { type: 'text-end', id: '0' },
          
          // Finish with usage info
          {
            type: 'finish',
            finishReason: 'stop',
            usage: { 
              inputTokens: 10, 
              outputTokens: 20, 
              totalTokens: 30 
            }
          }
        ]
      })
    })
  });
}
```
- [Main README](./README.md)
