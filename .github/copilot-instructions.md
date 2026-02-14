# Copilot instructions for `lmthing`

## Project purpose

`lmthing` is a TypeScript library for building agentic AI workflows on top of Vercel AI SDK `streamText`.

Primary entry point:

- `src/runPrompt.ts`

Core architecture:

- `src/StreamText.ts` - low-level streamText builder
- `src/StatefulPrompt.ts` - main prompt abstraction with state/effects/hooks
- `src/runPrompt.ts` - orchestrates prompt execution

## Important concepts

### Definitions (`def*`)

`StatefulPrompt` exposes `def*` methods that register prompt resources:

- `def` / `defData` for XML-tagged variables
- `defSystem` for named system prompt sections
- `defTool` for tool registration
- `defAgent` for child-agent tools
- `$` template literal for adding user messages

Definition proxy values can be used in templates and support:

- `.value`
- `.remind()`
- `.disable()` (inside effects)

### Stateful execution model

`StatefulPrompt` re-executes the user prompt function across steps:

1. Initial prompt execution
2. Stream step execution
3. Re-execution on later steps with persisted state
4. Definition reconciliation (remove unused definitions)
5. Effect processing (`defEffect`)

### State and effects

- `defState(name, initialValue)` behaves like React `useState`
- `defEffect(callback, deps?)` runs effects per-step or when dependencies change

Key internals:

- `src/state/StateManager.ts`
- `src/effects/EffectsManager.ts`
- `src/definitions/DefinitionTracker.ts`

## Plugins

Built-in plugins are under `src/plugins/`:

- `taskListPlugin` (`src/plugins/taskList.ts`)
- `functionPlugin` (`src/plugins/function/`)

When editing plugin behavior, preserve existing prompt API ergonomics and TypeScript type safety.

## Providers and model resolution

Provider adapters are in `src/providers/`.
Model resolution lives in `src/providers/resolver.ts` and supports:

- explicit provider strings (`openai:gpt-4o`)
- aliases (`large`, `fast`) via env vars
- custom OpenAI-compatible providers via env variables

## Development conventions

- TypeScript strict mode is enabled.
- Keep changes minimal and localized.
- Follow existing style and naming in touched files.
- Prefer extending existing managers/modules over adding ad-hoc logic.
- Add/update tests close to changed behavior (`src/**/*.test.ts`).

## Build and test

- `npm test`
- `npm run build`

Use `src/test/createMockModel.ts` for deterministic tests without API calls.
