import {
  JiraCredentials,
  JiraUserProfile,
  JiraIssue,
  JiraCreateIssueRequest,
  JiraCreateIssueResponse,
  JiraBoard,
  JiraBoardConfig,
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

  /**
   * Get Agile API base URL for board operations
   */
  private getAgileBaseUrl(): string {
    const url = this.credentials.instanceUrl.replace(/\/$/, '');
    return `${url}/rest/agile/1.0`;
  }

  /**
   * Make an authenticated request to Jira Agile API
   */
  private async agileRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.getAgileBaseUrl()}${endpoint}`;

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
      let errorMessage = `Jira Agile API error: ${response.status} ${response.statusText}`;
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
   * Get all boards accessible to the user
   */
  async getBoards(projectKeyOrId?: string): Promise<JiraBoard[]> {
    const params = new URLSearchParams();
    if (projectKeyOrId) {
      params.append('projectKeyOrId', projectKeyOrId);
    }
    params.append('maxResults', '100');

    const response = await this.agileRequest<{ values: JiraBoard[] }>(
      `/board?${params.toString()}`
    );
    return response.values;
  }

  /**
   * Get a specific board by ID
   */
  async getBoard(boardId: number): Promise<JiraBoard> {
    return this.agileRequest<JiraBoard>(`/board/${boardId}`);
  }

  /**
   * Get board configuration (columns, wip limits, etc.)
   */
  async getBoardConfig(boardId: number): Promise<JiraBoardConfig> {
    return this.agileRequest<JiraBoardConfig>(`/board/${boardId}/configuration`);
  }

  /**
   * Get issues for a specific board
   */
  async getIssuesForBoard(
    boardId: number,
    options?: {
      jql?: string;
      maxResults?: number;
    }
  ): Promise<JiraIssue[]> {
    const params = new URLSearchParams();
    params.append('maxResults', String(options?.maxResults ?? 50));
    if (options?.jql) {
      params.append('jql', options.jql);
    }

    const response = await this.agileRequest<{ issues: JiraIssue[] }>(
      `/board/${boardId}/issue?${params.toString()}`
    );
    return response.issues;
  }

  /**
   * Find a board by name (case-insensitive partial match)
   */
  async findBoardByName(boardName: string): Promise<JiraBoard | null> {
    const boards = await this.getBoards();
    const normalizedSearch = boardName.toLowerCase();

    // Try exact match first
    let board = boards.find(
      (b) => b.name.toLowerCase() === normalizedSearch
    );

    // Try partial match if no exact match
    if (!board) {
      board = boards.find((b) =>
        b.name.toLowerCase().includes(normalizedSearch)
      );
    }

    return board || null;
  }

  /**
   * Get all statuses for the instance (maps status ID to name)
   */
  async getStatuses(): Promise<Array<{ id: string; name: string }>> {
    return this.request<Array<{ id: string; name: string }>>('/status');
  }

  /**
   * Get board columns with issue counts
   */
  async getBoardColumnStats(boardId: number): Promise<
    Array<{
      columnName: string;
      statuses: string[];
      issueCount: number;
      wipMin?: number;
      wipMax?: number;
    }>
  > {
    const [config, issues, allStatuses] = await Promise.all([
      this.getBoardConfig(boardId),
      this.getIssuesForBoard(boardId, { maxResults: 200 }),
      this.getStatuses(),
    ]);

    // Build status ID to name mapping
    const statusIdToName = new Map<string, string>();
    allStatuses.forEach((s) => {
      statusIdToName.set(s.id, s.name);
    });

    return config.columnConfig.columns.map((column) => {
      // Map status IDs to names
      const statusIds = column.statuses.map((s) => s.id);
      const statusNames = statusIds
        .map((id) => statusIdToName.get(id))
        .filter((n): n is string => !!n);

      // Count issues that match any of this column's status names
      const issueCount = issues.filter((issue) =>
        statusNames.includes(issue.fields.status.name)
      ).length;

      return {
        columnName: column.name,
        statuses: statusNames,
        issueCount,
        wipMin: column.min,
        wipMax: column.max,
      };
    });
  }
}
