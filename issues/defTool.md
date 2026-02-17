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
