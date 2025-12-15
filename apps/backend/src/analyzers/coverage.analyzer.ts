import { Injectable } from '@nestjs/common';
import type { AnalysisContext, Finding, FileCoverage, CoverageReport } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

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
@Injectable()
export class CoverageAnalyzer extends BaseAnalyzer {
  readonly name = 'coverage';
  // Coverage analyzer works with all file types - it checks coverage data
  readonly supportedExtensions = ['*'];

  private readonly DEFAULT_THRESHOLD = 40;

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Skip if no coverage report is available (Requirement 3.3)
    if (!context.coverageReport) {
      return findings;
    }

    const threshold = context.repoConfig.coverageThreshold ?? this.DEFAULT_THRESHOLD;

    // Get paths of modified files
    const modifiedPaths = new Set(context.files.map((f) => f.path));

    // Check coverage for each modified file
    for (const fileCoverage of context.coverageReport.files) {
      // Only check files that were modified in this PR
      if (!this.isModifiedFile(fileCoverage.path, modifiedPaths)) {
        continue;
      }

      // Check if coverage is below threshold
      if (fileCoverage.lineRate < threshold) {
        findings.push(this.createLowCoverageFinding(fileCoverage, threshold));
      }
    }

    return findings;
  }

  /**
   * Check if a coverage file path matches any modified file.
   */
  private isModifiedFile(coveragePath: string, modifiedPaths: Set<string>): boolean {
    // Direct match
    if (modifiedPaths.has(coveragePath)) {
      return true;
    }

    // Try normalized paths (remove leading ./ or /)
    const normalizedCoveragePath = this.normalizePath(coveragePath);
    for (const modifiedPath of modifiedPaths) {
      if (this.normalizePath(modifiedPath) === normalizedCoveragePath) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize a file path for comparison.
   */
  private normalizePath(path: string): string {
    return path.replace(/^\.?\//, '').toLowerCase();
  }

  /**
   * Create a LOW_COVERAGE finding for a file.
   */
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
   * LCOV format reference: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
   * 
   * @param lcovContent The raw lcov file content
   * @returns Parsed coverage report
   */
  static parseLcov(lcovContent: string): CoverageReport {
    const files: FileCoverage[] = [];
    const entries = CoverageAnalyzer.parseLcovEntries(lcovContent);

    for (const entry of entries) {
      files.push(CoverageAnalyzer.entryToFileCoverage(entry));
    }

    return { files };
  }

  /**
   * Parse lcov content into individual file entries.
   */
  static parseLcovEntries(lcovContent: string): LcovFileEntry[] {
    const entries: LcovFileEntry[] = [];
    const lines = lcovContent.split('\n');

    let currentEntry: Partial<LcovFileEntry> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('SF:')) {
        // Start of a new source file entry
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
        // End of current entry
        entries.push(currentEntry as LcovFileEntry);
        currentEntry = null;
      } else if (currentEntry) {
        // Parse coverage data lines
        CoverageAnalyzer.parseLcovLine(trimmed, currentEntry);
      }
    }

    return entries;
  }

  /**
   * Parse a single lcov line and update the entry.
   */
  private static parseLcovLine(line: string, entry: Partial<LcovFileEntry>): void {
    if (line.startsWith('LF:')) {
      // Lines Found (total lines)
      entry.linesTotal = parseInt(line.substring(3), 10) || 0;
    } else if (line.startsWith('LH:')) {
      // Lines Hit (covered lines)
      entry.linesCovered = parseInt(line.substring(3), 10) || 0;
    } else if (line.startsWith('BRF:')) {
      // Branches Found (total branches)
      entry.branchesTotal = parseInt(line.substring(4), 10) || 0;
    } else if (line.startsWith('BRH:')) {
      // Branches Hit (covered branches)
      entry.branchesCovered = parseInt(line.substring(4), 10) || 0;
    } else if (line.startsWith('FNF:')) {
      // Functions Found (total functions)
      entry.functionsTotal = parseInt(line.substring(4), 10) || 0;
    } else if (line.startsWith('FNH:')) {
      // Functions Hit (covered functions)
      entry.functionsCovered = parseInt(line.substring(4), 10) || 0;
    }
  }

  /**
   * Convert an lcov entry to a FileCoverage object.
   */
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

  /**
   * Serialize coverage data to JSON (for round-trip testing).
   */
  static serializeCoverage(report: CoverageReport): string {
    return JSON.stringify(report);
  }

  /**
   * Deserialize coverage data from JSON.
   */
  static deserializeCoverage(json: string): CoverageReport {
    return JSON.parse(json) as CoverageReport;
  }
}
