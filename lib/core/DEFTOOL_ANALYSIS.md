# defTool Implementation Analysis

## Overview

This document provides a comprehensive analysis of the `defTool` implementation in lmthing, covering execution flow, callback behavior, composite tools, and failure handling.

## Architecture

### Core Components

```
StatefulPrompt.defTool()
    ├── Single Tool Path
    │   ├── _wrapToolExecute() - wraps with callbacks
    │   └── addTool() - registers with AI SDK
    │
    └── Composite Tool Path
        ├── _registerCompositeTool()
        ├── createCompositeSchema() - creates union schema
        ├── buildEnhancedDescription() - documents sub-tools
        └── compositeExecute() - executes sub-tools sequentially
```

### Callback Execution Flow

The callback system is implemented in `src/callbacks/CallbackExecutor.ts`:

```typescript
executeWithCallbacks(execute, input, toolOptions, callbacks?, formatOutput?)
```

#### Execution Order

1. **beforeCall** - Pre-execution hook
   - Receives: `(input, undefined)`
   - If returns `!== undefined`: Short-circuits, skips execution, returns value
   - If returns `undefined`: Continues to execution

2. **execute** - Tool execution
   - Only runs if `beforeCall` returned `undefined`
   - Can throw errors

3. **onSuccess** - Post-execution success hook (if no error)
   - Receives: `(input, output)`
   - If returns `!== undefined`: Replaces output with returned value
   - If returns `undefined`: Uses original output

4. **onError** - Post-execution error hook (if error thrown)
   - Receives: `(input, { error: errorMessage })`
   - If returns `!== undefined`: Replaces error output with returned value
   - If returns `undefined`: Uses original error output `{ error: message }`

5. **formatOutput** - Optional response schema formatting
   - Always applied to final output (success or error)
   - Used for `responseSchema` validation/formatting

### Composite Tool Execution

Composite tools created via `defTool(name, description, [subTools])` have special behavior:

1. **Schema Generation**
   - Creates discriminated union: `z.object({ calls: z.array(z.union([...])) })`
   - Each sub-tool becomes a union variant with `{ name, args }` structure

2. **Sequential Execution**
   - Sub-tools execute in order specified in `calls` array
   - Each sub-tool runs `executeWithCallbacks()` independently
   - Failures in one sub-tool don't stop others

3. **Result Collection**
   - Returns `{ results: Array<{ name, result }> }`
   - Success results and error results both included
   - Unknown sub-tools return `{ error: "Unknown sub-tool: ..." }`

4. **Per-Subtool Callbacks**
   - Each sub-tool can have its own `ToolOptions` (callbacks, responseSchema)
   - Callbacks execute independently for each sub-tool
   - One sub-tool's callback doesn't affect others

### Example Composite Execution

```typescript
// Input from LLM
{
  calls: [
    { name: 'add', args: { a: 1, b: 2 } },
    { name: 'multiply', args: { a: 3, b: 4 } }
  ]
}

// Execution Flow
1. Execute 'add' with callbacks → { sum: 3 }
2. Execute 'multiply' with callbacks → { product: 12 }

// Output
{
  results: [
    { name: 'add', result: { sum: 3 } },
    { name: 'multiply', result: { product: 12 } }
  ]
}
```

## Re-execution and Reconciliation

### Tool Definition Lifecycle

1. **Initial Execution** - First call to prompt function
   - `defTool()` called, tool registered
   - Definition marked in `DefinitionTracker`
   - Proxy returned for use in templates

2. **Step Execution** - Tool may be called by LLM
   - Tool executes with callbacks
   - State may change

3. **Re-execution** - Subsequent steps
   - Prompt function runs again
   - `defTool()` re-registers tool (idempotent)
   - `DefinitionTracker` marks as "seen"
   - Tools not re-registered are removed (reconciliation)

### Reconciliation Process

The `DefinitionTracker` (src/definitions/DefinitionTracker.ts) manages this:

```typescript
// Before re-execution
tracker.prepareReconciliation() // Clear "seen" flags

// During re-execution
defTool('keepThis', ...) // Marks as seen

// After re-execution
tracker.removeUnseenDefinitions(collections) // Removes unseen tools
```

This enables conditional tool registration:

```typescript
const [mode] = defState('mode', 'advanced');

if (mode === 'advanced') {
  defTool('advancedTool', ...); // Only available in advanced mode
}
```

## Proxy Methods (Reminder/Disable)

### Definition Proxy

Every `defTool()` call returns a `DefinitionProxy` with methods:

```typescript
const toolRef = defTool('myTool', ...);

toolRef.value      // '<myTool>' - XML tag
toolRef.toString() // '<myTool>' - for string coercion
toolRef.remind()   // Mark for reminder
toolRef.disable()  // Remove from next step
```

### Reminder Behavior

```typescript
defEffect(() => {
  toolRef.remind();
}, [dependency]);

defEffect(() => {
  const reminded = prompt.getRemindedItems();
  // [{ type: 'defTool', name: 'myTool' }]
}, []);
```

- Must be called within `defEffect` (or before `run()`)
- Tracked in `_remindedItems` array on prompt
- Used to inject reminder messages to LLM

### Disable Behavior

```typescript
defEffect((ctx, stepModifier) => {
  if (ctx.stepNumber > 5) {
    toolRef.disable();
  }
}, []);
```

- Should be called within `defEffect` before step modifications
- Adds to `_definitionsToDisable` set
- Tool removed from next step's available tools
- Re-registered in future re-executions if still in prompt function

## Step Output Structure

### Tool Call in Steps

```typescript
{
  activeTools: ['toolName'],
  input: {
    prompt: [ /* messages */ ]
  },
  output: {
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'myTool',
        input: { /* args transformed from 'args' by AI SDK */ }
      },
      { type: 'text', text: '...' }
    ],
    finishReason: 'tool-calls'
  }
}
```

**Key Points:**
- Tool calls appear in `output.content`
- Arguments are transformed to `input` (not `args`) by AI SDK
- `finishReason` is `'tool-calls'` when tools are invoked

### Tool Result in Steps

```typescript
{
  activeTools: ['toolName'],
  input: {
    prompt: [
      /* ... */,
      {
        role: 'tool',
        content: [ /* tool result */ ]
      }
    ]
  },
  output: { /* next response */ }
}
```

Tool results appear as `role: 'tool'` messages in the next step's input.

### Composite Tool Structure

```typescript
{
  type: 'tool-call',
  toolCallId: 'call_1',
  toolName: 'compositeTool',
  input: {
    calls: [
      { name: 'subTool1', args: { ... } },
      { name: 'subTool2', args: { ... } }
    ]
  }
}
```

Result:
```typescript
{
  role: 'tool',
  content: [{
    type: 'tool-result',
    result: {
      results: [
        { name: 'subTool1', result: { ... } },
        { name: 'subTool2', result: { ... } }
      ]
    }
  }]
}
```

## Failure Handling

### Single Tool Failures

1. **Tool Execution Error**
   ```typescript
   try {
     output = await execute(input, toolOptions);
   } catch (error) {
     errorOutput = { error: error.message };
     if (onError) {
       const result = await onError(input, errorOutput);
       if (result !== undefined) errorOutput = result;
     }
     return formatOutput(errorOutput);
   }
   ```

2. **Callback Chain**
   - Error in `beforeCall`: Propagates (uncaught)
   - Error in `execute`: Caught, triggers `onError`
   - Error in `onSuccess`: Propagates (uncaught)
   - Error in `onError`: Propagates (uncaught)

3. **Response to LLM**
   - Error formatted as `{ error: "message" }`
   - Returned as tool result
   - LLM receives error and can respond

### Composite Tool Failures

Composite tools handle failures gracefully:

```typescript
for (const call of args.calls) {
  const subTool = subTools.find(st => st.name === call.name);
  
  if (!subTool) {
    // Unknown sub-tool
    results.push({
      name: call.name,
      result: { error: `Unknown sub-tool: ${call.name}` }
    });
    continue;
  }

  // Execute with error handling (executeWithCallbacks catches errors)
  const result = await executeWithCallbacks(
    subTool.execute, call.args, options,
    subTool.options, formatOutput
  );
  
  results.push({ name: call.name, result });
}

return { results }; // Always returns, even with errors
```

**Key Behaviors:**
- Unknown sub-tools: Return error in results, continue execution
- Sub-tool execution error: Caught by `executeWithCallbacks`, returned as error, continue execution
- Sub-tool callback error: Propagates but doesn't stop other sub-tools
- Final result always returned with all results (success and error)

## Test Coverage

### Comprehensive Test Suite (src/defTool.test.ts)

The test suite covers:

1. **Single Tool** (8 tests)
   - Basic registration and execution
   - Tools with/without options
   - Error propagation
   - Proxy return value and template usage

2. **Composite Tool** (6 tests)
   - Multi sub-tool registration
   - Sequential execution
   - Unknown sub-tool handling
   - Sub-tool error continuation
   - Per-subtool callbacks
   - Independent error handling

3. **Re-execution and Reconciliation** (3 tests)
   - Tool persistence across steps
   - Conditional reconciliation
   - Dynamic implementation changes

4. **Reminder and Disable** (4 tests)
   - Single and multiple reminders
   - Disable in effects
   - Combined reminder/disable

5. **Step Output Structure** (5 tests)
   - Tool call capture
   - Tool result capture
   - Multiple tool call ordering
   - Composite tool structure
   - Error case capture

6. **Integration Scenarios** (3 tests)
   - Callbacks with multi-step execution
   - Composite tools with state
   - Nested tool calls with state
   - Dynamic re-registration

**Total: 29 comprehensive tests, all passing**

### Existing Tests

Additional coverage in:
- `src/tool-callbacks.test.ts` (17 tests) - Callback behavior deep dive
- `src/callbacks/CallbackExecutor.test.ts` (9 tests) - Unit tests for executor
- `src/composite/CompositeExecutor.test.ts` (3 tests) - Schema generation
- `tests/integration/defTool.test.ts` (3 tests) - Real LLM integration

**Total Coverage: 61 tests across defTool functionality**

## Key Insights

### Callback Short-Circuiting

The `beforeCall` returning `!== undefined` is powerful:

```typescript
defTool('cachedQuery', 'Query with cache', schema, 
  async (args) => expensiveQuery(args),
  {
    beforeCall: async (input) => {
      const cached = cache.get(input.query);
      if (cached) return cached; // Skip execution!
      return undefined; // Proceed to execution
    }
  }
);
```

### Composite Tool Error Resilience

Composite tools are highly resilient:
- One failing sub-tool doesn't stop others
- Unknown sub-tools handled gracefully
- All results (success and error) returned to LLM
- LLM can make informed decisions about failures

### Re-execution Flexibility

The re-execution model enables:
- Conditional tool availability based on state
- Dynamic tool implementation swapping
- Gradual tool introduction/removal
- Context-aware tool sets

### Idempotent Registration

`defTool()` is idempotent - calling multiple times with same name:
- Last registration wins
- Safe for re-execution
- No duplicate tool entries

## Best Practices

1. **Callbacks for Cross-Cutting Concerns**
   - Logging: `beforeCall` + `onSuccess` + `onError`
   - Caching: `beforeCall` (short-circuit)
   - Monitoring: `onSuccess` (metrics)
   - Error handling: `onError` (graceful degradation)

2. **Composite Tools for Related Operations**
   - Group conceptually related tools
   - Enable atomic multi-step operations
   - Simplify LLM tool selection

3. **State-Driven Tool Sets**
   - Use `defState` to control tool availability
   - Match tools to conversation context
   - Reduce LLM cognitive load

4. **Reminder for Important Tools**
   - Remind when tool hasn't been used but should be
   - Combine with state tracking
   - Use sparingly to avoid noise

5. **Disable for Temporary Removal**
   - Remove tools when no longer relevant
   - Keep prompt function simple (tool stays in code)
   - Re-enables automatically when condition changes

## Conclusion

The `defTool` implementation is robust, flexible, and well-tested. Key strengths:

- **Callback system** provides powerful extension points
- **Composite tools** enable complex multi-step operations with excellent error handling
- **Re-execution model** supports dynamic tool sets
- **Proxy methods** enable fine-grained control
- **Comprehensive tests** ensure reliability

The architecture cleanly separates concerns:
- Registration (StatefulPrompt)
- Execution (CallbackExecutor)
- Schema generation (CompositeExecutor)
- Tracking (DefinitionTracker)
- Proxying (DefinitionProxy)

This separation enables maintainability and extensibility while keeping the user-facing API simple and intuitive.
