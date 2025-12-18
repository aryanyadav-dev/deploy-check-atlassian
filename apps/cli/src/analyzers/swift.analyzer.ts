/**
 * Swift Analyzer for CLI
 * Detects breaking API changes in Swift files
 * (Requirements 5.1, 5.2, 5.3, 5.4)
 */

import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzerCli } from './base.analyzer';

/**
 * Represents a Swift parameter with label, name, and type.
 */
export interface SwiftParameter {
  label: string;
  name: string;
  type: string;
}

/**
 * Represents a Swift function signature.
 */
export interface SwiftFunctionSignature {
  name: string;
  parameters: SwiftParameter[];
  returnType: string;
  isMethod: boolean;
  typeName?: string;
}

/**
 * Swift analyzer for detecting breaking API changes.
 * Uses regex-based pattern matching to extract public function and type definitions.
 */
export class SwiftAnalyzerCli extends BaseAnalyzerCli {
  readonly name = 'swift';
  readonly supportedExtensions = ['.swift'];

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
   * Analyze a single Swift file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldFunctions = this.extractPublicFunctions(file.oldContent);
      const newFunctions = this.extractPublicFunctions(file.newContent);

      const oldTypes = this.extractPublicTypes(file.oldContent);
      const newTypes = this.extractPublicTypes(file.newContent);

      // Check for removed public functions
      for (const [name, oldSig] of oldFunctions) {
        const newSig = newFunctions.get(name);

        if (!newSig) {
          findings.push(this.createFinding(
            file.path,
            `Public function '${name}' was removed`,
            `The public function '${name}' has been removed. This is a breaking change that may affect consumers.`,
            `Ensure all consumers of '${name}' are updated before deploying.`,
          ));
          continue;
        }

        const changes = this.compareSignatures(oldSig, newSig);
        if (changes.length > 0) {
          findings.push(this.createFinding(
            file.path,
            `Breaking change in public function '${name}'`,
            `The signature of '${name}' has changed:\n${changes.join('\n')}`,
            `Review all callers of '${name}' and update them to match the new signature.`,
          ));
        }
      }

      // Check for removed public types (classes/structs/protocols)
      for (const oldType of oldTypes) {
        if (!newTypes.includes(oldType)) {
          findings.push(this.createFinding(
            file.path,
            `Public type '${oldType}' was removed`,
            `The public class, struct, or protocol '${oldType}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${oldType}' are updated before deploying.`,
          ));
        }
      }
    } catch {
      // Skip files that can't be parsed
    }

    return findings;
  }


  /**
   * Extract public function definitions from Swift source code.
   * Matches public func declarations including methods.
   */
  extractPublicFunctions(sourceCode: string): Map<string, SwiftFunctionSignature> {
    const signatures = new Map<string, SwiftFunctionSignature>();
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public functions: public func functionName(params) -> ReturnType
    // Also matches open func (which is also public)
    const funcRegex = /(?:public|open)\s+(?:static\s+)?func\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\n{]+))?/g;
    
    let match;
    while ((match = funcRegex.exec(cleanedCode)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      const returnType = (match[3] || 'Void').trim();
      const parameters = this.parseParameters(paramsStr);
      
      // Create a unique key that includes parameter labels for overloaded functions
      const paramKey = parameters.map(p => p.label || '_').join(':');
      const fullName = paramKey ? `${name}(${paramKey}:)` : name;
      
      signatures.set(fullName, {
        name,
        parameters,
        returnType,
        isMethod: false,
      });
    }

    return signatures;
  }

  /**
   * Extract public type definitions (classes, structs, protocols, enums) from Swift source code.
   */
  extractPublicTypes(sourceCode: string): string[] {
    const types: string[] = [];
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public classes: public [final] class ClassName
    const classRegex = /(?:public|open)\s+(?:final\s+)?class\s+(\w+)/g;
    
    // Match public structs: public struct StructName
    const structRegex = /public\s+struct\s+(\w+)/g;
    
    // Match public protocols: public protocol ProtocolName
    const protocolRegex = /public\s+protocol\s+(\w+)/g;
    
    // Match public enums: public enum EnumName
    const enumRegex = /public\s+enum\s+(\w+)/g;
    
    let match;
    
    while ((match = classRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }
    
    while ((match = structRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }
    
    while ((match = protocolRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }
    
    while ((match = enumRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }

    return types;
  }

  /**
   * Remove Swift comments from source code.
   */
  private removeComments(sourceCode: string): string {
    // Remove single-line comments
    let result = sourceCode.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  /**
   * Parse parameter string into array of SwiftParameter objects.
   * Swift parameters are in format: label name: Type, label name: Type
   * or: _ name: Type (external label is underscore)
   * or: name: Type (label and name are the same)
   */
  private parseParameters(paramsStr: string): SwiftParameter[] {
    if (!paramsStr.trim()) {
      return [];
    }
    
    const params: SwiftParameter[] = [];
    let depth = 0;
    let current = '';
    
    for (const char of paramsStr) {
      if (char === '<' || char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === '>' || char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        const param = this.parseParameter(current.trim());
        if (param) params.push(param);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last parameter
    const lastParam = this.parseParameter(current.trim());
    if (lastParam) params.push(lastParam);
    
    return params;
  }

  /**
   * Parse a single Swift parameter definition.
   * Handles: label name: Type, _ name: Type, name: Type
   */
  private parseParameter(param: string): SwiftParameter | null {
    if (!param) return null;
    
    // Remove default value if present
    const withoutDefault = param.split('=')[0].trim();
    
    // Split by colon to separate name(s) from type
    const colonIndex = withoutDefault.indexOf(':');
    if (colonIndex === -1) return null;
    
    const namePart = withoutDefault.slice(0, colonIndex).trim();
    const type = withoutDefault.slice(colonIndex + 1).trim();
    
    // Parse the name part: could be "label name" or just "name"
    const nameParts = namePart.split(/\s+/);
    
    if (nameParts.length >= 2) {
      // Has both label and name
      return {
        label: nameParts[0],
        name: nameParts[1],
        type,
      };
    } else if (nameParts.length === 1) {
      // Label and name are the same
      return {
        label: nameParts[0],
        name: nameParts[0],
        type,
      };
    }
    
    return null;
  }

  /**
   * Compare two function signatures and return list of changes.
   */
  private compareSignatures(
    oldSig: SwiftFunctionSignature,
    newSig: SwiftFunctionSignature,
  ): string[] {
    const changes: string[] = [];

    // Check for return type changes
    if (oldSig.returnType !== newSig.returnType) {
      changes.push(
        `- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`,
      );
    }

    // Check for parameter count changes
    if (oldSig.parameters.length !== newSig.parameters.length) {
      changes.push(
        `- Parameter count changed from ${oldSig.parameters.length} to ${newSig.parameters.length}`,
      );
    }

    // Check for parameter changes (label, name, or type)
    const minParams = Math.min(oldSig.parameters.length, newSig.parameters.length);
    for (let i = 0; i < minParams; i++) {
      const oldParam = oldSig.parameters[i];
      const newParam = newSig.parameters[i];
      
      if (oldParam.label !== newParam.label) {
        changes.push(
          `- Parameter ${i + 1} label changed from '${oldParam.label}' to '${newParam.label}'`,
        );
      }
      
      if (oldParam.type !== newParam.type) {
        changes.push(
          `- Parameter ${i + 1} type changed from '${oldParam.type}' to '${newParam.type}'`,
        );
      }
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
}
