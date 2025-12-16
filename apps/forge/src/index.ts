/**
 * Forge App Entry Point
 *
 * Main entry point for the Deployment Risk Analyzer Forge application.
 * Exports all resolvers, triggers, and agent action handlers that are
 * registered in the manifest.yml.
 *
 * Requirements: All - This file wires up all Forge app entry points
 *
 * Module Registration:
 * - jira:issuePanel -> analysisResolver (Requirements: 1.1, 1.2, 1.3)
 * - jira:projectSettingsPage -> configResolver (Requirements: 4.1, 4.2, 4.3)
 * - confluence:contentAction -> reportResolver (Requirements: 3.1, 3.3)
 * - rovo:agent -> agent actions (Requirements: 2.1, 2.2, 2.3)
 * - trigger -> prMergeTrigger (Requirements: 3.1)
 */

// =============================================================================
// UI Resolvers
// =============================================================================

/**
 * Analysis Resolver - Handles Jira issue panel requests
 * Displays deployment risk analysis for linked PRs and branches
 * Requirements: 1.1, 1.2, 1.3
 */
export { analysisResolver } from './resolvers/analysis.resolver';

/**
 * Config Resolver - Handles project settings panel requests
 * Manages deployment risk configuration per project
 * Requirements: 4.1, 4.2, 4.3
 */
export { configResolver } from './resolvers/config.resolver';

/**
 * Report Resolver - Handles Confluence content action requests
 * Generates and publishes deployment risk reports
 * Requirements: 3.1, 3.3
 */
export { reportResolver } from './resolvers/report.resolver';

// =============================================================================
// Rovo Agent Actions
// =============================================================================

/**
 * Analyze Deployment Action - Runs deployment risk analysis
 * Invokes analysis engine and returns summarized results with solutions
 * Requirements: 2.3
 */
export { analyzeDeploymentAction } from './agent/actions/analyze.action';

/**
 * Explain Risk Action - Provides risk explanations
 * Context-aware explanations with mitigation recommendations
 * Requirements: 2.2
 */
export { explainRiskAction } from './agent/actions/explain-risk.action';

/**
 * Get Solutions Action - Returns detailed solutions
 * Includes mitigation steps, code fixes, and rollback procedures
 * Requirements: 2.2
 */
export { getSolutionsAction } from './agent/actions/get-solutions.action';

/**
 * Suggest Fix Action - Generates code fix suggestions
 * Provides before/after code snippets and test suggestions
 * Requirements: 2.2
 */
export { suggestFixAction } from './agent/actions/suggest-fix.action';

/**
 * Create Issue Action - Creates Jira issues from findings
 * Includes solution recommendations in issue description
 * Requirements: 5.1, 5.2, 5.3
 */
export { createIssueAction } from './agent/actions/create-issue.action';

/**
 * Publish Report Action - Publishes reports to Confluence
 * Includes solutions section and retry mechanism
 * Requirements: 3.3, 3.4
 */
export { publishReportAction } from './agent/actions/publish-report.action';

// =============================================================================
// Event Triggers
// =============================================================================

/**
 * PR Merge Trigger - Handles PR merge events
 * Triggers analysis and optionally publishes to Confluence
 * Requirements: 3.1
 */
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
