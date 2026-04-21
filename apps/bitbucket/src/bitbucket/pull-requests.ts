/**
 * Bitbucket Pull Request Operations
 *
 * API operations for managing Bitbucket pull requests.
 * Includes: list PRs, get details, get diff, get comments, create PR, approve, merge.
 */

import { bitbucketClient } from './client';
import type {
  BitbucketPullRequest,
  BitbucketComment,
  BitbucketPaginatedResponse,
  BitbucketPullRequestCreate,
} from './types';

/**
 * List pull requests in a repository
 *
 * GET /repositories/{workspace}/{repo}/pullrequests
 */
export async function listPullRequests(
  workspace: string,
  repo: string,
  options?: {
    state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
    page?: number;
    pagelen?: number;
    q?: string;
    sort?: string;
  }
): Promise<BitbucketPaginatedResponse<BitbucketPullRequest>> {
  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketPullRequest>>(
    `repositories/${workspace}/${repo}/pullrequests`,
    {
      state: options?.state,
      page: options?.page,
      pagelen: options?.pagelen ?? 10,
      q: options?.q,
      sort: options?.sort,
    }
  );
}

/**
 * Get pull request details
 *
 * GET /repositories/{workspace}/{repo}/pullrequests/{id}
 */
export async function getPullRequest(
  workspace: string,
  repo: string,
  id: number
): Promise<BitbucketPullRequest> {
  return bitbucketClient.get<BitbucketPullRequest>(
    `repositories/${workspace}/${repo}/pullrequests/${id}`
  );
}

/**
 * Get pull request diff
 *
 * GET /repositories/{workspace}/{repo}/pullrequests/{id}/diff
 */
export async function getPullRequestDiff(
  workspace: string,
  repo: string,
  id: number
): Promise<string> {
  const response = await bitbucketClient.request<string>(
    `repositories/${workspace}/${repo}/pullrequests/${id}/diff`,
    { method: 'GET' }
  );
  return response;
}

/**
 * Get pull request comments
 *
 * GET /repositories/{workspace}/{repo}/pullrequests/{id}/comments
 */
export async function getPullRequestComments(
  workspace: string,
  repo: string,
  id: number,
  options?: {
    page?: number;
    pagelen?: number;
  }
): Promise<BitbucketPaginatedResponse<BitbucketComment>> {
  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketComment>>(
    `repositories/${workspace}/${repo}/pullrequests/${id}/comments`,
    {
      page: options?.page,
      pagelen: options?.pagelen ?? 10,
    }
  );
}

/**
 * Create a pull request
 *
 * POST /repositories/{workspace}/{repo}/pullrequests
 */
export async function createPullRequest(
  workspace: string,
  repo: string,
  data: BitbucketPullRequestCreate
): Promise<BitbucketPullRequest> {
  return bitbucketClient.post<BitbucketPullRequest>(
    `repositories/${workspace}/${repo}/pullrequests`,
    data
  );
}

/**
 * Approve a pull request
 *
 * POST /repositories/{workspace}/{repo}/pullrequests/{id}/approve
 */
export async function approvePullRequest(
  workspace: string,
  repo: string,
  id: number
): Promise<void> {
  await bitbucketClient.post(
    `repositories/${workspace}/${repo}/pullrequests/${id}/approve`
  );
}

/**
 * Unapprove a pull request
 *
 * DELETE /repositories/{workspace}/{repo}/pullrequests/{id}/approve
 */
export async function unapprovePullRequest(
  workspace: string,
  repo: string,
  id: number
): Promise<void> {
  await bitbucketClient.delete(
    `repositories/${workspace}/${repo}/pullrequests/${id}/approve`
  );
}

/**
 * Merge a pull request
 *
 * POST /repositories/{workspace}/{repo}/pullrequests/{id}/merge
 */
export async function mergePullRequest(
  workspace: string,
  repo: string,
  id: number,
  options?: {
    closeSourceBranch?: boolean;
    mergeStrategy?: 'merge_commit' | 'squash' | 'fast_forward';
    message?: string;
  }
): Promise<BitbucketPullRequest> {
  const body: Record<string, unknown> = {
    type: 'pullrequest',
  };

  if (options?.closeSourceBranch !== undefined) {
    body.close_source_branch = options.closeSourceBranch;
  }
  if (options?.mergeStrategy) {
    body.merge_strategy = options.mergeStrategy;
  }
  if (options?.message) {
    body.message = options.message;
  }

  return bitbucketClient.post<BitbucketPullRequest>(
    `repositories/${workspace}/${repo}/pullrequests/${id}/merge`,
    body
  );
}

/**
 * Decline a pull request
 *
 * POST /repositories/{workspace}/{repo}/pullrequests/{id}/decline
 */
export async function declinePullRequest(
  workspace: string,
  repo: string,
  id: number
): Promise<BitbucketPullRequest> {
  return bitbucketClient.post<BitbucketPullRequest>(
    `repositories/${workspace}/${repo}/pullrequests/${id}/decline`
  );
}

// ============================================================================
// Action Handlers (for Forge function handlers)
// ============================================================================

export interface ListPullRequestsInput {
  workspace: string;
  repo: string;
  state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  page?: number;
  pagelen?: number;
}

export interface ListPullRequestsResponse {
  status: 'success' | 'error';
  pullRequests: Array<{
    id: number;
    title: string;
    description?: string;
    state: string;
    author: string;
    sourceBranch: string;
    destinationBranch: string;
    createdOn: string;
    updatedOn: string;
    commentCount: number;
    approved: boolean;
    reviewers: string[];
    link: string;
  }>;
  pagination: {
    page: number;
    pagelen: number;
    size: number;
    hasNext: boolean;
  };
  message: string;
}

export async function listPullRequestsAction(input: {
  payload: ListPullRequestsInput;
}): Promise<ListPullRequestsResponse> {
  try {
    const { workspace, repo, state, page, pagelen } = input.payload;
    const result = await listPullRequests(workspace, repo, { state, page, pagelen });

    return {
      status: 'success',
      pullRequests: result.values.map((pr) => ({
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
        approved: pr.participants.some((p) => p.approved && p.user.uuid === pr.author.uuid),
        reviewers: pr.reviewers.map((r) => r.display_name),
        link: pr.links?.html?.href ?? '',
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} pull requests in ${repo}`,
    };
  } catch (error) {
    return {
      status: 'error',
      pullRequests: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to list pull requests',
    };
  }
}

export interface GetPullRequestInput {
  workspace: string;
  repo: string;
  id: number;
}

export interface GetPullRequestResponse {
  status: 'success' | 'error';
  pullRequest?: {
    id: number;
    title: string;
    description?: string;
    state: string;
    author: string;
    sourceBranch: string;
    sourceCommit: string;
    destinationBranch: string;
    destinationCommit: string;
    mergeCommit?: string;
    createdOn: string;
    updatedOn: string;
    closeSourceBranch: boolean;
    commentCount: number;
    taskCount: number;
    approved: boolean;
    reviewers: string[];
    participants: Array<{
      user: string;
      role: string;
      approved: boolean;
    }>;
    link: string;
  };
  message: string;
}

export async function getPullRequestAction(input: {
  payload: GetPullRequestInput;
}): Promise<GetPullRequestResponse> {
  try {
    const { workspace, repo, id } = input.payload;
    const result = await getPullRequest(workspace, repo, id);

    return {
      status: 'success',
      pullRequest: {
        id: result.id,
        title: result.title,
        description: result.description,
        state: result.state,
        author: result.author.display_name,
        sourceBranch: result.source.branch.name,
        sourceCommit: result.source.commit.hash,
        destinationBranch: result.destination.branch.name,
        destinationCommit: result.destination.commit.hash,
        mergeCommit: result.merge_commit?.hash,
        createdOn: result.created_on,
        updatedOn: result.updated_on,
        closeSourceBranch: result.close_source_branch,
        commentCount: result.comment_count,
        taskCount: result.task_count,
        approved: result.participants.some((p) => p.approved),
        reviewers: result.reviewers.map((r) => r.display_name),
        participants: result.participants.map((p) => ({
          user: p.user.display_name,
          role: p.role,
          approved: p.approved,
        })),
        link: result.links?.html?.href ?? '',
      },
      message: `Pull request #${id} details retrieved`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get pull request',
    };
  }
}

export interface GetPullRequestDiffInput {
  workspace: string;
  repo: string;
  id: number;
}

export interface GetPullRequestDiffResponse {
  status: 'success' | 'error';
  diff?: string;
  message: string;
}

export async function getPullRequestDiffAction(input: {
  payload: GetPullRequestDiffInput;
}): Promise<GetPullRequestDiffResponse> {
  try {
    const { workspace, repo, id } = input.payload;
    const diff = await getPullRequestDiff(workspace, repo, id);

    return {
      status: 'success',
      diff,
      message: `Diff for pull request #${id} retrieved`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get pull request diff',
    };
  }
}

export interface GetPullRequestCommentsInput {
  workspace: string;
  repo: string;
  id: number;
  page?: number;
  pagelen?: number;
}

export interface GetPullRequestCommentsResponse {
  status: 'success' | 'error';
  comments: Array<{
    id: number;
    content?: string;
    user: string;
    createdOn: string;
    updatedOn: string;
    parentId?: number;
    inline?: {
      path: string;
      from?: number | null;
      to?: number | null;
    };
  }>;
  pagination: {
    page: number;
    pagelen: number;
    size: number;
    hasNext: boolean;
  };
  message: string;
}

export async function getPullRequestCommentsAction(input: {
  payload: GetPullRequestCommentsInput;
}): Promise<GetPullRequestCommentsResponse> {
  try {
    const { workspace, repo, id, page, pagelen } = input.payload;
    const result = await getPullRequestComments(workspace, repo, id, { page, pagelen });

    return {
      status: 'success',
      comments: result.values.map((comment) => ({
        id: comment.id,
        content: comment.content?.raw,
        user: comment.user.display_name,
        createdOn: comment.created_on,
        updatedOn: comment.updated_on,
        parentId: comment.parent?.id,
        inline: comment.inline,
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} comments on pull request #${id}`,
    };
  } catch (error) {
    return {
      status: 'error',
      comments: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to get comments',
    };
  }
}

export interface CreatePullRequestInput {
  workspace: string;
  repo: string;
  title: string;
  description?: string;
  sourceBranch: string;
  destinationBranch?: string;
  closeSourceBranch?: boolean;
}

export interface CreatePullRequestResponse {
  status: 'success' | 'error';
  pullRequest?: {
    id: number;
    title: string;
    link: string;
  };
  message: string;
}

export async function createPullRequestAction(input: {
  payload: CreatePullRequestInput;
}): Promise<CreatePullRequestResponse> {
  try {
    const {
      workspace,
      repo,
      title,
      description,
      sourceBranch,
      destinationBranch,
      closeSourceBranch,
    } = input.payload;

    const data: BitbucketPullRequestCreate = {
      title,
      description,
      source: { branch: { name: sourceBranch } },
      ...(destinationBranch && {
        destination: { branch: { name: destinationBranch } },
      }),
      ...(closeSourceBranch !== undefined && { close_source_branch: closeSourceBranch }),
    };

    const result = await createPullRequest(workspace, repo, data);

    return {
      status: 'success',
      pullRequest: {
        id: result.id,
        title: result.title,
        link: result.links?.html?.href ?? '',
      },
      message: `Pull request #${result.id} created successfully`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create pull request',
    };
  }
}

export interface ApprovePullRequestInput {
  workspace: string;
  repo: string;
  id: number;
}

export interface ApprovePullRequestResponse {
  status: 'success' | 'error';
  message: string;
}

export async function approvePullRequestAction(input: {
  payload: ApprovePullRequestInput;
}): Promise<ApprovePullRequestResponse> {
  try {
    const { workspace, repo, id } = input.payload;
    await approvePullRequest(workspace, repo, id);

    return {
      status: 'success',
      message: `Pull request #${id} approved`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to approve pull request',
    };
  }
}

export interface MergePullRequestInput {
  workspace: string;
  repo: string;
  id: number;
  closeSourceBranch?: boolean;
  mergeStrategy?: 'merge_commit' | 'squash' | 'fast_forward';
  message?: string;
}

export interface MergePullRequestResponse {
  status: 'success' | 'error';
  pullRequest?: {
    id: number;
    state: string;
    mergeCommit?: string;
  };
  message: string;
}

export async function mergePullRequestAction(input: {
  payload: MergePullRequestInput;
}): Promise<MergePullRequestResponse> {
  try {
    const { workspace, repo, id, closeSourceBranch, mergeStrategy, message } = input.payload;
    const result = await mergePullRequest(workspace, repo, id, {
      closeSourceBranch,
      mergeStrategy,
      message,
    });

    return {
      status: 'success',
      pullRequest: {
        id: result.id,
        state: result.state,
        mergeCommit: result.merge_commit?.hash,
      },
      message: `Pull request #${id} merged successfully`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to merge pull request',
    };
  }
}
