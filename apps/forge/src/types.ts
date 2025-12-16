/**
 * Forge App Type Definitions
 *
 * Shared type definitions for the Forge application including
 * storage models, serialization interfaces, and solution types.
 *
 * Requirements: 7.1, 7.2
 */

import type { Finding, Severity, FindingType } from '@dra/types';

/**
 * Stored analysis result for Forge storage
 * Serialized format with ISO 8601 timestamps
 */
export interface StoredAnalysisResult {
  id: string;
  timestamp: string; // ISO 8601
  projectKey: string;
  issueKey?: string;
  findings: SerializedFinding[];
  riskScore: number;
  summary: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  };
}

/**
 * Serialized finding for JSON storage
 * All fields are primitive types for safe serialization
 */
export interface SerializedFinding {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string;
  remediation?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Project configuration stored in Forge storage
 */
export interface ProjectConfig {
  coverageThreshold: number;
  enabledAnalyzers: string[];
  confluenceSpaceKey?: string;
  autoPublish: boolean;
  severityThreshold: Severity;
}

/**
 * Solution recommendation for a finding
 */
export interface Solution {
  findingId: string;
  findingType: FindingType;
  severity: Severity;
  title: string;
  description: string;
  mitigationSteps: string[];
  codeFix?: CodeFix;
  rollbackProcedure?: string;
  documentationLinks?: string[];
  urgency: 'immediate' | 'high' | 'medium' | 'low';
}

/**
 * Code fix suggestion for a finding
 */
export interface CodeFix {
  filePath: string;
  description: string;
  beforeCode?: string;
  afterCode: string;
  lineStart?: number;
  lineEnd?: number;
}

/**
 * General recommendation for deployment risks
 */
export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  applicableFindings: string[];
  actionItems: string[];
}

/**
 * Categories for recommendations
 */
export type RecommendationCategory =
  | 'api_versioning'
  | 'test_coverage'
  | 'database_migration'
  | 'permission_audit'
  | 'documentation'
  | 'rollback_strategy';

/**
 * Analysis result with runtime Date objects
 * Used internally before serialization
 */
export interface AnalysisResult {
  id: string;
  timestamp: Date;
  projectKey?: string;
  issueKey?: string;
  findings: Finding[];
  riskScore: number;
  summary: AnalysisSummary;
  solutions?: Solution[];
}

/**
 * Summary statistics for an analysis
 */
export interface AnalysisSummary {
  totalFindings: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}

/**
 * File location within a repository
 */
export interface FileLocation {
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Agent context for Rovo agent actions
 */
export interface AgentContext {
  accountId: string;
  issueKey?: string;
  spaceKey?: string;
  conversationId: string;
}

/**
 * Input for analysis requests
 */
export interface AnalysisInput {
  repositoryUrl: string;
  baseRef: string;
  headRef: string;
  projectKey?: string;
  issueKey?: string;
}
