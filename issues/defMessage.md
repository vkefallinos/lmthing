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
