/**
 * Git client for executing git commands
 * Provides methods for diff, file reading, and repository info
 */

import { execSync, ExecSyncOptions } from 'child_process';
import * as path from 'path';
import type { GitDiffOptions, GitDiffResult, GitRepoInfo, GitFileReadOptions } from './types';
import { parseGitDiff } from './diff-parser';

/**
 * Git client for interacting with local git repositories
 */
export class GitClient {
  private cwd: string;

  /**
   * Create a new GitClient
   * @param cwd Working directory (defaults to process.cwd())
   */
  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Execute a git command and return stdout
   */
  private exec(args: string[], options?: ExecSyncOptions): string {
    const command = `git ${args.join(' ')}`;
    try {
      const result = execSync(command, {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large diffs
        ...options,
      });
      return (result as string).trim();
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      const stderr = execError.stderr ?? execError.message ?? 'Unknown git error';
      throw new Error(`Git command failed: ${command}\n${stderr}`);
    }
  }

  /**
   * Check if current directory is inside a git repository
   */
  isGitRepository(): boolean {
    try {
      this.exec(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository information
   */
  getRepoInfo(): GitRepoInfo {
    const root = this.exec(['rev-parse', '--show-toplevel']);
    const currentBranch = this.getCurrentBranch();
    const headCommit = this.exec(['rev-parse', 'HEAD']);
    const defaultBranch = this.detectDefaultBranch();

    return {
      root,
      currentBranch,
      headCommit,
      defaultBranch,
    };
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string {
    try {
      return this.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
      // Detached HEAD state
      return this.exec(['rev-parse', '--short', 'HEAD']);
    }
  }

  /**
   * Detect the default branch (main or master)
   */
  detectDefaultBranch(): string {
    // Try to get from remote origin
    try {
      const remoteHead = this.exec(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
      return remoteHead.replace('origin/', '');
    } catch {
      // Fall back to checking if main or master exists
      try {
        this.exec(['rev-parse', '--verify', 'main']);
        return 'main';
      } catch {
        try {
          this.exec(['rev-parse', '--verify', 'master']);
          return 'master';
        } catch {
          return 'main'; // Default fallback
        }
      }
    }
  }

  /**
   * Get git diff between references
   */
  getDiff(options: GitDiffOptions = {}): GitDiffResult {
    const { base, head, staged, paths } = options;
    
    const args = ['diff', '--no-color', '-U3'];
    
    // Determine what to diff
    if (staged) {
      args.push('--cached');
      if (base) {
        args.push(base);
      }
    } else if (base && head) {
      args.push(`${base}...${head}`);
    } else if (base) {
      args.push(base);
    }
    // If no base/head, diffs working directory against index
    
    // Add specific paths if provided
    if (paths && paths.length > 0) {
      args.push('--');
      args.push(...paths);
    }
    
    const diffOutput = this.exec(args);
    const baseRef = base ?? 'HEAD';
    const headRef = head ?? 'working-directory';
    
    return parseGitDiff(diffOutput, baseRef, headRef);
  }

  /**
   * Get list of changed files between references
   */
  getChangedFiles(options: GitDiffOptions = {}): string[] {
    const { base, head, staged, paths } = options;
    
    const args = ['diff', '--name-only'];
    
    if (staged) {
      args.push('--cached');
      if (base) {
        args.push(base);
      }
    } else if (base && head) {
      args.push(`${base}...${head}`);
    } else if (base) {
      args.push(base);
    }
    
    if (paths && paths.length > 0) {
      args.push('--');
      args.push(...paths);
    }
    
    const output = this.exec(args);
    return output ? output.split('\n').filter(Boolean) : [];
  }

  /**
   * Read file content from a specific git reference
   */
  readFileAtRef(filePath: string, options: GitFileReadOptions = {}): string | null {
    const { ref } = options;
    
    if (!ref) {
      // Read from working directory
      return this.readWorkingFile(filePath);
    }
    
    try {
      return this.exec(['show', `${ref}:${filePath}`]);
    } catch {
      // File doesn't exist at this ref
      return null;
    }
  }

  /**
   * Read file from working directory
   */
  private readWorkingFile(filePath: string): string | null {
    const fs = require('fs');
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.cwd, filePath);
    
    try {
      return fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Check if a file exists at a specific reference
   */
  fileExistsAtRef(filePath: string, ref: string): boolean {
    try {
      this.exec(['cat-file', '-e', `${ref}:${filePath}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the merge base between two references
   */
  getMergeBase(ref1: string, ref2: string): string {
    return this.exec(['merge-base', ref1, ref2]);
  }

  /**
   * Check if a reference exists
   */
  refExists(ref: string): boolean {
    try {
      this.exec(['rev-parse', '--verify', ref]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository root path
   */
  getRepoRoot(): string {
    return this.exec(['rev-parse', '--show-toplevel']);
  }

  /**
   * Get relative path from repo root
   */
  getRelativePath(absolutePath: string): string {
    const root = this.getRepoRoot();
    return path.relative(root, absolutePath);
  }
}

/**
 * Create a GitClient for the current directory
 */
export function createGitClient(cwd?: string): GitClient {
  return new GitClient(cwd);
}
