/**
 * Bitbucket API Client
 *
 * HTTP client for Bitbucket REST API v2.0 operations.
 * Handles authentication, request/response formatting, and error handling.
 */

import api, { route } from '@forge/api';

/**
 * API error response
 */
export interface BitbucketApiError {
  status: number;
  message: string;
  error?: {
    message: string;
    detail?: string;
  };
}

/**
 * Request options for API calls
 */
interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Bitbucket API Client
 */
export class BitbucketClient {
  private baseUrl = 'https://api.bitbucket.org/2.0';

  /**
   * Make an authenticated request to the Bitbucket API
   */
  async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options.params);

    const fetchOptions: Record<string, unknown> = {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    try {
      // Use Forge's authenticated fetch with asApp for Bitbucket
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await api.fetch(route`${url}`, fetchOptions as any);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createError(response.status, errorData);
      }

      // Handle empty responses (e.g., 204 No Content)
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof BitbucketApiClientError) {
        throw error;
      }
      throw new BitbucketApiClientError(
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    // If endpoint already starts with http, use it as is
    if (endpoint.startsWith('http')) {
      return this.addParams(endpoint, params);
    }

    // Otherwise prepend base URL
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return this.addParams(`${this.baseUrl}/${cleanEndpoint}`, params);
  }

  /**
   * Add query parameters to URL
   */
  private addParams(
    url: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    if (!params) return url;

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * Create API error from response
   */
  private createError(status: number, data: unknown): BitbucketApiClientError {
    const errorMessage =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error: { message: string } }).error.message
        : typeof data === 'object' && data !== null && 'message' in data
          ? (data as { message: string }).message
          : `HTTP ${status}`;

    return new BitbucketApiClientError(status, errorMessage);
  }

  // ============================================================================
  // HTTP Method Shortcuts
  // ============================================================================

  async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // ============================================================================
  // Issue Operations
  // ============================================================================

  async listIssues(
    workspace: string,
    repo: string,
    options?: { state?: string; kind?: string; priority?: string; page?: number; pagelen?: number }
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.state) params.set('state', options.state);
    if (options?.kind) params.set('kind', options.kind);
    if (options?.priority) params.set('priority', options.priority);
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));
    const query = params.toString();
    return this.get(`/repositories/${workspace}/${repo}/issues${query ? `?${query}` : ''}`);
  }

  async getIssue(workspace: string, repo: string, id: number): Promise<unknown> {
    return this.get(`/repositories/${workspace}/${repo}/issues/${id}`);
  }

  async createIssue(
    workspace: string,
    repo: string,
    data: { title: string; content?: string; kind?: string; priority?: string }
  ): Promise<unknown> {
    return this.post(`/repositories/${workspace}/${repo}/issues`, {
      title: data.title,
      ...(data.content && { content: { raw: data.content, markup: 'markdown' } }),
      ...(data.kind && { kind: data.kind }),
      ...(data.priority && { priority: data.priority }),
    });
  }
}

/**
 * Custom error class for Bitbucket API errors
 */
export class BitbucketApiClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'BitbucketApiClientError';
    this.status = status;
  }
}

// Export singleton instance
export const bitbucketClient = new BitbucketClient();
