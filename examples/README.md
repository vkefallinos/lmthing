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
- **github-models-mock.lmt.mjs** - GitHub Models API structure with mock
- **issues-tasks.lmt.mjs** - Creates a task graph from the issues directory
- **issues-tasks-simple.lmt.mjs** - Creates a simple task list from the issues directory

```bash
npx lmthing run examples/mock-demo.lmt.mjs
npx lmthing run examples/mock-tools.lmt.mjs
npx lmthing run examples/github-models-mock.lmt.mjs
npx lmthing run examples/issues-tasks.lmt.mjs
npx lmthing run examples/issues-tasks-simple.lmt.mjs
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

### GitHub Models API Example (for CI/CD)

This example uses GitHub Models API, which is perfect for testing in CI/CD:

- **github-models.lmt.mjs** - GitHub Models API integration example

```bash
# Configure GitHub Models API
export GITHUB_MODELS_API_KEY=your-github-token
export GITHUB_MODELS_API_BASE=https://models.inference.ai.azure.com
export GITHUB_MODELS_API_TYPE=openai
export GITHUB_MODELS_API_NAME=github

# Run the example
npx lmthing run examples/github-models.lmt.mjs
```

For detailed setup instructions for CI/CD, see [../docs/GITHUB_MODELS_CI.md](../docs/GITHUB_MODELS_CI.md).

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

## Task Management Examples

The `issues-tasks` examples demonstrate how to use task management plugins to organize work:

### issues-tasks.lmt.mjs (Task Graph)

This example reads all markdown files from the `issues/` directory and creates a task graph using `defTaskGraph`. It demonstrates:
- Loading data from files at runtime
- Creating task nodes with dependencies
- Using the task graph plugin for structured work management
- Parsing markdown to extract task information

### issues-tasks-simple.lmt.mjs (Task List)

This example uses `defTaskList` for simpler task tracking without dependencies. It shows:
- A more straightforward task management approach
- How to initialize tasks from external data
- Using `startTask` and `completeTask` tools

Both examples use mock models so they can be run without API keys.
