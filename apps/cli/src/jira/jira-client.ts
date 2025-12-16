import {
  JiraCredentials,
  JiraUserProfile,
  JiraIssue,
  JiraCreateIssueRequest,
  JiraCreateIssueResponse,
} from './types';

/**
 * Jira REST API client for CLI integration
 */
export class JiraClient {
  private credentials: JiraCredentials;

  constructor(credentials: JiraCredentials) {
    this.credentials = credentials;
  }

  /**
   * Get base URL for API requests
   */
  private getBaseUrl(): string {
    const url = this.credentials.instanceUrl.replace(/\/$/, '');
    return `${url}/rest/api/3`;
  }

  /**
   * Get authorization header for API requests
   */
  private getAuthHeader(): string {
    const auth = Buffer.from(
      `${this.credentials.email}:${this.credentials.apiToken}`
    ).toString('base64');
    return `Basic ${auth}`;
  }

  /**
   * Make an authenticated request to Jira API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `Jira API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.errorMessages?.length > 0) {
          errorMessage = errorJson.errorMessages.join(', ');
        } else if (errorJson.errors) {
          errorMessage = Object.values(errorJson.errors).join(', ');
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Validate credentials by fetching the current user profile
   */
  async validateCredentials(): Promise<JiraUserProfile> {
    return this.request<JiraUserProfile>('/myself');
  }

  /**
   * Get an issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(
      `/issue/${issueKey}?fields=summary,description,status,assignee,updated,created,priority`
    );
  }

  /**
   * Get project by key to validate it exists
   */
  async getProject(projectKey: string): Promise<{ id: string; key: string; name: string }> {
    return this.request<{ id: string; key: string; name: string }>(`/project/${projectKey}`);
  }

  /**
   * Create a new issue
   */
  async createIssue(
    request: JiraCreateIssueRequest
  ): Promise<JiraCreateIssueResponse> {
    return this.request<JiraCreateIssueResponse>('/issue', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get multiple issues by keys using the new /search/jql API
   */
  async getIssues(issueKeys: string[]): Promise<JiraIssue[]> {
    if (issueKeys.length === 0) {
      return [];
    }

    const jql = `key in (${issueKeys.map((k) => `"${k}"`).join(',')})`;
    const response = await this.request<{ issues: JiraIssue[] }>(
      '/search/jql',
      {
        method: 'POST',
        body: JSON.stringify({
          jql,
          fields: ['summary', 'description', 'status', 'assignee', 'updated', 'created', 'priority'],
        }),
      }
    );

    return response.issues;
  }
}
