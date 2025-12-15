/**
 * Git integration types for CLI
 */

import type { DiffHunk } from '@dra/types';

/**
 * Options for git diff operations
 */
export interface GitDiffOptions {
  /**
   * Base reference to compare against (branch, commit, tag)
   * @default 'HEAD'
   */
  base?: string;

  /**
   * Head reference to compare (branch, commit, tag)
   * @default working directory
   */
  head?: string;

  /**
   * Include staged changes only
   */
  staged?: boolean;

  /**
   * Specific file paths to include
   */
  paths?: string[];
}

/**
 * Represents a parsed file from git diff output
 */
export interface GitDiffFile {
  /**
   * File path (relative to repo root)
   */
  path: string;

  /**
   * Old file path (for renames)
   */
  oldPath?: string;

  /**
   * File status
   */
  status: GitFileStatus;

  /**
   * Diff hunks for this file
   */
  hunks: DiffHunk[];

  /**
   * Whether the file is binary
   */
  isBinary: boolean;
}

/**
 * Git file status
 */
export type GitFileStatus = 
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied';

/**
 * Result of parsing git diff
 */
export interface GitDiffResult {
  /**
   * Base reference used
   */
  base: string;

  /**
   * Head reference used
   */
  head: string;

  /**
   * Parsed files from diff
   */
  files: GitDiffFile[];

  /**
   * Raw diff output
   */
  rawDiff: string;
}

/**
 * Options for reading file content from git
 */
export interface GitFileReadOptions {
  /**
   * Git reference (commit, branch, tag)
   * If not provided, reads from working directory
   */
  ref?: string;
}

/**
 * Git repository information
 */
export interface GitRepoInfo {
  /**
   * Absolute path to repository root
   */
  root: string;

  /**
   * Current branch name
   */
  currentBranch: string;

  /**
   * Current HEAD commit SHA
   */
  headCommit: string;

  /**
   * Default branch name (main/master)
   */
  defaultBranch: string;
}
