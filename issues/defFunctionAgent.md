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

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
