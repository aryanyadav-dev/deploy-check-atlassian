import {
  ConfluenceCredentials,
  ConfluenceUserProfile,
  ConfluencePage,
  ConfluenceSpace,
  ConfluenceCreatePageRequest,
  ConfluenceUpdatePageRequest,
  ConfluenceSearchResult,
  ConfluenceSpaceSearchResult,
} from './types';

/**
 * Confluence REST API client for CLI integration
 */
export class ConfluenceClient {
  private credentials: ConfluenceCredentials;

  constructor(credentials: ConfluenceCredentials) {
    this.credentials = credentials;
  }

  /**
   * Get base URL for API requests (v2 API)
   */
  private getBaseUrl(): string {
    const url = this.credentials.instanceUrl.replace(/\/$/, '');
    // Remove /wiki suffix if present, then add API path
    const baseUrl = url.replace(/\/wiki$/, '');
    return `${baseUrl}/wiki/api/v2`;
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
   * Make an authenticated request to Confluence API
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
      let errorMessage = `Confluence API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        } else if (errorJson.errors?.length > 0) {
          errorMessage = errorJson.errors.map((e: { message?: string }) => e.message).join(', ');
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }


  /**
   * Validate credentials by fetching the current user profile
   */
  async validateCredentials(): Promise<ConfluenceUserProfile> {
    // Use the v1 API for user profile as v2 doesn't have a direct equivalent
    const url = this.credentials.instanceUrl.replace(/\/$/, '').replace(/\/wiki$/, '');
    const response = await fetch(`${url}/wiki/rest/api/user/current`, {
      headers: {
        Authorization: this.getAuthHeader(),
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      accountId?: string;
      email?: string;
      publicName?: string;
      displayName?: string;
    };
    return {
      accountId: data.accountId || '',
      email: data.email || '',
      publicName: data.publicName || data.displayName || '',
      displayName: data.displayName,
    };
  }

  /**
   * Get a space by key
   */
  async getSpaceByKey(spaceKey: string): Promise<ConfluenceSpace | null> {
    try {
      const result = await this.request<ConfluenceSpaceSearchResult>(
        `/spaces?keys=${encodeURIComponent(spaceKey)}`
      );
      return result.results?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get a page by ID
   */
  async getPage(pageId: string): Promise<ConfluencePage> {
    return this.request<ConfluencePage>(
      `/pages/${pageId}?body-format=storage`
    );
  }

  /**
   * Create a new page
   */
  async createPage(request: ConfluenceCreatePageRequest): Promise<ConfluencePage> {
    return this.request<ConfluencePage>('/pages', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Update an existing page
   */
  async updatePage(request: ConfluenceUpdatePageRequest): Promise<ConfluencePage> {
    return this.request<ConfluencePage>(`/pages/${request.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        id: request.id,
        title: request.title,
        body: request.body,
        version: request.version,
        status: request.status || 'current',
      }),
    });
  }

  /**
   * Search for pages in a space
   */
  async searchPages(
    spaceId: string,
    options: { title?: string; limit?: number } = {}
  ): Promise<ConfluencePage[]> {
    const params = new URLSearchParams();
    params.set('space-id', spaceId);
    if (options.title) {
      params.set('title', options.title);
    }
    params.set('limit', String(options.limit || 25));
    params.set('sort', '-modified-date');

    const result = await this.request<ConfluenceSearchResult>(
      `/pages?${params.toString()}`
    );
    return result.results || [];
  }

  /**
   * Get the web URL for a page
   */
  getPageUrl(page: ConfluencePage): string {
    const baseUrl = this.credentials.instanceUrl.replace(/\/$/, '').replace(/\/wiki$/, '');
    if (page._links?.webui) {
      return `${baseUrl}/wiki${page._links.webui}`;
    }
    return `${baseUrl}/wiki/pages/${page.id}`;
  }
}
