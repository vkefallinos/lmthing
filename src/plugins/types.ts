/**
 * Plugin-specific types for lmthing plugins
 */

import type { SubToolDefinition } from '../StatefulPrompt';

/**
 * Task status enum for task list plugins
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * System prompt part with name and value
 */
export interface SystemPart {
  name: string;
  value: string;
}

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

  // === Phase 1 Extensions ===

  /**
   * Task-specific tools that are available when this task is in progress.
   * These tools are registered when the task starts and removed when it completes.
   */
  tools?: SubToolDefinition[];

  /**
   * Tool mode determines how task-specific tools interact with global tools.
   * - 'extend': Task tools are added to global tools (default)
   * - 'exclusive': Only task-specific tools are available, global tools are hidden
   */
  toolMode?: 'extend' | 'exclusive';

  /**
   * Task-specific variables that are injected into the prompt when this task is in progress.
   * These appear in a <current_task_context> section in the system prompt.
   */
  variables?: Record<string, any>;

  /**
   * Task-specific system prompt additions.
   * Can be a string, a single SystemPart object, or an array of SystemPart objects.
   * These are injected when the task is in progress and removed when it completes.
   */
  system?: string | SystemPart | SystemPart[];
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
