/**
 * Analyze Deployment Action
 *
 * Rovo agent action handler for analysis requests.
 * Invokes AnalysisEngine with provided context and returns summarized results with solutions.
 */

import type { AnalysisContext } from '@dra/types';
import { analysisEngine, groupBySeverity, getMaxSeverity } from '../../services/analysis.service';
import { StorageService } from '../../services/storage.service';
import type { AnalysisResult } from '../../types';

/**
 * Input payload for analyze deployment action
 */
export interface AnalyzeDeploymentInput {
  /** Repository URL to analyze */
  repositoryUrl: string;
  /** Base branch/ref for comparison */
  baseRef: string;
  /** Head branch/ref to analyze */
  headRef: string;
  /** Optional Jira project key */
  projectKey?: string;
  /** Optional Jira issue key */
  issueKey?: string;
}

/**
 * Agent context provided by Rovo
 */
export interface AgentActionContext {
  /** Account ID of the user invoking the action */
  accountId: string;
  /** Conversation ID for the agent session */
  conversationId?: string;
}

/**
 * Summarized finding for agent response
 */
interface SummarizedFinding {
  type: string;
  severity: string;
  title: string;
  filePath?: string;
  lineNumber?: number;
  solutionTitle?: string;
  urgency?: string;
}

/**
 * Response from analyze deployment action
 */
export interface AnalyzeDeploymentResponse {
  status: 'success' | 'error' | 'partial';
  resultId: string;
  summary: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    maxSeverity: string | null;
    riskScore: number;
  };
  findings: SummarizedFinding[];
  solutions: Array<{
    title: string;
    urgency: string;
    findingType: string;
  }>;
  errors?: string[];
  message: string;
}

// Storage service for caching results
const storageService = new StorageService();

// Cache TTL: 1 hour
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Analyze deployment action handler
 *
 * Invokes the AnalysisEngine with the provided context and returns
 * summarized results with solutions for the Rovo agent to present.
 */
export const analyzeDeploymentAction = async (args: {
  payload: AnalyzeDeploymentInput;
  context: AgentActionContext;
}): Promise<AnalyzeDeploymentResponse> => {
  const { payload } = args;

  // Validate required inputs
  if (!payload.repositoryUrl || !payload.baseRef || !payload.headRef) {
    return {
      status: 'error',
      resultId: '',
      summary: {
        totalFindings: 0,
        bySeverity: {},
        maxSeverity: null,
        riskScore: 0,
      },
      findings: [],
      solutions: [],
      message: 'Missing required parameters: repositoryUrl, baseRef, and headRef are required',
    };
  }

  try {
    // Build analysis context
    // Note: In production, we would fetch files and diff from the repository
    // using the repositoryUrl, baseRef, and headRef
    const analysisContext: AnalysisContext = {
      files: [],
      diff: '',
      repoConfig: {
        coverageThreshold: 80,
        enabledAnalyzers: ['coverage', 'openapi', 'permission', 'sql-migration', 'typescript'],
      },
    };

    // Run analysis
    const result = await analysisEngine.analyze(analysisContext);

    // Cache the result for later retrieval
    await storageService.cacheResult(result.id, result, CACHE_TTL);

    // Get any analyzer errors
    const errors = analysisEngine.getErrors();

    // Build summarized response
    const response = buildResponse(result, errors);

    // Add context info to message
    response.message = buildSummaryMessage(result, payload, errors.length > 0);

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      resultId: '',
      summary: {
        totalFindings: 0,
        bySeverity: {},
        maxSeverity: null,
        riskScore: 0,
      },
      findings: [],
      solutions: [],
      message: `Analysis failed: ${errorMessage}`,
      errors: [errorMessage],
    };
  }
};

/**
 * Build the response object from analysis result
 */
function buildResponse(
  result: AnalysisResult,
  errors: Array<{ analyzerName: string; error: string }>
): AnalyzeDeploymentResponse {
  const maxSeverity = getMaxSeverity(result.findings);
  const groupedFindings = groupBySeverity(result.findings);

  // Summarize findings for agent response
  const summarizedFindings: SummarizedFinding[] = result.findings.map((finding) => {
    const solution = result.solutions?.find(
      (s) => s.findingType === finding.type && s.severity === finding.severity
    );
    return {
      type: finding.type,
      severity: finding.severity,
      title: finding.title,
      filePath: finding.filePath,
      lineNumber: finding.lineStart,
      solutionTitle: solution?.title,
      urgency: solution?.urgency,
    };
  });

  // Summarize solutions
  const summarizedSolutions = (result.solutions ?? []).map((solution) => ({
    title: solution.title,
    urgency: solution.urgency,
    findingType: solution.findingType,
  }));

  // Build severity counts
  const bySeverity: Record<string, number> = {};
  for (const [severity, findings] of groupedFindings) {
    bySeverity[severity] = findings.length;
  }

  return {
    status: errors.length > 0 ? 'partial' : 'success',
    resultId: result.id,
    summary: {
      totalFindings: result.findings.length,
      bySeverity,
      maxSeverity,
      riskScore: result.riskScore,
    },
    findings: summarizedFindings,
    solutions: summarizedSolutions,
    errors: errors.length > 0 ? errors.map((e) => `${e.analyzerName}: ${e.error}`) : undefined,
    message: '',
  };
}

/**
 * Build a human-readable summary message
 */
function buildSummaryMessage(
  result: AnalysisResult,
  input: AnalyzeDeploymentInput,
  hasErrors: boolean
): string {
  const { findings, riskScore } = result;
  const maxSeverity = getMaxSeverity(findings);

  if (findings.length === 0) {
    return `Analysis complete for ${input.headRef}. No deployment risks detected. Safe to proceed with deployment.`;
  }

  const severityCounts = result.summary.bySeverity;
  const parts: string[] = [];

  if (severityCounts['CRITICAL']) {
    parts.push(`${severityCounts['CRITICAL']} critical`);
  }
  if (severityCounts['HIGH']) {
    parts.push(`${severityCounts['HIGH']} high`);
  }
  if (severityCounts['MEDIUM']) {
    parts.push(`${severityCounts['MEDIUM']} medium`);
  }
  if (severityCounts['LOW']) {
    parts.push(`${severityCounts['LOW']} low`);
  }

  const findingsSummary = parts.join(', ');
  const riskLevel = getRiskLevel(riskScore);

  let message = `Analysis complete for ${input.headRef}. Found ${findings.length} deployment risk(s): ${findingsSummary}. Overall risk level: ${riskLevel}.`;

  if (maxSeverity === 'CRITICAL' || maxSeverity === 'HIGH') {
    message += ' Recommend addressing high-severity issues before deployment.';
  }

  if (hasErrors) {
    message += ' Note: Some analyzers encountered errors. Results may be incomplete.';
  }

  return message;
}

/**
 * Get human-readable risk level from score
 */
function getRiskLevel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Minimal';
}
