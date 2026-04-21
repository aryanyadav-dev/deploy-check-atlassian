/**
 * Bitbucket API Client for CLI
 *
 * HTTP client for Bitbucket REST API v2.0 operations.
 * Uses Basic authentication with an Atlassian account email + API token.
 */

import {
  BitbucketCredentials,
  BitbucketRepository,
  BitbucketBranch,
  BitbucketCommit,
  BitbucketPullRequest,
  BitbucketPipeline,
  BitbucketPipelineStep,
  BitbucketIssue,
  BitbucketPaginatedResponse,
} from './types';

/**
 * Bitbucket REST API client for CLI integration
 */
export class BitbucketClient {
  private credentials: BitbucketCredentials;
  private baseUrl = 'https://api.bitbucket.org/2.0';

  constructor(credentials: BitbucketCredentials) {
    this.credentials = credentials;
  }

  /**
   * Get authorization header for API requests
   * Uses Basic authentication for Bitbucket API tokens.
   */
  private getAuthHeader(): string {
    const auth = Buffer.from(
      `${this.credentials.username}:${this.credentials.apiToken}`
    ).toString('base64');
    return `Basic ${auth}`;
  }

  /**
   * Make an authenticated request to Bitbucket API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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
      const authHint =
        response.status === 401
          ? ' Hint: Bitbucket API tokens require Basic auth with your Atlassian account email. If you are using an app password instead, use your Bitbucket username.'
          : '';
      throw new Error(
        `Bitbucket API error: ${response.status} ${response.statusText} - ${errorBody}${authHint}`
      );
    }

    if (response.status === 204) {
      return {} as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Validate that the configured credentials can access the selected workspace.
   * This avoids requiring the extra read:user:bitbucket scope just to log in.
   */
  async validateWorkspaceAccess(): Promise<void> {
    await this.request(
      `/repositories/${this.credentials.workspace}?pagelen=1`
    );
  }

  // ============================================================================
  // Repository Operations
  // ============================================================================

  /**
   * List repositories in a workspace
   */
  async listRepositories(
    options?: { page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketRepository>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        uuid: string;
        slug: string;
        name: string;
        full_name: string;
        description?: string;
        language?: string;
        is_private: boolean;
        updated_on: string;
        size: number;
        mainbranch?: { name: string };
        links: {
          html: { href: string };
          clone?: Array<{ href: string; name: string }>;
        };
      }>;
    }>(`/repositories/${this.credentials.workspace}${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((repo) => ({
        uuid: repo.uuid,
        slug: repo.slug,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        isPrivate: repo.is_private,
        updatedOn: repo.updated_on,
        size: repo.size,
        mainBranch: repo.mainbranch?.name,
        links: {
          html: repo.links.html.href,
          clone: repo.links.clone?.map((c) => c.href),
        },
      })),
    };
  }

  /**
   * Get repository details
   */
  async getRepository(
    repo: string
  ): Promise<BitbucketRepository> {
    const result = await this.request<{
      uuid: string;
      slug: string;
      name: string;
      full_name: string;
      description?: string;
      language?: string;
      is_private: boolean;
      created_on: string;
      updated_on: string;
      size: number;
      mainbranch?: { name: string };
      scm: string;
    }>(`/repositories/${this.credentials.workspace}/${repo}`);

    return {
      uuid: result.uuid,
      slug: result.slug,
      name: result.name,
      fullName: result.full_name,
      description: result.description,
      language: result.language,
      isPrivate: result.is_private,
      updatedOn: result.updated_on,
      size: result.size,
      mainBranch: result.mainbranch?.name,
      links: { html: '' },
    };
  }

  /**
   * List branches in a repository
   */
  async listBranches(
    repo: string,
    options?: { page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketBranch>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        name: string;
        type: string;
        target: {
          hash: string;
          date: string;
          message: string;
          author: { display_name: string };
        };
      }>;
    }>(`/repositories/${this.credentials.workspace}/${repo}/refs/branches${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((branch) => ({
        name: branch.name,
        type: branch.type,
        hash: branch.target.hash,
        date: branch.target.date,
        message: branch.target.message,
        author: branch.target.author.display_name,
      })),
    };
  }

  /**
   * List commits in a repository
   */
  async listCommits(
    repo: string,
    options?: { branch?: string; page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketCommit>> {
    const params = new URLSearchParams();
    if (options?.branch) params.set('branch', options.branch);
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const path = options?.branch
      ? `/repositories/${this.credentials.workspace}/${repo}/commits/${options.branch}`
      : `/repositories/${this.credentials.workspace}/${repo}/commits`;

    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        hash: string;
        message: string;
        date: string;
        author: { display_name: string };
        parents: Array<{ hash: string }>;
      }>;
    }>(`${path}${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        date: commit.date,
        author: commit.author.display_name,
        parents: commit.parents.map((p) => p.hash),
      })),
    };
  }

  // ============================================================================
  // Pull Request Operations
  // ============================================================================

  /**
   * List pull requests in a repository
   */
  async listPullRequests(
    repo: string,
    options?: { state?: 'OPEN' | 'MERGED' | 'DECLINED'; page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketPullRequest>> {
    const params = new URLSearchParams();
    if (options?.state) params.set('state', options.state);
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        id: number;
        title: string;
        description?: string;
        state: string;
        author: { display_name: string };
        source: { branch: { name: string } };
        destination: { branch: { name: string } };
        created_on: string;
        updated_on: string;
        comment_count: number;
        participants: Array<{ user: { display_name: string }; approved: boolean }>;
        reviewers: Array<{ display_name: string }>;
        links: { html: { href: string } };
      }>;
    }>(`/repositories/${this.credentials.workspace}/${repo}/pullrequests${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((pr) => ({
        id: pr.id,
        title: pr.title,
        description: pr.description,
        state: pr.state,
        author: pr.author.display_name,
        sourceBranch: pr.source.branch.name,
        destinationBranch: pr.destination.branch.name,
        createdOn: pr.created_on,
        updatedOn: pr.updated_on,
        commentCount: pr.comment_count,
        approved: pr.participants.some((p) => p.approved),
        reviewers: pr.reviewers.map((r) => r.display_name),
        link: pr.links.html.href,
      })),
    };
  }

  /**
   * Get pull request details
   */
  async getPullRequest(repo: string, id: number): Promise<BitbucketPullRequest> {
    const result = await this.request<{
      id: number;
      title: string;
      description?: string;
      state: string;
      author: { display_name: string };
      source: { branch: { name: string } };
      destination: { branch: { name: string } };
      created_on: string;
      updated_on: string;
      comment_count: number;
      participants: Array<{ user: { display_name: string }; approved: boolean }>;
      reviewers: Array<{ display_name: string }>;
      links: { html: { href: string } };
    }>(`/repositories/${this.credentials.workspace}/${repo}/pullrequests/${id}`);

    return {
      id: result.id,
      title: result.title,
      description: result.description,
      state: result.state,
      author: result.author.display_name,
      sourceBranch: result.source.branch.name,
      destinationBranch: result.destination.branch.name,
      createdOn: result.created_on,
      updatedOn: result.updated_on,
      commentCount: result.comment_count,
      approved: result.participants.some((p) => p.approved),
      reviewers: result.reviewers.map((r) => r.display_name),
      link: result.links.html.href,
    };
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    repo: string,
    data: { title: string; description?: string; sourceBranch: string; destinationBranch?: string }
  ): Promise<BitbucketPullRequest> {
    const result = await this.request<{
      id: number;
      title: string;
      state: string;
      author: { display_name: string };
      source: { branch: { name: string } };
      destination: { branch: { name: string } };
      created_on: string;
      updated_on: string;
      comment_count: number;
      participants: Array<{ user: { display_name: string }; approved: boolean }>;
      reviewers: Array<{ display_name: string }>;
      links: { html: { href: string } };
    }>(`/repositories/${this.credentials.workspace}/${repo}/pullrequests`, {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        source: { branch: { name: data.sourceBranch } },
        ...(data.destinationBranch && {
          destination: { branch: { name: data.destinationBranch } },
        }),
      }),
    });

    return {
      id: result.id,
      title: result.title,
      state: result.state,
      author: result.author.display_name,
      sourceBranch: result.source.branch.name,
      destinationBranch: result.destination.branch.name,
      createdOn: result.created_on,
      updatedOn: result.updated_on,
      commentCount: result.comment_count,
      approved: false,
      reviewers: [],
      link: result.links.html.href,
    };
  }

  /**
   * Approve a pull request
   */
  async approvePullRequest(repo: string, id: number): Promise<void> {
    await this.request(`/repositories/${this.credentials.workspace}/${repo}/pullrequests/${id}/approve`, {
      method: 'POST',
    });
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    repo: string,
    id: number,
    options?: { closeSourceBranch?: boolean; mergeStrategy?: string }
  ): Promise<void> {
    await this.request(`/repositories/${this.credentials.workspace}/${repo}/pullrequests/${id}/merge`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'pullrequest',
        close_source_branch: options?.closeSourceBranch,
        merge_strategy: options?.mergeStrategy,
      }),
    });
  }

  // ============================================================================
  // Pipeline Operations
  // ============================================================================

  /**
   * List pipelines in a repository
   */
  async listPipelines(
    repo: string,
    options?: { page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketPipeline>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        uuid: string;
        build_number: number;
        state: { name: string; result?: { name: string } };
        trigger: { name: string };
        target: { ref_name: string; commit?: { hash: string } };
        created_on: string;
        completed_on?: string;
        duration_in_seconds?: number;
        links: { html: { href: string } };
      }>;
    }>(`/repositories/${this.credentials.workspace}/${repo}/pipelines${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((pipeline) => ({
        uuid: pipeline.uuid,
        buildNumber: pipeline.build_number,
        state: pipeline.state.name,
        result: pipeline.state.result?.name,
        trigger: pipeline.trigger.name,
        refName: pipeline.target.ref_name,
        commit: pipeline.target.commit?.hash,
        createdOn: pipeline.created_on,
        completedOn: pipeline.completed_on,
        duration: pipeline.duration_in_seconds,
        link: pipeline.links.html.href,
      })),
    };
  }

  /**
   * Get pipeline details
   */
  async getPipeline(repo: string, uuid: string): Promise<BitbucketPipeline> {
    const cleanUuid = uuid.replace(/[{}]/g, '');
    const result = await this.request<{
      uuid: string;
      build_number: number;
      state: { name: string; result?: { name: string } };
      trigger: { name: string };
      target: { ref_name: string; commit?: { hash: string; message: string; author: { display_name: string } } };
      creator: { display_name: string };
      created_on: string;
      completed_on?: string;
      duration_in_seconds?: number;
      run_number: number;
    }>(`/repositories/${this.credentials.workspace}/${repo}/pipelines/{${cleanUuid}}`);

    return {
      uuid: result.uuid,
      buildNumber: result.build_number,
      state: result.state.name,
      result: result.state.result?.name,
      trigger: result.trigger.name,
      refName: result.target.ref_name,
      commit: result.target.commit?.hash,
      createdOn: result.created_on,
      completedOn: result.completed_on,
      duration: result.duration_in_seconds,
      link: '',
    };
  }

  /**
   * Get pipeline steps
   */
  async getPipelineSteps(
    repo: string,
    uuid: string,
    options?: { page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketPipelineStep>> {
    const cleanUuid = uuid.replace(/[{}]/g, '');
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        uuid: string;
        name: string;
        type: string;
        state: { name: string; result?: { name: string } };
        image?: { name: string };
        started_on?: string;
        completed_on?: string;
        duration_in_seconds?: number;
      }>;
    }>(`/repositories/${this.credentials.workspace}/${repo}/pipelines/{${cleanUuid}}/steps${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((step) => ({
        uuid: step.uuid,
        name: step.name,
        type: step.type,
        state: step.state.name,
        result: step.state.result?.name,
        image: step.image?.name,
        startedOn: step.started_on,
        completedOn: step.completed_on,
        duration: step.duration_in_seconds,
      })),
    };
  }

  /**
   * Trigger a pipeline
   */
  async triggerPipeline(
    repo: string,
    branch: string,
    variables?: Array<{ key: string; value: string }>
  ): Promise<BitbucketPipeline> {
    const result = await this.request<{
      uuid: string;
      build_number: number;
      state: { name: string };
      links: { html: { href: string } };
    }>(`/repositories/${this.credentials.workspace}/${repo}/pipelines`, {
      method: 'POST',
      body: JSON.stringify({
        target: {
          type: 'pipeline_ref_target',
          ref_type: 'branch',
          ref_name: branch,
        },
        ...(variables && { variables }),
      }),
    });

    return {
      uuid: result.uuid,
      buildNumber: result.build_number,
      state: result.state.name,
      trigger: 'MANUAL',
      refName: branch,
      createdOn: new Date().toISOString(),
      link: result.links.html.href,
    };
  }

  // ============================================================================
  // Issue Operations
  // ============================================================================

  /**
   * List issues in a repository
   */
  async listIssues(
    repo: string,
    options?: { state?: string; kind?: string; priority?: string; page?: number; pagelen?: number }
  ): Promise<BitbucketPaginatedResponse<BitbucketIssue>> {
    const params = new URLSearchParams();
    if (options?.state) params.set('state', options.state);
    if (options?.kind) params.set('kind', options.kind);
    if (options?.priority) params.set('priority', options.priority);
    if (options?.page) params.set('page', String(options.page));
    if (options?.pagelen) params.set('pagelen', String(options.pagelen));

    const query = params.toString();
    const result = await this.request<{
      size: number;
      page: number;
      pagelen: number;
      values: Array<{
        id: number;
        title: string;
        content?: { raw: string };
        state: string;
        kind: string;
        priority: string;
        reporter: { display_name: string };
        assignee?: { display_name: string };
        created_on: string;
        updated_on: string;
        votes: number;
        watchers: number;
        links: { html: { href: string } };
      }>;
    }>(`/repositories/${this.credentials.workspace}/${repo}/issues${query ? `?${query}` : ''}`);

    return {
      size: result.size,
      page: result.page,
      pagelen: result.pagelen,
      values: result.values.map((issue) => ({
        id: issue.id,
        title: issue.title,
        content: issue.content?.raw,
        state: issue.state,
        kind: issue.kind,
        priority: issue.priority,
        reporter: issue.reporter.display_name,
        assignee: issue.assignee?.display_name,
        createdOn: issue.created_on,
        updatedOn: issue.updated_on,
        votes: issue.votes,
        watchers: issue.watchers,
        link: issue.links.html.href,
      })),
    };
  }

  /**
   * Get issue details
   */
  async getIssue(repo: string, id: number): Promise<BitbucketIssue> {
    const result = await this.request<{
      id: number;
      title: string;
      content?: { raw: string };
      state: string;
      kind: string;
      priority: string;
      reporter: { display_name: string };
      assignee?: { display_name: string };
      created_on: string;
      updated_on: string;
      votes: number;
      watchers: number;
      links: { html: { href: string } };
    }>(`/repositories/${this.credentials.workspace}/${repo}/issues/${id}`);

    return {
      id: result.id,
      title: result.title,
      content: result.content?.raw,
      state: result.state,
      kind: result.kind,
      priority: result.priority,
      reporter: result.reporter.display_name,
      assignee: result.assignee?.display_name,
      createdOn: result.created_on,
      updatedOn: result.updated_on,
      votes: result.votes,
      watchers: result.watchers,
      link: result.links.html.href,
    };
  }

  /**
   * Create an issue
   */
  async createIssue(
    repo: string,
    data: { title: string; content?: string; kind?: string; priority?: string }
  ): Promise<BitbucketIssue> {
    const result = await this.request<{
      id: number;
      title: string;
      state: string;
      kind: string;
      priority: string;
      reporter: { display_name: string };
      created_on: string;
      updated_on: string;
      votes: number;
      watchers: number;
      links: { html: { href: string } };
    }>(`/repositories/${this.credentials.workspace}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        ...(data.content && { content: { raw: data.content, markup: 'markdown' } }),
        ...(data.kind && { kind: data.kind }),
        ...(data.priority && { priority: data.priority }),
      }),
    });

    return {
      id: result.id,
      title: result.title,
      state: result.state,
      kind: result.kind,
      priority: result.priority,
      reporter: result.reporter.display_name,
      createdOn: result.created_on,
      updatedOn: result.updated_on,
      votes: result.votes,
      watchers: result.watchers,
      link: result.links.html.href,
    };
  }
}
