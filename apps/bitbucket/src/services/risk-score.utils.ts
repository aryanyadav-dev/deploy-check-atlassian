/**
 * Risk Score Utilities
 *
 * Wraps the shared risk-score calculator from the backend package
 * for use in the Forge runtime.
 */

import type { Finding, FindingType, RiskLevel } from '@dra/types';

/**
 * Base scores for each finding type
 * Matches the backend calculator (Requirements 8.3)
 */
export const FINDING_BASE_SCORES: Record<FindingType, number> = {
  BREAKING_API: 40,
  DESTRUCTIVE_MIGRATION: 50,
  PERMISSION_CHANGE: 30,
  LOW_COVERAGE: 20,
  UNDOCUMENTED_API: 10,
};

/**
 * Risk score breakdown by finding type
 */
export interface RiskScoreBreakdown {
  totalScore: number;
  riskLevel: RiskLevel;
  breakdown: {
    findingType: FindingType;
    count: number;
    baseScore: number;
    subtotal: number;
  }[];
}

/**
 * Calculate the risk score from a set of findings.
 * Uses the same algorithm as the shared risk-score calculator.
 *
 * Property 13: Risk Score Calculation Consistency
 * For any set of findings, the Forge app's risk score calculation SHALL produce
 * the same score as the shared risk-score calculator from the backend package.
 */
export function calculateRiskScore(findings: Finding[]): number {
  return findings.reduce((score, finding) => {
    return score + (FINDING_BASE_SCORES[finding.type] || 0);
  }, 0);
}

/**
 * Classify risk level based on score.
 * CRITICAL if score >= 80, HIGH if 60 <= score < 80,
 * MEDIUM if 35 <= score < 60, LOW if score < 35
 */
export function classifyRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

/**
 * Calculate risk score with detailed breakdown.
 * Returns the total score, risk level, and breakdown by finding type.
 */
export function calculateRiskScoreWithBreakdown(findings: Finding[]): RiskScoreBreakdown {
  // Count findings by type
  const countsByType = new Map<FindingType, number>();

  for (const finding of findings) {
    const current = countsByType.get(finding.type) || 0;
    countsByType.set(finding.type, current + 1);
  }

  // Build breakdown
  const breakdown: RiskScoreBreakdown['breakdown'] = [];
  let totalScore = 0;

  for (const [findingType, count] of countsByType) {
    const baseScore = FINDING_BASE_SCORES[findingType] || 0;
    const subtotal = count * baseScore;
    totalScore += subtotal;

    breakdown.push({
      findingType,
      count,
      baseScore,
      subtotal,
    });
  }

  return {
    totalScore,
    riskLevel: classifyRiskLevel(totalScore),
    breakdown,
  };
}

/**
 * RiskScoreCalculator class wrapper for Forge context.
 * Provides a class-based interface for risk score calculations
 * that can be used with Forge's dependency injection patterns.
 */
export class RiskScoreCalculator {
  /**
   * Calculate the risk score from a set of findings.
   */
  calculate(findings: Finding[]): number {
    return calculateRiskScore(findings);
  }

  /**
   * Classify risk level based on score.
   */
  classify(score: number): RiskLevel {
    return classifyRiskLevel(score);
  }

  /**
   * Calculate risk score with detailed breakdown.
   */
  calculateWithBreakdown(findings: Finding[]): RiskScoreBreakdown {
    return calculateRiskScoreWithBreakdown(findings);
  }

  /**
   * Get the base score for a finding type.
   */
  getBaseScore(findingType: FindingType): number {
    return FINDING_BASE_SCORES[findingType] || 0;
  }
}

// Export singleton instance for convenience
export const riskScoreCalculator = new RiskScoreCalculator();
