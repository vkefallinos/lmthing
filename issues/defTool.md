# Investigate `defTool`

## Task
Deeply validate that `defTool` works for single and composite tools, including callbacks and schema behavior, under mock-model driven tool-call loops.

## Required investigation
- [ ] Analyze `defTool` implementation paths in `src/StatefulPrompt.ts` and callback execution flow.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Single tool registration/execution.
  - [ ] Composite tool dispatch (`tool(...)` entries) and per-subtool result handling.
  - [ ] Callback behavior (`beforeCall`, `onSuccess`, `onError`) including override semantics.
  - [ ] Re-execution and reconciliation of tool definitions.
  - [ ] Reminder/disable interactions.
- [ ] Validate step output structure for tool-calls and returned tool results.

## Acceptance criteria
- [ ] Tests cover success/error/short-circuit callback paths comprehensively.
- [ ] Analysis clearly explains execution order and failure handling.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
