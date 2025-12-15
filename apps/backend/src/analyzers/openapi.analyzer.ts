import { Injectable } from '@nestjs/common';
import type {
  AnalysisContext,
  Finding,
  OpenApiSpec,
  OpenApiPathItem,
  OpenApiOperation,
  OpenApiParameter,
} from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

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
@Injectable()
export class OpenApiAnalyzer extends BaseAnalyzer {
  readonly name = 'openapi';
  readonly supportedExtensions = ['.yaml', '.yml', '.json'];

  // Patterns for OpenAPI spec file paths
  private readonly openApiPathPatterns = [
    /openapi\.(yaml|yml|json)$/i,
    /swagger\.(yaml|yml|json)$/i,
    /api-spec\.(yaml|yml|json)$/i,
    /api\.(yaml|yml|json)$/i,
  ];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Check if we have OpenAPI specs to compare
    if (!context.openApiSpecs) {
      return findings;
    }

    const { oldSpec, newSpec } = context.openApiSpecs;

    // If no old spec, this is a new API - no breaking changes
    if (!oldSpec) {
      return findings;
    }

    // If no new spec but had old spec, all endpoints are removed
    if (!newSpec) {
      const removedEndpoints = this.getAllEndpoints(oldSpec);
      for (const endpoint of removedEndpoints) {
        findings.push(this.createEndpointRemovedFinding(endpoint.path, endpoint.method));
      }
      return findings;
    }

    // Compare specs for breaking changes
    const breakingChanges = this.detectBreakingChanges(oldSpec, newSpec);

    for (const change of breakingChanges) {
      findings.push(this.createFinding(change));
    }

    return findings;
  }

  /**
   * Check if a file path is an OpenAPI spec file.
   */
  isOpenApiFile(filePath: string): boolean {
    return this.openApiPathPatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Detect breaking changes between two OpenAPI specs.
   */
  detectBreakingChanges(oldSpec: OpenApiSpec, newSpec: OpenApiSpec): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];

    // Check for removed endpoints
    const removedEndpoints = this.findRemovedEndpoints(oldSpec, newSpec);
    changes.push(...removedEndpoints);

    // Check for added required parameters
    const addedRequiredParams = this.findAddedRequiredParameters(oldSpec, newSpec);
    changes.push(...addedRequiredParams);

    // Check for added required request bodies
    const addedRequiredBodies = this.findAddedRequiredBodies(oldSpec, newSpec);
    changes.push(...addedRequiredBodies);

    return changes;
  }

  /**
   * Find endpoints that were removed from the spec.
   */
  private findRemovedEndpoints(
    oldSpec: OpenApiSpec,
    newSpec: OpenApiSpec,
  ): OpenApiBreakingChange[] {
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

  /**
   * Find required parameters that were added to existing endpoints.
   */
  private findAddedRequiredParameters(
    oldSpec: OpenApiSpec,
    newSpec: OpenApiSpec,
  ): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];
    const methods: Array<keyof OpenApiPathItem> = ['get', 'post', 'put', 'delete', 'patch'];

    for (const [path, newPathItem] of Object.entries(newSpec.paths || {})) {
      const oldPathItem = oldSpec.paths?.[path];
      if (!oldPathItem) continue; // New endpoint, not a breaking change

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

  /**
   * Find required parameters added to an operation.
   */
  private findAddedRequiredParams(
    oldOp: OpenApiOperation,
    newOp: OpenApiOperation,
  ): OpenApiParameter[] {
    const oldParams = new Set(
      (oldOp.parameters || [])
        .filter((p) => p.required)
        .map((p) => `${p.in}:${p.name}`),
    );

    return (newOp.parameters || []).filter(
      (p) => p.required && !oldParams.has(`${p.in}:${p.name}`),
    );
  }

  /**
   * Find required request bodies that were added to existing endpoints.
   */
  private findAddedRequiredBodies(
    oldSpec: OpenApiSpec,
    newSpec: OpenApiSpec,
  ): OpenApiBreakingChange[] {
    const changes: OpenApiBreakingChange[] = [];
    const methods: Array<keyof OpenApiPathItem> = ['post', 'put', 'patch'];

    for (const [path, newPathItem] of Object.entries(newSpec.paths || {})) {
      const oldPathItem = oldSpec.paths?.[path];
      if (!oldPathItem) continue;

      for (const method of methods) {
        const oldOp = oldPathItem[method];
        const newOp = newPathItem[method];

        if (!oldOp || !newOp) continue;

        // Check if required body was added
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

  /**
   * Get all endpoints from a spec.
   */
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

  /**
   * Create a finding for a breaking change.
   */
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

  /**
   * Create a finding for a removed endpoint.
   */
  private createEndpointRemovedFinding(path: string, method: string): Finding {
    return {
      type: 'BREAKING_API',
      severity: 'HIGH',
      title: `API endpoint removed: ${method} ${path}`,
      description: `The endpoint ${method} ${path} was removed from the API specification.`,
      remediation:
        'Ensure all API consumers have been updated before removing this endpoint. Consider deprecating first.',
      metadata: {
        changeType: 'ENDPOINT_REMOVED',
        path,
        method,
      },
    };
  }

  /**
   * Generate title for a breaking change finding.
   */
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

  /**
   * Generate remediation advice for a breaking change.
   */
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

  /**
   * Parse OpenAPI spec from YAML or JSON string.
   * Note: For simplicity, this assumes JSON. In production, use js-yaml for YAML support.
   */
  static parseSpec(content: string): OpenApiSpec {
    return JSON.parse(content) as OpenApiSpec;
  }

  /**
   * Serialize OpenAPI spec to JSON string.
   */
  static serializeSpec(spec: OpenApiSpec): string {
    return JSON.stringify(spec, null, 2);
  }
}
