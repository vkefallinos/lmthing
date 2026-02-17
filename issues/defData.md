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

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
