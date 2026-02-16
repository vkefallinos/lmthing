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
| `src/plugins/` | Plugin system for extending StatefulPrompt |
| `src/plugins/taskList.ts` | Built-in task list plugin with `defTaskList` |
| `src/plugins/taskGraph.ts` | Built-in task graph (DAG) plugin with `defTaskGraph` |
| `src/plugins/function/` | Built-in function plugin with `defFunction` and `defFunctionAgent` |
| `src/test/createMockModel.ts` | Mock model for testing without API calls |
| `tests/integration/` | Integration tests with real LLM APIs |

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

**Tool Options (Response Schema & Callbacks):**

Tools support optional response schema definition and event callbacks:

```typescript
// Tool with responseSchema and callbacks
prompt.defTool(
  'calculate',
  'Calculate numbers',
  z.object({ a: z.number(), b: z.number() }),
  async ({ a, b }) => {
    return { result: a + b };
  },
  {
    // Optional: Define the response schema for validation/documentation
    responseSchema: z.object({
      result: z.number()
    }),

    // Optional: Called before tool execution
    // Return undefined to continue, or return a value to skip execution
    beforeCall: async (input, output) => {
      console.log('Before:', input);
      return undefined; // Continue execution
    },

    // Optional: Called after successful execution
    // Return undefined to keep original output, or return modified output
    onSuccess: async (input, output) => {
      console.log('Success:', output);
      return undefined; // Use original output
    },

    // Optional: Called if tool throws an error
    // Return undefined to keep error, or return modified error response
    onError: async (input, error) => {
      console.log('Error:', error);
      return undefined; // Use original error
    }
  }
);
```

**Callback Behavior:**

- **`beforeCall(input, output)`**: Called before tool execution. If it returns a value other than `undefined`, tool execution is skipped and that value is returned as the result.
- **`onSuccess(input, output)`**: Called after successful execution. If it returns `undefined`, the original output is used. Otherwise, the returned value becomes the new output.
- **`onError(input, error)`**: Called when tool throws. If it returns `undefined`, the original error is used. Otherwise, the returned value becomes the result.
- All callbacks are async and support both sync and async implementations
- Callbacks receive the tool input and output, allowing for logging, monitoring, or transformation

**Composite Tools (Array Syntax):**

When an array of sub-tool definitions is passed, `defTool` creates a single composite tool that allows the LLM to invoke multiple sub-tools in one tool call:

```typescript
import { tool } from 'lmthing';

// Composite tool with multiple sub-tools
prompt.defTool('file', 'File operations', [
  tool('write', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFn),
  tool('append', 'Append to file', z.object({ path: z.string(), content: z.string() }), appendFn, {
    onSuccess: async (input, output) => {
      console.log('Appended to:', input.path);
      return undefined; // Use original output
    }
  }),
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
- For composite tools, callbacks are executed independently for each sub-tool

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

**Agent Options (Response Schema & System Prompt):**

Agents support optional configuration including response schema validation:

```typescript
// Agent with responseSchema and system prompt
prompt.defAgent(
  'analyst',
  'Analyze data with structured output',
  z.object({ data: z.string() }),
  async (args, childPrompt) => {
    childPrompt.$`Analyze: ${args.data}`;
  },
  {
    // Optional: Override the model for this agent
    model: 'openai:gpt-4o',

    // Optional: Define the response schema for validation
    responseSchema: z.object({
      summary: z.string().describe('Summary of the analysis'),
      score: z.number().describe('Score from 0-100'),
      recommendations: z.array(z.string()).describe('List of recommendations')
    }),

    // Optional: Custom system prompt for the agent
    system: 'You are a data analyst specializing in comprehensive analysis.',

    // Optional: Additional plugins for the agent
    plugins: [customPlugin]
  }
);
```

**Response Schema Behavior:**

- When `responseSchema` is provided, the agent receives instructions to respond with valid JSON matching the schema
- The agent's response is automatically validated against the schema
- If validation fails, the response includes a `validationError` field with error details
- The schema is converted to JSON Schema format and included in the agent's system prompt
- Works with both single agents and composite agents (each sub-agent can have its own schema)

**Agent execution flow:**
1. Parent model calls agent tool
2. New `Prompt` created with specified/inherited model
3. If `responseSchema` is provided, schema instructions are added to system prompt
4. User's callback configures the child prompt
5. Child `prompt.run()` executes
6. Response is validated against schema if provided
7. Returns `{ response: text, steps: [...], validationError?: string }` to parent

**Composite Agents (Array Syntax):**

When an array of sub-agent definitions is passed, `defAgent` creates a single composite agent that allows the LLM to invoke multiple sub-agents in one tool call:

```typescript
import { agent } from 'lmthing';

// Composite agent with multiple sub-agents
prompt.defAgent('specialists', 'Specialist agents', [
  agent('researcher', 'Research topics', z.object({ topic: z.string() }), researchFn, {
    model: 'openai:gpt-4o',
    responseSchema: z.object({
      findings: z.array(z.string()),
      confidence: z.number()
    })
  }),
  agent('analyst', 'Analyze data', z.object({ data: z.string() }), analyzeFn, {
    responseSchema: z.object({
      summary: z.string(),
      score: z.number()
    })
  }),
]);

// LLM calls with:
// { calls: [
//   { name: 'researcher', args: { topic: 'AI' } },
//   { name: 'analyst', args: { data: '...' } }
// ]}

// Returns:
// { results: [
//   { name: 'researcher', response: '{"findings": [...], "confidence": 0.9}', steps: [...] },
//   { name: 'analyst', response: '{"summary": "...", "score": 85}', steps: [...], validationError?: '...' }
// ]}
```

**Implementation details:**
- Uses `z.union()` to create a discriminated union schema from sub-agent schemas
- Automatically generates enhanced description listing available sub-agents
- Executes sub-agents sequentially, collecting responses and steps
- Each sub-agent can have its own `responseSchema`, `system`, and other options
- Response validation is performed independently for each sub-agent
- Handles errors gracefully per sub-agent (continues execution, returns error message)

### 5. Template Literal (`$`)

Adds user messages to the conversation:

```typescript
prompt.$`Help ${userRef} with their question about ${topic}`;
// Adds: { role: 'user', content: 'Help <USER> with their question about AI' }
```

### 6. Definition Proxy Methods

All `def*` methods return a proxy object that acts as a string in templates but also provides utility methods:

```typescript
const userName = prompt.def('USER_NAME', 'Alice');

// Use in templates (acts as string '<USER_NAME>')
prompt.$`Hello ${userName}`;

// Access the tag value
console.log(userName.value);  // '<USER_NAME>'

// Mark for reminder - inserts a reminder message to the model
userName.remind();

// Disable for current step - removes definition from next step
// Should be called within defEffect
prompt.defEffect((ctx, stepModifier) => {
  if (someCondition) {
    userName.disable();  // USER_NAME won't be in the next step's system prompt
  }
});
```

**Available methods on all definition proxies:**
- `.value` - Returns the XML tag string (e.g., `'<USER_NAME>'`)
- `.remind()` - Marks the definition to remind the model to use it
- `.disable()` - Removes the definition from the next step (use within `defEffect`)
- `.toString()` / `.valueOf()` - Returns the tag for string coercion

**getRemindedItems() method:**

```typescript
// After calling .remind() on definitions
const reminded = prompt.getRemindedItems();
// Returns: [{ type: 'def', name: 'USER_NAME' }, { type: 'defTool', name: 'search' }, ...]
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

### getState

Get the current value of any state key without creating a new state accessor:

```typescript
// Create state in one part of the code
const [count, setCount] = prompt.defState('counter', 0);

// Later, access the current value without needing the original reference
const currentValue = prompt.getState<number>('counter'); // 0

setCount(5);
const updatedValue = prompt.getState<number>('counter'); // 5

// Useful for accessing state from plugins or effects
prompt.defEffect(() => {
  const currentCount = prompt.getState<number>('counter');
  console.log('Count is:', currentCount);
}, []);
```

**When to use `getState` vs `defState`:**
- Use `defState` when you need both read and write access to state
- Use `getState` when you only need to read the current value (e.g., in effects, tools, or plugins)

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

**Note:** Built-in plugins (`defTaskList`, `defTaskGraph`, `defFunction`, `defFunctionAgent`) are automatically available in all `.lmt.mjs` files.

```javascript
// myagent.lmt.mjs
export default async ({ def, defTool, defSystem, defTaskList, defFunction, $ }) => {
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
- `function-demo.lmt.mjs` - Function plugin with TypeScript validation
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

### Integration Tests

Integration tests test lmthing with real LLM APIs. These tests require an API key and are opt-in via environment variable.

**Running Integration Tests:**

```bash
# Set the model to use for testing
LM_TEST_MODEL=openai:gpt-4o-mini npm test -- --run tests/integration
LM_TEST_MODEL=anthropic:claude-3-5-sonnet-20241022 npm test -- --run tests/integration
```

**Integration Test Files:**

- `tests/integration/defAgent.test.ts` - Agent integration tests
- `tests/integration/defFunction.test.ts` - Function plugin integration tests
- `tests/integration/defHooks.test.ts` - State and effect integration tests
- `tests/integration/defTaskList.test.ts` - Task list plugin integration tests
- `tests/integration/defTaskGraph.test.ts` - Task graph (DAG) plugin integration tests
- `tests/integration/defTool.test.ts` - Tool integration tests
- `tests/integration/defVariables.test.ts` - Variable and system part integration tests

**Test Configuration:**

- Tests require `LM_TEST_MODEL` environment variable to be set
- Default timeout is 90 seconds for LLM calls
- Tests are skipped if no model is configured

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

## Plugin System

The plugin system allows extending `StatefulPrompt` with additional methods. Plugins are implemented in `src/plugins/`.

### Auto-Loaded Built-in Plugins

Built-in plugins are **automatically loaded** on every `runPrompt()` call - no imports or configuration needed:

```typescript
import { runPrompt } from 'lmthing';
// No need to import built-in plugins!

const { result } = await runPrompt(async ({ defTaskList, defTaskGraph, defFunction, $ }) => {
  // All built-in plugin methods are available
  const [tasks, setTasks] = defTaskList([...]);
  const [graph, setGraph] = defTaskGraph([...]);
  defFunction('calculate', 'Add numbers', schema, handler);

  $`Complete the tasks using the available tools.`;
}, {
  model: 'openai:gpt-4o'
  // No plugins array needed for built-in plugins!
});
```

**Built-in plugins that are auto-loaded:**
- `taskListPlugin` - Provides `defTaskList()` for simple task lists
- `taskGraphPlugin` - Provides `defTaskGraph()` for dependency-aware DAG tasks
- `functionPlugin` - Provides `defFunction()` and `defFunctionAgent()` for TypeScript-validated function execution

### Using Custom Plugins

For custom plugins, pass them via the `plugins` config option:

```typescript
import { runPrompt } from 'lmthing';
import { customPlugin } from './customPlugin';

const { result } = await runPrompt(async ({ defCustomFeature, $ }) => {
  // Both built-in plugins AND customPlugin are available
  defCustomFeature();
}, {
  model: 'openai:gpt-4o',
  plugins: [customPlugin]
});
```

### Built-in Plugins

**taskListPlugin** (`src/plugins/taskList.ts`):
- Provides `defTaskList(tasks)` method
- Creates `startTask`, `completeTask`, and `failTask` tools automatically
- Updates system prompt with task status via `defEffect`
- Returns `[taskList, setTaskList]` tuple for state access

**Task List Tools:**

The plugin automatically creates three tools for managing tasks:

```typescript
import { runPrompt } from 'lmthing';
// No need to import taskListPlugin - it's auto-loaded!

const { result } = await runPrompt(async ({ defTaskList, $ }) => {
  const [tasks, setTasks] = defTaskList([
    { id: '1', name: 'Research the topic', status: 'pending' },
    { id: '2', name: 'Write implementation', status: 'pending' },
    { id: '3', name: 'Test the implementation', status: 'pending' },
  ]);

  $`Complete the tasks. Use startTask when beginning work,
    completeTask when done, and failTask if there's an error.`;
}, {
  model: 'openai:gpt-4o'
  // No plugins array needed!
});
```

**Available Tools:**
- `startTask(taskId)` - Mark a task as in-progress. Can restart failed tasks.
- `completeTask(taskId)` - Mark a task as completed
- `failTask(taskId, reason?)` - Mark a task as failed with optional reason

**Task Status Values:**
- `pending` - Task not yet started
- `in_progress` - Task currently being worked on
- `completed` - Task finished successfully
- `failed` - Task failed (can be restarted with startTask)

**System Prompt Updates:**

The plugin automatically updates the system prompt with current task status:

```
## Current Task Status

### In Progress (1)
  - [1] Research the topic

### Pending (2)
  - [2] Write implementation
  - [3] Test the implementation

### Completed (0)
  (none)
```

**taskGraphPlugin** (`src/plugins/taskGraph.ts`):
- Provides `defTaskGraph(tasks)` method for dependency-aware task management using a DAG
- Creates `generateTaskGraph`, `getUnblockedTasks`, and `updateTaskStatus` tools automatically
- Validates task graph for cycles and missing references using Kahn's algorithm
- Normalizes symmetric `dependencies`/`unblocks` relationships
- Propagates `output_result` from completed tasks as `input_context` to downstream tasks
- Updates system prompt with DAG status via `defEffect`
- Returns `[taskGraph, setTaskGraph]` tuple for state access

**Task Graph Tools:**

The plugin automatically creates three tools for managing the DAG:

```typescript
import { runPrompt } from 'lmthing';
// No need to import taskGraphPlugin - it's auto-loaded!

const { result } = await runPrompt(async ({ defTaskGraph, $ }) => {
  const [graph, setGraph] = defTaskGraph([
    { id: 'research', title: 'Research', description: 'Research the topic',
      status: 'pending', dependencies: [], unblocks: ['write'],
      required_capabilities: ['web-search'] },
    { id: 'write', title: 'Write', description: 'Write the report',
      status: 'pending', dependencies: ['research'], unblocks: [],
      required_capabilities: ['writing'] },
  ]);

  $`Execute the task graph. Use getUnblockedTasks to find ready tasks and updateTaskStatus to track progress.`;
}, {
  model: 'openai:gpt-4o'
  // No plugins array needed!
});
```

**Available Tools:**
- `generateTaskGraph(tasks)` - Create or replace the task DAG. Validates for cycles and missing references.
- `getUnblockedTasks()` - Get all tasks whose dependencies are fully completed and are ready to start.
- `updateTaskStatus(taskId, status, output_result?)` - Update task status to `in_progress`, `completed`, or `failed`. Automatically unblocks downstream tasks on completion.

**TaskNode Interface:**
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

**Task Status Values:**
- `pending` - Task not yet started
- `in_progress` - Task currently being worked on
- `completed` - Task finished successfully (downstream tasks may be unblocked)
- `failed` - Task failed

**System Prompt Updates:**

The plugin automatically updates the system prompt with current DAG status:

```
## Task Graph Status

### In Progress (1)
  - [research] Research [web-search]

### Ready to Start (0)
  (none)

### Blocked / Pending (1)
  - [write] Write (depends on: research) [writing]

### Completed (0)
  (none)

Use "getUnblockedTasks" to find tasks ready for execution, "updateTaskStatus" to update task progress.
```

**DAG Validation Utilities (exported):**
- `detectCycles(tasks)` - Detects circular dependencies using Kahn's algorithm
- `validateTaskGraph(tasks)` - Validates graph consistency (duplicate IDs, missing refs, cycles)
- `normalizeTaskGraph(tasks)` - Ensures symmetric dependency/unblocks relationships
- `getUnblockedTasks(tasks)` - Returns tasks with all dependencies completed

**functionPlugin** (`src/plugins/function/`):
- Provides `defFunction()` and `defFunctionAgent()` methods
- Enables LLM to call functions via TypeScript code execution
- Automatic TypeScript validation before execution
- Sandboxed execution environment for security
- Supports single functions, composite functions (namespaces), and agents
- Response schemas and callbacks (beforeCall, onSuccess, onError)
- Helper functions: `func()` for composite functions, `funcAgent()` for composite agents

#### defFunction - TypeScript-Validated Function Execution

The `defFunction` method allows you to define JavaScript/TypeScript functions that the LLM can call via code execution. Unlike `defTool` which uses JSON schemas, functions are called through TypeScript code, providing compile-time type checking.

**Single Function:**

```typescript
import { runPrompt } from 'lmthing';
import { z } from 'zod';
// No need to import functionPlugin - it's auto-loaded!

const { result } = await runPrompt(async ({ defFunction, $ }) => {
  defFunction(
    'calculate',
    'Add two numbers',
    z.object({ a: z.number(), b: z.number() }),
    async ({ a, b }) => ({ sum: a + b }),
    {
      responseSchema: z.object({ sum: z.number() }),
      beforeCall: async (input) => {
        console.log('Calling with:', input);
        return undefined; // Continue execution
      },
      onSuccess: async (input, output) => {
        console.log('Result:', output);
        return undefined; // Use original output
      },
      onError: async (input, error) => {
        console.error('Error:', error);
        return { fallback: true };
      }
    }
  );

  $`Calculate 5 + 3 using the calculate function.`;
}, {
  model: 'openai:gpt-4o'
  // No plugins array needed!
});

// LLM calls via TypeScript code:
// const result = await calculate({ a: 5, b: 3 });
// console.log(result.sum); // 8
```

**Composite Functions (Namespaces):**

```typescript
import { runPrompt } from 'lmthing';
import { z } from 'zod';
import { func } from 'lmthing/plugins'; // Need to import `func` helper for composite functions

const { result } = await runPrompt(async ({ defFunction, $ }) => {
  defFunction('math', 'Mathematical operations', [
    func('add', 'Add numbers', z.object({ a: z.number(), b: z.number() }),
      async ({ a, b }) => ({ result: a + b }),
      { responseSchema: z.object({ result: z.number() }) }
    ),
    func('multiply', 'Multiply numbers', z.object({ a: z.number(), b: z.number() }),
      async ({ a, b }) => ({ result: a * b }),
      { responseSchema: z.object({ result: z.number() }) }
    )
  ]);

  $`Use the math functions to calculate.`;
}, { model: 'openai:gpt-4o' });

// LLM calls via TypeScript code:
// const sum = await math.add({ a: 5, b: 3 });
// const product = await math.multiply({ a: 4, b: 7 });
```

**How it works:**
1. `defFunction` registers functions in a registry
2. Automatically creates a `runToolCode` tool with TypeScript validation
3. LLM writes TypeScript code calling the registered functions
4. Code is validated against generated type declarations
5. If valid, code executes in a sandboxed environment (vm2)
6. Results are returned to the LLM

#### defFunctionAgent - Agents Called via TypeScript

The `defFunctionAgent` method works like `defFunction` but spawns child agents instead of executing simple functions.

**Single Function Agent:**

```typescript
import { runPrompt } from 'lmthing';
import { z } from 'zod';
// No need to import functionPlugin - it's auto-loaded!

const { result } = await runPrompt(async ({ defFunctionAgent, $ }) => {
  defFunctionAgent(
    'researcher',
    'Research topics in depth',
    z.object({ topic: z.string() }),
    async ({ topic }, agentPrompt) => {
      agentPrompt.$`Research: ${topic}`;
    },
    {
      model: 'openai:gpt-4o',
      responseSchema: z.object({
        findings: z.array(z.string()),
        confidence: z.number()
      })
    }
  );

  $`Use the researcher agent to look up quantum computing.`;
}, { model: 'openai:gpt-4o' });

// LLM calls via TypeScript code:
// const research = await researcher({ topic: 'quantum computing' });
// console.log(research.findings);
```

**Composite Function Agents:**

```typescript
import { runPrompt } from 'lmthing';
import { z } from 'zod';
import { funcAgent } from 'lmthing/plugins'; // Need to import `funcAgent` helper for composite agents

const { result } = await runPrompt(async ({ defFunctionAgent, $ }) => {
  defFunctionAgent('specialists', 'Specialist agents', [
    funcAgent('researcher', 'Research topics', z.object({ topic: z.string() }),
      async ({ topic }, prompt) => { prompt.$`Research: ${topic}`; },
      { responseSchema: z.object({ findings: z.array(z.string()) }) }
    ),
    funcAgent('analyst', 'Analyze data', z.object({ data: z.string() }),
      async ({ data }, prompt) => { prompt.$`Analyze: ${data}`; },
      { responseSchema: z.object({ summary: z.string(), score: z.number() }) }
    )
  ]);

  $`Use the specialists to research and analyze.`;
}, { model: 'openai:gpt-4o' });

// LLM calls via TypeScript code:
// const research = await specialists.researcher({ topic: 'AI' });
// const analysis = await specialists.analyst({ data: research.findings.join('\n') });
```

**TypeScript Validation:**

The plugin generates TypeScript declarations for all registered functions and validates code before execution:

```typescript
// Generated types (example):
declare function calculate(args: { a: number; b: number }): Promise<{ sum: number }>;
declare namespace math {
  function add(args: { a: number; b: number }): Promise<{ result: number }>;
  function multiply(args: { a: number; b: number }): Promise<{ result: number }>;
}
```

If the LLM writes invalid TypeScript (type errors, calling undefined functions, etc.), the validation fails and error messages are returned, allowing the LLM to fix the code.

**Security:**

- Code execution happens in a sandboxed environment using vm2
- Functions can only call registered functions
- No access to file system, network, or other Node.js APIs unless explicitly provided
- TypeScript validation prevents many common errors before execution

### Creating Custom Plugins

```typescript
import type { StatefulPrompt } from 'lmthing';

export function defCustomFeature(this: StatefulPrompt, config: Config) {
  const [state, setState] = this.defState('customState', initialValue);
  this.defTool('customTool', 'description', schema, handler);
  this.defEffect((ctx, step) => { /* ... */ }, [state]);
  return [state, setState];
}

export const customPlugin = { defCustomFeature };
```

### Plugin Architecture

- Plugin methods receive `StatefulPrompt` as `this` context
- Methods are pre-bound during `setPlugins()` call
- Available through the prompt function's destructured arguments
- Can use all StatefulPrompt methods (`defState`, `defTool`, `defEffect`, etc.)

## Future Development (from PROPOSAL.md)

### Planned Features

1. **Memory System** - Persistent state across conversations
2. **Agent Teams** - Multi-agent coordination patterns (sequential, parallel, voting)
3. **Enhanced Error Handling** - Retry policies, circuit breakers
4. **Metrics & Observability** - Built-in profiling and monitoring

### Not Yet Implemented

The `defDynamicTaskList` concept from PROPOSAL.md has been addressed by `taskGraphPlugin` (`defTaskGraph`),
which provides dependency-aware DAG-based task management with automatic unblocking,
context propagation, and cycle detection — covering and extending the originally planned dynamic task functionality.

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
    "./test": "./dist/test/createMockModel.js",  // Test utilities
    "./plugins": "./dist/plugins/index.js"       // Plugin system
  },
  "bin": {
    "lmthing": "./dist/cli.js"        // CLI executable
  }
}
```

Usage:
```typescript
import { runPrompt, StatefulPrompt, tool, agent, PromptContext, StepModifier, ToolOptions, AgentOptions, ToolEventCallback } from 'lmthing';
import { createMockModel } from 'lmthing/test';
import { taskListPlugin, defTaskList, taskGraphPlugin, defTaskGraph, functionPlugin, defFunction, defFunctionAgent, func, funcAgent } from 'lmthing/plugins';
```

## Dependencies

### Runtime
- `ai` (^6.0.0) - Vercel AI SDK core
- `@ai-sdk/*` - Provider packages (v3/v4)
- `@ai-sdk/openai-compatible` - OpenAI-compatible provider support
- `zod` (^4.1.13) - Schema validation
- `js-yaml` (^4.1.1) - YAML serialization
- `vm2` (^3.9.19) - Sandboxed code execution for function plugin

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
