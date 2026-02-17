# Investigate `defSystem`

## Task
Deeply validate that `defSystem(name, content)` produces deterministic named system sections and behaves correctly during multi-step prompt execution.

## Required investigation
- [ ] Analyze registration and reconciliation logic for system sections in `src/StatefulPrompt.ts`.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Correct XML section rendering and ordering expectations.
  - [ ] Re-execution updates/removal of unused sections.
  - [ ] Coexistence with variables/data/system segments.
  - [ ] Proxy reminder/disable behavior.
- [ ] Confirm no duplicate or stale system sections survive across steps.

## Acceptance criteria
- [ ] Tests prove stable behavior for both static and dynamically changing system sections.
- [ ] Investigation notes identify any edge-case merge/reconciliation risks.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
