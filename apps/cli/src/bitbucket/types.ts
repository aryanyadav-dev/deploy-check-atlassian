/**
 * Bitbucket Types for CLI
 */

export interface BitbucketCredentials {
  workspace: string;
  username: string;
  apiToken: string;
}

export interface StoredBitbucketCredentials {
  workspace: string;
  username: string;
  encryptedToken: string;
}

export interface BitbucketRepository {
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
}

export interface BitbucketBranch {
  name: string;
  type: string;
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface BitbucketCommit {
  hash: string;
  message: string;
  date: string;
  author: string;
  parents: string[];
}

export interface BitbucketPullRequest {
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
}

export interface BitbucketPipeline {
  uuid: string;
  buildNumber: number;
  state: string;
  result?: string;
  trigger: string;
  refName: string;
  commit?: string;
  createdOn: string;
  completedOn?: string;
  duration?: number;
  link: string;
}

export interface BitbucketPipelineStep {
  uuid: string;
  name: string;
  type: string;
  state: string;
  result?: string;
  image?: string;
  startedOn?: string;
  completedOn?: string;
  duration?: number;
}

export interface BitbucketIssue {
  id: number;
  title: string;
  content?: string;
  state: string;
  kind: string;
  priority: string;
  reporter: string;
  assignee?: string;
  createdOn: string;
  updatedOn: string;
  votes: number;
  watchers: number;
  link: string;
}

export interface BitbucketPaginatedResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  values: T[];
}
