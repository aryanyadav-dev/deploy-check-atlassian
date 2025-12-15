import { OpenApiAnalyzer } from './openapi.analyzer';
import type { AnalysisContext, OpenApiSpec } from '@dra/types';

describe('OpenApiAnalyzer', () => {
  let analyzer: OpenApiAnalyzer;

  beforeEach(() => {
    analyzer = new OpenApiAnalyzer();
  });

  const createBaseSpec = (): OpenApiSpec => ({
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {},
  });

  describe('isOpenApiFile', () => {
    it('should match openapi.yaml', () => {
      expect(analyzer.isOpenApiFile('openapi.yaml')).toBe(true);
      expect(analyzer.isOpenApiFile('api/openapi.yaml')).toBe(true);
    });

    it('should match swagger.json', () => {
      expect(analyzer.isOpenApiFile('swagger.json')).toBe(true);
    });

    it('should not match regular files', () => {
      expect(analyzer.isOpenApiFile('src/api.ts')).toBe(false);
      expect(analyzer.isOpenApiFile('config.yaml')).toBe(false);
    });
  });

  describe('detectBreakingChanges', () => {
    it('should detect removed endpoints', () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
          '/posts': { get: { responses: { '200': { description: 'OK' } } } },
        },
      };

      const newSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
        },
      };

      const changes = analyzer.detectBreakingChanges(oldSpec, newSpec);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('ENDPOINT_REMOVED');
      expect(changes[0].path).toBe('/posts');
      expect(changes[0].method).toBe('GET');
    });

    it('should detect added required parameters', () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': {
            get: {
              parameters: [{ name: 'page', in: 'query', required: false }],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const newSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': {
            get: {
              parameters: [
                { name: 'page', in: 'query', required: false },
                { name: 'apiKey', in: 'header', required: true },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const changes = analyzer.detectBreakingChanges(oldSpec, newSpec);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('REQUIRED_PARAM_ADDED');
      expect(changes[0].paramName).toBe('apiKey');
    });

    it('should detect added required request body', () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': {
            post: {
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const newSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: {} } },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const changes = analyzer.detectBreakingChanges(oldSpec, newSpec);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('REQUIRED_BODY_ADDED');
    });

    it('should not flag new endpoints as breaking changes', () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
        },
      };

      const newSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
          '/posts': { get: { responses: { '200': { description: 'OK' } } } },
        },
      };

      const changes = analyzer.detectBreakingChanges(oldSpec, newSpec);

      expect(changes).toHaveLength(0);
    });

    it('should not flag optional parameters as breaking changes', () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': {
            get: {
              parameters: [],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const newSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': {
            get: {
              parameters: [{ name: 'filter', in: 'query', required: false }],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const changes = analyzer.detectBreakingChanges(oldSpec, newSpec);

      expect(changes).toHaveLength(0);
    });
  });

  describe('analyze', () => {
    it('should return empty findings when no OpenAPI specs', async () => {
      const context: AnalysisContext = {
        files: [],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });

    it('should return empty findings for new API (no old spec)', async () => {
      const context: AnalysisContext = {
        files: [],
        diff: '',
        repoConfig: {},
        openApiSpecs: {
          oldSpec: null,
          newSpec: createBaseSpec(),
        },
      };

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });

    it('should generate BREAKING_API findings for removed endpoints', async () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
        },
      };

      const newSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {},
      };

      const context: AnalysisContext = {
        files: [],
        diff: '',
        repoConfig: {},
        openApiSpecs: { oldSpec, newSpec },
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('BREAKING_API');
      expect(findings[0].severity).toBe('HIGH');
    });

    it('should generate findings when spec is completely removed', async () => {
      const oldSpec: OpenApiSpec = {
        ...createBaseSpec(),
        paths: {
          '/users': { get: { responses: { '200': { description: 'OK' } } } },
          '/posts': { post: { responses: { '201': { description: 'Created' } } } },
        },
      };

      const context: AnalysisContext = {
        files: [],
        diff: '',
        repoConfig: {},
        openApiSpecs: { oldSpec, newSpec: null },
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(2);
      expect(findings.every((f) => f.type === 'BREAKING_API')).toBe(true);
    });
  });

  describe('serialization', () => {
    it('should parse and serialize OpenAPI spec', () => {
      const spec: OpenApiSpec = {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': { get: { responses: { '200': { description: 'OK' } } } },
        },
      };

      const serialized = OpenApiAnalyzer.serializeSpec(spec);
      const parsed = OpenApiAnalyzer.parseSpec(serialized);

      expect(parsed.openapi).toBe(spec.openapi);
      expect(parsed.info.title).toBe(spec.info.title);
      expect(parsed.paths['/test']).toBeDefined();
    });
  });
});
