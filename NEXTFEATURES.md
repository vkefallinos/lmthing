# Next Features: Enhanced Agent Methods for Complex Systems

## Overview

This document proposes additional `def*` methods for the `Prompt` class to enable building sophisticated agentic systems similar to Claude Code. The current foundation provides excellent primitives (`def`, `defData`, `defTool`, `defAgent`, `defHook`), but complex agents need additional capabilities for resource management, workflow orchestration, state persistence, error handling, and user interaction.

## Analysis of Current System

### Existing Methods

1. **`def(name, value)`** - String variables in XML tags
2. **`defData(name, value)`** - YAML-serialized structured data
3. **`defSystem(name, value)`** - System prompt parts
4. **`defMessage(role, content)`** - Conversation messages
5. **`defTool(name, description, schema, execute)`** - Tool registration
6. **`defAgent(name, description, schema, execute, options)`** - Sub-agent creation
7. **`defHook(hookFn)`** - PrepareStep lifecycle hooks

### Gaps for Complex Agents

Building agents like Claude Code requires:

- **Resource Management**: File systems, APIs, databases, shell access
- **Workflow Orchestration**: Multi-step processes with branching, loops, parallel execution
- **State & Memory**: Persistent state, conversation history, learned patterns
- **Error Handling**: Retry logic, fallback strategies, circuit breakers
- **User Interaction**: Approval gates, confirmations, clarifications
- **Context Management**: Sliding windows, summarization, relevance filtering
- **Validation & Guards**: Pre/post conditions, output validation, safety checks
- **Observability**: Metrics, logging, tracing, debugging
- **Optimization**: Caching, batching, resource pooling
- **Conditional Logic**: Guards, switches, decision trees

## Proposed Methods

### 1. Resource Management

#### `defResource(name, type, config)`

Define reusable resources (files, APIs, databases) that tools can access. Resources are initialized once and shared across tool executions.

```typescript
interface ResourceConfig {
  initialize?: () => Promise<any>;
  cleanup?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
  retryPolicy?: RetryPolicy;
}

// Example: File system resource
ctx.defResource('fileSystem', 'filesystem', {
  initialize: async () => ({
    rootPath: process.cwd(),
    permissions: { read: true, write: true }
  }),
  healthCheck: async () => {
    return fs.existsSync(process.cwd());
  }
});

// Example: Database connection
ctx.defResource('database', 'postgres', {
  initialize: async () => {
    return new Pool({
      host: 'localhost',
      database: 'mydb',
      max: 20
    });
  },
  cleanup: async (pool) => {
    await pool.end();
  }
});

// Tools can then access resources via context
ctx.defTool('readFile', 'Read a file', schema, async (args, { resources }) => {
  const fs = resources.get('fileSystem');
  return await fs.readFile(args.path);
});
```

**Implementation Notes:**
- Resources initialized lazily on first access
- Automatic cleanup on prompt completion
- Health checks for connection resilience
- Resource pooling for efficiency

---

#### `defResourcePool(name, factory, poolConfig)`

Create a pool of reusable resources for concurrent operations.

```typescript
ctx.defResourcePool('httpClients',
  () => new HttpClient({ timeout: 5000 }),
  { min: 2, max: 10, acquireTimeout: 1000 }
);
```

---

### 2. Workflow & Orchestration

#### `defWorkflow(name, steps, config)`

Define complex multi-step workflows with conditional branching, loops, and error handling.

```typescript
interface WorkflowStep {
  id: string;
  action: (ctx: WorkflowContext) => Promise<any>;
  condition?: (ctx: WorkflowContext) => boolean;
  onSuccess?: string; // Next step ID
  onError?: string;   // Error handler step ID
  retries?: number;
  timeout?: number;
}

ctx.defWorkflow('codeReview', [
  {
    id: 'analyze',
    action: async (wctx) => {
      return await wctx.runAgent('codeAnalyzer', { files: wctx.state.files });
    },
    onSuccess: 'checkQuality',
    onError: 'reportError'
  },
  {
    id: 'checkQuality',
    condition: (wctx) => wctx.results.analyze.score < 7,
    action: async (wctx) => {
      return await wctx.runTool('suggestImprovements', wctx.results.analyze);
    },
    onSuccess: 'applyFixes',
    onError: 'requestHumanReview'
  },
  {
    id: 'applyFixes',
    action: async (wctx) => {
      return await wctx.runTool('applyPatches', wctx.results.checkQuality);
    },
    retries: 3,
    timeout: 30000
  }
], { maxDuration: 300000 });
```

**Features:**
- Conditional branching based on step results
- Loop support for iterative refinement
- Timeout and retry configuration per step
- Automatic state management across steps
- Error propagation and handling

---

#### `defPipeline(name, stages)`

Create linear data transformation pipelines.

```typescript
ctx.defPipeline('documentProcessor', [
  { stage: 'extract', fn: extractText },
  { stage: 'clean', fn: cleanText },
  { stage: 'chunk', fn: chunkText },
  { stage: 'embed', fn: generateEmbeddings },
  { stage: 'store', fn: storeInVectorDB }
]);

// Execute pipeline
await ctx.executePipeline('documentProcessor', { file: 'doc.pdf' });
```

---

#### `defParallel(name, tasks, options)`

Execute multiple operations in parallel with result aggregation.

```typescript
ctx.defParallel('multiModelConsensus', {
  gpt4: async () => runWithModel('gpt-4o', prompt),
  claude: async () => runWithModel('claude-3-5-sonnet', prompt),
  gemini: async () => runWithModel('gemini-1.5-pro', prompt)
}, {
  aggregation: 'consensus', // or 'all', 'first', 'majority'
  timeout: 60000,
  minSuccess: 2 // At least 2 must succeed
});
```

---

### 3. State & Memory Management

#### `defState(name, initialValue, options)`

Define persistent state that survives across prompt executions.

```typescript
interface StateOptions {
  persist?: boolean;          // Save to disk/database
  scope?: 'session' | 'global' | 'agent';
  ttl?: number;              // Time to live in ms
  serialize?: (val: any) => string;
  deserialize?: (str: string) => any;
}

ctx.defState('userPreferences', {
  language: 'typescript',
  frameworks: ['react', 'nextjs'],
  codeStyle: 'functional'
}, {
  persist: true,
  scope: 'session'
});

// Access and modify state
ctx.getState('userPreferences').codeStyle = 'imperative';
await ctx.saveState('userPreferences');
```

**Use Cases:**
- User preferences and settings
- Learned patterns from past interactions
- Progress tracking for long-running tasks
- Conversation history summaries

---

#### `defMemory(name, type, config)`

Advanced memory systems with semantic search and retrieval.

```typescript
ctx.defMemory('conversationHistory', 'vector', {
  maxSize: 1000,
  embeddingModel: 'text-embedding-3-small',
  similarityThreshold: 0.8,
  dimensions: 1536
});

// Store and retrieve memories
await ctx.memory('conversationHistory').store({
  content: 'User prefers functional programming',
  metadata: { timestamp: Date.now(), importance: 0.9 }
});

// Semantic search
const relevant = await ctx.memory('conversationHistory').search(
  'What are user preferences?',
  { limit: 5 }
);
```

**Memory Types:**
- `vector`: Semantic similarity search
- `graph`: Relationship-based retrieval
- `temporal`: Time-based access patterns
- `hierarchical`: Multi-level summarization

---

#### `defContext(name, strategy, config)`

Define context window management strategies.

```typescript
ctx.defContext('mainContext', 'sliding-window', {
  maxTokens: 8000,
  reserveTokens: 2000, // Reserve for response
  prioritize: ['system', 'recent'],
  summarization: {
    trigger: 0.8, // Summarize at 80% capacity
    ratio: 0.5    // Compress to 50%
  }
});

ctx.defContext('taskContext', 'relevance-based', {
  maxTokens: 4000,
  relevanceScorer: (msg, currentTask) => calculateRelevance(msg, currentTask),
  keepMinimum: 3 // Always keep at least 3 messages
});
```

**Strategies:**
- `sliding-window`: Keep most recent N tokens
- `relevance-based`: Keep most relevant messages
- `hierarchical`: Multi-level summarization
- `hybrid`: Combine multiple strategies

---

### 4. Validation & Constraints

#### `defValidator(name, schema, validator)`

Define validators for tool outputs, agent responses, or user inputs.

```typescript
ctx.defValidator('codeOutput',
  z.object({
    code: z.string(),
    language: z.string()
  }),
  async (output) => {
    // Syntax validation
    const parsed = await parseCode(output.code, output.language);
    if (parsed.errors.length > 0) {
      return {
        valid: false,
        errors: parsed.errors,
        fix: 'Check syntax and try again'
      };
    }

    // Security validation
    if (containsDangerousPatterns(output.code)) {
      return {
        valid: false,
        errors: ['Code contains potentially dangerous patterns'],
        severity: 'critical'
      };
    }

    return { valid: true };
  }
);

// Attach validator to tool
ctx.defTool('generateCode', 'Generate code', schema, executor, {
  validator: 'codeOutput',
  retryOnFailure: true,
  maxRetries: 3
});
```

---

#### `defConstraint(name, type, config)`

Define execution constraints (budget, time, rate limits).

```typescript
// Token budget constraint
ctx.defConstraint('tokenBudget', 'tokens', {
  max: 100000,
  warn: 80000,
  onExceeded: 'stop', // or 'warn', 'summarize'
  tracking: ['input', 'output', 'embeddings']
});

// Time limit constraint
ctx.defConstraint('timeLimit', 'duration', {
  max: 300000, // 5 minutes
  onExceeded: 'graceful-stop'
});

// Rate limit constraint
ctx.defConstraint('apiRateLimit', 'rate', {
  requests: 100,
  period: 60000, // per minute
  strategy: 'sliding-window'
});

// Check constraints before execution
await ctx.checkConstraints(); // Throws if violated
```

---

#### `defGuard(name, condition, action)`

Define guard conditions that must be met before execution.

```typescript
ctx.defGuard('requireAuth',
  (ctx) => ctx.state.authenticated === true,
  {
    onFail: 'throw', // or 'skip', 'redirect'
    message: 'Authentication required'
  }
);

ctx.defGuard('safeMode',
  (ctx) => ctx.state.dangerousOperationsEnabled === false,
  {
    onFail: 'prompt-user',
    tools: ['fileDelete', 'databaseDrop']
  }
);

// Apply guards to specific operations
ctx.defTool('deleteFile', 'Delete a file', schema, executor, {
  guards: ['requireAuth', 'safeMode']
});
```

---

### 5. User Interaction

#### `defApproval(name, config)`

Define approval gates that require user confirmation before proceeding.

```typescript
ctx.defApproval('destructiveOperation', {
  message: (context) =>
    `About to delete ${context.fileCount} files. Proceed?`,
  options: ['approve', 'deny', 'modify'],
  timeout: 30000,
  defaultAction: 'deny',
  showPreview: true
});

// Use in tool
ctx.defTool('bulkDelete', 'Delete multiple files', schema, async (args) => {
  const approval = await ctx.requestApproval('destructiveOperation', {
    fileCount: args.files.length,
    files: args.files
  });

  if (approval.action === 'deny') {
    return 'Operation cancelled by user';
  }

  if (approval.action === 'modify') {
    args.files = approval.modifiedData.files;
  }

  return await performDeletion(args.files);
});
```

---

#### `defInteraction(name, type, config)`

Define interactive prompts for user input during execution.

```typescript
ctx.defInteraction('askClarification', 'question', {
  prompt: (context) => context.question,
  validation: z.string().min(1),
  timeout: 60000,
  allowSkip: false
});

ctx.defInteraction('selectOption', 'choice', {
  options: (context) => context.availableOptions,
  multiple: false,
  default: 0
});

// Use in agent
async function myAgent(args, ctx) {
  const unclear = await analyzeUserRequest(args.request);

  if (unclear.needsClarification) {
    const answer = await ctx.interact('askClarification', {
      question: unclear.question
    });
    args.clarification = answer;
  }

  return ctx.$`Process request with clarification: ${args.clarification}`;
}
```

---

### 6. Error Handling & Resilience

#### `defFallback(name, strategy, config)`

Define fallback strategies for error handling.

```typescript
ctx.defFallback('modelFailure', 'cascade', {
  cascade: [
    { model: 'openai:gpt-4o' },
    { model: 'anthropic:claude-3-5-sonnet' },
    { model: 'google:gemini-1.5-pro' }
  ],
  retryDelay: 1000,
  maxAttempts: 3
});

ctx.defFallback('toolError', 'alternative', {
  alternatives: {
    'searchAPI': ['searchBackup', 'searchCache'],
    'generateCode': ['codeTemplate', 'askUser']
  }
});

ctx.defFallback('dataError', 'default', {
  defaultValue: null,
  logError: true
});
```

---

#### `defRetry(name, config)`

Define retry policies for transient failures.

```typescript
ctx.defRetry('networkRetry', {
  maxAttempts: 5,
  backoff: 'exponential', // or 'linear', 'constant'
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
});

ctx.defTool('fetchAPI', 'Fetch from API', schema, executor, {
  retry: 'networkRetry'
});
```

---

#### `defCircuitBreaker(name, config)`

Implement circuit breaker pattern to prevent cascading failures.

```typescript
ctx.defCircuitBreaker('externalAPI', {
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 60000,      // Try again after 1 minute
  halfOpenRequests: 3,      // Test with 3 requests
  states: ['closed', 'open', 'half-open']
});

ctx.defTool('callExternalAPI', 'Call external API', schema,
  async (args) => {
    return await ctx.circuitBreaker('externalAPI').execute(
      () => fetch(args.url)
    );
  }
);
```

---

### 7. Observability & Debugging

#### `defMetric(name, type, config)`

Define metrics to track during execution.

```typescript
ctx.defMetric('tokenUsage', 'counter', {
  labels: ['model', 'operation'],
  aggregation: 'sum'
});

ctx.defMetric('latency', 'histogram', {
  labels: ['tool', 'status'],
  buckets: [10, 50, 100, 500, 1000, 5000]
});

ctx.defMetric('successRate', 'gauge', {
  labels: ['agent']
});

// Automatic recording in hooks
ctx.defHook(({ stepNumber, messages }) => {
  ctx.recordMetric('tokenUsage', calculateTokens(messages), {
    model: 'gpt-4',
    operation: 'step'
  });
  return {};
});
```

---

#### `defTracing(name, config)`

Enable distributed tracing for complex agent systems.

```typescript
ctx.defTracing('mainTrace', {
  serviceName: 'my-agent',
  exporters: ['console', 'jaeger'],
  sampling: 1.0, // 100% sampling
  attributes: {
    environment: 'production',
    version: '1.0.0'
  }
});

// Automatic span creation
ctx.defTool('complexOperation', 'Complex operation', schema,
  async (args, { trace }) => {
    const span = trace.startSpan('database-query');
    try {
      const result = await db.query(args.sql);
      span.setAttribute('rows', result.length);
      return result;
    } finally {
      span.end();
    }
  }
);
```

---

#### `defLogger(name, config)`

Configure structured logging.

```typescript
ctx.defLogger('appLogger', {
  level: 'info',
  format: 'json',
  outputs: ['console', 'file'],
  fields: {
    service: 'my-agent',
    version: '1.0.0'
  },
  redact: ['apiKey', 'password']
});

// Use in tools and hooks
ctx.logger.info('Starting code analysis', {
  files: 10,
  language: 'typescript'
});
```

---

### 8. Optimization & Caching

#### `defCache(name, strategy, config)`

Define caching strategies for expensive operations.

```typescript
ctx.defCache('responseCache', 'lru', {
  maxSize: 1000,
  ttl: 3600000, // 1 hour
  keyGenerator: (args) => JSON.stringify(args),
  storage: 'memory' // or 'redis', 'file'
});

ctx.defCache('embeddingCache', 'persistent', {
  storage: 'redis',
  keyPrefix: 'embeddings:',
  compression: true
});

// Use with tools
ctx.defTool('embedText', 'Generate embeddings', schema, executor, {
  cache: 'embeddingCache'
});
```

---

#### `defBatcher(name, config)`

Batch multiple requests for efficiency.

```typescript
ctx.defBatcher('embeddingBatcher', {
  maxSize: 100,
  maxWait: 100, // ms
  processor: async (batch) => {
    return await generateEmbeddings(batch.map(b => b.text));
  }
});

// Transparent batching
const embedding = await ctx.batch('embeddingBatcher', { text: 'hello' });
```

---

### 9. Templates & Reusability

#### `defTemplate(name, template, variables)`

Define reusable prompt templates with variable substitution.

```typescript
ctx.defTemplate('codeReviewTemplate', `
Analyze the following {{language}} code for:
- Code quality (1-10): {{qualityFocus}}
- Security issues: {{securityLevel}}
- Performance: {{performanceCheck}}

Code:
{{code}}

Provide detailed feedback.
`, {
  language: { type: 'string', default: 'typescript' },
  qualityFocus: { type: 'number', default: 7 },
  securityLevel: { type: 'enum', values: ['basic', 'strict'], default: 'basic' },
  performanceCheck: { type: 'boolean', default: true }
});

// Use template
ctx.useTemplate('codeReviewTemplate', {
  code: sourceCode,
  securityLevel: 'strict'
});
```

---

#### `defRole(name, config)`

Define agent roles with specific capabilities and constraints.

```typescript
ctx.defRole('seniorDeveloper', {
  capabilities: ['code-review', 'architecture-design', 'mentoring'],
  constraints: {
    maxTokens: 100000,
    allowedTools: ['readFile', 'analyzeCode', 'suggestRefactoring']
  },
  personality: {
    tone: 'professional',
    verbosity: 'detailed',
    teachingStyle: 'socratic'
  },
  systemPrompt: `You are a senior software engineer...`
});

ctx.defRole('juniorDeveloper', {
  capabilities: ['code-implementation', 'testing'],
  constraints: {
    maxTokens: 50000,
    requiresApproval: ['deployCode', 'modifyDatabase']
  }
});

// Apply role
ctx.assumeRole('seniorDeveloper');
```

---

### 10. Event System

#### `defEvent(name, handler)`

Define event handlers for specific triggers.

```typescript
ctx.defEvent('onToolStart', async (event) => {
  console.log(`Starting tool: ${event.toolName}`);
  ctx.recordMetric('toolExecution', 1, { tool: event.toolName });
});

ctx.defEvent('onError', async (event) => {
  await ctx.logger.error('Error occurred', {
    error: event.error,
    context: event.context
  });

  if (event.error.severity === 'critical') {
    await ctx.requestHumanIntervention(event);
  }
});

ctx.defEvent('onTokenThreshold', async (event) => {
  if (event.usage > event.threshold * 0.9) {
    await ctx.summarizeContext();
  }
});

// Emit custom events
ctx.emit('customEvent', { data: 'value' });
```

---

### 11. Plugin System

#### `defPlugin(name, plugin)`

Register plugins that extend prompt functionality.

```typescript
interface Plugin {
  name: string;
  version: string;
  install: (ctx: Prompt) => void | Promise<void>;
  uninstall?: (ctx: Prompt) => void | Promise<void>;
}

const loggingPlugin: Plugin = {
  name: 'logging',
  version: '1.0.0',
  install: async (ctx) => {
    ctx.defLogger('plugin-logger', { level: 'debug' });

    ctx.defHook(({ messages, stepNumber }) => {
      ctx.logger.debug('Step executed', { stepNumber, messageCount: messages.length });
      return {};
    });
  }
};

ctx.defPlugin('logging', loggingPlugin);
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

1. **Resource Management**
   - `defResource` - Basic resource registration
   - `defResourcePool` - Connection pooling
   - Automatic lifecycle management

2. **State & Memory**
   - `defState` - Simple state persistence
   - `defContext` - Basic sliding window
   - Session vs global scope

3. **Validation**
   - `defValidator` - Output validation
   - `defConstraint` - Token budgets, time limits
   - Integration with existing tools

### Phase 2: Workflows & Resilience (Weeks 4-6)

4. **Workflow Orchestration**
   - `defWorkflow` - Multi-step workflows
   - `defPipeline` - Linear pipelines
   - `defParallel` - Parallel execution

5. **Error Handling**
   - `defFallback` - Fallback strategies
   - `defRetry` - Retry policies
   - `defCircuitBreaker` - Circuit breaker pattern

6. **Guards & Approval**
   - `defGuard` - Pre-execution guards
   - `defApproval` - User confirmation
   - `defInteraction` - Interactive prompts

### Phase 3: Observability & Optimization (Weeks 7-9)

7. **Observability**
   - `defMetric` - Metrics tracking
   - `defTracing` - Distributed tracing
   - `defLogger` - Structured logging

8. **Optimization**
   - `defCache` - Multi-level caching
   - `defBatcher` - Request batching
   - Performance profiling

9. **Advanced Memory**
   - `defMemory` - Vector-based memory
   - Semantic search
   - Hierarchical summarization

### Phase 4: Developer Experience (Weeks 10-12)

10. **Templates & Roles**
    - `defTemplate` - Reusable templates
    - `defRole` - Agent roles
    - Template composition

11. **Event System**
    - `defEvent` - Event handlers
    - Event propagation
    - Custom event types

12. **Plugin System**
    - `defPlugin` - Plugin registration
    - Plugin lifecycle
    - Plugin marketplace foundation

## Integration Examples

### Example 1: Claude Code-like Agent

```typescript
import { runPrompt } from 'lmthing';

const result = await runPrompt(async (ctx) => {
  // Setup resources
  ctx.defResource('fileSystem', 'fs', {
    initialize: async () => ({ root: process.cwd() })
  });

  // Define constraints
  ctx.defConstraint('tokenBudget', 'tokens', { max: 200000 });
  ctx.defConstraint('timeLimit', 'duration', { max: 600000 });

  // Context management
  ctx.defContext('mainContext', 'sliding-window', {
    maxTokens: 128000,
    prioritize: ['system', 'recent'],
    summarization: { trigger: 0.8, ratio: 0.5 }
  });

  // State persistence
  ctx.defState('sessionState', {
    filesModified: [],
    tasksCompleted: [],
    userPreferences: {}
  }, { persist: true, scope: 'session' });

  // Define approval gate for destructive operations
  ctx.defApproval('destructiveOp', {
    message: (ctx) => `About to modify ${ctx.files.length} files. Continue?`,
    timeout: 30000
  });

  // File operations with validation
  ctx.defTool('writeFile', 'Write to file',
    z.object({ path: z.string(), content: z.string() }),
    async (args, { resources }) => {
      const fs = resources.get('fileSystem');
      await fs.writeFile(args.path, args.content);
      return { success: true };
    },
    {
      guards: ['safeMode'],
      validator: 'fileOutput',
      cache: 'fileCache'
    }
  );

  // Code analysis agent
  ctx.defAgent('codeAnalyzer', 'Analyze code quality',
    z.object({ files: z.array(z.string()) }),
    async (args, agentCtx) => {
      agentCtx.assumeRole('seniorDeveloper');
      return agentCtx.$`Analyze code quality for: ${args.files.join(', ')}`;
    },
    {
      model: 'openai:gpt-4o',
      retry: 'networkRetry',
      fallback: 'modelFailure'
    }
  );

  // Multi-step workflow
  ctx.defWorkflow('codeReviewWorkflow', [
    {
      id: 'analyze',
      action: async (wctx) => wctx.runAgent('codeAnalyzer', { files: wctx.state.files })
    },
    {
      id: 'requestApproval',
      condition: (wctx) => wctx.results.analyze.changesNeeded,
      action: async (wctx) => wctx.requestApproval('destructiveOp', wctx.results.analyze)
    },
    {
      id: 'applyChanges',
      action: async (wctx) => wctx.runTool('writeFile', wctx.results.analyze.changes)
    }
  ]);

  // Metrics and observability
  ctx.defMetric('filesProcessed', 'counter');
  ctx.defLogger('agentLogger', { level: 'info', format: 'json' });

  // Event handlers
  ctx.defEvent('onToolStart', async (e) => {
    ctx.logger.info(`Tool started: ${e.toolName}`);
  });

  ctx.defEvent('onError', async (e) => {
    ctx.logger.error('Error', { error: e.error });
  });

  // Main prompt
  ctx.$`Help me review and improve the codebase in the current directory.`;

}, {
  model: 'anthropic:claude-3-5-sonnet',
  temperature: 0.7
});
```

### Example 2: Multi-Agent Research System

```typescript
const result = await runPrompt(async (ctx) => {
  // Memory for cross-agent knowledge sharing
  ctx.defMemory('sharedKnowledge', 'vector', {
    maxSize: 10000,
    embeddingModel: 'text-embedding-3-small'
  });

  // Define specialist agents
  ctx.defAgent('researcher', 'Research specialist',
    z.object({ topic: z.string() }),
    async (args, agentCtx) => {
      agentCtx.assumeRole('researcher');
      agentCtx.defCache('searchCache', 'lru', { maxSize: 100 });
      return agentCtx.$`Research: ${args.topic}`;
    }
  );

  ctx.defAgent('synthesizer', 'Synthesis specialist',
    z.object({ findings: z.array(z.string()) }),
    async (args, agentCtx) => {
      agentCtx.assumeRole('synthesizer');
      return agentCtx.$`Synthesize findings: ${args.findings.join('\n')}`;
    }
  );

  // Parallel execution with consensus
  ctx.defParallel('multiResearch', {
    web: () => ctx.runAgent('researcher', { topic: 'web sources' }),
    academic: () => ctx.runAgent('researcher', { topic: 'academic papers' }),
    patents: () => ctx.runAgent('researcher', { topic: 'patents' })
  }, {
    aggregation: 'all',
    timeout: 120000
  });

  // Pipeline for processing
  ctx.defPipeline('researchPipeline', [
    { stage: 'gather', fn: (input) => ctx.executeParallel('multiResearch', input) },
    { stage: 'deduplicate', fn: deduplicateFindings },
    { stage: 'synthesize', fn: (findings) => ctx.runAgent('synthesizer', { findings }) },
    { stage: 'store', fn: (synthesis) => ctx.memory('sharedKnowledge').store(synthesis) }
  ]);

  ctx.$`Research the topic: "Future of AI Agents"`;

}, { model: 'openai:gpt-4o' });
```

## Benefits

### For Developers

1. **Declarative API**: Express complex agent behaviors declaratively
2. **Composability**: Mix and match features as needed
3. **Type Safety**: Full TypeScript support with inference
4. **Reusability**: Share resources, templates, and plugins
5. **Debugging**: Built-in observability and tracing

### For Agent Systems

1. **Reliability**: Retry, fallback, and circuit breaker patterns
2. **Efficiency**: Caching, batching, and resource pooling
3. **Safety**: Validation, guards, and approval gates
4. **Scalability**: Parallel execution and workflow orchestration
5. **Maintainability**: Clear structure and separation of concerns

### For Production

1. **Monitoring**: Metrics, logging, and tracing
2. **Resource Management**: Constraints and limits
3. **Error Handling**: Graceful degradation
4. **User Control**: Approval gates and interactions
5. **State Persistence**: Recovery from failures

## Backward Compatibility

All existing methods remain unchanged. New methods are additive and optional. Migration path:

1. **Phase 1**: Start using new methods alongside existing ones
2. **Phase 2**: Gradually adopt patterns (workflows, caching, etc.)
3. **Phase 3**: Leverage advanced features (plugins, distributed tracing)

No breaking changes to existing APIs.

## Conclusion

These proposed `def*` methods transform `lmthing` from a prompt building library into a comprehensive framework for building production-ready agentic systems. Each method addresses specific needs identified in complex agents like Claude Code:

- **Resource & State Management**: Long-running agents need persistent state
- **Workflow Orchestration**: Complex tasks require multi-step coordination
- **Error Resilience**: Production systems need robust error handling
- **User Interaction**: Agents must collaborate with humans
- **Observability**: Teams need visibility into agent behavior
- **Optimization**: Real-world usage requires caching and batching
- **Safety**: Production agents need validation and guards

The phased implementation ensures incremental value delivery while maintaining the library's simplicity and ease of use.

---

*This document is a living proposal. Feedback and suggestions are welcome.*
