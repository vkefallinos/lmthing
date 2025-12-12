# Extended `defTaskList` Plan: Context Management & Workflow Orchestration

## Executive Summary

This plan extends the existing `defTaskList` plugin with sophisticated context management, per-task extensions, agent-based compaction, and workflow orchestration capabilities. The design maintains backward compatibility while enabling complex multi-task workflows with intelligent context management.

---

## 1. Context Compaction

### Problem
As tasks complete, conversation history grows unbounded. Long-running task lists exhaust context windows, degrade performance, and increase costs.

### Proposed Solution

**Multi-strategy compaction system with configurable triggers:**

```typescript
defTaskList(tasks, {
  compaction: {
    enabled: true,
    trigger: 'onComplete',      // 'onComplete' | 'onThreshold' | 'manual' | 'batch'
    threshold: 50000,           // Character count threshold for 'onThreshold'
    batchSize: 3,               // Compact every N completed tasks for 'batch'
    strategy: 'moderate',       // 'aggressive' | 'moderate' | 'comprehensive'
    preserve: ['outputs', 'decisions', 'errors']
  }
})
```

**Strategies:**
- **Aggressive**: `"Task X completed: [success/failure]"` - minimal footprint
- **Moderate**: Preserves key outputs, decisions, errors - balanced
- **Comprehensive**: Full reasoning chain compressed - maximum fidelity

**Implementation approach:**
1. Track message ranges per task (startIdx → endIdx)
2. On compaction trigger, replace task messages with summary
3. Store full history in metadata for recovery if needed
4. Use `stepModifier('messages', [...])` to inject compacted history

**Data structure:**
```typescript
interface TaskMessageRange {
  taskId: string;
  startMessageIdx: number;
  endMessageIdx: number;
  summary?: string;
  compacted: boolean;
}
```

---

## 2. Agent-Based Compaction

### Problem
Static summarization loses semantic nuance. Template-based compression can't adapt to task complexity.

### Proposed Solution

**Dedicated summarization agent with configurable model and prompt:**

```typescript
defTaskList(tasks, {
  compaction: {
    agent: {
      model: 'openai:gpt-4o-mini',  // Cheap model for summarization
      systemPrompt: `You are a task summarizer. Extract key outcomes, decisions, and any errors.`,
      outputSchema: z.object({
        summary: z.string(),
        keyOutputs: z.array(z.string()),
        decisions: z.array(z.string()),
        errors: z.array(z.string()).optional()
      })
    }
  }
})
```

**Implementation approach:**
1. When task completes, spawn child `StatefulPrompt` with compaction model
2. Pass task messages to compaction agent
3. Agent generates structured summary
4. Store summary in task metadata
5. Replace original messages with summary on next step

**Flow diagram:**
```
Task Completes
    │
    ├─► Extract task messages
    │
    ├─► Spawn compaction agent (cheap model)
    │   └─► Generate structured summary
    │
    ├─► Store summary in task.metadata.summary
    │
    └─► Replace messages via stepModifier
```

---

## 3. Per-Task Tool Extensions

### Problem
Different tasks require different capabilities. Currently all tools are global.

### Proposed Solution

**Task-scoped tool definitions with inheritance:**

```typescript
import { tool } from 'lmthing';

defTaskList([
  {
    id: 'research',
    name: 'Research the topic',
    tools: [
      tool('webSearch', 'Search the web', z.object({ query: z.string() }), searchFn),
      tool('readUrl', 'Read URL content', z.object({ url: z.string() }), readFn)
    ],
    toolMode: 'extend'  // 'extend' | 'exclusive'
  },
  {
    id: 'code',
    name: 'Write implementation',
    tools: [
      tool('writeFile', 'Write to file', z.object({ path: z.string(), content: z.string() }), writeFn),
      tool('runTests', 'Run test suite', z.object({}), testFn)
    ],
    toolMode: 'exclusive'  // Only these tools available
  }
])
```

**Tool modes:**
- **extend**: Task tools + global tools available
- **exclusive**: Only task-specific tools available

**Implementation approach:**
1. Store task tools in task definition
2. In `defEffect`, when task is `in_progress`:
   - Register task-specific tools
   - Apply `activeTools` filter based on `toolMode`
3. When task completes:
   - Remove task tools from registry
   - Reset `activeTools` filter

---

## 4. Per-Task Variable Extensions

### Problem
Tasks need different context data. Variables are currently global.

### Proposed Solution

**Task-scoped variables with namespace isolation:**

```typescript
defTaskList([
  {
    id: 'translate',
    name: 'Translate document',
    variables: {
      sourceLanguage: 'English',
      targetLanguage: 'Spanish',
      preserveFormatting: true
    }
  },
  {
    id: 'summarize',
    name: 'Summarize content',
    variables: {
      maxLength: 500,
      style: 'bullet-points'
    }
  }
])
```

**Implementation approach:**
1. When task becomes `in_progress`:
   - Inject task variables via `stepModifier('variables', [...])`
   - Variables prefixed or namespaced: `TASK_sourceLanguage` or within `<CURRENT_TASK>` block
2. When task completes:
   - Remove task variables from active set
3. Collision handling: Task variables shadow globals with same name

**System prompt output:**
```xml
<variables>
  <GLOBAL_VAR>value</GLOBAL_VAR>
</variables>
<current_task_context>
  <sourceLanguage>English</sourceLanguage>
  <targetLanguage>Spanish</targetLanguage>
</current_task_context>
```

---

## 5. Per-Task System Prompt Extensions

### Problem
Tasks need different instructions, personas, or constraints.

### Proposed Solution

**Task-scoped system prompt parts:**

```typescript
defTaskList([
  {
    id: 'creative',
    name: 'Write story',
    system: 'Be creative and imaginative. Use vivid language. Explore unconventional ideas.'
  },
  {
    id: 'analysis',
    name: 'Analyze data',
    system: {
      name: 'analysis_rules',
      value: `Be precise and methodical. Format output as JSON.
              Cite all sources. Show confidence levels.`
    }
  },
  {
    id: 'code_review',
    name: 'Review code',
    system: [
      { name: 'reviewer_role', value: 'You are a senior code reviewer.' },
      { name: 'review_criteria', value: 'Focus on: security, performance, readability.' }
    ]
  }
])
```

**Implementation approach:**
1. When task becomes `in_progress`:
   - Inject task system parts via `stepModifier('systems', [...])`
   - System parts appear in `<task_instructions>` section
2. When task completes:
   - Remove task system parts from active set

---

## 6. Custom Agent Per Task

### Problem
Different tasks have different complexity. Simple tasks waste expensive model calls; complex tasks need more capable models.

### Proposed Solution

**Task-level agent configuration with context transfer:**

```typescript
defTaskList([
  {
    id: 'simple',
    name: 'Format document',
    agent: { model: 'openai:gpt-4o-mini' }  // Fast, cheap
  },
  {
    id: 'complex',
    name: 'Analyze legal contract',
    agent: {
      model: 'anthropic:claude-3-5-sonnet',
      options: { temperature: 0.2 }  // More deterministic
    }
  },
  {
    id: 'specialized',
    name: 'Generate code',
    agent: {
      model: 'openai:gpt-4o',
      contextTransfer: 'full',      // 'full' | 'summary' | 'minimal'
      inheritTools: true,
      inheritVariables: ['PROJECT_NAME', 'CODING_STANDARDS']
    }
  }
])
```

**Context transfer modes:**
- **full**: Transfer all messages (expensive but complete)
- **summary**: Transfer compacted history + task variables
- **minimal**: Transfer only task definition and essential context

**Execution flow:**
```
Parent Model
    │
    ├─► startTask('complex') called
    │
    ├─► Create child StatefulPrompt with task agent config
    │   ├─► Transfer context based on contextTransfer mode
    │   ├─► Inject task tools/variables/system
    │   └─► Child.run()
    │
    ├─► Child executes (may call tools)
    │
    ├─► Child completes → extract result
    │
    └─► completeTask() with child's result
        └─► Store result in task.metadata.agentResult
```

**Implementation considerations:**
- Child agent tool calls should work normally
- State changes in child can optionally sync to parent
- Parent sees a "tool result" containing child's final response

---

## 7. Additional Proposed Features

### 7.1 Task Dependencies (DAG)

```typescript
defTaskList([
  { id: '1', name: 'Gather data' },
  { id: '2', name: 'Clean data', dependsOn: ['1'] },
  { id: '3', name: 'Analyze', dependsOn: ['2'] },
  { id: '4', name: 'Visualize', dependsOn: ['2'] },  // Can run parallel with 3
  { id: '5', name: 'Report', dependsOn: ['3', '4'] }
])
```

**Implementation:**
- Build DAG from `dependsOn` relationships
- `startTask` validates all dependencies are completed
- Return available tasks (dependencies met, status pending)

### 7.2 Task Validation & Output Schema

```typescript
defTaskList([
  {
    id: 'extract',
    name: 'Extract entities',
    outputSchema: z.object({
      entities: z.array(z.object({
        name: z.string(),
        type: z.enum(['person', 'org', 'location'])
      }))
    }),
    validate: (output) => output.entities.length > 0
  }
])
```

**Implementation:**
- `completeTask` accepts optional `result` argument
- Validate result against schema
- On validation failure: retry task or mark as failed

### 7.3 Task Retry & Error Handling

```typescript
defTaskList(tasks, {
  errorHandling: {
    onError: 'retry',
    maxRetries: 3,
    backoff: 'exponential',      // Wait 1s, 2s, 4s
    onMaxRetries: 'skip'         // 'skip' | 'fail'
  }
})
```

### 7.4 Progress Callbacks & Observability

```typescript
defTaskList(tasks, {
  callbacks: {
    onTaskStart: (task) => logger.info(`Starting: ${task.name}`),
    onTaskComplete: (task, result) => logger.info(`Done: ${task.name}`),
    onTaskError: (task, error) => logger.error(`Failed: ${task.name}`, error),
    onCompact: (before, after) => logger.debug(`Compacted ${before} → ${after} chars`)
  }
})
```

### 7.5 Conditional Tasks

```typescript
defTaskList([
  { id: 'analyze', name: 'Analyze sentiment' },
  {
    id: 'positive_path',
    name: 'Handle positive feedback',
    condition: (state) => state.taskResults?.analyze?.sentiment === 'positive'
  },
  {
    id: 'negative_path',
    name: 'Handle negative feedback',
    condition: (state) => state.taskResults?.analyze?.sentiment === 'negative'
  }
])
```

### 7.6 Hierarchical Subtasks

```typescript
defTaskList([
  {
    id: 'research',
    name: 'Research phase',
    subtasks: [
      { id: 'research.web', name: 'Web search' },
      { id: 'research.papers', name: 'Academic papers' },
      { id: 'research.synthesize', name: 'Synthesize', dependsOn: ['research.web', 'research.papers'] }
    ],
    completionMode: 'all'  // Complete when all subtasks done
  }
])
```

### 7.7 Checkpointing & Resume

```typescript
const [tasks, setTasks, taskListApi] = defTaskList(tasks, {
  checkpoint: {
    enabled: true,
    storage: 'file',
    path: './checkpoints/session-${sessionId}.json',
    autoSave: true,
    saveInterval: 'onTaskComplete'
  }
});

// Later: resume
const [tasks, setTasks] = defTaskList.restore('./checkpoints/session-123.json');
```

---

## Type System Design

### Extended Task Interface

```typescript
interface ExtendedTask {
  // === Core (existing) ===
  id: string;
  name: string;
  status: TaskStatus;
  metadata?: Record<string, any>;

  // === Per-task extensions ===
  tools?: SubToolDefinition[];
  toolMode?: 'extend' | 'exclusive';
  variables?: Record<string, any>;
  system?: string | SystemPart | SystemPart[];

  // === Custom agent ===
  agent?: {
    model?: ModelInput;
    options?: Record<string, any>;
    contextTransfer?: 'full' | 'summary' | 'minimal';
    inheritTools?: boolean | string[];
    inheritVariables?: boolean | string[];
  };

  // === Workflow ===
  dependsOn?: string[];
  condition?: (state: TaskListState) => boolean;
  subtasks?: ExtendedTask[];
  completionMode?: 'all' | 'any';
  priority?: 'low' | 'normal' | 'high' | 'critical';

  // === Validation ===
  outputSchema?: z.ZodType<any>;
  validate?: (output: any) => boolean | Promise<boolean>;

  // === Runtime (managed internally) ===
  result?: any;
  error?: Error;
  retryCount?: number;
  messageRange?: { start: number; end: number };
  compacted?: boolean;
  summary?: string;
}
```

### Configuration Interface

```typescript
interface ExtendedTaskListConfig {
  // === Compaction ===
  compaction?: {
    enabled?: boolean;
    trigger?: 'onComplete' | 'onThreshold' | 'batch' | 'manual';
    threshold?: number;
    batchSize?: number;
    strategy?: 'aggressive' | 'moderate' | 'comprehensive';
    preserve?: ('outputs' | 'decisions' | 'errors')[];
    agent?: {
      model?: ModelInput;
      systemPrompt?: string;
      outputSchema?: z.ZodType<any>;
    };
  };

  // === Error Handling ===
  errorHandling?: {
    onError?: 'retry' | 'skip' | 'fail';
    maxRetries?: number;
    backoff?: 'none' | 'linear' | 'exponential';
    onMaxRetries?: 'skip' | 'fail';
  };

  // === Callbacks ===
  callbacks?: {
    onTaskStart?: (task: ExtendedTask) => void | Promise<void>;
    onTaskComplete?: (task: ExtendedTask, result: any) => void | Promise<void>;
    onTaskError?: (task: ExtendedTask, error: Error) => void | Promise<void>;
    onTaskSkip?: (task: ExtendedTask, reason: string) => void | Promise<void>;
    onProgress?: (completed: number, total: number, current?: ExtendedTask) => void;
    onCompact?: (taskId: string, originalSize: number, compactedSize: number) => void;
  };

  // === Checkpoint ===
  checkpoint?: {
    enabled?: boolean;
    storage?: 'memory' | 'file' | 'custom';
    path?: string;
    autoSave?: boolean;
    saveInterval?: 'onTaskComplete' | 'onStep' | number;
    onSave?: (state: any) => void | Promise<void>;
    onLoad?: (state: any) => any;
  };
}
```

---

## Implementation Architecture

### New Internal Modules

```
src/plugins/taskList/
├── index.ts              # Main defTaskList export
├── types.ts              # Extended type definitions
├── TaskListManager.ts    # Core task list management
├── ContextCompactor.ts   # Message compaction logic
├── TaskAgent.ts          # Per-task agent execution
├── DependencyResolver.ts # DAG resolution
├── CheckpointManager.ts  # State persistence
└── TaskValidator.ts      # Schema validation
```

### Key Implementation Classes

```typescript
// TaskListManager - orchestrates everything
class TaskListManager {
  private stateManager: StateManager;
  private compactor: ContextCompactor;
  private dependencyResolver: DependencyResolver;
  private checkpointManager: CheckpointManager;

  startTask(taskId: string): Promise<StartTaskResult>;
  completeTask(taskId: string, result?: any): Promise<CompleteTaskResult>;
  getAvailableTasks(): ExtendedTask[];
  compact(taskId?: string): Promise<void>;
}

// ContextCompactor - handles message compaction
class ContextCompactor {
  private agentConfig?: CompactionAgentConfig;

  async compactTask(task: ExtendedTask, messages: Message[]): Promise<string>;
  getCompactedHistory(tasks: ExtendedTask[]): Message[];
}
```

---

## Migration Path

### Phase 1: Non-breaking Extensions
- Add optional `tools`, `variables`, `system` to task interface
- Implement per-task tool/variable/system injection
- No changes to existing API

### Phase 2: Compaction System
- Add `compaction` config option
- Implement static compaction strategies
- Add agent-based compaction

### Phase 3: Advanced Features
- Custom agents per task
- Task dependencies & DAG
- Validation & retry logic

### Phase 4: Workflow Orchestration
- Conditional tasks
- Hierarchical subtasks
- Checkpointing

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context window overflow during compaction agent call | High | Use separate small context for compaction |
| Task agent state desync with parent | Medium | Clear handoff protocol, state merge rules |
| DAG cycles in dependencies | High | Cycle detection at registration time |
| Checkpoint corruption | Medium | Atomic writes, backup before overwrite |
| Tool name collisions | Low | Namespace task tools: `task.{taskId}.{toolName}` |

---

## Open Questions

1. **Compaction granularity**: Should compaction happen per-message or per-task-chunk?
2. **Agent handoff semantics**: Should child agent state changes propagate to parent?
3. **Tool inheritance defaults**: Should `extend` or `exclusive` be the default tool mode?
4. **Checkpoint format**: JSON vs binary for large state serialization?
5. **Priority scheduling**: How should priorities interact with dependencies?

---

## Next Steps

1. Review and refine this plan with stakeholders
2. Prioritize features for Phase 1 implementation
3. Create detailed technical specs for each component
4. Set up test fixtures and mocks for complex scenarios
5. Begin implementation with per-task extensions (simplest, highest value)
