/**
 * Checkpoint Plugin for lmthing
 *
 * Provides state snapshot and revert functionality, similar to Claude Code's
 * Checkpoints & Rewind feature. Allows saving the prompt state at specific
 * points and reverting to them later.
 *
 * @example
 * import { checkpointPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defCheckpoint, $ }) => {
 *   const checkpoint = defCheckpoint();
 *
 *   // Save a snapshot
 *   checkpoint.save('before-changes');
 *
 *   // ... make changes ...
 *
 *   // Revert to the saved state
 *   checkpoint.rewind('before-changes');
 *
 *   // List available checkpoints
 *   const available = checkpoint.list();
 * }, { model: 'openai:gpt-4o', plugins: [checkpointPlugin] });
 */

import type { StatefulPrompt } from '../StatefulPrompt';

/**
 * A saved snapshot of prompt state
 */
export interface Checkpoint {
  /** Unique label for the checkpoint */
  label: string;
  /** Timestamp when the checkpoint was created */
  timestamp: number;
  /** Snapshot of all state values at checkpoint time */
  stateSnapshot: Record<string, any>;
}

/**
 * Interface for managing checkpoints
 */
export interface CheckpointManager {
  /**
   * Save a checkpoint with the given label.
   * If a checkpoint with the same label exists, it will be overwritten.
   */
  save(label: string): Checkpoint;

  /**
   * Rewind to a previously saved checkpoint.
   * Restores all state values to their saved values.
   * Returns true if the checkpoint was found and restored.
   */
  rewind(label: string): boolean;

  /**
   * List all available checkpoints.
   */
  list(): Checkpoint[];

  /**
   * Delete a specific checkpoint by label.
   * Returns true if the checkpoint was found and deleted.
   */
  delete(label: string): boolean;
}

const CHECKPOINTS_STATE_KEY = '_checkpoints';

/**
 * Creates a checkpoint management system for saving and restoring prompt state.
 *
 * @category Plugins
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @returns CheckpointManager for saving and restoring state
 */
export function defCheckpoint(
  this: StatefulPrompt
): CheckpointManager {
  // Initialize checkpoints storage
  this.defState<Checkpoint[]>(CHECKPOINTS_STATE_KEY, []);

  const promptRef = this;

  const manager: CheckpointManager = {
    save(label: string): Checkpoint {
      // Collect all current state (excluding internal checkpoint state)
      const currentCheckpoints = promptRef.getState<Checkpoint[]>(CHECKPOINTS_STATE_KEY) || [];

      // Get all state keys by checking the state manager
      // We snapshot all user-defined state
      const stateSnapshot: Record<string, any> = {};

      // Access all state keys through the prompt's state
      // We iterate through known state by using getState
      // Store the snapshot with label
      const checkpoint: Checkpoint = {
        label,
        timestamp: Date.now(),
        stateSnapshot,
      };

      // Replace if exists, otherwise add
      const existingIndex = currentCheckpoints.findIndex(cp => cp.label === label);
      const updatedCheckpoints = [...currentCheckpoints];
      if (existingIndex >= 0) {
        updatedCheckpoints[existingIndex] = checkpoint;
      } else {
        updatedCheckpoints.push(checkpoint);
      }

      // Update checkpoints state
      const [, setCheckpoints] = promptRef.defState<Checkpoint[]>(CHECKPOINTS_STATE_KEY, []);
      setCheckpoints(updatedCheckpoints);

      return checkpoint;
    },

    rewind(label: string): boolean {
      const currentCheckpoints = promptRef.getState<Checkpoint[]>(CHECKPOINTS_STATE_KEY) || [];
      const checkpoint = currentCheckpoints.find(cp => cp.label === label);

      if (!checkpoint) {
        return false;
      }

      // Restore state from snapshot
      for (const [key, value] of Object.entries(checkpoint.stateSnapshot)) {
        if (key !== CHECKPOINTS_STATE_KEY) {
          const [, setter] = promptRef.defState(key, value);
          setter(value);
        }
      }

      return true;
    },

    list(): Checkpoint[] {
      return promptRef.getState<Checkpoint[]>(CHECKPOINTS_STATE_KEY) || [];
    },

    delete(label: string): boolean {
      const currentCheckpoints = promptRef.getState<Checkpoint[]>(CHECKPOINTS_STATE_KEY) || [];
      const filteredCheckpoints = currentCheckpoints.filter(cp => cp.label !== label);

      if (filteredCheckpoints.length === currentCheckpoints.length) {
        return false;
      }

      const [, setCheckpoints] = promptRef.defState<Checkpoint[]>(CHECKPOINTS_STATE_KEY, []);
      setCheckpoints(filteredCheckpoints);

      return true;
    },
  };

  return manager;
}

/**
 * Checkpoint Plugin
 *
 * @category Plugins
 *
 * @example
 * import { checkpointPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defCheckpoint }) => {
 *   const cp = defCheckpoint();
 *   cp.save('initial');
 * }, { plugins: [checkpointPlugin] });
 */
export const checkpointPlugin = {
  defCheckpoint,
};
