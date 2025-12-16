/**
 * Analysis Service
 *
 * Wraps backend analyzers for Forge runtime.
 * Provides analysis engine that integrates with shared analyzer implementations.
 *
 * Requirements: 8.1, 8.4
 */

import type { Finding, AnalysisContext, Analyzer, Severity } from '@dra/types';
import type { AnalysisResult, AnalysisSummary, Solution } from '../types';
import { calculateRiskScore } from './risk-score.utils';
import { solutionService } from './solution.service';

/**
 * Interface for the analysis engine
 */
export interface IAnalysisEngine {
  analyze(context: AnalysisContext): Promise<AnalysisResult>;
  getFindings(resultId: string): Promise<Finding[]>;
}

/**
 * Error information for failed analyzers
 */
export interface AnalyzerError {
  analyzerName: string;
  error: string;
}

/**
 * Result cache for storing analysis results
 */
const resultCache = new Map<string, AnalysisResult>();

/**
 * AnalysisEngine wraps backend analyzers for Forge runtime.
 * Handles analyzer errors gracefully by catching and continuing with other analyzers.
 *
 * Requirements: 8.1, 8.4
 */
export class AnalysisEngine implements IAnalysisEngine {
  private readonly analyzers: Analyzer[] = [];
  private readonly errors: AnalyzerError[] = [];

  /**
   * Create a new AnalysisEngine with the given analyzers
   */
  constructor(analyzers: Analyzer[] = []) {
    this.analyzers = analyzers;
  }

  /**
   * Register an analyzer with the engine
   */
  registerAnalyzer(analyzer: Analyzer): void {
    this.analyzers.push(analyzer);
  }

  /**
   * Get all registered analyzers
   */
  getAnalyzers(): Analyzer[] {
    return [...this.analyzers];
  }

  /**
   * Get errors from the last analysis run
   */
  getErrors(): AnalyzerError[] {
    return [...this.errors];
  }

  /**
   * Run analysis on the given context using all registered analyzers.
   * Handles analyzer errors gracefully - catches errors and continues with other analyzers.
   *
   * Requirements: 8.1, 8.4
   */
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    // Clear previous errors
    this.errors.length = 0;

    const allFindings: Finding[] = [];

    // Run each analyzer, catching errors to continue with others
    for (const analyzer of this.analyzers) {
      try {
        const findings = await analyzer.analyze(context);
        allFindings.push(...findings);
      } catch (error) {
        // Requirement 8.4: Catch analyzer errors and report as analysis failure
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.errors.push({
          analyzerName: analyzer.name,
          error: errorMessage,
        });
        // Continue with other analyzers
      }
    }

    // Calculate risk score using shared calculator
    const riskScore = calculateRiskScore(allFindings);

    // Generate summary
    const summary = this.generateSummary(allFindings);

    // Generate solutions for each finding (Requirement 2.2)
    const solutions = this.generateSolutions(allFindings);

    // Create result
    const result: AnalysisResult = {
      id: this.generateResultId(),
      timestamp: new Date(),
      findings: allFindings,
      riskScore,
      summary,
      solutions,
    };

    // Cache the result
    resultCache.set(result.id, result);

    return result;
  }

  /**
   * Get findings from a cached analysis result
   */
  async getFindings(resultId: string): Promise<Finding[]> {
    const result = resultCache.get(resultId);
    if (!result) {
      return [];
    }
    return result.findings;
  }

  /**
   * Get a cached analysis result by ID
   */
  getResult(resultId: string): AnalysisResult | undefined {
    return resultCache.get(resultId);
  }

  /**
   * Generate a unique result ID
   */
  private generateResultId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `analysis-${timestamp}-${random}`;
  }

  /**
   * Generate summary statistics for findings
   */
  private generateSummary(findings: Finding[]): AnalysisSummary {
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const finding of findings) {
      // Count by severity
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;

      // Count by type
      byType[finding.type] = (byType[finding.type] || 0) + 1;
    }

    return {
      totalFindings: findings.length,
      bySeverity,
      byType,
    };
  }

  /**
   * Generate solutions for all findings
   * Requirement 2.2: Provide mitigation suggestions
   */
  private generateSolutions(findings: Finding[]): Solution[] {
    const solutions: Solution[] = [];

    for (const finding of findings) {
      const solution = solutionService.generateSolution(finding);
      solutions.push(solution);
    }

    // Sort by urgency (immediate > high > medium > low)
    const urgencyOrder: Record<string, number> = {
      immediate: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    solutions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    return solutions;
  }
}

/**
 * Group findings by severity level.
 * Returns a Map where keys are severity levels and values are arrays of findings.
 *
 * Requirement 1.3: Display findings grouped by severity level
 */
export function groupBySeverity(findings: Finding[]): Map<Severity, Finding[]> {
  const grouped = new Map<Severity, Finding[]>();

  for (const finding of findings) {
    const existing = grouped.get(finding.severity) || [];
    existing.push(finding);
    grouped.set(finding.severity, existing);
  }

  return grouped;
}

/**
 * Get the maximum severity from a set of findings.
 * Returns null if the findings array is empty.
 *
 * Requirement 6.2: Badge uses highest severity finding
 */
export function getMaxSeverity(findings: Finding[]): Severity | null {
  if (findings.length === 0) {
    return null;
  }

  const severityOrder: Record<Severity, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  let maxSeverity: Severity = findings[0].severity;
  let maxOrder = severityOrder[maxSeverity];

  for (const finding of findings) {
    const order = severityOrder[finding.severity];
    if (order > maxOrder) {
      maxOrder = order;
      maxSeverity = finding.severity;
    }
  }

  return maxSeverity;
}

// Export singleton instance with no analyzers (to be configured)
export const analysisEngine = new AnalysisEngine();
