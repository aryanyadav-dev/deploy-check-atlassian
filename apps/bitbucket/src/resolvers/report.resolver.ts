/**
 * Report Resolver
 *
 * Handles Confluence content action requests for report generation and publishing.
 * Generates and publishes reports with solutions.
 */

import Resolver from '@forge/resolver';
import { ConfluenceService, type ADFDocument } from '../services/confluence.service';
import { StorageService, mergeWithDefaults, DEFAULT_CONFIG } from '../services/storage.service';
import { AnalysisEngine } from '../services/analysis.service';
import type { AnalysisResult } from '../types';
import type { AnalysisContext, Finding } from '@dra/types';

const resolver = new Resolver();
const confluenceService = new ConfluenceService();
const storageService = new StorageService();

/**
 * Forge resolver request context types
 */
interface ForgeContext {
  extension?: {
    space?: { key: string };
    content?: { id: string };
  };
}

interface ResolverRequest<T = unknown> {
  payload?: T;
  context: ForgeContext;
}

/**
 * Response structure for report operations
 */
interface ReportResponse {
  status: 'success' | 'error' | 'no_analysis';
  message?: string;
  report?: {
    id: string;
    content: ADFDocument;
    timestamp: string;
    findingsCount: number;
    riskScore: number;
  };
  pageId?: string;
  pageUrl?: string;
}

/**
 * Generate a deployment risk report
 * Requirement 3.1: Generate a deployment risk report
 */
resolver.define(
  'generateReport',
  async (args: ResolverRequest<{
    resultId?: string;
    repositoryUrl?: string;
    baseRef?: string;
    headRef?: string;
  }>) => {
    const payload = args.payload;

    // Try to get analysis result from cache or run new analysis
    let result: AnalysisResult | null = null;

    if (payload?.resultId) {
      // Get cached result by ID
      result = await storageService.getCachedResult(payload.resultId);
    }

    if (!result && payload?.repositoryUrl) {
      // Run new analysis
      // Note: In a real implementation, we would fetch files from the repository
      // using the repositoryUrl. For now, we create an empty context.
      const analysisContext: AnalysisContext = {
        files: [],
        diff: '',
        repoConfig: {
          coverageThreshold: DEFAULT_CONFIG.coverageThreshold,
          enabledAnalyzers: DEFAULT_CONFIG.enabledAnalyzers,
        },
      };

      try {
        const engine = new AnalysisEngine();
        result = await engine.analyze(analysisContext);

        // Cache the result
        const cacheKey = `report:${result.id}`;
        await storageService.cacheResult(cacheKey, result, 60 * 60 * 1000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          status: 'error',
          message: `Analysis failed: ${errorMessage}`,
        } as ReportResponse;
      }
    }

    if (!result) {
      return {
        status: 'no_analysis',
        message: 'No analysis result available. Please provide a result ID or repository details.',
      } as ReportResponse;
    }

    // Generate ADF report content
    const adfContent = confluenceService.formatToADF(result.findings, result.solutions);

    return {
      status: 'success',
      report: {
        id: result.id,
        content: adfContent,
        timestamp: result.timestamp.toISOString(),
        findingsCount: result.findings.length,
        riskScore: result.riskScore,
      },
    } as ReportResponse;
  }
);

/**
 * Publish a deployment risk report to Confluence
 * Requirement 3.3: Create or update pages in the configured space
 */
resolver.define(
  'publishReport',
  async (args: ResolverRequest<{
    resultId: string;
    spaceKey?: string;
    projectKey?: string;
  }>) => {
    const payload = args.payload;
    const contextSpaceKey = args.context?.extension?.space?.key;

    if (!payload?.resultId) {
      return {
        status: 'error',
        message: 'Result ID is required to publish a report',
      } as ReportResponse;
    }

    // Determine space key - use payload, then context, then project config
    let spaceKey = payload.spaceKey ?? contextSpaceKey;

    if (!spaceKey && payload.projectKey) {
      const projectConfig = await storageService.getConfig(payload.projectKey);
      const config = mergeWithDefaults(projectConfig, DEFAULT_CONFIG);
      spaceKey = config.confluenceSpaceKey;
    }

    if (!spaceKey) {
      return {
        status: 'error',
        message: 'Confluence space key is required. Configure it in project settings or provide it in the request.',
      } as ReportResponse;
    }

    try {
      // Publish the report with retry mechanism (Requirement 3.4)
      const publishResult = await confluenceService.publishReport(payload.resultId, spaceKey, {
        maxRetries: 3,
        baseDelay: 1000,
        onRetry: (attempt, error, nextDelay) => {
          console.log(`Publish attempt ${attempt} failed: ${error.message}. Retrying in ${nextDelay}ms`);
        },
        onFinalFailure: (error, attempts) => {
          console.error(`Publishing failed after ${attempts} attempts: ${error.message}`);
        },
      });

      return {
        status: 'success',
        message: 'Report published successfully',
        pageId: publishResult.pageId,
      } as ReportResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        status: 'error',
        message: `Failed to publish report: ${errorMessage}`,
      } as ReportResponse;
    }
  }
);

/**
 * Preview report content without publishing
 */
resolver.define(
  'previewReport',
  async (args: ResolverRequest<{ findings: Finding[] }>) => {
    const findings = args.payload?.findings;

    if (!findings || !Array.isArray(findings)) {
      return {
        status: 'error',
        message: 'Findings array is required for preview',
      } as ReportResponse;
    }

    // Generate ADF content for preview
    const adfContent = confluenceService.formatToADF(findings);

    return {
      status: 'success',
      report: {
        id: 'preview',
        content: adfContent,
        timestamp: new Date().toISOString(),
        findingsCount: findings.length,
        riskScore: 0,
      },
    } as ReportResponse;
  }
);

export const reportResolver = resolver.getDefinitions();
