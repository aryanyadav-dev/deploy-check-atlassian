/**
 * OpenAPI Spec Discovery
 * Auto-detects OpenAPI specification files in common locations
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { OpenApiSpec, OpenApiSpecPair } from '@dra/types';

/**
 * Common locations for OpenAPI specification files
 */
const OPENAPI_LOCATIONS = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
  'api-spec.yaml',
  'api-spec.yml',
  'api-spec.json',
  'api/openapi.yaml',
  'api/openapi.yml',
  'api/openapi.json',
  'docs/openapi.yaml',
  'docs/openapi.yml',
  'docs/openapi.json',
  'spec/openapi.yaml',
  'spec/openapi.yml',
  'spec/openapi.json',
];

/**
 * Discover OpenAPI spec in common locations
 * @param cwd Working directory to search from
 * @returns Path to OpenAPI spec or undefined if not found
 */
export function discoverOpenApiSpec(cwd?: string): string | undefined {
  const baseDir = cwd ?? process.cwd();

  for (const location of OPENAPI_LOCATIONS) {
    const fullPath = path.join(baseDir, location);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

/**
 * Load OpenAPI specs for comparison (current vs base version)
 * @param specPath Path to the OpenAPI spec file
 * @param baseRef Git reference for the base version
 * @param cwd Working directory
 * @returns OpenAPI spec pair for comparison
 */
export function loadOpenApiSpecs(
  specPath: string,
  baseRef: string,
  cwd?: string
): OpenApiSpecPair {
  const baseDir = cwd ?? process.cwd();
  const relativePath = path.relative(baseDir, specPath);

  // Load current spec from file system
  const newSpec = loadSpecFromFile(specPath);

  // Load old spec from git
  const oldSpec = loadSpecFromGit(relativePath, baseRef, baseDir);

  return { oldSpec, newSpec };
}

/**
 * Load OpenAPI spec from file
 */
function loadSpecFromFile(filePath: string): OpenApiSpec | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseOpenApiSpec(content, filePath);
  } catch {
    return null;
  }
}

/**
 * Load OpenAPI spec from git reference
 */
function loadSpecFromGit(filePath: string, ref: string, cwd: string): OpenApiSpec | null {
  try {
    const content = execSync(`git show ${ref}:${filePath}`, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseOpenApiSpec(content, filePath);
  } catch {
    return null;
  }
}

/**
 * Parse OpenAPI spec from content
 * Supports both JSON and YAML formats
 */
function parseOpenApiSpec(content: string, filePath: string): OpenApiSpec {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(content) as OpenApiSpec;
  }

  // For YAML, we need to use a YAML parser
  // Since yaml is already a dependency, we can use it
  try {
    const yaml = require('yaml');
    return yaml.parse(content) as OpenApiSpec;
  } catch {
    // Fallback: try JSON parse in case it's actually JSON with wrong extension
    return JSON.parse(content) as OpenApiSpec;
  }
}

/**
 * Check if a file path is an OpenAPI spec file
 */
export function isOpenApiFile(filePath: string): boolean {
  const patterns = [
    /openapi\.(yaml|yml|json)$/i,
    /swagger\.(yaml|yml|json)$/i,
    /api-spec\.(yaml|yml|json)$/i,
  ];

  return patterns.some((pattern) => pattern.test(filePath));
}
