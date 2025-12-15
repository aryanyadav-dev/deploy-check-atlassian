/**
 * CLI Configuration Types
 * Supports .deploy-check.json or .deploy-check.yaml config files
 */

export interface DeployCheckConfig {
  /**
   * Coverage threshold percentage (0-100)
   * Files below this threshold will generate LOW_COVERAGE findings
   * @default 40
   */
  coverageThreshold?: number;

  /**
   * Glob patterns for paths to ignore during analysis
   */
  ignoredPaths?: string[];

  /**
   * Default output format for reports
   * @default 'terminal'
   */
  outputFormat?: 'terminal' | 'json' | 'markdown';

  /**
   * Path to lcov coverage report
   */
  coveragePath?: string;

  /**
   * Path to OpenAPI specification file
   */
  openapiPath?: string;

  /**
   * Default base reference for git diff
   * @default 'main'
   */
  baseRef?: string;

  /**
   * Severity level that causes non-zero exit code
   * @default 'high'
   */
  failOn?: 'low' | 'medium' | 'high' | 'critical';

  /**
   * Jira integration settings
   */
  jira?: JiraConfig;

  /**
   * Confluence integration settings
   */
  confluence?: ConfluenceConfig;
}

export interface JiraConfig {
  /**
   * Jira instance URL
   */
  instanceUrl?: string;

  /**
   * Default project key for issue creation
   */
  projectKey?: string;

  /**
   * Auto-create issues for findings at or above this severity
   */
  autoCreateSeverity?: 'high' | 'critical';
}

export interface ConfluenceConfig {
  /**
   * Confluence instance URL
   */
  instanceUrl?: string;

  /**
   * Default space key for publishing
   */
  spaceKey?: string;

  /**
   * Parent page ID for nesting reports
   */
  parentPageId?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Pick<DeployCheckConfig, 'coverageThreshold' | 'outputFormat' | 'baseRef' | 'failOn'>> = {
  coverageThreshold: 40,
  outputFormat: 'terminal',
  baseRef: 'main',
  failOn: 'high',
};
