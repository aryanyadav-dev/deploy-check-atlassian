import { Injectable, Logger } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Represents a Go function signature.
 */
export interface GoFunctionSignature {
  name: string;
  parameters: string[];
  returnType: string;
  receiver?: string;
}

/**
 * Represents a Go struct with its exported fields.
 */
export interface GoStructDefinition {
  name: string;
  fields: Map<string, string>; // field name -> field type
}

/**
 * Go analyzer for detecting breaking API changes.
 * Uses regex-based pattern matching to extract exported functions and struct definitions
 * (Requirements 2.1, 2.2, 2.3, 2.4, 6.1, 6.2).
 */
@Injectable()
export class GoAnalyzer extends BaseAnalyzer {
  private readonly logger = new Logger(GoAnalyzer.name);

  readonly name = 'go';
  readonly supportedExtensions = ['.go'];

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
   * Analyze a single Go file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Skip if no old content (new file) or no new content (deleted file)
    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldFunctions = this.extractExportedFunctions(file.oldContent);
      const newFunctions = this.extractExportedFunctions(file.newContent);

      const oldStructs = this.extractStructs(file.oldContent);
      const newStructs = this.extractStructs(file.newContent);

      // Check for removed exported functions
      for (const [name, oldSig] of oldFunctions) {
        const newSig = newFunctions.get(name);

        if (!newSig) {
          findings.push(this.createFinding(
            file.path,
            `Exported function '${name}' was removed`,
            `The exported function '${name}' has been removed. This is a breaking change that may affect consumers.`,
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

      // Check for struct field changes
      for (const [structName, oldStruct] of oldStructs) {
        const newStruct = newStructs.get(structName);

        if (!newStruct) {
          findings.push(this.createFinding(
            file.path,
            `Exported struct '${structName}' was removed`,
            `The exported struct '${structName}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${structName}' are updated before deploying.`,
          ));
          continue;
        }

        // Check for removed or type-changed fields
        const fieldChanges = this.compareStructFields(oldStruct, newStruct);
        if (fieldChanges.length > 0) {
          findings.push(this.createFinding(
            file.path,
            `Breaking change in struct '${structName}'`,
            `The struct '${structName}' has field changes:\n${fieldChanges.join('\n')}`,
            `Review all usages of '${structName}' and update them accordingly.`,
          ));
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to analyze ${file.path}: ${error}`);
    }

    return findings;
  }

  /**
   * Extract exported function definitions from Go source code.
   * Exported functions in Go start with a capital letter.
   */
  extractExportedFunctions(sourceCode: string): Map<string, GoFunctionSignature> {
    const signatures = new Map<string, GoFunctionSignature>();
    
    // Match standalone exported functions: func FunctionName(params) returnType
    const standaloneFuncRegex = /^func\s+([A-Z]\w*)\s*\(([^)]*)\)\s*([^{]*)?/gm;
    
    // Match method functions with receivers: func (r ReceiverType) MethodName(params) returnType
    const methodFuncRegex = /^func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+([A-Z]\w*)\s*\(([^)]*)\)\s*([^{]*)?/gm;
    
    let match;
    
    // Extract standalone functions
    while ((match = standaloneFuncRegex.exec(sourceCode)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      const returnType = (match[3] || '').trim();
      const parameters = this.parseParameters(paramsStr);
      
      signatures.set(name, {
        name,
        parameters,
        returnType: this.normalizeReturnType(returnType),
      });
    }
    
    // Extract method functions (with receivers)
    while ((match = methodFuncRegex.exec(sourceCode)) !== null) {
      const receiver = match[1];
      const name = match[2];
      const paramsStr = match[3];
      const returnType = (match[4] || '').trim();
      const parameters = this.parseParameters(paramsStr);
      
      // Use receiver.MethodName as the key for methods
      const fullName = `${receiver}.${name}`;
      signatures.set(fullName, {
        name,
        parameters,
        returnType: this.normalizeReturnType(returnType),
        receiver,
      });
    }

    return signatures;
  }

  /**
   * Extract exported struct definitions from Go source code.
   * Exported structs in Go start with a capital letter.
   */
  extractStructs(sourceCode: string): Map<string, GoStructDefinition> {
    const structs = new Map<string, GoStructDefinition>();
    
    // Match struct definitions: type StructName struct { ... }
    const structRegex = /type\s+([A-Z]\w*)\s+struct\s*\{([^}]*)\}/gs;
    
    let match;
    while ((match = structRegex.exec(sourceCode)) !== null) {
      const structName = match[1];
      const fieldsBlock = match[2];
      const fields = this.parseStructFields(fieldsBlock);
      
      structs.set(structName, {
        name: structName,
        fields,
      });
    }

    return structs;
  }

  /**
   * Parse struct fields from the fields block.
   * Only extracts exported fields (starting with capital letter).
   */
  private parseStructFields(fieldsBlock: string): Map<string, string> {
    const fields = new Map<string, string>();
    const lines = fieldsBlock.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      // Match field definition: FieldName Type `tags`
      // Only match exported fields (starting with capital letter)
      const fieldMatch = /^([A-Z]\w*)\s+(\S+)/.exec(trimmed);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        fields.set(fieldName, fieldType);
      }
    }
    
    return fields;
  }

  /**
   * Parse parameter string into array of parameter types.
   * Go parameters are in format: name type, name type
   */
  private parseParameters(paramsStr: string): string[] {
    if (!paramsStr.trim()) {
      return [];
    }
    
    const params: string[] = [];
    const parts = paramsStr.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      // Extract the type (last word in the parameter)
      // Handle cases like: a, b int -> both are int
      const words = trimmed.split(/\s+/);
      if (words.length >= 2) {
        // Has explicit type
        params.push(words[words.length - 1]);
      } else if (words.length === 1) {
        // Just a name, type will come from next param with type
        params.push(words[0]);
      }
    }
    
    // Go allows multiple params to share a type: a, b int
    // We need to propagate types backwards
    return this.propagateTypes(params);
  }

  /**
   * Propagate types backwards for Go's grouped parameter syntax.
   * e.g., "a, b int" means both a and b are int
   */
  private propagateTypes(params: string[]): string[] {
    const result: string[] = [];
    let lastType = '';
    
    // Process from right to left
    for (let i = params.length - 1; i >= 0; i--) {
      const param = params[i];
      // Check if this looks like a type (contains type-like characters)
      if (this.looksLikeType(param)) {
        lastType = param;
        result.unshift(param);
      } else {
        // This is a name without type, use the last known type
        result.unshift(lastType || param);
      }
    }
    
    return result;
  }

  /**
   * Check if a string looks like a Go type.
   */
  private looksLikeType(s: string): boolean {
    // Types typically contain: *, [], interface{}, map[], func(), or are basic types
    return /^(\*|\[\]|map\[|func\(|interface\{|chan\s|struct\{|int|string|bool|float|byte|rune|error|any)/.test(s) ||
           /^[A-Z]/.test(s); // Exported types start with capital
  }

  /**
   * Normalize return type string.
   */
  private normalizeReturnType(returnType: string): string {
    // Remove opening brace if present
    return returnType.replace(/\s*\{.*$/, '').trim();
  }

  /**
   * Compare two function signatures and return list of changes.
   */
  private compareSignatures(
    oldSig: GoFunctionSignature,
    newSig: GoFunctionSignature,
  ): string[] {
    const changes: string[] = [];

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

    // Check for return type changes
    if (oldSig.returnType !== newSig.returnType) {
      changes.push(
        `- Return type changed from '${oldSig.returnType || 'void'}' to '${newSig.returnType || 'void'}'`,
      );
    }

    return changes;
  }

  /**
   * Compare struct fields and return list of changes.
   */
  private compareStructFields(
    oldStruct: GoStructDefinition,
    newStruct: GoStructDefinition,
  ): string[] {
    const changes: string[] = [];

    // Check for removed fields
    for (const [fieldName, oldType] of oldStruct.fields) {
      const newType = newStruct.fields.get(fieldName);
      
      if (newType === undefined) {
        changes.push(`- Exported field '${fieldName}' was removed`);
      } else if (oldType !== newType) {
        changes.push(`- Field '${fieldName}' type changed from '${oldType}' to '${newType}'`);
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
