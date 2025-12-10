# lmthing Examples

This directory contains example `.lmt.mjs` files that can be run with the lmthing CLI.

## Running Examples

```bash
# Run any example
npx lmthing run examples/<name>.lmt.mjs
```

## Examples

### Mock Examples (no API key required)

These examples use mock models for demonstration and testing:

- **mock-demo.lmt.mjs** - Simple demo showing basic CLI usage
- **mock-tools.lmt.mjs** - Demonstrates tool definition and usage

```bash
npx lmthing run examples/mock-demo.lmt.mjs
npx lmthing run examples/mock-tools.lmt.mjs
```

### Real Model Examples (requires API key)

These examples require an `OPENAI_API_KEY` environment variable:

- **hello.lmt.mjs** - Simple hello world example
- **weather.lmt.mjs** - Weather tool with mock data
- **multi-agent.lmt.mjs** - Multi-agent orchestration
- **data-analysis.lmt.mjs** - Data analysis with structured data

```bash
export OPENAI_API_KEY=your-key-here
npx lmthing run examples/hello.lmt.mjs
```

## File Format

Every `.lmt.mjs` file exports:

1. **default** (required) - An async function that configures the prompt
2. **config** (optional) - Configuration object with model and options

```javascript
// example.lmt.mjs
export default async ({ def, defTool, defSystem, $ }) => {
  defSystem('role', 'You are a helpful assistant.');
  const name = def('NAME', 'World');
  $`Say hello to ${name}`;
};

export const config = {
  model: 'openai:gpt-4o-mini'
};
```

## Available Methods

The prompt function receives these methods:

| Method | Description |
|--------|-------------|
| `def(name, value)` | Define a string variable |
| `defData(name, value)` | Define structured data (YAML-formatted) |
| `defSystem(name, content)` | Add system prompt section |
| `defMessage(role, content)` | Add a message |
| `defTool(name, desc, schema, fn)` | Register a tool |
| `defAgent(name, desc, schema, fn, opts)` | Register a sub-agent |
| `defState(name, initial)` | Create state that persists across re-executions |
| `defEffect(fn, deps)` | Run side effects based on dependencies |
| `$(template)` | Add user message via template literal |
