# Investigate `defData`

## Task
Deeply validate that `defData(name, objectOrArray)` serializes structured values correctly and preserves expected behavior through re-execution and definition reconciliation.

## Required investigation
- [ ] Analyze `defData` flow in `src/StatefulPrompt.ts` and YAML serialization expectations.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Object/array serialization output format in system prompt.
  - [ ] Proxy behavior and template usage.
  - [ ] Re-registration and reconciliation across subsequent steps.
  - [ ] Edge cases (nested structures, empty objects/arrays, special characters).
- [ ] Validate compatibility with `defEffect`-driven step updates.

## Acceptance criteria
- [ ] Tests verify both serialized content and runtime orchestration behavior.
- [ ] Logic analysis documents any ambiguity around serialization guarantees.
