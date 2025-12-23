import type { Finding, RiskLevel, FindingType } from '@dra/types';

/**
 * Base scores for each finding type as per Requirements 4.1
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
 * 
 * Property 15: Risk Score Calculation
 * For any set of findings, the risk score equals the sum of:
 * (count of BREAKING_API × 40) + (count of DESTRUCTIVE_MIGRATION × 50) +
 * (count of PERMISSION_CHANGE × 30) + (count of LOW_COVERAGE × 20) +
 * (count of UNDOCUMENTED_API × 10)
 */
export function calculateRiskScore(findings: Finding[]): number {
  return findings.reduce((score, finding) => {
    return score + (FINDING_BASE_SCORES[finding.type] || 0);
  }, 0);
}

/**
 * Classify risk level based on score.
 * 
 * Property 16: Risk Severity Classification
 * CRITICAL if score ≥ 80, HIGH if 60 ≤ score < 80,
 * MEDIUM if 35 ≤ score < 60, LOW if score < 35
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
 * Serialize risk score breakdown to JSON.
 * 
 * Property 3: Risk Score Serialization Round-Trip
 * For any risk score calculation result, serializing to JSON and
 * deserializing should produce an equivalent score breakdown.
 */
export function serializeRiskScoreBreakdown(breakdown: RiskScoreBreakdown): string {
  return JSON.stringify(breakdown);
}

/**
 * Deserialize risk score breakdown from JSON.
 */
export function deserializeRiskScoreBreakdown(json: string): RiskScoreBreakdown {
  return JSON.parse(json) as RiskScoreBreakdown;
}
