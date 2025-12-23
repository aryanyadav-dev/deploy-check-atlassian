import * as fc from 'fast-check';
import { PermissionAnalyzer } from './permission.analyzer';

/**
 * Property test for Permission Pattern Detection
 * **Feature: deployment-risk-analyzer, Property 12: Permission Pattern Detection**
 *
 * For any code diff containing patterns like `hasPermission`, `isAdmin`, `role ===`,
 * or `req.user.roles`, the permission analyzer should produce a Finding of type PERMISSION_CHANGE.
 */

describe('Permission Pattern Detection Property', () => {
  const analyzer = new PermissionAnalyzer();

  // Generator for valid identifiers
  const identifierArb = fc
    .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 20);

  // Generator for permission names
  const permissionNameArb = fc.constantFrom(
    'admin',
    'read',
    'write',
    'delete',
    'manage',
    'view',
    'edit',
    'create',
    'update',
  );

  // Generator for role names
  const roleNameArb = fc.constantFrom(
    'admin',
    'user',
    'moderator',
    'guest',
    'superadmin',
    'editor',
    'viewer',
  );

  it('should detect hasPermission function calls', () => {
    fc.assert(
      fc.property(permissionNameArb, (permission) => {
        const code = `if (hasPermission("${permission}")) { doSomething(); }`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches.some((m) => m.matchType === 'function_call')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect checkPermission function calls', () => {
    fc.assert(
      fc.property(permissionNameArb, (permission) => {
        const code = `checkPermission("${permission}")`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect isAdmin property access', () => {
    fc.assert(
      fc.property(identifierArb, (varName) => {
        const code = `if (${varName}.isAdmin) { return true; }`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches.some((m) => m.pattern.includes('Admin'))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect role === comparisons', () => {
    fc.assert(
      fc.property(identifierArb, roleNameArb, (varName, role) => {
        const code = `if (${varName}.role === "${role}") { }`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches.some((m) => m.matchType === 'comparison' || m.matchType === 'property_access')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect req.user.roles access', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const code = 'const roles = req.user.roles;';
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 10 },
    );
  });

  it('should detect user.roles access', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const code = 'if (user.roles.includes("admin")) { }';
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 10 },
    );
  });

  it('should detect @Roles decorator', () => {
    fc.assert(
      fc.property(
        fc.array(roleNameArb, { minLength: 1, maxLength: 3 }),
        (roles) => {
          const rolesStr = roles.map((r) => `"${r}"`).join(', ');
          const code = `@Roles(${rolesStr})`;
          const matches = analyzer.detectPermissionPatterns(code);

          expect(matches.length).toBeGreaterThanOrEqual(1);
          expect(matches.some((m) => m.matchType === 'decorator')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should detect canAccess function calls', () => {
    fc.assert(
      fc.property(identifierArb, (resource) => {
        const code = `if (canAccess("${resource}")) { }`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect isAuthorized function calls', () => {
    fc.assert(
      fc.property(identifierArb, (action) => {
        const code = `isAuthorized("${action}")`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('should produce PERMISSION_CHANGE findings for code with permission patterns', async () => {
    await fc.assert(
      fc.asyncProperty(permissionNameArb, async (permission) => {
        const findings = await analyzer.analyze({
          files: [
            {
              path: 'src/auth/check.ts',
              oldContent: 'function check() { return true; }',
              newContent: `function check() { return hasPermission("${permission}"); }`,
              hunks: [],
            },
          ],
          diff: '',
          repoConfig: {},
        });

        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.every((f) => f.type === 'PERMISSION_CHANGE')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should not detect permission patterns in comments', () => {
    fc.assert(
      fc.property(permissionNameArb, (permission) => {
        const code = `// hasPermission("${permission}")`;
        const matches = analyzer.detectPermissionPatterns(code);

        expect(matches).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should not detect permission patterns in unrelated code', () => {
    fc.assert(
      fc.property(
        identifierArb,
        fc.integer({ min: 0, max: 1000 }),
        (varName, value) => {
          const code = `const ${varName} = ${value}; console.log(${varName});`;
          const matches = analyzer.detectPermissionPatterns(code);

          expect(matches).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
