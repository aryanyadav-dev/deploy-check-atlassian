/**
 * TypeScript Analyzer for CLI
 * Detects breaking API changes in TypeScript/JavaScript files
 */

import * as ts from 'typescript';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzerCli } from './base.analyzer';

/**
 * Represents an exported function signature.
 */
export interface FunctionSignature {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  isAsync: boolean;
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
}

/**
 * TypeScript/JavaScript AST analyzer for detecting breaking API changes.
 * Uses TypeScript compiler API to parse source files and detect changes
 * in exported function signatures (Requirements 2.2, 2.7).
 */
export class TypeScriptAnalyzerCli extends BaseAnalyzerCli {
  readonly name = 'typescript';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const supportedFiles = this.filterSupportedFiles(context);

    for (const file of supportedFiles) {
      const fileFindings = this.analyzeFile(file);
      findings.push(...fileFindings);
    }

    return findings;
  }

  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldSignatures = this.extractExportedFunctions(file.oldContent, file.path);
      const newSignatures = this.extractExportedFunctions(file.newContent, file.path);

      for (const [name, oldSig] of oldSignatures) {
        const newSig = newSignatures.get(name);

        if (!newSig) {
          findings.push(this.createFinding(
            file.path,
            `Exported function '${name}' was removed`,
            `The exported function '${name}' has been removed from the module. This is a breaking change that may affect consumers.`,
            `Ensure all consumers of '${name}' are updated before deploying.`,
          ));
          continue;
        }

        const changes = this.compareSignatures(oldSig, newSig);
        if (changes.length > 0) {
          findings.push(this.createFinding(
            file.path,
            `Breaking change in exported function '${name}'`,
            `The signature of '${name}' has changed:\n${changes.join('\n')}`,
            `Review all callers of '${name}' and update them to match the new signature.`,
          ));
        }
      }
    } catch {
      // Skip files that can't be parsed
    }

    return findings;
  }

  extractExportedFunctions(sourceCode: string, fileName: string): Map<string, FunctionSignature> {
    const signatures = new Map<string, FunctionSignature>();

    const sourceFile = ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(fileName),
    );

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name && this.isExported(node)) {
        const sig = this.extractFunctionSignature(node, sourceFile);
        if (sig) {
          signatures.set(sig.name, sig);
        }
      }

      if (ts.isVariableStatement(node) && this.isExported(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            const sig = this.extractArrowFunctionSignature(decl.name.text, decl.initializer, sourceFile);
            if (sig) {
              signatures.set(sig.name, sig);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return signatures;
  }

  private extractFunctionSignature(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): FunctionSignature | null {
    if (!node.name) return null;

    return {
      name: node.name.text,
      parameters: this.extractParameters(node.parameters, sourceFile),
      returnType: this.getReturnType(node, sourceFile),
      isAsync: this.hasAsyncModifier(node),
    };
  }

  private extractArrowFunctionSignature(
    name: string,
    node: ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
  ): FunctionSignature {
    return {
      name,
      parameters: this.extractParameters(node.parameters, sourceFile),
      returnType: this.getReturnType(node, sourceFile),
      isAsync: this.hasAsyncModifier(node),
    };
  }

  private extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>, sourceFile: ts.SourceFile): ParameterInfo[] {
    return params.map((param) => ({
      name: ts.isIdentifier(param.name) ? param.name.text : param.name.getText(sourceFile),
      type: param.type ? param.type.getText(sourceFile) : 'any',
      optional: !!param.questionToken || !!param.initializer,
    }));
  }

  private getReturnType(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
  ): string {
    if (node.type) {
      return node.type.getText(sourceFile);
    }
    return 'any';
  }

  private hasAsyncModifier(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true
    );
  }

  private isExported(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
    );
  }

  private compareSignatures(oldSig: FunctionSignature, newSig: FunctionSignature): string[] {
    const changes: string[] = [];

    if (oldSig.parameters.length !== newSig.parameters.length) {
      changes.push(`- Parameter count changed from ${oldSig.parameters.length} to ${newSig.parameters.length}`);
    }

    const minParams = Math.min(oldSig.parameters.length, newSig.parameters.length);
    for (let i = 0; i < minParams; i++) {
      const oldParam = oldSig.parameters[i];
      const newParam = newSig.parameters[i];

      if (oldParam.type !== newParam.type) {
        changes.push(`- Parameter '${oldParam.name}' type changed from '${oldParam.type}' to '${newParam.type}'`);
      }

      if (oldParam.optional !== newParam.optional) {
        if (oldParam.optional && !newParam.optional) {
          changes.push(`- Parameter '${oldParam.name}' changed from optional to required`);
        }
      }
    }

    if (oldSig.returnType !== newSig.returnType) {
      changes.push(`- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`);
    }

    if (oldSig.isAsync !== newSig.isAsync) {
      changes.push(`- Function ${newSig.isAsync ? 'became async' : 'is no longer async'}`);
    }

    return changes;
  }

  private createFinding(filePath: string, title: string, description: string, remediation: string): Finding {
    return {
      type: 'BREAKING_API',
      severity: 'HIGH',
      title,
      description,
      filePath,
      remediation,
    };
  }

  private getScriptKind(fileName: string): ts.ScriptKind {
    const ext = this.getExtension(fileName);
    switch (ext) {
      case '.ts': return ts.ScriptKind.TS;
      case '.tsx': return ts.ScriptKind.TSX;
      case '.jsx': return ts.ScriptKind.JSX;
      default: return ts.ScriptKind.JS;
    }
  }
}
