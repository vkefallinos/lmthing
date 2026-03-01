# Agent Executor

## StatefulPrompt

`StatefulPrompt` is the main prompt class that provides all prompt-building functionality including React-like hooks for managing state across prompt re-executions. It provides state persistence and effects that run based on dependency changes.

**Key Features:**
- **State Management**: `defState` for managing state that persists across prompt re-executions
- **Effects**: `defEffect` for running side effects based on dependency changes
- **Re-execution Model**: The prompt function re-executes on each step after the first, allowing dynamic behavior
- **Definition Reconciliation**: Automatically removes unused definitions from previous executions

### `defState<T>(key: string, initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void]`

Creates state that persists across prompt re-executions, similar to React's `useState`.

```typescript
const [count, setCount] = prompt.defState('counter', 0);

// Get the current value
console.log(count); // 0

// Update the value
setCount(1); // Set to 1
setCount(prev => prev + 1); // Increment from current value
```

The state proxy can be used directly in template literals:
```typescript
prompt.$`Current count: ${count}`; // Shows the current value
```

### `defEffect(callback: (context: PromptContext, stepModifier: StepModifier) => void, dependencies?: any[])`

Registers an effect that runs when dependencies change, similar to React's `useEffect`.

```typescript
import { PromptContext, StepModifier } from 'lmthing';

// Effect without dependencies - runs on every step
prompt.defEffect((context, stepModifier) => {
  console.log('Step:', context.stepNumber);

  // Modify the current step
  stepModifier('messages', [{
    role: 'system',
    content: `Step ${context.stepNumber}`
  }]);
});

// Effect with dependencies - runs only when dependencies change
prompt.defEffect((context, stepModifier) => {
  // Run side effect when count changes
  console.log('Count changed to:', count);
}, [count]);
```

**PromptContext provides:**
- `messages`: Current message history
- `stepNumber`: Current step number (0-indexed)
- `tools`: ToolCollection utility to check available tools
- `systems`: SystemCollection utility to check available systems
- `variables`: VariableCollection utility to check available variables
- `lastTool`: Information about the last tool call

**StepModifier allows modifying the current step:**
- `stepModifier('messages', items)`: Add/modify messages
- `stepModifier('tools', items)`: Add/modify tools
- `stepModifier('systems', items)`: Add/modify system parts
- `stepModifier('variables', items)`: Add/modify variables

## runPrompt

The `runPrompt` function is the main entry point for executing agentic workflows. It creates a `StatefulPrompt` instance and executes a prompt configuration function, returning the execution result.

**Signature:**

```typescript
runPrompt(
  fn: (prompt: StatefulPrompt) => Promise<void>,
  config: PromptConfig
): Promise<RunPromptResult>
```

**Parameters:**

- `fn`: A function that receives a `StatefulPrompt` instance and configures the prompt by calling context methods (`def`, `defState`, `defEffect`, `defTool`, `defAgent`, etc.)
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
    - `prepareStep`: Function to modify settings for each step during multi-step generation. Receives step information and can return modified model, toolChoice, activeTools, system prompt, or messages for the current step. Is given access through defEffect with stepModifier.
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
- `prompt`: The `StatefulPrompt` instance used for execution

**Example:**

```typescript
import { runPrompt } from 'lmthing';
import { PromptContext, StepModifier } from 'lmthing';

const { result, prompt } = await runPrompt(
  async (prompt) => {
    // Define state that persists across re-executions
    const [count, setCount] = prompt.defState('counter', 0);
    const [history, setHistory] = prompt.defState('history', []);

    // Define an effect that runs on every step
    prompt.defEffect((context: PromptContext, step: StepModifier) => {
      // Add a system message with the current step number
      step('messages', [{
        role: 'system',
        content: `Step ${context.stepNumber}: Current count is ${count}`
      }]);
    });

    // Define an effect that runs when count changes
    prompt.defEffect((context: PromptContext, step: StepModifier) => {
      console.log(`Count changed to: ${count}`);
    }, [count]);

    // Define a tool that updates state
    prompt.defTool(
      'increment',
      'Increment the counter by a given amount',
      z.object({ amount: z.number() }),
      async ({ amount }) => {
        const newCount = count + amount;
        setCount(newCount);
        setHistory([...history, `Incremented to ${newCount}`]);
        return { newCount, history };
      }
    );

    // Define variables that will be prepended to prompts
    const userName = prompt.def('USER_NAME', 'John Doe');
    const userData = prompt.defData('USER_DATA', { age: 30, city: 'NYC' });

    // Register sub-agents
    prompt.defAgent(
      'researcher',
      'Research topics in depth',
      z.object({ topic: z.string() }),
      async (args, agentPrompt) => {
        agentPrompt.$`Research: ${args.topic}`;
      }
    );

    // Construct the final prompt and add as user message
    prompt.$`Help ${userName} with their question. The current count is ${count}.`;
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

// Access the steps history
console.log('Steps executed:', prompt.steps);
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

**GitHub Models API (for CI/CD):**

GitHub provides free access to various AI models through the GitHub Models API, which is perfect for testing in CI/CD pipelines. This is particularly useful if you have GitHub Copilot Pro or want to test with real LLMs in GitHub Actions.

```bash
# GitHub Models API configuration
GITHUB_MODELS_API_KEY=your-github-token
GITHUB_MODELS_API_BASE=https://models.inference.ai.azure.com
GITHUB_MODELS_API_TYPE=openai
GITHUB_MODELS_API_NAME=github  # Optional display name
```

Usage:
```ts
{
  model: 'github:gpt-4o-mini', // Available: gpt-4o, gpt-4o-mini, o1-preview, o1-mini, Phi-3-*, etc.
}
```

For detailed CI/CD setup instructions, see [docs/GITHUB_MODELS_CI.md](./docs/GITHUB_MODELS_CI.md).

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

The `StatefulPrompt` object provides the following functions for building agentic workflows. These functions construct the arguments passed to the AI SDK's [`streamText`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) function:

### `defMessage(role: 'user' | 'assistant', content: string)`

Adds a message to the conversation history. Maps to the `messages` parameter in `streamText`. Only supports `'user'` and `'assistant'` roles. For system prompts, use `defSystem` instead.

```typescript
prompt.defMessage('user', 'Hello!');
prompt.defMessage('assistant', 'Hi there! How can I help?');
```

### `defState<T>(key: string, initialValue: T): [T, (newValue: T | ((prev: T) => T)) => void]`

Creates state that persists across prompt re-executions. Returns a tuple with the current state value and a setter function. The state is a proxy that can be used directly in template literals.

```typescript
const [count, setCount] = prompt.defState('counter', 0);
const [user, setUser] = prompt.defState('user', { name: 'John', age: 30 });

// Get current value
console.log(count); // 0
console.log(user.name); // 'John'

// Update with value
setCount(5);

// Update with function
setCount(prev => prev + 1);
setUser(prev => ({ ...prev, age: prev.age + 1 }));

// Use in templates
prompt.$`The count is ${count} and user is ${user.name}`;
```

### `defEffect(callback: (context: PromptContext, stepModifier: StepModifier) => void, dependencies?: any[])`

Registers an effect that runs based on dependency changes. Similar to React's useEffect.

```typescript
import { PromptContext, StepModifier } from 'lmthing';

// Effect without dependencies - runs every step
prompt.defEffect((context: PromptContext, stepModifier: StepModifier) => {
  console.log('Current step:', context.stepNumber);
});

// Effect with dependencies - runs only when dependencies change
prompt.defEffect((context: PromptContext, stepModifier: StepModifier) => {
  // Only runs when 'count' changes
  stepModifier('messages', [{
    role: 'system',
    content: `Count updated to ${count}`
  }]);
}, [count]);
```

**Context API:**
- `context.messages`: Current message history
- `context.stepNumber`: Current step (0-indexed)
- `context.tools`: ToolCollection utility
- `context.systems`: SystemCollection utility
- `context.variables`: VariableCollection utility
- `context.lastTool`: Info about last tool call

**StepModifier API:**
- `stepModifier('messages', items)`: Add/modify messages
- `stepModifier('tools', items)`: Add/modify tools
- `stepModifier('systems', items)`: Add/modify systems
- `stepModifier('variables', items)`: Add/modify variables

### `defSystem(name: string, value: string)`

Adds a named system prompt part that will be prepended to the `system` prompt in `streamText`. Multiple system parts can be defined and will be formatted as XML tags. System parts can be dynamically filtered per-step using `defEffect` with `stepModifier('systems', ...)`.

```typescript
prompt.defSystem('role', 'You are a helpful assistant.');
prompt.defSystem('guidelines', 'Always be polite and professional.');

// Results in a system prompt like:
// <role>
// You are a helpful assistant.
// </role>
// <guidelines>
// Always be polite and professional.
// </guidelines>
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

### Definition Proxy Methods

All `def*` methods (`def`, `defData`, `defSystem`, `defTool`, `defAgent`) return a proxy object that acts as a string in templates but also provides utility methods:

```typescript
const userName = prompt.def('USER_NAME', 'Alice');

// Use in templates (acts as string '<USER_NAME>')
prompt.$`Hello ${userName}`;

// Access the tag value
console.log(userName.value);  // '<USER_NAME>'

// Mark for reminder - adds a message reminding the model to use this definition
userName.remind();

// Disable for current step - removes definition from next step
// Should be called within defEffect
prompt.defEffect((ctx, stepModifier) => {
  if (someCondition) {
    userName.disable();  // USER_NAME won't be in the next step's system prompt
  }
});
```

**Available methods:**
- `.value` - Returns the XML tag string (e.g., `'<USER_NAME>'`)
- `.remind()` - Marks the definition to remind the model to use it
- `.disable()` - Removes the definition from the next step (use within `defEffect`)
- `.toString()` / `.valueOf()` - Returns the tag for string coercion

**Introspection:**
```typescript
// Get all reminded items
const reminded = prompt.getRemindedItems();
// Returns: [{ type: 'def', name: 'USER_NAME' }, ...]
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

### Tool Options: Response Schema & Callbacks

Both single and composite tools support optional response schema definition and event callbacks for monitoring, validation, and output transformation:

```typescript
// Single tool with callbacks
prompt.defTool(
  'calculate',
  'Calculate numbers',
  z.object({ a: z.number(), b: z.number() }),
  async ({ a, b }) => {
    return { result: a + b };
  },
  {
    // Optional: Define expected response structure
    responseSchema: z.object({
      result: z.number()
    }),

    // Optional: Called before execution
    // Return undefined to continue, or return a value to short-circuit
    beforeCall: async (input, output) => {
      console.log('Executing with input:', input);
      return undefined; // Continue to execute tool
    },

    // Optional: Called after successful execution
    // Return undefined to keep result, or return modified result
    onSuccess: async (input, output) => {
      console.log('Tool succeeded with output:', output);
      return undefined; // Use original output
    },

    // Optional: Called if tool throws an error
    // Return undefined to keep error, or return modified result
    onError: async (input, error) => {
      console.log('Tool failed with error:', error);
      return { fallback: true };
    }
  }
);
```

**Callback Behavior:**

- **`beforeCall(input, output)`**: Invoked before tool execution. If returns a non-undefined value, execution is skipped and that value becomes the result.
- **`onSuccess(input, output)`**: Invoked after successful execution. Return `undefined` to keep the original output, or return a new value to use instead.
- **`onError(input, error)`**: Invoked when tool throws an error. Return `undefined` to keep the error object, or return a recovery value.

**With Composite Tools:**

```typescript
import { tool } from 'lmthing';

prompt.defTool('operations', 'File and database operations', [
  tool('writeFile', 'Write to file', z.object({ path: z.string(), content: z.string() }),
    async ({ path, content }) => {
      await fs.writeFile(path, content);
      return { success: true };
    },
    {
      onSuccess: async (input, output) => {
        console.log(`File written to ${input.path}`);
        return undefined;
      }
    }
  ),
  tool('readFile', 'Read from file', z.object({ path: z.string() }),
    async ({ path }) => {
      const content = await fs.readFile(path, 'utf-8');
      return { content };
    },
    {
      responseSchema: z.object({ content: z.string() }),
      onError: async (input, error) => {
        return { content: '', error: 'File not found' };
      }
    }
  )
]);
```

For composite tools, each sub-tool's callbacks are executed independently during the composite tool execution.

### `defAgent<T>(name: string, description: string, inputSchema: T, fn: Function, options?: AgentOptions)`

Registers a sub-agent as a callable tool in the `tools` parameter. The agent runs its own `streamText` execution context with independent state. Supports custom configuration:

- `model`: Override the language model for this agent. Can be either:
  - A string in the format `provider:model_id` (e.g., `'openai:gpt-4o'`)
  - An AI SDK `LanguageModelV1` provider implementation (e.g., `openai('gpt-4o')`)
- `responseSchema`: Define expected output structure as a Zod schema. The agent will be instructed to respond with valid JSON matching this schema, and the response will be validated automatically.
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

// Agent with response schema validation
prompt.defAgent(
  'analyst',
  'Analyze data with structured output',
  z.object({ data: z.string() }),
  async (args, prompt) => {
    prompt.$`Analyze: ${args.data}`;
  },
  {
    model: 'openai:gpt-4o',
    system: 'You are a data analyst.',
    responseSchema: z.object({
      summary: z.string().describe('Summary of the analysis'),
      score: z.number().describe('Score from 0-100'),
      recommendations: z.array(z.string()).describe('List of recommendations')
    })
  }
);
```

**Response Schema Behavior:**

When `responseSchema` is provided:
1. The agent receives instructions to respond with valid JSON matching the schema
2. The schema is converted to JSON Schema format and included in the agent's system prompt
3. After execution, the agent's response is validated against the schema
4. If validation fails, the response includes a `validationError` field
5. Both single agents and composite agents support response schemas

### `defAgent(name: string, description: string, subAgents: SubAgentDefinition[])`

**Composite Agents:** When an array of sub-agent definitions is provided, `defAgent` creates a single composite agent that allows the LLM to invoke multiple sub-agents in a single tool call. This is useful for grouping related specialized agents (e.g., research team, analysis pipeline) and enabling coordinated agent workflows.

```typescript
import { agent } from 'lmthing';

prompt.defAgent('specialists', 'Specialist agents for research and analysis', [
  agent('researcher', 'Research topics in depth', z.object({
    topic: z.string().describe('Topic to research')
  }), async ({ topic }, agentPrompt) => {
    agentPrompt.defSystem('role', 'You are a research specialist.');
    agentPrompt.$`Research: ${topic}`;
  }, {
    model: 'openai:gpt-4o',
    responseSchema: z.object({
      findings: z.array(z.string()),
      sources: z.array(z.string()),
      confidence: z.number()
    })
  }),
  agent('analyst', 'Analyze data and provide insights', z.object({
    data: z.string().describe('Data to analyze')
  }), async ({ data }, agentPrompt) => {
    agentPrompt.defSystem('role', 'You are a data analyst.');
    agentPrompt.$`Analyze: ${data}`;
  }, {
    model: 'anthropic:claude-3-5-sonnet-20241022',
    responseSchema: z.object({
      summary: z.string(),
      insights: z.array(z.string()),
      score: z.number()
    })
  })
]);
```

**How the LLM uses composite agents:**

The model calls the composite agent with an array of sub-agent calls:
```json
{
  "calls": [
    { "name": "researcher", "args": { "topic": "quantum computing" } },
    { "name": "analyst", "args": { "data": "research findings..." } }
  ]
}
```

**Return value:**

The composite agent returns results for each sub-agent call, including the response text, execution steps, and optional validation errors:
```json
{
  "results": [
    {
      "name": "researcher",
      "response": "{\"findings\": [...], \"sources\": [...], \"confidence\": 0.9}",
      "steps": [...]
    },
    {
      "name": "analyst",
      "response": "{\"summary\": \"...\", \"insights\": [...], \"score\": 85}",
      "steps": [...]
    }
  ]
}
```

**Error handling:**

If a sub-agent throws an error, execution continues for remaining sub-agents, and the error is captured in the result:
```json
{
  "results": [
    { "name": "researcher", "response": "Research complete..." },
    { "name": "failing", "response": "Error: Agent execution failed" }
  ]
}
```

If response schema validation fails, a `validationError` field is included:
```json
{
  "results": [
    {
      "name": "researcher",
      "response": "{\"findings\": [...]}",
      "validationError": "Required property 'confidence' is missing"
    }
  ]
}
```

## Plugin System

The plugin system allows extending `StatefulPrompt` with additional methods. Plugins must be imported from `lmthing/plugins` and passed to `runPrompt` via the `plugins` option.

### Using the Task List Plugin

The built-in task list plugin provides `defTaskList` for managing tasks:

```typescript
import { runPrompt } from 'lmthing';
import { taskListPlugin } from 'lmthing/plugins';

const { result } = await runPrompt(async ({ defTaskList, $ }) => {
  // defTaskList is available because we passed taskListPlugin
  const [tasks, setTasks] = defTaskList([
    { id: '1', name: 'Research the topic', status: 'pending' },
    { id: '2', name: 'Write implementation', status: 'pending' },
    { id: '3', name: 'Add tests', status: 'pending' },
  ]);

  $`Complete all tasks. Use startTask when beginning and completeTask when finished.`;
}, {
  model: 'openai:gpt-4o',
  plugins: [taskListPlugin]
});
```

**Task interface:**
```typescript
interface Task {
  id: string;         // Unique identifier
  name: string;       // Task description
  status: TaskStatus; // 'pending' | 'in_progress' | 'completed' | 'failed'
  metadata?: Record<string, any>;  // Optional metadata
}
```

**Automatically Registered Tools:**

- **`startTask`**: Mark a task as in-progress
  ```typescript
  { taskId: string }
  // Returns: { success: boolean, taskId: string, message: string }
  ```

- **`completeTask`**: Mark a task as completed
  ```typescript
  { taskId: string }
  // Returns: { success: boolean, taskId: string, message: string }
  ```

**System Prompt Updates:**

The plugin automatically adds a system message showing task status via `defEffect`:

```
## Current Task Status

### In Progress (1)
  - [1] Research the topic

### Pending (2)
  - [2] Write implementation
  - [3] Add tests

### Completed (0)
  (none)

Use "startTask" to begin a pending task and "completeTask" when finished.
```

### Using the Task Graph Plugin

The built-in task graph plugin provides `defTaskGraph` for dependency-aware task management using a Directed Acyclic Graph (DAG). Unlike `defTaskList` which manages a flat list of tasks, `defTaskGraph` supports task dependencies, automatic unblocking, and context propagation between tasks.

```typescript
import { runPrompt } from 'lmthing';
import { taskGraphPlugin } from 'lmthing/plugins';

const { result } = await runPrompt(async ({ defTaskGraph, $ }) => {
  const [graph, setGraph] = defTaskGraph([
    { id: 'research', title: 'Research', description: 'Research the topic',
      status: 'pending', dependencies: [], unblocks: ['write'],
      required_capabilities: ['web-search'] },
    { id: 'write', title: 'Write', description: 'Write the report',
      status: 'pending', dependencies: ['research'], unblocks: ['review'],
      required_capabilities: ['writing'] },
    { id: 'review', title: 'Review', description: 'Review the final report',
      status: 'pending', dependencies: ['write'], unblocks: [],
      required_capabilities: ['review'] },
  ]);

  $`Execute the task graph. Use getUnblockedTasks to find ready tasks and updateTaskStatus to track progress.`;
}, {
  model: 'openai:gpt-4o',
  plugins: [taskGraphPlugin]
});
```

**TaskNode interface:**
```typescript
interface TaskNode {
  id: string;                     // Unique identifier
  title: string;                  // Concise task name
  description: string;            // Detailed execution instructions
  status: TaskNodeStatus;         // 'pending' | 'in_progress' | 'completed' | 'failed'
  dependencies: string[];         // IDs of upstream tasks that must complete first
  unblocks: string[];             // IDs of downstream tasks waiting on this one
  required_capabilities: string[];// e.g., ["database", "web-search"]
  assigned_subagent?: string;     // Subagent handling this task
  input_context?: string;         // Context from upstream tasks (auto-propagated)
  output_result?: string;         // Summary/artifact produced upon completion
}
```

**Automatically Registered Tools:**

- **`generateTaskGraph`**: Create or replace the task DAG with cycle detection and validation
  ```typescript
  { tasks: TaskNode[] }
  // Returns: { success: boolean, message: string, taskCount: number, tasks: TaskNode[] }
  ```

- **`getUnblockedTasks`**: Get tasks whose dependencies are fully completed
  ```typescript
  {}
  // Returns: { success: boolean, message: string, tasks: TaskNode[] }
  ```

- **`updateTaskStatus`**: Update task status with automatic downstream unblocking
  ```typescript
  { taskId: string, status: 'in_progress' | 'completed' | 'failed', output_result?: string }
  // Returns: { success: boolean, taskId: string, message: string, newlyUnblockedTasks?: TaskNode[] }
  ```

**Key Features:**

- **Dependency Enforcement**: Tasks cannot start until all upstream dependencies are completed
- **Automatic Unblocking**: When a task completes, downstream tasks with all dependencies met are automatically unblocked
- **Context Propagation**: `output_result` from completed tasks is automatically passed as `input_context` to downstream tasks
- **Cycle Detection**: The graph is validated for circular dependencies using Kahn's algorithm
- **Graph Normalization**: Dependencies and unblocks relationships are kept symmetric automatically

**System Prompt Updates:**

The plugin automatically adds a system message showing DAG status via `defEffect`:

```
## Task Graph Status

### In Progress (1)
  - [research] Research [web-search]

### Blocked / Pending (1)
  - [write] Write (depends on: research) [writing]

### Completed (0)
  (none)

Use "getUnblockedTasks" to find tasks ready for execution, "updateTaskStatus" to update task progress.
```

### Using the Function Plugin

The built-in function plugin provides `defFunction` and `defFunctionAgent` for defining functions that the LLM can call via TypeScript code execution. Unlike `defTool`, which uses JSON for arguments, functions are called through TypeScript code with compile-time type checking.

```typescript
import { runPrompt } from 'lmthing';
import { functionPlugin, func } from 'lmthing/plugins';

const { result } = await runPrompt(async ({ defFunction, $ }) => {
  // Single function
  defFunction(
    'calculate',
    'Add two numbers',
    z.object({ a: z.number(), b: z.number() }),
    async ({ a, b }) => ({ sum: a + b }),
    {
      responseSchema: z.object({ sum: z.number() }),
      onSuccess: async (input, output) => {
        console.log('Result:', output);
        return undefined; // Use original output
      }
    }
  );

  // Composite functions (namespace)
  defFunction('math', 'Math operations', [
    func('multiply', 'Multiply numbers',
      z.object({ a: z.number(), b: z.number() }),
      async ({ a, b }) => ({ product: a * b }),
      { responseSchema: z.object({ product: z.number() }) }
    ),
    func('divide', 'Divide numbers',
      z.object({ a: z.number(), b: z.number() }),
      async ({ a, b }) => {
        if (b === 0) throw new Error('Division by zero');
        return { quotient: a / b };
      },
      {
        responseSchema: z.object({ quotient: z.number() }),
        onError: async (input, error) => ({ quotient: null, error: error.message })
      }
    )
  ]);

  $`Calculate: 15 + 27, then multiply the result by 2`;
}, {
  model: 'openai:gpt-4o',
  plugins: [functionPlugin]
});
```

**How the LLM uses functions:**

The LLM writes TypeScript code to call the registered functions:

```typescript
// LLM-generated code:
const sum = await calculate({ a: 15, b: 27 });
const product = await math.multiply({ a: sum.sum, b: 2 });
console.log(product.product); // 84
```

**Key Features:**

- **TypeScript Validation**: Code is validated before execution using generated type declarations
- **Sandboxed Execution**: Code runs in a secure vm2 sandbox
- **Composite Functions**: Group related functions into namespaces
- **Response Schemas**: Define expected output structure with Zod
- **Callbacks**: `beforeCall`, `onSuccess`, `onError` for monitoring and transformation
- **Function Agents**: Use `defFunctionAgent` to create agents callable via TypeScript

**Function Agent Example:**

```typescript
import { functionPlugin, funcAgent } from 'lmthing/plugins';

defFunctionAgent('specialists', 'Research and analysis team', [
  funcAgent('researcher', 'Research topics',
    z.object({ topic: z.string() }),
    async ({ topic }, prompt) => {
      prompt.$`Research: ${topic}`;
    },
    {
      model: 'openai:gpt-4o',
      responseSchema: z.object({
        findings: z.array(z.string()),
        confidence: z.number()
      })
    }
  ),
  funcAgent('analyst', 'Analyze data',
    z.object({ data: z.string() }),
    async ({ data }, prompt) => {
      prompt.$`Analyze: ${data}`;
    },
    { responseSchema: z.object({ summary: z.string(), score: z.number() }) }
  )
]);

// LLM calls via:
// const research = await specialists.researcher({ topic: 'quantum computing' });
// const analysis = await specialists.analyst({ data: research.findings.join('\n') });
```

**Automatic Tool Registration:**

The plugin automatically registers a `runToolCode` tool that:
1. Validates TypeScript code against generated type declarations
2. Executes validated code in a sandboxed environment
3. Returns results to the LLM
4. Provides error messages if validation fails

**Security:**

- Code execution is sandboxed using vm2
- Only registered functions are accessible
- No file system, network, or Node.js API access unless explicitly provided
- TypeScript validation catches errors before execution

### Creating Custom Plugins

```typescript
import type { StatefulPrompt } from 'lmthing';
import { z } from 'zod';

// Plugin methods receive StatefulPrompt as `this` context
export function defCustomFeature(this: StatefulPrompt, config: { option: string }) {
  const [state, setState] = this.defState('customState', config.option);

  this.defTool('customTool', 'Custom tool description',
    z.object({ input: z.string() }),
    async ({ input }) => ({ result: `${state}: ${input}` })
  );

  this.defEffect((ctx, stepModifier) => {
    // Update system prompt based on state
    stepModifier('systems', [{ name: 'customInfo', value: `State: ${state}` }]);
  }, [state]);

  return [state, setState];
}

export const customPlugin = { defCustomFeature };

// Usage:
runPrompt(({ defCustomFeature, $ }) => {
  defCustomFeature({ option: 'value' });
  $`Use the custom tool...`;
}, { model: 'openai:gpt-4o', plugins: [customPlugin] });
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