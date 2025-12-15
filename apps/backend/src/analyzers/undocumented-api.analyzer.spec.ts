import { UndocumentedApiAnalyzer } from './undocumented-api.analyzer';
import type { AnalysisContext, FileChange } from '@dra/types';

describe('UndocumentedApiAnalyzer', () => {
  let analyzer: UndocumentedApiAnalyzer;

  beforeEach(() => {
    analyzer = new UndocumentedApiAnalyzer();
  });

  describe('isRouteHandlerFile', () => {
    it('should match controller files', () => {
      expect(analyzer.isRouteHandlerFile('src/users.controller.ts')).toBe(true);
      expect(analyzer.isRouteHandlerFile('src/api/posts.controller.js')).toBe(true);
    });

    it('should match route files', () => {
      expect(analyzer.isRouteHandlerFile('src/users.routes.ts')).toBe(true);
      expect(analyzer.isRouteHandlerFile('src/api/posts.route.js')).toBe(true);
    });

    it('should match files in routes directory', () => {
      expect(analyzer.isRouteHandlerFile('src/routes/users.ts')).toBe(true);
      expect(analyzer.isRouteHandlerFile('api/routes/posts.js')).toBe(true);
    });

    it('should match files in controllers directory', () => {
      expect(analyzer.isRouteHandlerFile('src/controllers/users.ts')).toBe(true);
    });

    it('should match files in api directory', () => {
      expect(analyzer.isRouteHandlerFile('src/api/users.ts')).toBe(true);
    });

    it('should not match non-route files', () => {
      expect(analyzer.isRouteHandlerFile('src/utils.ts')).toBe(false);
      expect(analyzer.isRouteHandlerFile('src/models/user.ts')).toBe(false);
    });
  });

  describe('isOpenApiFile', () => {
    it('should match openapi files', () => {
      expect(analyzer.isOpenApiFile('openapi.yaml')).toBe(true);
      expect(analyzer.isOpenApiFile('api/openapi.yml')).toBe(true);
      expect(analyzer.isOpenApiFile('docs/openapi.json')).toBe(true);
    });

    it('should match swagger files', () => {
      expect(analyzer.isOpenApiFile('swagger.yaml')).toBe(true);
      expect(analyzer.isOpenApiFile('api/swagger.json')).toBe(true);
    });

    it('should not match regular files', () => {
      expect(analyzer.isOpenApiFile('config.yaml')).toBe(false);
      expect(analyzer.isOpenApiFile('src/api.ts')).toBe(false);
    });
  });

  describe('hasRouteDefinitions', () => {
    it('should detect Express-style routes', () => {
      const file: FileChange = {
        path: 'src/routes.ts',
        oldContent: null,
        newContent: `app.get('/users', handler);`,
        hunks: [],
      };
      expect(analyzer.hasRouteDefinitions(file)).toBe(true);
    });

    it('should detect NestJS decorators', () => {
      const file: FileChange = {
        path: 'src/users.controller.ts',
        oldContent: null,
        newContent: `@Get('/users')\nasync getUsers() {}`,
        hunks: [],
      };
      expect(analyzer.hasRouteDefinitions(file)).toBe(true);
    });

    it('should detect router patterns', () => {
      const file: FileChange = {
        path: 'src/routes.ts',
        oldContent: null,
        newContent: `router.post('/users', createUser);`,
        hunks: [],
      };
      expect(analyzer.hasRouteDefinitions(file)).toBe(true);
    });

    it('should not detect non-route code', () => {
      const file: FileChange = {
        path: 'src/utils.ts',
        oldContent: null,
        newContent: `function processData() { return data; }`,
        hunks: [],
      };
      expect(analyzer.hasRouteDefinitions(file)).toBe(false);
    });
  });

  describe('analyze', () => {
    it('should generate finding when route handler modified without OpenAPI change', async () => {
      const context: AnalysisContext = {
        files: [
          {
            path: 'src/users.controller.ts',
            oldContent: '@Get("/users")\ngetUsers() {}',
            newContent: '@Get("/users")\n@Post("/users")\ngetUsers() {}\ncreateUser() {}',
            hunks: [],
          },
        ],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('UNDOCUMENTED_API');
      expect(findings[0].filePath).toBe('src/users.controller.ts');
    });

    it('should not generate finding when OpenAPI spec is also modified', async () => {
      const context: AnalysisContext = {
        files: [
          {
            path: 'src/users.controller.ts',
            oldContent: '@Get("/users")\ngetUsers() {}',
            newContent: '@Get("/users")\n@Post("/users")\ngetUsers() {}\ncreateUser() {}',
            hunks: [],
          },
          {
            path: 'openapi.yaml',
            oldContent: 'paths:\n  /users:\n    get:',
            newContent: 'paths:\n  /users:\n    get:\n    post:',
            hunks: [],
          },
        ],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(0);
    });

    it('should not generate finding for non-route files', async () => {
      const context: AnalysisContext = {
        files: [
          {
            path: 'src/utils.ts',
            oldContent: 'function a() {}',
            newContent: 'function a() {}\nfunction b() {}',
            hunks: [],
          },
        ],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(0);
    });

    it('should not generate finding for route files without route definitions', async () => {
      const context: AnalysisContext = {
        files: [
          {
            path: 'src/users.controller.ts',
            oldContent: '// comment',
            newContent: '// updated comment\nconst x = 1;',
            hunks: [],
          },
        ],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(0);
    });

    it('should handle multiple route handler files', async () => {
      const context: AnalysisContext = {
        files: [
          {
            path: 'src/users.controller.ts',
            oldContent: null,
            newContent: '@Get("/users")\ngetUsers() {}',
            hunks: [],
          },
          {
            path: 'src/posts.controller.ts',
            oldContent: null,
            newContent: '@Post("/posts")\ncreatePosts() {}',
            hunks: [],
          },
        ],
        diff: '',
        repoConfig: {},
      };

      const findings = await analyzer.analyze(context);

      expect(findings).toHaveLength(2);
      expect(findings.map((f) => f.filePath)).toContain('src/users.controller.ts');
      expect(findings.map((f) => f.filePath)).toContain('src/posts.controller.ts');
    });
  });
});
