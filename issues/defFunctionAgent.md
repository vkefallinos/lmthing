# Investigate plugin `defFunctionAgent`

## Task
Deeply validate that plugin-provided `defFunctionAgent` orchestrates child-agent execution through TypeScript function calls with schema/model/system options preserved.

## Required investigation
- [ ] Analyze `defFunctionAgent` flow in `src/plugins/function/FunctionPlugin.ts`.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Single function-agent invocation and response capture.
  - [ ] Composite function-agent namespaces via `funcAgent(...)`.
  - [ ] Response schema validation and validation-error propagation.
  - [ ] Per-agent model/system/plugin option handling.
  - [ ] Type-check + sandbox execution with agent-call code.
- [ ] Confirm returned metadata (steps/errors) is stable across re-executions.

## Acceptance criteria
- [ ] Tests prove parity with `defAgent` semantics where applicable.
- [ ] Investigation documents constraints specific to function-agent orchestration.
