# defMessage() Validation Findings

## Overview

This document summarizes the investigation and validation of `defMessage(role, content)` behavior in the lmthing library, specifically regarding message insertion and deduplication under prompt re-execution.

**Related Issue**: #55

## Investigation Summary

### Message Insertion Mechanism

`defMessage()` in `StatefulPrompt.ts` (lines 325-331) provides explicit message insertion with the following behavior:

```typescript
defMessage(role: 'user' | 'assistant', content: string) {
  // Prevent duplicate user messages
  if (role === 'user' && this._executedOnce) {
    return undefined;
  }
  this.addMessage({ role, content });
}
```

### Key Findings

#### 1. User Message Deduplication

**Behavior**: User messages are deduplicated across prompt re-executions.

- **First execution** (`_executedOnce = false`): Messages are added normally
- **Re-executions** (`_executedOnce = true`): `defMessage('user', ...)` silently returns without adding
- **Template literal `$`**: Same deduplication behavior (lines 700-702)

**Test validation**: Messages added in the first execution persist in conversation history across all subsequent steps, but are not re-added during re-execution.

#### 2. Assistant Message Behavior

**Behavior**: Assistant messages are NOT deduplicated.

- Assistant messages bypass the `_executedOnce` check
- Each re-execution adds the assistant message again
- This is by design but can lead to duplication if not carefully managed

**Use case**: Suitable for step-specific responses or when you need to inject context at different points in the conversation.

**Test validation**: Confirmed that assistant messages are added on each re-execution, allowing for multiple identical assistant messages across steps.

#### 3. Message Ordering

**Behavior**: Messages maintain strict insertion order.

- `defMessage()` calls and `$` template literals interleave correctly
- Order preserved: defMessage → $ → defMessage → $ maintains sequence
- Works correctly with interleaved variable definitions

**Test validation**: All message ordering tests pass, confirming predictable message sequencing.

#### 4. Proxy Variable Interpolation

**Behavior**: Definition proxies (from `def()`, `defData()`) are correctly interpolated in `defMessage()` content.

```typescript
const userName = def('USER_NAME', 'Alice');
defMessage('user', `Hello ${userName}`);
// Results in: "Hello <USER_NAME>"
```

**Test validation**: Confirmed that proxy `.toString()` and `.valueOf()` methods work correctly in template literals within `defMessage()`.

#### 5. Edge Cases

All edge cases tested and validated:

- **Empty strings**: Added without filtering
- **Whitespace-only content**: Preserved as-is
- **Repeated identical content**: No content-based deduplication (all calls add messages)
- **Conditional insertion**: Works correctly with control flow

### Message Content Format

**Important Discovery**: Messages use an array-based content format in the recorded steps:

```typescript
// Message content structure
{
  role: 'user',
  content: [
    { type: 'text', text: 'actual message text' }
  ]
}
```

Tests must use a helper function to extract text:

```typescript
function getMessageContent(message: any): string {
  if (!message || !message.content) return '';
  return Array.isArray(message.content) 
    ? message.content.map((c: any) => c.text).join('') 
    : message.content as string;
}
```

## Role Handling Limitations

### Supported Roles

- **user**: Supported with deduplication
- **assistant**: Supported without deduplication
- **system**: Not supported by `defMessage()` type signature (use `defSystem()` instead)

### When to Use defMessage vs Other Methods

| Scenario | Recommended Method | Reason |
|----------|-------------------|---------|
| User prompt | `$` template literal | Concise, supports variable interpolation |
| Explicit user message | `defMessage('user', ...)` | When you need programmatic message construction |
| System context | `defSystem()` | Proper semantic separation |
| Assistant examples | `defMessage('assistant', ...)` | Can add assistant message context |
| Multi-turn conversation history | `defMessage('assistant', ...)` | Requires careful management to avoid duplication |

## Test Coverage

### Test File: `src/defMessage.test.ts`

**Total Tests**: 21 (all passing)

**Coverage Areas**:

1. **User message insertion and deduplication** (3 tests)
   - Initial insertion
   - Deduplication on re-execution
   - Multiple distinct messages without duplication

2. **Assistant message behavior** (3 tests)
   - Initial insertion
   - No deduplication on re-execution
   - Multiple assistant messages in single execution

3. **Message ordering** (2 tests)
   - Order with $ template messages
   - Order with interleaved definitions

4. **Edge cases** (6 tests)
   - Repeated identical user/assistant messages
   - Empty string content
   - Whitespace-only content

5. **Proxy variable interpolation** (3 tests)
   - def() proxy interpolation
   - defData() proxy interpolation
   - Multiple proxy interpolations

6. **Message history tracking** (3 tests)
   - User messages in step history
   - Assistant messages in step history
   - Conversation structure across multiple steps
   - No message inflation verification

7. **Role handling** (2 tests)
   - Role type enforcement
   - Conditional message insertion

## Recommendations

### For Users

1. **Prefer `$` template literals for user messages** unless you need programmatic message construction
2. **Use `defMessage('assistant', ...)` sparingly** to avoid unintended duplication on re-execution
3. **Always test multi-step workflows** to ensure message history behaves as expected
4. **Use proxy interpolation** when you want to reference variables by their XML tags

### For Library Maintainers

1. **Current behavior is correct and well-tested** - no code changes needed
2. **Documentation should clarify**:
   - Assistant messages are not deduplicated (by design)
   - User messages persist in conversation history across steps
   - Message content format in recorded steps uses array structure
3. **Consider adding**:
   - Optional content-based deduplication for assistant messages
   - Warning logs when duplicate assistant messages are detected

## Conclusion

The `defMessage()` implementation correctly handles:
- ✅ User message deduplication via `_executedOnce` flag
- ✅ Assistant message insertion (intentionally without deduplication)
- ✅ Message ordering with $ template literals
- ✅ Proxy variable interpolation
- ✅ Edge cases (empty strings, whitespace, repeated content)
- ✅ Message history tracking across steps

No message inflation or unexpected duplication occurs with proper usage. All 21 comprehensive tests pass successfully.

**Status**: Investigation complete, all acceptance criteria met.
