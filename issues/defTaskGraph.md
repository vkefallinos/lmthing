# Investigate plugin `defTaskGraph`

## Task
Deeply validate that plugin-provided `defTaskGraph` correctly enforces DAG constraints, readiness calculations, and status propagation.

## Required investigation
- [ ] Analyze logic in `src/plugins/taskGraph/taskGraph.ts` (validation, normalization, unblocking, propagation).
- [ ] Add extensive mock-model unit tests for:
  - [ ] Graph initialization and tool registration.
  - [ ] Cycle detection and missing-reference validation.
  - [ ] `getUnblockedTasks` readiness correctness.
  - [ ] `updateTaskStatus` transitions and downstream context propagation.
  - [ ] System status output updates and re-execution stability.
- [ ] Verify helper exports and plugin orchestration behave consistently.

## Acceptance criteria
- [ ] Tests cover DAG edge cases (branching, convergence, partial failures).
- [ ] Investigation clearly documents status and dependency invariants.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
