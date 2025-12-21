import { Injectable, Logger } from '@nestjs/common';
import * as ts from 'typescript';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

// ============================================================================
// Type Definitions for Enhanced AST Analysis
// ============================================================================

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface FunctionSignature {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  isAsync: boolean;
  typeParameters: string[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
}

export interface MethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  isAsync: boolean;
  isStatic: boolean;
  visibility: 'public' | 'protected' | 'private';
  typeParameters: string[];
}

export interface ClassSignature {
  name: string;
  methods: Map<string, MethodInfo>;
  properties: Map<string, PropertyInfo>;
  constructorParams: ParameterInfo[];
  extends: string | null;
  implements: string[];
  typeParameters: string[];
}

export interface InterfaceSignature {
  name: string;
  properties: Map<string, PropertyInfo>;
  methods: Map<string, MethodInfo>;
  extends: string[];
  typeParameters: string[];
}

export interface TypeAliasSignature {
  name: string;
  definition: string;
  typeParameters: string[];
}

export interface EnumMemberInfo {
  name: string;
  value: string | number | undefined;
}

export interface EnumSignature {
  name: string;
  members: Map<string, EnumMemberInfo>;
  isConst: boolean;
}

export interface VariableSignature {
  name: string;
  type: string;
  isArrowFunction: boolean;
  functionSignature?: FunctionSignature;
}

export interface ModuleExports {
  functions: Map<string, FunctionSignature>;
  classes: Map<string, ClassSignature>;
  interfaces: Map<string, InterfaceSignature>;
  typeAliases: Map<string, TypeAliasSignature>;
  enums: Map<string, EnumSignature>;
  variables: Map<string, VariableSignature>;
}

/**
 * Enhanced TypeScript/JavaScript AST analyzer for detecting breaking API changes.
 * Uses TypeScript compiler API to parse source files and detect changes in:
 * - Exported functions (parameter changes, return types, async modifiers)
 * - Exported classes (methods, properties, constructors, inheritance)
 * - Exported interfaces (properties, methods, extends)
 * - Exported type aliases (definition changes)
 * - Exported enums (member changes, const modifier)
 * - Exported variables and arrow functions
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

  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    if (!file.oldContent || !file.newContent) {
      return findings;
    }

    try {
      const oldExports = this.extractAllExports(file.oldContent, file.path);
      const newExports = this.extractAllExports(file.newContent, file.path);

      findings.push(...this.compareFunctions(oldExports.functions, newExports.functions, file.path));
      findings.push(...this.compareClasses(oldExports.classes, newExports.classes, file.path));
      findings.push(...this.compareInterfaces(oldExports.interfaces, newExports.interfaces, file.path));
      findings.push(...this.compareTypeAliases(oldExports.typeAliases, newExports.typeAliases, file.path));
      findings.push(...this.compareEnums(oldExports.enums, newExports.enums, file.path));
      findings.push(...this.compareVariables(oldExports.variables, newExports.variables, file.path));
    } catch (error) {
      this.logger.warn(`Failed to analyze ${file.path}: ${error}`);
    }

    return findings;
  }

  // ============================================================================
  // Main Export Extraction
  // ============================================================================

  extractAllExports(sourceCode: string, fileName: string): ModuleExports {
    const exports: ModuleExports = {
      functions: new Map(),
      classes: new Map(),
      interfaces: new Map(),
      typeAliases: new Map(),
      enums: new Map(),
      variables: new Map(),
    };

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
        if (sig) exports.functions.set(sig.name, sig);
      }

      if (ts.isClassDeclaration(node) && node.name && this.isExported(node)) {
        const sig = this.extractClassSignature(node, sourceFile);
        if (sig) exports.classes.set(sig.name, sig);
      }

      if (ts.isInterfaceDeclaration(node) && this.isExported(node)) {
        const sig = this.extractInterfaceSignature(node, sourceFile);
        exports.interfaces.set(sig.name, sig);
      }

      if (ts.isTypeAliasDeclaration(node) && this.isExported(node)) {
        const sig = this.extractTypeAliasSignature(node, sourceFile);
        exports.typeAliases.set(sig.name, sig);
      }

      if (ts.isEnumDeclaration(node) && this.isExported(node)) {
        const sig = this.extractEnumSignature(node, sourceFile);
        exports.enums.set(sig.name, sig);
      }

      if (ts.isVariableStatement(node) && this.isExported(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const sig = this.extractVariableSignature(decl, sourceFile);
            exports.variables.set(sig.name, sig);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return exports;
  }

  // For backward compatibility - includes both function declarations and arrow functions
  extractExportedFunctions(sourceCode: string, fileName: string): Map<string, FunctionSignature> {
    const exports = this.extractAllExports(sourceCode, fileName);
    const result = new Map(exports.functions);
    
    // Include arrow functions from variables for backward compatibility
    for (const [name, variable] of exports.variables) {
      if (variable.isArrowFunction && variable.functionSignature) {
        result.set(name, variable.functionSignature);
      }
    }
    
    return result;
  }


  // ============================================================================
  // Function Extraction
  // ============================================================================

  private extractFunctionSignature(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): FunctionSignature | null {
    if (!node.name) return null;

    return {
      name: node.name.text,
      parameters: this.extractParameters(node.parameters, sourceFile),
      returnType: this.getReturnType(node, sourceFile),
      isAsync: this.hasAsyncModifier(node),
      typeParameters: this.extractTypeParameters(node.typeParameters, sourceFile),
    };
  }

  // ============================================================================
  // Class Extraction
  // ============================================================================

  private extractClassSignature(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassSignature | null {
    if (!node.name) return null;

    const methods = new Map<string, MethodInfo>();
    const properties = new Map<string, PropertyInfo>();
    let constructorParams: ParameterInfo[] = [];

    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && member.name) {
        const visibility = this.getVisibility(member);
        if (visibility !== 'private') {
          const methodInfo = this.extractMethodInfo(member, sourceFile);
          methods.set(methodInfo.name, methodInfo);
        }
      }

      if (ts.isPropertyDeclaration(member) && member.name) {
        const visibility = this.getPropertyVisibility(member);
        if (visibility !== 'private') {
          const propInfo = this.extractPropertyInfo(member, sourceFile);
          properties.set(propInfo.name, propInfo);
        }
      }

      if (ts.isConstructorDeclaration(member)) {
        constructorParams = this.extractParameters(member.parameters, sourceFile);
      }
    }

    let extendsClause: string | null = null;
    const implementsList: string[] = [];

    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
          extendsClause = clause.types[0].getText(sourceFile);
        }
        if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const type of clause.types) {
            implementsList.push(type.getText(sourceFile));
          }
        }
      }
    }

    return {
      name: node.name.text,
      methods,
      properties,
      constructorParams,
      extends: extendsClause,
      implements: implementsList,
      typeParameters: this.extractTypeParameters(node.typeParameters, sourceFile),
    };
  }

  private extractMethodInfo(node: ts.MethodDeclaration, sourceFile: ts.SourceFile): MethodInfo {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);

    return {
      name,
      parameters: this.extractParameters(node.parameters, sourceFile),
      returnType: this.getReturnType(node, sourceFile),
      isAsync: this.hasAsyncModifier(node),
      isStatic: this.hasStaticModifier(node),
      visibility: this.getVisibility(node),
      typeParameters: this.extractTypeParameters(node.typeParameters, sourceFile),
    };
  }

  private extractPropertyInfo(node: ts.PropertyDeclaration, sourceFile: ts.SourceFile): PropertyInfo {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);

    return {
      name,
      type: node.type ? node.type.getText(sourceFile) : 'any',
      optional: !!node.questionToken,
      readonly: this.hasReadonlyModifier(node),
    };
  }

  // ============================================================================
  // Interface Extraction
  // ============================================================================

  private extractInterfaceSignature(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile): InterfaceSignature {
    const properties = new Map<string, PropertyInfo>();
    const methods = new Map<string, MethodInfo>();

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sourceFile);
        properties.set(name, {
          name,
          type: member.type ? member.type.getText(sourceFile) : 'any',
          optional: !!member.questionToken,
          readonly: this.hasReadonlyModifier(member),
        });
      }

      if (ts.isMethodSignature(member) && member.name) {
        const name = ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sourceFile);
        methods.set(name, {
          name,
          parameters: this.extractParameters(member.parameters, sourceFile),
          returnType: member.type ? member.type.getText(sourceFile) : 'any',
          isAsync: false,
          isStatic: false,
          visibility: 'public',
          typeParameters: this.extractTypeParameters(member.typeParameters, sourceFile),
        });
      }
    }

    const extendsList: string[] = [];
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            extendsList.push(type.getText(sourceFile));
          }
        }
      }
    }

    return {
      name: node.name.text,
      properties,
      methods,
      extends: extendsList,
      typeParameters: this.extractTypeParameters(node.typeParameters, sourceFile),
    };
  }

  // ============================================================================
  // Type Alias Extraction
  // ============================================================================

  private extractTypeAliasSignature(node: ts.TypeAliasDeclaration, sourceFile: ts.SourceFile): TypeAliasSignature {
    return {
      name: node.name.text,
      definition: node.type.getText(sourceFile),
      typeParameters: this.extractTypeParameters(node.typeParameters, sourceFile),
    };
  }

  // ============================================================================
  // Enum Extraction
  // ============================================================================

  private extractEnumSignature(node: ts.EnumDeclaration, sourceFile: ts.SourceFile): EnumSignature {
    const members = new Map<string, EnumMemberInfo>();

    for (const member of node.members) {
      const name = ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sourceFile);
      let value: string | number | undefined;

      if (member.initializer) {
        if (ts.isNumericLiteral(member.initializer)) {
          value = Number(member.initializer.text);
        } else if (ts.isStringLiteral(member.initializer)) {
          value = member.initializer.text;
        } else {
          value = member.initializer.getText(sourceFile);
        }
      }

      members.set(name, { name, value });
    }

    return {
      name: node.name.text,
      members,
      isConst: this.hasConstModifier(node),
    };
  }

  // ============================================================================
  // Variable Extraction
  // ============================================================================

  private extractVariableSignature(node: ts.VariableDeclaration, sourceFile: ts.SourceFile): VariableSignature {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
    const isArrowFunction = node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));

    let functionSignature: FunctionSignature | undefined;
    if (isArrowFunction && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      functionSignature = {
        name,
        parameters: this.extractParameters(node.initializer.parameters, sourceFile),
        returnType: this.getReturnType(node.initializer, sourceFile),
        isAsync: this.hasAsyncModifier(node.initializer),
        typeParameters: this.extractTypeParameters(node.initializer.typeParameters, sourceFile),
      };
    }

    return {
      name,
      type: node.type ? node.type.getText(sourceFile) : 'any',
      isArrowFunction: !!isArrowFunction,
      functionSignature,
    };
  }


  // ============================================================================
  // Comparison Methods - Functions
  // ============================================================================

  private compareFunctions(
    oldFuncs: Map<string, FunctionSignature>,
    newFuncs: Map<string, FunctionSignature>,
    filePath: string,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [name, oldSig] of oldFuncs) {
      const newSig = newFuncs.get(name);

      if (!newSig) {
        findings.push(this.createFinding(
          filePath,
          `Exported function '${name}' was removed`,
          `The exported function '${name}' has been removed. This is a breaking change.`,
          `Ensure all consumers of '${name}' are updated before deploying.`,
        ));
        continue;
      }

      const changes = this.compareFunctionSignatures(oldSig, newSig);
      if (changes.length > 0) {
        findings.push(this.createFinding(
          filePath,
          `Breaking change in exported function '${name}'`,
          `The signature of '${name}' has changed:\n${changes.join('\n')}`,
          `Review all callers of '${name}' and update them to match the new signature.`,
        ));
      }
    }

    return findings;
  }

  private compareFunctionSignatures(oldSig: FunctionSignature, newSig: FunctionSignature): string[] {
    const changes: string[] = [];

    // Check for new required parameters
    const oldRequiredCount = oldSig.parameters.filter(p => !p.optional).length;
    const newRequiredCount = newSig.parameters.filter(p => !p.optional).length;
    if (newRequiredCount > oldRequiredCount) {
      changes.push(`- New required parameters added (${oldRequiredCount} -> ${newRequiredCount})`);
    }

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

      if (oldParam.optional && !newParam.optional) {
        changes.push(`- Parameter '${oldParam.name}' changed from optional to required`);
      }
    }

    if (oldSig.returnType !== newSig.returnType) {
      changes.push(`- Return type changed from '${oldSig.returnType}' to '${newSig.returnType}'`);
    }

    if (oldSig.isAsync !== newSig.isAsync) {
      changes.push(`- Function ${newSig.isAsync ? 'became async' : 'is no longer async'}`);
    }

    if (oldSig.typeParameters.length !== newSig.typeParameters.length) {
      changes.push(`- Type parameter count changed from ${oldSig.typeParameters.length} to ${newSig.typeParameters.length}`);
    }

    return changes;
  }

  // ============================================================================
  // Comparison Methods - Classes
  // ============================================================================

  private compareClasses(
    oldClasses: Map<string, ClassSignature>,
    newClasses: Map<string, ClassSignature>,
    filePath: string,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [name, oldClass] of oldClasses) {
      const newClass = newClasses.get(name);

      if (!newClass) {
        findings.push(this.createFinding(
          filePath,
          `Exported class '${name}' was removed`,
          `The exported class '${name}' has been removed. This is a breaking change.`,
          `Ensure all consumers of '${name}' are updated before deploying.`,
        ));
        continue;
      }

      const changes = this.compareClassSignatures(oldClass, newClass);
      if (changes.length > 0) {
        findings.push(this.createFinding(
          filePath,
          `Breaking change in exported class '${name}'`,
          `The class '${name}' has breaking changes:\n${changes.join('\n')}`,
          `Review all usages of '${name}' and update them accordingly.`,
        ));
      }
    }

    return findings;
  }

  private compareClassSignatures(oldClass: ClassSignature, newClass: ClassSignature): string[] {
    const changes: string[] = [];

    // Check removed methods
    for (const [methodName, oldMethod] of oldClass.methods) {
      const newMethod = newClass.methods.get(methodName);
      if (!newMethod) {
        changes.push(`- Method '${methodName}' was removed`);
        continue;
      }

      // Check method signature changes
      const methodChanges = this.compareMethodSignatures(oldMethod, newMethod);
      changes.push(...methodChanges.map(c => `- Method '${methodName}': ${c}`));
    }

    // Check removed properties
    for (const [propName, oldProp] of oldClass.properties) {
      const newProp = newClass.properties.get(propName);
      if (!newProp) {
        changes.push(`- Property '${propName}' was removed`);
        continue;
      }

      if (oldProp.type !== newProp.type) {
        changes.push(`- Property '${propName}' type changed from '${oldProp.type}' to '${newProp.type}'`);
      }
    }

    // Check constructor changes
    const ctorChanges = this.compareParameters(oldClass.constructorParams, newClass.constructorParams);
    if (ctorChanges.length > 0) {
      changes.push(`- Constructor signature changed: ${ctorChanges.join(', ')}`);
    }

    // Check base class changes
    if (oldClass.extends !== newClass.extends) {
      changes.push(`- Base class changed from '${oldClass.extends || 'none'}' to '${newClass.extends || 'none'}'`);
    }

    return changes;
  }

  private compareMethodSignatures(oldMethod: MethodInfo, newMethod: MethodInfo): string[] {
    const changes: string[] = [];

    // Check visibility narrowing
    const visibilityOrder = { public: 0, protected: 1, private: 2 };
    if (visibilityOrder[newMethod.visibility] > visibilityOrder[oldMethod.visibility]) {
      changes.push(`visibility narrowed from ${oldMethod.visibility} to ${newMethod.visibility}`);
    }

    // Check static modifier
    if (oldMethod.isStatic !== newMethod.isStatic) {
      changes.push(`static modifier ${newMethod.isStatic ? 'added' : 'removed'}`);
    }

    // Check parameters
    const paramChanges = this.compareParameters(oldMethod.parameters, newMethod.parameters);
    changes.push(...paramChanges);

    // Check return type
    if (oldMethod.returnType !== newMethod.returnType) {
      changes.push(`return type changed from '${oldMethod.returnType}' to '${newMethod.returnType}'`);
    }

    return changes;
  }

  private compareParameters(oldParams: ParameterInfo[], newParams: ParameterInfo[]): string[] {
    const changes: string[] = [];

    const oldRequired = oldParams.filter(p => !p.optional).length;
    const newRequired = newParams.filter(p => !p.optional).length;

    if (newRequired > oldRequired) {
      changes.push(`new required parameters added`);
    }

    const minParams = Math.min(oldParams.length, newParams.length);
    for (let i = 0; i < minParams; i++) {
      if (oldParams[i].type !== newParams[i].type) {
        changes.push(`parameter '${oldParams[i].name}' type changed`);
      }
    }

    return changes;
  }

  // ============================================================================
  // Comparison Methods - Interfaces
  // ============================================================================

  private compareInterfaces(
    oldInterfaces: Map<string, InterfaceSignature>,
    newInterfaces: Map<string, InterfaceSignature>,
    filePath: string,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [name, oldIface] of oldInterfaces) {
      const newIface = newInterfaces.get(name);

      if (!newIface) {
        findings.push(this.createFinding(
          filePath,
          `Exported interface '${name}' was removed`,
          `The exported interface '${name}' has been removed. This is a breaking change.`,
          `Ensure all implementations of '${name}' are updated before deploying.`,
        ));
        continue;
      }

      const changes = this.compareInterfaceSignatures(oldIface, newIface);
      if (changes.length > 0) {
        findings.push(this.createFinding(
          filePath,
          `Breaking change in exported interface '${name}'`,
          `The interface '${name}' has breaking changes:\n${changes.join('\n')}`,
          `Review all implementations of '${name}' and update them accordingly.`,
        ));
      }
    }

    return findings;
  }

  private compareInterfaceSignatures(oldIface: InterfaceSignature, newIface: InterfaceSignature): string[] {
    const changes: string[] = [];

    // Check for new required properties (breaking for implementers)
    for (const [propName, newProp] of newIface.properties) {
      const oldProp = oldIface.properties.get(propName);
      if (!oldProp && !newProp.optional) {
        changes.push(`- New required property '${propName}' added`);
      }
    }

    // Check removed properties
    for (const [propName] of oldIface.properties) {
      if (!newIface.properties.has(propName)) {
        changes.push(`- Property '${propName}' was removed`);
      }
    }

    // Check property type changes
    for (const [propName, oldProp] of oldIface.properties) {
      const newProp = newIface.properties.get(propName);
      if (newProp && oldProp.type !== newProp.type) {
        changes.push(`- Property '${propName}' type changed from '${oldProp.type}' to '${newProp.type}'`);
      }
    }

    // Check for new methods (breaking for implementers)
    for (const [methodName] of newIface.methods) {
      if (!oldIface.methods.has(methodName)) {
        changes.push(`- New method '${methodName}' added`);
      }
    }

    // Check removed methods
    for (const [methodName] of oldIface.methods) {
      if (!newIface.methods.has(methodName)) {
        changes.push(`- Method '${methodName}' was removed`);
      }
    }

    return changes;
  }


  // ============================================================================
  // Comparison Methods - Type Aliases
  // ============================================================================

  private compareTypeAliases(
    oldTypes: Map<string, TypeAliasSignature>,
    newTypes: Map<string, TypeAliasSignature>,
    filePath: string,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [name, oldType] of oldTypes) {
      const newType = newTypes.get(name);

      if (!newType) {
        findings.push(this.createFinding(
          filePath,
          `Exported type alias '${name}' was removed`,
          `The exported type alias '${name}' has been removed. This is a breaking change.`,
          `Ensure all usages of '${name}' are updated before deploying.`,
        ));
        continue;
      }

      const changes: string[] = [];

      if (oldType.definition !== newType.definition) {
        changes.push(`- Type definition changed from '${oldType.definition}' to '${newType.definition}'`);
      }

      if (oldType.typeParameters.length !== newType.typeParameters.length) {
        changes.push(`- Type parameter count changed from ${oldType.typeParameters.length} to ${newType.typeParameters.length}`);
      }

      if (changes.length > 0) {
        findings.push(this.createFinding(
          filePath,
          `Breaking change in exported type alias '${name}'`,
          `The type alias '${name}' has breaking changes:\n${changes.join('\n')}`,
          `Review all usages of '${name}' and update them accordingly.`,
        ));
      }
    }

    return findings;
  }

  // ============================================================================
  // Comparison Methods - Enums
  // ============================================================================

  private compareEnums(
    oldEnums: Map<string, EnumSignature>,
    newEnums: Map<string, EnumSignature>,
    filePath: string,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [name, oldEnum] of oldEnums) {
      const newEnum = newEnums.get(name);

      if (!newEnum) {
        findings.push(this.createFinding(
          filePath,
          `Exported enum '${name}' was removed`,
          `The exported enum '${name}' has been removed. This is a breaking change.`,
          `Ensure all usages of '${name}' are updated before deploying.`,
        ));
        continue;
      }

      const changes: string[] = [];

      // Check removed members
      for (const [memberName] of oldEnum.members) {
        if (!newEnum.members.has(memberName)) {
          changes.push(`- Enum member '${memberName}' was removed`);
        }
      }

      // Check value changes
      for (const [memberName, oldMember] of oldEnum.members) {
        const newMember = newEnum.members.get(memberName);
        if (newMember && oldMember.value !== newMember.value) {
          changes.push(`- Enum member '${memberName}' value changed from '${oldMember.value}' to '${newMember.value}'`);
        }
      }

      // Check const modifier changes
      if (oldEnum.isConst !== newEnum.isConst) {
        changes.push(`- Const modifier ${newEnum.isConst ? 'added' : 'removed'}`);
      }

      if (changes.length > 0) {
        findings.push(this.createFinding(
          filePath,
          `Breaking change in exported enum '${name}'`,
          `The enum '${name}' has breaking changes:\n${changes.join('\n')}`,
          `Review all usages of '${name}' and update them accordingly.`,
        ));
      }
    }

    return findings;
  }

  // ============================================================================
  // Comparison Methods - Variables
  // ============================================================================

  private compareVariables(
    oldVars: Map<string, VariableSignature>,
    newVars: Map<string, VariableSignature>,
    filePath: string,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [name, oldVar] of oldVars) {
      const newVar = newVars.get(name);

      if (!newVar) {
        findings.push(this.createFinding(
          filePath,
          `Exported variable '${name}' was removed`,
          `The exported variable '${name}' has been removed. This is a breaking change.`,
          `Ensure all usages of '${name}' are updated before deploying.`,
        ));
        continue;
      }

      // If it's an arrow function, compare function signatures
      if (oldVar.isArrowFunction && newVar.isArrowFunction && oldVar.functionSignature && newVar.functionSignature) {
        const changes = this.compareFunctionSignatures(oldVar.functionSignature, newVar.functionSignature);
        if (changes.length > 0) {
          findings.push(this.createFinding(
            filePath,
            `Breaking change in exported arrow function '${name}'`,
            `The arrow function '${name}' has breaking changes:\n${changes.join('\n')}`,
            `Review all callers of '${name}' and update them accordingly.`,
          ));
        }
      } else if (oldVar.type !== newVar.type) {
        findings.push(this.createFinding(
          filePath,
          `Breaking change in exported variable '${name}'`,
          `The type of '${name}' changed from '${oldVar.type}' to '${newVar.type}'`,
          `Review all usages of '${name}' and update them accordingly.`,
        ));
      }
    }

    return findings;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>, sourceFile: ts.SourceFile): ParameterInfo[] {
    return params.map((param) => ({
      name: ts.isIdentifier(param.name) ? param.name.text : param.name.getText(sourceFile),
      type: param.type ? param.type.getText(sourceFile) : 'any',
      optional: !!param.questionToken || !!param.initializer,
    }));
  }

  private extractTypeParameters(typeParams: ts.NodeArray<ts.TypeParameterDeclaration> | undefined, sourceFile: ts.SourceFile): string[] {
    if (!typeParams) return [];
    return typeParams.map(tp => tp.getText(sourceFile));
  }

  private getReturnType(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration | ts.MethodSignature,
    sourceFile: ts.SourceFile,
  ): string {
    if (node.type) {
      return node.type.getText(sourceFile);
    }
    return 'any';
  }

  private hasAsyncModifier(node: ts.Node): boolean {
    return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true;
  }

  private hasStaticModifier(node: ts.Node): boolean {
    return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) === true;
  }

  private hasReadonlyModifier(node: ts.Node): boolean {
    return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) === true;
  }

  private hasConstModifier(node: ts.Node): boolean {
    return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ConstKeyword) === true;
  }

  private isExported(node: ts.Node): boolean {
    return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
  }

  private getVisibility(node: ts.MethodDeclaration): 'public' | 'protected' | 'private' {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
    if (modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
    return 'public';
  }

  private getPropertyVisibility(node: ts.PropertyDeclaration): 'public' | 'protected' | 'private' {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
    if (modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
    return 'public';
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

  /**
   * Parse TypeScript/JavaScript source and print it back.
   * Used for round-trip testing.
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
}
