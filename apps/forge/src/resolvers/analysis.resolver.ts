/**
 * Analysis Resolver
 *
 * Handles Jira issue panel requests for deployment risk analysis.
 * Fetches linked repository from issue and triggers analysis.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { AnalysisEngine, groupBySeverity, getMaxSeverity } from '../services/analysis.service';
import { StorageService, mergeWithDefaults, DEFAULT_CONFIG } from '../services/storage.service';
import { solutionService } from '../services/solution.service';
import type { AnalysisResult, ProjectConfig } from '../types';
import type { AnalysisContext, Finding, Severity } from '@dra/types';

/**
 * Forge resolver request context types
 */
interface ForgeContext {
  extension?: {
    issue?: { key: string };
    project?: { key: string };
  };
}

interface ResolverRequest<T = unknown> {
  payload?: T;
  context: ForgeContext;
}

const resolver = new Resolver();
const storageService = new StorageService();

/**
 * Response structure for analysis results
 */
interface AnalysisResponse {
  status: 'success' | 'error' | 'no_repository';
  message?: string;
  result?: {
    id: string;
    timestamp: string;
    riskScore: number;
    maxSeverity: Severity | null;
    summary: {
      totalFindings: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
    };
    findingsBySeverity: Record<string, FindingWithSolution[]>;
    solutions: Array<{
      findingId: string;
      title: string;
      description: string;
      urgency: string;
      mitigationSteps: string[];
    }>;
  };
}

/**
 * Finding with solution information for UI display
 */
interface FindingWithSolution {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  solution?: {
    title: string;
    mitigationSteps: string[];
    urgency: string;
  };
}

/**
 * Jira issue development information response
 */
interface DevInfoResponse {
  detail?: Array<{
    repositories?: Array<{
      url?: string;
      name?: string;
    }>;
    pullRequests?: Array<{
      url?: string;
      sourceBranch?: string;
      destinationBranch?: string;
    }>;
  }>;
}

/**
 * Extract repository information from Jira issue
 * Requirement 1.2: Retrieve linked repository information from the issue
 */
async function getLinkedRepository(
  issueKey: string
): Promise<{ repositoryUrl: string; baseRef: string; headRef: string } | null> {
  try {
    // Fetch development information for the issue
    const response = await api.asApp().requestJira(
      route`/rest/dev-status/latest/issue/detail?issueId=${issueKey}&applicationType=GitHub&dataType=repository`,
      { method: 'GET' }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as DevInfoResponse;
    const detail = data.detail?.[0];

    if (!detail) {
      return null;
    }

    // Try to get repository URL from linked repositories
    const repository = detail.repositories?.[0];
    const pullRequest = detail.pullRequests?.[0];

    if (repository?.url) {
      return {
        repositoryUrl: repository.url,
        baseRef: pullRequest?.destinationBranch ?? 'main',
        headRef: pullRequest?.sourceBranch ?? 'HEAD',
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get analysis for a Jira issue
 * Requirement 1.1: Display a deployment risk analysis panel
 */
resolver.define('getAnalysis', async (args: ResolverRequest) => {
  const issueKey = args.context?.extension?.issue?.key;

  if (!issueKey) {
    return {
      status: 'error',
      message: 'No issue context available',
    } as AnalysisResponse;
  }

  // Check for cached analysis result
  const cacheKey = `analysis:${issueKey}`;
  const cachedResult = await storageService.getCachedResult(cacheKey);

  if (cachedResult) {
    return formatAnalysisResponse(cachedResult);
  }

  // No cached result - return status indicating analysis needed
  return {
    status: 'no_repository',
    message: 'No analysis available. Click "Run Analysis" to analyze deployment risks.',
  } as AnalysisResponse;
});

/**
 * Trigger analysis for a Jira issue
 * Requirements: 1.1, 1.2, 1.3
 */
resolver.define(
  'triggerAnalysis',
  async (args: ResolverRequest<{ repositoryUrl?: string; baseRef?: string; headRef?: string }>) => {
    const issueKey = args.context?.extension?.issue?.key;
    const projectKey = args.context?.extension?.project?.key;

    if (!issueKey || !projectKey) {
      return {
        status: 'error',
        message: 'No issue or project context available',
      } as AnalysisResponse;
    }

    // Get repository information
    let repoInfo: { repositoryUrl: string; baseRef: string; headRef: string } | null = null;

    // First try payload (user-provided)
    if (args.payload?.repositoryUrl) {
      repoInfo = {
        repositoryUrl: args.payload.repositoryUrl,
        baseRef: args.payload.baseRef ?? 'main',
        headRef: args.payload.headRef ?? 'HEAD',
      };
    } else {
      // Try to get from linked repository (Requirement 1.2)
      repoInfo = await getLinkedRepository(issueKey);
    }

    // Requirement 1.4: Prompt user if no repository linked
    if (!repoInfo) {
      return {
        status: 'no_repository',
        message: 'No repository linked to this issue. Please provide repository details to run analysis.',
      } as AnalysisResponse;
    }

    // Load project configuration
    const projectConfig = await storageService.getConfig(projectKey);
    const config: ProjectConfig = mergeWithDefaults(projectConfig, DEFAULT_CONFIG);

    // Create analysis context
    // Note: In a real implementation, we would fetch files from the repository
    // using the repoInfo. For now, we create an empty context that can be
    // populated by the analysis engine or external file fetching service.
    const analysisContext: AnalysisContext = {
      files: [],
      diff: '',
      repoConfig: {
        coverageThreshold: config.coverageThreshold,
        enabledAnalyzers: config.enabledAnalyzers,
      },
    };

    try {
      // Run analysis using the analysis engine
      const engine = new AnalysisEngine();
      const result = await engine.analyze(analysisContext);

      // Add project and issue context to result
      result.projectKey = projectKey;
      result.issueKey = issueKey;

      // Cache the result (TTL: 1 hour)
      const cacheKey = `analysis:${issueKey}`;
      await storageService.cacheResult(cacheKey, result, 60 * 60 * 1000);

      // Return formatted response
      return formatAnalysisResponse(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        status: 'error',
        message: `Analysis failed: ${errorMessage}`,
      } as AnalysisResponse;
    }
  }
);

/**
 * Format analysis result for UI display
 * Requirement 1.3: Display findings grouped by severity level
 */
function formatAnalysisResponse(result: AnalysisResult): AnalysisResponse {
  // Group findings by severity (Requirement 1.3)
  const groupedFindings = groupBySeverity(result.findings);
  const maxSeverity = getMaxSeverity(result.findings);

  // Convert grouped findings to response format with solutions
  const findingsBySeverity: Record<string, FindingWithSolution[]> = {};

  for (const [severity, findings] of groupedFindings.entries()) {
    findingsBySeverity[severity] = findings.map((finding) => {
      const solution = solutionService.generateSolution(finding);
      return {
        id: generateFindingId(finding),
        type: finding.type,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        solution: {
          title: solution.title,
          mitigationSteps: solution.mitigationSteps,
          urgency: solution.urgency,
        },
      };
    });
  }

  // Format solutions for response
  const solutions =
    result.solutions?.map((s) => ({
      findingId: s.findingId,
      title: s.title,
      description: s.description,
      urgency: s.urgency,
      mitigationSteps: s.mitigationSteps,
    })) ?? [];

  return {
    status: 'success',
    result: {
      id: result.id,
      timestamp: result.timestamp.toISOString(),
      riskScore: result.riskScore,
      maxSeverity,
      summary: result.summary,
      findingsBySeverity,
      solutions,
    },
  };
}

/**
 * Generate a unique ID for a finding
 */
function generateFindingId(finding: Finding): string {
  const pathPart = finding.filePath?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown';
  const linePart = finding.lineStart ?? 0;
  return `${finding.type}-${pathPart}-${linePart}`;
}

export const analysisResolver = resolver.getDefinitions();
