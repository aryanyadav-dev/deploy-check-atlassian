/**
 * Bitbucket Repository Operations
 *
 * API operations for managing Bitbucket repositories.
 * Includes: list repos, get details, list branches, list commits, browse source.
 */

import { bitbucketClient } from './client';
import type {
  BitbucketRepository,
  BitbucketBranch,
  BitbucketCommit,
  BitbucketFile,
  BitbucketDirectory,
  BitbucketPaginatedResponse,
} from './types';

/**
 * List repositories in a workspace
 *
 * GET /repositories/{workspace}
 */
export async function listRepositories(
  workspace: string,
  options?: {
    page?: number;
    pagelen?: number;
    q?: string; // Query string for filtering
    sort?: string;
  }
): Promise<BitbucketPaginatedResponse<BitbucketRepository>> {
  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketRepository>>(
    `repositories/${workspace}`,
    {
      page: options?.page,
      pagelen: options?.pagelen ?? 10,
      q: options?.q,
      sort: options?.sort,
    }
  );
}

/**
 * Get repository details
 *
 * GET /repositories/{workspace}/{repo}
 */
export async function getRepository(
  workspace: string,
  repo: string
): Promise<BitbucketRepository> {
  return bitbucketClient.get<BitbucketRepository>(`repositories/${workspace}/${repo}`);
}

/**
 * List branches in a repository
 *
 * GET /repositories/{workspace}/{repo}/refs/branches
 */
export async function listBranches(
  workspace: string,
  repo: string,
  options?: {
    page?: number;
    pagelen?: number;
    q?: string;
    sort?: string;
  }
): Promise<BitbucketPaginatedResponse<BitbucketBranch>> {
  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketBranch>>(
    `repositories/${workspace}/${repo}/refs/branches`,
    {
      page: options?.page,
      pagelen: options?.pagelen ?? 10,
      q: options?.q,
      sort: options?.sort,
    }
  );
}

/**
 * List commits in a repository
 *
 * GET /repositories/{workspace}/{repo}/commits
 */
export async function listCommits(
  workspace: string,
  repo: string,
  options?: {
    branch?: string;
    page?: number;
    pagelen?: number;
    q?: string;
    exclude?: string[];
    include?: string[];
  }
): Promise<BitbucketPaginatedResponse<BitbucketCommit>> {
  // Build include/exclude params if provided
  const params: Record<string, string | number | undefined> = {
    page: options?.page,
    pagelen: options?.pagelen ?? 10,
    q: options?.q,
  };

  if (options?.include) {
    params.include = options.include.join(',');
  }
  if (options?.exclude) {
    params.exclude = options.exclude.join(',');
  }

  const path = options?.branch
    ? `repositories/${workspace}/${repo}/commits/${options.branch}`
    : `repositories/${workspace}/${repo}/commits`;

  return bitbucketClient.get<BitbucketPaginatedResponse<BitbucketCommit>>(path, params);
}

/**
 * Get a specific commit
 *
 * GET /repositories/{workspace}/{repo}/commit/{commit}
 */
export async function getCommit(
  workspace: string,
  repo: string,
  commit: string
): Promise<BitbucketCommit> {
  return bitbucketClient.get<BitbucketCommit>(
    `repositories/${workspace}/${repo}/commit/${commit}`
  );
}

/**
 * Browse source files in a repository
 *
 * GET /repositories/{workspace}/{repo}/src/{commit}/{path}
 */
export async function browseSource(
  workspace: string,
  repo: string,
  options?: {
    commit?: string; // Commit SHA, branch name, or tag (default: mainbranch)
    path?: string; // Path to file or directory (default: root)
  }
): Promise<BitbucketFile | BitbucketDirectory | BitbucketPaginatedResponse<BitbucketFile | BitbucketDirectory>> {
  const commit = options?.commit ?? '';
  const path = options?.path ?? '';

  const fullPath = commit || path
    ? `repositories/${workspace}/${repo}/src/${commit}/${path}`
    : `repositories/${workspace}/${repo}/src`;

  return bitbucketClient.get(fullPath);
}

/**
 * Get file content from repository
 *
 * GET /repositories/{workspace}/{repo}/src/{commit}/{filepath}
 */
export async function getFileContent(
  workspace: string,
  repo: string,
  filePath: string,
  commit?: string
): Promise<string> {
  const ref = commit ?? '';
  const response = await bitbucketClient.request<string>(
    `repositories/${workspace}/${repo}/src/${ref}/${filePath}`,
    { method: 'GET' }
  );
  return response;
}

// ============================================================================
// Action Handlers (for Forge function handlers)
// ============================================================================

export interface ListRepositoriesInput {
  workspace: string;
  page?: number;
  pagelen?: number;
}

export interface ListRepositoriesResponse {
  status: 'success' | 'error';
  repositories: Array<{
    uuid: string;
    slug: string;
    name: string;
    fullName: string;
    description?: string;
    language?: string;
    isPrivate: boolean;
    updatedOn: string;
    size: number;
    mainBranch?: string;
    links: {
      html: string;
      clone?: string[];
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

export async function listRepositoriesAction(input: {
  payload: ListRepositoriesInput;
}): Promise<ListRepositoriesResponse> {
  try {
    const { workspace, page, pagelen } = input.payload;
    const result = await listRepositories(workspace, { page, pagelen });

    return {
      status: 'success',
      repositories: result.values.map((repo) => ({
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
          html: repo.links?.html?.href ?? '',
          clone: repo.links?.clone?.map((c) => c.href),
        },
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} repositories in ${workspace}`,
    };
  } catch (error) {
    return {
      status: 'error',
      repositories: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to list repositories',
    };
  }
}

export interface GetRepositoryInput {
  workspace: string;
  repo: string;
}

export interface GetRepositoryResponse {
  status: 'success' | 'error';
  repository?: {
    uuid: string;
    slug: string;
    name: string;
    fullName: string;
    description?: string;
    language?: string;
    isPrivate: boolean;
    createdOn: string;
    updatedOn: string;
    size: number;
    mainBranch?: string;
    scm: string;
  };
  message: string;
}

export async function getRepositoryAction(input: {
  payload: GetRepositoryInput;
}): Promise<GetRepositoryResponse> {
  try {
    const { workspace, repo } = input.payload;
    const result = await getRepository(workspace, repo);

    return {
      status: 'success',
      repository: {
        uuid: result.uuid,
        slug: result.slug,
        name: result.name,
        fullName: result.full_name,
        description: result.description,
        language: result.language,
        isPrivate: result.is_private,
        createdOn: result.created_on,
        updatedOn: result.updated_on,
        size: result.size,
        mainBranch: result.mainbranch?.name,
        scm: result.scm,
      },
      message: `Repository ${result.full_name} details retrieved`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get repository details',
    };
  }
}

export interface ListBranchesInput {
  workspace: string;
  repo: string;
  page?: number;
  pagelen?: number;
}

export interface ListBranchesResponse {
  status: 'success' | 'error';
  branches: Array<{
    name: string;
    type: string;
    hash: string;
    date: string;
    message: string;
    author: string;
  }>;
  pagination: {
    page: number;
    pagelen: number;
    size: number;
    hasNext: boolean;
  };
  message: string;
}

export async function listBranchesAction(input: {
  payload: ListBranchesInput;
}): Promise<ListBranchesResponse> {
  try {
    const { workspace, repo, page, pagelen } = input.payload;
    const result = await listBranches(workspace, repo, { page, pagelen });

    return {
      status: 'success',
      branches: result.values.map((branch) => ({
        name: branch.name,
        type: branch.type,
        hash: branch.target.hash,
        date: branch.target.date,
        message: branch.target.message,
        author: branch.target.author.display_name,
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} branches in ${repo}`,
    };
  } catch (error) {
    return {
      status: 'error',
      branches: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to list branches',
    };
  }
}

export interface ListCommitsInput {
  workspace: string;
  repo: string;
  branch?: string;
  page?: number;
  pagelen?: number;
}

export interface ListCommitsResponse {
  status: 'success' | 'error';
  commits: Array<{
    hash: string;
    message: string;
    date: string;
    author: string;
    parents: string[];
  }>;
  pagination: {
    page: number;
    pagelen: number;
    size: number;
    hasNext: boolean;
  };
  message: string;
}

export async function listCommitsAction(input: {
  payload: ListCommitsInput;
}): Promise<ListCommitsResponse> {
  try {
    const { workspace, repo, branch, page, pagelen } = input.payload;
    const result = await listCommits(workspace, repo, { branch, page, pagelen });

    return {
      status: 'success',
      commits: result.values.map((commit) => ({
        hash: commit.hash,
        message: commit.message,
        date: commit.date,
        author: commit.author.display_name,
        parents: commit.parents.map((p) => p.hash),
      })),
      pagination: {
        page: result.page,
        pagelen: result.pagelen,
        size: result.size,
        hasNext: !!result.next,
      },
      message: `Found ${result.size} commits in ${repo}${branch ? ` (${branch})` : ''}`,
    };
  } catch (error) {
    return {
      status: 'error',
      commits: [],
      pagination: { page: 1, pagelen: 10, size: 0, hasNext: false },
      message: error instanceof Error ? error.message : 'Failed to list commits',
    };
  }
}

export interface BrowseSourceInput {
  workspace: string;
  repo: string;
  commit?: string;
  path?: string;
}

export interface BrowseSourceResponse {
  status: 'success' | 'error';
  path?: string;
  commit?: string;
  type?: 'file' | 'directory';
  entries?: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
  }>;
  fileContent?: string;
  message: string;
}

export async function browseSourceAction(input: {
  payload: BrowseSourceInput;
}): Promise<BrowseSourceResponse> {
  try {
    const { workspace, repo, commit, path } = input.payload;
    const result = await browseSource(workspace, repo, { commit, path });

    // Check if it's a paginated response (directory listing)
    if ('values' in result) {
      return {
        status: 'success',
        path: path ?? '/',
        commit,
        type: 'directory',
        entries: result.values.map((entry) => ({
          name: entry.path.split('/').pop() ?? entry.path,
          path: entry.path,
          type: entry.type === 'commit_directory' ? 'directory' : 'file',
          size: 'size' in entry ? entry.size : undefined,
        })),
        message: `Directory listing for ${path ?? '/'}`,
      };
    }

    // Single file or directory
    if (result.type === 'commit_directory') {
      return {
        status: 'success',
        path: result.path,
        commit,
        type: 'directory',
        message: `Directory: ${result.path}`,
      };
    }

    // It's a file
    return {
      status: 'success',
      path: result.path,
      commit,
      type: 'file',
      message: `File: ${result.path}`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to browse source',
    };
  }
}
