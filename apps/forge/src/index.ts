/**
 * Forge App Entry Point
 *
 * Main entry point for the Deployment Risk Analyzer Forge application.
 * Exports all resolvers, triggers, and agent action handlers that are
 * registered in the manifest.yml.
 */

// =============================================================================
// UI Resolvers
// =============================================================================

export { analysisResolver } from './resolvers/analysis.resolver';
export { configResolver } from './resolvers/config.resolver';
export { reportResolver } from './resolvers/report.resolver';

// =============================================================================
// Rovo Agent Actions
// =============================================================================

export { analyzeDeploymentAction } from './agent/actions/analyze.action';
export { explainRiskAction } from './agent/actions/explain-risk.action';
export { getSolutionsAction } from './agent/actions/get-solutions.action';
export { suggestFixAction } from './agent/actions/suggest-fix.action';
export { createIssueAction } from './agent/actions/create-issue.action';
export { publishReportAction } from './agent/actions/publish-report.action';

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

// Utilities - for serialization and retry logic
export { serialize, deserialize } from './utils/serialization';
export { withRetry } from './utils/retry';
