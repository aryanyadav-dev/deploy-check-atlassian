import { TypeScriptAnalyzer } from './typescript.analyzer';
import type { AnalysisContext, FileChange } from '@dra/types';

describe('TypeScriptAnalyzer', () => {
  let analyzer: TypeScriptAnalyzer;

  beforeEach(() => {
    analyzer = new TypeScriptAnalyzer();
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(analyzer.name).toBe('typescript');
    });

    it('should support TypeScript and JavaScript extensions', () => {
      expect(analyzer.supportedExtensions).toContain('.ts');
      expect(analyzer.supportedExtensions).toContain('.tsx');
      expect(analyzer.supportedExtensions).toContain('.js');
      expect(analyzer.supportedExtensions).toContain('.jsx');
    });
  });

  describe('extractExportedFunctions', () => {
    it('should extract exported function declarations', () => {
      const code = `
        export function greet(name: string): string {
          return \`Hello, \${name}\`;
        }
      `;

      const signatures = analyzer.extractExportedFunctions(code, 'test.ts');
      expect(signatures.has('greet')).toBe(true);

      const sig = signatures.get('greet')!;
      expect(sig.name).toBe('greet');
      expect(sig.parameters).toHaveLength(1);
      expect(sig.parameters[0].name).toBe('name');
      expect(sig.parameters[0].type).toBe('string');
      expect(sig.returnType).toBe('string');
    });

    it('should extract exported arrow functions', () => {
      const code = `
        export const add = (a: number, b: number): number => a + b;
      `;

      const signatures = analyzer.extractExportedFunctions(code, 'test.ts');
      expect(signatures.has('add')).toBe(true);

      const sig = signatures.get('add')!;
      expect(sig.parameters).toHaveLength(2);
      expect(sig.parameters[0].type).toBe('number');
      expect(sig.returnType).toBe('number');
    });

    it('should detect async functions', () => {
      const code = `
        export async function fetchData(url: string): Promise<string> {
          return '';
        }
      `;

      const signatures = analyzer.extractExportedFunctions(code, 'test.ts');
      const sig = signatures.get('fetchData')!;
      expect(sig.isAsync).toBe(true);
    });

    it('should detect optional parameters', () => {
      const code = `
        export function greet(name: string, greeting?: string): string {
          return '';
        }
      `;

      const signatures = analyzer.extractExportedFunctions(code, 'test.ts');
      const sig = signatures.get('greet')!;
      expect(sig.parameters[0].optional).toBe(false);
      expect(sig.parameters[1].optional).toBe(true);
    });

    it('should not extract non-exported functions', () => {
      const code = `
        function privateFunc(): void {}
        export function publicFunc(): void {}
      `;

      const signatures = analyzer.extractExportedFunctions(code, 'test.ts');
      expect(signatures.has('privateFunc')).toBe(false);
      expect(signatures.has('publicFunc')).toBe(true);
    });
  });

  describe('analyze', () => {
    const createContext = (files: FileChange[]): AnalysisContext => ({
      files,
      diff: '',
      repoConfig: {},
    });

    it('should detect removed exported function', async () => {
      const oldCode = `
        export function greet(name: string): string {
          return name;
        }
      `;
      const newCode = `
        // Function removed
      `;

      const context = createContext([
        {
          path: 'src/utils.ts',
          oldContent: oldCode,
          newContent: newCode,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('BREAKING_API');
      expect(findings[0].title).toContain('greet');
      expect(findings[0].title).toContain('removed');
    });

    it('should detect parameter type change', async () => {
      const oldCode = `
        export function process(data: string): void {}
      `;
      const newCode = `
        export function process(data: number): void {}
      `;

      const context = createContext([
        {
          path: 'src/utils.ts',
          oldContent: oldCode,
          newContent: newCode,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('BREAKING_API');
      expect(findings[0].description).toContain('string');
      expect(findings[0].description).toContain('number');
    });

    it('should detect parameter count change', async () => {
      const oldCode = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;
      const newCode = `
        export function add(a: number, b: number, c: number): number {
          return a + b + c;
        }
      `;

      const context = createContext([
        {
          path: 'src/math.ts',
          oldContent: oldCode,
          newContent: newCode,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain('Parameter count');
    });

    it('should detect return type change', async () => {
      const oldCode = `
        export function getValue(): string {
          return '';
        }
      `;
      const newCode = `
        export function getValue(): number {
          return 0;
        }
      `;

      const context = createContext([
        {
          path: 'src/utils.ts',
          oldContent: oldCode,
          newContent: newCode,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain('Return type');
    });

    it('should not report findings for new files', async () => {
      const context = createContext([
        {
          path: 'src/new.ts',
          oldContent: null,
          newContent: 'export function newFunc(): void {}',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });

    it('should not report findings for deleted files', async () => {
      const context = createContext([
        {
          path: 'src/old.ts',
          oldContent: 'export function oldFunc(): void {}',
          newContent: null,
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });

    it('should skip unsupported file types', async () => {
      const context = createContext([
        {
          path: 'README.md',
          oldContent: '# Old',
          newContent: '# New',
          hunks: [],
        },
      ]);

      const findings = await analyzer.analyze(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('parseAndPrint', () => {
    it('should parse and print TypeScript code', () => {
      const code = 'const x: number = 1;';
      const result = analyzer.parseAndPrint(code, 'test.ts');
      expect(result).toContain('const x');
      expect(result).toContain('number');
    });

    it('should handle JSX syntax', () => {
      const code = 'const el = <div>Hello</div>;';
      const result = analyzer.parseAndPrint(code, 'test.tsx');
      expect(result).toContain('div');
    });
  });
});
