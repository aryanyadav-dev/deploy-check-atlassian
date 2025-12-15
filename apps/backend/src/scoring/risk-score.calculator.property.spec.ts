import * as fc from 'fast-check';
import type { Finding, FindingType, Severity } from '@dra/types';
import {
  calculateRiskScore,
  classifyRiskLevel,
  calculateRiskScoreWithBreakdown,
  serializeRiskScoreBreakdown,
  deserializeRiskScoreBreakdown,
  FINDING_BASE_SCORES,
  RiskScoreBreakdown,
} from './risk-score.calculator';

/**
 * Property tests for Risk Score Calculator
 */

// Generator for finding types
const findingTypeArb: fc.Arbitrary<FindingType> = fc.constantFrom(
  'BREAKING_API',
  'DESTRUCTIVE_MIGRATION',
  'PERMISSION_CHANGE',
  'LOW_COVERAGE',
  'UNDOCUMENTED_API',
);

// Generator for severity
const severityArb: fc.Arbitrary<Severity> = fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

// Generator for a single finding
const findingArb: fc.Arbitrary<Finding> = fc
  .tuple(
    findingTypeArb,
    severityArb,
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ minLength: 1, maxLength: 500 }),
  )
  .map(([type, severity, title, description]) => ({
    type,
    severity,
    title,
    description,
  }));

// Generator for array of findings
const findingsArb = fc.array(findingArb, { minLength: 0, maxLength: 20 });

describe('Risk Score Calculation Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 15: Risk Score Calculation**
   * **Validates: Requirements 4.1**
   *
   * For any set of findings, the risk score should equal the sum of:
   * (count of BREAKING_API × 40) + (count of DESTRUCTIVE_MIGRATION × 50) +
   * (count of PERMISSION_CHANGE × 30) + (count of LOW_COVERAGE × 20) +
   * (count of UNDOCUMENTED_API × 10)
   */

  it('should calculate risk score as sum of base scores for each finding type', () => {
    fc.assert(
      fc.property(findingsArb, (findings) => {
        const score = calculateRiskScore(findings);

        // Calculate expected score manually
        const expectedScore = findings.reduce((sum, finding) => {
          return sum + FINDING_BASE_SCORES[finding.type];
        }, 0);

        expect(score).toBe(expectedScore);
      }),
      { numRuns: 100 },
    );
  });

  it('should return 0 for empty findings array', () => {
    const score = calculateRiskScore([]);
    expect(score).toBe(0);
  });

  it('should correctly sum scores for each finding type', () => {
    fc.assert(
      fc.property(
        fc.record({
          breakingApi: fc.integer({ min: 0, max: 5 }),
          destructiveMigration: fc.integer({ min: 0, max: 5 }),
          permissionChange: fc.integer({ min: 0, max: 5 }),
          lowCoverage: fc.integer({ min: 0, max: 5 }),
          undocumentedApi: fc.integer({ min: 0, max: 5 }),
        }),
        (counts) => {
          // Create findings based on counts
          const findings: Finding[] = [];

          for (let i = 0; i < counts.breakingApi; i++) {
            findings.push({ type: 'BREAKING_API', severity: 'HIGH', title: 't', description: 'd' });
          }
          for (let i = 0; i < counts.destructiveMigration; i++) {
            findings.push({
              type: 'DESTRUCTIVE_MIGRATION',
              severity: 'CRITICAL',
              title: 't',
              description: 'd',
            });
          }
          for (let i = 0; i < counts.permissionChange; i++) {
            findings.push({
              type: 'PERMISSION_CHANGE',
              severity: 'MEDIUM',
              title: 't',
              description: 'd',
            });
          }
          for (let i = 0; i < counts.lowCoverage; i++) {
            findings.push({
              type: 'LOW_COVERAGE',
              severity: 'MEDIUM',
              title: 't',
              description: 'd',
            });
          }
          for (let i = 0; i < counts.undocumentedApi; i++) {
            findings.push({
              type: 'UNDOCUMENTED_API',
              severity: 'LOW',
              title: 't',
              description: 'd',
            });
          }

          const score = calculateRiskScore(findings);

          const expectedScore =
            counts.breakingApi * 40 +
            counts.destructiveMigration * 50 +
            counts.permissionChange * 30 +
            counts.lowCoverage * 20 +
            counts.undocumentedApi * 10;

          expect(score).toBe(expectedScore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should be additive (score of combined findings equals sum of individual scores)', () => {
    fc.assert(
      fc.property(findingsArb, findingsArb, (findings1, findings2) => {
        const score1 = calculateRiskScore(findings1);
        const score2 = calculateRiskScore(findings2);
        const combinedScore = calculateRiskScore([...findings1, ...findings2]);

        expect(combinedScore).toBe(score1 + score2);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Risk Severity Classification Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 16: Risk Severity Classification**
   * **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
   *
   * For any risk score value, the severity classification should be:
   * CRITICAL if score ≥ 80, HIGH if 60 ≤ score < 80,
   * MEDIUM if 35 ≤ score < 60, LOW if score < 35
   */

  it('should classify scores >= 80 as CRITICAL', () => {
    fc.assert(
      fc.property(fc.integer({ min: 80, max: 1000 }), (score) => {
        expect(classifyRiskLevel(score)).toBe('CRITICAL');
      }),
      { numRuns: 100 },
    );
  });

  it('should classify scores 60-79 as HIGH', () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 79 }), (score) => {
        expect(classifyRiskLevel(score)).toBe('HIGH');
      }),
      { numRuns: 100 },
    );
  });

  it('should classify scores 35-59 as MEDIUM', () => {
    fc.assert(
      fc.property(fc.integer({ min: 35, max: 59 }), (score) => {
        expect(classifyRiskLevel(score)).toBe('MEDIUM');
      }),
      { numRuns: 100 },
    );
  });

  it('should classify scores < 35 as LOW', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 34 }), (score) => {
        expect(classifyRiskLevel(score)).toBe('LOW');
      }),
      { numRuns: 100 },
    );
  });

  it('should handle boundary values correctly', () => {
    // Exact boundary tests
    expect(classifyRiskLevel(0)).toBe('LOW');
    expect(classifyRiskLevel(34)).toBe('LOW');
    expect(classifyRiskLevel(35)).toBe('MEDIUM');
    expect(classifyRiskLevel(59)).toBe('MEDIUM');
    expect(classifyRiskLevel(60)).toBe('HIGH');
    expect(classifyRiskLevel(79)).toBe('HIGH');
    expect(classifyRiskLevel(80)).toBe('CRITICAL');
  });

  it('should classify findings-based scores correctly', () => {
    fc.assert(
      fc.property(findingsArb, (findings) => {
        const score = calculateRiskScore(findings);
        const level = classifyRiskLevel(score);

        if (score >= 80) {
          expect(level).toBe('CRITICAL');
        } else if (score >= 60) {
          expect(level).toBe('HIGH');
        } else if (score >= 35) {
          expect(level).toBe('MEDIUM');
        } else {
          expect(level).toBe('LOW');
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Risk Score Serialization Round-Trip Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 3: Risk Score Serialization Round-Trip**
   * **Validates: Requirements 4.6**
   *
   * For any risk score calculation result containing score breakdown by finding type,
   * serializing to JSON and deserializing should produce an equivalent score breakdown.
   */

  // Generator for breakdown entry
  const breakdownEntryArb = fc
    .tuple(findingTypeArb, fc.integer({ min: 0, max: 10 }))
    .map(([findingType, count]) => ({
      findingType,
      count,
      baseScore: FINDING_BASE_SCORES[findingType],
      subtotal: count * FINDING_BASE_SCORES[findingType],
    }));

  // Generator for risk score breakdown
  const riskScoreBreakdownArb: fc.Arbitrary<RiskScoreBreakdown> = fc
    .array(breakdownEntryArb, { minLength: 0, maxLength: 5 })
    .map((breakdown) => {
      const totalScore = breakdown.reduce((sum, entry) => sum + entry.subtotal, 0);
      return {
        totalScore,
        riskLevel: classifyRiskLevel(totalScore),
        breakdown,
      };
    });

  it('should round-trip serialize and deserialize risk score breakdown', () => {
    fc.assert(
      fc.property(riskScoreBreakdownArb, (breakdown) => {
        const serialized = serializeRiskScoreBreakdown(breakdown);
        const deserialized = deserializeRiskScoreBreakdown(serialized);

        expect(deserialized.totalScore).toBe(breakdown.totalScore);
        expect(deserialized.riskLevel).toBe(breakdown.riskLevel);
        expect(deserialized.breakdown).toHaveLength(breakdown.breakdown.length);

        for (let i = 0; i < breakdown.breakdown.length; i++) {
          const original = breakdown.breakdown[i];
          const restored = deserialized.breakdown[i];

          expect(restored.findingType).toBe(original.findingType);
          expect(restored.count).toBe(original.count);
          expect(restored.baseScore).toBe(original.baseScore);
          expect(restored.subtotal).toBe(original.subtotal);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should round-trip breakdown calculated from findings', () => {
    fc.assert(
      fc.property(findingsArb, (findings) => {
        const breakdown = calculateRiskScoreWithBreakdown(findings);
        const serialized = serializeRiskScoreBreakdown(breakdown);
        const deserialized = deserializeRiskScoreBreakdown(serialized);

        expect(deserialized.totalScore).toBe(breakdown.totalScore);
        expect(deserialized.riskLevel).toBe(breakdown.riskLevel);
        expect(deserialized.breakdown).toHaveLength(breakdown.breakdown.length);
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve empty breakdown', () => {
    const emptyBreakdown: RiskScoreBreakdown = {
      totalScore: 0,
      riskLevel: 'LOW',
      breakdown: [],
    };

    const serialized = serializeRiskScoreBreakdown(emptyBreakdown);
    const deserialized = deserializeRiskScoreBreakdown(serialized);

    expect(deserialized.totalScore).toBe(0);
    expect(deserialized.riskLevel).toBe('LOW');
    expect(deserialized.breakdown).toHaveLength(0);
  });
});
