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
