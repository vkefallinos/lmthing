# Investigate `defAgent`

## Task
Deeply validate that `defAgent` correctly runs child prompts (single and composite), handles optional response schemas, and returns stable parent-step artifacts.

## Required investigation
- [ ] Analyze agent orchestration logic in `src/StatefulPrompt.ts`.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Single-agent execution lifecycle.
  - [ ] Composite agent dispatch and independent sub-agent behavior.
  - [ ] `responseSchema` instruction injection and validation error surfacing.
  - [ ] Model/system overrides and plugin passthrough behavior.
  - [ ] Reconciliation/reminder/disable interactions.
- [ ] Validate middleware transformation from tool result objects to expected response text.

## Acceptance criteria
- [ ] Tests exercise both valid and invalid schema outputs.
- [ ] Investigation documents guarantees and caveats in child-agent execution flow.

## Additional exhaustive coverage expectations
- [ ] Add a cross-API integration matrix with at least 3 mixed scenarios combining the target API with other `def*` APIs.
- [ ] Add explicit negative/failure-path tests (invalid inputs, validation/runtime failures, and recovery behavior where applicable).
- [ ] Add multi-step (3+ steps) re-execution tests to verify stability, deduplication, and no stale definition leakage.
- [ ] Add assertions for step artifacts (`messages`, `tool-result` payloads, system sections) in addition to final text output.
- [ ] Document known constraints, non-goals, and any intentionally untested branches with rationale.
