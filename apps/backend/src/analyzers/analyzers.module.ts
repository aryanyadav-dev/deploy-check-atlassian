import { Module, OnModuleInit } from '@nestjs/common';
import { AnalyzerRegistry } from './analyzer.registry';
import { TypeScriptAnalyzer } from './typescript.analyzer';
import { SqlMigrationAnalyzer } from './sql-migration.analyzer';
import { PermissionAnalyzer } from './permission.analyzer';

/**
 * Module for analyzer infrastructure.
 * Provides the AnalyzerRegistry for registering and retrieving analyzers.
 */
@Module({
  providers: [AnalyzerRegistry, TypeScriptAnalyzer, SqlMigrationAnalyzer, PermissionAnalyzer],
  exports: [AnalyzerRegistry, TypeScriptAnalyzer, SqlMigrationAnalyzer, PermissionAnalyzer],
})
export class AnalyzersModule implements OnModuleInit {
  constructor(
    private readonly registry: AnalyzerRegistry,
    private readonly tsAnalyzer: TypeScriptAnalyzer,
    private readonly sqlAnalyzer: SqlMigrationAnalyzer,
    private readonly permissionAnalyzer: PermissionAnalyzer,
  ) {}

  onModuleInit() {
    // Register all analyzers
    this.registry.register(this.tsAnalyzer);
    this.registry.register(this.sqlAnalyzer);
    this.registry.register(this.permissionAnalyzer);
  }
}
