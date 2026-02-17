# Investigate `def`

## Task
Deeply validate that `def(name, value)` consistently registers scalar variables, returns a stable definition proxy, and renders correctly in system prompts across step re-executions.

## Required investigation
- [ ] Analyze `def` logic in `src/StatefulPrompt.ts` (registration, proxy creation, reconciliation interactions).
- [ ] Add extensive mock-model unit tests for:
  - [ ] Initial registration and XML-tag rendering.
  - [ ] Proxy behavior (`value`, `toString`, template interpolation).
  - [ ] Re-execution behavior and deduplication/stability across steps.
  - [ ] Disable/remind behavior via proxy methods.
- [ ] Confirm interactions with related APIs (`$`, `defMessage`, `defEffect`) do not regress variable usage.

## Acceptance criteria
- [ ] Tests clearly cover happy paths and edge cases (empty values, overwrites, repeated executions).
- [ ] Any discovered logic gaps are documented with concrete reproduction steps.
