import { Injectable, Logger } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Represents a Java method signature.
 */
export interface JavaMethodSignature {
  name: string;
  returnType: string;
  parameters: string[];
  isStatic: boolean;
  className?: string;
}

/**
 * Java analyzer for detecting breaking API changes.
 * Uses regex-based pattern matching to extract public method and type definitions
 * (Requirements 3.1, 3.2, 3.3, 3.4, 6.1, 6.2).
 */
@Injectable()
export class JavaAnalyzer extends BaseAnalyzer {
  private readonly logger = new Logger(JavaAnalyzer.name);

  readonly name = 'java';
  readonly supportedExtensions = ['.java'];

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
   * Analyze a single Java file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Skip if no old content (new file) or no new content (deleted file)
    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldMethods = this.extractPublicMethods(file.oldContent);
      const newMethods = this.extractPublicMethods(file.newContent);

      const oldTypes = this.extractPublicTypes(file.oldContent);
      const newTypes = this.extractPublicTypes(file.newContent);

      // Check for removed public methods
      for (const [name, oldSig] of oldMethods) {
        const newSig = newMethods.get(name);

        if (!newSig) {
          findings.push(this.createFinding(
            file.path,
            `Public method '${name}' was removed`,
            `The public method '${name}' has been removed. This is a breaking change that may affect consumers.`,
            `Ensure all consumers of '${name}' are updated before deploying.`,
          ));
          continue;
        }

        // Check for signature changes
        const changes = this.compareSignatures(oldSig, newSig);
        if (changes.length > 0) {
          findings.push(this.createFinding(
            file.path,
            `Breaking change in public method '${name}'`,
            `The signature of '${name}' has changed:\n${changes.join('\n')}`,
            `Review all callers of '${name}' and update them to match the new signature.`,
          ));
        }
      }

      // Check for removed public types (classes/interfaces)
      for (const oldType of oldTypes) {
        if (!newTypes.includes(oldType)) {
          findings.push(this.createFinding(
            file.path,
            `Public type '${oldType}' was removed`,
            `The public class or interface '${oldType}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${oldType}' are updated before deploying.`,
          ));
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to analyze ${file.path}: ${error}`);
    }

    return findings;
  }


  /**
   * Extract public method definitions from Java source code.
   * Matches public methods including static methods.
   */
  extractPublicMethods(sourceCode: string): Map<string, JavaMethodSignature> {
    const signatures = new Map<string, JavaMethodSignature>();
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public methods: public [static] [final] ReturnType methodName(params)
    // This regex handles generics in return types and parameters
    const methodRegex = /public\s+(static\s+)?(final\s+)?(?:<[^>]+>\s+)?(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*\(([^)]*)\)/g;
    
    let match;
    while ((match = methodRegex.exec(cleanedCode)) !== null) {
      const isStatic = !!match[1];
      const returnType = match[3];
      const name = match[4];
      const paramsStr = match[5];
      
      // Skip constructors (method name same as class name pattern)
      // Constructors don't have a return type in the match
      if (this.isConstructor(name, cleanedCode)) {
        continue;
      }
      
      const parameters = this.parseParameters(paramsStr);
      
      signatures.set(name, {
        name,
        returnType,
        parameters,
        isStatic,
      });
    }

    return signatures;
  }

  /**
   * Extract public type definitions (classes and interfaces) from Java source code.
   */
  extractPublicTypes(sourceCode: string): string[] {
    const types: string[] = [];
    
    // Remove comments to avoid false matches
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match public classes: public [abstract] [final] class ClassName
    const classRegex = /public\s+(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/g;
    
    // Match public interfaces: public interface InterfaceName
    const interfaceRegex = /public\s+interface\s+(\w+)/g;
    
    // Match public enums: public enum EnumName
    const enumRegex = /public\s+enum\s+(\w+)/g;
    
    let match;
    
    while ((match = classRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }
    
    while ((match = interfaceRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }
    
    while ((match = enumRegex.exec(cleanedCode)) !== null) {
      types.push(match[1]);
    }

    return types;
  }

  /**
   * Check if a method name is likely a constructor.
   */
  private isConstructor(methodName: string, sourceCode: string): boolean {
    // Check if there's a class with the same name
    const classRegex = new RegExp(`class\\s+${methodName}\\s*[<{]`);
    return classRegex.test(sourceCode);
  }

  /**
   * Remove Java comments from source code.
   */
  private removeComments(sourceCode: string): string {
    // Remove single-line comments
    let result = sourceCode.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  /**
   * Parse parameter string into array of parameter types.
   * Java parameters are in format: Type name, Type name
   */
  private parseParameters(paramsStr: string): string[] {
    if (!paramsStr.trim()) {
      return [];
    }
    
    const params: string[] = [];
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
        const paramType = this.extractParamType(current.trim());
        if (paramType) params.push(paramType);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last parameter
    const lastParamType = this.extractParamType(current.trim());
    if (lastParamType) params.push(lastParamType);
    
    return params;
  }

  /**
   * Extract parameter type from a parameter definition.
   * Handles annotations, final modifier, and varargs.
   */
  private extractParamType(param: string): string | null {
    if (!param) return null;
    
    // Remove annotations like @NotNull, @Nullable
    let cleaned = param.replace(/@\w+(?:\([^)]*\))?\s*/g, '');
    
    // Remove final modifier
    cleaned = cleaned.replace(/\bfinal\s+/g, '');
    
    // Split by whitespace to get type and name
    const parts = cleaned.trim().split(/\s+/);
    
    if (parts.length >= 2) {
      // Type is everything except the last part (which is the name)
      const type = parts.slice(0, -1).join(' ');
      // Handle varargs: String... -> String[]
      return type.replace(/\.\.\./, '[]');
    } else if (parts.length === 1) {
      // Just a type without name (shouldn't happen in valid Java)
      return parts[0];
    }
    
    return null;
  }

  /**
   * Compare two method signatures and return list of changes.
   */
  private compareSignatures(
    oldSig: JavaMethodSignature,
    newSig: JavaMethodSignature,
  ): string[] {
    const changes: string[] = [];

    // Check for return type changes
    if (oldSig.returnType !== newSig.returnType) {
      changes.push(
        `- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`,
      );
    }

    // Check for static modifier changes
    if (oldSig.isStatic !== newSig.isStatic) {
      changes.push(
        `- Method ${newSig.isStatic ? 'became static' : 'is no longer static'}`,
      );
    }

    // Check for parameter count changes
    if (oldSig.parameters.length !== newSig.parameters.length) {
      changes.push(
        `- Parameter count changed from ${oldSig.parameters.length} to ${newSig.parameters.length}`,
      );
    }

    // Check for parameter type changes
    const minParams = Math.min(oldSig.parameters.length, newSig.parameters.length);
    for (let i = 0; i < minParams; i++) {
      if (oldSig.parameters[i] !== newSig.parameters[i]) {
        changes.push(
          `- Parameter ${i + 1} type changed from '${oldSig.parameters[i]}' to '${newSig.parameters[i]}'`,
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
