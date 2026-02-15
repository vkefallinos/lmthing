/**
 * Plugin-specific types for lmthing plugins
 */

/**
 * Task status enum for task list plugins
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Task definition for the task list plugin
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  /** Human-readable task name/description */
  name: string;
  /** Current status of the task */
  status: TaskStatus;
  /** Optional metadata for the task */
  metadata?: Record<string, any>;
}

/**
 * Result of starting a task
 */
export interface StartTaskResult {
  success: boolean;
  taskId: string;
  message?: string;
  task?: Task;
}

/**
 * Result of completing a task
 */
export interface CompleteTaskResult {
  success: boolean;
  taskId: string;
  message?: string;
  task?: Task;
}

/**
 * Result of failing a task
 */
export interface FailTaskResult {
  success: boolean;
  taskId: string;
  message?: string;
  task?: Task;
}

// ============================================================
// Task Graph (DAG) Plugin Types
// ============================================================

/**
 * Status for a node in the task graph DAG
 */
export type TaskNodeStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * A node in the task graph DAG.
 *
 * Each node declares its relationships (edges) to other nodes via
 * `dependencies` (upstream) and `unblocks` (downstream).
 */
export interface TaskNode {
  /** Unique identifier (e.g., "task_db_schema") */
  id: string;
  /** Concise name of the task */
  title: string;
  /** Detailed execution instructions and success criteria */
  description: string;
  /** Current status of the task */
  status: TaskNodeStatus;

  // Dependency Management (The DAG Edges)
  /** IDs of tasks that MUST be completed before this can start */
  dependencies: string[];
  /** IDs of downstream tasks waiting on this one */
  unblocks: string[];

  // Execution & Routing Context
  /** e.g., ["database", "read-only", "web-search"] */
  required_capabilities: string[];
  /** The specific subagent handling this task */
  assigned_subagent?: string;

  // State & Data Passing
  /** Context passed from upstream tasks */
  input_context?: string;
  /** The summary/artifact produced upon completion */
  output_result?: string;
}

/**
 * Result of generating a task graph
 */
export interface GenerateTaskGraphResult {
  success: boolean;
  message: string;
  taskCount?: number;
  tasks?: TaskNode[];
}

/**
 * Result of getting unblocked tasks
 */
export interface GetUnblockedTasksResult {
  success: boolean;
  message: string;
  tasks: TaskNode[];
}

/**
 * Result of updating a task's status
 */
export interface UpdateTaskStatusResult {
  success: boolean;
  taskId: string;
  message: string;
  task?: TaskNode;
  newlyUnblockedTasks?: TaskNode[];
}
