/**
 * Coverage Report Discovery
 * Auto-detects lcov coverage reports in common locations
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CoverageReport, FileCoverage } from '@dra/types';

/**
 * Common locations for lcov coverage reports
 */
const COVERAGE_LOCATIONS = [
  'coverage/lcov.info',
  '.coverage/lcov.info',
  'lcov.info',
  'coverage/lcov-report/lcov.info',
  'test-results/coverage/lcov.info',
  '.nyc_output/lcov.info',
];

/**
 * Discover coverage report in common locations
 * @param cwd Working directory to search from
 * @returns Path to coverage report or undefined if not found
 */
export function discoverCoverageReport(cwd?: string): string | undefined {
  const baseDir = cwd ?? process.cwd();

  for (const location of COVERAGE_LOCATIONS) {
    const fullPath = path.join(baseDir, location);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

/**
 * Parse lcov file and return CoverageReport
 * @param filePath Path to lcov file
 * @returns Parsed coverage report
 */
export function parseLcovFile(filePath: string): CoverageReport {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseLcov(content);
}

/**
 * Represents parsed lcov data for a single source file.
 */
interface LcovFileEntry {
  sourceFile: string;
  linesCovered: number;
  linesTotal: number;
  branchesCovered: number;
  branchesTotal: number;
  functionsCovered: number;
  functionsTotal: number;
}

/**
 * Parse lcov format coverage data into a CoverageReport.
 * @param lcovContent The raw lcov file content
 * @returns Parsed coverage report
 */
export function parseLcov(lcovContent: string): CoverageReport {
  const files: FileCoverage[] = [];
  const entries = parseLcovEntries(lcovContent);

  for (const entry of entries) {
    files.push(entryToFileCoverage(entry));
  }

  return { files };
}

/**
 * Parse lcov content into individual file entries.
 */
function parseLcovEntries(lcovContent: string): LcovFileEntry[] {
  const entries: LcovFileEntry[] = [];
  const lines = lcovContent.split('\n');

  let currentEntry: Partial<LcovFileEntry> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      currentEntry = {
        sourceFile: trimmed.substring(3),
        linesCovered: 0,
        linesTotal: 0,
        branchesCovered: 0,
        branchesTotal: 0,
        functionsCovered: 0,
        functionsTotal: 0,
      };
    } else if (trimmed === 'end_of_record' && currentEntry) {
      entries.push(currentEntry as LcovFileEntry);
      currentEntry = null;
    } else if (currentEntry) {
      parseLcovLine(trimmed, currentEntry);
    }
  }

  return entries;
}

/**
 * Parse a single lcov line and update the entry.
 */
function parseLcovLine(line: string, entry: Partial<LcovFileEntry>): void {
  if (line.startsWith('LF:')) {
    entry.linesTotal = parseInt(line.substring(3), 10) || 0;
  } else if (line.startsWith('LH:')) {
    entry.linesCovered = parseInt(line.substring(3), 10) || 0;
  } else if (line.startsWith('BRF:')) {
    entry.branchesTotal = parseInt(line.substring(4), 10) || 0;
  } else if (line.startsWith('BRH:')) {
    entry.branchesCovered = parseInt(line.substring(4), 10) || 0;
  } else if (line.startsWith('FNF:')) {
    entry.functionsTotal = parseInt(line.substring(4), 10) || 0;
  } else if (line.startsWith('FNH:')) {
    entry.functionsCovered = parseInt(line.substring(4), 10) || 0;
  }
}

/**
 * Convert an lcov entry to a FileCoverage object.
 */
function entryToFileCoverage(entry: LcovFileEntry): FileCoverage {
  return {
    path: entry.sourceFile,
    lineRate: entry.linesTotal > 0 ? (entry.linesCovered / entry.linesTotal) * 100 : 0,
    branchRate: entry.branchesTotal > 0 ? (entry.branchesCovered / entry.branchesTotal) * 100 : 0,
    functionRate: entry.functionsTotal > 0 ? (entry.functionsCovered / entry.functionsTotal) * 100 : 0,
    linesCovered: entry.linesCovered,
    linesTotal: entry.linesTotal,
    branchesCovered: entry.branchesCovered,
    branchesTotal: entry.branchesTotal,
    functionsCovered: entry.functionsCovered,
    functionsTotal: entry.functionsTotal,
  };
}
