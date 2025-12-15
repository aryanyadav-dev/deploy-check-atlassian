/**
 * OpenAPI Analyzer for CLI
 * Detects breaking API changes in OpenAPI specifications
 */

import type {
  AnalysisContext,
  Finding,
  OpenApiSpec,
  OpenApiPathItem,
  OpenApiOperation,
  OpenApiParameter,
} from '@dra/types';
import { BaseAnalyzerCli } from './base.analyzer';

/**
 * Represents a breaking change detected in OpenAPI specs.
 */
export interface OpenApiBreakingChange {
  type: 'ENDPOINT_REMOVED' | 'REQUIRED_PARAM_ADDED' | 'REQUIRED_BODY_ADDED' | 'RESPONSE_REMOVED';
  path: string;
  method?: string;
  paramName?: string;
  description: string;
}

/**
 * OpenAPI analyzer for detecting breaking API changes.
 * Compares old and new OpenAPI specs to detect removed endpoints,
 * added required parameters, etc. (Requirements 10.1, 10.3).
 */
export class OpenApiAnalyzerCli extends BaseAnalyzerCli {
  readonly name = 'openapi';
  readonly supportedExtensions = ['.yaml', '.yml', '.json'];

  private readonly openApiPathPatterns = [
    /openapi\.(yaml|yml|json)$/i,
    /swagger\.(yaml|yml|json)$/i,
    /api-spec\.(yaml|yml|json)$/i,
    /api\.(yaml|yml|json)$/i,
  ];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (!context.openApiSpecs) {
      return findings;
    }

    const { oldSpec, newSpec } = context.openApiSpecs;

    if (!oldSpec) {
      return findings;
    }

    if (!newSpec) {
      const removedEndpoints = this.getAllEndpoints(oldSpec);
      for (const endpoint of removedEndpoints) {
        findings.push(this.createEndpointRemovedFinding(endpoint.path, endpoint.method));
      }
      return findings;
    }

    const breakingChanges = this.detectBreakingChanges(oldSpec, newSpec);

    for (const change of breakingChanges) {
      findings.push(this.createFinding(change));
    }

    return findings;
  }

  isOpenApiFile(filePath: string): boolean {
    return this.openApiPathPatterns.some((pattern) => pattern.test(filePath));
  }

  detectBreakingChanges(oldSpec: OpenApiSpec, newSpec: OpenApiSpec): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];

    changes.push(...this.findRemovedEndpoints(oldSpec, newSpec));
    changes.push(...this.findAddedRequiredParameters(oldSpec, newSpec));
    changes.push(...this.findAddedRequiredBodies(oldSpec, newSpec));

    return changes;
  }

  private findRemovedEndpoints(oldSpec: OpenApiSpec, newSpec: OpenApiSpec): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];
    const methods: Array<keyof OpenApiPathItem> = ['get', 'post', 'put', 'delete', 'patch'];

    for (const [path, oldPathItem] of Object.entries(oldSpec.paths || {})) {
      const newPathItem = newSpec.paths?.[path];

      for (const method of methods) {
        if (oldPathItem[method] && (!newPathItem || !newPathItem[method])) {
          changes.push({
            type: 'ENDPOINT_REMOVED',
            path,
            method: method.toUpperCase(),
            description: `Endpoint ${method.toUpperCase()} ${path} was removed`,
          });
        }
      }
    }

    return changes;
  }

  private findAddedRequiredParameters(oldSpec: OpenApiSpec, newSpec: OpenApiSpec): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];
    const methods: Array<keyof OpenApiPathItem> = ['get', 'post', 'put', 'delete', 'patch'];

    for (const [path, newPathItem] of Object.entries(newSpec.paths || {})) {
      const oldPathItem = oldSpec.paths?.[path];
      if (!oldPathItem) continue;

      for (const method of methods) {
        const oldOp = oldPathItem[method];
        const newOp = newPathItem[method];

        if (!oldOp || !newOp) continue;

        const addedRequired = this.findAddedRequiredParams(oldOp, newOp);
        for (const param of addedRequired) {
          changes.push({
            type: 'REQUIRED_PARAM_ADDED',
            path,
            method: method.toUpperCase(),
            paramName: param.name,
            description: `Required parameter '${param.name}' was added to ${method.toUpperCase()} ${path}`,
          });
        }
      }
    }

    return changes;
  }

  private findAddedRequiredParams(oldOp: OpenApiOperation, newOp: OpenApiOperation): OpenApiParameter[] {
    const oldParams = new Set(
      (oldOp.parameters || []).filter((p) => p.required).map((p) => `${p.in}:${p.name}`),
    );

    return (newOp.parameters || []).filter(
      (p) => p.required && !oldParams.has(`${p.in}:${p.name}`),
    );
  }

  private findAddedRequiredBodies(oldSpec: OpenApiSpec, newSpec: OpenApiSpec): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];
    const methods: Array<keyof OpenApiPathItem> = ['post', 'put', 'patch'];

    for (const [path, newPathItem] of Object.entries(newSpec.paths || {})) {
      const oldPathItem = oldSpec.paths?.[path];
      if (!oldPathItem) continue;

      for (const method of methods) {
        const oldOp = oldPathItem[method];
        const newOp = newPathItem[method];

        if (!oldOp || !newOp) continue;

        const oldHasRequiredBody = oldOp.requestBody?.required === true;
        const newHasRequiredBody = newOp.requestBody?.required === true;

        if (!oldHasRequiredBody && newHasRequiredBody) {
          changes.push({
            type: 'REQUIRED_BODY_ADDED',
            path,
            method: method.toUpperCase(),
            description: `Required request body was added to ${method.toUpperCase()} ${path}`,
          });
        }
      }
    }

    return changes;
  }

  private getAllEndpoints(spec: OpenApiSpec): Array<{ path: string; method: string }> {
    const endpoints: Array<{ path: string; method: string }> = [];
    const methods: Array<keyof OpenApiPathItem> = ['get', 'post', 'put', 'delete', 'patch'];

    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const method of methods) {
        if (pathItem[method]) {
          endpoints.push({ path, method: method.toUpperCase() });
        }
      }
    }

    return endpoints;
  }

  private createFinding(change: OpenApiBreakingChange): Finding {
    return {
      type: 'BREAKING_API',
      severity: 'HIGH',
      title: this.getTitle(change),
      description: change.description,
      remediation: this.getRemediation(change),
      metadata: {
        changeType: change.type,
        path: change.path,
        method: change.method,
        paramName: change.paramName,
      },
    };
  }

  private createEndpointRemovedFinding(path: string, method: string): Finding {
    return {
      type: 'BREAKING_API',
      severity: 'HIGH',
      title: `API endpoint removed: ${method} ${path}`,
      description: `The endpoint ${method} ${path} was removed from the API specification.`,
      remediation: 'Ensure all API consumers have been updated before removing this endpoint. Consider deprecating first.',
      metadata: { changeType: 'ENDPOINT_REMOVED', path, method },
    };
  }

  private getTitle(change: OpenApiBreakingChange): string {
    switch (change.type) {
      case 'ENDPOINT_REMOVED':
        return `API endpoint removed: ${change.method} ${change.path}`;
      case 'REQUIRED_PARAM_ADDED':
        return `Required parameter added: ${change.paramName} on ${change.method} ${change.path}`;
      case 'REQUIRED_BODY_ADDED':
        return `Required request body added: ${change.method} ${change.path}`;
      case 'RESPONSE_REMOVED':
        return `Response removed: ${change.method} ${change.path}`;
      default:
        return `Breaking API change: ${change.path}`;
    }
  }

  private getRemediation(change: OpenApiBreakingChange): string {
    switch (change.type) {
      case 'ENDPOINT_REMOVED':
        return 'Ensure all API consumers have been updated before removing this endpoint. Consider deprecating first.';
      case 'REQUIRED_PARAM_ADDED':
        return 'Adding required parameters is a breaking change. Consider making the parameter optional with a default value.';
      case 'REQUIRED_BODY_ADDED':
        return 'Adding a required request body is a breaking change. Consider making it optional or versioning the API.';
      case 'RESPONSE_REMOVED':
        return 'Removing response types may break clients expecting that response. Consider deprecating first.';
      default:
        return 'Review this API change carefully and ensure all consumers are updated.';
    }
  }
}
