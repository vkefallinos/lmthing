# Investigate plugin `defFunction`

## Task
Deeply validate that plugin-provided `defFunction` executes TypeScript-validated function calls correctly, including composite namespaces and callback hooks.

## Required investigation
- [ ] Analyze implementation in `src/plugins/function/FunctionPlugin.ts` and related registry/type-checking/sandbox modules.
- [ ] Add extensive mock-model unit tests for:
  - [ ] Single function definition and invocation.
  - [ ] Composite function namespace dispatch via `func(...)`.
  - [ ] Type-check failure reporting and correction loop behavior.
  - [ ] Callback behavior (`beforeCall`, `onSuccess`, `onError`).
  - [ ] Response schema handling and output shape guarantees.
- [ ] Validate sandbox isolation assumptions for code execution paths.

## Acceptance criteria
- [ ] Tests thoroughly cover success/error/type-validation branches.
- [ ] Investigation explains security-relevant execution boundaries.
