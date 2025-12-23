/**
 * Explain Risk Action
 *
 * Rovo agent action handler for risk explanations.
 * Provides context-aware explanations with recommended solutions and mitigation steps.
 */

import type { FindingType, Severity } from '@dra/types';
import { solutionKnowledgeBase, getAvailableFindingTypes } from '../../services/solution-knowledge-base';
import { StorageService } from '../../services/storage.service';
import {
  RISK_TYPE_KNOWLEDGE,
  SEVERITY_KNOWLEDGE,
  getRiskTypeKnowledge,
  getSeverityKnowledge,
} from '../prompts/system-prompt';

/**
 * Input payload for explain risk action
 */
export interface ExplainRiskInput {
  riskType?: FindingType;
  findingId?: string;
  resultId?: string;
  context?: string;
}

/**
 * Agent context provided by Rovo
 */
export interface AgentActionContext {
  accountId: string;
  conversationId?: string;
}

/**
 * Risk explanation response
 */
export interface ExplainRiskResponse {
  status: 'success' | 'error' | 'not_found';
  explanation?: RiskExplanation;
  availableRiskTypes?: string[];
  message: string;
}

/**
 * Detailed risk explanation
 */
export interface RiskExplanation {
  riskType: string;
  name: string;
  description: string;
  severity?: string;
  impact: string;
  whyItMatters: string;
  potentialConsequences: string[];
  commonCauses: string[];
  mitigationStrategies: string[];
  rollbackProcedure?: string;
  documentationLinks: string[];
  contextualAdvice?: string;
}

const storageService = new StorageService();

/**
 * Explain risk action handler
 */
export const explainRiskAction = async (args: {
  payload: ExplainRiskInput;
  context: AgentActionContext;
}): Promise<ExplainRiskResponse> => {
  const { payload } = args;

  if (!payload.riskType && !payload.findingId) {
    return {
      status: 'success',
      availableRiskTypes: getAvailableFindingTypes(),
      message: buildAvailableTypesMessage(),
    };
  }

  try {
    if (payload.findingId && payload.resultId) {
      return await explainFinding(payload.resultId, payload.findingId, payload.context);
    }

    if (payload.riskType) {
      return explainRiskType(payload.riskType, payload.context);
    }

    return {
      status: 'error',
      message: 'Please provide either a riskType or a findingId with resultId.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to explain risk: ${errorMessage}`,
    };
  }
};

async function explainFinding(
  resultId: string,
  findingId: string,
  additionalContext?: string
): Promise<ExplainRiskResponse> {
  const result = await storageService.getCachedResult(resultId);

  if (!result) {
    return {
      status: 'not_found',
      message: `Analysis result ${resultId} not found or has expired.`,
    };
  }

  const finding = result.findings.find(
    (f) =>
      `${f.type}-${f.filePath?.replace(/[^a-zA-Z0-9]/g, '-')}-${f.lineStart ?? 0}` === findingId ||
      `${f.type}-${f.lineStart ?? 0}` === findingId
  );

  if (!finding) {
    return {
      status: 'not_found',
      message: `Finding ${findingId} not found in analysis result.`,
    };
  }

  const riskKnowledge = getRiskTypeKnowledge(finding.type as keyof typeof RISK_TYPE_KNOWLEDGE);
  const severityKnowledge = getSeverityKnowledge(finding.severity as keyof typeof SEVERITY_KNOWLEDGE);
  const template = solutionKnowledgeBase[finding.type as FindingType];

  const explanation: RiskExplanation = {
    riskType: finding.type,
    name: riskKnowledge?.name ?? finding.type,
    description: finding.description,
    severity: finding.severity,
    impact: riskKnowledge?.impact ?? 'May affect production stability',
    whyItMatters: buildWhyItMatters(finding.type as FindingType, finding.severity as Severity),
    potentialConsequences: buildConsequences(finding.type as FindingType, finding.severity as Severity),
    commonCauses: riskKnowledge?.commonCauses ? [...riskKnowledge.commonCauses] : [],
    mitigationStrategies: riskKnowledge?.mitigationStrategies ? [...riskKnowledge.mitigationStrategies] : template?.mitigationSteps ?? [],
    rollbackProcedure: template?.rollbackProcedure,
    documentationLinks: template?.documentationLinks ?? [],
    contextualAdvice: buildContextualAdvice(finding, additionalContext),
  };

  return {
    status: 'success',
    explanation,
    message: buildExplanationMessage(explanation, severityKnowledge),
  };
}

function explainRiskType(riskType: FindingType, additionalContext?: string): ExplainRiskResponse {
  const riskKnowledge = getRiskTypeKnowledge(riskType as keyof typeof RISK_TYPE_KNOWLEDGE);
  const template = solutionKnowledgeBase[riskType];

  if (!riskKnowledge && !template) {
    return {
      status: 'not_found',
      availableRiskTypes: getAvailableFindingTypes(),
      message: `Unknown risk type: ${riskType}. Available: ${getAvailableFindingTypes().join(', ')}`,
    };
  }

  const explanation: RiskExplanation = {
    riskType,
    name: riskKnowledge?.name ?? riskType,
    description: riskKnowledge?.description ?? template?.description ?? '',
    impact: riskKnowledge?.impact ?? 'May affect production stability',
    whyItMatters: buildWhyItMatters(riskType, undefined),
    potentialConsequences: buildConsequences(riskType, undefined),
    commonCauses: riskKnowledge?.commonCauses ? [...riskKnowledge.commonCauses] : [],
    mitigationStrategies: riskKnowledge?.mitigationStrategies ? [...riskKnowledge.mitigationStrategies] : template?.mitigationSteps ?? [],
    rollbackProcedure: template?.rollbackProcedure,
    documentationLinks: template?.documentationLinks ?? [],
    contextualAdvice: additionalContext ? `Based on your context: ${additionalContext}` : undefined,
  };

  return {
    status: 'success',
    explanation,
    message: buildExplanationMessage(explanation),
  };
}

function buildWhyItMatters(riskType: FindingType, severity?: Severity): string {
  const baseReasons: Record<string, string> = {
    BREAKING_API: 'Breaking API changes can cause immediate failures for downstream consumers.',
    DESTRUCTIVE_MIGRATION: 'Destructive migrations can result in permanent data loss.',
    PERMISSION_CHANGE: 'Permission changes directly affect security posture.',
    LOW_COVERAGE: 'Low test coverage means bugs reach production undetected.',
    UNDOCUMENTED_API: 'Undocumented APIs create integration friction.',
  };

  let reason = baseReasons[riskType] ?? 'This risk type can affect production stability.';

  if (severity === 'CRITICAL' || severity === 'HIGH') {
    reason += ' Address before deployment.';
  }

  return reason;
}

function buildConsequences(riskType: FindingType, severity?: Severity): string[] {
  const consequences: Record<string, string[]> = {
    BREAKING_API: ['Client applications may crash', 'Integrations will fail', 'User disruptions'],
    DESTRUCTIVE_MIGRATION: ['Permanent data loss', 'Extended downtime', 'Compliance violations'],
    PERMISSION_CHANGE: ['Unauthorized access', 'Users locked out', 'Security audit failures'],
    LOW_COVERAGE: ['Bugs reach production', 'Regression issues', 'Poor user experience'],
    UNDOCUMENTED_API: ['Integration difficulties', 'Incorrect API usage', 'Support burden'],
  };

  const base = consequences[riskType] ?? ['Production stability may be affected'];
  if (severity === 'CRITICAL') {
    return ['IMMEDIATE: ' + base[0], ...base.slice(1)];
  }
  return base;
}

function buildContextualAdvice(
  finding: { type: string; filePath?: string; severity: string },
  additionalContext?: string
): string {
  const parts: string[] = [];

  if (finding.filePath?.includes('migration') || finding.filePath?.endsWith('.sql')) {
    parts.push('Ensure you have a tested rollback script ready.');
  }
  if (finding.filePath?.includes('api') || finding.filePath?.includes('controller')) {
    parts.push('Consider implementing API versioning.');
  }
  if (finding.severity === 'CRITICAL') {
    parts.push('Do not deploy until resolved.');
  }
  if (additionalContext) {
    parts.push(additionalContext);
  }

  return parts.join(' ');
}

function buildAvailableTypesMessage(): string {
  const types = Object.entries(RISK_TYPE_KNOWLEDGE)
    .map(([key, info]) => `- **${info.name}** (${key}): ${info.description}`)
    .join('\n');

  return `I can explain these deployment risk types:\n\n${types}`;
}

function buildExplanationMessage(
  explanation: RiskExplanation,
  severityKnowledge?: (typeof SEVERITY_KNOWLEDGE)[keyof typeof SEVERITY_KNOWLEDGE]
): string {
  const parts: string[] = [];

  parts.push(`## ${explanation.name}`);
  parts.push('');
  parts.push(explanation.description);
  parts.push('');

  if (explanation.severity) {
    parts.push(`**Severity:** ${explanation.severity}`);
    if (severityKnowledge) {
      parts.push(`*${severityKnowledge.description}*`);
    }
    parts.push('');
  }

  parts.push('### Why This Matters');
  parts.push(explanation.whyItMatters);
  parts.push('');

  parts.push('### Impact');
  parts.push(explanation.impact);
  parts.push('');

  parts.push('### Potential Consequences');
  explanation.potentialConsequences.forEach((c) => parts.push(`- ${c}`));
  parts.push('');

  if (explanation.commonCauses.length > 0) {
    parts.push('### Common Causes');
    explanation.commonCauses.forEach((c) => parts.push(`- ${c}`));
    parts.push('');
  }

  parts.push('### How to Mitigate');
  explanation.mitigationStrategies.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  parts.push('');

  if (explanation.rollbackProcedure) {
    parts.push('### Rollback Procedure');
    parts.push(explanation.rollbackProcedure);
    parts.push('');
  }

  if (explanation.contextualAdvice) {
    parts.push('### Advice');
    parts.push(explanation.contextualAdvice);
    parts.push('');
  }

  if (explanation.documentationLinks.length > 0) {
    parts.push('### Learn More');
    explanation.documentationLinks.forEach((l) => parts.push(`- ${l}`));
  }

  return parts.join('\n');
}
