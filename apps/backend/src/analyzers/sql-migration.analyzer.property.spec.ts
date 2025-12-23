import * as fc from 'fast-check';
import { SqlMigrationAnalyzer } from './sql-migration.analyzer';

/**
 * Property tests for SQL Migration Analyzer
 */

describe('Migration Path Pattern Matching Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 10: Migration Path Pattern Matching**
   *
   * For any file path, if the path matches `migrations/*` or `db/migrate/*` pattern,
   * the SQL analyzer should be invoked for that file.
   */
  const analyzer = new SqlMigrationAnalyzer();

  // Generator for valid file names
  const fileNameArb = fc
    .stringMatching(/^[a-zA-Z0-9_-]+\.sql$/)
    .filter((s) => s.length > 4 && s.length <= 50);

  // Generator for migration directory prefixes
  const migrationPrefixArb = fc.constantFrom(
    'migrations/',
    'db/migrate/',
    'database/migrations/',
    'src/migrations/',
    'src/db/migrate/',
    'app/database/migrations/',
  );

  // Generator for non-migration directory prefixes
  const nonMigrationPrefixArb = fc.constantFrom(
    'src/',
    'lib/',
    'queries/',
    'scripts/',
    'sql/',
    'data/',
    'fixtures/',
    'seeds/',
  );

  it('should match paths with migrations/ prefix', () => {
    fc.assert(
      fc.property(fileNameArb, (fileName) => {
        const path = `migrations/${fileName}`;
        expect(analyzer.isMigrationFile(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should match paths with db/migrate/ prefix', () => {
    fc.assert(
      fc.property(fileNameArb, (fileName) => {
        const path = `db/migrate/${fileName}`;
        expect(analyzer.isMigrationFile(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should match paths with nested migrations directories', () => {
    fc.assert(
      fc.property(migrationPrefixArb, fileNameArb, (prefix, fileName) => {
        const path = `${prefix}${fileName}`;
        expect(analyzer.isMigrationFile(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should not match paths without migration directory patterns', () => {
    fc.assert(
      fc.property(nonMigrationPrefixArb, fileNameArb, (prefix, fileName) => {
        const path = `${prefix}${fileName}`;
        expect(analyzer.isMigrationFile(path)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('should be case-insensitive for migration patterns', () => {
    fc.assert(
      fc.property(fileNameArb, (fileName) => {
        const lowerPath = `migrations/${fileName}`;
        const upperPath = `MIGRATIONS/${fileName}`;
        const mixedPath = `Migrations/${fileName}`;

        // All should match
        expect(analyzer.isMigrationFile(lowerPath)).toBe(true);
        expect(analyzer.isMigrationFile(upperPath)).toBe(true);
        expect(analyzer.isMigrationFile(mixedPath)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Destructive SQL Operation Detection Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 11: Destructive SQL Operation Detection**
   *
   * For any SQL content containing DROP TABLE, DROP COLUMN, or ALTER TYPE statements,
   * the SQL analyzer should produce a Finding with severity HIGH or CRITICAL.
   */
  const analyzer = new SqlMigrationAnalyzer();

  // Generator for table names
  const tableNameArb = fc
    .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 30);

  // Generator for column names
  const columnNameArb = fc
    .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 30);

  // Generator for SQL types
  const sqlTypeArb = fc.constantFrom(
    'INT',
    'BIGINT',
    'VARCHAR(255)',
    'TEXT',
    'BOOLEAN',
    'TIMESTAMP',
    'JSON',
  );

  it('should detect DROP TABLE statements with HIGH or CRITICAL severity', () => {
    fc.assert(
      fc.property(tableNameArb, (tableName) => {
        const sql = `DROP TABLE ${tableName};`;
        const ops = analyzer.detectDestructiveOperations(sql);

        expect(ops.length).toBeGreaterThanOrEqual(1);
        expect(ops.some((o) => o.type === 'DROP_TABLE')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect DROP TABLE IF EXISTS statements', () => {
    fc.assert(
      fc.property(tableNameArb, (tableName) => {
        const sql = `DROP TABLE IF EXISTS ${tableName};`;
        const ops = analyzer.detectDestructiveOperations(sql);

        expect(ops.length).toBeGreaterThanOrEqual(1);
        expect(ops.some((o) => o.type === 'DROP_TABLE')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect DROP COLUMN statements', () => {
    fc.assert(
      fc.property(tableNameArb, columnNameArb, (tableName, columnName) => {
        const sql = `ALTER TABLE ${tableName} DROP COLUMN ${columnName};`;
        const ops = analyzer.detectDestructiveOperations(sql);

        expect(ops.length).toBeGreaterThanOrEqual(1);
        expect(ops.some((o) => o.type === 'DROP_COLUMN')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect ALTER TYPE statements', () => {
    fc.assert(
      fc.property(tableNameArb, columnNameArb, sqlTypeArb, (tableName, columnName, newType) => {
        const sql = `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${newType};`;
        const ops = analyzer.detectDestructiveOperations(sql);

        expect(ops.length).toBeGreaterThanOrEqual(1);
        expect(ops.some((o) => o.type === 'ALTER_TYPE')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect TRUNCATE statements', () => {
    fc.assert(
      fc.property(tableNameArb, (tableName) => {
        const sql = `TRUNCATE TABLE ${tableName};`;
        const ops = analyzer.detectDestructiveOperations(sql);

        expect(ops.length).toBeGreaterThanOrEqual(1);
        expect(ops.some((o) => o.type === 'TRUNCATE')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should not detect safe SQL operations', () => {
    fc.assert(
      fc.property(tableNameArb, columnNameArb, sqlTypeArb, (tableName, columnName, colType) => {
        const safeSql = `
          CREATE TABLE ${tableName} (id INT PRIMARY KEY);
          ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${colType};
          INSERT INTO ${tableName} (id) VALUES (1);
          SELECT * FROM ${tableName};
          UPDATE ${tableName} SET ${columnName} = NULL;
          DELETE FROM ${tableName} WHERE id = 1;
        `;
        const ops = analyzer.detectDestructiveOperations(safeSql);

        // Should not detect any destructive operations
        expect(ops).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should produce findings with HIGH or CRITICAL severity for destructive operations', async () => {
    await fc.assert(
      fc.asyncProperty(tableNameArb, async (tableName) => {
        const findings = await analyzer.analyze({
          files: [
            {
              path: `migrations/001_drop_${tableName}.sql`,
              oldContent: null,
              newContent: `DROP TABLE ${tableName};`,
              hunks: [],
            },
          ],
          diff: '',
          repoConfig: {},
        });

        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.every((f) => f.severity === 'HIGH' || f.severity === 'CRITICAL')).toBe(true);
        expect(findings.every((f) => f.type === 'DESTRUCTIVE_MIGRATION')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
