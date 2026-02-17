# def() Method Validation Findings

## Overview

This document summarizes the findings from comprehensive validation testing of the `def(name, value)` method in the lmthing library. All tests have been successfully implemented and are passing (30/30).

## Test Coverage Summary

### ✅ Initial Registration and XML-tag Rendering (5 tests)
- Simple scalar variable registration
- XML tag formatting in system prompts
- Multiple variables without conflicts
- Empty string values
- Whitespace and special characters in values

### ✅ Proxy Behavior (7 tests)
- `.value` property access
- String coercion in template literals
- `.toString()` and `.valueOf()` methods
- String concatenation
- `in` operator for property checking
- Unknown property access (returns tag)

### ✅ Re-execution Behavior and Stability (4 tests)
- Proxy reference stability across re-executions
- Variable persistence across multiple steps
- Variable redefinition with same name
- Variable removal when not defined in re-execution

### ✅ Disable/Remind Behavior (4 tests)
- `.remind()` method functionality
- `.disable()` method functionality
- Multiple `remind()` calls
- Conditional disable based on state

### ✅ Edge Cases (5 tests)
- Very long variable values (10,000 characters)
- Variable names with underscores and numbers
- Unicode characters (emoji, Chinese, Arabic)
- Rapid successive def() calls (100 variables)

### ✅ Interactions with Related APIs (5 tests)
- Integration with `$` template literal
- Integration with `defMessage`
- Integration with `defEffect`
- User message deduplication on re-execution
- Dynamic variable values with `defState`
- Multiple variables in single template

## Validated Behaviors

### ✓ Variable Registration
- Variables are stored as `Record<string, { type: 'string', value: string }>`
- Variable names can contain underscores, numbers, and various characters
- Empty strings are supported as values
- Unicode characters are properly preserved

### ✓ Proxy System
- Returns a proxy object that acts as a string in templates
- Exposes `.value`, `.remind()`, and `.disable()` methods
- String coercion works correctly via `toString()`, `valueOf()`, and `Symbol.toPrimitive`
- Unknown property access returns the tag value for flexibility

### ✓ System Prompt Rendering
- Variables are formatted as XML tags: `<VARIABLE_NAME>value</VARIABLE_NAME>`
- Wrapped in a `<variables>` section
- Whitespace and special characters are preserved
- Empty values still create tags

### ✓ Re-execution Model
- Prompt function re-runs on each step after the first
- Variables persist across re-executions
- Variables can be redefined with different values
- Variables not referenced in re-execution are removed (reconciliation)
- User messages added via `$` are only added once (not duplicated)

### ✓ Disable/Remind Mechanism
- `.disable()` removes variable from next step's system prompt
- `.remind()` marks variable to be emphasized to the model
- Both methods work correctly within `defEffect` callbacks
- State-dependent conditional disabling works as expected

## Logic Gaps and Edge Cases Discovered

### 1. **Content Format Inconsistency** ✓ Handled in Tests
**Issue**: Message content can be either a string or an array of content parts
```typescript
// Can be:
content: "text"  // string
// or:
content: [{ type: 'text', text: "text" }]  // array
```
**Impact**: Tests need to handle both formats when inspecting messages
**Resolution**: Tests now handle both formats correctly

### 2. **Variable Data Structure** ✓ Documented
**Issue**: `prompt.variables` is a plain object, not a Map
```typescript
// Correct:
prompt.variables['NAME']
// Incorrect:
prompt.variables.get('NAME')
```
**Impact**: Initial test failures due to incorrect API usage
**Resolution**: All tests updated to use correct object access syntax

### 3. **System Message Presence** ✓ Handled in Tests
**Issue**: System messages may not always be present in early steps
**Impact**: Tests checking system prompt content need null guards
**Resolution**: Tests now check for message existence before accessing content

### 4. **Variable Reconciliation Behavior** ✓ Validated
**Behavior**: Variables not defined in a re-execution are automatically removed
**Example**:
```typescript
// First execution
if (condition) {
  def('CONDITIONAL', 'value');
}
// If condition becomes false on re-execution, CONDITIONAL is removed
```
**Impact**: This is intentional behavior but may surprise users
**Recommendation**: Consider documenting this prominently in user guide

### 5. **XML Special Characters** ⚠️ Not Validated
**Potential Issue**: No validation found for XML special characters in values:
- `<` could break XML structure
- `>` could break XML structure  
- `&` could create invalid XML entities
**Example**:
```typescript
def('CODE', 'if (x < 5) { return x > 0 && true; }');
// Could produce: <CODE>if (x < 5) { return x > 0 && true; }</CODE>
```
**Impact**: Malformed system prompt if values contain XML special chars
**Recommendation**: 
- Add XML entity escaping in variable rendering
- Or document limitation
- Add tests for this edge case

### 6. **Variable Name Validation** ⚠️ Not Validated
**Potential Issue**: No validation of variable names
**Examples that might cause issues**:
```typescript
def('WITH SPACE', 'value');  // Space in XML tag name
def('123START', 'value');     // Starts with number
def('', 'value');             // Empty name
def('WITH-DASH', 'value');    // Dash (valid in XML)
```
**Impact**: Invalid XML tag names could break system prompt parsing
**Recommendation**:
- Add validation for valid XML tag names
- Throw error on invalid names
- Add tests for invalid name rejection

### 7. **User Message Deduplication Logic** ✓ Validated
**Behavior**: The `$` method uses `_executedOnce` flag to prevent duplication
**Finding**: Works correctly - messages only added once even with re-execution
**Recommendation**: This is good as-is

### 8. **Variable Value Size Limits** ✓ Tested
**Finding**: Successfully tested with 10,000 character values
**Recommendation**: Consider documenting any practical size limits based on model context windows

## Reproduction Steps for Key Behaviors

### Variable Re-definition Behavior
```typescript
let step = 0;
const { result } = await runPrompt(async ({ def, defTool, defState, $ }) => {
  const [currentStep, setStep] = defState('step', 0);
  
  // Value changes based on state
  def('DYNAMIC', currentStep === 0 ? 'initial' : 'updated');
  
  defTool('update', 'Update', z.object({}), async () => {
    setStep(1);
    return { updated: true };
  });
  
  $`Test`;
}, { model });

// After execution, DYNAMIC will be 'updated'
```

### Variable Removal via Reconciliation
```typescript
const { result } = await runPrompt(async ({ def, defTool, defState, $ }) => {
  const [include, setInclude] = defState('include', true);
  
  if (include) {
    def('CONDITIONAL', 'present');
  }
  
  defTool('toggle', 'Toggle', z.object({}), async () => {
    setInclude(false);
    return { toggled: true };
  });
  
  $`Test`;
}, { model });

// After tool call, CONDITIONAL variable is removed
```

### Conditional Disable Based on State
```typescript
const { result } = await runPrompt(async ({ def, defTool, defState, defEffect, $ }) => {
  const [shouldShow, setShouldShow] = defState('show', true);
  const dynamic = def('DYNAMIC', 'value');
  
  defEffect((ctx, stepModifier) => {
    if (!shouldShow) {
      dynamic.disable();
    }
  }, [shouldShow]);
  
  defTool('toggle', 'Toggle', z.object({}), async () => {
    setShouldShow(false);
    return { toggled: true };
  });
  
  $`Test`;
}, { model });

// After toggle, DYNAMIC won't appear in system prompt
```

## Recommendations

### High Priority
1. **Add XML Entity Escaping**: Escape `<`, `>`, `&`, `"`, `'` in variable values
2. **Add Variable Name Validation**: Validate XML tag name compliance
3. **Add Tests for XML Special Characters**: Test edge cases with special chars

### Medium Priority
4. **Document Reconciliation Behavior**: Clearly explain variable removal in docs
5. **Consider Size Limits**: Document practical limits for variable values
6. **Add Warning for Large Values**: Consider warning if value exceeds threshold

### Low Priority
7. **Type Safety**: Consider TypeScript utility types for variable names
8. **Variable Namespacing**: Consider namespacing to avoid conflicts
9. **Variable History**: Consider tracking variable changes for debugging

## Conclusion

The `def()` method has been thoroughly validated with 30 comprehensive tests covering:
- Core functionality (registration, rendering, proxy behavior)
- Complex scenarios (re-execution, reconciliation, state interactions)
- Edge cases (large values, unicode, many variables)
- Integration with other APIs ($, defMessage, defEffect, defState)

**All tests pass successfully (30/30).** 

The implementation is solid and handles most use cases correctly. The main gaps identified are:
1. Lack of XML entity escaping for special characters in values
2. Lack of variable name validation for XML compliance

These gaps are documented with concrete reproduction steps and recommendations for future improvements.
