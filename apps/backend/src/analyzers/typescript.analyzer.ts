import { Injectable, Logger } from '@nestjs/common';
import * as ts from 'typescript';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

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
@Injectable()
export class TypeScriptAnalyzer extends BaseAnalyzer {
  private readonly logger = new Logger(TypeScriptAnalyzer.name);

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

  /**
   * Analyze a single file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Skip if no old content (new file) or no new content (deleted file)
    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldSignatures = this.extractExportedFunctions(file.oldContent, file.path);
      const newSignatures = this.extractExportedFunctions(file.newContent, file.path);

      // Check for breaking changes
      for (const [name, oldSig] of oldSignatures) {
        const newSig = newSignatures.get(name);

        if (!newSig) {
          // Exported function was removed
          findings.push(this.createFinding(
            file.path,
            `Exported function '${name}' was removed`,
            `The exported function '${name}' has been removed from the module. This is a breaking change that may affect consumers.`,
            `Ensure all consumers of '${name}' are updated before deploying.`,
          ));
          continue;
        }

        // Check for signature changes
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
    } catch (error) {
      this.logger.warn(`Failed to analyze ${file.path}: ${error}`);
    }

    return findings;
  }

  /**
   * Extract exported function signatures from source code.
   */
  extractExportedFunctions(
    sourceCode: string,
    fileName: string,
  ): Map<string, FunctionSignature> {
    const signatures = new Map<string, FunctionSignature>();

    const sourceFile = ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(fileName),
    );

    const visit = (node: ts.Node) => {
      // Handle export function declarations
      if (ts.isFunctionDeclaration(node) && node.name && this.isExported(node)) {
        const sig = this.extractFunctionSignature(node, sourceFile);
        if (sig) {
          signatures.set(sig.name, sig);
        }
      }

      // Handle export const arrow functions
      if (ts.isVariableStatement(node) && this.isExported(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) ||
              ts.isFunctionExpression(decl.initializer))
          ) {
            const sig = this.extractArrowFunctionSignature(
              decl.name.text,
              decl.initializer,
              sourceFile,
            );
            if (sig) {
              signatures.set(sig.name, sig);
            }
          }
        }
      }

      // Handle export { name } statements
      if (ts.isExportDeclaration(node) && node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            const localName = element.propertyName?.text || element.name.text;
            const exportedName = element.name.text;
            
            // Find the local declaration
            const localSig = this.findLocalFunction(sourceFile, localName);
            if (localSig) {
              signatures.set(exportedName, { ...localSig, name: exportedName });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return signatures;
  }

  /**
   * Parse TypeScript/JavaScript source and print it back.
   * Used for round-trip testing (Requirements 2.7).
   */
  parseAndPrint(sourceCode: string, fileName: string): string {
    const sourceFile = ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(fileName),
    );

    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    });

    return printer.printFile(sourceFile);
  }

  private extractFunctionSignature(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile,
  ): FunctionSignature | null {
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

  private extractParameters(
    params: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile,
  ): ParameterInfo[] {
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

  private findLocalFunction(
    sourceFile: ts.SourceFile,
    name: string,
  ): FunctionSignature | null {
    let result: FunctionSignature | null = null;

    const visit = (node: ts.Node) => {
      if (result) return;

      if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
        result = this.extractFunctionSignature(node, sourceFile);
      }

      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            decl.name.text === name &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) ||
              ts.isFunctionExpression(decl.initializer))
          ) {
            result = this.extractArrowFunctionSignature(
              name,
              decl.initializer,
              sourceFile,
            );
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return result;
  }

  private compareSignatures(
    oldSig: FunctionSignature,
    newSig: FunctionSignature,
  ): string[] {
    const changes: string[] = [];

    // Check parameter count
    if (oldSig.parameters.length !== newSig.parameters.length) {
      changes.push(
        `- Parameter count changed from ${oldSig.parameters.length} to ${newSig.parameters.length}`,
      );
    }

    // Check parameter types
    const minParams = Math.min(oldSig.parameters.length, newSig.parameters.length);
    for (let i = 0; i < minParams; i++) {
      const oldParam = oldSig.parameters[i];
      const newParam = newSig.parameters[i];

      if (oldParam.type !== newParam.type) {
        changes.push(
          `- Parameter '${oldParam.name}' type changed from '${oldParam.type}' to '${newParam.type}'`,
        );
      }

      // Check if required parameter became optional or vice versa
      if (oldParam.optional !== newParam.optional) {
        if (oldParam.optional && !newParam.optional) {
          changes.push(
            `- Parameter '${oldParam.name}' changed from optional to required`,
          );
        }
      }
    }

    // Check return type
    if (oldSig.returnType !== newSig.returnType) {
      changes.push(
        `- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`,
      );
    }

    // Check async modifier
    if (oldSig.isAsync !== newSig.isAsync) {
      changes.push(
        `- Function ${newSig.isAsync ? 'became async' : 'is no longer async'}`,
      );
    }

    return changes;
  }

  private createFinding(
    filePath: string,
    title: string,
    description: string,
    remediation: string,
  ): Finding {
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
      case '.ts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.jsx':
        return ts.ScriptKind.JSX;
      default:
        return ts.ScriptKind.JS;
    }
  }
}
