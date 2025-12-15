import { CoverageAnalyzer } from './coverage.analyzer';
import type { AnalysisContext, CoverageReport } from '@dra/types';

describe('CoverageAnalyzer', () => {
  let analyzer: CoverageAnalyzer;

  beforeEach(() => {
    analyzer = new CoverageAnalyzer();
  });

  describe('parseLcov', () => {
    it('should parse a valid lcov file with single entry', () => {
      const lcov = `SF:src/utils.ts
FNF:5
FNH:3
LF:100
LH:80
BRF:20
BRH:15
end_of_record`;

      const result = CoverageAnalyzer.parseLcov(lcov);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toEqual({
        path: 'src/utils.ts',
        lineRate: 80,
        branchRate: 75,
        functionRate: 60,
        linesCovered: 80,
        linesTotal: 100,
        branchesCovered: 15,
        branchesTotal: 20,
        functionsCovered: 3,
        functionsTotal: 5,
      });
    });

    it('should parse lcov file with multiple entries', () => {
      const lcov = `SF:src/file1.ts
LF:50
LH:25
BRF:10
BRH:5
FNF:4
FNH:2
end_of_record
SF:src/file2.ts
LF:100
LH:100
BRF:20
BRH:20
FNF:10
FNH:10
end_of_record`;

      const result = CoverageAnalyzer.parseLcov(lcov);

      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('src/file1.ts');
      expect(result.files[0].lineRate).toBe(50);
      expect(result.files[1].path).toBe('src/file2.ts');
      expect(result.files[1].lineRate).toBe(100);
    });

    it('should handle empty lcov content', () => {
      const result = CoverageAnalyzer.parseLcov('');
      expect(result.files).toHaveLength(0);
    });

    it('should handle zero totals gracefully', () => {
      const lcov = `SF:src/empty.ts
LF:0
LH:0
BRF:0
BRH:0
FNF:0
FNH:0
end_of_record`;

      const result = CoverageAnalyzer.parseLcov(lcov);

      expect(result.files[0].lineRate).toBe(0);
      expect(result.files[0].branchRate).toBe(0);
      expect(result.files[0].functionRate).toBe(0);
    });
  });

  describe('analyze', () => {
    it('should return empty findings when no coverage report', async () => {
      const context: AnalysisContext = {
        files: [{ path: 'src/test.ts', oldContent: null, newContent: 'code', hunks: [] }],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });

    it('should generate LOW_COVERAGE finding for file below threshold', async () => {
      const context: AnalysisContext = {
        files: [{ path: 'src/utils.ts', oldContent: null, newContent: 'code', hunks: [] }],
        diff: '',
        repoConfig: { coverageThreshold: 50 },
        coverageReport: {
          files: [
            {
              path: 'src/utils.ts',
              lineRate: 30,
              branchRate: 25,
              functionRate: 40,
              linesCovered: 30,
              linesTotal: 100,
              branchesCovered: 5,
              branchesTotal: 20,
              functionsCovered: 4,
              functionsTotal: 10,
            },
          ],
        },
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('LOW_COVERAGE');
      expect(findings[0].severity).toBe('MEDIUM');
      expect(findings[0].filePath).toBe('src/utils.ts');
    });

    it('should not generate finding for file above threshold', async () => {
      const context: AnalysisContext = {
        files: [{ path: 'src/utils.ts', oldContent: null, newContent: 'code', hunks: [] }],
        diff: '',
        repoConfig: { coverageThreshold: 50 },
        coverageReport: {
          files: [
            {
              path: 'src/utils.ts',
              lineRate: 80,
              branchRate: 75,
              functionRate: 90,
              linesCovered: 80,
              linesTotal: 100,
              branchesCovered: 15,
              branchesTotal: 20,
              functionsCovered: 9,
              functionsTotal: 10,
            },
          ],
        },
      };

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });

    it('should use default threshold of 40% when not configured', async () => {
      const context: AnalysisContext = {
        files: [{ path: 'src/utils.ts', oldContent: null, newContent: 'code', hunks: [] }],
        diff: '',
        repoConfig: {},
        coverageReport: {
          files: [
            {
              path: 'src/utils.ts',
              lineRate: 35,
              branchRate: 30,
              functionRate: 40,
              linesCovered: 35,
              linesTotal: 100,
              branchesCovered: 6,
              branchesTotal: 20,
              functionsCovered: 4,
              functionsTotal: 10,
            },
          ],
        },
      };

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(1);
    });

    it('should only check modified files', async () => {
      const context: AnalysisContext = {
        files: [{ path: 'src/modified.ts', oldContent: null, newContent: 'code', hunks: [] }],
        diff: '',
        repoConfig: { coverageThreshold: 50 },
        coverageReport: {
          files: [
            {
              path: 'src/modified.ts',
              lineRate: 30,
              branchRate: 25,
              functionRate: 40,
              linesCovered: 30,
              linesTotal: 100,
              branchesCovered: 5,
              branchesTotal: 20,
              functionsCovered: 4,
              functionsTotal: 10,
            },
            {
              path: 'src/unmodified.ts',
              lineRate: 10,
              branchRate: 5,
              functionRate: 10,
              linesCovered: 10,
              linesTotal: 100,
              branchesCovered: 1,
              branchesTotal: 20,
              functionsCovered: 1,
              functionsTotal: 10,
            },
          ],
        },
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].filePath).toBe('src/modified.ts');
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize coverage report', () => {
      const report: CoverageReport = {
        files: [
          {
            path: 'src/test.ts',
            lineRate: 75.5,
            branchRate: 60.0,
            functionRate: 80.0,
            linesCovered: 75,
            linesTotal: 100,
            branchesCovered: 12,
            branchesTotal: 20,
            functionsCovered: 8,
            functionsTotal: 10,
          },
        ],
      };

      const serialized = CoverageAnalyzer.serializeCoverage(report);
      const deserialized = CoverageAnalyzer.deserializeCoverage(serialized);

      expect(deserialized).toEqual(report);
    });
  });
});
