/**
 * Serialization Utilities
 *
 * Functions for serializing and deserializing analysis results
 * to/from JSON format for Forge storage.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import type { Finding } from '@dra/types';
import type {
  AnalysisResult,
  StoredAnalysisResult,
  SerializedFinding,
  Solution,
} from '../types';

/**
 * Serialize an AnalysisResult to a JSON string for storage
 *
 * @param result - The analysis result to serialize
 * @returns JSON string representation
 */
export function serialize(result: AnalysisResult): string {
  const stored: StoredAnalysisResult = {
    id: result.id,
    timestamp: result.timestamp.toISOString(),
    projectKey: result.projectKey ?? '',
    issueKey: result.issueKey,
    findings: result.findings.map(serializeFinding),
    riskScore: result.riskScore,
    summary: {
      totalFindings: result.summary.totalFindings,
      bySeverity: { ...result.summary.bySeverity },
      byType: { ...result.summary.byType },
    },
  };

  return JSON.stringify(stored);
}

/**
 * Deserialize a JSON string back to an AnalysisResult
 *
 * @param json - The JSON string to deserialize
 * @returns The reconstructed AnalysisResult
 * @throws Error if JSON is invalid or missing required fields
 */
export function deserialize(json: string): AnalysisResult {
  const stored: StoredAnalysisResult = JSON.parse(json);

  validateStoredResult(stored);

  return {
    id: stored.id,
    timestamp: new Date(stored.timestamp),
    projectKey: stored.projectKey || undefined,
    issueKey: stored.issueKey,
    findings: stored.findings.map(deserializeFinding),
    riskScore: stored.riskScore,
    summary: {
      totalFindings: stored.summary.totalFindings,
      bySeverity: { ...stored.summary.bySeverity },
      byType: { ...stored.summary.byType },
    },
  };
}

/**
 * Serialize a single Finding to SerializedFinding format
 */
function serializeFinding(finding: Finding): SerializedFinding {
  return {
    id: generateFindingId(finding),
    type: finding.type,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    filePath: finding.filePath,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    codeSnippet: finding.codeSnippet,
    remediation: finding.remediation,
    metadata: finding.metadata,
  };
}

/**
 * Deserialize a SerializedFinding back to Finding format
 */
function deserializeFinding(serialized: SerializedFinding): Finding {
  return {
    type: serialized.type as Finding['type'],
    severity: serialized.severity as Finding['severity'],
    title: serialized.title,
    description: serialized.description,
    filePath: serialized.filePath,
    lineStart: serialized.lineStart,
    lineEnd: serialized.lineEnd,
    codeSnippet: serialized.codeSnippet,
    remediation: serialized.remediation,
    metadata: serialized.metadata,
  };
}

/**
 * Generate a unique ID for a finding based on its content
 */
function generateFindingId(finding: Finding): string {
  const content = `${finding.type}-${finding.filePath ?? 'unknown'}-${finding.lineStart ?? 0}`;
  // Simple hash for ID generation
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `finding-${Math.abs(hash).toString(16)}`;
}

/**
 * Validate that a stored result has all required fields
 */
function validateStoredResult(stored: StoredAnalysisResult): void {
  if (!stored.id || typeof stored.id !== 'string') {
    throw new Error('Invalid stored result: missing or invalid id');
  }
  if (!stored.timestamp || typeof stored.timestamp !== 'string') {
    throw new Error('Invalid stored result: missing or invalid timestamp');
  }
  if (!Array.isArray(stored.findings)) {
    throw new Error('Invalid stored result: findings must be an array');
  }
  if (typeof stored.riskScore !== 'number') {
    throw new Error('Invalid stored result: missing or invalid riskScore');
  }
  if (!stored.summary || typeof stored.summary !== 'object') {
    throw new Error('Invalid stored result: missing or invalid summary');
  }

  // Validate timestamp is a valid ISO 8601 date
  const date = new Date(stored.timestamp);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid stored result: timestamp is not a valid ISO 8601 date');
  }
}

/**
 * Serialize solutions array for storage
 */
export function serializeSolutions(solutions: Solution[]): string {
  return JSON.stringify(solutions);
}

/**
 * Deserialize solutions from storage
 */
export function deserializeSolutions(json: string): Solution[] {
  return JSON.parse(json) as Solution[];
}
