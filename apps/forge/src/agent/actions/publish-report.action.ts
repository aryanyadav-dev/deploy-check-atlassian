/**
 * Publish Report Action
 *
 * Rovo agent action handler for Confluence publishing.
 * Uses ConfluenceService to publish reports with solutions section.
 */

import { ConfluenceService } from '../../services/confluence.service';
import { StorageService } from '../../services/storage.service';

/**
 * Input payload for publish report action
 */
export interface PublishReportInput {
  /** Analysis result ID to publish */
  resultId: string;
  /** Confluence space key */
  spaceKey: string;
  /** Optional custom page title */
  customTitle?: string;
  /** Optional parent page ID */
  parentPageId?: string;
}

/**
 * Agent context provided by Rovo
 */
export interface AgentActionContext {
  accountId: string;
  conversationId?: string;
  spaceKey?: string;
}

/**
 * Publish report response
 */
export interface PublishReportResponse {
  status: 'success' | 'error' | 'not_found' | 'permission_denied';
  pageId?: string;
  pageUrl?: string;
  message: string;
}

const storageService = new StorageService();
const confluenceService = new ConfluenceService(storageService);

/**
 * Publish report action handler
 *
 * Publishes a deployment risk report to Confluence with solutions section.
 */
export const publishReportAction = async (args: {
  payload: PublishReportInput;
  context: AgentActionContext;
}): Promise<PublishReportResponse> => {
  const { payload, context } = args;

  // Validate required inputs
  if (!payload.resultId) {
    return {
      status: 'error',
      message: 'Result ID is required to publish a report.',
    };
  }

  // Use provided space key or fall back to context
  const spaceKey = payload.spaceKey || context.spaceKey;

  if (!spaceKey) {
    return {
      status: 'error',
      message: 'Confluence space key is required. Please provide a spaceKey.',
    };
  }

  try {
    // Verify the analysis result exists
    const result = await storageService.getCachedResult(payload.resultId);

    if (!result) {
      return {
        status: 'not_found',
        message: `Analysis result ${payload.resultId} not found or has expired. Please run a new analysis first.`,
      };
    }

    // Track retry attempts for user feedback
    let retryCount = 0;
    const onRetry = (attempt: number, error: Error, nextDelay: number) => {
      retryCount = attempt;
      console.log(`Publish attempt ${attempt} failed: ${error.message}. Retrying in ${nextDelay}ms...`);
    };

    // Publish the report
    const publishResult = await confluenceService.publishReport(payload.resultId, spaceKey, {
      maxRetries: 3,
      baseDelay: 1000,
      onRetry,
      onFinalFailure: (error, attempts) => {
        console.error(`Publishing failed after ${attempts} attempts: ${error.message}`);
      },
    });

    // Build success message
    const pageUrl = buildPageUrl(spaceKey, publishResult.pageId);

    return {
      status: 'success',
      pageId: publishResult.pageId,
      pageUrl,
      message: buildSuccessMessage(result, publishResult.pageId, pageUrl, retryCount),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('403')) {
      return {
        status: 'permission_denied',
        message: `Unable to publish report: You don't have permission to create or update pages in space ${spaceKey}. Please check your Confluence permissions.`,
      };
    }

    // Check for space not found
    if (errorMessage.includes('space') || errorMessage.includes('404')) {
      return {
        status: 'error',
        message: `Confluence space ${spaceKey} not found. Please verify the space key is correct.`,
      };
    }

    return {
      status: 'error',
      message: `Failed to publish report: ${errorMessage}`,
    };
  }
};

/**
 * Build Confluence page URL
 */
function buildPageUrl(spaceKey: string, pageId: string): string {
  // In Forge context, we construct the URL based on the site
  // The actual base URL would come from the Forge context in production
  return `/wiki/spaces/${spaceKey}/pages/${pageId}`;
}

/**
 * Build success message with report details
 */
function buildSuccessMessage(
  result: { findings: unknown[]; riskScore: number; solutions?: unknown[] },
  _pageId: string,
  pageUrl: string,
  retryCount: number
): string {
  const parts: string[] = [];

  parts.push(`Published deployment risk report to Confluence.`);
  parts.push('');
  parts.push('**Report Summary:**');
  parts.push(`- Total Findings: ${result.findings.length}`);
  parts.push(`- Risk Score: ${result.riskScore}`);
  if (result.solutions) {
    parts.push(`- Solutions Included: ${result.solutions.length}`);
  }
  parts.push('');

  if (retryCount > 0) {
    parts.push(`*Note: Publishing succeeded after ${retryCount} retry attempt(s).*`);
    parts.push('');
  }

  parts.push('The report includes:');
  parts.push('- Executive summary with risk metrics');
  parts.push('- Findings grouped by severity');
  parts.push('- Detailed solution recommendations');
  parts.push('- Code fix suggestions where applicable');
  parts.push('- Rollback procedures for critical changes');
  parts.push('');
  parts.push(`[View Report](${pageUrl})`);

  return parts.join('\n');
}

/**
 * Publish reports for multiple analysis results
 * Utility function for batch publishing
 */
export async function publishMultipleReports(
  resultIds: string[],
  spaceKey: string
): Promise<Array<{ resultId: string; pageId?: string; error?: string }>> {
  const results: Array<{ resultId: string; pageId?: string; error?: string }> = [];

  for (const resultId of resultIds) {
    try {
      const publishResult = await confluenceService.publishReport(resultId, spaceKey);
      results.push({
        resultId,
        pageId: publishResult.pageId,
      });
    } catch (error) {
      results.push({
        resultId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
