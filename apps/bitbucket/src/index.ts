/**
 * Forge App Entry Point
 *
 * Main entry point for the Deployment Risk Analyzer Forge application.
 * Exports all resolvers, triggers, and Bitbucket API operation handlers.
 */

// =============================================================================
// UI Resolvers
// =============================================================================

export { analysisResolver } from './resolvers/analysis.resolver';
export { configResolver } from './resolvers/config.resolver';
export { reportResolver } from './resolvers/report.resolver';

// =============================================================================
// Bitbucket API Operations
// =============================================================================

export {
  listRepositoriesAction,
  getRepositoryAction,
  listBranchesAction,
  listCommitsAction,
  browseSourceAction,
} from './bitbucket/repositories';

export {
  listPullRequestsAction,
  getPullRequestAction,
  getPullRequestDiffAction,
  getPullRequestCommentsAction,
  createPullRequestAction,
  approvePullRequestAction,
  mergePullRequestAction,
} from './bitbucket/pull-requests';

export {
  listPipelinesAction,
  getPipelineAction,
  getPipelineStepsAction,
  getStepLogsAction,
  triggerPipelineAction,
} from './bitbucket/pipelines';

export {
  listIssuesAction,
  getIssueAction,
  createIssueAction,
} from './bitbucket/issues';

// =============================================================================
// Event Triggers
// =============================================================================

export { prMergeTrigger } from './triggers/pr-merge.trigger';

// =============================================================================
// Re-exports for convenience (not registered in manifest)
// =============================================================================

// Services - for use by resolvers and actions
export {
  StorageService,
  AnalysisEngine,
  ConfluenceService,
  solutionService,
  jiraService,
} from './services';

// Types - for type checking
export type {
  AnalysisResult,
  ProjectConfig,
  Solution,
  CodeFix,
  StoredAnalysisResult,
  SerializedFinding,
} from './types';

// Bitbucket Types
export type {
  BitbucketRepository,
  BitbucketBranch,
  BitbucketCommit,
  BitbucketPullRequest,
  BitbucketPipeline,
  BitbucketIssue,
} from './bitbucket/types';

// Bitbucket Client
export { bitbucketClient, BitbucketClient } from './bitbucket/client';

// Utilities - for serialization and retry logic
export { serialize, deserialize } from './utils/serialization';
export { withRetry } from './utils/retry';
