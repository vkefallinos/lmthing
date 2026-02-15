/**
 * Persistent Context Plugin for lmthing
 *
 * Provides the ability to load project-specific instructions from `.lmthing.md`
 * files, similar to Claude Code's CLAUDE.md feature. Instructions are loaded
 * as system prompt sections.
 *
 * Supports hierarchical context loading from:
 * - Home directory (~/.lmthing.md) - User-level defaults
 * - Project root (.lmthing.md) - Project-level instructions
 * - Subdirectories (.lmthing.md) - Directory-level overrides
 *
 * @example
 * import { persistentContextPlugin } from 'lmthing/plugins';
 *
 * const { result } = await runPrompt(async ({ defContext, $ }) => {
 *   defContext();  // Loads .lmthing.md from current working directory
 *   // or
 *   defContext({ paths: ['./project-root/.lmthing.md', './src/.lmthing.md'] });
 *   // or
 *   defContext({ content: 'Custom instructions here' });
 *
 *   $`Help me with this project`;
 * }, { model: 'openai:gpt-4o', plugins: [persistentContextPlugin] });
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StatefulPrompt } from '../StatefulPrompt';

/**
 * Configuration for persistent context loading
 */
export interface PersistentContextConfig {
  /**
   * Explicit paths to .lmthing.md files to load.
   * If not provided, searches for .lmthing.md in the current directory.
   */
  paths?: string[];

  /**
   * Direct content to use as context instead of loading from files.
   * If provided, file loading is skipped.
   */
  content?: string;

  /**
   * The name for the system section. Defaults to 'projectContext'.
   */
  sectionName?: string;

  /**
   * Whether to search parent directories for .lmthing.md files.
   * @default false
   */
  searchParents?: boolean;
}

/**
 * Result of loading persistent context
 */
export interface PersistentContextResult {
  /** Whether any context was loaded */
  loaded: boolean;
  /** The sources from which context was loaded */
  sources: string[];
  /** The combined content that was loaded */
  content: string;
}

const DEFAULT_FILENAME = '.lmthing.md';
const CONTEXT_STATE_KEY = '_persistentContext';

/**
 * Search for .lmthing.md files in the given directory and optionally parent directories.
 */
function findContextFiles(startDir: string, searchParents: boolean): string[] {
  const files: string[] = [];
  let currentDir = path.resolve(startDir);

  const filePath = path.join(currentDir, DEFAULT_FILENAME);
  if (fs.existsSync(filePath)) {
    files.push(filePath);
  }

  if (searchParents) {
    let parentDir = path.dirname(currentDir);
    while (parentDir !== currentDir) {
      const parentFilePath = path.join(parentDir, DEFAULT_FILENAME);
      if (fs.existsSync(parentFilePath)) {
        files.unshift(parentFilePath); // Parent context comes first
      }
      currentDir = parentDir;
      parentDir = path.dirname(currentDir);
    }
  }

  return files;
}

/**
 * Load and merge content from multiple context files.
 */
function loadContextContent(filePaths: string[]): { content: string; sources: string[] } {
  const sources: string[] = [];
  const parts: string[] = [];

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (content) {
        parts.push(`<!-- Source: ${filePath} -->\n${content}`);
        sources.push(filePath);
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return {
    content: parts.join('\n\n'),
    sources,
  };
}

/**
 * Loads persistent context from .lmthing.md files or direct content.
 *
 * @category Plugins
 *
 * @param this - The StatefulPrompt instance (automatically bound)
 * @param config - Configuration for context loading
 * @returns Result of context loading including sources and content
 */
export function defContext(
  this: StatefulPrompt,
  config: PersistentContextConfig = {}
): PersistentContextResult {
  const {
    paths,
    content,
    sectionName = 'projectContext',
    searchParents = false,
  } = config;

  let finalContent = '';
  let sources: string[] = [];

  if (content) {
    // Direct content provided
    finalContent = content;
    sources = ['direct'];
  } else if (paths && paths.length > 0) {
    // Explicit paths provided
    const result = loadContextContent(paths);
    finalContent = result.content;
    sources = result.sources;
  } else {
    // Search for .lmthing.md files
    const contextFiles = findContextFiles(process.cwd(), searchParents);
    const result = loadContextContent(contextFiles);
    finalContent = result.content;
    sources = result.sources;
  }

  const loaded = finalContent.length > 0;

  // Store context state
  this.defState(CONTEXT_STATE_KEY, { loaded, sources, content: finalContent });

  // Add as a system section if content was found
  if (loaded) {
    this.defSystem(sectionName, finalContent);
  }

  return { loaded, sources, content: finalContent };
}

/**
 * Persistent Context Plugin
 *
 * @category Plugins
 *
 * @example
 * import { persistentContextPlugin } from 'lmthing/plugins';
 *
 * runPrompt(({ defContext }) => {
 *   defContext(); // Auto-discovers .lmthing.md
 * }, { plugins: [persistentContextPlugin] });
 */
export const persistentContextPlugin = {
  defContext,
};
