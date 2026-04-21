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
      key?: string;
      id?: string;
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

/**
 * Jira Board (Kanban/Scrum)
 */
export interface JiraBoard {
  id: number;
  self: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
  location?: {
    projectId: number;
    projectName: string;
    projectKey: string;
    projectTypeKey: string;
  };
}

/**
 * Jira Board Configuration (columns)
 */
export interface JiraBoardConfig {
  id: number;
  name: string;
  type: string;
  columnConfig: {
    columns: Array<{
      name: string;
      statuses: Array<{
        id: string;
        name?: string;
        self?: string;
      }>;
      min?: number;
      max?: number;
    }>;
  };
  estimation?: {
    type: string;
    field: {
      fieldId: string;
      name: string;
    };
  };
}

/**
 * Board Issue with status information
 */
export interface BoardIssue extends JiraIssue {
  fields: JiraIssue['fields'] & {
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
  };
}
