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
