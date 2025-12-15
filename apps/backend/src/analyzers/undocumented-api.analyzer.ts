import { Injectable } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Undocumented API change analyzer.
 * Detects route handler modifications without corresponding OpenAPI spec changes.
 * (Requirements 10.2)
 */
@Injectable()
export class UndocumentedApiAnalyzer extends BaseAnalyzer {
  readonly name = 'undocumented-api';
  readonly supportedExtensions = ['.ts', '.js', '.tsx', '.jsx'];

  // Patterns for route handler files
  private readonly routeHandlerPatterns = [
    /\.controller\.(ts|js)$/i,
    /\.routes?\.(ts|js)$/i,
    /\/routes\//i,
    /\/controllers\//i,
    /\/api\//i,
    /\/handlers?\//i,
  ];

  // Patterns for OpenAPI spec files
  private readonly openApiFilePatterns = [
    /openapi\.(yaml|yml|json)$/i,
    /swagger\.(yaml|yml|json)$/i,
    /api-spec\.(yaml|yml|json)$/i,
  ];

  // Patterns that indicate route definitions in code
  private readonly routeDefinitionPatterns = [
    // Express-style routes
    /\.(get|post|put|delete|patch)\s*\(\s*['"`]/,
    // NestJS decorators
    /@(Get|Post|Put|Delete|Patch)\s*\(/,
    // Fastify routes
    /fastify\.(get|post|put|delete|patch)\s*\(/,
    // Koa routes
    /router\.(get|post|put|delete|patch)\s*\(/,
    // Next.js API routes (file-based)
    /export\s+(default\s+)?(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/,
    // Generic route patterns
    /route\s*\(\s*['"`]/,
    /endpoint\s*\(\s*['"`]/,
  ];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Check if any OpenAPI spec files were modified
    const openApiModified = this.hasOpenApiChanges(context.files);

    // Find modified route handler files
    const routeHandlerFiles = context.files.filter((f) => this.isRouteHandlerFile(f.path));

    // If route handlers were modified but no OpenAPI spec was changed
    if (routeHandlerFiles.length > 0 && !openApiModified) {
      for (const file of routeHandlerFiles) {
        // Check if the file contains route definitions
        if (this.hasRouteDefinitions(file)) {
          findings.push(this.createFinding(file));
        }
      }
    }

    return findings;
  }

  /**
   * Check if a file path matches route handler patterns.
   */
  isRouteHandlerFile(filePath: string): boolean {
    return this.routeHandlerPatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Check if a file path is an OpenAPI spec file.
   */
  isOpenApiFile(filePath: string): boolean {
    return this.openApiFilePatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Check if any OpenAPI spec files were modified.
   */
  hasOpenApiChanges(files: FileChange[]): boolean {
    return files.some((f) => this.isOpenApiFile(f.path));
  }

  /**
   * Check if a file contains route definitions.
   */
  hasRouteDefinitions(file: FileChange): boolean {
    const content = file.newContent || '';
    return this.routeDefinitionPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Check if the diff contains route-related changes.
   */
  hasRouteChangesInDiff(file: FileChange): boolean {
    // Check hunks for route-related changes
    for (const hunk of file.hunks) {
      if (this.routeDefinitionPatterns.some((pattern) => pattern.test(hunk.content))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create a finding for undocumented API change.
   */
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
      metadata: {
        fileName: file.path,
      },
    };
  }
}
