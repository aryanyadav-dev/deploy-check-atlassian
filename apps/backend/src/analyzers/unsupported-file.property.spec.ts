import * as fc from 'fast-check';
import { AnalyzerRegistry } from './analyzer.registry';
import { TypeScriptAnalyzer } from './typescript.analyzer';
import { SqlMigrationAnalyzer } from './sql-migration.analyzer';
import { PermissionAnalyzer } from './permission.analyzer';
import type { AnalysisContext, FileChange, Finding } from '@dra/types';

/**
 * Property test for Unsupported File Graceful Handling
 * **Feature: deployment-risk-analyzer, Property 28: Unsupported File Graceful Handling**
 * **Validates: Requirements 12.2**
 *
 * For any repository containing files with unsupported language extensions,
 * analysis should complete successfully, skipping those files and including
 * only findings from supported files.
 */
describe('Unsupported File Graceful Handling Property', () => {
  let registry: AnalyzerRegistry;
  let tsAnalyzer: TypeScriptAnalyzer;
  let sqlAnalyzer: SqlMigrationAnalyzer;
  let permissionAnalyzer: PermissionAnalyzer;

  // Supported extensions across all analyzers
  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.sql', '.py', '.java', '.go', '.rb'];

  // Unsupported extensions for testing
  const unsupportedExtensions = [
    '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss',
    '.png', '.jpg', '.gif', '.svg', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib', '.wasm',
    '.lock', '.log', '.env', '.gitignore', '.dockerignore', '.editorconfig',
    '.c', '.cpp', '.h', '.hpp', '.rs', '.swift', '.kt', '.scala', '.clj',
  ];

  beforeEach(() => {
    registry = new AnalyzerRegistry();
    tsAnalyzer = new TypeScriptAnalyzer();
    sqlAnalyzer = new SqlMigrationAnalyzer();
    permissionAnalyzer = new PermissionAnalyzer();

    registry.register(tsAnalyzer);
    registry.register(sqlAnalyzer);
    registry.register(permissionAnalyzer);
  });

  // Generator for file paths with specific extensions
  const filePathArb = (extension: string) =>
    fc.tuple(
      fc.array(fc.stringMatching(/^[a-z][a-z0-9_-]*$/), { minLength: 1, maxLength: 3 }),
      fc.stringMatching(/^[a-z][a-z0-9_-]*$/)
    ).map(([dirs, name]) => `${dirs.join('/')}/${name}${extension}`);

  // Generator for unsupported file extensions
  const unsupportedExtensionArb = fc.constantFrom(...unsupportedExtensions);

  // Generator for supported file extensions
  const supportedExtensionArb = fc.constantFrom(...supportedExtensions);

  // Generator for file content (generic text)
  const fileContentArb = fc.string({ minLength: 0, maxLength: 500 });

  // Generator for a file change with unsupported extension
  const unsupportedFileChangeArb = fc.tuple(
    unsupportedExtensionArb,
    fileContentArb,
    fileContentArb
  ).chain(([ext, oldContent, newContent]) =>
    filePathArb(ext).map((path) => ({
      path,
      oldContent,
      newContent,
      hunks: [],
    } as FileChange))
  );

  // Generator for TypeScript file with breaking API change
  const tsFileWithBreakingChangeArb = fc
    .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 15)
    .filter((s) => !['if', 'else', 'for', 'while', 'function', 'const', 'let', 'var', 'return', 'export', 'import', 'class', 'interface', 'type', 'async', 'await'].includes(s))
    .chain((funcName) =>
      filePathArb('.ts').map((path) => ({
        path,
        oldContent: `export function ${funcName}(a: string): void {}`,
        newContent: `export function ${funcName}(a: number): void {}`,
        hunks: [],
      } as FileChange))
    );

  // Generator for SQL migration file with destructive operation
  const sqlFileWithDestructiveOpArb = fc
    .stringMatching(/^[a-z][a-z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 20)
    .map((tableName) => ({
      path: `migrations/${Date.now()}_drop_${tableName}.sql`,
      oldContent: null,
      newContent: `DROP TABLE ${tableName};`,
      hunks: [],
    } as FileChange));

  /**
   * Property 28: Analysis should complete successfully with only unsupported files
   */
  it('should complete analysis successfully when all files are unsupported', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(unsupportedFileChangeArb, { minLength: 1, maxLength: 10 }),
        async (files) => {
          const context: AnalysisContext = {
            files,
            diff: '',
            repoConfig: {},
          };

          // Run all analyzers - should not throw
          const allFindings: Finding[] = [];

          for (const analyzer of registry.getAllAnalyzers()) {
            const findings = await analyzer.analyze(context);
            allFindings.push(...findings);
          }

          // Should produce no findings for unsupported files
          expect(allFindings).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Analysis should return findings only from supported files
   */
  it('should return findings only from supported files when mixed with unsupported', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.array(unsupportedFileChangeArb, { minLength: 1, maxLength: 5 }),
          tsFileWithBreakingChangeArb
        ),
        async ([unsupportedFiles, supportedFile]) => {
          const context: AnalysisContext = {
            files: [...unsupportedFiles, supportedFile],
            diff: '',
            repoConfig: {},
          };

          // Run TypeScript analyzer
          const findings = await tsAnalyzer.analyze(context);

          // Should have findings only from the supported file
          expect(findings.length).toBeGreaterThanOrEqual(1);
          expect(findings.every((f) => f.filePath === supportedFile.path)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Registry should return empty array for unsupported files
   */
  it('should return empty analyzer array for unsupported file extensions', () => {
    fc.assert(
      fc.property(
        fc.tuple(unsupportedExtensionArb, fc.stringMatching(/^[a-z][a-z0-9_-]*$/)),
        ([ext, name]) => {
          const filePath = `src/${name}${ext}`;
          const analyzers = registry.getAnalyzersForFile(filePath);

          // Should return empty array for unsupported extensions
          expect(analyzers).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Registry should return analyzers for supported file extensions
   */
  it('should return at least one analyzer for supported file extensions', () => {
    fc.assert(
      fc.property(
        fc.tuple(supportedExtensionArb, fc.stringMatching(/^[a-z][a-z0-9_-]*$/)),
        ([ext, name]) => {
          const filePath = `src/${name}${ext}`;
          const analyzers = registry.getAnalyzersForFile(filePath);

          // Should return at least one analyzer for supported extensions
          expect(analyzers.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: SQL analyzer should skip non-migration SQL files gracefully
   */
  it('should skip SQL files that are not in migration paths', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9_]*$/).filter((s) => s.length > 0 && s.length <= 20),
        async (tableName) => {
          // SQL file NOT in migration path
          const context: AnalysisContext = {
            files: [
              {
                path: `src/queries/${tableName}.sql`,
                oldContent: null,
                newContent: `DROP TABLE ${tableName};`,
                hunks: [],
              },
            ],
            diff: '',
            repoConfig: {},
          };

          const findings = await sqlAnalyzer.analyze(context);

          // Should not produce findings for non-migration SQL files
          expect(findings).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Mixed file analysis should not fail and should process supported files
   */
  it('should process supported files correctly when mixed with many unsupported files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.array(unsupportedFileChangeArb, { minLength: 5, maxLength: 20 }),
          sqlFileWithDestructiveOpArb
        ),
        async ([unsupportedFiles, migrationFile]) => {
          const context: AnalysisContext = {
            files: [...unsupportedFiles, migrationFile],
            diff: '',
            repoConfig: {},
          };

          // Run SQL analyzer
          const findings = await sqlAnalyzer.analyze(context);

          // Should have findings from the migration file
          expect(findings.length).toBeGreaterThanOrEqual(1);
          expect(findings.every((f) => f.filePath === migrationFile.path)).toBe(true);
          expect(findings.every((f) => f.type === 'DESTRUCTIVE_MIGRATION')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Analysis should be deterministic regardless of file order
   */
  it('should produce same findings regardless of file order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.array(unsupportedFileChangeArb, { minLength: 1, maxLength: 5 }),
          tsFileWithBreakingChangeArb
        ),
        async ([unsupportedFiles, supportedFile]) => {
          const filesOrder1 = [...unsupportedFiles, supportedFile];
          const filesOrder2 = [supportedFile, ...unsupportedFiles];

          const context1: AnalysisContext = {
            files: filesOrder1,
            diff: '',
            repoConfig: {},
          };

          const context2: AnalysisContext = {
            files: filesOrder2,
            diff: '',
            repoConfig: {},
          };

          const findings1 = await tsAnalyzer.analyze(context1);
          const findings2 = await tsAnalyzer.analyze(context2);

          // Should produce same number of findings
          expect(findings1.length).toBe(findings2.length);

          // Findings should be for the same file
          if (findings1.length > 0) {
            expect(findings1[0].filePath).toBe(findings2[0].filePath);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Files without extensions should be handled gracefully
   */
  it('should handle files without extensions gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]*$/).map((name) => ({
            path: name, // No extension
            oldContent: 'some content',
            newContent: 'modified content',
            hunks: [],
          } as FileChange)),
          { minLength: 1, maxLength: 5 }
        ),
        async (files) => {
          const context: AnalysisContext = {
            files,
            diff: '',
            repoConfig: {},
          };

          // Should not throw for any analyzer
          for (const analyzer of registry.getAllAnalyzers()) {
            const findings = await analyzer.analyze(context);
            // Should produce no findings for files without extensions
            expect(findings).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
