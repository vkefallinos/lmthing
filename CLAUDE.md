# CLAUDE.md - Development Guide for lmthing

## Project Overview

**lmthing** is a TypeScript library for building agentic AI workflows. It provides a high-level abstraction over the Vercel AI SDK's `streamText` function, enabling developers to create complex multi-agent systems with tools, hooks, and hierarchical prompts.

**Package name:** `lmthing`
**Entry point:** `src/index.ts`
**Build output:** `dist/`
**Test framework:** Vitest

## Architecture

### Core Class Hierarchy

```
StreamTextBuilder (src/StreamText.ts)
       │
       ▼
    Prompt (src/Prompt.ts)
       │
       ▼
  runPrompt() (src/runPrompt.ts) - Main entry point
```

### Key Components

| File | Purpose |
|------|---------|
| `src/StreamText.ts` | Low-level builder wrapping AI SDK's `streamText()` |
| `src/Prompt.ts` | High-level API with `def*` methods for prompt construction |
| `src/runPrompt.ts` | Entry point that orchestrates Prompt execution |
| `src/cli.ts` | CLI for running `.lmt.mjs` prompt files |
| `src/providers/` | Provider adapters for OpenAI, Anthropic, Google, etc. |
| `src/providers/resolver.ts` | Model string resolution (`provider:model_id` → LanguageModel) |
| `src/providers/custom.ts` | Custom OpenAI-compatible provider support |
| `src/test/createMockModel.ts` | Mock model for testing without API calls |

## Data Flow

```
runPrompt(fn, config)
    │
    ├─► Create Prompt instance with model
    │
    ├─► Execute user's prompt function (fn)
    │   └─► User calls def*, defTool, defAgent, $`...`, etc.
    │
    ├─► prompt.run()
    │   ├─► setLastPrepareStep() - Build system prompt from variables
    │   └─► execute() - Call AI SDK streamText()
    │
    └─► Return { result: StreamTextResult, prompt: Prompt }
```

## Key Concepts

### 1. Variables (`def` and `defData`)

Variables are stored in `Prompt.variables` and formatted into the system prompt as XML:

```typescript
prompt.def('USER_NAME', 'Alice');     // Returns '<USER_NAME>'
prompt.defData('CONFIG', { x: 1 });   // Returns '<CONFIG>' (YAML-formatted)

// Results in system prompt:
// <variables>
//   <USER_NAME>Alice</USER_NAME>
//   <CONFIG>
// x: 1
//   </CONFIG>
// </variables>
```

### 2. System Parts (`defSystem`)

Named system prompt sections stored in `Prompt.systems` and formatted as XML tags:

```typescript
prompt.defSystem('role', 'You are a helpful assistant.');
prompt.defSystem('rules', 'Always be polite.');

// Results in:
// <role>
// You are a helpful assistant.
// </role>
// <rules>
// Always be polite.
// </rules>
```

### 3. Tools (`defTool`)

Tools are registered via `StreamTextBuilder.addTool()` and passed to `streamText({ tools })`:

```typescript
// Single tool
prompt.defTool(
  'search',                    // name
  'Search the web',            // description
  z.object({ query: z.string() }),  // inputSchema (Zod)
  async (args) => { ... }      // execute function
);
```

**Composite Tools (Array Syntax):**

When an array of sub-tool definitions is passed, `defTool` creates a single composite tool that allows the LLM to invoke multiple sub-tools in one tool call:

```typescript
import { tool } from 'lmthing';

// Composite tool with multiple sub-tools
prompt.defTool('file', 'File operations', [
  tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFn),
  tool('append', 'Append to file', z.object({ path: z.string(), content: z.string() }), appendFn),
  tool('read', 'Read a file', z.object({ path: z.string() }), readFn),
]);

// LLM calls with:
// { calls: [
//   { name: 'write', args: { path: '/a.txt', content: 'hello' } },
//   { name: 'read', args: { path: '/a.txt' } }
// ]}

// Returns:
// { results: [
//   { name: 'write', result: { success: true } },
//   { name: 'read', result: { content: 'hello' } }
// ]}
```

**Implementation details:**
- Uses `z.union()` to create a discriminated union schema from sub-tool schemas
- Automatically generates enhanced description listing available sub-tools
- Executes sub-tools sequentially, collecting results
- Handles errors gracefully per sub-tool (continues execution, returns error in result)

### 4. Agents (`defAgent`)

Agents are tools that spawn a child `Prompt` with independent execution:

```typescript
// Single agent
prompt.defAgent(
  'researcher',
  'Research topics',
  z.object({ topic: z.string() }),
  async (args, childPrompt) => {
    childPrompt.$`Research: ${args.topic}`;
  },
  { model: 'openai:gpt-4o' }  // Optional different model
);
```

**Agent execution flow:**
1. Parent model calls agent tool
2. New `Prompt` created with specified/inherited model
3. User's callback configures the child prompt
4. Child `prompt.run()` executes
5. Returns `{ response: text, steps: [...] }` to parent

**Composite Agents (Array Syntax):**

When an array of sub-agent definitions is passed, `defAgent` creates a single composite agent that allows the LLM to invoke multiple sub-agents in one tool call:

```typescript
import { agent } from 'lmthing';

// Composite agent with multiple sub-agents
prompt.defAgent('specialists', 'Specialist agents', [
  agent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn, { model: 'openai:gpt-4o' }),
  agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn),
]);

// LLM calls with:
// { calls: [
//   { name: 'researcher', args: { topic: 'AI' } },
//   { name: 'analyst', args: { data: '...' } }
// ]}

// Returns:
// { results: [
//   { name: 'researcher', response: '...', steps: [...] },
//   { name: 'analyst', response: '...', steps: [...] }
// ]}
```

**Implementation details:**
- Uses `z.union()` to create a discriminated union schema from sub-agent schemas
- Automatically generates enhanced description listing available sub-agents
- Executes sub-agents sequentially, collecting responses and steps
- Handles errors gracefully per sub-agent (continues execution, returns error message)

### 5. Hooks (`defHook`)

Hooks map to `streamText({ prepareStep })` for per-step modifications. They provide access to the current context and allow dynamic filtering of systems, variables, and tools.

**Hook Function Parameters:**

The hook receives an options object containing:
- `messages`: Current message history
- `model`: The language model being used
- `steps`: Array of previous step results
- `stepNumber`: Current step number (0-indexed)
- `systems`: Array of all system part names (e.g., `['role', 'guidelines', 'expertise']`)
- `variables`: Array of all variable names (e.g., `['userName', 'config']`)
- `tools`: Array of all tool names (e.g., `['search', 'calculator']`)

**Return Value (DefHookResult):**

The hook returns an object with optional properties:
- `activeTools`: Array of tool names to limit which tools are available
- `activeSystems`: Array of system part names to include (filters out others)
- `activeVariables`: Array of variable names to include (filters out others)
- `system`: Override the entire system prompt
- `messages`: Override or modify the messages array
- `variables`: Add or update variables (will be merged with existing)

**Filter Behavior:**

- Filters reset at the start of each step (no persistence across steps)
- If `activeSystems` is not returned, all defined systems are included
- If `activeVariables` is not returned, all defined variables are included
- Empty arrays (`[]`) exclude all systems/variables respectively
- Non-existent names in filter arrays are silently ignored
- Multiple hooks execute sequentially; later hooks can override earlier ones

**Examples:**

```typescript
// Use name arrays for dynamic filtering
prompt.defHook(({ systems, variables, tools }) => {
  console.log('Available systems:', systems);    // ['role', 'guidelines', 'expertise']
  console.log('Available variables:', variables); // ['userName', 'config']
  console.log('Available tools:', tools);         // ['search', 'calculator']

  // Include only the first 2 systems
  return {
    activeSystems: systems.slice(0, 2)
  };
});

// Filter variables based on name patterns
prompt.defHook(({ variables }) => {
  // Only include variables that start with 'user'
  const userVars = variables.filter(v => v.startsWith('user'));
  return {
    activeVariables: userVars, // e.g., ['userName', 'userRole']
  };
});

// Limit tools by step
prompt.defHook(({ stepNumber, tools }) => {
  if (stepNumber === 0) {
    return { activeTools: ['search'] };
  }
  return { activeTools: tools }; // All tools on subsequent steps
});

// Override system prompt completely
prompt.defHook(({ stepNumber }) => {
  return {
    system: 'Updated system...',  // Override entire system prompt
  };
});

// Implement sliding message window
prompt.defHook(({ messages }) => {
  return {
    messages: messages.slice(-5), // Keep only last 5 messages
  };
});

// Modify variables during execution
prompt.defHook(({ stepNumber }) => {
  return {
    variables: {
      currentStep: { type: 'string', value: 'processing' }
    }
  };
});
```

**Type Safety:**

The `DefHookResult` interface is exported from the main package for type-safe hook implementations:

```typescript
import { DefHookResult } from 'lmthing';

const myHook = ({ systems, variables, tools }): DefHookResult => {
  // systems, variables, and tools are name arrays
  console.log('System names:', systems);     // ['role', 'guidelines']
  console.log('Variable names:', variables); // ['userName', 'config']
  console.log('Tool names:', tools);         // ['search', 'calculator']

  return {
    activeSystems: ['role'],
    activeVariables: ['userName']
  };
};

prompt.defHook(myHook);
```

**Implementation Details:**

- Hooks are stored in `StreamTextBuilder._prepareStepHooks`
- They execute sequentially via the `prepareStep` parameter
- Each hook's results merge with previous hooks (later ones override)
- The `_lastPrepareStep` (set by `Prompt.run()`) executes last to inject filtered systems/variables
- Filter state is reset at the beginning of each step to prevent unintended persistence

### 6. Template Literal (`$`)

Adds user messages to the conversation:

```typescript
prompt.$`Help ${userRef} with their question about ${topic}`;
// Adds: { role: 'user', content: 'Help <USER> with their question about AI' }
```

## CLI (`src/cli.ts`)

The CLI allows running `.lmt.mjs` prompt files directly without writing boilerplate code.

### Usage

```bash
npx lmthing run <file.lmt.mjs>
```

### File Format

`.lmt.mjs` files export:
- `default` (required) - Async function that receives the prompt methods
- `config` (required) - Configuration object with `model` property
- `mock` (optional) - Mock response array when using `model: 'mock'`

```javascript
// myagent.lmt.mjs
export default async ({ def, defTool, defSystem, $ }) => {
  defSystem('role', 'You are a helpful assistant.');
  const name = def('NAME', 'World');
  $`Say hello to ${name}`;
};

export const config = {
  model: 'openai:gpt-4o'  // or 'mock' for testing
};
```

### Mock Model Support

When `config.model` is `'mock'`, the CLI uses the exported `mock` array to create a mock model. **No imports needed!**

```javascript
// Mock response data
export const mock = [
  { type: 'text', text: 'Hello! ' },
  { type: 'text', text: 'How can I help you?' }
];

// With tool calls
export const mock = [
  { type: 'text', text: 'Let me calculate... ' },
  { type: 'tool-call', toolCallId: 'c1', toolName: 'calculator', args: { a: 1, b: 2 } },
  { type: 'text', text: 'The result is 3!' }
];

export default async ({ defTool, $ }) => {
  defTool('calculator', 'Add numbers', schema, async (args) => ({ sum: args.a + args.b }));
  $`Calculate 1 + 2`;
};

export const config = { model: 'mock' };
```

### CLI Architecture

```
CLI (src/cli.ts)
    │
    ├─► validateFile() - Check .lmt.mjs extension and file exists
    │
    ├─► loadModule() - Dynamic import of the file
    │
    ├─► Handle mock model
    │   └─► If config.model === 'mock', use createMockModel(module.mock)
    │
    ├─► runPrompt(promptFn, config) - Execute the prompt
    │
    └─► Stream output to stdout
```

### Examples

Examples are in `examples/` directory:
- `mock-demo.lmt.mjs` - Simple mock model demo
- `mock-tools.lmt.mjs` - Tool usage with mock model
- `hello.lmt.mjs` - Real model example (requires API key)
- `weather.lmt.mjs` - Tool example with real model
- `multi-agent.lmt.mjs` - Agent orchestration example
- `data-analysis.lmt.mjs` - Data analysis with defData/defHook

## Provider System

### Built-in Providers

Located in `src/providers/`:
- `openai.ts` - OpenAI (GPT-4, GPT-3.5)
- `anthropic.ts` - Anthropic (Claude)
- `google.ts` - Google AI (Gemini)
- `mistral.ts` - Mistral AI
- `azure.ts` - Azure OpenAI
- `groq.ts` - Groq
- `cohere.ts` - Cohere
- `bedrock.ts` - Amazon Bedrock
- `vertex.ts` - Google Vertex AI

### Model Resolution (`src/providers/resolver.ts`)

```typescript
resolveModel('openai:gpt-4o')           // Built-in provider
resolveModel('zai:glm-4')               // Custom provider (env vars)
resolveModel('large')                   // Alias (LM_MODEL_LARGE env var)
resolveModel(openai('gpt-4o'))          // Direct LanguageModel instance
```

### Custom Providers (`src/providers/custom.ts`)

Environment variable pattern:
```bash
{NAME}_API_KEY=your-key
{NAME}_API_BASE=https://api.example.com/v1
{NAME}_API_TYPE=openai  # Required to activate
```

### Model Aliases

```bash
LM_MODEL_LARGE=openai:gpt-4o
LM_MODEL_FAST=openai:gpt-4o-mini
```

Then use: `model: 'large'` or `model: 'fast'`

## Step Tracking (Middleware)

The `StreamTextBuilder` wraps the model with middleware that:
1. Captures all stream chunks per step
2. Processes agent tool results (extracts response text)
3. Exposes via `prompt.steps` (simplified) and `prompt.fullSteps` (raw)

**Step structure:**
```typescript
{
  input: {
    prompt: [{ role, content }...]
  },
  output: {
    content: [{ type: 'text'|'tool-call', ... }],
    finishReason: 'stop'|'tool-calls'
  }
}
```

## Testing

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

### Mock Model Usage

```typescript
import { createMockModel } from './test/createMockModel';

const mockModel = createMockModel([
  { type: 'text', text: 'Hello!' },
  { type: 'tool-call', toolCallId: 'call_1', toolName: 'search', args: { q: 'test' } },
  { type: 'text', text: 'Found results!' }
]);
```

**Key behaviors:**
- Text items emit as text deltas
- Tool calls pause the stream and return control to AI SDK
- Each `doStream` call advances through content until next tool call
- Maintains state across multiple calls (multi-step execution)

### Test File Locations

- `src/*.test.ts` - Unit tests for main classes
- `src/providers/*.test.ts` - Provider-specific tests
- `src/test/` - Test utilities

### Snapshot Testing

Tests use Vitest snapshots (`expect(steps).toMatchSnapshot()`) to verify step structure. Update snapshots with:

```bash
npm test -- -u
```

## Development Workflow

### Build

```bash
npm run build      # TypeScript compile + bundle CLI
npm run build:cli  # Bundle CLI only (esbuild)
npm run dev        # Watch mode (tsc only)
```

The build process:
1. `tsc` compiles TypeScript to `dist/`
2. `esbuild` bundles `src/cli.ts` into `dist/cli.js` with external dependencies

### Adding a New Provider

1. Create `src/providers/{name}.ts`:
```typescript
import { create{Name} } from '@ai-sdk/{name}';

export interface {Name}Config { ... }

export function create{Name}Provider(config?: {Name}Config) {
  return create{Name}({ ... });
}

export const {name} = create{Name}Provider();

export const {Name}Models = { ... } as const;
```

2. Export from `src/providers/index.ts`
3. Add to `providers` registry object
4. Add tests

### Adding a New Context Method (`def*`)

1. Add method to `Prompt` class in `src/Prompt.ts`
2. Store state in private instance variables
3. Process in `run()` via `setLastPrepareStep()` if needed
4. Add tests in `src/Prompt.test.ts`

### Adding Configuration Options

Options flow through `StreamTextBuilder.withOptions()` and merge into `streamText()` call. Excluded options (handled internally): `model`, `system`, `messages`, `tools`, `onFinish`, `onStepFinish`, `prepareStep`.

## Important Implementation Details

### Proxy in runPrompt

`runPrompt` wraps the Prompt in a Proxy to auto-bind methods, allowing destructuring:

```typescript
const { def, defTool, $ } = prompt; // Works due to proxy
```

### PrepareStep Hook Chain

Multiple hooks registered via `addPrepareStep()` execute sequentially with merged results. The `_lastPrepareStep` (set by Prompt.run()) executes last to inject variables.

### stopWhen Default

`StreamTextBuilder.execute()` sets `stopWhen: stepCountIs(1000)` to prevent infinite loops. Override via `options.stopWhen`.

### Agent Response Processing

Middleware in `_getMiddleware()` transforms agent responses:
```typescript
// Agent returns: { response: "text", steps: [...] }
// Middleware transforms tool result to just the response text
```

## Code Style & Conventions

- **TypeScript strict mode** enabled
- **ES2022 target** with ES module syntax
- **Zod** for schema validation (tools, agents)
- **js-yaml** for data serialization in variables
- **No classes for configuration** - use interfaces and factory functions
- **Fluent builder pattern** in StreamTextBuilder

## Future Development (from PROPOSAL.md)

### Planned Features

1. **Memory System** - Persistent state across conversations
2. **Agent Teams** - Multi-agent coordination patterns (sequential, parallel, voting)
3. **Plugin Architecture** - Extensible hook system
4. **Task Lists** - `defTaskList` and `defDynamicTaskList` for structured workflows
5. **Enhanced Error Handling** - Retry policies, circuit breakers
6. **Metrics & Observability** - Built-in profiling and monitoring

### Not Yet Implemented (from README)

The README documents several features that may not be fully implemented:
- `defTaskList` - Sequential task execution with validation
- `defDynamicTaskList` - Dynamic task management
- `defHook` variable modifications
- Plugin system

**When implementing these, ensure:**
1. Add to `Prompt` class
2. Store state appropriately
3. Process in prepareStep or run()
4. Add comprehensive tests
5. Update README if behavior changes

## Common Tasks

### Debug Step Execution

```typescript
const { result, prompt } = await runPrompt(...);
await result.text; // Wait for completion
console.log(prompt.steps);     // Simplified view
console.log(prompt.fullSteps); // Raw chunks
```

### Test Tool Calls

```typescript
const toolFn = vi.fn().mockResolvedValue({ result: 'ok' });
// ...setup with mock model that calls the tool...
expect(toolFn).toHaveBeenCalledWith(
  { expectedArgs: 'value' },
  expect.anything() // ToolExecutionOptions
);
```

### Override Model Per Agent

```typescript
prompt.defAgent('name', 'desc', schema, fn, {
  model: 'anthropic:claude-3-5-sonnet-20241022',
  // or: model: anthropic('claude-3-5-sonnet-20241022')
});
```

## Troubleshooting

### "Model is required to execute streamText"
Ensure model is passed to `runPrompt` config or `new Prompt(model)`.

### Tool not being called
Check tool name matches between `defTool` and mock model's `toolName`.

### Variables not appearing in system prompt
Variables are injected in `prompt.run()` via `setLastPrepareStep()`. Ensure `run()` is called (automatic in `runPrompt`).

### Custom provider not found
Verify environment variables:
- `{NAME}_API_KEY` is set
- `{NAME}_API_BASE` is set
- `{NAME}_API_TYPE=openai` (required flag)

## Package Exports

The package provides multiple entry points:

```json
{
  "exports": {
    ".": "./dist/index.js",           // Main entry: runPrompt, tool, agent, providers
    "./test": "./dist/test/createMockModel.js"  // Test utilities
  },
  "bin": {
    "lmthing": "./dist/cli.js"        // CLI executable
  }
}
```

Usage:
```typescript
import { runPrompt, tool, agent } from 'lmthing';
import { createMockModel } from 'lmthing/test';
```

## Dependencies

### Runtime
- `ai` (^5.0.0) - Vercel AI SDK core
- `@ai-sdk/*` - Provider packages
- `zod` (^4.1.13) - Schema validation
- `js-yaml` (^4.1.1) - YAML serialization

### Development
- `vitest` (^4.0.15) - Test framework
- `typescript` (^5.5.4) - Compiler
- `esbuild` (^0.27.1) - CLI bundler
- `msw` (^2.12.4) - Mock service worker (not currently used)

## Links

- [AI SDK Documentation](https://ai-sdk.dev/docs/reference/ai-sdk-core)
- [streamText Reference](./STREAM_TEXT.md)
- [Testing Guide](./TESTING.md)
- [API Extension Proposal](./PROPOSAL.md)
