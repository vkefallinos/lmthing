# Investigate plugin `defTaskList`

## Task
Deeply validate that plugin-provided `defTaskList` manages task lifecycle state and auto-generated task tools correctly across steps.

## Required investigation
- [ ] Analyze plugin logic in `src/plugins/taskList/taskList.ts`.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Task initialization and state exposure.
  - [ ] `startTask`, `completeTask`, and `failTask` transitions.
  - [ ] Invalid transitions/error handling and restart behavior.
  - [ ] System status rendering updates via `defEffect`.
  - [ ] Re-execution stability and deduplication of plugin definitions.
- [ ] Validate interactions with other def* APIs in mixed scenarios.

## Acceptance criteria
- [ ] Tests cover all status transitions and failure cases.
- [ ] Analysis explains invariants enforced by the plugin.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
