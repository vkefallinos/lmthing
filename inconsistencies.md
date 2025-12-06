# Documentation Inconsistencies

This document outlines the discrepancies between the README.md documentation and the actual implementation in `src/Prompt.ts` and `src/runPrompt.ts`.

## Critical Inconsistencies

### 1. `runPrompt` Function Signature

**README Documentation:**
```typescript
runPrompt(
  fn: (ctx: PromptContext) => void | Promise<void>,
  config?: RunPromptConfig
): Promise<StreamTextResult>
```

**Actual Implementation (src/runPrompt.ts:34-37):**
```typescript
runPrompt(
  promptFn: (prompt: Prompt) => Promise<void>,
  config: PromptConfig
): Promise<RunPromptResult>
```

**Issues:**
- Parameter name is `prompt`, not `ctx`
- Type is `Prompt`, not `PromptContext` (type doesn't exist)
- The `config` parameter is **required**, not optional
- Return type is `RunPromptResult` (containing both `prompt` and `result`), not just `StreamTextResult`
- The function parameter must return `Promise<void>`, not `void | Promise<void>`

### 2. `runPrompt` Configuration Structure

**README Documentation:**
```typescript
config?: RunPromptConfig
// Shows options like temperature, maxOutputTokens, etc. as direct properties
{
  model: 'openai:gpt-4o',
  temperature: 0.7,
  maxOutputTokens: 1000,
}
```

**Actual Implementation (src/runPrompt.ts:6-10):**
```typescript
interface PromptConfig {
  model: ModelInput;
  options?: Partial<Omit<StreamTextOptions, 'model' | 'system' | 'messages' | 'tools' | 'onFinish' | 'onStepFinish' | 'prepareStep'>>;
}
```

**Issues:**
- Configuration options are nested under `config.options`, not direct properties of `config`
- Only `model` is a direct property; all other streamText options go under `options`
- Correct usage would be: `{ model: 'openai:gpt-4o', options: { temperature: 0.7 } }`

### 3. `defMessage` Function Signature

**README Documentation (line 193-199):**
```typescript
defMessage(name: string, content: string)
// Examples show:
ctx.defMessage('system', 'You are a helpful assistant.');
ctx.defMessage('user', 'Hello!');
ctx.defMessage('assistant', 'Hi there! How can I help?');
```

**Actual Implementation (src/Prompt.ts:38-40):**
```typescript
defMessage(role: 'user' | 'assistant', content: string) {
  this.addMessage({ role, content });
}
```

**Issues:**
- First parameter is named `role`, not `name`
- Only supports `'user'` and `'assistant'` roles, not `'system'` or tool messages as documented
- Documentation claims it supports "all message types: system, user, assistant, and tool messages" but implementation doesn't

### 4. `def` Function Return Behavior

**README Documentation (line 203-212):**
```typescript
const userName = ctx.def('USER_NAME', 'John Doe');
// Can be referenced in prompts using the returned <VARIABLE_NAME> placeholder
ctx.$`Help ${userName} with their question.`;
```

**Actual Implementation (src/Prompt.ts:26-29):**
```typescript
def(name: string, value: string) {
  this.addVariable(name, value, 'string');
  return `<${name}>`;
}
```

**Issues:**
- Implementation returns the placeholder string correctly
- However, using it in template literals would result in literal `<USER_NAME>` text, not a reference
- The README implies these are references that get resolved, but they're just strings

### 5. `defHook` Function Signature

**README Documentation (line 314-357):**
```typescript
defHook(hook: MessageHistoryHook)
// Hook receives messages and returns modified messages:
ctx.defHook((messages) => {
  return messages.filter(msg => msg.role !== 'system');
});
```

**Actual Implementation (src/Prompt.ts:44-52):**
```typescript
defHook(hookFn: (opts: PrepareStepOptions<any> & {variables: Record<string, any>})=>DefHookResult) {
  this.addPrepareStep(({messages, model, steps, stepNumber})=>{
    const updates: DefHookResult = hookFn({ messages, model, steps, stepNumber, variables: this.variables });
    if (updates.variables) {
      this.variables = { ...this.variables, ...updates.variables };
    }
    return updates;
  })
}
```

**Actual `DefHookResult` Interface (src/Prompt.ts:6-11):**
```typescript
interface DefHookResult {
  system ?: string;
  activeTools ?: string[];
  messages ?: any[];
  variables ?: Record<string, any>;
}
```

**Issues:**
- Hook function receives much more than just `messages` - it gets `messages`, `model`, `steps`, `stepNumber`, and `variables`
- Hook must return a `DefHookResult` object with optional properties, not a modified messages array
- The entire API is fundamentally different from what's documented
- README examples would not work with the actual implementation

### 6. `defAgent` Function Parameters

**README Documentation (line 272-312):**
```typescript
defAgent(
  'researcher',
  'Research a topic in depth',
  z.object({ topic: z.string() }),
  async (args, agentCtx) => {
    return agentCtx.$`Research the topic: ${args.topic}`;
  }
)
```

**Actual Implementation (src/Prompt.ts:53-68):**
```typescript
defAgent(
  name: string,
  description: string,
  inputSchema: any,
  execute: Function,
  {model, ...options}: {model?: ModelInput} & any = {}
) {
  this.addTool(name, { description, inputSchema, execute: async (args:any)=>{
    const prompt = new Prompt(model || this.getModel());
    prompt.withOptions(options || this.getOptions());
    await execute({ ...args}, prompt);
    const result = await prompt.run();
    const lastResponse = await result.text;
    return { response: lastResponse, steps: prompt.steps };
  }});
}
```

**Issues:**
- The execute function receives `args` and `prompt`, not `args` and `agentCtx`
- Parameter name `prompt` conflicts with the class name and documentation uses `agentCtx`

### 7. `$()` Template Function Return Value

**README Documentation (line 507-516):**
```typescript
$(strings: TemplateStringsArray, ...values: any[]): string
// "returns the formatted prompt string"
const prompt = ctx.$`
  Please help ${userName} with their question:
  ${userQuestion}
`;
```

**Actual Implementation (src/Prompt.ts:70-75):**
```typescript
$(strings: TemplateStringsArray, ...values: any[]) {
  const content = strings.reduce((acc, str, i) => {
    return acc + str + (values[i] !== undefined ? values[i] : '');
  }, '');
  this.addMessage({ role: 'user', content });
}
```

**Issues:**
- Function returns `void`, not `string`
- It directly adds a user message to the conversation
- Cannot be assigned to a variable as shown in README examples
- The README example with `const prompt = ctx.$\`...\`` would result in `undefined`

## Missing Features

### 8. `defTaskList` Function

**README Documentation (line 359-445):**
Extensively documents `defTaskList(tasks: Task[])` with detailed examples of task validation, sequential execution, and the `extend` function.

**Actual Implementation:**
This function does not exist in `src/Prompt.ts`.

**Impact:**
- All examples and documentation for task-based workflows are non-functional
- This appears to be a planned feature that was documented but not implemented

### 9. `defDynamicTaskList` Function

**README Documentation (line 447-505):**
Documents `defDynamicTaskList()` with tools for creating and managing dynamic tasks.

**Actual Implementation:**
This function does not exist in `src/Prompt.ts`.

**Impact:**
- Another planned but unimplemented feature
- Dynamic task management workflows cannot be used

## Undocumented Features

### 10. `defSystem` Function

**Actual Implementation (src/Prompt.ts:35-37):**
```typescript
defSystem(name: string, value: string) {
  this.addSystemPart(name, value);
}
```

**README Documentation:**
This function is not documented anywhere in the README.

**Issues:**
- Users won't know about this functionality
- The test file (src/Prompt.test.ts:40-41) uses it, suggesting it's an important feature

### 11. `run()` Method

**Actual Implementation (src/Prompt.ts:77-104):**
```typescript
run() {
  this.setLastPrepareStep(()=>{
    // Final preparation before run
    // ... builds system prompt with variables
  });
  return this.execute();
}
```

**README Documentation:**
Never explicitly documented. The README shows `runPrompt` usage but never mentions calling `.run()` directly on a Prompt instance.

**Issues:**
- Advanced users might want to use Prompt directly without `runPrompt`
- The test files show direct usage of `new Prompt()` and `.run()`

## Type Name Inconsistencies

### 12. `PromptContext` vs `Prompt`

**README Documentation:**
Consistently refers to the context object as `PromptContext`:
- "The `PromptContext` object provides the following functions..."
- `fn: (ctx: PromptContext) => ...`

**Actual Implementation:**
The class is named `Prompt`, and there is no type or interface called `PromptContext`.

**Impact:**
- Confusing for users trying to import or reference types
- TypeScript users cannot import `PromptContext` type

### 13. `RunPromptConfig` vs `PromptConfig`

**README Documentation:**
References `RunPromptConfig` type for the configuration parameter.

**Actual Implementation:**
The type is named `PromptConfig` (src/runPrompt.ts:6).

**Impact:**
- Type import confusion for TypeScript users

## Summary

The documentation has significant inconsistencies across multiple areas:

1. **Function signatures** - Parameter names, types, and return values differ
2. **API design** - Key functions like `defHook` have completely different interfaces
3. **Missing features** - Major documented features (`defTaskList`, `defDynamicTaskList`) don't exist
4. **Undocumented features** - Important functions (`defSystem`) are not documented
5. **Type naming** - Documentation uses names that don't exist in code (`PromptContext`, `RunPromptConfig`)
6. **Configuration structure** - The config object structure differs from documentation
7. **Return values** - Several functions return different types than documented

These inconsistencies would prevent users from successfully using the library if following the README documentation.
