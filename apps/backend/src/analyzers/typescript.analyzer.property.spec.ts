import * as fc from 'fast-check';
import * as ts from 'typescript';
import { TypeScriptAnalyzer } from './typescript.analyzer';

/**
 * Property test for TypeScript AST Round-Trip
 * **Feature: deployment-risk-analyzer, Property 1: TypeScript AST Round-Trip**
 *
 * For any valid JavaScript or TypeScript source code, parsing it into an AST
 * and printing it back should produce semantically equivalent source code
 * (whitespace-normalized comparison).
 */

describe('TypeScript AST Round-Trip Property', () => {
  const analyzer = new TypeScriptAnalyzer();

  // Helper to normalize whitespace for comparison
  const normalizeWhitespace = (code: string): string => {
    return code
      .replace(/\s+/g, ' ')
      .replace(/\s*([{};,():])\s*/g, '$1')
      .trim();
  };

  // Helper to check semantic equivalence by comparing AST structure
  const areASTsEquivalent = (code1: string, code2: string, fileName: string): boolean => {
    try {
      const scriptKind = fileName.endsWith('.tsx')
        ? ts.ScriptKind.TSX
        : fileName.endsWith('.ts')
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;

      const ast1 = ts.createSourceFile(fileName, code1, ts.ScriptTarget.Latest, true, scriptKind);
      const ast2 = ts.createSourceFile(fileName, code2, ts.ScriptTarget.Latest, true, scriptKind);

      // Compare statement counts
      if (ast1.statements.length !== ast2.statements.length) {
        return false;
      }

      // Compare each statement's kind
      for (let i = 0; i < ast1.statements.length; i++) {
        if (ast1.statements[i].kind !== ast2.statements[i].kind) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  };

  // Generator for valid TypeScript identifiers
  const identifierArb = fc
    .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 20)
    .filter((s) => !['if', 'else', 'for', 'while', 'function', 'const', 'let', 'var', 'return', 'export', 'import', 'class', 'interface', 'type', 'async', 'await'].includes(s));

  // Generator for simple TypeScript types
  const typeArb = fc.constantFrom('string', 'number', 'boolean', 'void', 'any', 'unknown');

  // Generator for simple variable declarations
  const variableDeclarationArb = fc.tuple(
    fc.constantFrom('const', 'let'),
    identifierArb,
    typeArb,
    fc.constantFrom('""', '0', 'true', 'false', 'null'),
  ).map(([keyword, name, type, value]) => `${keyword} ${name}: ${type} = ${value};`);

  // Generator for simple function declarations
  const functionDeclarationArb = fc.tuple(
    fc.boolean(), // export
    fc.boolean(), // async
    identifierArb,
    fc.array(fc.tuple(identifierArb, typeArb), { minLength: 0, maxLength: 3 }),
    typeArb,
  ).map(([isExport, isAsync, name, params, returnType]) => {
    const exportKeyword = isExport ? 'export ' : '';
    const asyncKeyword = isAsync ? 'async ' : '';
    const paramStr = params.map(([pName, pType]) => `${pName}: ${pType}`).join(', ');
    return `${exportKeyword}${asyncKeyword}function ${name}(${paramStr}): ${returnType} {}`;
  });

  // Generator for arrow function declarations
  const arrowFunctionArb = fc.tuple(
    fc.boolean(), // export
    identifierArb,
    fc.array(fc.tuple(identifierArb, typeArb), { minLength: 0, maxLength: 3 }),
    typeArb,
  ).map(([isExport, name, params, returnType]) => {
    const exportKeyword = isExport ? 'export ' : '';
    const paramStr = params.map(([pName, pType]) => `${pName}: ${pType}`).join(', ');
    return `${exportKeyword}const ${name} = (${paramStr}): ${returnType} => {};`;
  });

  // Generator for valid TypeScript code snippets
  const validCodeArb = fc.oneof(
    variableDeclarationArb,
    functionDeclarationArb,
    arrowFunctionArb,
  );

  // Generator for multiple statements
  const multiStatementCodeArb = fc
    .array(validCodeArb, { minLength: 1, maxLength: 5 })
    .map((statements) => statements.join('\n'));

  /**
   * Property 1: TypeScript AST Round-Trip
   * For any valid TypeScript source code, parsing it into an AST and printing it back
   * should produce semantically equivalent source code.
   */
  it('should preserve semantic equivalence through parse-print round-trip', () => {
    fc.assert(
      fc.property(multiStatementCodeArb, (code) => {
        const printed = analyzer.parseAndPrint(code, 'test.ts');

        // The printed code should be parseable
        expect(() => {
          ts.createSourceFile('test.ts', printed, ts.ScriptTarget.Latest, true);
        }).not.toThrow();

        // The ASTs should be structurally equivalent
        expect(areASTsEquivalent(code, printed, 'test.ts')).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('should be idempotent - multiple round trips produce same result', () => {
    fc.assert(
      fc.property(multiStatementCodeArb, (code) => {
        const firstPrint = analyzer.parseAndPrint(code, 'test.ts');
        const secondPrint = analyzer.parseAndPrint(firstPrint, 'test.ts');

        // After the first round-trip, subsequent round-trips should be stable
        expect(normalizeWhitespace(secondPrint)).toBe(normalizeWhitespace(firstPrint));
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve exported function signatures through round-trip', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          identifierArb,
          fc.array(fc.tuple(identifierArb, typeArb), { minLength: 0, maxLength: 3 }),
          typeArb,
        ),
        ([name, params, returnType]) => {
          const paramStr = params.map(([pName, pType]) => `${pName}: ${pType}`).join(', ');
          const code = `export function ${name}(${paramStr}): ${returnType} {}`;

          const printed = analyzer.parseAndPrint(code, 'test.ts');

          // Extract signatures from both original and printed
          const originalSigs = analyzer.extractExportedFunctions(code, 'test.ts');
          const printedSigs = analyzer.extractExportedFunctions(printed, 'test.ts');

          // Should have the same function
          expect(printedSigs.has(name)).toBe(true);

          const origSig = originalSigs.get(name)!;
          const printedSig = printedSigs.get(name)!;

          // Signatures should match
          expect(printedSig.parameters.length).toBe(origSig.parameters.length);
          expect(printedSig.returnType).toBe(origSig.returnType);

          for (let i = 0; i < origSig.parameters.length; i++) {
            expect(printedSig.parameters[i].type).toBe(origSig.parameters[i].type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle JavaScript files', () => {
    fc.assert(
      fc.property(
        fc.tuple(identifierArb, fc.constantFrom('""', '0', 'true', 'null')),
        ([name, value]) => {
          const code = `const ${name} = ${value};`;
          const printed = analyzer.parseAndPrint(code, 'test.js');

          expect(areASTsEquivalent(code, printed, 'test.js')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property test for Exported Function Signature Change Detection
 * **Feature: deployment-risk-analyzer, Property 9: Exported Function Signature Change Detection**
 *
 * For any TypeScript/JavaScript diff where an exported function's parameter types,
 * return type, or parameter count changes, the TypeScript analyzer should produce
 * a Finding of type BREAKING_API.
 */
describe('Exported Function Signature Change Detection Property', () => {
  const analyzer = new TypeScriptAnalyzer();

  // Generator for valid TypeScript identifiers
  const identifierArb = fc
    .stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .filter((s) => s.length > 0 && s.length <= 20)
    .filter((s) => !['if', 'else', 'for', 'while', 'function', 'const', 'let', 'var', 'return', 'export', 'import', 'class', 'interface', 'type', 'async', 'await'].includes(s));

  // Generator for simple TypeScript types
  const typeArb = fc.constantFrom('string', 'number', 'boolean', 'void', 'any');

  // Generator for different types (guaranteed to be different)
  const differentTypePairArb = fc
    .tuple(typeArb, typeArb)
    .filter(([t1, t2]) => t1 !== t2);

  /**
   * Property 9: When parameter type changes, should produce BREAKING_API finding
   */
  it('should detect parameter type changes as BREAKING_API', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        identifierArb,
        differentTypePairArb,
        async (funcName, paramName, [oldType, newType]) => {
          const oldCode = `export function ${funcName}(${paramName}: ${oldType}): void {}`;
          const newCode = `export function ${funcName}(${paramName}: ${newType}): void {}`;

          const findings = await analyzer.analyze({
            files: [
              {
                path: 'src/test.ts',
                oldContent: oldCode,
                newContent: newCode,
                hunks: [],
              },
            ],
            diff: '',
            repoConfig: {},
          });

          // Should produce exactly one BREAKING_API finding
          expect(findings.length).toBeGreaterThanOrEqual(1);
          expect(findings.some((f) => f.type === 'BREAKING_API')).toBe(true);
          expect(findings.some((f) => f.description.includes(oldType) && f.description.includes(newType))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 9: When return type changes, should produce BREAKING_API finding
   */
  it('should detect return type changes as BREAKING_API', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        differentTypePairArb,
        async (funcName, [oldType, newType]) => {
          const oldCode = `export function ${funcName}(): ${oldType} { return null as any; }`;
          const newCode = `export function ${funcName}(): ${newType} { return null as any; }`;

          const findings = await analyzer.analyze({
            files: [
              {
                path: 'src/test.ts',
                oldContent: oldCode,
                newContent: newCode,
                hunks: [],
              },
            ],
            diff: '',
            repoConfig: {},
          });

          expect(findings.length).toBeGreaterThanOrEqual(1);
          expect(findings.some((f) => f.type === 'BREAKING_API')).toBe(true);
          expect(findings.some((f) => f.description.includes('Return type'))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 9: When parameter count changes, should produce BREAKING_API finding
   */
  it('should detect parameter count changes as BREAKING_API', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        fc.array(identifierArb, { minLength: 1, maxLength: 3 }),
        fc.array(identifierArb, { minLength: 1, maxLength: 3 }),
        async (funcName, oldParams, newParams) => {
          // Ensure different parameter counts
          fc.pre(oldParams.length !== newParams.length);

          const oldParamStr = oldParams.map((p) => `${p}: string`).join(', ');
          const newParamStr = newParams.map((p) => `${p}: string`).join(', ');

          const oldCode = `export function ${funcName}(${oldParamStr}): void {}`;
          const newCode = `export function ${funcName}(${newParamStr}): void {}`;

          const findings = await analyzer.analyze({
            files: [
              {
                path: 'src/test.ts',
                oldContent: oldCode,
                newContent: newCode,
                hunks: [],
              },
            ],
            diff: '',
            repoConfig: {},
          });

          expect(findings.length).toBeGreaterThanOrEqual(1);
          expect(findings.some((f) => f.type === 'BREAKING_API')).toBe(true);
          expect(findings.some((f) => f.description.includes('Parameter count'))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 9: When exported function is removed, should produce BREAKING_API finding
   */
  it('should detect removed exported functions as BREAKING_API', async () => {
    await fc.assert(
      fc.asyncProperty(identifierArb, async (funcName) => {
        const oldCode = `export function ${funcName}(): void {}`;
        const newCode = `// function removed`;

        const findings = await analyzer.analyze({
          files: [
            {
              path: 'src/test.ts',
              oldContent: oldCode,
              newContent: newCode,
              hunks: [],
            },
          ],
          diff: '',
          repoConfig: {},
        });

        expect(findings.length).toBeGreaterThanOrEqual(1);
        expect(findings.some((f) => f.type === 'BREAKING_API')).toBe(true);
        expect(findings.some((f) => f.title.includes('removed'))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 9: When signature is unchanged, should NOT produce BREAKING_API finding
   */
  it('should not produce findings when signature is unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        identifierArb,
        fc.array(fc.tuple(identifierArb, typeArb), { minLength: 0, maxLength: 3 }),
        typeArb,
        async (funcName, params, returnType) => {
          const paramStr = params.map(([name, type]) => `${name}: ${type}`).join(', ');
          const code = `export function ${funcName}(${paramStr}): ${returnType} {}`;

          // Same code for old and new (only implementation might differ)
          const findings = await analyzer.analyze({
            files: [
              {
                path: 'src/test.ts',
                oldContent: code,
                newContent: code,
                hunks: [],
              },
            ],
            diff: '',
            repoConfig: {},
          });

          // Should not produce any BREAKING_API findings
          expect(findings.filter((f) => f.type === 'BREAKING_API')).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
