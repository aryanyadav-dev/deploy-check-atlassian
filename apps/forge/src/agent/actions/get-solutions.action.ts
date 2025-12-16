/**
 * Get Solutions Action
 *
 * Rovo agent action handler for solution requests.
 * Returns detailed solutions with steps, code fixes, and rollback procedures.
 *
 * Requirements: 2.2
 */

import type { FindingType, Severity } from '@dra/types';
import { solutionService } from '../../services/solution.service';
import { solutionKnowledgeBase, getAvailableFindingTypes } from '../../services/solution-knowledge-base';
import { StorageService } from '../../services/storage.service';
import type { CodeFix } from '../../types';
import { getRiskTypeKnowledge, getSeverityKnowledge } from '../prompts/system-prompt';

/**
 * Input payload for get solutions action
 */
export interface GetSolutionsInput {
  /** Finding ID to get solution for (from analysis result) */
  findingId?: string;
  /** Risk type to get general solution for */
  riskType?: FindingType;
  /** Analysis result ID to look up finding */
  resultId?: string;
  /** Severity level for context */
  severity?: Severity;
}

/**
 * Agent context provided by Rovo
 */
export interface AgentActionContext {
  accountId: string;
  conversationId?: string;
}

/**
 * Detailed solution response
 */
export interface GetSolutionsResponse {
  status: 'success' | 'error' | 'not_found';
  solution?: DetailedSolution;
  availableRiskTypes?: string[];
  message: string;
}

/**
 * Detailed solution with all information
 */
export interface DetailedSolution {
  title: string;
  description: string;
  riskType: string;
  severity?: string;
  urgency: string;
  mitigationSteps: string[];
  codeFix?: CodeFix;
  rollbackProcedure?: string;
  documentationLinks: string[];
  additionalContext: {
    impact?: string;
    commonCauses?: string[];
    bestPractices?: string[];
  };
}

// Storage service for retrieving cached results
const storageService = new StorageService();

/**
 * Get solutions action handler
 *
 * Accepts finding ID or risk type as input and returns detailed solution
 * with steps, code fixes, and rollback procedures.
 *
 * Requirements: 2.2 - When a user asks about specific risk types,
 * the Rovo_Agent SHALL explain the risk and provide mitigation suggestions
 */
export const getSolutionsAction = async (args: {
  payload: GetSolutionsInput;
  context: AgentActionContext;
}): Promise<GetSolutionsResponse> => {
  const { payload } = args;

  // If no specific input, return available risk types
  if (!payload.findingId && !payload.riskType) {
    return {
      status: 'success',
      availableRiskTypes: getAvailableFindingTypes(),
      message:
        'No specific finding or risk type provided. Here are the available risk types you can ask about: ' +
        getAvailableFindingTypes().join(', '),
    };
  }

  try {
    // If finding ID provided, look up from cached result
    if (payload.findingId && payload.resultId) {
      return await getSolutionForFinding(payload.resultId, payload.findingId);
    }

    // If risk type provided, get general solution
    if (payload.riskType) {
      return getSolutionForRiskType(payload.riskType, payload.severity);
    }

    return {
      status: 'error',
      message: 'Please provide either a findingId with resultId, or a riskType to get solutions.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to get solutions: ${errorMessage}`,
    };
  }
};

/**
 * Get solution for a specific finding from cached analysis result
 */
async function getSolutionForFinding(
  resultId: string,
  findingId: string
): Promise<GetSolutionsResponse> {
  const result = await storageService.getCachedResult(resultId);

  if (!result) {
    return {
      status: 'not_found',
      message: `Analysis result ${resultId} not found or has expired. Please run a new analysis.`,
    };
  }

  // Find the specific finding by generated ID pattern
  const finding = result.findings.find(
    (f) =>
      `${f.type}-${f.filePath?.replace(/[^a-zA-Z0-9]/g, '-')}-${f.lineStart ?? 0}` === findingId ||
      `${f.type}-${f.lineStart ?? 0}` === findingId
  );

  if (!finding) {
    return {
      status: 'not_found',
      message: `Finding ${findingId} not found in analysis result. Available findings: ${result.findings.map((f) => f.type).join(', ')}`,
    };
  }

  // Generate solution for the finding
  const solution = solutionService.generateSolution(finding);
  const riskKnowledge = getRiskTypeKnowledge(finding.type as keyof typeof solutionKnowledgeBase);

  const detailedSolution: DetailedSolution = {
    title: solution.title,
    description: solution.description,
    riskType: finding.type,
    severity: finding.severity,
    urgency: solution.urgency,
    mitigationSteps: solution.mitigationSteps,
    codeFix: solution.codeFix,
    rollbackProcedure: solution.rollbackProcedure,
    documentationLinks: solution.documentationLinks ?? [],
    additionalContext: {
      impact: riskKnowledge?.impact,
      commonCauses: riskKnowledge?.commonCauses ? [...riskKnowledge.commonCauses] : undefined,
      bestPractices: riskKnowledge?.mitigationStrategies ? [...riskKnowledge.mitigationStrategies] : undefined,
    },
  };

  return {
    status: 'success',
    solution: detailedSolution,
    message: buildSolutionMessage(detailedSolution),
  };
}

/**
 * Get general solution for a risk type
 */
function getSolutionForRiskType(
  riskType: FindingType,
  severity?: Severity
): GetSolutionsResponse {
  const template = solutionKnowledgeBase[riskType];

  if (!template) {
    return {
      status: 'not_found',
      availableRiskTypes: getAvailableFindingTypes(),
      message: `Unknown risk type: ${riskType}. Available types: ${getAvailableFindingTypes().join(', ')}`,
    };
  }

  const riskKnowledge = getRiskTypeKnowledge(riskType as keyof typeof solutionKnowledgeBase);
  const severityKnowledge = severity ? getSeverityKnowledge(severity) : undefined;

  const detailedSolution: DetailedSolution = {
    title: template.title,
    description: template.description,
    riskType,
    severity,
    urgency: severity ? mapSeverityToUrgency(severity) : 'medium',
    mitigationSteps: template.mitigationSteps,
    codeFix: template.codeFixTemplate
      ? {
          filePath: 'example.ts',
          description: template.codeFixTemplate.description,
          afterCode: template.codeFixTemplate.fixPattern ?? '',
        }
      : undefined,
    rollbackProcedure: template.rollbackProcedure,
    documentationLinks: template.documentationLinks ?? [],
    additionalContext: {
      impact: riskKnowledge?.impact,
      commonCauses: riskKnowledge?.commonCauses ? [...riskKnowledge.commonCauses] : undefined,
      bestPractices: riskKnowledge?.mitigationStrategies ? [...riskKnowledge.mitigationStrategies] : undefined,
    },
  };

  let message = buildSolutionMessage(detailedSolution);

  if (severityKnowledge) {
    message += `\n\nSeverity Context (${severity}): ${severityKnowledge.description}. ${severityKnowledge.responseTime}.`;
  }

  return {
    status: 'success',
    solution: detailedSolution,
    message,
  };
}

/**
 * Map severity to urgency level
 */
function mapSeverityToUrgency(severity: Severity): 'immediate' | 'high' | 'medium' | 'low' {
  const mapping: Record<Severity, 'immediate' | 'high' | 'medium' | 'low'> = {
    CRITICAL: 'immediate',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
  };
  return mapping[severity];
}

/**
 * Build human-readable solution message
 */
function buildSolutionMessage(solution: DetailedSolution): string {
  const parts: string[] = [];

  parts.push(`## ${solution.title}`);
  parts.push('');
  parts.push(solution.description);
  parts.push('');

  if (solution.severity) {
    parts.push(`**Severity:** ${solution.severity} | **Urgency:** ${solution.urgency}`);
    parts.push('');
  }

  if (solution.additionalContext.impact) {
    parts.push(`**Impact:** ${solution.additionalContext.impact}`);
    parts.push('');
  }

  parts.push('### Mitigation Steps');
  solution.mitigationSteps.forEach((step, index) => {
    parts.push(`${index + 1}. ${step}`);
  });
  parts.push('');

  if (solution.codeFix) {
    parts.push('### Suggested Code Fix');
    parts.push(solution.codeFix.description);
    if (solution.codeFix.afterCode) {
      parts.push('```');
      parts.push(solution.codeFix.afterCode);
      parts.push('```');
    }
    parts.push('');
  }

  if (solution.rollbackProcedure) {
    parts.push('### Rollback Procedure');
    parts.push(solution.rollbackProcedure);
    parts.push('');
  }

  if (solution.documentationLinks.length > 0) {
    parts.push('### Documentation');
    solution.documentationLinks.forEach((link) => {
      parts.push(`- ${link}`);
    });
  }

  return parts.join('\n');
}
