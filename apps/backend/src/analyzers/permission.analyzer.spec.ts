import { PermissionAnalyzer } from './permission.analyzer';
import type { AnalysisContext, FileChange, DiffHunk } from '@dra/types';

describe('PermissionAnalyzer', () => {
  let analyzer: PermissionAnalyzer;

  beforeEach(() => {
    analyzer = new PermissionAnalyzer();
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(analyzer.name).toBe('permission');
    });

    it('should support multiple language extensions', () => {
      expect(analyzer.supportedExtensions).toContain('.ts');
      expect(analyzer.supportedExtensions).toContain('.js');
      expect(analyzer.supportedExtensions).toContain('.py');
      expect(analyzer.supportedExtensions).toContain('.java');
    });
  });

  describe('detectPermissionPatterns', () => {
    it('should detect hasPermission calls', () => {
      const code = 'if (hasPermission("admin")) { doSomething(); }';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.pattern.includes('Permission'))).toBe(true);
    });

    it('should detect isAdmin checks', () => {
      const code = 'if (user.isAdmin) { return true; }';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.pattern.includes('Admin'))).toBe(true);
    });

    it('should detect role comparisons', () => {
      const code = 'if (user.role === "admin") { }';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.pattern.includes('role') || m.pattern.includes('Role'))).toBe(true);
    });

    it('should detect req.user.roles access', () => {
      const code = 'const roles = req.user.roles;';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect @Roles decorator', () => {
      const code = '@Roles("admin", "moderator")';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m) => m.matchType === 'decorator')).toBe(true);
    });

    it('should detect @UseGuards with auth', () => {
      const code = '@UseGuards(AuthGuard, RoleGuard)';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect roles.includes calls', () => {
      const code = 'if (user.roles.includes("admin")) { }';
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should skip comment lines', () => {
      const code = `
        // hasPermission check
        /* isAdmin */
        # role check
      `;
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches).toHaveLength(0);
    });

    it('should not detect unrelated code', () => {
      const code = `
        const x = 1;
        function add(a, b) { return a + b; }
        console.log("hello");
      `;
      const matches = analyzer.detectPermissionPatterns(code);

      expect(matches).toHaveLength(0);
    });
  });

  describe('analyze', () => {
    const createContext = (files: FileChange[]): AnalysisContext => ({
      files,
      diff: '',
      repoConfig: {},
    });

    const createHunk = (content: string): DiffHunk => ({
      oldStart: 1,
      oldLines: 5,
      newStart: 1,
      newLines: 5,
      content,
    });

    it('should detect permission changes in diff hunks', async () => {
      const context = createContext([
        {
          path: 'src/auth/guard.ts',
          oldContent: '',
          newContent: '',
          hunks: [createHunk('+ if (hasPermission("admin")) { }')],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('PERMISSION_CHANGE');
      expect(findings[0].severity).toBe('MEDIUM');
    });

    it('should detect permission changes in content when no hunks', async () => {
      const oldCode = 'function check() { return true; }';
      const newCode = 'function check() { return hasPermission("admin"); }';

      const context = createContext([
        {
          path: 'src/auth/check.ts',
          oldContent: oldCode,
          newContent: newCode,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('PERMISSION_CHANGE');
    });

    it('should skip unsupported file types', async () => {
      const context = createContext([
        {
          path: 'README.md',
          oldContent: '',
          newContent: 'hasPermission',
          hunks: [createHunk('+ hasPermission')],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(0);
    });

    it('should include remediation advice', async () => {
      const context = createContext([
        {
          path: 'src/auth/admin.ts',
          oldContent: '',
          newContent: '',
          hunks: [createHunk('+ if (user.isAdmin) { }')],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings[0].remediation).toBeDefined();
      expect(findings[0].remediation).toContain('review');
    });

    it('should handle multiple permission patterns in one file', async () => {
      const context = createContext([
        {
          path: 'src/auth/complex.ts',
          oldContent: '',
          newContent: '',
          hunks: [
            createHunk(`
              + if (hasPermission("read")) { }
              + if (user.isAdmin) { }
              + @Roles("admin")
            `),
          ],
        },
      ]);

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect((findings[0].metadata as { matchCount: number }).matchCount).toBeGreaterThan(1);
    });
  });
});
