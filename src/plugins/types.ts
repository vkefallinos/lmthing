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
}

/**
 * Result of completing a task
 */
export interface CompleteTaskResult {
  success: boolean;
  taskId: string;
  message?: string;
}
