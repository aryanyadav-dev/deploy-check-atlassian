import { Injectable, Logger } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Represents a Rust parameter with name, type, and modifiers.
 */
export interface RustParameter {
  name: string;
  type: string;
  isMutable: boolean;
  isSelf: boolean;
}

/**
 * Represents a Rust function signature.
 */
export interface RustFunctionSignature {
  name: string;
  parameters: RustParameter[];
  returnType: string;
  isMethod: boolean;
  implBlock?: string;
}

/**
 * Rust analyzer for detecting breaking API changes.
 * Uses regex-based pattern matching to extract public function and type definitions
 * (Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2).
 */
@Injectable()
export class RustAnalyzer extends BaseAnalyzer {
  private readonly logger = new Logger(RustAnalyzer.name);

  readonly name = 'rust';
  readonly supportedExtensions = ['.rs'];

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
   * Analyze a single Rust file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Skip if no old content (new file) or no new content (deleted file)
    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldFunctions = this.extractPublicFunctions(file.oldContent);
      const newFunctions = this.extractPublicFunctions(file.newContent);

      const oldTypes = this.extractPublicTypes(file.oldContent);
      const newTypes = this.extractPublicTypes(file.newContent);

      const oldTraits = this.extractPublicTraits(file.oldContent);
      const newTraits = this.extractPublicTraits(file.newContent);

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

        // Check for signature changes
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

      // Check for removed public types (structs/enums)
      for (const oldType of oldTypes) {
        if (!newTypes.includes(oldType)) {
          findings.push(this.createFinding(
            file.path,
            `Public type '${oldType}' was removed`,
            `The public struct or enum '${oldType}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${oldType}' are updated before deploying.`,
          ));
        }
      }

      // Check for removed public traits
      for (const oldTrait of oldTraits) {
        if (!newTraits.includes(oldTrait)) {
          findings.push(this.createFinding(
            file.path,
            `Public trait '${oldTrait}' was removed`,
            `The public trait '${oldTrait}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${oldTrait}' are updated before deploying.`,
          ));
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to analyze ${file.path}: ${error}`);
    }

    return findings;
  }


  /**
   * Extract public function definitions from Rust source code.
   * Matches pub fn declarations including methods in impl blocks.
   */
  extractPublicFunctions(sourceCode: string): Map<string, RustFunctionSignature> {
    const signatures = new Map<string, RustFunctionSignature>();
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public functions: pub fn function_name<T>(params) -> ReturnType
    // Also matches pub async fn, pub const fn, pub unsafe fn
    const funcRegex = /pub\s+(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*->\s*([^\n{;]+))?/g;
    
    let match;
    while ((match = funcRegex.exec(cleanedCode)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      const returnType = (match[3] || '()').trim();
      const parameters = this.parseParameters(paramsStr);
      
      // Check if this is a method (has self parameter)
      const isMethod = parameters.some(p => p.isSelf);
      
      signatures.set(name, {
        name,
        parameters,
        returnType,
        isMethod,
      });
    }

    return signatures;
  }

  /**
   * Extract public type definitions (structs and enums) from Rust source code.
   */
  extractPublicTypes(sourceCode: string): string[] {
    const types: string[] = [];
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public structs: pub struct StructName
    const structRegex = /pub\s+struct\s+(\w+)/g;
    
    // Match public enums: pub enum EnumName
    const enumRegex = /pub\s+enum\s+(\w+)/g;
    
    let match;
    
    while ((match = structRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }
    
    while ((match = enumRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }

    return types;
  }

  /**
   * Extract public trait definitions from Rust source code.
   */
  extractPublicTraits(sourceCode: string): string[] {
    const traits: string[] = [];
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public traits: pub trait TraitName
    const traitRegex = /pub\s+trait\s+(\w+)/g;
    
    let match;
    while ((match = traitRegex.exec(cleanedCode)) !== null) {
      traits.push(match[1]);
    }

    return traits;
  }

  /**
   * Remove Rust comments from source code.
   */
  private removeComments(sourceCode: string): string {
    // Remove single-line comments
    let result = sourceCode.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments (including nested)
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  /**
   * Parse parameter string into array of RustParameter objects.
   * Rust parameters are in format: name: Type, mut name: Type, &self, &mut self
   */
  private parseParameters(paramsStr: string): RustParameter[] {
    if (!paramsStr.trim()) {
      return [];
    }
    
    const params: RustParameter[] = [];
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
   * Parse a single Rust parameter definition.
   * Handles: name: Type, mut name: Type, &self, &mut self, self
   */
  private parseParameter(param: string): RustParameter | null {
    if (!param) return null;
    
    const trimmed = param.trim();
    
    // Handle self parameters
    if (trimmed === 'self' || trimmed === '&self' || trimmed === '&mut self' || trimmed === 'mut self') {
      return {
        name: 'self',
        type: trimmed,
        isMutable: trimmed.includes('mut'),
        isSelf: true,
      };
    }
    
    // Handle self: Type patterns (e.g., self: Box<Self>, self: &Self)
    if (trimmed.startsWith('self:') || trimmed.startsWith('mut self:')) {
      const colonIndex = trimmed.indexOf(':');
      const type = trimmed.slice(colonIndex + 1).trim();
      return {
        name: 'self',
        type,
        isMutable: trimmed.startsWith('mut'),
        isSelf: true,
      };
    }
    
    // Check for mut keyword
    const isMutable = trimmed.startsWith('mut ');
    const withoutMut = isMutable ? trimmed.slice(4).trim() : trimmed;
    
    // Split by colon to separate name from type
    const colonIndex = withoutMut.indexOf(':');
    if (colonIndex === -1) return null;
    
    const name = withoutMut.slice(0, colonIndex).trim();
    const type = withoutMut.slice(colonIndex + 1).trim();
    
    return {
      name,
      type,
      isMutable,
      isSelf: false,
    };
  }

  /**
   * Compare two function signatures and return list of changes.
   */
  private compareSignatures(
    oldSig: RustFunctionSignature,
    newSig: RustFunctionSignature,
  ): string[] {
    const changes: string[] = [];

    // Check for return type changes
    if (oldSig.returnType !== newSig.returnType) {
      changes.push(
        `- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`,
      );
    }

    // Filter out self parameters for comparison (they don't affect API compatibility in the same way)
    const oldParams = oldSig.parameters.filter(p => !p.isSelf);
    const newParams = newSig.parameters.filter(p => !p.isSelf);

    // Check for parameter count changes
    if (oldParams.length !== newParams.length) {
      changes.push(
        `- Parameter count changed from ${oldParams.length} to ${newParams.length}`,
      );
    }

    // Check for parameter changes (name or type)
    const minParams = Math.min(oldParams.length, newParams.length);
    for (let i = 0; i < minParams; i++) {
      const oldParam = oldParams[i];
      const newParam = newParams[i];
      
      if (oldParam.type !== newParam.type) {
        changes.push(
          `- Parameter '${oldParam.name}' type changed from '${oldParam.type}' to '${newParam.type}'`,
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
