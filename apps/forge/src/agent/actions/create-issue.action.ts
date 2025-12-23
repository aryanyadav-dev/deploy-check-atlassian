/**
 * Create Issue Action
 *
 * Rovo agent action handler for Jira issue creation.
 * Uses JiraService to create issues with solution recommendations.
 */

import type { Finding } from '@dra/types';
import { jiraService } from '../../services/jira.service';
import { StorageService } from '../../services/storage.service';
import { solutionService } from '../../services/solution.service';

/**
 * Input payload for create issue action
 */
export interface CreateIssueInput {
  /** Finding ID from analysis result */
  findingId?: string;
  /** Analysis result ID */
  resultId?: string;
  /** Jira project key */
  projectKey: string;
  /** Optional PR or commit link */
  prLink?: string;
  /** Optional custom summary override */
  customSummary?: string;
  /** Optional additional description */
  additionalContext?: string;
}

/**
 * Agent context provided by Rovo
 */
export interface AgentActionContext {
  accountId: string;
  conversationId?: string;
  issueKey?: string;
}

/**
 * Create issue response
 */
export interface CreateIssueResponse {
  status: 'success' | 'error' | 'not_found' | 'permission_denied';
  issueKey?: string;
  issueUrl?: string;
  message: string;
}

const storageService = new StorageService();

/**
 * Create issue action handler
 *
 * Creates a Jira issue from a finding with solution recommendations included.
 */
export const createIssueAction = async (args: {
  payload: CreateIssueInput;
  context: AgentActionContext;
}): Promise<CreateIssueResponse> => {
  const { payload } = args;

  // Validate required inputs
  if (!payload.projectKey) {
    return {
      status: 'error',
      message: 'Project key is required to create a Jira issue.',
    };
  }

  if (!payload.findingId && !payload.resultId) {
    return {
      status: 'error',
      message: 'Please provide a findingId and resultId to create an issue from a specific finding.',
    };
  }

  try {
    // Get the finding from cached result
    const finding = await getFinding(payload.resultId!, payload.findingId!);

    if (!finding) {
      return {
        status: 'not_found',
        message: `Finding ${payload.findingId} not found in analysis result ${payload.resultId}. The result may have expired.`,
      };
    }

    // Create the issue using JiraService
    const result = await jiraService.createIssueFromFinding(
      finding,
      payload.projectKey,
      payload.prLink
    );

    // Build success message
    const issueUrl = buildIssueUrl(result.issueKey);

    return {
      status: 'success',
      issueKey: result.issueKey,
      issueUrl,
      message: buildSuccessMessage(result.issueKey, finding, issueUrl),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('403')) {
      return {
        status: 'permission_denied',
        message: `Unable to create issue: You don't have permission to create issues in project ${payload.projectKey}. Please check your Jira permissions.`,
      };
    }

    return {
      status: 'error',
      message: `Failed to create Jira issue: ${errorMessage}`,
    };
  }
};

/**
 * Get a finding from cached analysis result
 */
async function getFinding(resultId: string, findingId: string): Promise<Finding | null> {
  const result = await storageService.getCachedResult(resultId);

  if (!result) {
    return null;
  }

  // Find by generated ID pattern
  const finding = result.findings.find(
    (f) =>
      `${f.type}-${f.filePath?.replace(/[^a-zA-Z0-9]/g, '-')}-${f.lineStart ?? 0}` === findingId ||
      `${f.type}-${f.lineStart ?? 0}` === findingId
  );

  return finding ?? null;
}

/**
 * Build Jira issue URL
 */
function buildIssueUrl(issueKey: string): string {
  // In Forge context, we can construct the URL based on the site
  // The actual base URL would come from the Forge context in production
  return `/browse/${issueKey}`;
}

/**
 * Build success message with issue details
 */
function buildSuccessMessage(issueKey: string, finding: Finding, issueUrl: string): string {
  const solution = solutionService.generateSolution(finding);

  const parts: string[] = [];

  parts.push(`Created Jira issue **${issueKey}** for the ${finding.type} finding.`);
  parts.push('');
  parts.push(`**Severity:** ${finding.severity}`);
  parts.push(`**Location:** ${finding.filePath ?? 'Unknown'}${finding.lineStart ? `:${finding.lineStart}` : ''}`);
  parts.push('');
  parts.push('The issue includes:');
  parts.push('- Full finding details and description');
  parts.push('- Solution recommendations and mitigation steps');
  if (solution.codeFix) {
    parts.push('- Suggested code fix');
  }
  if (solution.rollbackProcedure) {
    parts.push('- Rollback procedure');
  }
  parts.push('');
  parts.push(`[View Issue](${issueUrl})`);

  return parts.join('\n');
}

/**
 * Create multiple issues from an analysis result
 * Utility function for batch issue creation
 */
export async function createIssuesForCriticalFindings(
  resultId: string,
  projectKey: string,
  prLink?: string
): Promise<Array<{ findingType: string; issueKey?: string; error?: string }>> {
  const result = await storageService.getCachedResult(resultId);

  if (!result) {
    return [{ findingType: 'unknown', error: 'Analysis result not found' }];
  }

  // Filter for critical and high severity findings
  const criticalFindings = result.findings.filter(
    (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
  );

  const results: Array<{ findingType: string; issueKey?: string; error?: string }> = [];

  for (const finding of criticalFindings) {
    try {
      const issueResult = await jiraService.createIssueFromFinding(finding, projectKey, prLink);
      results.push({
        findingType: finding.type,
        issueKey: issueResult.issueKey,
      });
    } catch (error) {
      results.push({
        findingType: finding.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
