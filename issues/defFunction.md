# Investigate plugin `defFunction`

## Task
Deeply validate that plugin-provided `defFunction` executes TypeScript-validated function calls correctly, including composite namespaces and callback hooks.

## Required investigation
- [ ] Analyze implementation in `src/plugins/function/FunctionPlugin.ts` and related registry/type-checking/sandbox modules.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Single function definition and invocation.
  - [ ] Composite function namespace dispatch via `func(...)`.
  - [ ] Type-check failure reporting and correction loop behavior.
  - [ ] Callback behavior (`beforeCall`, `onSuccess`, `onError`).
  - [ ] Response schema handling and output shape guarantees.
- [ ] Validate sandbox isolation assumptions for code execution paths.

## Acceptance criteria
- [ ] Tests thoroughly cover success/error/type-validation branches.
- [ ] Investigation explains security-relevant execution boundaries.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
