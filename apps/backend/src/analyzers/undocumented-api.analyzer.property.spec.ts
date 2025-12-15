import * as fc from 'fast-check';
import { UndocumentedApiAnalyzer } from './undocumented-api.analyzer';
import type { AnalysisContext } from '@dra/types';

/**
 * Property tests for Undocumented API Analyzer
 */

describe('Undocumented API Change Detection Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 14: Undocumented API Change Detection**
   * **Validates: Requirements 10.2**
   *
   * For any PR diff where route handler files are modified but no OpenAPI specification
   * file is changed, the analyzer should produce a Finding of type UNDOCUMENTED_API.
   */
  const analyzer = new UndocumentedApiAnalyzer();

  // Generator for route handler file paths
  // Note: The analyzer patterns require specific formats:
  // - .controller.ts/.js files (any directory)
  // - .routes.ts/.js or .route.ts/.js files (any directory)
  // - Files in /routes/, /controllers/, /api/, /handlers/ directories (with leading slash)
  const routeHandlerPathArb = fc.oneof(
    // Controller files - these work anywhere
    fc
      .tuple(
        fc.constantFrom('src/', 'app/', 'lib/', ''),
        fc.stringMatching(/^[a-z]+$/),
        fc.constantFrom('.controller.ts', '.controller.js'),
      )
      .map(([dir, name, ext]) => `${dir}${name}${ext}`),
    // Route files - these work anywhere
    fc
      .tuple(
        fc.constantFrom('src/', 'app/', 'lib/', ''),
        fc.stringMatching(/^[a-z]+$/),
        fc.constantFrom('.routes.ts', '.route.ts', '.routes.js'),
      )
      .map(([dir, name, ext]) => `${dir}${name}${ext}`),
    // Files in routes directory (need parent dir for /routes/ pattern to match)
    fc
      .tuple(fc.constantFrom('src/routes/', 'app/routes/', 'api/routes/'), fc.stringMatching(/^[a-z]+\.ts$/))
      .map(([dir, name]) => `${dir}${name}`),
    // Files in controllers directory (need parent dir)
    fc
      .tuple(fc.constantFrom('src/controllers/', 'app/controllers/'), fc.stringMatching(/^[a-z]+\.ts$/))
      .map(([dir, name]) => `${dir}${name}`),
    // Files in api directory (need parent dir)
    fc
      .tuple(fc.constantFrom('src/api/', 'app/api/'), fc.stringMatching(/^[a-z]+\.ts$/))
      .map(([dir, name]) => `${dir}${name}`),
  );

  // Generator for OpenAPI spec file paths
  const openApiPathArb = fc.oneof(
    fc.constant('openapi.yaml'),
    fc.constant('openapi.yml'),
    fc.constant('openapi.json'),
    fc.constant('swagger.yaml'),
    fc.constant('swagger.json'),
    fc.constant('api/openapi.yaml'),
    fc.constant('docs/swagger.json'),
  );

  // Generator for non-route file paths
  const nonRoutePathArb = fc
    .tuple(
      fc.constantFrom('src/', 'lib/', 'utils/', 'models/', 'services/', ''),
      fc.stringMatching(/^[a-z]+$/),
      fc.constantFrom('.ts', '.js', '.tsx'),
    )
    .map(([dir, name, ext]) => `${dir}${name}${ext}`)
    .filter((path) => !analyzer.isRouteHandlerFile(path));

  // Generator for route definition code
  const routeDefinitionCodeArb = fc.oneof(
    // Express-style
    fc
      .tuple(fc.constantFrom('get', 'post', 'put', 'delete', 'patch'), fc.stringMatching(/^\/[a-z]+$/))
      .map(([method, path]) => `app.${method}('${path}', handler);`),
    // NestJS decorators
    fc
      .tuple(fc.constantFrom('Get', 'Post', 'Put', 'Delete', 'Patch'), fc.stringMatching(/^\/[a-z]+$/))
      .map(([decorator, path]) => `@${decorator}('${path}')\nasync handler() {}`),
    // Router patterns
    fc
      .tuple(fc.constantFrom('get', 'post', 'put', 'delete', 'patch'), fc.stringMatching(/^\/[a-z]+$/))
      .map(([method, path]) => `router.${method}('${path}', handler);`),
  );

  // Generator for non-route code
  const nonRouteCodeArb = fc.oneof(
    fc.constant('const x = 1;'),
    fc.constant('function helper() { return true; }'),
    fc.constant('export class Service {}'),
    fc.constant('// just a comment'),
    fc.stringMatching(/^const [a-z]+ = \d+;$/),
  );

  it('should generate UNDOCUMENTED_API finding when route handler modified without OpenAPI change', async () => {
    await fc.assert(
      fc.asyncProperty(routeHandlerPathArb, routeDefinitionCodeArb, async (path, code) => {
        const context: AnalysisContext = {
          files: [
            {
              path,
              oldContent: null,
              newContent: code,
              hunks: [],
            },
          ],
          diff: '',
          repoConfig: {},
        };

        const findings = await analyzer.analyze(context);

        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.some((f) => f.type === 'UNDOCUMENTED_API')).toBe(true);
        expect(findings.some((f) => f.filePath === path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should not generate finding when OpenAPI spec is also modified', async () => {
    await fc.assert(
      fc.asyncProperty(
        routeHandlerPathArb,
        routeDefinitionCodeArb,
        openApiPathArb,
        async (routePath, code, openApiPath) => {
          const context: AnalysisContext = {
            files: [
              {
                path: routePath,
                oldContent: null,
                newContent: code,
                hunks: [],
              },
              {
                path: openApiPath,
                oldContent: 'old spec',
                newContent: 'new spec',
                hunks: [],
              },
            ],
            diff: '',
            repoConfig: {},
          };

          const findings = await analyzer.analyze(context);

          // Should not have any UNDOCUMENTED_API findings
          expect(findings.filter((f) => f.type === 'UNDOCUMENTED_API')).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should not generate finding for non-route files', async () => {
    await fc.assert(
      fc.asyncProperty(nonRoutePathArb, nonRouteCodeArb, async (path, code) => {
        const context: AnalysisContext = {
          files: [
            {
              path,
              oldContent: null,
              newContent: code,
              hunks: [],
            },
          ],
          diff: '',
          repoConfig: {},
        };

        const findings = await analyzer.analyze(context);

        // Should not have any findings for non-route files
        expect(findings).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should not generate finding for route files without route definitions', async () => {
    await fc.assert(
      fc.asyncProperty(routeHandlerPathArb, nonRouteCodeArb, async (path, code) => {
        const context: AnalysisContext = {
          files: [
            {
              path,
              oldContent: null,
              newContent: code,
              hunks: [],
            },
          ],
          diff: '',
          repoConfig: {},
        };

        const findings = await analyzer.analyze(context);

        // Should not have findings if no route definitions in the code
        expect(findings).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should correctly identify route handler files', () => {
    fc.assert(
      fc.property(routeHandlerPathArb, (path) => {
        expect(analyzer.isRouteHandlerFile(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should correctly identify OpenAPI spec files', () => {
    fc.assert(
      fc.property(openApiPathArb, (path) => {
        expect(analyzer.isOpenApiFile(path)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should correctly identify non-route files', () => {
    fc.assert(
      fc.property(nonRoutePathArb, (path) => {
        expect(analyzer.isRouteHandlerFile(path)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
