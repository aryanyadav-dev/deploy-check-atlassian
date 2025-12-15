/**
 * Git file content reader
 * Reads file content from working directory or git history
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { GitFileReadOptions } from './types';

/**
 * File reader for git repositories
 * Supports reading from working directory, staged changes, or specific commits/branches
 */
export class GitFileReader {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Execute a git command and return stdout
   */
  private exec(args: string[]): string {
    const command = `git ${args.join(' ')}`;
    try {
      return execSync(command, {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }).trim();
    } catch (error) {
      const execError = error as { stderr?: string; message?: string };
      throw new Error(`Git command failed: ${command}\n${execError.stderr ?? execError.message}`);
    }
  }

  /**
   * Read file content from working directory
   * @param filePath Relative path to file
   * @returns File content or null if file doesn't exist
   */
  readFromWorkingDirectory(filePath: string): string | null {
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
   * Read file content from git index (staged changes)
   * @param filePath Relative path to file
   * @returns File content or null if file doesn't exist in index
   */
  readFromIndex(filePath: string): string | null {
    try {
      return this.exec(['show', `:${filePath}`]);
    } catch {
      return null;
    }
  }

  /**
   * Read file content from a specific git reference (commit, branch, tag)
   * @param filePath Relative path to file
   * @param ref Git reference (commit SHA, branch name, tag)
   * @returns File content or null if file doesn't exist at ref
   */
  readFromRef(filePath: string, ref: string): string | null {
    try {
      return this.exec(['show', `${ref}:${filePath}`]);
    } catch {
      return null;
    }
  }

  /**
   * Read file content with flexible options
   * @param filePath Relative path to file
   * @param options Read options
   * @returns File content or null if file doesn't exist
   */
  read(filePath: string, options: GitFileReadOptions = {}): string | null {
    const { ref } = options;

    if (!ref) {
      return this.readFromWorkingDirectory(filePath);
    }

    return this.readFromRef(filePath, ref);
  }

  /**
   * Read both old and new versions of a file for comparison
   * @param filePath Relative path to file
   * @param baseRef Base reference for old content
   * @param headRef Head reference for new content (defaults to working directory)
   * @returns Object with oldContent and newContent
   */
  readBothVersions(
    filePath: string,
    baseRef: string,
    headRef?: string
  ): { oldContent: string | null; newContent: string | null } {
    const oldContent = this.readFromRef(filePath, baseRef);
    const newContent = headRef
      ? this.readFromRef(filePath, headRef)
      : this.readFromWorkingDirectory(filePath);

    return { oldContent, newContent };
  }

  /**
   * Check if a file exists at a specific reference
   * @param filePath Relative path to file
   * @param ref Git reference
   * @returns True if file exists
   */
  existsAtRef(filePath: string, ref: string): boolean {
    try {
      this.exec(['cat-file', '-e', `${ref}:${filePath}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists in working directory
   * @param filePath Relative path to file
   * @returns True if file exists
   */
  existsInWorkingDirectory(filePath: string): boolean {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.cwd, filePath);

    return fs.existsSync(absolutePath);
  }

  /**
   * List all files at a specific reference
   * @param ref Git reference
   * @param pathPrefix Optional path prefix to filter files
   * @returns Array of file paths
   */
  listFilesAtRef(ref: string, pathPrefix?: string): string[] {
    try {
      const args = ['ls-tree', '-r', '--name-only', ref];
      if (pathPrefix) {
        args.push('--', pathPrefix);
      }
      const output = this.exec(args);
      return output ? output.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  /**
   * Get file size at a specific reference
   * @param filePath Relative path to file
   * @param ref Git reference
   * @returns File size in bytes or null if file doesn't exist
   */
  getFileSizeAtRef(filePath: string, ref: string): number | null {
    try {
      const output = this.exec(['cat-file', '-s', `${ref}:${filePath}`]);
      return parseInt(output, 10);
    } catch {
      return null;
    }
  }
}

/**
 * Create a GitFileReader for the current directory
 */
export function createFileReader(cwd?: string): GitFileReader {
  return new GitFileReader(cwd);
}
