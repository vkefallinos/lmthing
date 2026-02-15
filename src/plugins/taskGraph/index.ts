/**
 * Task Graph (DAG) Plugin
 *
 * Re-exports all taskGraph functionality from the main module.
 */

export {
  taskGraphPlugin,
  defTaskGraph,
  detectCycles,
  validateTaskGraph,
  normalizeTaskGraph,
  getUnblockedTasks,
} from './taskGraph';
