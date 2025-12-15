// Analyzer interfaces
import type { FindingType, Severity } from './models';

export interface Analyzer {
  name: string;
  supportedExtensions: string[];
  analyze(context: AnalysisContext): Promise<Finding[]>;
}

export interface AnalysisContext {
  files: FileChange[];
  diff: string;
  repoConfig: RepoConfig;
  coverageReport?: CoverageReport;
  openApiSpecs?: OpenApiSpecPair;
}

export interface FileChange {
  path: string;
  oldContent: string | null;
  newContent: string | null;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface RepoConfig {
  coverageThreshold?: number;
  ignorePaths?: string[];
  enabledAnalyzers?: string[];
}

export interface Finding {
  type: FindingType;
  severity: Severity;
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string;
  remediation?: string;
  metadata?: Record<string, unknown>;
}

// Coverage types
export interface CoverageReport {
  files: FileCoverage[];
}

export interface FileCoverage {
  path: string;
  lineRate: number;
  branchRate: number;
  functionRate: number;
  linesCovered: number;
  linesTotal: number;
  branchesCovered: number;
  branchesTotal: number;
  functionsCovered: number;
  functionsTotal: number;
}

// OpenAPI types
export interface OpenApiSpecPair {
  oldSpec: OpenApiSpec | null;
  newSpec: OpenApiSpec | null;
}

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, OpenApiPathItem>;
}

export interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: Record<string, unknown>;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content: Record<string, { schema: Record<string, unknown> }>;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: Record<string, unknown> }>;
}

// Analyzer registry interface
export interface AnalyzerRegistry {
  register(analyzer: Analyzer): void;
  getAnalyzer(name: string): Analyzer | undefined;
  getAnalyzersForFile(filePath: string): Analyzer[];
  getAllAnalyzers(): Analyzer[];
}

// Analyzer configuration
export interface AnalyzerConfig {
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}
