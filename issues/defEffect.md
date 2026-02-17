# Investigate `defEffect`

## Task
Deeply validate that `defEffect` dependency tracking and step modifications execute in the correct order across prompt steps.

## Required investigation
- [ ] Analyze `EffectsManager` behavior and `stepModifier` application flow.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Effects without dependencies (runs each step).
  - [ ] Dependency-based execution when values change vs remain stable.
  - [ ] Step modifier updates for messages/tools/systems.
  - [ ] Interactions with `defState`, `defTool`, and definition disabling.
- [ ] Confirm effect ordering relative to prompt re-execution and final prepare-step behavior.

## Acceptance criteria
- [ ] Tests prove expected execution cadence and modification precedence.
- [ ] Investigation documents any non-obvious dependency comparison semantics.
