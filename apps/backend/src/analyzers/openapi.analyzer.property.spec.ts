import * as fc from 'fast-check';
import { OpenApiAnalyzer } from './openapi.analyzer';
import type { OpenApiSpec, OpenApiPathItem, AnalysisContext } from '@dra/types';

/**
 * Property tests for OpenAPI Analyzer
 */

describe('OpenAPI Breaking Change Detection Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 13: OpenAPI Breaking Change Detection**
   * **Validates: Requirements 10.1, 10.3**
   *
   * For any pair of OpenAPI specifications where endpoints are removed or required
   * parameters are added, the OpenAPI analyzer should produce a Finding with severity HIGH.
   */
  const analyzer = new OpenApiAnalyzer();

  // Generator for valid API paths
  const pathArb = fc
    .tuple(
      fc.constantFrom('/users', '/posts', '/comments', '/items', '/orders', '/products'),
      fc.option(fc.stringMatching(/^\/[a-z]+$/), { nil: undefined }),
    )
    .map(([base, suffix]) => (suffix ? `${base}${suffix}` : base));

  // Generator for HTTP methods
  const methodArb = fc.constantFrom('get', 'post', 'put', 'delete', 'patch') as fc.Arbitrary<
    keyof OpenApiPathItem
  >;

  // Generator for parameter names
  const paramNameArb = fc.constantFrom(
    'id',
    'page',
    'limit',
    'filter',
    'sort',
    'apiKey',
    'token',
    'userId',
  );

  // Generator for parameter locations
  const paramInArb = fc.constantFrom('query', 'path', 'header') as fc.Arbitrary<
    'query' | 'path' | 'header'
  >;

  it('should detect removed endpoints with HIGH severity', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, methodArb, async (path, method) => {
        const oldSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [path]: {
              [method]: { responses: { '200': { description: 'OK' } } },
            },
          },
        };

        const newSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {},
        };

        const context: AnalysisContext = {
          files: [],
          diff: '',
          repoConfig: {},
          openApiSpecs: { oldSpec, newSpec },
        };

        const findings = await analyzer.analyze(context);

        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.some((f) => f.type === 'BREAKING_API')).toBe(true);
        expect(findings.some((f) => f.severity === 'HIGH')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should detect added required parameters with HIGH severity', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, methodArb, paramNameArb, paramInArb, async (path, method, paramName, paramIn) => {
        const oldSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [path]: {
              [method]: {
                parameters: [],
                responses: { '200': { description: 'OK' } },
              },
            },
          },
        };

        const newSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [path]: {
              [method]: {
                parameters: [{ name: paramName, in: paramIn, required: true }],
                responses: { '200': { description: 'OK' } },
              },
            },
          },
        };

        const context: AnalysisContext = {
          files: [],
          diff: '',
          repoConfig: {},
          openApiSpecs: { oldSpec, newSpec },
        };

        const findings = await analyzer.analyze(context);

        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.some((f) => f.type === 'BREAKING_API')).toBe(true);
        expect(findings.some((f) => f.severity === 'HIGH')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should not flag new endpoints as breaking changes', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, pathArb, methodArb, async (existingPath, newPath, method) => {
        // Skip if paths are the same
        if (existingPath === newPath) return;

        const oldSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [existingPath]: {
              [method]: { responses: { '200': { description: 'OK' } } },
            },
          },
        };

        const newSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [existingPath]: {
              [method]: { responses: { '200': { description: 'OK' } } },
            },
            [newPath]: {
              [method]: { responses: { '200': { description: 'OK' } } },
            },
          },
        };

        const context: AnalysisContext = {
          files: [],
          diff: '',
          repoConfig: {},
          openApiSpecs: { oldSpec, newSpec },
        };

        const findings = await analyzer.analyze(context);

        // Should not have any breaking change findings
        expect(findings).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should not flag optional parameters as breaking changes', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, methodArb, paramNameArb, paramInArb, async (path, method, paramName, paramIn) => {
        const oldSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [path]: {
              [method]: {
                parameters: [],
                responses: { '200': { description: 'OK' } },
              },
            },
          },
        };

        const newSpec: OpenApiSpec = {
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {
            [path]: {
              [method]: {
                parameters: [{ name: paramName, in: paramIn, required: false }],
                responses: { '200': { description: 'OK' } },
              },
            },
          },
        };

        const context: AnalysisContext = {
          files: [],
          diff: '',
          repoConfig: {},
          openApiSpecs: { oldSpec, newSpec },
        };

        const findings = await analyzer.analyze(context);

        // Should not have any breaking change findings for optional params
        expect(findings).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe('OpenAPI Specification Round-Trip Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 6: OpenAPI Specification Round-Trip**
   * **Validates: Requirements 10.4**
   *
   * For any valid OpenAPI 3.x specification, parsing and re-serializing to JSON
   * should produce a semantically equivalent specification.
   */

  // Generator for valid API paths
  const pathArb = fc
    .array(fc.stringMatching(/^[a-z]+$/), { minLength: 1, maxLength: 3 })
    .map((parts) => '/' + parts.join('/'));

  // Generator for parameter
  const parameterArb = fc.record({
    name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/),
    in: fc.constantFrom('query', 'path', 'header') as fc.Arbitrary<'query' | 'path' | 'header'>,
    required: fc.boolean(),
  });

  // Generator for operation
  const operationArb = fc.record({
    operationId: fc.option(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/), { nil: undefined }),
    summary: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    parameters: fc.option(fc.array(parameterArb, { maxLength: 5 }), { nil: undefined }),
    responses: fc.constant({ '200': { description: 'OK' } }),
  });

  // Generator for path item
  const pathItemArb: fc.Arbitrary<OpenApiPathItem> = fc
    .record({
      get: fc.option(operationArb, { nil: undefined }),
      post: fc.option(operationArb, { nil: undefined }),
      put: fc.option(operationArb, { nil: undefined }),
      delete: fc.option(operationArb, { nil: undefined }),
      patch: fc.option(operationArb, { nil: undefined }),
    })
    .filter((item) => {
      // Ensure at least one method is defined
      return !!(item.get || item.post || item.put || item.delete || item.patch);
    });

  // Generator for paths object
  const pathsArb = fc
    .array(fc.tuple(pathArb, pathItemArb), { minLength: 0, maxLength: 5 })
    .map((entries) => Object.fromEntries(entries));

  // Generator for OpenAPI spec
  const openApiSpecArb: fc.Arbitrary<OpenApiSpec> = fc.record({
    openapi: fc.constant('3.0.0'),
    info: fc.record({
      title: fc.string({ minLength: 1, maxLength: 50 }),
      version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
    }),
    paths: pathsArb,
  });

  it('should round-trip serialize and parse OpenAPI spec', () => {
    fc.assert(
      fc.property(openApiSpecArb, (spec) => {
        const serialized = OpenApiAnalyzer.serializeSpec(spec);
        const parsed = OpenApiAnalyzer.parseSpec(serialized);

        // Verify structure is preserved
        expect(parsed.openapi).toBe(spec.openapi);
        expect(parsed.info.title).toBe(spec.info.title);
        expect(parsed.info.version).toBe(spec.info.version);

        // Verify paths are preserved
        const originalPaths = Object.keys(spec.paths);
        const parsedPaths = Object.keys(parsed.paths);
        expect(parsedPaths).toHaveLength(originalPaths.length);

        for (const path of originalPaths) {
          expect(parsed.paths[path]).toBeDefined();

          const originalItem = spec.paths[path];
          const parsedItem = parsed.paths[path];

          // Check each method
          for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
            if (originalItem[method]) {
              expect(parsedItem[method]).toBeDefined();
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve parameter details through round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(parameterArb, { minLength: 1, maxLength: 5 }),
        (params) => {
          const spec: OpenApiSpec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0.0' },
            paths: {
              '/test': {
                get: {
                  parameters: params,
                  responses: { '200': { description: 'OK' } },
                },
              },
            },
          };

          const serialized = OpenApiAnalyzer.serializeSpec(spec);
          const parsed = OpenApiAnalyzer.parseSpec(serialized);

          const originalParams = spec.paths['/test'].get?.parameters || [];
          const parsedParams = parsed.paths['/test'].get?.parameters || [];

          expect(parsedParams).toHaveLength(originalParams.length);

          for (let i = 0; i < originalParams.length; i++) {
            expect(parsedParams[i].name).toBe(originalParams[i].name);
            expect(parsedParams[i].in).toBe(originalParams[i].in);
            expect(parsedParams[i].required).toBe(originalParams[i].required);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
