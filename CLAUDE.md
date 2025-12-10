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
  StatefulPrompt (src/StatefulPrompt.ts) - Main prompt class with all features
       │
       ▼
  runPrompt() (src/runPrompt.ts) - Main entry point (uses StatefulPrompt)
```

### Key Components

| File | Purpose |
|------|---------|
| `src/StreamText.ts` | Low-level builder wrapping AI SDK's `streamText()` |
| `src/StatefulPrompt.ts` | Main prompt class with `def*` methods and React-like hooks (`defState`, `defEffect`) |
| `src/runPrompt.ts` | Entry point that orchestrates StatefulPrompt execution |
| `src/cli.ts` | CLI for running `.lmt.mjs` prompt files |
| `src/types.ts` | TypeScript interfaces (PromptContext, StepModifier, Effect, etc.) |
| `src/providers/` | Provider adapters for OpenAI, Anthropic, Google, etc. |
| `src/providers/resolver.ts` | Model string resolution (`provider:model_id` → LanguageModel) |
| `src/providers/custom.ts` | Custom OpenAI-compatible provider support |
| `src/test/createMockModel.ts` | Mock model for testing without API calls |

### Internal Modules (StatefulPrompt Implementation)

| Module | Purpose |
|--------|---------|
| `src/state/StateManager.ts` | State persistence with proxy support for `defState` |
| `src/effects/EffectsManager.ts` | Effect registration & dependency tracking for `defEffect` |
| `src/definitions/DefinitionTracker.ts` | Tracks definitions for reconciliation across re-executions |
| `src/collections/index.ts` | Factory functions for ToolCollection, SystemCollection, VariableCollection |

## Data Flow

```
runPrompt(fn, config)
    │
    ├─► Create StatefulPrompt instance with model
    │
    ├─► Execute user's prompt function (fn) - Initial execution
    │   └─► User calls defState, defEffect, def*, defTool, defAgent, $`...`, etc.
    │
    ├─► prompt.run()
    │   ├─► On each step after first:
    │   │   ├─► Re-execute prompt function (fn) with current state
    │   │   ├─► Reconcile definitions (remove unused ones)
    │   │   ├─► Process effects based on dependencies
    │   │   └─► Apply step modifications from effects
    │   │
    │   ├─► setLastPrepareStep() - Build system prompt from variables
    │   └─► execute() - Call AI SDK streamText()
    │
    └─► Return { result: StreamTextResult, prompt: StatefulPrompt }
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

### 5. Template Literal (`$`)

Adds user messages to the conversation:

```typescript
prompt.$`Help ${userRef} with their question about ${topic}`;
// Adds: { role: 'user', content: 'Help <USER> with their question about AI' }
```

## StatefulPrompt (`src/StatefulPrompt.ts`)

`StatefulPrompt` extends `Prompt` with React-like hooks functionality for managing state across prompt re-executions.

### Key Features

1. **State Persistence**: State values persist across re-executions using `defState`
2. **Effects System**: Side effects run based on dependency changes using `defEffect`
3. **Re-execution Model**: Prompt function re-executes on each step after the first
4. **Definition Reconciliation**: Automatically removes unused definitions from previous executions

### Internal Architecture

StatefulPrompt delegates to specialized managers for separation of concerns:

```
StatefulPrompt
    ├── _stateManager: StateManager
    │   └── Handles defState(), state storage, proxy creation
    │
    ├── _effectsManager: EffectsManager
    │   └── Handles defEffect(), dependency tracking, effect execution
    │
    ├── _definitionTracker: DefinitionTracker
    │   └── Tracks seen definitions, reconciles after re-execution
    │
    └── Uses collection utilities from src/collections/
        └── createToolCollection, createSystemCollection, createVariableCollection
```

### defState

Similar to React's `useState`, creates state that persists across re-executions:

```typescript
// Create state with initial value
const [count, setCount] = prompt.defState('counter', 0);
const [user, setUser] = prompt.defState('user', { name: 'John' });

// Access current value (proxy works in templates)
prompt.$`Current count: ${count}`;

// Update state
setCount(5);                    // Direct value
setCount(prev => prev + 1);     // Function update
setUser(prev => ({ ...prev, age: 30 }));
```

### defEffect

Similar to React's `useEffect`, runs effects based on dependencies:

```typescript
import { PromptContext, StepModifier } from 'lmthing';

// Effect without dependencies - runs every step
prompt.defEffect((context: PromptContext, stepModifier: StepModifier) => {
  console.log('Step:', context.stepNumber);

  // Modify the current step
  stepModifier('messages', [{
    role: 'system',
    content: `Step ${context.stepNumber}`
  }]);
});

// Effect with dependencies - runs only when dependencies change
prompt.defEffect((context, stepModifier) => {
  // Runs only when 'count' changes
  console.log('Count changed to:', count);
}, [count]);
```

### Re-execution Flow

1. **Initial Execution**: Prompt function runs once to set up initial state
2. **Step 1**: Executes with initial state
3. **Re-execution**: For each subsequent step:
   - Prompt function re-runs with current state
   - Definitions are reconciled (unused ones removed)
   - Effects are processed based on dependencies
   - Step modifications are applied

### Definition Reconciliation

StatefulPrompt tracks which definitions are used in each execution and removes unused ones:

```typescript
// First execution
const tool1 = prompt.defTool('tool1', ...);
const tool2 = prompt.defTool('tool2', ...);

// Second execution (only tool1 referenced)
// tool2 is automatically removed
const result = await tool1();
```

### Message Duplication Prevention

StatefulPrompt prevents duplicate user messages during re-execution:

```typescript
// This message is only added once, even on re-execution
prompt.$`Help me with this task`;
prompt.defMessage('user', 'Additional context');
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
- `data-analysis.lmt.mjs` - Data analysis with defData/defEffect

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
- `src/state/*.test.ts` - StateManager tests
- `src/effects/*.test.ts` - EffectsManager tests
- `src/definitions/*.test.ts` - DefinitionTracker tests
- `src/collections/*.test.ts` - Collection utility tests
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

1. Add method to `StatefulPrompt` class in `src/StatefulPrompt.ts`
2. For specialized functionality:
   - For state-related features: extend `StateManager` in `src/state/`
   - For effect-related features: extend `EffectsManager` in `src/effects/`
   - For definition tracking: update `DefinitionTracker` in `src/definitions/`
3. Store state in protected instance variables
4. Process in `run()` via `setLastPrepareStep()` if needed
5. Add tests in `src/Prompt.test.ts` (which tests StatefulPrompt) and unit tests for any new manager functionality

### Adding Configuration Options

Options flow through `StreamTextBuilder.withOptions()` and merge into `streamText()` call. Excluded options (handled internally): `model`, `system`, `messages`, `tools`, `onFinish`, `onStepFinish`, `prepareStep`.

## Important Implementation Details

### Proxy in runPrompt

`runPrompt` wraps the StatefulPrompt in a Proxy to auto-bind methods, allowing destructuring:

```typescript
const { def, defState, defEffect, defTool, $ } = prompt; // Works due to proxy
```

### PrepareStep Hook Chain

Multiple hooks registered via `addPrepareStep()` execute sequentially with merged results:
1. StatefulPrompt's re-execution hook (runs prompt function again)
2. StatefulPrompt's effects hook (runs defEffect callbacks with stepModifier)
3. The `_lastPrepareStep` (set by Prompt.run()) executes last to inject variables

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
    ".": "./dist/index.js",           // Main entry: runPrompt, StatefulPrompt, tool, agent, providers
    "./test": "./dist/test/createMockModel.js"  // Test utilities
  },
  "bin": {
    "lmthing": "./dist/cli.js"        // CLI executable
  }
}
```

Usage:
```typescript
import { runPrompt, StatefulPrompt, tool, agent, PromptContext, StepModifier } from 'lmthing';
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
