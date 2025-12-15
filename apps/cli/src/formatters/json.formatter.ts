/**
 * JSON Output Formatter
 * Outputs structured JSON for piping to other tools (jq, etc.)
 * Requirements: 4.6, 9.5
 */

import type { Finding, RiskLevel } from '@dra/types';

/**
 * Extended finding with optional Jira issue link
 */
export interface LinkedFinding extends Finding {
  jiraIssueKey?: string;
}

/**
 * Options for JSON formatting
 */
export interface JsonFormatterOptions {
  /**
   * Pretty print with indentation
   */
  pretty?: boolean;

  /**
   * Include metadata in output
   */
  includeMetadata?: boolean;

  /**
   * Include timestamps
   */
  includeTimestamps?: boolean;
}

/**
 * Score breakdown by finding type
 */
export interface ScoreBreakdown {
  type: string;
  count: number;
  score: number;
}

/**
 * Structured JSON output format
 */
export interface JsonOutput {
  /**
   * Analysis metadata
   */
  metadata: {
    version: string;
    timestamp: string;
    filesAnalyzed: number;
    analyzersRun: string[];
  };

  /**
   * Risk assessment
   */
  risk: {
    score: number;
    level: RiskLevel | string;
    breakdown: ScoreBreakdown[];
  };

  /**
   * All findings
   */
  findings: LinkedFinding[];

  /**
   * Findings grouped by type
   */
  findingsByType: Record<string, LinkedFinding[]>;

  /**
   * Findings grouped by severity
   */
  findingsBySeverity: Record<string, LinkedFinding[]>;

  /**
   * Summary statistics
   */
  summary: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    linkedToJira: number;
  };

  /**
   * Warnings generated during analysis
   */
  warnings: string[];
}

/**
 * Base scores for each finding type (matching scoring module)
 */
const FINDING_SCORES: Record<string, number> = {
  BREAKING_API: 40,
  DESTRUCTIVE_MIGRATION: 50,
  PERMISSION_CHANGE: 30,
  LOW_COVERAGE: 20,
  UNDOCUMENTED_API: 10,
};

/**
 * JSON formatter for CLI output
 */
export class JsonFormatter {
  private options: Required<JsonFormatterOptions>;

  constructor(options: JsonFormatterOptions = {}) {
    this.options = {
      pretty: options.pretty ?? true,
      includeMetadata: options.includeMetadata ?? true,
      includeTimestamps: options.includeTimestamps ?? true,
    };
  }

  /**
   * Format analysis results as JSON string
   */
  format(
    findings: LinkedFinding[],
    riskScore: number,
    riskLevel: RiskLevel | string,
    filesAnalyzed: number,
    analyzersRun: string[],
    warnings: string[] = []
  ): string {
    const output = this.buildOutput(
      findings,
      riskScore,
      riskLevel,
      filesAnalyzed,
      analyzersRun,
      warnings
    );

    return this.options.pretty
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);
  }

  /**
   * Build the structured output object
   */
  buildOutput(
    findings: LinkedFinding[],
    riskScore: number,
    riskLevel: RiskLevel | string,
    filesAnalyzed: number,
    analyzersRun: string[],
    warnings: string[] = []
  ): JsonOutput {
    const findingsByType = this.groupByType(findings);
    const findingsBySeverity = this.groupBySeverity(findings);
    const breakdown = this.calculateBreakdown(findings);
    const summary = this.calculateSummary(findings);

    const output: JsonOutput = {
      metadata: {
        version: '0.0.1',
        timestamp: this.options.includeTimestamps ? new Date().toISOString() : '',
        filesAnalyzed,
        analyzersRun,
      },
      risk: {
        score: riskScore,
        level: riskLevel,
        breakdown,
      },
      findings,
      findingsByType,
      findingsBySeverity,
      summary,
      warnings,
    };

    if (!this.options.includeMetadata) {
      delete (output as Partial<JsonOutput>).metadata;
    }

    return output;
  }

  /**
   * Group findings by type
   */
  private groupByType(findings: LinkedFinding[]): Record<string, LinkedFinding[]> {
    const grouped: Record<string, LinkedFinding[]> = {};

    for (const finding of findings) {
      if (!grouped[finding.type]) {
        grouped[finding.type] = [];
      }
      grouped[finding.type].push(finding);
    }

    return grouped;
  }

  /**
   * Group findings by severity
   */
  private groupBySeverity(findings: LinkedFinding[]): Record<string, LinkedFinding[]> {
    const grouped: Record<string, LinkedFinding[]> = {};

    for (const finding of findings) {
      if (!grouped[finding.severity]) {
        grouped[finding.severity] = [];
      }
      grouped[finding.severity].push(finding);
    }

    return grouped;
  }

  /**
   * Calculate score breakdown by finding type
   */
  private calculateBreakdown(findings: LinkedFinding[]): ScoreBreakdown[] {
    const typeMap = new Map<string, { count: number; score: number }>();

    for (const finding of findings) {
      const existing = typeMap.get(finding.type) || { count: 0, score: 0 };
      const baseScore = FINDING_SCORES[finding.type] ?? 0;
      existing.count++;
      existing.score += baseScore;
      typeMap.set(finding.type, existing);
    }

    return Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      score: data.score,
    }));
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(findings: LinkedFinding[]): JsonOutput['summary'] {
    return {
      totalFindings: findings.length,
      criticalCount: findings.filter((f) => f.severity === 'CRITICAL').length,
      highCount: findings.filter((f) => f.severity === 'HIGH').length,
      mediumCount: findings.filter((f) => f.severity === 'MEDIUM').length,
      lowCount: findings.filter((f) => f.severity === 'LOW').length,
      linkedToJira: findings.filter((f) => f.jiraIssueKey).length,
    };
  }

  /**
   * Format error as JSON
   */
  formatError(error: string): string {
    const output = {
      error: true,
      message: error,
      timestamp: this.options.includeTimestamps ? new Date().toISOString() : undefined,
    };

    return this.options.pretty
      ? JSON.stringify(output, null, 2)
      : JSON.stringify(output);
  }
}

/**
 * Create a default JSON formatter instance
 */
export function createJsonFormatter(options?: JsonFormatterOptions): JsonFormatter {
  return new JsonFormatter(options);
}
