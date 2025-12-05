# Agent Executor

## runPrompt

The `runPrompt` function is the main entry point for executing agentic workflows. It creates a `PromptContext` and executes a prompt configuration function, returning a `streamText` result.

**Signature:**

```typescript
runPrompt(
  fn: (ctx: PromptContext) => void | Promise<void>,
  config?: RunPromptConfig
): Promise<StreamTextResult>
```

**Parameters:**

- `fn`: A function that receives a `PromptContext` and configures the prompt by calling context methods (`def`, `defTool`, `defAgent`, etc.)
- `config`: Optional configuration object that maps directly to `streamText` parameters:
  - `model`: The language model to use. Can be either:
    - A string in the format `provider:model_id` (e.g., `'openai:gpt-4o'`, `'anthropic:claude-3-5-sonnet'`). The provider is automatically resolved from the AI SDK.
    - An AI SDK `LanguageModelV1` provider implementation directly (e.g., `openai('gpt-4o')`, `anthropic('claude-3-5-sonnet-20241022')`).
  - `system`: System prompt (can be augmented by `def`/`defData`)
  - `plugins`: A list of plugins that enable tools or system prompts or any other def* or prompt
  - `maxOutputTokens`: Maximum number of tokens to generate
  - `temperature`: Temperature setting for randomness
  - `topP`: Nucleus sampling parameter
  - `topK`: Top-K sampling parameter
  - `presencePenalty`: Presence penalty setting
  - `frequencyPenalty`: Frequency penalty setting
  - `stopSequences`: Sequences that stop generation
  - `seed`: Seed for deterministic generation
  - `maxRetries`: Maximum number of retries (default: 2)
  - `abortSignal`: Signal for canceling the operation
  - `headers`: Additional HTTP headers
  - `toolChoice`: Tool selection strategy
  - `stopWhen`: Condition for stopping multi-step generation
  - `prepareStep`: Function to modify settings for each step during multi-step generation. Receives step information and can return modified model, toolChoice, activeTools, system prompt, or messages for the current step. Is given access through defHook.
  - `onChunk`: Callback for each chunk
  - `onStepFinish`: Callback when a step finishes
  - `onFinish`: Callback when generation finishes
  - `onError`: Callback for errors
  - `onAbort`: Callback when aborted

**Returns:**

Returns a `Promise<StreamTextResult>` with all the properties from [`streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), including:
- `textStream`: Async iterable of text deltas
- `fullStream`: Async iterable of all events
- `text`: Promise resolving to full text
- `usage`: Promise resolving to token usage
- `toolCalls`: Promise resolving to tool calls
- `toolResults`: Promise resolving to tool results
- And all other `streamText` return properties

**Example:**

```typescript
import { runPrompt } from 'lmthing';

const result = await runPrompt(
  (ctx) => {
    // Define variables that will be prepended to prompts
    const userName = ctx.def('USER_NAME', 'John Doe');
    const userData = ctx.defData('USER_DATA', { age: 30, city: 'NYC' });
    
    // Register tools
    ctx.defTool(
      'getWeather',
      'Get weather for a city',
      z.object({ city: z.string() }),
      async ({ city }) => {
        return `Weather in ${city}: Sunny, 72°F`;
      }
    );
    
    // Register sub-agents
    ctx.defAgent(
      'researcher',
      'Research topics in depth',
      z.object({ topic: z.string() }),
      async (args, agentCtx) => {
        return agentCtx.$`Research: ${args.topic}`;
      }
    );
    
    // Construct the final prompt (does not execute)
    ctx.$`Help ${userName} with their question about weather.`;
  },
  {
    model: 'openai:gpt-4o', // Format: provider:model_id
    temperature: 0.7,
    maxOutputTokens: 1000,
  }
);

// Stream the response
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// Or get the full text
const fullText = await result.text;
console.log('Full response:', fullText);

// Access usage statistics
const usage = await result.usage;
console.log('Tokens used:', usage.totalTokens);
```

**Supported Model Providers:**

The `model` parameter accepts two formats:

1. **String format**: `provider:model_id` where the provider is automatically resolved from the AI SDK
2. **Direct provider**: An AI SDK `LanguageModelV1` implementation

Examples:

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

// Using string format
{ model: 'openai:gpt-4o' }
{ model: 'anthropic:claude-3-5-sonnet-20241022' }
{ model: 'google:gemini-1.5-pro' }

// Using direct provider implementation
{ model: openai('gpt-4o') }
{ model: anthropic('claude-3-5-sonnet-20241022') }
{ model: openai('gpt-4-turbo', { structuredOutputs: true }) }
```

Common providers:
- `'openai:gpt-4o'` or `openai('gpt-4o')` - OpenAI's GPT-4o
- `'openai:gpt-4-turbo'` or `openai('gpt-4-turbo')` - OpenAI's GPT-4 Turbo
- `'anthropic:claude-3-5-sonnet-20241022'` or `anthropic('claude-3-5-sonnet-20241022')` - Anthropic's Claude 3.5 Sonnet
- `'google:gemini-1.5-pro'` or `google('gemini-1.5-pro')` - Google's Gemini 1.5 Pro
- `'mistral:mistral-large-latest'` or `mistral('mistral-large-latest')` - Mistral's Large model

The provider registry is managed by the AI SDK and automatically handles authentication and configuration for each provider.

**Custom Model Providers:**

You can configure custom model providers using environment variables. This allows you to use any OpenAI-compatible API endpoint:

```bash
# Custom provider configuration
ZAI_API_KEY=your-api-key
ZAI_API_BASE=https://api.z.ai/api/coding/paas/v4
ZAI_API_TYPE=openai
```

With these environment variables set, you can use the custom provider in your model string:
```ts
{
  model: 'zai:glm-4.6', // Custom provider:model_id
}
```

**Model Aliases:**

You can create model aliases using environment variables to make model selection more flexible and easier to change across your application:

```bash
# Define a model alias
GEN_MODEL_LARGE=zai:glm-4.6
```
```ts
{
  model: 'large', // Resolves to 'zai:glm-4.6'
}
```



**Environment Variable Naming Convention:**

Custom providers follow this pattern:
- `{PROVIDER}_API_KEY` - API key for authentication
- `{PROVIDER}_API_BASE` - Base URL for the API endpoint
- `{PROVIDER}_API_TYPE` - API type (typically `openai` for OpenAI-compatible APIs)


## Context Functions

The `PromptContext` object provides the following functions for building agentic workflows. These functions construct the arguments passed to the AI SDK's [`streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) function:

### `defMessage(name: string, content: string)`

Adds a message to the conversation history. Maps to the `messages` parameter in `streamText`. Supports all message types: system, user, assistant, and tool messages.

```typescript
ctx.defMessage('system', 'You are a helpful assistant.');
ctx.defMessage('user', 'Hello!');
ctx.defMessage('assistant', 'Hi there! How can I help?');
```

### `def(variableName: string, content: string)`

Defines a variable that will be prepended to the `system` prompt in `streamText`. Variables are formatted as `<VARIABLE_NAME>content</VARIABLE_NAME>` and can be referenced in prompts using the returned `<VARIABLE_NAME>` placeholder. Automatically adds system instructions on first use.

```typescript
const userNameRef = ctx.def('USER_NAME', 'John Doe');
const contextRef = ctx.def('CONTEXT', 'This is a customer support conversation');

// Use the returned reference in prompts
ctx.$`Please help ${userNameRef} with their question. Context: ${contextRef}`;
```

### `defData(variableName: string, data: object)`

Defines a data variable containing JSON that will be prepended to the `system` prompt in `streamText`, wrapped in XML tags and transformed to YAML format. This is useful for structured data that's easier to read in YAML. Returns `<VARIABLE_NAME>` which can be used as a placeholder in prompts. Automatically adds system instructions on first use.

```typescript
const userData = ctx.defData('USER_DATA', {
  name: 'John Doe',
  age: 30,
  preferences: ['coding', 'reading']
});

// The data will be formatted as:
// <USER_DATA>
// name: John Doe
// age: 30
// preferences:
//   - coding
//   - reading
// </USER_DATA>

ctx.$`Analyze the following user data: ${userData}`;
```

### `defTool<T>(name: string, description: string, schema: T, fn: Function)`

Registers a tool that maps to the `tools` parameter in `streamText`. Takes a Zod schema for input validation (mapped to `inputSchema`) and executes the provided function when invoked by the model (mapped to `execute`).

```typescript
ctx.defTool(
  'search',
  'Search for information',
  z.object({ query: z.string() }),
  async (args) => {
    return await performSearch(args.query);
  }
);
```

**Tool Execution Context:**

The tool execution function receives `ToolExecutionOptions` as the second parameter, providing:
- `toolCallId`: The ID of the tool call
- `messages`: Messages sent to the model for this response
- `abortSignal`: Signal for canceling the operation

```typescript
ctx.defTool(
  'longRunningTask',
  'Performs a task that can be cancelled',
  z.object({ data: z.string() }),
  async (args, { toolCallId, messages, abortSignal }) => {
    console.log(`Executing tool call ${toolCallId}`);
    // Use abortSignal to check if operation should be cancelled
    return await performTask(args.data, abortSignal);
  }
);
```

### `defAgent<T>(name: string, description: string, inputSchema: T, fn: Function, options?: AgentOptions)`

Registers a sub-agent as a callable tool in the `tools` parameter. The agent runs its own `streamText` execution context with independent state. Supports custom configuration:

- `model`: Override the language model for this agent. Can be either:
  - A string in the format `provider:model_id` (e.g., `'openai:gpt-4o'`)
  - An AI SDK `LanguageModelV1` provider implementation (e.g., `openai('gpt-4o')`)
- `responseSchema`: Define expected output structure using `experimental_output`
- `system`: Custom system prompt for the agent
- `plugins`: Additional plugins for the agent context

```typescript
import { openai } from '@ai-sdk/openai';

ctx.defAgent(
  'researcher',
  'Research a topic in depth',
  z.object({ topic: z.string() }),
  async (args, agentCtx) => {
    return agentCtx.$`Research the topic: ${args.topic}`;
  },
  { 
    model: 'openai:gpt-4o', // String format
    system: 'You are a research specialist.'
  }
);

// Or with direct provider
ctx.defAgent(
  'analyst',
  'Analyze data with structured output',
  z.object({ data: z.string() }),
  async (args, agentCtx) => {
    return agentCtx.$`Analyze: ${args.data}`;
  },
  { 
    model: openai('gpt-4o', { structuredOutputs: true }), // Direct provider
    system: 'You are a data analyst.'
  }
);
```

### `defHook(hook: MessageHistoryHook)`

Registers a hook that maps to the `prepareStep` parameter in `streamText`. The hook transforms message history before each LLM request step, receiving the current messages array and returning a modified version. This integrates with AI SDK's streaming lifecycle:

- **`prepareStep`**: Called before each generation step to transform messages
- **`onStepFinish`**: Used internally to restore original messages after the step

Use cases:
- Filter messages (e.g., remove old system messages)
- Transform message content (e.g., anonymize data)
- Add dynamic context (e.g., inject recent data)
- Implement sliding window contexts

```typescript
// Filter out certain messages
ctx.defHook((messages) => {
  return messages.filter(msg => msg.role !== 'system');
});

// Transform message content
ctx.defHook((messages) => {
  return messages.map(msg => ({
    ...msg,
    content: typeof msg.content === 'string' 
      ? msg.content.toLowerCase() 
      : msg.content
  }));
});

// Add contextual information dynamically
ctx.defHook((messages) => {
  return [
    { role: 'system', content: 'Current time: ' + new Date().toISOString() },
    ...messages,
  ];
});

// Implement sliding window (keep last N messages)
ctx.defHook((messages) => {
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system').slice(-10);
  return [...systemMessages, ...otherMessages];
});
```

### `defTaskList(tasks: Task[])`

Sets up a sequential task execution system with validation. Creates a workflow where:

- Tasks are executed sequentially, one at a time
- A `finishTask` tool is automatically registered via `tools` parameter
- Each task result is validated before proceeding
- Validation failures provide feedback for correction attempts
- Uses `defHook` to manage message history, showing only:
  - Task summaries for completed tasks
  - Current task details
  - Upcoming tasks list
- Leverages `stopWhen` to control multi-step execution

Each task requires:
- `task`: Description of what needs to be done
- `validation`: Function that returns error message on failure, or `undefined`/`void` on success
- `extend` (optional): Function to add task-specific context, tools, and messages
  - Receives `ctx` (PromptContext) and `messages` (current message history)
  - Can call any context methods (`defTool`, `def`, `defMessage`, etc.)
  - Uses `prepareStep` internally to activate extensions when the task starts
  - Extensions are automatically cleaned up via `prepareStep` when the task completes
  - Only active during the specific task execution

```typescript
ctx.defTaskList([
  {
    task: 'Calculate 5 + 3',
    validation: (result) => {
      const num = parseInt(result.trim());
      if (num !== 8) {
        return `Incorrect. Expected 8, got ${result}`;
      }
    },
  },
  {
    task: 'Multiply the previous result by 2',
    extend: (ctx, messages) => {
      // Add task-specific tools
      ctx.defTool(
        'calculator',
        'Perform multiplication',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => String(a * b)
      );
      
      // Add task-specific context
      ctx.def('ALLOWED_OPERATIONS', 'multiplication only');
      
      // Add task-specific message
      ctx.defMessage('system', 'Use the calculator tool for multiplication.');
      
      // All extensions are automatically removed via prepareStep when task completes
    },
    validation: (result) => {
      const num = parseInt(result.trim());
      if (num !== 16) {
        return `Incorrect. Expected 16 (8 * 2), got ${result}`;
      }
    },
  },
  {
    task: 'Subtract 6 from the previous result',
    validation: (result) => {
      const num = parseInt(result.trim());
      if (num !== 10) {
        return `Incorrect. Expected 10 (16 - 6), got ${result}`;
      }
    },
  },
]);

// The LLM receives finishTask tool automatically
await ctx.$`Complete all tasks using the finishTask tool.`;
```

**How `extend` integrates with `prepareStep`:**

The `extend` function leverages the `prepareStep` parameter from `streamText` to manage task-specific configurations:

1. **Task Start**: When a task becomes active (via `startTask` tool), `prepareStep` applies the extensions by calling the `extend` function, which adds task-specific tools, variables, and messages to the context.

2. **Task Execution**: During the task, all extensions are active and available to the model via the modified `tools`, `system`, and `messages` parameters.

3. **Task Complete**: When the task finishes (via `finishTask` tool), `prepareStep` removes all task-specific extensions, restoring the base context for the next task.

This ensures clean isolation between tasks while maintaining the global context (completed task summaries, upcoming tasks, etc.).

### `defDynamicTaskList()`

Sets up a dynamic task list system using `tools` parameter to register task management functions. Unlike `defTaskList`, this allows agents to create and manage tasks during execution.

**Automatically Registered Tools (via `tools` parameter):**

- **`createTask`**: Add new tasks
  ```typescript
  { description: string } // Creates task with 'pending' status
  ```

- **`updateTask`**: Modify pending tasks
  ```typescript
  { taskId: string, newDescription: string }
  ```

- **`startTask`**: Mark pending task as in-progress
  ```typescript
  { taskId: string }
  ```

- **`completeTask`**: Mark task as completed (pending or in-progress)
  ```typescript
  { taskId: string, result: string }
  ```

- **`getTaskList`**: View all tasks with their states
  ```typescript
  {} // Returns formatted list of all tasks
  ```

- **`deleteTask`**: Remove pending tasks only
  ```typescript
  { taskId: string }
  ```

**Task States:**
- `pending`: Created but not started
- `in_progress`: Currently being worked on
- `completed`: Finished with results

**Message History Management:**

Uses `defHook` (via `prepareStep`) to maintain focused context:
- Shows completed tasks as summaries
- Highlights current in-progress task
- Lists pending tasks for planning
- Replaces message history to keep context clean
- Agent must complete all tasks to finish

```typescript
ctx.defDynamicTaskList();

// Agent can now dynamically manage tasks
await ctx.$`
  Create a plan to build a user authentication system.
  Break it down into tasks and complete them one by one.
`;
```

### `$(strings: TemplateStringsArray, ...values: any[]): string`

Template literal tag function for creating prompts. Automatically prepends all defined variables to the prompt and returns the formatted prompt string.

```typescript
const prompt = ctx.$`
  Please help ${userName} with their question:
  ${userQuestion}
`;
```

## Integration with AI SDK

All context functions ultimately construct arguments for the AI SDK's `streamText` function [STREAM_TEXT.md](./STREAM_TEXT.md)

This provides a higher-level API while maintaining full access to AI SDK's streaming capabilities and lifecycle hooks.

You can find more info at https://ai-sdk.dev/docs/reference/ai-sdk-core
https://www.npmjs.com/package/ai and https://www.npmjs.com/package/@ai/**