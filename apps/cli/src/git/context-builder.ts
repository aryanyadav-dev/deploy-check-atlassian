/**
 * Analysis context builder for CLI
 * Builds AnalysisContext from git diff and file contents
 */

import type { AnalysisContext, FileChange, RepoConfig } from '@dra/types';
import { GitClient } from './git-client';
import { GitFileReader } from './file-reader';
import type { GitDiffOptions, GitDiffResult, GitRepoInfo } from './types';

/**
 * Options for building analysis context
 */
export interface ContextBuilderOptions {
  /**
   * Base reference to compare against
   */
  base?: string;

  /**
   * Head reference to compare
   */
  head?: string;

  /**
   * Include only staged changes
   */
  staged?: boolean;

  /**
   * Specific file paths to include
   */
  paths?: string[];

  /**
   * Repository configuration
   */
  repoConfig?: RepoConfig;
}

/**
 * Result of building analysis context
 */
export interface ContextBuilderResult {
  /**
   * The built analysis context
   */
  context: AnalysisContext;

  /**
   * Repository information
   */
  repoInfo: GitRepoInfo;

  /**
   * Git diff result
   */
  diffResult: GitDiffResult;
}

/**
 * Builds AnalysisContext from git repository state
 */
export class AnalysisContextBuilder {
  private gitClient: GitClient;
  private fileReader: GitFileReader;

  constructor(cwd?: string) {
    this.gitClient = new GitClient(cwd);
    this.fileReader = new GitFileReader(cwd);
  }

  /**
   * Build analysis context from git diff
   * @param options Build options
   * @returns Analysis context with file changes
   */
  async build(options: ContextBuilderOptions = {}): Promise<ContextBuilderResult> {
    // Validate we're in a git repository
    if (!this.gitClient.isGitRepository()) {
      throw new Error('Not a git repository. Please run from within a git repository.');
    }

    // Get repository info
    const repoInfo = this.gitClient.getRepoInfo();

    // Determine base reference
    const base = options.base ?? repoInfo.defaultBranch;
    const head = options.head;

    // Validate base reference exists
    if (!this.gitClient.refExists(base)) {
      throw new Error(`Base reference '${base}' does not exist.`);
    }

    // Get git diff
    const diffOptions: GitDiffOptions = {
      base,
      head,
      staged: options.staged,
      paths: options.paths,
    };

    const diffResult = this.gitClient.getDiff(diffOptions);

    // Build file changes with content
    const files = await this.buildFileChanges(diffResult, base, head, options.staged);

    // Build analysis context
    const context: AnalysisContext = {
      files,
      diff: diffResult.rawDiff,
      repoConfig: options.repoConfig ?? {},
    };

    return {
      context,
      repoInfo,
      diffResult,
    };
  }

  /**
   * Build FileChange array from diff result
   */
  private async buildFileChanges(
    diffResult: GitDiffResult,
    base: string,
    head?: string,
    staged?: boolean
  ): Promise<FileChange[]> {
    const fileChanges: FileChange[] = [];

    for (const diffFile of diffResult.files) {
      // Skip binary files
      if (diffFile.isBinary) {
        continue;
      }

      // Get old content from base ref
      const oldPath = diffFile.oldPath ?? diffFile.path;
      const oldContent = diffFile.status === 'added'
        ? null
        : this.fileReader.readFromRef(oldPath, base);

      // Get new content from head ref, index (staged), or working directory
      let newContent: string | null = null;
      if (diffFile.status !== 'deleted') {
        if (head) {
          newContent = this.fileReader.readFromRef(diffFile.path, head);
        } else if (staged) {
          newContent = this.fileReader.readFromIndex(diffFile.path);
        } else {
          newContent = this.fileReader.readFromWorkingDirectory(diffFile.path);
        }
      }

      const fileChange: FileChange = {
        path: diffFile.path,
        oldContent,
        newContent,
        hunks: diffFile.hunks,
      };

      fileChanges.push(fileChange);
    }

    return fileChanges;
  }

  /**
   * Get repository root path
   */
  getRepoRoot(): string {
    return this.gitClient.getRepoRoot();
  }

  /**
   * Get relative path from repository root
   */
  getRelativePath(absolutePath: string): string {
    return this.gitClient.getRelativePath(absolutePath);
  }

  /**
   * Check if a path should be ignored based on config
   */
  shouldIgnorePath(filePath: string, ignorePaths?: string[]): boolean {
    if (!ignorePaths || ignorePaths.length === 0) {
      return false;
    }

    return ignorePaths.some(pattern => {
      // Simple glob matching
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        return regex.test(filePath);
      }
      return filePath.startsWith(pattern) || filePath === pattern;
    });
  }

  /**
   * Filter files based on ignore patterns
   */
  filterIgnoredFiles(
    files: FileChange[],
    ignorePaths?: string[]
  ): FileChange[] {
    if (!ignorePaths || ignorePaths.length === 0) {
      return files;
    }

    return files.filter(file => !this.shouldIgnorePath(file.path, ignorePaths));
  }
}

/**
 * Create an AnalysisContextBuilder for the current directory
 */
export function createContextBuilder(cwd?: string): AnalysisContextBuilder {
  return new AnalysisContextBuilder(cwd);
}

/**
 * Convenience function to build analysis context
 */
export async function buildAnalysisContext(
  options: ContextBuilderOptions = {},
  cwd?: string
): Promise<ContextBuilderResult> {
  const builder = new AnalysisContextBuilder(cwd);
  return builder.build(options);
}
