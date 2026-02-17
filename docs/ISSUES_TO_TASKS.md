# Issues to Tasks Implementation

This document describes the implementation that creates tasks from the issues in the `issues/` directory.

## Overview

Two example files have been created that demonstrate how to automatically load markdown files from the `issues/` directory and create task management structures:

1. **`examples/issues-tasks.lmt.mjs`** - Uses `defTaskGraph` for dependency-aware task management
2. **`examples/issues-tasks-simple.lmt.mjs`** - Uses `defTaskList` for simple task tracking

## How It Works

Both examples follow a similar pattern:

### 1. File Loading
The examples use Node.js file system APIs to read all markdown files from the `issues/` directory:

```javascript
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadIssues() {
  const issuesDir = join(__dirname, '..', 'issues');
  const files = await readdir(issuesDir);
  const markdownFiles = files.filter(f => f.endsWith('.md'));
  // ... parse each file
}
```

### 2. Markdown Parsing
Each markdown file is parsed to extract:
- **Title**: The first `#` heading (e.g., "Investigate `def`")
- **Description**: The content under the `## Task` section
- **Checklist items**: Items from `## Required investigation` and `## Acceptance criteria` sections

### 3. Task Creation

#### Task Graph (issues-tasks.lmt.mjs)
Creates a DAG (Directed Acyclic Graph) using `defTaskGraph`:

```javascript
const taskNodes = issues.map(issue => ({
  id: issue.id,
  title: issue.title,
  description: issue.description,
  status: 'pending',
  dependencies: [],
  unblocks: [],
  required_capabilities: ['code-analysis', 'testing', 'mock-models'],
}));

const [graph, setGraph] = defTaskGraph(taskNodes);
```

The task graph provides:
- Automatic dependency management
- Context propagation between tasks
- Tools: `getUnblockedTasks`, `updateTaskStatus`, `generateTaskGraph`

#### Task List (issues-tasks-simple.lmt.mjs)
Creates a simple flat list using `defTaskList`:

```javascript
const tasks = issues.map((issue, index) => ({
  id: String(index + 1),
  name: issue.name,
  status: 'pending',
}));

const [taskList, setTaskList] = defTaskList(tasks);
```

The task list provides:
- Simple sequential task tracking
- Tools: `startTask`, `completeTask`, `failTask`

## Running the Examples

Both examples use mock models and can be run without API keys:

```bash
# Task graph example
npm run script issues-tasks

# Simple task list example
npm run script issues-tasks-simple
```

## Use Cases

These examples demonstrate:
1. **Dynamic task creation** from external data sources
2. **File system integration** in `.lmt.mjs` files
3. **Task management plugins** (`defTaskList` and `defTaskGraph`)
4. **Markdown parsing** for structured content extraction

## Current Issues Loaded

The examples currently load 12 investigation tasks:
1. Investigate `def`
2. Investigate `defAgent`
3. Investigate `defData`
4. Investigate plugin `defEffect`
5. Investigate plugin `defFunction`
6. Investigate plugin `defFunctionAgent`
7. Investigate `defMessage`
8. Investigate `defState`
9. Investigate `defSystem`
10. Investigate plugin `defTaskGraph`
11. Investigate plugin `defTaskList`
12. Investigate `defTool`

Each task represents a thorough investigation of a specific API in the lmthing library.

## Extending the Examples

To adapt these examples for your own use:

1. **Change the data source**: Replace the `loadIssues()` function to load from a different source (API, database, etc.)
2. **Add dependencies**: Modify the task creation to add dependency relationships in the task graph version
3. **Add metadata**: Include additional fields like `assigned_subagent`, `input_context`, or custom metadata
4. **Change the model**: Replace `model: 'mock'` with a real model like `'openai:gpt-4o'` to actually work through the tasks

## Technical Notes

- The examples use ES modules (`import`/`export`)
- File paths are resolved relative to the example file location
- Error handling includes fallback for file system access issues
- Mock responses are provided to demonstrate the expected interaction flow
