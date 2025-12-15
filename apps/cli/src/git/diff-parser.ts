/**
 * Git diff parser for extracting changed files and hunks
 * Parses unified diff format output from git diff command
 */

import type { DiffHunk } from '@dra/types';
import type { GitDiffFile, GitDiffResult, GitFileStatus } from './types';

/**
 * Parse git diff output into structured data
 * @param diffOutput Raw output from git diff command
 * @param base Base reference used for diff
 * @param head Head reference used for diff
 * @returns Parsed diff result
 */
export function parseGitDiff(
  diffOutput: string,
  base: string,
  head: string
): GitDiffResult {
  const files = parseFiles(diffOutput);
  
  return {
    base,
    head,
    files,
    rawDiff: diffOutput,
  };
}

/**
 * Parse all files from diff output
 */
function parseFiles(diffOutput: string): GitDiffFile[] {
  if (!diffOutput.trim()) {
    return [];
  }

  const files: GitDiffFile[] = [];
  
  // Split by file headers (diff --git a/... b/...)
  const fileChunks = diffOutput.split(/^diff --git /m).filter(Boolean);
  
  for (const chunk of fileChunks) {
    const file = parseFileChunk(chunk);
    if (file) {
      files.push(file);
    }
  }
  
  return files;
}

/**
 * Parse a single file chunk from diff output
 */
function parseFileChunk(chunk: string): GitDiffFile | null {
  const lines = chunk.split('\n');
  
  // First line contains file paths: a/path b/path
  const headerMatch = lines[0]?.match(/^a\/(.+?) b\/(.+?)$/);
  if (!headerMatch) {
    return null;
  }
  
  const oldPath = headerMatch[1];
  const newPath = headerMatch[2];
  
  // Determine file status and check for binary
  const { status, isBinary } = parseFileMetadata(lines);
  
  // Parse hunks if not binary
  const hunks = isBinary ? [] : parseHunks(lines);
  
  const file: GitDiffFile = {
    path: newPath,
    status,
    hunks,
    isBinary,
  };
  
  // Add oldPath for renames
  if (status === 'renamed' && oldPath !== newPath) {
    file.oldPath = oldPath;
  }
  
  return file;
}

/**
 * Parse file metadata to determine status and binary flag
 */
function parseFileMetadata(lines: string[]): { status: GitFileStatus; isBinary: boolean } {
  let status: GitFileStatus = 'modified';
  let isBinary = false;
  
  for (const line of lines) {
    if (line.startsWith('new file mode')) {
      status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      status = 'deleted';
    } else if (line.startsWith('rename from') || line.startsWith('similarity index')) {
      status = 'renamed';
    } else if (line.startsWith('copy from')) {
      status = 'copied';
    } else if (line.includes('Binary files') || line.startsWith('GIT binary patch')) {
      isBinary = true;
    }
  }
  
  return { status, isBinary };
}

/**
 * Parse diff hunks from file lines
 */
function parseHunks(lines: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let hunkContent: string[] = [];
  
  for (const line of lines) {
    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    
    if (hunkMatch) {
      // Save previous hunk
      if (currentHunk) {
        currentHunk.content = hunkContent.join('\n');
        hunks.push(currentHunk);
      }
      
      // Start new hunk
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: parseInt(hunkMatch[2] ?? '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newLines: parseInt(hunkMatch[4] ?? '1', 10),
        content: '',
      };
      hunkContent = [line];
    } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      // Content line within a hunk
      hunkContent.push(line);
    }
  }
  
  // Save last hunk
  if (currentHunk) {
    currentHunk.content = hunkContent.join('\n');
    hunks.push(currentHunk);
  }
  
  return hunks;
}

/**
 * Extract added lines from a hunk
 */
export function getAddedLines(hunk: DiffHunk): string[] {
  return hunk.content
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1));
}

/**
 * Extract removed lines from a hunk
 */
export function getRemovedLines(hunk: DiffHunk): string[] {
  return hunk.content
    .split('\n')
    .filter(line => line.startsWith('-') && !line.startsWith('---'))
    .map(line => line.slice(1));
}

/**
 * Get line numbers of added lines in a hunk
 */
export function getAddedLineNumbers(hunk: DiffHunk): number[] {
  const lineNumbers: number[] = [];
  let currentLine = hunk.newStart;
  
  const lines = hunk.content.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNumbers.push(currentLine);
      currentLine++;
    } else if (line.startsWith(' ')) {
      currentLine++;
    }
    // Removed lines don't increment new line counter
  }
  
  return lineNumbers;
}
