/**
 * Undocumented API Analyzer for CLI
 * Detects route handler modifications without corresponding OpenAPI spec changes
 */

import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzerCli } from './base.analyzer';

/**
 * Undocumented API change analyzer.
 * Detects route handler modifications without corresponding OpenAPI spec changes.
 * (Requirements 10.2)
 */
export class UndocumentedApiAnalyzerCli extends BaseAnalyzerCli {
  readonly name = 'undocumented-api';
  readonly supportedExtensions = ['.ts', '.js', '.tsx', '.jsx'];

  private readonly routeHandlerPatterns = [
    /\.controller\.(ts|js)$/i,
    /\.routes?\.(ts|js)$/i,
    /\/routes\//i,
    /\/controllers\//i,
    /\/api\//i,
    /\/handlers?\//i,
  ];

  private readonly openApiFilePatterns = [
    /openapi\.(yaml|yml|json)$/i,
    /swagger\.(yaml|yml|json)$/i,
    /api-spec\.(yaml|yml|json)$/i,
  ];

  private readonly routeDefinitionPatterns = [
    /\.(get|post|put|delete|patch)\s*\(\s*['"`]/,
    /@(Get|Post|Put|Delete|Patch)\s*\(/,
    /fastify\.(get|post|put|delete|patch)\s*\(/,
    /router\.(get|post|put|delete|patch)\s*\(/,
    /export\s+(default\s+)?(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/,
    /route\s*\(\s*['"`]/,
    /endpoint\s*\(\s*['"`]/,
  ];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    const openApiModified = this.hasOpenApiChanges(context.files);
    const routeHandlerFiles = context.files.filter((f) => this.isRouteHandlerFile(f.path));

    if (routeHandlerFiles.length > 0 && !openApiModified) {
      for (const file of routeHandlerFiles) {
        if (this.hasRouteDefinitions(file)) {
          findings.push(this.createFinding(file));
        }
      }
    }

    return findings;
  }

  isRouteHandlerFile(filePath: string): boolean {
    return this.routeHandlerPatterns.some((pattern) => pattern.test(filePath));
  }

  isOpenApiFile(filePath: string): boolean {
    return this.openApiFilePatterns.some((pattern) => pattern.test(filePath));
  }

  hasOpenApiChanges(files: FileChange[]): boolean {
    return files.some((f) => this.isOpenApiFile(f.path));
  }

  hasRouteDefinitions(file: FileChange): boolean {
    const content = file.newContent || '';
    return this.routeDefinitionPatterns.some((pattern) => pattern.test(content));
  }

  private createFinding(file: FileChange): Finding {
    return {
      type: 'UNDOCUMENTED_API',
      severity: 'MEDIUM',
      title: `Undocumented API change: ${file.path}`,
      description:
        `Route handler file '${file.path}' was modified but no OpenAPI specification was updated. ` +
        'This may indicate an undocumented API change.',
      filePath: file.path,
      remediation:
        'Update the OpenAPI specification to reflect any API changes. ' +
        'If no API changes were made, consider adding a comment explaining the modification.',
      metadata: { fileName: file.path },
    };
  }
}
