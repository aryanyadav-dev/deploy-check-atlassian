import { Module, OnModuleInit } from '@nestjs/common';
import { AnalyzerRegistry } from './analyzer.registry';
import { TypeScriptAnalyzer } from './typescript.analyzer';
import { SqlMigrationAnalyzer } from './sql-migration.analyzer';
import { PermissionAnalyzer } from './permission.analyzer';
import { PythonAnalyzer } from './python.analyzer';
import { GoAnalyzer } from './go.analyzer';
import { JavaAnalyzer } from './java.analyzer';
import { CppAnalyzer } from './cpp.analyzer';
import { SwiftAnalyzer } from './swift.analyzer';
import { RustAnalyzer } from './rust.analyzer';

/**
 * Module for analyzer infrastructure.
 * Provides the AnalyzerRegistry for registering and retrieving analyzers.
 */
@Module({
  providers: [AnalyzerRegistry, TypeScriptAnalyzer, SqlMigrationAnalyzer, PermissionAnalyzer, PythonAnalyzer, GoAnalyzer, JavaAnalyzer, CppAnalyzer, SwiftAnalyzer, RustAnalyzer],
  exports: [AnalyzerRegistry, TypeScriptAnalyzer, SqlMigrationAnalyzer, PermissionAnalyzer, PythonAnalyzer, GoAnalyzer, JavaAnalyzer, CppAnalyzer, SwiftAnalyzer, RustAnalyzer],
})
export class AnalyzersModule implements OnModuleInit {
  constructor(
    private readonly registry: AnalyzerRegistry,
    private readonly tsAnalyzer: TypeScriptAnalyzer,
    private readonly sqlAnalyzer: SqlMigrationAnalyzer,
    private readonly permissionAnalyzer: PermissionAnalyzer,
    private readonly pythonAnalyzer: PythonAnalyzer,
    private readonly goAnalyzer: GoAnalyzer,
    private readonly javaAnalyzer: JavaAnalyzer,
    private readonly cppAnalyzer: CppAnalyzer,
    private readonly swiftAnalyzer: SwiftAnalyzer,
    private readonly rustAnalyzer: RustAnalyzer,
  ) {}

  onModuleInit() {
    // Register all analyzers
    this.registry.register(this.tsAnalyzer);
    this.registry.register(this.sqlAnalyzer);
    this.registry.register(this.permissionAnalyzer);
    this.registry.register(this.pythonAnalyzer);
    this.registry.register(this.goAnalyzer);
    this.registry.register(this.javaAnalyzer);
    this.registry.register(this.cppAnalyzer);
    this.registry.register(this.swiftAnalyzer);
    this.registry.register(this.rustAnalyzer);
  }
}
