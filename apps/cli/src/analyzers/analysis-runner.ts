/**
 * Analysis Runner
 * Orchestrates running all analyzers and aggregating findings
 */

import type {
  AnalysisContext,
  Finding,
  CoverageReport,
  OpenApiSpecPair,
  RepoConfig,
} from '@dra/types';
import { CliAnalyzerRegistry } from './cli-analyzer-registry';
import { buildAnalysisContext, ContextBuilderOptions } from '../git';
import { TypeScriptAnalyzerCli } from './typescript.analyzer';
import { SqlMigrationAnalyzerCli } from './sql-migration.analyzer';
import { PermissionAnalyzerCli } from './permission.analyzer';
import { CoverageAnalyzerCli } from './coverage.analyzer';
import { OpenApiAnalyzerCli } from './openapi.analyzer';
import { UndocumentedApiAnalyzerCli } from './undocumented-api.analyzer';
import { PythonAnalyzerCli } from './python.analyzer';
import { GoAnalyzerCli } from './go.analyzer';
import { JavaAnalyzerCli } from './java.analyzer';
import { CppAnalyzerCli } from './cpp.analyzer';
import { SwiftAnalyzerCli } from './swift.analyzer';
import { RustAnalyzerCli } from './rust.analyzer';

/**
 * Options for running analysis
 */
export interface AnalysisRunnerOptions {
  /**
   * Base reference to compare against (default: main/master)
   */
  base?: string;

  /**
   * Head reference to analyze (default: HEAD)
   */
  head?: string;

  /**
   * Analyze only staged changes
   */
  staged?: boolean;

  /**
   * Glob pattern to limit analysis scope
   */
  files?: string;

  /**
   * Path to lcov coverage report
   */
  coveragePath?: string;

  /**
   * Path to OpenAPI specification file
   */
  openapiPath?: string;

  /**
   * Coverage threshold percentage
   */
  coverageThreshold?: number;

  /**
   * Paths to ignore during analysis
   */
  ignoredPaths?: string[];

  /**
   * Enable verbose output
   */
  verbose?: boolean;

  /**
   * Working directory
   */
  cwd?: string;
}

/**
 * Result of running analysis
 */
export interface AnalysisRunnerResult {
  /**
   * All findings from all analyzers
   */
  findings: Finding[];

  /**
   * Analysis context used
   */
  context: AnalysisContext;

  /**
   * Number of files analyzed
   */
  filesAnalyzed: number;

  /**
   * Analyzers that were run
   */
  analyzersRun: string[];

  /**
   * Any warnings generated during analysis
   */
  warnings: string[];
}

/**
 * Analysis runner that orchestrates all analyzers
 */
export class AnalysisRunner {
  private registry: CliAnalyzerRegistry;
  private verbose: boolean;

  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false;
    this.registry = new CliAnalyzerRegistry({ verbose: this.verbose });
    this.registerDefaultAnalyzers();
  }

  /**
   * Register all default analyzers
   */
  private registerDefaultAnalyzers(): void {
    this.registry.register(new TypeScriptAnalyzerCli());
    this.registry.register(new SqlMigrationAnalyzerCli());
    this.registry.register(new PermissionAnalyzerCli());
    this.registry.register(new CoverageAnalyzerCli());
    this.registry.register(new OpenApiAnalyzerCli());
    this.registry.register(new UndocumentedApiAnalyzerCli());
    this.registry.register(new PythonAnalyzerCli());
    this.registry.register(new GoAnalyzerCli());
    this.registry.register(new JavaAnalyzerCli());
    this.registry.register(new CppAnalyzerCli());
    this.registry.register(new SwiftAnalyzerCli());
    this.registry.register(new RustAnalyzerCli());
  }

  /**
   * Run analysis with the given options
   */
  async run(options: AnalysisRunnerOptions): Promise<AnalysisRunnerResult> {
    const warnings: string[] = [];
    const analyzersRun: string[] = [];

    // Build repo config
    const repoConfig: RepoConfig = {
      coverageThreshold: options.coverageThreshold,
      ignorePaths: options.ignoredPaths,
    };

    // Build context options
    const contextOptions: ContextBuilderOptions = {
      base: options.base,
      head: options.head,
      staged: options.staged,
      repoConfig,
    };

    // Parse files glob into paths if provided
    if (options.files) {
      contextOptions.paths = this.parseGlobPattern(options.files);
    }

    // Build analysis context from git
    if (this.verbose) {
      console.log('Building analysis context from git...');
    }

    const { context, repoInfo } = await buildAnalysisContext(contextOptions, options.cwd);

    if (this.verbose) {
      console.log(`Repository: ${repoInfo.root}`);
      console.log(`Comparing ${context.files.length} files`);
    }

    // Filter ignored paths
    if (options.ignoredPaths && options.ignoredPaths.length > 0) {
      context.files = context.files.filter(
        (f) => !this.shouldIgnorePath(f.path, options.ignoredPaths!)
      );
    }

    // Load coverage report if available
    const coverageReport = await this.loadCoverageReport(options, warnings);
    if (coverageReport) {
      context.coverageReport = coverageReport;
    }

    // Load OpenAPI specs if available
    const openApiSpecs = await this.loadOpenApiSpecs(options, context, warnings);
    if (openApiSpecs) {
      context.openApiSpecs = openApiSpecs;
    }

    // Run all analyzers
    const findings: Finding[] = [];

    for (const analyzer of this.registry.getAllAnalyzers()) {
      if (this.verbose) {
        console.log(`Running ${analyzer.name} analyzer...`);
      }

      try {
        const analyzerFindings = await analyzer.analyze(context);
        findings.push(...analyzerFindings);
        analyzersRun.push(analyzer.name);

        if (this.verbose && analyzerFindings.length > 0) {
          console.log(`  Found ${analyzerFindings.length} findings`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Analyzer ${analyzer.name} failed: ${message}`);
        if (this.verbose) {
          console.warn(`  Warning: ${message}`);
        }
      }
    }

    return {
      findings,
      context,
      filesAnalyzed: context.files.length,
      analyzersRun,
      warnings,
    };
  }

  /**
   * Parse glob pattern into file paths
   */
  private parseGlobPattern(pattern: string): string[] {
    // For now, just return the pattern as a single path
    // In a full implementation, we'd use a glob library
    return [pattern];
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnorePath(filePath: string, ignoredPaths: string[]): boolean {
    return ignoredPaths.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        return regex.test(filePath);
      }
      return filePath.startsWith(pattern) || filePath === pattern;
    });
  }

  /**
   * Load coverage report from file
   */
  private async loadCoverageReport(
    options: AnalysisRunnerOptions,
    warnings: string[]
  ): Promise<CoverageReport | undefined> {
    const { discoverCoverageReport, parseLcovFile } = await import('../discovery/coverage-discovery');

    const coveragePath = options.coveragePath ?? discoverCoverageReport(options.cwd);

    if (!coveragePath) {
      if (this.verbose) {
        console.log('No coverage report found, skipping coverage analysis');
      }
      warnings.push('No coverage report found. Coverage analysis skipped.');
      return undefined;
    }

    if (this.verbose) {
      console.log(`Loading coverage report from: ${coveragePath}`);
    }

    try {
      return parseLcovFile(coveragePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to parse coverage report: ${message}`);
      return undefined;
    }
  }

  /**
   * Load OpenAPI specs for comparison
   */
  private async loadOpenApiSpecs(
    options: AnalysisRunnerOptions,
    _context: AnalysisContext,
    warnings: string[]
  ): Promise<OpenApiSpecPair | undefined> {
    const { discoverOpenApiSpec, loadOpenApiSpecs } = await import('../discovery/openapi-discovery');

    const openapiPath = options.openapiPath ?? discoverOpenApiSpec(options.cwd);

    if (!openapiPath) {
      if (this.verbose) {
        console.log('No OpenAPI spec found, skipping OpenAPI analysis');
      }
      return undefined;
    }

    if (this.verbose) {
      console.log(`Loading OpenAPI spec from: ${openapiPath}`);
    }

    try {
      return loadOpenApiSpecs(openapiPath, options.base ?? 'main', options.cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to load OpenAPI specs: ${message}`);
      return undefined;
    }
  }

  /**
   * Get the analyzer registry
   */
  getRegistry(): CliAnalyzerRegistry {
    return this.registry;
  }
}

/**
 * Convenience function to run analysis
 */
export async function runAnalysis(options: AnalysisRunnerOptions): Promise<AnalysisRunnerResult> {
  const runner = new AnalysisRunner({ verbose: options.verbose });
  return runner.run(options);
}
