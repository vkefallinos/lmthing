# Investigate plugin `defFunctionAgent`

## Task
Deeply validate that plugin-provided `defFunctionAgent` orchestrates child-agent execution through TypeScript function calls with schema/model/system options preserved.

## Required investigation
- [x] Analyze `defFunctionAgent` flow in `src/plugins/function/FunctionPlugin.ts`.
- [x] Add extensive mock-model unit tests for:
  - [x] Single function-agent invocation and response capture.
  - [x] Composite function-agent namespaces via `funcAgent(...)`.
  - [x] Response schema validation and validation-error propagation.
  - [x] Per-agent model/system/plugin option handling.
  - [x] Type-check + sandbox execution with agent-call code.
- [x] Confirm returned metadata (steps/errors) is stable across re-executions.

## Acceptance criteria
- [x] Tests prove parity with `defAgent` semantics where applicable.
- [x] Investigation documents constraints specific to function-agent orchestration.

## Function-agent orchestration constraints
- `defFunctionAgent` runs through `runToolCode` and therefore surfaces schema failures as runtime tool errors (`success: false`) rather than `validationError` fields returned by `defAgent`.
- TypeScript validation is enforced before sandbox execution, so invalid agent-call code can fail without invoking the child model.
- Per-agent `model`/`system`/`plugins` options are applied on child prompts at invocation time, including for composite namespaces created via `funcAgent(...)`.
