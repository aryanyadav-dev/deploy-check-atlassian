/**
 * Bitbucket Issue Operations
 *
 * Forge function handlers for Bitbucket issue operations.
 */

import { bitbucketClient } from './client';
import type { BitbucketIssue } from './types';

/**
 * Input types for issue actions
 */
export interface ListIssuesInput {
  workspace: string;
  repo: string;
  state?: string;
  kind?: string;
  priority?: string;
  page?: number;
  pagelen?: number;
}

export interface GetIssueInput {
  workspace: string;
  repo: string;
  id: number;
}

export interface CreateIssueInput {
  workspace: string;
  repo: string;
  title: string;
  content?: string;
  kind?: string;
  priority?: string;
}

export interface UpdateIssueInput {
  workspace: string;
  repo: string;
  id: number;
  title?: string;
  content?: string;
  state?: string;
  kind?: string;
  priority?: string;
}

export interface DeleteIssueInput {
  workspace: string;
  repo: string;
  id: number;
}

/**
 * Response types for issue actions
 */
export interface ListIssuesResponse {
  status: 'success' | 'error';
  issues?: BitbucketIssue[];
  pagination?: {
    size: number;
    page: number;
    pagelen: number;
  };
  message?: string;
}

export interface GetIssueResponse {
  status: 'success' | 'error';
  issue?: BitbucketIssue;
  message?: string;
}

export interface CreateIssueResponse {
  status: 'success' | 'error';
  issue?: BitbucketIssue;
  message?: string;
}

export interface UpdateIssueResponse {
  status: 'success' | 'error';
  issue?: BitbucketIssue;
  message?: string;
}

export interface DeleteIssueResponse {
  status: 'success' | 'error';
  message?: string;
}

/**
 * List issues in a repository
 */
export async function listIssues(
  input: ListIssuesInput
): Promise<ListIssuesResponse> {
  try {
    const result = await bitbucketClient.listIssues(input.workspace, input.repo, {
      state: input.state,
      kind: input.kind,
      priority: input.priority,
      page: input.page,
      pagelen: input.pagelen,
    }) as { size: number; page: number; pagelen: number; values: BitbucketIssue[] };

    return {
      status: 'success',
      issues: result.values,
      pagination: {
        size: result.size,
        page: result.page,
        pagelen: result.pagelen,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to list issues',
    };
  }
}

/**
 * Get issue details
 */
export async function getIssue(input: GetIssueInput): Promise<GetIssueResponse> {
  try {
    const issue = await bitbucketClient.getIssue(input.workspace, input.repo, input.id) as BitbucketIssue;
    return {
      status: 'success',
      issue,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get issue',
    };
  }
}

/**
 * Create an issue
 */
export async function createIssue(
  input: CreateIssueInput
): Promise<CreateIssueResponse> {
  try {
    const issue = await bitbucketClient.createIssue(input.workspace, input.repo, {
      title: input.title,
      content: input.content,
      kind: input.kind,
      priority: input.priority,
    }) as BitbucketIssue;

    return {
      status: 'success',
      issue,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create issue',
    };
  }
}

/**
 * Update an issue
 */
export async function updateIssue(
  _input: UpdateIssueInput
): Promise<UpdateIssueResponse> {
  try {
    // Bitbucket API doesn't have a direct update endpoint, so we get and would need to handle differently
    // For now, return not implemented
    return {
      status: 'error',
      message: 'Update issue not yet implemented - use createIssue or manage via Bitbucket UI',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to update issue',
    };
  }
}

/**
 * Delete an issue
 */
export async function deleteIssue(
  _input: DeleteIssueInput
): Promise<DeleteIssueResponse> {
  try {
    // Bitbucket API doesn't have a delete endpoint for issues
    return {
      status: 'error',
      message: 'Delete issue not supported by Bitbucket API',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to delete issue',
    };
  }
}

// ============================================================================
// Forge Action Handlers
// ============================================================================

export const listIssuesAction = async (args: {
  payload: ListIssuesInput;
}): Promise<ListIssuesResponse> => {
  return listIssues(args.payload);
};

export const getIssueAction = async (args: {
  payload: GetIssueInput;
}): Promise<GetIssueResponse> => {
  return getIssue(args.payload);
};

export const createIssueAction = async (args: {
  payload: CreateIssueInput;
}): Promise<CreateIssueResponse> => {
  return createIssue(args.payload);
};

export const updateIssueAction = async (args: {
  payload: UpdateIssueInput;
}): Promise<UpdateIssueResponse> => {
  return updateIssue(args.payload);
};

export const deleteIssueAction = async (args: {
  payload: DeleteIssueInput;
}): Promise<DeleteIssueResponse> => {
  return deleteIssue(args.payload);
};
