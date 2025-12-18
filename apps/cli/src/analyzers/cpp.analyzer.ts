/**
 * C/C++ Analyzer for CLI
 * Detects breaking API changes in C/C++ files
 * (Requirements 4.1, 4.2, 4.3, 4.4)
 */

import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzerCli } from './base.analyzer';

/**
 * Represents a C/C++ function signature.
 */
export interface CppFunctionSignature {
  name: string;
  returnType: string;
  parameters: string[];
  isMethod: boolean;
  className?: string;
}

/**
 * Represents a C/C++ type (struct or class) with its public members.
 */
export interface CppTypeDefinition {
  name: string;
  kind: 'struct' | 'class';
  members: Map<string, string>; // member name -> member type
}

/**
 * C/C++ analyzer for detecting breaking API changes.
 * Uses regex-based pattern matching to extract function declarations and type definitions.
 */
export class CppAnalyzerCli extends BaseAnalyzerCli {
  readonly name = 'cpp';
  readonly supportedExtensions = ['.c', '.cpp', '.h', '.hpp', '.cc', '.cxx'];

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
   * Analyze a single C/C++ file for breaking API changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldFunctions = this.extractFunctions(file.oldContent);
      const newFunctions = this.extractFunctions(file.newContent);

      const oldTypes = this.extractTypes(file.oldContent);
      const newTypes = this.extractTypes(file.newContent);

      // Check for removed functions
      for (const [name, oldSig] of oldFunctions) {
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

      // Check for type changes (structs/classes)
      for (const [typeName, oldType] of oldTypes) {
        const newType = newTypes.get(typeName);

        if (!newType) {
          findings.push(this.createFinding(
            file.path,
            `Type '${typeName}' was removed`,
            `The ${oldType.kind} '${typeName}' has been removed. This is a breaking change.`,
            `Ensure all consumers of '${typeName}' are updated before deploying.`,
          ));
          continue;
        }

        const memberChanges = this.compareTypeMembers(oldType, newType);
        if (memberChanges.length > 0) {
          findings.push(this.createFinding(
            file.path,
            `Breaking change in ${oldType.kind} '${typeName}'`,
            `The ${oldType.kind} '${typeName}' has member changes:\n${memberChanges.join('\n')}`,
            `Review all usages of '${typeName}' and update them accordingly.`,
          ));
        }
      }
    } catch {
      // Skip files that can't be parsed
    }

    return findings;
  }


  /**
   * Extract function declarations from C/C++ source code.
   */
  extractFunctions(sourceCode: string): Map<string, CppFunctionSignature> {
    const signatures = new Map<string, CppFunctionSignature>();
    
    const cleanedCode = this.removeComments(sourceCode);
    
    // Match function declarations/definitions
    const functionRegex = /(?:^|[;\n}])\s*(?:extern\s+|static\s+|inline\s+|virtual\s+)*(\w+(?:\s*[*&]+)?(?:\s+\w+(?:\s*[*&]+)?)*)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?(?:=\s*0\s*)?(?=[;{])/gm;
    
    let match;
    while ((match = functionRegex.exec(cleanedCode)) !== null) {
      const returnType = this.normalizeType(match[1]);
      const name = match[2];
      const paramsStr = match[3];
      
      if (this.isKeyword(name) || this.isControlFlow(name)) {
        continue;
      }
      
      const parameters = this.parseParameters(paramsStr);
      
      signatures.set(name, {
        name,
        returnType,
        parameters,
        isMethod: false,
      });
    }

    this.extractClassMethods(cleanedCode, signatures);

    return signatures;
  }

  /**
   * Extract class method declarations from C/C++ source code.
   */
  private extractClassMethods(sourceCode: string, signatures: Map<string, CppFunctionSignature>): void {
    const classRegex = /(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+\w+)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
    
    let classMatch;
    while ((classMatch = classRegex.exec(sourceCode)) !== null) {
      const className = classMatch[1];
      const classBody = classMatch[2];
      
      const publicMethods = this.extractPublicMethods(classBody, className);
      for (const [methodName, sig] of publicMethods) {
        signatures.set(methodName, sig);
      }
    }
  }

  /**
   * Extract public methods from a class body.
   */
  private extractPublicMethods(classBody: string, className: string): Map<string, CppFunctionSignature> {
    const methods = new Map<string, CppFunctionSignature>();
    
    const sections = classBody.split(/\b(public|private|protected)\s*:/);
    
    let inPublic = false;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      
      if (section === 'public') {
        inPublic = true;
        continue;
      } else if (section === 'private' || section === 'protected') {
        inPublic = false;
        continue;
      }
      
      if (i === 0 && !classBody.includes('private:') && !classBody.includes('protected:')) {
        inPublic = true;
      }
      
      if (inPublic && section) {
        const methodRegex = /(?:virtual\s+)?(\w+(?:\s*[*&]+)?(?:\s+\w+(?:\s*[*&]+)?)*)\s+(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:override\s*)?(?:=\s*0\s*)?(?=[;{])/g;
        
        let methodMatch;
        while ((methodMatch = methodRegex.exec(section)) !== null) {
          const returnType = this.normalizeType(methodMatch[1]);
          const methodName = methodMatch[2];
          const paramsStr = methodMatch[3];
          
          if (methodName === className || methodName === `~${className}` || this.isKeyword(methodName)) {
            continue;
          }
          
          const parameters = this.parseParameters(paramsStr);
          const fullName = `${className}::${methodName}`;
          
          methods.set(fullName, {
            name: methodName,
            returnType,
            parameters,
            isMethod: true,
            className,
          });
        }
      }
    }
    
    return methods;
  }

  /**
   * Extract type definitions (structs and classes) from C/C++ source code.
   */
  extractTypes(sourceCode: string): Map<string, CppTypeDefinition> {
    const types = new Map<string, CppTypeDefinition>();
    
    const cleanedCode = this.removeComments(sourceCode);
    
    const structRegex = /\bstruct\s+(\w+)\s*(?::\s*(?:public|private|protected)\s+\w+)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
    const classRegex = /\bclass\s+(\w+)\s*(?::\s*(?:public|private|protected)\s+\w+)?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;
    
    let match;
    
    while ((match = structRegex.exec(cleanedCode)) !== null) {
      const typeName = match[1];
      const body = match[2];
      const members = this.parseTypeMembers(body, 'struct');
      
      types.set(typeName, {
        name: typeName,
        kind: 'struct',
        members,
      });
    }
    
    while ((match = classRegex.exec(cleanedCode)) !== null) {
      const typeName = match[1];
      const body = match[2];
      const members = this.parseTypeMembers(body, 'class');
      
      types.set(typeName, {
        name: typeName,
        kind: 'class',
        members,
      });
    }

    return types;
  }

  /**
   * Parse type members from a struct/class body.
   */
  private parseTypeMembers(body: string, kind: 'struct' | 'class'): Map<string, string> {
    const members = new Map<string, string>();
    
    const sections = body.split(/\b(public|private|protected)\s*:/);
    
    let inPublic = kind === 'struct';
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      
      if (section === 'public') {
        inPublic = true;
        continue;
      } else if (section === 'private' || section === 'protected') {
        inPublic = false;
        continue;
      }
      
      if (inPublic && section) {
        const memberRegex = /(\w+(?:\s*[*&]+)?(?:\s+\w+(?:\s*[*&]+)?)*)\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/g;
        
        let memberMatch;
        while ((memberMatch = memberRegex.exec(section)) !== null) {
          const memberType = this.normalizeType(memberMatch[1]);
          const memberName = memberMatch[2];
          
          if (!this.isKeyword(memberName) && !memberType.includes('(')) {
            members.set(memberName, memberType);
          }
        }
      }
    }
    
    return members;
  }


  private removeComments(sourceCode: string): string {
    let result = sourceCode.replace(/\/\/.*$/gm, '');
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  private parseParameters(paramsStr: string): string[] {
    if (!paramsStr.trim() || paramsStr.trim() === 'void') {
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
    
    const lastParamType = this.extractParamType(current.trim());
    if (lastParamType) params.push(lastParamType);
    
    return params;
  }

  private extractParamType(param: string): string | null {
    if (!param) return null;
    
    let cleaned = param.split('=')[0].trim();
    
    const parts = cleaned.split(/\s+/);
    
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      
      if (lastPart.startsWith('*') || lastPart.startsWith('&')) {
        return this.normalizeType(parts.join(' '));
      }
      
      const type = parts.slice(0, -1).join(' ');
      return this.normalizeType(type);
    } else if (parts.length === 1) {
      return this.normalizeType(parts[0]);
    }
    
    return null;
  }

  private normalizeType(type: string): string {
    return type
      .replace(/\s+/g, ' ')
      .replace(/\s*\*\s*/g, '*')
      .replace(/\s*&\s*/g, '&')
      .trim();
  }

  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
      'break', 'continue', 'return', 'goto', 'sizeof', 'typedef',
      'struct', 'class', 'union', 'enum', 'namespace', 'template',
      'public', 'private', 'protected', 'virtual', 'override', 'final',
      'const', 'static', 'extern', 'inline', 'volatile', 'register',
      'auto', 'void', 'int', 'char', 'short', 'long', 'float', 'double',
      'signed', 'unsigned', 'bool', 'true', 'false', 'nullptr', 'NULL',
      'new', 'delete', 'this', 'throw', 'try', 'catch', 'operator',
    ]);
    return keywords.has(name);
  }

  private isControlFlow(name: string): boolean {
    const controlFlow = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'return']);
    return controlFlow.has(name);
  }

  private compareSignatures(
    oldSig: CppFunctionSignature,
    newSig: CppFunctionSignature,
  ): string[] {
    const changes: string[] = [];

    if (oldSig.returnType !== newSig.returnType) {
      changes.push(
        `- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`,
      );
    }

    if (oldSig.parameters.length !== newSig.parameters.length) {
      changes.push(
        `- Parameter count changed from ${oldSig.parameters.length} to ${newSig.parameters.length}`,
      );
    }

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

  private compareTypeMembers(
    oldType: CppTypeDefinition,
    newType: CppTypeDefinition,
  ): string[] {
    const changes: string[] = [];

    for (const [memberName, oldMemberType] of oldType.members) {
      const newMemberType = newType.members.get(memberName);
      
      if (newMemberType === undefined) {
        changes.push(`- Public member '${memberName}' was removed`);
      } else if (oldMemberType !== newMemberType) {
        changes.push(`- Member '${memberName}' type changed from '${oldMemberType}' to '${newMemberType}'`);
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
