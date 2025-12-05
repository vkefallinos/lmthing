# Next Features: Additional `def*` Methods for Complex Agent Development

This document proposes new `def*` methods for the `Prompt` class to enable building sophisticated agents like Claude Code. These methods are designed to integrate seamlessly with the existing architecture built on the Vercel AI SDK's `streamText`.

---

## Current `def*` Methods Summary

| Method | Purpose |
|--------|---------|
| `def(name, value)` | Define string variables (XML-wrapped in system prompt) |
| `defData(name, value)` | Define structured data as YAML |
| `defSystem(name, part)` | Add named system prompt sections |
| `defMessage(role, content)` | Add conversation messages |
| `defTool(name, desc, schema, fn)` | Register executable tools |
| `defHook(fn)` | Add prepareStep hooks for dynamic behavior |
| `defAgent(name, desc, schema, fn, opts)` | Register sub-agents as tools |

---

## Proposed New `def*` Methods

### 1. Context & File Management

#### `defFile(name, path, options?)`
Define a file reference that can be read, watched, and included in context.

```typescript
defFile(
  name: string,
  path: string,
  options?: {
    watch?: boolean;           // Re-read on changes
    lazy?: boolean;            // Load on first access
    maxLines?: number;         // Limit lines included
    lineRange?: [number, number]; // Specific line range
    encoding?: string;
  }
): string // Returns <FILE_NAME> placeholder

// Usage
const readme = prompt.defFile('README', './README.md');
const config = prompt.defFile('CONFIG', './config.json', { lazy: true });
prompt.$`Analyze ${readme} and update ${config} accordingly.`;
```

**Implementation notes:**
- Returns placeholder like `<README>` that expands to file contents
- Integrates with `defHook` to refresh file contents between steps
- Supports binary files via base64 encoding for images

---

#### `defFiles(name, pattern, options?)`
Define multiple files via glob pattern for codebase exploration.

```typescript
defFiles(
  name: string,
  pattern: string | string[],
  options?: {
    ignore?: string[];
    maxFiles?: number;
    maxTotalSize?: number;
    includeMetadata?: boolean; // Include file stats
  }
): string // Returns <FILES_NAME> placeholder

// Usage
const sources = prompt.defFiles('SOURCES', 'src/**/*.ts', {
  ignore: ['**/*.test.ts'],
  maxFiles: 50
});
prompt.$`Review the following source files: ${sources}`;
```

---

#### `defDirectory(name, path, options?)`
Define a directory structure for navigation context.

```typescript
defDirectory(
  name: string,
  path: string,
  options?: {
    depth?: number;
    showHidden?: boolean;
    showSize?: boolean;
    showModified?: boolean;
    filter?: (entry: DirEntry) => boolean;
  }
): string

// Usage
const projectStructure = prompt.defDirectory('PROJECT', './', { depth: 3 });
prompt.$`Here is the project structure: ${projectStructure}`;
```

---

### 2. Execution & Shell Integration

#### `defShell(name, options?)`
Define a shell execution environment with safety controls.

```typescript
defShell(
  name: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    maxOutputSize?: number;
    allowedCommands?: string[];    // Whitelist
    blockedCommands?: string[];    // Blacklist
    requireApproval?: boolean;     // Human-in-the-loop
    sandbox?: boolean;             // Run in sandbox
  }
): void // Registers shell-related tools

// Usage
prompt.defShell('terminal', {
  cwd: '/home/user/project',
  timeout: 30000,
  blockedCommands: ['rm -rf', 'sudo'],
  requireApproval: true
});

// Auto-registers tools: runCommand, getOutput, killProcess
```

**Automatically registered tools:**
- `terminal_run`: Execute a command
- `terminal_background`: Run command in background
- `terminal_output`: Get output from background process
- `terminal_kill`: Kill a running process

---

#### `defScript(name, script, options?)`
Define a reusable script that can be executed by the agent.

```typescript
defScript(
  name: string,
  script: string | (() => Promise<string>),
  options?: {
    interpreter?: 'bash' | 'node' | 'python' | 'deno';
    args?: string[];
    env?: Record<string, string>;
    timeout?: number;
  }
): void // Registers as a tool

// Usage
prompt.defScript('build', 'npm run build && npm test', {
  interpreter: 'bash',
  timeout: 120000
});

prompt.defScript('analyze', async () => {
  // Dynamic script generation
  return `eslint ${await getChangedFiles()}`;
});
```

---

### 3. State & Memory Management

#### `defState(name, initialValue, options?)`
Define reactive state that persists across steps and can trigger hooks.

```typescript
defState<T>(
  name: string,
  initialValue: T,
  options?: {
    persist?: boolean;           // Persist to storage
    onChange?: (newVal: T, oldVal: T) => void;
    validate?: (value: T) => boolean;
    serialize?: (value: T) => string;
    deserialize?: (str: string) => T;
  }
): { get: () => T; set: (value: T) => void; update: (fn: (v: T) => T) => void }

// Usage
const taskState = prompt.defState('tasks', {
  completed: [],
  pending: ['task1', 'task2']
}, { persist: true });

prompt.defHook(({ stepNumber }) => {
  const state = taskState.get();
  return {
    system: `Completed: ${state.completed.length}, Pending: ${state.pending.length}`
  };
});
```

---

#### `defMemory(name, options?)`
Define a semantic memory store for long-term context retrieval.

```typescript
defMemory(
  name: string,
  options?: {
    backend?: 'local' | 'vector' | MemoryBackend;
    maxItems?: number;
    ttl?: number;                 // Time-to-live in ms
    embedModel?: string;          // For vector search
    autoSummarize?: boolean;      // Summarize old entries
  }
): Memory

interface Memory {
  store(key: string, value: any, metadata?: Record<string, any>): Promise<void>;
  retrieve(key: string): Promise<any>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  forget(key: string): Promise<void>;
  summarize(): Promise<string>;
}

// Usage
const memory = prompt.defMemory('conversation', {
  backend: 'vector',
  maxItems: 1000,
  autoSummarize: true
});

prompt.defTool('remember', 'Store information for later',
  z.object({ key: z.string(), value: z.string() }),
  async ({ key, value }) => {
    await memory.store(key, value);
    return 'Remembered';
  }
);
```

---

#### `defCheckpoint(name, options?)`
Define save/restore points for agent state.

```typescript
defCheckpoint(
  name: string,
  options?: {
    autoSave?: boolean;           // Auto-save after each step
    maxCheckpoints?: number;
    storage?: 'memory' | 'file' | Storage;
  }
): Checkpoint

interface Checkpoint {
  save(label?: string): Promise<string>; // Returns checkpoint ID
  restore(id: string): Promise<void>;
  list(): Promise<CheckpointInfo[]>;
  diff(id1: string, id2: string): Promise<StateDiff>;
}

// Usage
const checkpoint = prompt.defCheckpoint('workflow', { autoSave: true });

prompt.defTool('saveProgress', 'Save current progress',
  z.object({ label: z.string() }),
  async ({ label }) => checkpoint.save(label)
);
```

---

### 4. Control Flow & Orchestration

#### `defGate(name, condition, options?)`
Define conditional gates that control agent flow.

```typescript
defGate(
  name: string,
  condition: (ctx: GateContext) => boolean | Promise<boolean>,
  options?: {
    onBlocked?: (ctx: GateContext) => void;
    retryAfter?: number;
    maxRetries?: number;
    fallback?: () => any;
  }
): void

// Usage
prompt.defGate('userApproval', async (ctx) => {
  const response = await askUser(`Approve action: ${ctx.pendingAction}?`);
  return response === 'yes';
}, {
  onBlocked: (ctx) => console.log('User denied:', ctx.pendingAction)
});

prompt.defGate('rateLimit', (ctx) => {
  return ctx.stepNumber < 100;
}, {
  fallback: () => ({ error: 'Rate limit exceeded' })
});
```

---

#### `defPipeline(name, stages, options?)`
Define a multi-stage pipeline with validation between stages.

```typescript
defPipeline(
  name: string,
  stages: PipelineStage[],
  options?: {
    parallel?: boolean;
    stopOnError?: boolean;
    retryFailed?: boolean;
  }
): void

interface PipelineStage {
  name: string;
  agent?: string;               // Sub-agent to use
  validate?: (result: any) => boolean | string;
  transform?: (result: any) => any;
  onError?: (error: Error) => any;
}

// Usage
prompt.defPipeline('codeReview', [
  {
    name: 'analyze',
    agent: 'codeAnalyzer',
    validate: (r) => r.issues !== undefined
  },
  {
    name: 'suggest',
    agent: 'suggestionAgent',
    transform: (r) => ({ issues: r.issues, context: r.context })
  },
  {
    name: 'apply',
    agent: 'codeEditor',
    validate: (r) => r.success === true
  }
]);
```

---

#### `defLoop(name, options)`
Define iterative loops with termination conditions.

```typescript
defLoop(
  name: string,
  options: {
    maxIterations: number;
    until?: (ctx: LoopContext) => boolean;
    onIteration?: (ctx: LoopContext) => void;
    between?: () => Promise<void>;  // Run between iterations
  }
): void

// Usage
prompt.defLoop('refinement', {
  maxIterations: 5,
  until: (ctx) => ctx.lastResult?.quality > 0.95,
  onIteration: (ctx) => console.log(`Iteration ${ctx.iteration}`)
});
```

---

#### `defBranch(name, router, branches)`
Define conditional branching based on context or model output.

```typescript
defBranch(
  name: string,
  router: (ctx: BranchContext) => string,
  branches: Record<string, BranchHandler>
): void

// Usage
prompt.defBranch('taskRouter',
  (ctx) => {
    if (ctx.lastMessage.includes('code')) return 'coding';
    if (ctx.lastMessage.includes('explain')) return 'explanation';
    return 'general';
  },
  {
    coding: { agent: 'codeAgent', tools: ['editFile', 'runTests'] },
    explanation: { agent: 'explainerAgent', tools: ['search'] },
    general: { tools: ['search', 'calculate'] }
  }
);
```

---

### 5. Output & Streaming

#### `defOutput(name, schema, options?)`
Define structured output with validation and streaming support.

```typescript
defOutput<T>(
  name: string,
  schema: z.ZodSchema<T>,
  options?: {
    stream?: boolean;             // Stream partial results
    validate?: boolean;           // Validate on completion
    transform?: (raw: any) => T;
    onPartial?: (partial: Partial<T>) => void;
  }
): void

// Usage
prompt.defOutput('analysis', z.object({
  summary: z.string(),
  issues: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high']),
    description: z.string(),
    file: z.string(),
    line: z.number()
  })),
  score: z.number().min(0).max(100)
}), {
  stream: true,
  onPartial: (partial) => {
    if (partial.issues) {
      renderIssues(partial.issues);
    }
  }
});
```

---

#### `defRenderer(name, handler)`
Define custom rendering for tool outputs and agent responses.

```typescript
defRenderer(
  name: string,
  handler: (output: any, context: RenderContext) => string | void
): void

// Usage
prompt.defRenderer('codeBlock', (output, ctx) => {
  if (output.language && output.code) {
    return `\`\`\`${output.language}\n${output.code}\n\`\`\``;
  }
});

prompt.defRenderer('progressBar', (output, ctx) => {
  const { current, total } = output;
  const pct = Math.round((current / total) * 100);
  const bar = '█'.repeat(pct / 5) + '░'.repeat(20 - pct / 5);
  return `[${bar}] ${pct}%`;
});
```

---

#### `defStream(name, options?)`
Define streaming behavior for long-running operations.

```typescript
defStream(
  name: string,
  options?: {
    chunkSize?: number;
    throttle?: number;           // ms between chunks
    onChunk?: (chunk: string) => void;
    transform?: (chunk: string) => string;
    buffer?: boolean;            // Buffer output
  }
): StreamController

// Usage
const stream = prompt.defStream('output', {
  throttle: 50,
  onChunk: (chunk) => process.stdout.write(chunk)
});
```

---

### 6. Safety & Permissions

#### `defPermission(name, config)`
Define permission boundaries for tools and actions.

```typescript
defPermission(
  name: string,
  config: {
    tools?: string[];             // Allowed tools
    paths?: string[];             // Allowed file paths (glob)
    commands?: string[];          // Allowed shell commands
    networks?: string[];          // Allowed network hosts
    require?: PermissionCheck;    // Custom check function
  }
): void

type PermissionCheck = (action: Action) => boolean | Promise<boolean>;

// Usage
prompt.defPermission('sandbox', {
  tools: ['readFile', 'search', 'calculate'],
  paths: ['./src/**', './tests/**'],
  commands: ['npm test', 'npm run lint'],
  networks: ['api.example.com']
});

prompt.defPermission('elevated', {
  require: async (action) => {
    return await askUserApproval(action);
  }
});
```

---

#### `defSanitizer(name, handler)`
Define input/output sanitization rules.

```typescript
defSanitizer(
  name: string,
  handler: {
    input?: (content: string) => string;
    output?: (content: string) => string;
    tool?: (name: string, args: any) => any;
  }
): void

// Usage
prompt.defSanitizer('secrets', {
  input: (content) => content.replace(/API_KEY=\w+/g, 'API_KEY=***'),
  output: (content) => content.replace(/Bearer \w+/g, 'Bearer ***'),
  tool: (name, args) => {
    if (name === 'runCommand' && args.command.includes('password')) {
      throw new Error('Command contains sensitive data');
    }
    return args;
  }
});
```

---

#### `defRateLimit(name, config)`
Define rate limiting for tool calls and API requests.

```typescript
defRateLimit(
  name: string,
  config: {
    maxCalls?: number;
    window?: number;              // Time window in ms
    perTool?: Record<string, number>;
    onLimit?: (tool: string) => void;
    queue?: boolean;              // Queue excess calls
  }
): void

// Usage
prompt.defRateLimit('api', {
  maxCalls: 100,
  window: 60000,  // 1 minute
  perTool: {
    'searchWeb': 10,
    'callApi': 50
  },
  queue: true
});
```

---

### 7. Error Handling & Recovery

#### `defFallback(name, config)`
Define fallback behavior for tool failures.

```typescript
defFallback(
  name: string,
  config: {
    tools?: Record<string, FallbackHandler>;
    default?: FallbackHandler;
    maxRetries?: number;
    backoff?: 'linear' | 'exponential' | number[];
  }
): void

type FallbackHandler =
  | string                        // Alternative tool name
  | ((error: Error, args: any) => any)
  | { retry: boolean; delay?: number };

// Usage
prompt.defFallback('resilient', {
  tools: {
    'searchWeb': async (error, args) => {
      // Fallback to cached results
      return getCachedResults(args.query);
    },
    'callApi': 'callApiBackup'    // Use backup tool
  },
  default: { retry: true, delay: 1000 },
  maxRetries: 3,
  backoff: 'exponential'
});
```

---

#### `defRecovery(name, handler)`
Define recovery strategies for agent errors.

```typescript
defRecovery(
  name: string,
  handler: (error: Error, context: RecoveryContext) => RecoveryAction
): void

type RecoveryAction =
  | { action: 'retry'; delay?: number }
  | { action: 'skip'; result?: any }
  | { action: 'abort'; message?: string }
  | { action: 'rollback'; checkpointId?: string }
  | { action: 'escalate'; to?: string };

// Usage
prompt.defRecovery('smart', (error, ctx) => {
  if (error.message.includes('rate limit')) {
    return { action: 'retry', delay: 5000 };
  }
  if (error.message.includes('not found')) {
    return { action: 'skip', result: null };
  }
  if (ctx.retryCount > 3) {
    return { action: 'escalate', to: 'humanOperator' };
  }
  return { action: 'retry' };
});
```

---

### 8. Parallel Execution

#### `defParallel(name, agents, options?)`
Define parallel agent execution with result aggregation.

```typescript
defParallel(
  name: string,
  agents: string[] | ParallelAgent[],
  options?: {
    merge?: 'concat' | 'first' | 'vote' | MergeFunction;
    timeout?: number;
    failFast?: boolean;           // Fail if any agent fails
    minSuccess?: number;          // Minimum successful agents
  }
): void

// Usage
prompt.defParallel('multiReview', ['reviewer1', 'reviewer2', 'reviewer3'], {
  merge: 'vote',
  timeout: 30000,
  minSuccess: 2
});

prompt.defParallel('gather', [
  { agent: 'webSearcher', weight: 1 },
  { agent: 'docSearcher', weight: 2 },
  { agent: 'codeSearcher', weight: 1.5 }
], {
  merge: (results) => {
    // Custom weighted merge
    return results.sort((a, b) => b.weight * b.score - a.weight * a.score);
  }
});
```

---

#### `defPool(name, config)`
Define an agent pool for load balancing.

```typescript
defPool(
  name: string,
  config: {
    agents: string[] | AgentFactory;
    size?: number;
    strategy?: 'round-robin' | 'least-busy' | 'random';
    healthCheck?: () => Promise<boolean>;
    scaleUp?: (load: number) => number;
    scaleDown?: (load: number) => number;
  }
): Pool

// Usage
const workerPool = prompt.defPool('workers', {
  agents: ['worker1', 'worker2', 'worker3'],
  strategy: 'least-busy',
  scaleUp: (load) => load > 0.8 ? 1 : 0,
  scaleDown: (load) => load < 0.2 ? 1 : 0
});
```

---

### 9. Context Management

#### `defContext(name, provider)`
Define dynamic context providers that inject information at runtime.

```typescript
defContext(
  name: string,
  provider: () => string | Promise<string>,
  options?: {
    cache?: boolean;
    ttl?: number;
    position?: 'start' | 'end' | 'before-tools';
  }
): void

// Usage
prompt.defContext('time', () => {
  return `Current time: ${new Date().toISOString()}`;
}, { cache: false });

prompt.defContext('gitStatus', async () => {
  const status = await exec('git status --short');
  return `Git status:\n${status}`;
}, { ttl: 5000 });

prompt.defContext('userPrefs', async () => {
  const prefs = await loadUserPreferences();
  return yaml.dump(prefs);
}, { cache: true });
```

---

#### `defWindow(name, config)`
Define a sliding context window for managing large conversations.

```typescript
defWindow(
  name: string,
  config: {
    maxTokens?: number;
    maxMessages?: number;
    preserve?: {
      system?: boolean;
      first?: number;             // Keep first N messages
      last?: number;              // Keep last N messages
      important?: (msg: Message) => boolean;
    };
    summarize?: boolean | SummarizeConfig;
    onTruncate?: (removed: Message[]) => void;
  }
): void

// Usage
prompt.defWindow('conversation', {
  maxTokens: 100000,
  preserve: {
    system: true,
    first: 2,
    last: 20,
    important: (msg) => msg.metadata?.pinned === true
  },
  summarize: {
    model: 'haiku',
    maxLength: 500
  }
});
```

---

#### `defTemplate(name, template, schema?)`
Define reusable prompt templates with type-safe variables.

```typescript
defTemplate<T extends Record<string, z.ZodType>>(
  name: string,
  template: string,
  schema?: T
): (vars: z.infer<z.ZodObject<T>>) => string

// Usage
const codeReviewTemplate = prompt.defTemplate('codeReview', `
Review the following code changes:

<files>
{{files}}
</files>

Focus on:
{{#each focusAreas}}
- {{this}}
{{/each}}

Severity threshold: {{severity}}
`, {
  files: z.string(),
  focusAreas: z.array(z.string()),
  severity: z.enum(['low', 'medium', 'high'])
});

// Use the template
prompt.$`${codeReviewTemplate({
  files: diffContent,
  focusAreas: ['security', 'performance'],
  severity: 'medium'
})}`;
```

---

### 10. Events & Observability

#### `defEvent(name, handler)`
Define event handlers for agent lifecycle events.

```typescript
defEvent(
  name: AgentEvent,
  handler: (data: EventData) => void | Promise<void>
): void

type AgentEvent =
  | 'step:start' | 'step:end'
  | 'tool:call' | 'tool:result' | 'tool:error'
  | 'agent:spawn' | 'agent:complete'
  | 'message:user' | 'message:assistant'
  | 'token:generated'
  | 'context:overflow'
  | 'error:*';

// Usage
prompt.defEvent('tool:call', ({ tool, args }) => {
  logger.info(`Calling tool ${tool}`, args);
});

prompt.defEvent('step:end', async ({ stepNumber, result }) => {
  await metrics.record('step_completed', { step: stepNumber });
});

prompt.defEvent('error:*', ({ error, context }) => {
  errorTracker.capture(error, context);
});
```

---

#### `defMetric(name, config)`
Define custom metrics for monitoring.

```typescript
defMetric(
  name: string,
  config: {
    type: 'counter' | 'gauge' | 'histogram' | 'summary';
    labels?: string[];
    buckets?: number[];           // For histograms
    onCollect?: () => number;     // For gauges
  }
): Metric

// Usage
const toolLatency = prompt.defMetric('tool_latency_ms', {
  type: 'histogram',
  labels: ['tool_name'],
  buckets: [10, 50, 100, 500, 1000, 5000]
});

prompt.defEvent('tool:result', ({ tool, duration }) => {
  toolLatency.observe(duration, { tool_name: tool });
});
```

---

#### `defTrace(name, options?)`
Define distributed tracing for debugging complex workflows.

```typescript
defTrace(
  name: string,
  options?: {
    sampler?: number | ((ctx: TraceContext) => boolean);
    exporter?: TraceExporter;
    propagate?: boolean;
    attributes?: Record<string, any>;
  }
): Tracer

// Usage
const tracer = prompt.defTrace('workflow', {
  sampler: 0.1,  // 10% sampling
  exporter: new JaegerExporter({ endpoint: 'http://jaeger:14268' })
});

prompt.defHook(({ stepNumber }) => {
  const span = tracer.startSpan(`step-${stepNumber}`);
  return {
    onComplete: () => span.end()
  };
});
```

---

## Integration Example: Building a Claude Code-like Agent

```typescript
import { runPrompt } from 'lmthing';
import { z } from 'zod';

const { result } = await runPrompt(async (p) => {
  // System identity
  p.defSystem('identity', 'You are Claude Code, an AI coding assistant.');
  p.defSystem('capabilities', `
    You can read and write files, execute commands, search codebases,
    and help with software development tasks.
  `);

  // Context providers
  p.defContext('cwd', () => `Working directory: ${process.cwd()}`);
  p.defContext('gitBranch', async () => {
    const branch = await exec('git branch --show-current');
    return `Current branch: ${branch}`;
  });

  // File system tools
  p.defFile('package', './package.json');
  p.defDirectory('structure', './', { depth: 2 });

  // Shell with safety controls
  p.defShell('bash', {
    blockedCommands: ['rm -rf /', 'sudo rm'],
    requireApproval: (cmd) => cmd.includes('sudo'),
    timeout: 30000
  });

  // State management
  const tasks = p.defState('tasks', { todo: [], done: [] }, { persist: true });

  // Memory for context
  p.defMemory('projectContext', {
    backend: 'vector',
    autoSummarize: true
  });

  // Context window management
  p.defWindow('conversation', {
    maxTokens: 150000,
    summarize: true
  });

  // Error recovery
  p.defRecovery('graceful', (error, ctx) => {
    if (error.message.includes('file not found')) {
      return { action: 'skip', result: 'File does not exist' };
    }
    return { action: 'retry', delay: 1000 };
  });

  // Observability
  p.defEvent('tool:call', ({ tool, args }) => {
    console.log(`[${tool}]`, JSON.stringify(args));
  });

  // Sub-agents for specialized tasks
  p.defAgent('codeReviewer', 'Reviews code for issues',
    z.object({ files: z.array(z.string()) }),
    async (args, agent) => {
      agent.defSystem('role', 'Expert code reviewer');
      for (const file of args.files) {
        agent.defFile(file, file);
      }
      agent.$`Review these files for bugs, security issues, and improvements.`;
    },
    { model: 'sonnet' }
  );

  p.defAgent('testWriter', 'Writes tests for code',
    z.object({ file: z.string(), framework: z.string() }),
    async ({ file, framework }, agent) => {
      agent.defFile('source', file);
      agent.$`Write comprehensive ${framework} tests for this file.`;
    },
    { model: 'sonnet' }
  );

  // Start conversation
  p.$`Hello! I'm ready to help with your coding tasks.`;

}, { model: 'opus' });
```

---

## Implementation Priority

### Phase 1: Core Foundations
1. `defFile` / `defFiles` / `defDirectory` - Essential for code agents
2. `defShell` / `defScript` - Command execution
3. `defState` - State management
4. `defPermission` - Safety controls

### Phase 2: Advanced Flow Control
5. `defContext` / `defWindow` - Context management
6. `defFallback` / `defRecovery` - Error handling
7. `defGate` - Flow control
8. `defTemplate` - Reusable prompts

### Phase 3: Multi-Agent & Observability
9. `defParallel` / `defPool` - Concurrent execution
10. `defPipeline` / `defLoop` / `defBranch` - Orchestration
11. `defEvent` / `defMetric` / `defTrace` - Observability
12. `defMemory` / `defCheckpoint` - Long-term state

### Phase 4: Polish
13. `defOutput` / `defRenderer` / `defStream` - Output control
14. `defSanitizer` / `defRateLimit` - Safety refinements

---

## Design Principles

1. **Composable**: Each `def*` method is independent but integrates with the hook system
2. **Type-safe**: Full TypeScript support with Zod schema integration
3. **Streaming-first**: All methods support the streaming architecture
4. **Non-breaking**: Additions to the API, existing methods unchanged
5. **Minimal overhead**: Lazy evaluation where possible
6. **Testable**: Each method can be unit tested in isolation

---

## Next Steps

1. Review and prioritize based on community feedback
2. Create detailed implementation specs for Phase 1
3. Design the hook integration points
4. Build prototype implementations
5. Write comprehensive tests
6. Document with real-world examples
