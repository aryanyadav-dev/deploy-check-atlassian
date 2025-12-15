/**
 * Jira integration types for CLI
 */

export interface JiraCredentials {
  /**
   * Jira instance URL (e.g., https://your-domain.atlassian.net)
   */
  instanceUrl: string;

  /**
   * User email for authentication
   */
  email: string;

  /**
   * API token (encrypted when stored)
   */
  apiToken: string;
}

export interface JiraUserProfile {
  accountId: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    updated: string;
    created: string;
    priority?: {
      name: string;
    };
  };
}

export interface JiraCreateIssueRequest {
  fields: {
    project: {
      key: string;
    };
    summary: string;
    description: {
      type: 'doc';
      version: 1;
      content: Array<{
        type: string;
        content?: Array<{
          type: string;
          text?: string;
        }>;
      }>;
    };
    issuetype: {
      name: string;
    };
    labels?: string[];
  };
}

export interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

export interface StoredJiraCredentials {
  instanceUrl: string;
  email: string;
  encryptedToken: string;
}

export interface AnalysisCache {
  /**
   * Timestamp of the analysis
   */
  timestamp: string;

  /**
   * Git commit hash or ref
   */
  commitRef?: string;

  /**
   * Findings from the analysis
   */
  findings: CachedFinding[];

  /**
   * Risk score
   */
  riskScore?: number;

  /**
   * Risk level
   */
  riskLevel?: string;
}

export interface CachedFinding {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  jiraIssueKey?: string;
}
