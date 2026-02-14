# Copilot instructions for `lmthing`

## Project purpose

`lmthing` is a TypeScript library for building agentic AI workflows on top of Vercel AI SDK `streamText`.

Primary entry points:

- `src/runPrompt.ts` - orchestrates prompt execution
- `src/index.ts` - public package exports
- `src/cli.ts` - CLI entry for `.lmt.mjs` prompt files

## Architecture overview

### Core execution hierarchy

```txt
StreamTextBuilder (src/StreamText.ts)
  -> Prompt (base prompt abstraction)
    -> StatefulPrompt (src/StatefulPrompt.ts)
      -> runPrompt (src/runPrompt.ts)
```

### Responsibilities by module

- `src/StreamText.ts`
  - Low-level wrapper over AI SDK `streamText()`.
  - Manages model/system/messages/tools/options assembly.
  - Handles `execute()` and middleware integration.
- `src/StatefulPrompt.ts`
  - Main prompt abstraction used by users.
  - Exposes `def*` registration APIs and React-like hooks (`defState`, `defEffect`).
  - Re-executes user prompt function across steps.
- `src/runPrompt.ts`
  - Creates and configures `StatefulPrompt`.
  - Wraps prompt in a proxy so destructured methods remain bound.
  - Runs prompt and returns `{ result, prompt }`.

### Internal managers

- `src/state/StateManager.ts` - persistent state for `defState`
- `src/effects/EffectsManager.ts` - effect registration + dependency tracking
- `src/definitions/DefinitionTracker.ts` - tracks/reconciles definitions across re-execution
- `src/collections/index.ts` - collection factories for tools/systems/variables

## Prompt lifecycle and re-execution model

`StatefulPrompt` intentionally re-runs the prompt setup function across steps.

1. Initial user prompt function execution
2. First stream step execution
3. On next step, re-execute user prompt function with persisted state
4. Reconcile definitions (remove no-longer-referenced definitions)
5. Run effects (`defEffect`) and apply step modifications
6. Execute next `streamText` step

Important behavior:

- User messages added via `$`/`defMessage` are deduplicated across re-executions.
- State created with `defState` persists across step re-executions.
- Definitions can be removed automatically if no longer used.

## Definitions (`def*`) and message APIs

`StatefulPrompt` exposes registration methods that define prompt resources.

### Variable definitions

- `def(name, value)`
  - Registers scalar/string variable.
  - Added into system prompt as XML-tagged content.
- `defData(name, objectOrArray)`
  - Serializes structured data (YAML) for system usage.

### System sections

- `defSystem(name, content)`
  - Registers named system sections formatted as XML tags.

### Tool and agent definitions

- `defTool(...)` registers callable tools for the LLM.
- `defAgent(...)` registers child-agent tools (tool call spawns prompt execution).

### Messages

- ``$`...` `` template literal adds user messages.
- `defMessage(role, content)` adds explicit role messages.

## Definition proxy behavior

Most `def*` methods return proxy references that are template-friendly and also include utility methods.

- `.value` - XML tag string (e.g. `<USER_NAME>`)
- `.remind()` - mark definition/tool/agent for reminder insertion
- `.disable()` - disable definition for the next step (typically from inside `defEffect`)
- `.toString()` / `.valueOf()` - stringify to tag value

`getRemindedItems()` returns a list of items marked via `.remind()`.

## State and effects

### `defState(name, initialValue)`

React-like state API:

- Returns `[stateValue, setState]`
- Supports setter with value or updater function
- State persists across re-executed steps

### `defEffect(callback, deps?)`

React-like effect API:

- No deps argument: runs every step
- Empty deps: runs once
- With deps array: runs when tracked values change

Effect callback gets:

- `PromptContext` (messages, step number, tools/systems/variables collections, last tool info)
- `StepModifier` to mutate step input (`messages`, `systems`, `tools`, `variables`)

## Tool system

### Single tool

`defTool(name, description, inputSchema, execute, options?)`

Common options:

- `responseSchema` for documented/validated output shape
- `beforeCall(input, output)`
  - return `undefined` to continue
  - return value to short-circuit execution
- `onSuccess(input, output)`
  - return `undefined` to keep original output
  - return value to replace output
- `onError(input, error)`
  - return `undefined` to keep original error behavior
  - return value to provide fallback result

### Composite tools

`defTool(name, description, [tool(...), tool(...), ...])`

- Creates a single namespace tool that dispatches to sub-tools.
- Sub-tool calls execute sequentially.
- Errors are isolated per sub-call; execution continues.

## Agent system

### Single agent

`defAgent(name, description, inputSchema, configureChildPrompt, options?)`

Agent options include:

- `model` - per-agent model override
- `responseSchema` - structured response validation
- `system` - child agent system prompt
- `plugins` - additional plugins for child prompt

### Agent flow

1. Parent LLM calls agent tool
2. Child prompt instance is created
3. Optional schema/system instructions applied
4. Child prompt runs and returns response + steps
5. Parent receives agent tool result

### Composite agents

`defAgent(name, description, [agent(...), agent(...), ...])`

- Similar to composite tools, but each sub-item is a child agent.
- Runs sub-agents sequentially and aggregates results.

## Function plugin (`src/plugins/function/`)

Provides TypeScript-executed function calls that the model uses through generated code.

Main methods:

- `defFunction(...)`
- `defFunctionAgent(...)`
- Helpers: `func(...)`, `funcAgent(...)`

How it works:

1. Register functions/agents and schemas
2. Plugin generates TypeScript declarations
3. Model writes TypeScript calls
4. Code is type-checked
5. Code runs in sandbox (`vm2`)
6. Results returned to model

Security constraints:

- Sandboxed execution
- No arbitrary fs/network unless explicitly exposed
- Validation failures are surfaced to model for retries

## Task list plugin (`src/plugins/taskList.ts`)

`defTaskList(tasks)` returns `[taskList, setTaskList]` and injects task workflow tools.

- Automatically defines tools like task start/complete actions
- Uses effect-driven updates so system context reflects task status
- Supports long-running multi-step task orchestration patterns

## Provider system and model resolution

Providers live in `src/providers/` and resolver logic is in `src/providers/resolver.ts`.

Supports:

- Explicit provider strings: `openai:gpt-4o`
- Aliases via env vars: `large`, `fast`, etc. (e.g. `LM_MODEL_LARGE`)
- Direct model instances (provider SDK objects)
- Custom OpenAI-compatible providers via env vars in `src/providers/custom.ts`

Custom provider env pattern:

```bash
{NAME}_API_KEY=...
{NAME}_API_BASE=https://...
{NAME}_API_TYPE=openai
```

## Step capture, middleware, and outputs

`StreamTextBuilder` wraps model calls with middleware to capture step-level data.

Use:

- `prompt.steps` for simplified step history
- `prompt.fullSteps` for raw step/chunk detail

Agent tool results are normalized by middleware to return usable response text/results.

## CLI behavior (`src/cli.ts`)

CLI command:

```bash
npx lmthing run <file.lmt.mjs>
```

Expected module exports in `.lmt.mjs`:

- `default` async prompt function (required)
- `config` object with `model` (required)
- `mock` array (optional; used when `model: 'mock'`)

Mock mode:

- If `config.model === 'mock'`, CLI uses `createMockModel(mock)`.
- No external provider/API needed for deterministic local tests.

## Testing guidance

Run:

- `npm test`
- `npm run test:watch`
- `npm run test:coverage`

Build:

- `npm run build`
- `npm run build:cli`

Testing utilities:

- `src/test/createMockModel.ts` for deterministic stream/tool-call testing

Test file layout:

- `src/*.test.ts` - core behavior tests
- `src/state/*.test.ts` - state tests
- `src/effects/*.test.ts` - effects tests
- `src/definitions/*.test.ts` - definition tracking tests
- `src/collections/*.test.ts` - collection utilities
- `src/providers/*.test.ts` - provider/resolver tests

## Development conventions

- TypeScript strict mode is enabled.
- Keep changes minimal and localized.
- Follow existing naming and style in touched files.
- Prefer extending existing modules/managers over ad-hoc new logic.
- Keep plugin API ergonomics stable and type-safe.
- Add/update tests near changed behavior.

## Common implementation patterns

### Pattern: state-driven step logic

- Use `defState` for evolving values.
- Use `defEffect` with deps to gate when step modifications run.
- Use `StepModifier` to inject transient per-step context.

### Pattern: conditional definition availability

- Define resources in prompt function.
- Use definition proxies + `.disable()` from effects to hide when needed.
- Let reconciliation remove truly unused definitions.

### Pattern: structured tool/agent outputs

- Define `responseSchema` when reliable shape matters.
- Keep schema synchronized with implementation return types.

## Common pitfalls

- Using regular variables (non-`defState`) for cross-step state.
- Assuming `$` message additions repeat on every re-execution.
- Forgetting that reconciliation can remove conditional definitions.
- Misconfigured provider strings (`provider:model` format is required).
- Missing `*_API_TYPE=openai` for custom providers.

## Troubleshooting quick reference

- **"Model is required to execute streamText"**
  - Ensure `runPrompt` config includes `model`.
- **Tool not called in tests**
  - Verify mock tool call `toolName` matches `defTool` name.
- **Variables missing in prompt**
  - Ensure `prompt.run()` executed (automatic via `runPrompt`).
- **Custom provider unresolved**
  - Check env vars: key/base/type are all set.

## Future direction (documented but partially planned)

Planned areas include:

- persistent memory
- agent team orchestration patterns
- enhanced retries/error handling
- metrics/observability

If implementing planned features, keep public APIs consistent with existing `def*` design principles.
