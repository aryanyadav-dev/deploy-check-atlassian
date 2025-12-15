import { SqlMigrationAnalyzer } from './sql-migration.analyzer';
import type { AnalysisContext, FileChange } from '@dra/types';

describe('SqlMigrationAnalyzer', () => {
  let analyzer: SqlMigrationAnalyzer;

  beforeEach(() => {
    analyzer = new SqlMigrationAnalyzer();
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(analyzer.name).toBe('sql-migration');
    });

    it('should support SQL extension', () => {
      expect(analyzer.supportedExtensions).toContain('.sql');
    });
  });

  describe('isMigrationFile', () => {
    it('should match migrations/ path', () => {
      expect(analyzer.isMigrationFile('migrations/001_create_users.sql')).toBe(true);
    });

    it('should match db/migrate/ path', () => {
      expect(analyzer.isMigrationFile('db/migrate/20231215_add_column.sql')).toBe(true);
    });

    it('should match nested migrations path', () => {
      expect(analyzer.isMigrationFile('src/database/migrations/001.sql')).toBe(true);
    });

    it('should not match non-migration paths', () => {
      expect(analyzer.isMigrationFile('src/queries/users.sql')).toBe(false);
      expect(analyzer.isMigrationFile('scripts/seed.sql')).toBe(false);
    });
  });

  describe('detectDestructiveOperations', () => {
    it('should detect DROP TABLE', () => {
      const sql = 'DROP TABLE users;';
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('DROP_TABLE');
      expect(ops[0].objectName).toBe('users');
    });

    it('should detect DROP TABLE IF EXISTS', () => {
      const sql = 'DROP TABLE IF EXISTS users;';
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('DROP_TABLE');
      expect(ops[0].objectName).toBe('users');
    });

    it('should detect DROP COLUMN', () => {
      const sql = 'ALTER TABLE users DROP COLUMN email;';
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('DROP_COLUMN');
      expect(ops[0].objectName).toBe('users.email');
    });

    it('should detect ALTER TYPE', () => {
      const sql = 'ALTER TABLE users ALTER COLUMN age TYPE bigint;';
      const ops = analyzer.detectDestructiveOperations(sql);

      // May match multiple patterns, but should have at least one ALTER_TYPE
      expect(ops.length).toBeGreaterThanOrEqual(1);
      expect(ops.some((o) => o.type === 'ALTER_TYPE')).toBe(true);
    });

    it('should detect TRUNCATE', () => {
      const sql = 'TRUNCATE TABLE logs;';
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('TRUNCATE');
      expect(ops[0].objectName).toBe('logs');
    });

    it('should detect multiple operations', () => {
      const sql = `
        DROP TABLE old_users;
        ALTER TABLE users DROP COLUMN legacy_id;
        TRUNCATE TABLE temp_data;
      `;
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.type)).toContain('DROP_TABLE');
      expect(ops.map((o) => o.type)).toContain('DROP_COLUMN');
      expect(ops.map((o) => o.type)).toContain('TRUNCATE');
    });

    it('should not detect safe operations', () => {
      const sql = `
        CREATE TABLE users (id INT PRIMARY KEY);
        ALTER TABLE users ADD COLUMN email VARCHAR(255);
        INSERT INTO users VALUES (1, 'test@example.com');
      `;
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(0);
    });

    it('should handle quoted identifiers', () => {
      const sql = 'DROP TABLE "users";';
      const ops = analyzer.detectDestructiveOperations(sql);

      expect(ops).toHaveLength(1);
      expect(ops[0].objectName).toBe('users');
    });
  });

  describe('analyze', () => {
    const createContext = (files: FileChange[]): AnalysisContext => ({
      files,
      diff: '',
      repoConfig: {},
    });

    it('should analyze migration files with destructive operations', async () => {
      const context = createContext([
        {
          path: 'migrations/001_drop_users.sql',
          oldContent: null,
          newContent: 'DROP TABLE users;',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('DESTRUCTIVE_MIGRATION');
      expect(findings[0].severity).toBe('CRITICAL');
    });

    it('should skip non-migration files', async () => {
      const context = createContext([
        {
          path: 'src/queries/users.sql',
          oldContent: null,
          newContent: 'DROP TABLE users;',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(0);
    });

    it('should assign HIGH severity to DROP COLUMN', async () => {
      const context = createContext([
        {
          path: 'migrations/002_drop_column.sql',
          oldContent: null,
          newContent: 'ALTER TABLE users DROP COLUMN temp;',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('HIGH');
    });

    it('should assign CRITICAL severity to DROP TABLE', async () => {
      const context = createContext([
        {
          path: 'migrations/003_drop_table.sql',
          oldContent: null,
          newContent: 'DROP TABLE users;',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('CRITICAL');
    });

    it('should include remediation advice', async () => {
      const context = createContext([
        {
          path: 'migrations/004_truncate.sql',
          oldContent: null,
          newContent: 'TRUNCATE TABLE logs;',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings[0].remediation).toBeDefined();
      expect(findings[0].remediation).toContain('backup');
    });

    it('should handle files with no new content', async () => {
      const context = createContext([
        {
          path: 'migrations/005_deleted.sql',
          oldContent: 'DROP TABLE users;',
          newContent: null,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(0);
    });
  });
});
