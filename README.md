# Agent Executor

## runPrompt

The `runPrompt` function is the main entry point for executing agentic workflows. It creates a `Prompt` instance and executes a prompt configuration function, returning the execution result.

**Signature:**

```typescript
runPrompt(
  fn: (prompt: Prompt) => Promise<void>,
  config: PromptConfig
): Promise<RunPromptResult>
```

**Parameters:**

- `fn`: A function that receives a `Prompt` instance and configures the prompt by calling context methods (`def`, `defTool`, `defAgent`, etc.)
- `config`: Configuration object with the following structure:
  - `model`: (required) The language model to use. Can be either:
    - A string in the format `provider:model_id` (e.g., `'openai:gpt-4o'`, `'anthropic:claude-3-5-sonnet'`). The provider is automatically resolved from the AI SDK.
    - An AI SDK `LanguageModelV1` provider implementation directly (e.g., `openai('gpt-4o')`, `anthropic('claude-3-5-sonnet-20241022')`).
  - `options`: (optional) Additional configuration options that map to `streamText` parameters:
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

Returns a `Promise<RunPromptResult>` which contains:
- `result`: A `StreamTextResult` with all the properties from [`streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), including:
  - `textStream`: Async iterable of text deltas
  - `fullStream`: Async iterable of all events
  - `text`: Promise resolving to full text
  - `usage`: Promise resolving to token usage
  - `toolCalls`: Promise resolving to tool calls
  - `toolResults`: Promise resolving to tool results
  - And all other `streamText` return properties
- `prompt`: The `Prompt` instance used for execution

**Example:**

```typescript
import { runPrompt } from 'lmthing';

const { result, prompt } = await runPrompt(
  async (prompt) => {
    // Define variables that will be prepended to prompts
    const userName = prompt.def('USER_NAME', 'John Doe');
    const userData = prompt.defData('USER_DATA', { age: 30, city: 'NYC' });

    // Register tools
    prompt.defTool(
      'getWeather',
      'Get weather for a city',
      z.object({ city: z.string() }),
      async ({ city }) => {
        return `Weather in ${city}: Sunny, 72°F`;
      }
    );

    // Register sub-agents
    prompt.defAgent(
      'researcher',
      'Research topics in depth',
      z.object({ topic: z.string() }),
      async (args, prompt) => {
        prompt.$`Research: ${args.topic}`;
      }
    );

    // Construct the final prompt and add as user message
    prompt.$`Help ${userName} with their question about weather.`;
  },
  {
    model: 'openai:gpt-4o', // Format: provider:model_id
    options: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    }
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
# Define a model alias using the LM_MODEL_* prefix
LM_MODEL_LARGE=openai:gpt-4o
LM_MODEL_FAST=openai:gpt-4o-mini
LM_MODEL_SMART=anthropic:claude-3-opus-20240229
```
```ts
{
  model: 'large', // Resolves to 'openai:gpt-4o'
}
```



**Environment Variable Naming Convention:**

Custom providers follow this pattern:
- `{PROVIDER}_API_KEY` - API key for authentication
- `{PROVIDER}_API_BASE` - Base URL for the API endpoint
- `{PROVIDER}_API_TYPE` - API type (typically `openai` for OpenAI-compatible APIs)


## Context Functions

The `Prompt` object provides the following functions for building agentic workflows. These functions construct the arguments passed to the AI SDK's [`streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) function:

### `defMessage(role: 'user' | 'assistant', content: string)`

Adds a message to the conversation history. Maps to the `messages` parameter in `streamText`. Only supports `'user'` and `'assistant'` roles. For system prompts, use `defSystem` instead.

```typescript
prompt.defMessage('user', 'Hello!');
prompt.defMessage('assistant', 'Hi there! How can I help?');
```

### `defSystem(name: string, value: string)`

Adds a named system prompt part that will be prepended to the `system` prompt in `streamText`. Multiple system parts can be defined and will be joined together with labels.

```typescript
prompt.defSystem('role', 'You are a helpful assistant.');
prompt.defSystem('guidelines', 'Always be polite and professional.');

// Results in a system prompt like:
// role:
// You are a helpful assistant.
// guidelines:
// Always be polite and professional.
```

### `def(variableName: string, content: string)`

Defines a variable that will be prepended to the `system` prompt in `streamText`. Variables are formatted as `<VARIABLE_NAME>content</VARIABLE_NAME>` and can be referenced in prompts using the returned `<VARIABLE_NAME>` placeholder. Automatically adds system instructions on first use.

```typescript
const userNameRef = prompt.def('USER_NAME', 'John Doe');
const contextRef = prompt.def('CONTEXT', 'This is a customer support conversation');

// Use the returned reference in prompts
prompt.$`Please help ${userNameRef} with their question. Context: ${contextRef}`;
```

### `defData(variableName: string, data: object)`

Defines a data variable containing JSON that will be prepended to the `system` prompt in `streamText`, wrapped in XML tags and transformed to YAML format. This is useful for structured data that's easier to read in YAML. Returns `<VARIABLE_NAME>` which can be used as a placeholder in prompts. Automatically adds system instructions on first use.

```typescript
const userData = prompt.defData('USER_DATA', {
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

prompt.$`Analyze the following user data: ${userData}`;
```

### `defTool<T>(name: string, description: string, schema: T, fn: Function)`

Registers a tool that maps to the `tools` parameter in `streamText`. Takes a Zod schema for input validation (mapped to `inputSchema`) and executes the provided function when invoked by the model (mapped to `execute`).

```typescript
prompt.defTool(
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
prompt.defTool(
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

### `defTool(name: string, description: string, subTools: SubToolDefinition[])`

**Composite Tools:** When an array of sub-tool definitions is provided, `defTool` creates a single composite tool that allows the LLM to invoke multiple sub-tools in a single tool call. This is useful for grouping related operations (e.g., file operations, database queries) and reducing the number of round-trips.

```typescript
import { tool } from 'lmthing';

prompt.defTool('file', 'File system operations', [
  tool('write', 'Write content to a file', z.object({
    path: z.string().describe('File path'),
    content: z.string().describe('Content to write')
  }), async ({ path, content }) => {
    await fs.writeFile(path, content);
    return { success: true };
  }),
  tool('append', 'Append content to a file', z.object({
    path: z.string().describe('File path'),
    content: z.string().describe('Content to append')
  }), async ({ path, content }) => {
    await fs.appendFile(path, content);
    return { success: true };
  }),
  tool('read', 'Read content from a file', z.object({
    path: z.string().describe('File path')
  }), async ({ path }) => {
    const content = await fs.readFile(path, 'utf-8');
    return { content };
  })
]);
```

**How the LLM uses composite tools:**

The model calls the composite tool with an array of sub-tool calls:
```json
{
  "calls": [
    { "name": "write", "args": { "path": "/tmp/test.txt", "content": "Hello" } },
    { "name": "append", "args": { "path": "/tmp/test.txt", "content": " World" } },
    { "name": "read", "args": { "path": "/tmp/test.txt" } }
  ]
}
```

**Return value:**

The composite tool returns results for each sub-tool call:
```json
{
  "results": [
    { "name": "write", "result": { "success": true } },
    { "name": "append", "result": { "success": true } },
    { "name": "read", "result": { "content": "Hello World" } }
  ]
}
```

**Error handling:**

If a sub-tool throws an error, execution continues for remaining sub-tools, and the error is captured in the result:
```json
{
  "results": [
    { "name": "write", "result": { "success": true } },
    { "name": "fail", "result": { "error": "Permission denied" } },
    { "name": "read", "result": { "content": "Hello" } }
  ]
}
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

prompt.defAgent(
  'researcher',
  'Research a topic in depth',
  z.object({ topic: z.string() }),
  async (args, prompt) => {
    prompt.$`Research the topic: ${args.topic}`;
  },
  {
    model: 'openai:gpt-4o', // String format
    system: 'You are a research specialist.'
  }
);

// Or with direct provider
prompt.defAgent(
  'analyst',
  'Analyze data with structured output',
  z.object({ data: z.string() }),
  async (args, prompt) => {
    prompt.$`Analyze: ${args.data}`;
  },
  {
    model: openai('gpt-4o', { structuredOutputs: true }), // Direct provider
    system: 'You are a data analyst.'
  }
);
```

### `defHook(hookFn: (options) => DefHookResult)`

Registers a hook that maps to the `prepareStep` parameter in `streamText`. The hook is called before each generation step and can modify the step configuration.

**Hook Function Parameters:**

The hook receives an options object containing:
- `messages`: Current message history
- `model`: The language model being used
- `steps`: Array of previous step results
- `stepNumber`: Current step number (0-indexed)
- `variables`: Record of defined variables (from `def` and `defData`)

**Return Value:**

The hook should return an object with optional properties:
- `system`: Override the system prompt
- `activeTools`: Array of tool names to make available for this step
- `messages`: Modified message history
- `variables`: Updated variables

Use cases:
- Control which tools are available at each step
- Filter or transform messages
- Add dynamic context based on step number
- Modify variables during execution

```typescript
// Control tool availability by step
prompt.defHook(({ stepNumber }) => {
  if (stepNumber === 0) {
    return { activeTools: ['search'] }; // Only search on first step
  }
  return {};
});

// Filter messages to implement sliding window
prompt.defHook(({ messages }) => {
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system').slice(-10);
  return { messages: [...systemMessages, ...otherMessages] };
});

// Add dynamic system prompt based on context
prompt.defHook(({ stepNumber, variables }) => {
  return {
    system: `Step ${stepNumber}. Current time: ${new Date().toISOString()}`
  };
});

// Modify variables during execution
prompt.defHook(({ variables, stepNumber }) => {
  return {
    variables: {
      ...variables,
      CURRENT_STEP: { type: 'string', value: String(stepNumber) }
    }
  };
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
  - Receives `prompt` (Prompt instance) and `messages` (current message history)
  - Can call any context methods (`defTool`, `def`, `defMessage`, etc.)
  - Uses `prepareStep` internally to activate extensions when the task starts
  - Extensions are automatically cleaned up via `prepareStep` when the task completes
  - Only active during the specific task execution

```typescript
prompt.defTaskList([
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
    extend: (prompt, messages) => {
      // Add task-specific tools
      prompt.defTool(
        'calculator',
        'Perform multiplication',
        z.object({ a: z.number(), b: z.number() }),
        async ({ a, b }) => String(a * b)
      );

      // Add task-specific context
      prompt.def('ALLOWED_OPERATIONS', 'multiplication only');

      // Add task-specific system instruction
      prompt.defSystem('instructions', 'Use the calculator tool for multiplication.');

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
prompt.$`Complete all tasks using the finishTask tool.`;
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
prompt.defDynamicTaskList();

// Agent can now dynamically manage tasks
prompt.$`
  Create a plan to build a user authentication system.
  Break it down into tasks and complete them one by one.
`;
```

### `$(strings: TemplateStringsArray, ...values: any[]): void`

Template literal tag function for adding user messages to the conversation. Interpolates the values into the template string and adds the result as a user message to the message history.

```typescript
// Adds a user message to the conversation
prompt.$`
  Please help ${userName} with their question:
  ${userQuestion}
`;

// Note: This returns void and cannot be assigned to a variable
// It directly modifies the message history
```

## Integration with AI SDK

All context functions ultimately construct arguments for the AI SDK's `streamText` function [STREAM_TEXT.md](./STREAM_TEXT.md)

This provides a higher-level API while maintaining full access to AI SDK's streaming capabilities and lifecycle hooks.

You can find more info at https://ai-sdk.dev/docs/reference/ai-sdk-core
https://www.npmjs.com/package/ai and https://www.npmjs.com/package/@ai/**