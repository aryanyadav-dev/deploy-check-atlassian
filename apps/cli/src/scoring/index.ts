/**
 * Risk Scoring Module for CLI
 * Calculates risk scores and classifies severity levels
 */

import type { Finding } from '@dra/types';

/**
 * Base scores for each finding type
 * Reduced weights for less aggressive scoring
 * (Requirements 4.1)
 */
const FINDING_SCORES: Record<string, number> = {
  BREAKING_API: 25,
  DESTRUCTIVE_MIGRATION: 30,
  PERMISSION_CHANGE: 20,
  LOW_COVERAGE: 10,
  UNDOCUMENTED_API: 5,
};

/**
 * Risk level thresholds
 * (Requirements 4.2, 4.3, 4.4, 4.5)
 */
const RISK_THRESHOLDS = {
  CRITICAL: 80,
  HIGH: 60,
  MEDIUM: 35,
};

/**
 * Calculate total risk score from findings
 * Score is capped at 100 (maximum risk)
 * @param findings Array of findings
 * @returns Total risk score (0-100)
 */
export function calculateRiskScore(findings: Finding[]): number {
  let score = 0;

  for (const finding of findings) {
    const baseScore = FINDING_SCORES[finding.type] ?? 0;
    score += baseScore;
  }

  // Cap score at 100 (maximum risk)
  return Math.min(score, 100);
}

/**
 * Classify risk level based on score
 * @param score Risk score
 * @returns Risk level string
 */
export function classifyRiskLevel(score: number): string {
  if (score >= RISK_THRESHOLDS.CRITICAL) {
    return 'CRITICAL';
  }
  if (score >= RISK_THRESHOLDS.HIGH) {
    return 'HIGH';
  }
  if (score >= RISK_THRESHOLDS.MEDIUM) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Get score breakdown by finding type
 * @param findings Array of findings
 * @returns Score breakdown object
 */
export function getScoreBreakdown(findings: Finding[]): Record<string, { count: number; score: number }> {
  const breakdown: Record<string, { count: number; score: number }> = {};

  for (const finding of findings) {
    const type = finding.type;
    const baseScore = FINDING_SCORES[type] ?? 0;

    if (!breakdown[type]) {
      breakdown[type] = { count: 0, score: 0 };
    }

    breakdown[type].count++;
    breakdown[type].score += baseScore;
  }

  return breakdown;
}
