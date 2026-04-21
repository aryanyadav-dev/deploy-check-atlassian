/**
 * PR Merge Trigger
 *
 * Listens for PR merge events and triggers analysis.
 * Publishes report to Confluence if configured.
 */

import { AnalysisEngine } from '../services/analysis.service';
import { ConfluenceService } from '../services/confluence.service';
import { StorageService, mergeWithDefaults, DEFAULT_CONFIG } from '../services/storage.service';
import type { AnalysisContext, FileChange, RepoConfig } from '@dra/types';
import type { AnalysisResult } from '../types';

/**
 * Bitbucket PR merge event payload structure
 */
export interface PRMergeEvent {
  pullRequest: {
    id: number;
    title: string;
    description?: string;
    source: {
      branch: {
        name: string;
      };
      repository: {
        fullName: string;
        links?: {
          html?: { href: string };
        };
      };
    };
    destination: {
      branch: {
        name: string;
      };
      repository: {
        fullName: string;
        links?: {
          html?: { href: string };
        };
      };
    };
    author: {
      accountId: string;
      displayName: string;
    };
    links?: {
      html?: { href: string };
    };
  };
  repository: {
    fullName: string;
    uuid: string;
    links?: {
      html?: { href: string };
    };
  };
  actor: {
    accountId: string;
    displayName: string;
  };
}

/**
 * Result of the PR merge trigger execution
 */
export interface PRMergeTriggerResult {
  status: 'success' | 'partial' | 'skipped' | 'error';
  message: string;
  analysisResult?: AnalysisResult;
  confluencePageId?: string;
  error?: string;
}

/**
 * Extract project key from repository name
 * Assumes format: workspace/project-name or similar
 */
function extractProjectKey(repositoryFullName: string): string {
  const parts = repositoryFullName.split('/');
  const repoName = parts[parts.length - 1] || repositoryFullName;
  // Convert to uppercase and take first part before any dash
  return repoName.split('-')[0].toUpperCase();
}

/**
 * Build analysis context from PR merge event
 * In a real implementation, this would fetch the actual diff and file changes
 * from the Bitbucket API. For now, we create a minimal context.
 */
async function buildAnalysisContext(
  event: PRMergeEvent,
  config: RepoConfig
): Promise<AnalysisContext> {
  // In production, this would:
  // 1. Fetch the PR diff from Bitbucket API
  // 2. Parse the diff to extract file changes
  // 3. Fetch file contents for changed files
  //
  // For now, we create a context with the PR metadata
  // The actual diff fetching would be done via @forge/api Bitbucket routes

  const files: FileChange[] = [];
  const diff = `PR #${event.pullRequest.id}: ${event.pullRequest.title}\n` +
    `Source: ${event.pullRequest.source.branch.name}\n` +
    `Target: ${event.pullRequest.destination.branch.name}`;

  return {
    files,
    diff,
    repoConfig: config,
  };
}

/**
 * PR Merge Trigger Handler
 *
 * Triggered when a PR is merged in Bitbucket.
 * Runs deployment risk analysis and optionally publishes to Confluence.
 *
 * @param event - The PR merge event from Bitbucket
 * @returns Result of the trigger execution
 */
export const prMergeTrigger = async (event: unknown): Promise<PRMergeTriggerResult> => {
  // Validate event structure
  if (!isValidPRMergeEvent(event)) {
    return {
      status: 'error',
      message: 'Invalid PR merge event structure',
      error: 'Event does not match expected PRMergeEvent structure',
    };
  }

  const prEvent = event as PRMergeEvent;
  const storageService = new StorageService();
  const analysisEngine = new AnalysisEngine();
  const confluenceService = new ConfluenceService(storageService);

  try {
    // Extract project key from repository
    const projectKey = extractProjectKey(prEvent.repository.fullName);

    // Get project configuration
    const storedConfig = await storageService.getConfig(projectKey);
    const config = mergeWithDefaults(storedConfig, DEFAULT_CONFIG);

    // Build repo config for analyzers
    const repoConfig: RepoConfig = {
      coverageThreshold: config.coverageThreshold,
      enabledAnalyzers: config.enabledAnalyzers,
    };

    // Build analysis context
    const analysisContext = await buildAnalysisContext(prEvent, repoConfig);

    // Run analysis
    const analysisResult = await analysisEngine.analyze(analysisContext);

    // Add project key to result
    analysisResult.projectKey = projectKey;

    // Cache the result for later retrieval
    const cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    await storageService.cacheResult(analysisResult.id, analysisResult, cacheTTL);

    // Check if auto-publish to Confluence is enabled
    if (config.autoPublish && config.confluenceSpaceKey) {
      try {
        const publishResult = await confluenceService.publishReport(
          analysisResult.id,
          config.confluenceSpaceKey,
          {
            maxRetries: 3,
            baseDelay: 1000,
            onRetry: (attempt, error, nextDelay) => {
              console.log(
                `Confluence publish retry ${attempt}: ${error.message}. Next attempt in ${nextDelay}ms`
              );
            },
            onFinalFailure: (error, attempts) => {
              console.error(
                `Failed to publish to Confluence after ${attempts} attempts: ${error.message}`
              );
            },
          }
        );

        return {
          status: 'success',
          message: `Analysis complete. Report published to Confluence.`,
          analysisResult,
          confluencePageId: publishResult.pageId,
        };
      } catch (publishError) {
        // Analysis succeeded but publish failed
        const errorMessage =
          publishError instanceof Error ? publishError.message : String(publishError);
        return {
          status: 'partial',
          message: `Analysis complete but Confluence publish failed: ${errorMessage}`,
          analysisResult,
          error: errorMessage,
        };
      }
    }

    // Auto-publish not configured
    return {
      status: 'success',
      message: `Analysis complete. ${analysisResult.findings.length} findings detected.`,
      analysisResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('PR merge trigger error:', errorMessage);

    return {
      status: 'error',
      message: 'Failed to process PR merge event',
      error: errorMessage,
    };
  }
};

/**
 * Type guard to validate PR merge event structure
 */
function isValidPRMergeEvent(event: unknown): event is PRMergeEvent {
  if (!event || typeof event !== 'object') {
    return false;
  }

  const e = event as Record<string, unknown>;

  // Check for required pullRequest structure
  if (!e.pullRequest || typeof e.pullRequest !== 'object') {
    return false;
  }

  const pr = e.pullRequest as Record<string, unknown>;

  // Check for source and destination branches
  if (!pr.source || typeof pr.source !== 'object') {
    return false;
  }
  if (!pr.destination || typeof pr.destination !== 'object') {
    return false;
  }

  const source = pr.source as Record<string, unknown>;
  const destination = pr.destination as Record<string, unknown>;

  // Check for branch info
  if (!source.branch || typeof source.branch !== 'object') {
    return false;
  }
  if (!destination.branch || typeof destination.branch !== 'object') {
    return false;
  }

  const sourceBranch = source.branch as Record<string, unknown>;
  const destBranch = destination.branch as Record<string, unknown>;

  if (typeof sourceBranch.name !== 'string') {
    return false;
  }
  if (typeof destBranch.name !== 'string') {
    return false;
  }

  // Check for repository info
  if (!e.repository || typeof e.repository !== 'object') {
    return false;
  }

  const repo = e.repository as Record<string, unknown>;
  if (typeof repo.fullName !== 'string') {
    return false;
  }

  return true;
}
