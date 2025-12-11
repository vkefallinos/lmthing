# Test Snapshot Problems

## Critical Understanding

After reviewing the test code, the problems stem from a fundamental misunderstanding of how `runPrompt` and state/effects work:

1. **State changes do not trigger re-execution**: When you call `setCount(1)` inside the prompt function, it updates state but does NOT cause the prompt function to re-execute within the same test. The prompt function runs once, state is modified, then the model executes.

2. **Mock model consumption**: The mock model provides responses sequentially, and once consumed, they're not available for subsequent steps.

3. **Re-execution requires triggers**: Re-execution of the prompt function only happens on subsequent steps (after tool calls), not from state changes within a single execution.

---

## defAgent.test.ts

### Test: "calls sub-agents when model uses composite agent"
**Location**: Lines 3-229 in snapshot file

**Problem 1**: Empty response from analyst agent (Step 3)
- Line 98-100: `"content": []` with `"finishReason": "stop"`
- Line 187: The analyst sub-agent returns `"response": ""`
- The child agent's mock model provides `{ type: 'text', text: 'ok' }` by default (beforeEach), but this test creates child agents that call `p.$\`Analyze data\`` which should produce output

**Problem 2**: Empty final response (Step 4)
- Line 224-226: Final step has `"content": []`
- After composite agent tool completes, parent mock has no more responses

### Test: "calls agent when model uses it"
**Location**: Lines 612-757 in snapshot file, Test code lines 29-48

**Problem**: Empty final response (Step 3)
- Line 752-754: `"content": []` with `"finishReason": "stop"`
- Mock provides: `['Delegating', tool-call, 'Done']`
- Step 1: Consumes 'Delegating' + tool-call
- Step 2: Child agent execution
- Step 3: Parent continues but 'Done' appears to have been consumed already

### Test: "returns agent response"
**Location**: Lines 791-924 in snapshot file, Test code lines 50-66

**Problem**: Empty final response (Step 3)
- Line 919-921: `"content": []` with `"finishReason": "stop"`
- Mock provides: `[tool-call, 'ok']`
- After agent returns, mock has no response left

### Test: "handles sub-agent errors gracefully"
**Location**: Lines 263-437 in snapshot file, Test code lines 164-195

**Problem**: Empty final response (Step 3)
- Line 432-434: `"content": []` with `"finishReason": "stop"`
- Mock provides: `['Try', tool-call, 'Done']`
- After tool execution, mock appears exhausted

---

## defState.test.ts

### FUNDAMENTAL ISSUE: State Changes Don't Trigger Re-execution

All defState tests have the same root problem: **calling `setState()` within the prompt function does not cause the function to re-execute**.

#### Example: "persists state across re-executions" (lines 20-35)
```typescript
const { result, prompt } = await runPrompt(async ({ defState, $ }) => {
  const [count, setCount] = defState('count', 0);
  if (count < 2) setCount(count + 1);  // ← Updates state but doesn't re-execute
  $`Count: ${count}`;  // ← Always uses initial value (0)
}, { model: mockModel });
```

**What happens:**
1. Prompt function executes once: `count` is 0, `setCount(1)` is called, message is `"Count: 0"`
2. State is now 1, but the prompt function doesn't re-execute
3. Model executes and returns only one step
4. The state change never gets reflected because there are no subsequent executions

**Result:** Snapshot shows 1 step with `"Count: 0"`, not multiple steps with changing values.

### All Affected Tests:

1. **"persists state across re-executions"** (lines 20-35)
   - Expected: 3 steps with count 0→1→2
   - Actual: 1 step with count 0

2. **"updates state with direct value"** (lines 37-51)
   - Expected: 2 steps with 'init'→'updated'
   - Actual: 1 step with 'init'

3. **"updates state with function"** (lines 53-67)
   - Expected: 2 steps with 0→10
   - Actual: 1 step with 0

4. **"handles object state"** (lines 69-83)
   - Expected: 2 steps with age 30→31
   - Actual: 1 step with age 30

5. **"handles array state"** (lines 85-99)
   - Expected: 2 steps with ['a']→['a','b']
   - Actual: 1 step with ['a']

6. **"supports multiple state variables"** (lines 101-121)
   - Expected: 2 steps with (1,2,3)→(10,20,30)
   - Actual: 1 step with (1,2,3)

7. **"handles boolean state"** (lines 137-151)
   - Expected: 2 steps with false→true
   - Actual: 1 step with false

8. **"handles null state"** (lines 153-167)
   - Expected: 2 steps with null→'set'
   - Actual: 1 step with null

---

## defEffect.test.ts

### Same Root Issue: No Re-execution

The defEffect tests suffer from the same problem - effects run but without re-execution of the prompt function between steps.

### Test: "runs effect without dependencies every step" (lines 7-25)
**Problem**: Only 1 step instead of 3
- Mock provides 3 responses but prompt function only executes once
- Effect runs once, not multiple times
- The test expects `runs >= 1` which passes, but conceptually expects multiple runs

### Test: "runs effect when dependencies change" (lines 27-47)
**Problem**: Only 1 step
- `setCount()` is called but doesn't trigger re-execution
- Effect runs once with initial count value
- Subsequent state changes (0→1→2) never trigger the effect again

### Test: "modifies messages via stepModifier" (lines 70-85)
**Problem**: Messages replaced instead of appended
- Line 78: `step('messages', [{ role: 'user', content: 'Extra' }])`
- Snapshot (line 73-76) shows only "Extra", not both "msg" and "Extra"
- **This suggests stepModifier REPLACES the messages array rather than merging**
- Unclear if this is intended API behavior or a bug

---

## Summary of Issues

### 1. Test Design Flaw: Misunderstanding Re-execution

Most defState and defEffect tests are fundamentally flawed because they expect:
- State changes to trigger re-execution → **This doesn't happen**
- Multiple steps to be captured → **Only 1 step is captured**

The tests set state within the prompt function but never create conditions (like tool calls) that would trigger actual re-execution on subsequent steps.

### 2. Agent Empty Content Issues

Agent tests have empty `content: []` in final steps because:
- Mock models run out of responses after tool execution
- The final text response may be consumed during tool-call step
- Need to investigate mock model's response consumption pattern

### 3. StepModifier Behavior

The `step('messages', [...])` call appears to **replace** rather than **append** to the messages array. Need to verify if this is:
- Intended API design
- A bug in implementation
- A misunderstanding of how stepModifier should work

### Recommendations

1. **defState tests**: Should either:
   - Test state within a single execution (remove expectation of multiple steps)
   - Use tool calls or other mechanisms to trigger actual re-execution
   - Document that state changes alone don't cause re-execution

2. **defEffect tests**: Same as defState - clarify expectations

3. **defAgent tests**: Investigate why mock responses are exhausted and why final steps have empty content

4. **stepModifier tests**: Clarify and document whether `step('messages', ...)` should replace or merge
