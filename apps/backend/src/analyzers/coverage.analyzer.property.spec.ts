import * as fc from 'fast-check';
import { CoverageAnalyzer } from './coverage.analyzer';
import type { CoverageReport, FileCoverage, AnalysisContext } from '@dra/types';

/**
 * Property tests for Coverage Analyzer
 */

describe('LCOV Parsing Completeness Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 17: LCOV Parsing Completeness**
   *
   * For any valid lcov format coverage report, parsing should extract line coverage
   * percentage, branch coverage percentage, and function coverage percentage for each file entry.
   */

  // Generator for valid file paths
  const filePathArb = fc
    .tuple(
      fc.constantFrom('src/', 'lib/', 'app/', 'packages/', ''),
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
      fc.constantFrom('.ts', '.js', '.tsx', '.jsx', '.py', '.java'),
    )
    .map(([dir, name, ext]) => `${dir}${name}${ext}`)
    .filter((s) => s.length > 2 && s.length <= 100);

  // Generator for coverage counts (covered must be <= total)
  const coverageCountsArb = fc
    .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }))
    .map(([covered, extra]) => ({
      covered,
      total: covered + extra,
    }));

  // Generator for a single lcov file entry
  const lcovEntryArb = fc
    .tuple(filePathArb, coverageCountsArb, coverageCountsArb, coverageCountsArb)
    .map(([path, lines, branches, functions]) => ({
      path,
      linesCovered: lines.covered,
      linesTotal: lines.total,
      branchesCovered: branches.covered,
      branchesTotal: branches.total,
      functionsCovered: functions.covered,
      functionsTotal: functions.total,
    }));

  // Generate lcov string from entry data
  const generateLcov = (entries: Array<{
    path: string;
    linesCovered: number;
    linesTotal: number;
    branchesCovered: number;
    branchesTotal: number;
    functionsCovered: number;
    functionsTotal: number;
  }>): string => {
    return entries
      .map(
        (e) => `SF:${e.path}
FNF:${e.functionsTotal}
FNH:${e.functionsCovered}
LF:${e.linesTotal}
LH:${e.linesCovered}
BRF:${e.branchesTotal}
BRH:${e.branchesCovered}
end_of_record`,
      )
      .join('\n');
  };

  it('should extract line coverage percentage for each file entry', () => {
    fc.assert(
      fc.property(fc.array(lcovEntryArb, { minLength: 1, maxLength: 10 }), (entries) => {
        const lcov = generateLcov(entries);
        const result = CoverageAnalyzer.parseLcov(lcov);

        expect(result.files).toHaveLength(entries.length);

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const parsed = result.files[i];

          // Verify line coverage is extracted
          expect(parsed.linesCovered).toBe(entry.linesCovered);
          expect(parsed.linesTotal).toBe(entry.linesTotal);

          // Verify line rate calculation
          const expectedLineRate =
            entry.linesTotal > 0 ? (entry.linesCovered / entry.linesTotal) * 100 : 0;
          expect(parsed.lineRate).toBeCloseTo(expectedLineRate, 5);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should extract branch coverage percentage for each file entry', () => {
    fc.assert(
      fc.property(fc.array(lcovEntryArb, { minLength: 1, maxLength: 10 }), (entries) => {
        const lcov = generateLcov(entries);
        const result = CoverageAnalyzer.parseLcov(lcov);

        expect(result.files).toHaveLength(entries.length);

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const parsed = result.files[i];

          // Verify branch coverage is extracted
          expect(parsed.branchesCovered).toBe(entry.branchesCovered);
          expect(parsed.branchesTotal).toBe(entry.branchesTotal);

          // Verify branch rate calculation
          const expectedBranchRate =
            entry.branchesTotal > 0 ? (entry.branchesCovered / entry.branchesTotal) * 100 : 0;
          expect(parsed.branchRate).toBeCloseTo(expectedBranchRate, 5);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should extract function coverage percentage for each file entry', () => {
    fc.assert(
      fc.property(fc.array(lcovEntryArb, { minLength: 1, maxLength: 10 }), (entries) => {
        const lcov = generateLcov(entries);
        const result = CoverageAnalyzer.parseLcov(lcov);

        expect(result.files).toHaveLength(entries.length);

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const parsed = result.files[i];

          // Verify function coverage is extracted
          expect(parsed.functionsCovered).toBe(entry.functionsCovered);
          expect(parsed.functionsTotal).toBe(entry.functionsTotal);

          // Verify function rate calculation
          const expectedFunctionRate =
            entry.functionsTotal > 0 ? (entry.functionsCovered / entry.functionsTotal) * 100 : 0;
          expect(parsed.functionRate).toBeCloseTo(expectedFunctionRate, 5);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve file paths exactly', () => {
    fc.assert(
      fc.property(fc.array(lcovEntryArb, { minLength: 1, maxLength: 10 }), (entries) => {
        const lcov = generateLcov(entries);
        const result = CoverageAnalyzer.parseLcov(lcov);

        expect(result.files).toHaveLength(entries.length);

        for (let i = 0; i < entries.length; i++) {
          expect(result.files[i].path).toBe(entries[i].path);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should handle zero totals gracefully (0% coverage)', () => {
    fc.assert(
      fc.property(filePathArb, (path) => {
        const lcov = `SF:${path}
FNF:0
FNH:0
LF:0
LH:0
BRF:0
BRH:0
end_of_record`;

        const result = CoverageAnalyzer.parseLcov(lcov);

        expect(result.files).toHaveLength(1);
        expect(result.files[0].lineRate).toBe(0);
        expect(result.files[0].branchRate).toBe(0);
        expect(result.files[0].functionRate).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Coverage Threshold Detection Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 18: Coverage Threshold Detection**
   *
   * For any modified file with coverage percentage below the configured threshold,
   * the coverage analyzer should produce a Finding of type LOW_COVERAGE with severity MEDIUM.
   */
  const analyzer = new CoverageAnalyzer();

  // Generator for file paths
  const filePathArb = fc
    .tuple(
      fc.constantFrom('src/', 'lib/', 'app/', ''),
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
      fc.constantFrom('.ts', '.js'),
    )
    .map(([dir, name, ext]) => `${dir}${name}${ext}`)
    .filter((s) => s.length > 2 && s.length <= 50);

  // Generator for threshold values
  const thresholdArb = fc.integer({ min: 1, max: 99 });

  it('should generate LOW_COVERAGE finding for files below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, thresholdArb, async (filePath, threshold) => {
        // Generate coverage below threshold
        const lineRate = Math.max(0, threshold - 1 - Math.floor(Math.random() * 10));

        const context: AnalysisContext = {
          files: [{ path: filePath, oldContent: null, newContent: 'code', hunks: [] }],
          diff: '',
          repoConfig: { coverageThreshold: threshold },
          coverageReport: {
            files: [
              {
                path: filePath,
                lineRate,
                branchRate: lineRate,
                functionRate: lineRate,
                linesCovered: lineRate,
                linesTotal: 100,
                branchesCovered: lineRate,
                branchesTotal: 100,
                functionsCovered: lineRate,
                functionsTotal: 100,
              },
            ],
          },
        };

        const findings = await analyzer.analyze(context);

        expect(findings.length).toBe(1);
        expect(findings[0].type).toBe('LOW_COVERAGE');
        expect(findings[0].severity).toBe('MEDIUM');
        expect(findings[0].filePath).toBe(filePath);
      }),
      { numRuns: 100 },
    );
  });

  it('should not generate finding for files at or above threshold', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, thresholdArb, async (filePath, threshold) => {
        // Generate coverage at or above threshold
        const lineRate = threshold + Math.floor(Math.random() * (100 - threshold));

        const context: AnalysisContext = {
          files: [{ path: filePath, oldContent: null, newContent: 'code', hunks: [] }],
          diff: '',
          repoConfig: { coverageThreshold: threshold },
          coverageReport: {
            files: [
              {
                path: filePath,
                lineRate,
                branchRate: lineRate,
                functionRate: lineRate,
                linesCovered: lineRate,
                linesTotal: 100,
                branchesCovered: lineRate,
                branchesTotal: 100,
                functionsCovered: lineRate,
                functionsTotal: 100,
              },
            ],
          },
        };

        const findings = await analyzer.analyze(context);

        expect(findings).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should only check modified files', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, filePathArb, async (modifiedPath, unmodifiedPath) => {
        // Skip if paths are the same
        if (modifiedPath === unmodifiedPath) return;

        const context: AnalysisContext = {
          files: [{ path: modifiedPath, oldContent: null, newContent: 'code', hunks: [] }],
          diff: '',
          repoConfig: { coverageThreshold: 50 },
          coverageReport: {
            files: [
              {
                path: modifiedPath,
                lineRate: 30,
                branchRate: 30,
                functionRate: 30,
                linesCovered: 30,
                linesTotal: 100,
                branchesCovered: 30,
                branchesTotal: 100,
                functionsCovered: 30,
                functionsTotal: 100,
              },
              {
                path: unmodifiedPath,
                lineRate: 10,
                branchRate: 10,
                functionRate: 10,
                linesCovered: 10,
                linesTotal: 100,
                branchesCovered: 10,
                branchesTotal: 100,
                functionsCovered: 10,
                functionsTotal: 100,
              },
            ],
          },
        };

        const findings = await analyzer.analyze(context);

        // Should only have finding for modified file
        expect(findings).toHaveLength(1);
        expect(findings[0].filePath).toBe(modifiedPath);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Coverage Data Serialization Round-Trip Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 2: Coverage Data Serialization Round-Trip**
   *
   * For any valid coverage data structure containing line, branch, and function coverage metrics,
   * serializing to JSON and deserializing should produce an equivalent data structure.
   */

  // Generator for file coverage
  const fileCoverageArb: fc.Arbitrary<FileCoverage> = fc
    .tuple(
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_\/-]*\.[a-z]+$/),
      fc.float({ min: 0, max: 100, noNaN: true }),
      fc.float({ min: 0, max: 100, noNaN: true }),
      fc.float({ min: 0, max: 100, noNaN: true }),
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 0, max: 1000 }),
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 0, max: 500 }),
    )
    .filter(([path]) => path.length > 2 && path.length <= 100)
    .map(
      ([
        path,
        lineRate,
        branchRate,
        functionRate,
        linesCovered,
        linesTotal,
        branchesCovered,
        branchesTotal,
        functionsCovered,
        functionsTotal,
      ]) => ({
        path,
        lineRate,
        branchRate,
        functionRate,
        linesCovered,
        linesTotal,
        branchesCovered,
        branchesTotal,
        functionsCovered,
        functionsTotal,
      }),
    );

  // Generator for coverage report
  const coverageReportArb: fc.Arbitrary<CoverageReport> = fc
    .array(fileCoverageArb, { minLength: 0, maxLength: 20 })
    .map((files) => ({ files }));

  it('should round-trip serialize and deserialize coverage report', () => {
    fc.assert(
      fc.property(coverageReportArb, (report) => {
        const serialized = CoverageAnalyzer.serializeCoverage(report);
        const deserialized = CoverageAnalyzer.deserializeCoverage(serialized);

        expect(deserialized.files).toHaveLength(report.files.length);

        for (let i = 0; i < report.files.length; i++) {
          const original = report.files[i];
          const restored = deserialized.files[i];

          expect(restored.path).toBe(original.path);
          expect(restored.lineRate).toBeCloseTo(original.lineRate, 10);
          expect(restored.branchRate).toBeCloseTo(original.branchRate, 10);
          expect(restored.functionRate).toBeCloseTo(original.functionRate, 10);
          expect(restored.linesCovered).toBe(original.linesCovered);
          expect(restored.linesTotal).toBe(original.linesTotal);
          expect(restored.branchesCovered).toBe(original.branchesCovered);
          expect(restored.branchesTotal).toBe(original.branchesTotal);
          expect(restored.functionsCovered).toBe(original.functionsCovered);
          expect(restored.functionsTotal).toBe(original.functionsTotal);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve empty coverage reports', () => {
    const emptyReport: CoverageReport = { files: [] };
    const serialized = CoverageAnalyzer.serializeCoverage(emptyReport);
    const deserialized = CoverageAnalyzer.deserializeCoverage(serialized);

    expect(deserialized.files).toHaveLength(0);
  });
});
