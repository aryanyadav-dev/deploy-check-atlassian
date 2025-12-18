import { Injectable, Logger } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Represents a Python function signature.
 */
export interface PythonFunctionSignature {
  name: string;
  parameters: string[];
  isMethod: boolean;
  className?: string;
}

/**
 * Python analyzer for detecting breaking API changes.
 * Uses regex-based pattern matching to extract function and class definitions
 * (Requirements 1.1, 1.2, 1.3, 1.4, 6.1, 6.2).
 */
@Injectable()
export class PythonAnalyzer extends BaseAnalyzer {
  private readonly logger = new Logger(PythonAnalyzer.name);

  readonly name = 'python';
  readonly supportedExtensions = ['.py'];

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
   * Analyze a single Python file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Skip if no old content (new file) or no new content (deleted file)
    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldFunctions = this.extractFunctions(file.oldContent);
      const newFunctions = this.extractFunctions(file.newContent);

      const oldClasses = this.extractClasses(file.oldContent);
      const newClasses = this.extractClasses(file.newContent);

      // Check for removed functions
      for (const [name, oldSig] of oldFunctions) {
        if (oldSig.isMethod) continue; // Methods are handled with classes

        const newSig = newFunctions.get(name);

        if (!newSig) {
          findings.push(this.createFinding(
            file.path,
            `Function '${name}' was removed`,
            `The function '${name}' has been removed. This is a breaking change that may affect consumers.`,
            `Ensure all consumers of '${name}' are updated before deploying.`,
          ));
          continue;
        }

        // Check for signature changes
        const changes = this.compareSignatures(oldSig, newSig);
        if (changes.length > 0) {
          findings.push(this.createFinding(
            file.path,
            `Breaking change in function '${name}'`,
            `The signature of '${name}' has changed:\n${changes.join('\n')}`,
            `Review all callers of '${name}' and update them to match the new signature.`,
          ));
        }
      }

      // Check for class method changes
      for (const [className, oldMethods] of oldClasses) {
        const newMethods = newClasses.get(className);

        if (!newMethods) {
          findings.push(this.createFinding(
            file.path,
            `Class '${className}' was removed`,
            `The class '${className}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${className}' are updated before deploying.`,
          ));
          continue;
        }

        // Check for removed or modified methods
        for (const [methodName, oldMethodSig] of oldMethods) {
          const newMethodSig = newMethods.get(methodName);

          if (!newMethodSig) {
            findings.push(this.createFinding(
              file.path,
              `Method '${className}.${methodName}' was removed`,
              `The method '${methodName}' in class '${className}' has been removed. This is a breaking change.`,
              `Ensure all consumers of '${className}.${methodName}' are updated before deploying.`,
            ));
            continue;
          }

          const changes = this.compareSignatures(oldMethodSig, newMethodSig);
          if (changes.length > 0) {
            findings.push(this.createFinding(
              file.path,
              `Breaking change in method '${className}.${methodName}'`,
              `The signature of '${className}.${methodName}' has changed:\n${changes.join('\n')}`,
              `Review all callers of '${className}.${methodName}' and update them.`,
            ));
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to analyze ${file.path}: ${error}`);
    }

    return findings;
  }


  /**
   * Extract function definitions from Python source code.
   * Matches top-level function definitions using regex.
   */
  extractFunctions(sourceCode: string): Map<string, PythonFunctionSignature> {
    const signatures = new Map<string, PythonFunctionSignature>();
    
    // Match top-level function definitions (not indented)
    const functionRegex = /^def\s+(\w+)\s*\((.*?)\)\s*(?:->.*?)?:/gm;
    
    let match;
    while ((match = functionRegex.exec(sourceCode)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      const parameters = this.parseParameters(paramsStr);
      
      // Check if this is a method (has 'self' or 'cls' as first param)
      const isMethod = parameters.length > 0 && 
        (parameters[0] === 'self' || parameters[0] === 'cls');
      
      signatures.set(name, {
        name,
        parameters,
        isMethod,
      });
    }

    return signatures;
  }

  /**
   * Extract class definitions and their methods from Python source code.
   */
  extractClasses(sourceCode: string): Map<string, Map<string, PythonFunctionSignature>> {
    const classes = new Map<string, Map<string, PythonFunctionSignature>>();
    const lines = sourceCode.split('\n');
    
    let currentClass: string | null = null;
    let classIndent = 0;
    let currentMethods = new Map<string, PythonFunctionSignature>();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trimStart();
      const indent = line.length - trimmedLine.length;
      
      // Check for class definition
      const classMatch = /^class\s+(\w+)(?:\s*\([^)]*\))?\s*:/.exec(trimmedLine);
      if (classMatch && indent === 0) {
        // Save previous class if exists
        if (currentClass) {
          classes.set(currentClass, currentMethods);
        }
        currentClass = classMatch[1];
        classIndent = indent;
        currentMethods = new Map<string, PythonFunctionSignature>();
        continue;
      }
      
      // Check for method definition inside a class
      if (currentClass && indent > classIndent) {
        const methodMatch = /^def\s+(\w+)\s*\((.*?)\)\s*(?:->.*?)?:/.exec(trimmedLine);
        if (methodMatch) {
          const methodName = methodMatch[1];
          const paramsStr = methodMatch[2];
          const parameters = this.parseParameters(paramsStr);
          
          currentMethods.set(methodName, {
            name: methodName,
            parameters,
            isMethod: true,
            className: currentClass,
          });
        }
      }
      
      // Check if we've exited the class (back to no indent with content)
      if (currentClass && indent === 0 && trimmedLine.length > 0 && !classMatch) {
        classes.set(currentClass, currentMethods);
        currentClass = null;
        currentMethods = new Map<string, PythonFunctionSignature>();
      }
    }
    
    // Save last class if exists
    if (currentClass) {
      classes.set(currentClass, currentMethods);
    }

    return classes;
  }

  /**
   * Parse parameter string into array of parameter names.
   */
  private parseParameters(paramsStr: string): string[] {
    if (!paramsStr.trim()) {
      return [];
    }
    
    const params: string[] = [];
    let depth = 0;
    let current = '';
    
    for (const char of paramsStr) {
      if (char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        const param = this.extractParamName(current.trim());
        if (param) params.push(param);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last parameter
    const lastParam = this.extractParamName(current.trim());
    if (lastParam) params.push(lastParam);
    
    return params;
  }

  /**
   * Extract parameter name from a parameter definition.
   * Handles type annotations, default values, *args, **kwargs.
   */
  private extractParamName(param: string): string | null {
    if (!param) return null;
    
    // Handle *args and **kwargs
    if (param.startsWith('**')) {
      return param.slice(2).split(':')[0].split('=')[0].trim();
    }
    if (param.startsWith('*')) {
      return param.slice(1).split(':')[0].split('=')[0].trim();
    }
    
    // Extract name before type annotation or default value
    const name = param.split(':')[0].split('=')[0].trim();
    return name || null;
  }

  /**
   * Compare two function signatures and return list of changes.
   */
  private compareSignatures(
    oldSig: PythonFunctionSignature,
    newSig: PythonFunctionSignature,
  ): string[] {
    const changes: string[] = [];
    
    // Filter out 'self' and 'cls' for comparison
    const oldParams = oldSig.parameters.filter(p => p !== 'self' && p !== 'cls');
    const newParams = newSig.parameters.filter(p => p !== 'self' && p !== 'cls');

    if (oldParams.length !== newParams.length) {
      changes.push(
        `- Parameter count changed from ${oldParams.length} to ${newParams.length}`,
      );
    }

    // Check for parameter name changes
    const minParams = Math.min(oldParams.length, newParams.length);
    for (let i = 0; i < minParams; i++) {
      if (oldParams[i] !== newParams[i]) {
        changes.push(
          `- Parameter '${oldParams[i]}' was renamed or replaced with '${newParams[i]}'`,
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
