/**
 * Coverage Analyzer for CLI
 * Detects low test coverage on modified files
 */

import type { AnalysisContext, Finding, FileCoverage, CoverageReport } from '@dra/types';
import { BaseAnalyzerCli } from './base.analyzer';

/**
 * Represents parsed lcov data for a single source file.
 */
export interface LcovFileEntry {
  sourceFile: string;
  linesCovered: number;
  linesTotal: number;
  branchesCovered: number;
  branchesTotal: number;
  functionsCovered: number;
  functionsTotal: number;
}

/**
 * Coverage analyzer for detecting low test coverage on modified files.
 * Parses lcov format coverage reports and generates LOW_COVERAGE findings
 * for files below the configured threshold (Requirements 3.1, 3.2, 3.4).
 */
export class CoverageAnalyzerCli extends BaseAnalyzerCli {
  readonly name = 'coverage';
  readonly supportedExtensions = ['*'];

  private readonly DEFAULT_THRESHOLD = 40;

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (!context.coverageReport) {
      return findings;
    }

    const threshold = context.repoConfig.coverageThreshold ?? this.DEFAULT_THRESHOLD;
    const modifiedPaths = new Set(context.files.map((f) => f.path));

    for (const fileCoverage of context.coverageReport.files) {
      if (!this.isModifiedFile(fileCoverage.path, modifiedPaths)) {
        continue;
      }

      if (fileCoverage.lineRate < threshold) {
        findings.push(this.createLowCoverageFinding(fileCoverage, threshold));
      }
    }

    return findings;
  }

  private isModifiedFile(coveragePath: string, modifiedPaths: Set<string>): boolean {
    if (modifiedPaths.has(coveragePath)) {
      return true;
    }

    const normalizedCoveragePath = this.normalizePath(coveragePath);
    for (const modifiedPath of modifiedPaths) {
      if (this.normalizePath(modifiedPath) === normalizedCoveragePath) {
        return true;
      }
    }

    return false;
  }

  private normalizePath(path: string): string {
    return path.replace(/^\.?\//, '').toLowerCase();
  }

  private createLowCoverageFinding(coverage: FileCoverage, threshold: number): Finding {
    return {
      type: 'LOW_COVERAGE',
      severity: 'MEDIUM',
      title: `Low test coverage: ${coverage.path}`,
      description: `File has ${coverage.lineRate.toFixed(1)}% line coverage, which is below the ${threshold}% threshold. ` +
        `Branch coverage: ${coverage.branchRate.toFixed(1)}%, Function coverage: ${coverage.functionRate.toFixed(1)}%.`,
      filePath: coverage.path,
      remediation: `Add unit tests to improve coverage. Focus on untested functions and branches.`,
      metadata: {
        lineRate: coverage.lineRate,
        branchRate: coverage.branchRate,
        functionRate: coverage.functionRate,
        linesCovered: coverage.linesCovered,
        linesTotal: coverage.linesTotal,
        branchesCovered: coverage.branchesCovered,
        branchesTotal: coverage.branchesTotal,
        functionsCovered: coverage.functionsCovered,
        functionsTotal: coverage.functionsTotal,
        threshold,
      },
    };
  }

  /**
   * Parse lcov format coverage data into a CoverageReport.
   */
  static parseLcov(lcovContent: string): CoverageReport {
    const files: FileCoverage[] = [];
    const entries = CoverageAnalyzerCli.parseLcovEntries(lcovContent);

    for (const entry of entries) {
      files.push(CoverageAnalyzerCli.entryToFileCoverage(entry));
    }

    return { files };
  }

  static parseLcovEntries(lcovContent: string): LcovFileEntry[] {
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
        CoverageAnalyzerCli.parseLcovLine(trimmed, currentEntry);
      }
    }

    return entries;
  }

  private static parseLcovLine(line: string, entry: Partial<LcovFileEntry>): void {
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

  private static entryToFileCoverage(entry: LcovFileEntry): FileCoverage {
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
}
