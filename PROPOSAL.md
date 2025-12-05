# lmthing API Extension Proposal

## Executive Summary

This proposal outlines a comprehensive plan to extend the `lmthing` library into a powerful, flexible framework for creating complex agentic systems. The current foundation provides excellent abstractions for prompt building, streaming, and tool integration. With the proposed extensions, `lmthing` will become a full-featured framework enabling developers to build sophisticated AI agent systems with ease.

## Current State Analysis

### Strengths
- **Clean Architecture**: Well-structured with clear separation of concerns between `StreamText`, `Prompt`, and `runPrompt`
- **Streaming First**: Built on streaming principles with comprehensive step tracking
- **Type Safety**: Excellent TypeScript integration with full type support
- **Extensible Design**: Hook system allows for custom behavior injection
- **Agent Support**: Basic agent nesting through `defAgent()`
- **Comprehensive Testing**: Excellent test coverage with sophisticated mocking utilities

### Current Limitations
- **Single Entry Point**: `index.ts` is empty, limiting library exports
- **Minimal State Management**: No persistent state or memory system
- **Limited Agent Coordination**: No native support for agent teams, voting, or consensus mechanisms
- **No Plugin System**: Extensions require direct modifications
- **Limited Error Handling**: No structured error recovery or retry mechanisms
- **No Performance Monitoring**: Lack of built-in metrics and observability
- **Missing Concurrency Primitives**: No support for parallel agent execution

## Proposed Extensions

### 1. Core API Enhancements

#### 1.1 Agent System Architecture

```typescript
// Agent identity and capabilities
interface AgentIdentity {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  version?: string;
}

// Agent runtime system
class AgentRuntime {
  register(agent: AgentDefinition): void;
  unregister(agentId: string): void;
  get(agentId: string): AgentDefinition | undefined;
  list(filter?: AgentFilter): AgentDefinition[];
  execute(id: string, input: any): Promise<AgentResult>;
}

// Enhanced agent definition
class Agent extends Prompt {
  constructor(
    identity: AgentIdentity,
    model: LanguageModel,
    config?: AgentConfig
  );

  // Lifecycle hooks
  onCreate(): void | Promise<void>;
  onStart(input: any): void | Promise<void>;
  onStep(step: AgentStep): void | Promise<void>;
  onFinish(result: AgentResult): void | Promise<void>;
  onError(error: Error, context: ExecutionContext): void | Promise<void>;
}
```

#### 1.2 Multi-Agent Patterns

```typescript
// Agent teams and orchestration
class AgentTeam {
  addAgent(agent: Agent): void;
  removeAgent(agentId: string): void;

  // Orchestration patterns
  sequential(input: any): Promise<TeamResult>;
  parallel(input: any): Promise<TeamResult[]>;
  hierarchical(rootAgent: Agent, input: any): Promise<TeamResult>;

  // Decision patterns
  consensus(input: any, strategy: ConsensusStrategy): Promise<TeamResult>;
  vote(input: any, options: VoteOptions): Promise<VoteResult>;
  debate(input: any, rounds: number): Promise<DebateResult>;
}

// Specialized agent types
class AgentPool {
  agents: Map<string, Agent>;
  select(criteria: SelectionCriteria): Agent[];
  execute(criteria: SelectionCriteria, input: any): Promise<AgentResult>;
}

class SwarmAgent extends Agent {
  // Swarm intelligence patterns
  pheromoneTrails: Map<string, number>;
  coordinate(swarm: SwarmAgent[], input: any): Promise<SwarmResult>;
}
```

#### 1.3 Memory and State Management

```typescript
// Memory interfaces
interface Memory {
  store(key: string, value: any, ttl?: number): Promise<void>;
  retrieve(key: string): Promise<any>;
  search(query: MemoryQuery): Promise<MemoryEntry[]>;
  clear(): Promise<void>;
}

// Enhanced prompt with memory
class PromptWithMemory extends Prompt {
  memory: Memory;
  contextWindow: number;

  remember(key: string, value: any): this;
  recall(query: string): Promise<MemoryEntry[]>;
  forget(key: string): this;
  summarize(): Promise<string>;
}

// Persistent state management
class AgentState {
  storage: StateStorage;
  state: Map<string, any>;

  get(path: string): any;
  set(path: string, value: any): void;
  merge(path: string, value: any): void;
  persist(): Promise<void>;
  load(): Promise<void>;
}
```

#### 1.4 Plugin System

```typescript
// Plugin architecture
interface Plugin {
  name: string;
  version: string;
  install(context: PluginContext): void;
  uninstall(context: PluginContext): void;
}

class PluginManager {
  plugins: Map<string, Plugin>;

  install(plugin: Plugin): void;
  uninstall(pluginName: string): void;
  execute(hookName: string, ...args: any[]): Promise<any[]>;
}

// Built-in plugins
class LoggingPlugin implements Plugin {
  logger: Logger;
  install(context: PluginContext): void;
}

class MetricsPlugin implements Plugin {
  collector: MetricsCollector;
  install(context: PluginContext): void;
}

class CachePlugin implements Plugin {
  cache: Cache;
  install(context: PluginContext): void;
}
```

### 2. Enhanced Tool System

#### 2.1 Advanced Tool Definitions

```typescript
// Enhanced tool with validation and lifecycle
class Tool<TInput = any, TOutput = any> {
  schema: ZodSchema<TInput>;
  executor: ToolExecutor<TInput, TOutput>;

  // Tool metadata
  metadata: ToolMetadata;

  // Lifecycle hooks
  beforeExecute?(input: TInput): Promise<TInput> | TInput;
  afterExecute?(output: TOutput): Promise<TOutput> | TOutput;
  onError?(error: Error, input: TInput): Promise<TOutput> | void;

  // Validation and transformation
  validate(input: unknown): TInput;
  transform(output: TOutput): TOutput;
}

// Composite tools
class ToolChain {
  tools: Tool[];
  execute(input: any): Promise<any>;
}

class ConditionalTool {
  condition: (input: any) => boolean;
  trueTool: Tool;
  falseTool?: Tool;
  execute(input: any): Promise<any>;
}

class ParallelTools {
  tools: Tool[];
  execute(input: any): Promise<any[]>;
}
```

#### 2.2 Tool Registry and Discovery

```typescript
class ToolRegistry {
  tools: Map<string, Tool>;

  register(tool: Tool): void;
  unregister(toolName: string): void;
  get(toolName: string): Tool | undefined;
  search(query: ToolQuery): Tool[];

  // Dynamic tool loading
  loadFromDirectory(path: string): Promise<void>;
  loadFromModule(moduleName: string): Promise<void>;
}

// Built-in tool categories
class BuiltinTools {
  static fileSystem: FileSystemTools;
  static http: HttpTools;
  static database: DatabaseTools;
  static dateTime: DateTimeTools;
  static textProcessing: TextProcessingTools;
  static dataAnalysis: DataAnalysisTools;
}
```

### 3. Streaming and Event System

#### 3.1 Enhanced Streaming

```typescript
// Multi-stream coordination
class StreamCoordinator {
  streams: Map<string, ReadableStream>;

  merge(streams: ReadableStream[]): ReadableStream;
  fork(stream: ReadableStream, count: number): ReadableStream[];
  zip(streams: ReadableStream[]): ReadableStream;
}

// Event-driven architecture
class EventBus {
  listeners: Map<string, EventListener[]>;

  on(event: string, listener: EventListener): void;
  off(event: string, listener: EventListener): void;
  emit(event: string, data: any): Promise<void>;
}

// Stream events
interface StreamEvent {
  type: 'start' | 'data' | 'error' | 'finish' | 'step' | 'tool';
  timestamp: Date;
  data: any;
  metadata?: any;
}
```

#### 3.2 Reactive Extensions

```typescript
// Reactive stream processing
class ReactiveStream<T> {
  source: ReadableStream<T>;

  map<U>(fn: (value: T) => U): ReactiveStream<U>;
  filter(predicate: (value: T) => boolean): ReactiveStream<T>;
  reduce<U>(fn: (acc: U, value: T) => U, initial: U): ReactiveStream<U>;
  merge(other: ReactiveStream<T>): ReactiveStream<T>;
  zip<U>(other: ReactiveStream<U>): ReactiveStream<[T, U]>;

  // Backpressure handling
  buffer(strategy: BufferStrategy): ReactiveStream<T>;
  throttle(duration: number): ReactiveStream<T>;
  debounce(duration: number): ReactiveStream<T>;
}
```

### 4. Error Handling and Resilience

#### 4.1 Structured Error Handling

```typescript
// Error classification and recovery
class ErrorClassifier {
  classify(error: Error): ErrorType;
  getRecoveryStrategy(errorType: ErrorType): RecoveryStrategy;
}

// Retry mechanisms
class RetryPolicy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoff: BackoffStrategy;

  shouldRetry(attempt: number, error: Error): boolean;
  getDelay(attempt: number): number;
}

// Circuit breaker pattern
class CircuitBreaker {
  state: 'closed' | 'open' | 'half-open';
  failureThreshold: number;
  timeout: number;

  execute<T>(fn: () => Promise<T>): Promise<T>;
}
```

#### 4.2 Validation and Sanitization

```typescript
// Input validation pipeline
class ValidationPipeline {
  validators: Validator[];

  add(validator: Validator): this;
  validate(input: any): ValidationResult;
  sanitize(input: any): any;
}

// Content safety and moderation
class ContentModerator {
  rules: ModerationRule[];

  moderate(content: string): Promise<ModerationResult>;
  filter(content: string): Promise<string>;
}
```

### 5. Performance and Observability

#### 5.1 Metrics and Monitoring

```typescript
// Metrics collection
class MetricsCollector {
  counters: Map<string, Counter>;
  gauges: Map<string, Gauge>;
  histograms: Map<string, Histogram>;

  increment(name: string, value?: number, tags?: Tags): void;
  set(name: string, value: number, tags?: Tags): void;
  observe(name: string, value: number, tags?: Tags): void;
}

// Performance profiling
class Profiler {
  profiles: Map<string, Profile>;

  start(name: string): Profile;
  stop(profile: Profile): ProfileSnapshot;

  // Execution tracing
  trace<T>(name: string, fn: () => Promise<T>): Promise<T>;
}
```

#### 5.2 Caching and Optimization

```typescript
// Multi-level caching
class CacheManager {
  levels: CacheLevel[];

  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;

  // Cache strategies
  lru(): LRUCache;
  lfu(): LFUCache;
  ttl(ttl: number): TTLCache;
}

// Request optimization
class RequestOptimizer {
  batchRequests: BatchRequest[];

  batch(requests: Request[]): Promise<Response[]>;
  deduplicate(requests: Request[]): Request[];
  prioritize(requests: Request[]): Request[];
}
```

### 6. Developer Experience

#### 6.1 TypeScript Enhancements

```typescript
// Type-safe prompt building
type PromptBuilder<T> = {
  [K in keyof T]: T[K] extends string
    ? (value: string) => PromptBuilder<Omit<T, K>>
    : T[K] extends object
    ? (value: T[K]) => PromptBuilder<Omit<T, K>>
    : never;
};

// Infer prompt types from schemas
type InferPromptType<T> = T extends Prompt<infer U> ? U : never;

// Generic agent types
type AgentResult<TInput, TOutput> = {
  input: TInput;
  output: TOutput;
  metadata: AgentMetadata;
};
```

#### 6.2 CLI and Tooling

```typescript
// CLI for agent management
class AgentCLI {
  create(name: string, template: string): Promise<void>;
  list(filter?: string): Promise<Agent[]>;
  run(name: string, input: any): Promise<void>;
  test(name: string): Promise<TestResult>;

  // Development tools
  watch(patterns: string[]): void;
  build(output: string): Promise<void>;
  deploy(target: DeployTarget): Promise<void>;
}

// Interactive development
class AgentPlayground {
  // REPL for agents
  repl(): void;

  // Visual debugging
  visualize(agent: Agent): void;

  // Performance analysis
  profile(agent: Agent): ProfileResult;
}
```

### 7. Integration and Ecosystem

#### 7.1 Provider Integrations

```typescript
// Multi-provider support
class ProviderRegistry {
  providers: Map<string, ProviderAdapter>;

  register(name: string, adapter: ProviderAdapter): void;
  get(name: string): ProviderAdapter | undefined;

  // Auto-discovery
  discover(): Promise<ProviderAdapter[]>;
}

// Provider adapters
class OpenAIAdapter implements ProviderAdapter {
  // OpenAI-specific implementations
}

class AnthropicAdapter implements ProviderAdapter {
  // Anthropic-specific implementations
}

class LocalAdapter implements ProviderAdapter {
  // Local model support (Ollama, etc.)
}
```

#### 7.2 External System Integrations

```typescript
// Database integrations
class DatabaseIntegration {
  // Vector databases (Pinecone, Weaviate)
  vectorStore: VectorStore;

  // Traditional databases
  sqlDatabase: SQLDatabase;
  nosqlDatabase: NoSQLDatabase;
}

// External APIs
class APIGateway {
  // REST APIs
  restClients: Map<string, RestClient>;

  // GraphQL
  graphqlClients: Map<string, GraphQLClient>;

  // Event streaming
  eventStreams: Map<string, EventStream>;
}
```

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
1. **Index.ts Export Setup**
   - Properly export all public APIs
   - Create version-specific exports
   - Add deprecation warnings for breaking changes

2. **Enhanced Agent System**
   - Implement `AgentIdentity` and `AgentRuntime`
   - Add lifecycle hooks to existing Agent class
   - Create agent registration and discovery

3. **Basic Memory System**
   - Implement in-memory storage backend
   - Add simple key-value and search functionality
   - Integrate with existing Prompt class

### Phase 2: Multi-Agent Coordination (Weeks 3-4)
1. **Agent Teams**
   - Implement `AgentTeam` class
   - Add sequential and parallel execution
   - Create voting and consensus mechanisms

2. **Advanced Tool System**
   - Enhance Tool class with validation and lifecycle
   - Implement tool registry and discovery
   - Add built-in tools for common tasks

3. **Plugin Architecture**
   - Design and implement plugin system
   - Create core plugins (logging, metrics, cache)
   - Add plugin discovery and loading

### Phase 3: Enhanced Streaming (Weeks 5-6)
1. **Stream Coordination**
   - Implement stream merging and forking
   - Add reactive stream processing
   - Create event-driven architecture

2. **Error Handling**
   - Implement structured error classification
   - Add retry policies and circuit breakers
   - Create recovery strategies

3. **Performance Optimization**
   - Add metrics collection and profiling
   - Implement multi-level caching
   - Create request optimization

### Phase 4: Developer Experience (Weeks 7-8)
1. **TypeScript Enhancements**
   - Implement type-safe prompt builders
   - Add type inference from schemas
   - Create generic agent result types

2. **CLI and Tooling**
   - Build agent management CLI
   - Create interactive playground
   - Add development tools

3. **Documentation and Examples**
   - Comprehensive API documentation
   - Real-world example projects
   - Best practices guide

### Phase 5: Ecosystem Integration (Weeks 9-10)
1. **Provider Integrations**
   - Implement multi-provider support
   - Create adapter system
   - Add auto-discovery

2. **External Systems**
   - Database integrations
   - API gateway functionality
   - Event streaming support

3. **Community Features**
   - Plugin marketplace
   - Community tools registry
   - Contribution guidelines

## Testing Strategy

### Unit Testing
- Maintain >95% code coverage
- Test all new features comprehensively
- Add property-based testing for complex algorithms

### Integration Testing
- Test multi-agent workflows
- Verify plugin system functionality
- Test provider integrations

### Performance Testing
- Benchmark streaming performance
- Test memory usage and leaks
- Profile agent execution times

### End-to-End Testing
- Real-world scenario testing
- Load testing with multiple agents
- Chaos engineering for resilience

## Migration Guide

### Backward Compatibility
- All existing APIs will continue to work
- Gradual migration path for new features
- Clear deprecation timeline for breaking changes

### Migration Steps
1. **Update Imports**
   ```typescript
   // Old
   import { runPrompt } from './runPrompt';

   // New
   import { runPrompt, Agent, AgentTeam } from 'lmthing';
   ```

2. **Enhance Existing Agents**
   ```typescript
   // Add identity and lifecycle
   const agent = new Agent({
     id: 'my-agent',
     name: 'My Agent',
     description: 'Does cool stuff',
     capabilities: ['text-generation', 'tool-use']
   }, model);
   ```

3. **Adopt New Features**
   - Add memory capabilities
   - Implement plugins
   - Use multi-agent patterns

## Conclusion

This proposal transforms `lmthing` from a prompt building library into a comprehensive framework for building complex agentic systems. The phased approach ensures incremental value delivery while maintaining backward compatibility.

The proposed extensions will:
- **Simplify Development**: Provide high-level abstractions for common patterns
- **Enhance Flexibility**: Support multiple architectural approaches
- **Improve Performance**: Built-in optimization and monitoring
- **Enable Scale**: Support for large, distributed agent systems
- **Future-Proof**: Plugin architecture ensures extensibility

With these enhancements, `lmthing` will become the go-to framework for building sophisticated AI agent systems, from simple chatbots to complex multi-agent organizations.

## Next Steps

1. **Community Review**: Gather feedback on the proposal
2. **Prioritization**: Identify most requested features
3. **Team Formation**: Assemble development team
4. **Resource Allocation**: Secure development resources
5. **Timeline Confirmation**: Finalize implementation schedule

---

*This proposal is a living document and will evolve based on community feedback and changing requirements.*