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
