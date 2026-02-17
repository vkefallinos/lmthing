# Investigate `defMessage`

## Task
Deeply validate that `defMessage(role, content)` appends explicit conversation messages correctly and respects anti-duplication behavior under prompt re-execution.

## Required investigation
- [ ] Analyze message insertion and deduplication logic in `src/StatefulPrompt.ts`.
- [ ] Add extensive mock-model unit tests for:
  - [ ] User vs assistant message insertion.
  - [ ] Deduplication across re-executions.
  - [ ] Ordering with `$` template messages.
  - [ ] Edge cases for repeated identical content and interleaved definitions.
- [ ] Verify message history in recorded steps matches expected conversation structure.

## Acceptance criteria
- [ ] Tests demonstrate no duplicated/unexpected message inflation over multiple steps.
- [ ] Investigation captures any role-handling limitations.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
