/**
 * Bitbucket API Types
 *
 * TypeScript interfaces for Bitbucket API responses and requests.
 * Based on Bitbucket REST API v2.0
 */

// ============================================================================
// Common Types
// ============================================================================

export interface BitbucketLinks {
  self?: { href: string };
  html?: { href: string };
  avatar?: { href: string };
}

export interface BitbucketUser {
  uuid: string;
  username?: string;
  display_name: string;
  nickname?: string;
  account_id?: string;
  links?: BitbucketLinks;
}

export interface BitbucketWorkspace {
  uuid: string;
  slug: string;
  name: string;
  links?: BitbucketLinks;
}

export interface BitbucketPaginatedResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  previous?: string;
  values: T[];
}

// ============================================================================
// Repository Types
// ============================================================================

export interface BitbucketRepository {
  uuid: string;
  slug: string;
  name: string;
  full_name: string;
  description?: string;
  scm: 'git' | 'hg';
  is_private: boolean;
  language?: string;
  created_on: string;
  updated_on: string;
  size: number;
  owner: BitbucketUser | BitbucketWorkspace;
  workspace: BitbucketWorkspace;
  links: BitbucketLinks & {
    clone?: Array<{ href: string; name: string }>;
    commits?: { href: string };
    branches?: { href: string };
    pullrequests?: { href: string };
  };
  mainbranch?: {
    name: string;
    type: string;
  };
}

export interface BitbucketBranch {
  name: string;
  type: string;
  target: {
    type: string;
    hash: string;
    date: string;
    message: string;
    author: BitbucketUser;
  };
  links?: BitbucketLinks;
}

export interface BitbucketCommit {
  hash: string;
  type: string;
  message: string;
  date: string;
  author: BitbucketUser;
  parents: Array<{ hash: string; type: string }>;
  links?: BitbucketLinks;
  summary?: {
    raw: string;
    markup: string;
    html: string;
  };
}

export interface BitbucketFile {
  path: string;
  type: string;
  size?: number;
  hash?: string;
  links?: BitbucketLinks;
  attributes?: string[];
}

export interface BitbucketDirectory {
  path: string;
  type: 'commit_directory';
  links?: BitbucketLinks;
}

// ============================================================================
// Pull Request Types
// ============================================================================

export interface BitbucketPullRequest {
  id: number;
  title: string;
  description?: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  author: BitbucketUser;
  source: {
    branch: { name: string };
    repository: BitbucketRepository;
    commit: { hash: string; type: string };
  };
  destination: {
    branch: { name: string };
    repository: BitbucketRepository;
    commit: { hash: string; type: string };
  };
  merge_commit?: { hash: string; type: string };
  created_on: string;
  updated_on: string;
  close_source_branch: boolean;
  comment_count: number;
  task_count: number;
  participants: Array<{
    user: BitbucketUser;
    role: string;
    approved: boolean;
    state: string | null;
  }>;
  reviewers: BitbucketUser[];
  links: BitbucketLinks & {
    diff?: { href: string };
    commits?: { href: string };
    comments?: { href: string };
    merge?: { href: string };
    approve?: { href: string };
    decline?: { href: string };
  };
}

export interface BitbucketDiff {
  diff: string;
  source?: {
    path: string;
    revision: string;
    type: string;
  };
  destination?: {
    path: string;
    revision: string;
    type: string;
  };
}

export interface BitbucketComment {
  id: number;
  type: string;
  content?: {
    raw: string;
    markup: string;
    html: string;
  };
  user: BitbucketUser;
  created_on: string;
  updated_on: string;
  parent?: { id: number };
  inline?: {
    path: string;
    from?: number | null;
    to?: number | null;
  };
  links?: BitbucketLinks;
}

export interface BitbucketPullRequestCreate {
  title: string;
  description?: string;
  source: {
    branch: {
      name: string;
    };
  };
  destination?: {
    branch: {
      name: string;
    };
  };
  reviewers?: Array<{ uuid: string }>;
  close_source_branch?: boolean;
}

// ============================================================================
// Pipeline Types
// ============================================================================

export interface BitbucketPipeline {
  uuid: string;
  build_number: number;
  state: {
    name: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'FAILED' | 'PAUSED';
    type: string;
    result?: {
      name: 'SUCCESSFUL' | 'FAILED' | 'STOPPED';
    };
    stage?: {
      name: string;
    };
  };
  trigger: {
    name: 'MANUAL' | 'PUSH' | 'PULL_REQUEST' | 'SCHEDULED' | 'OTHER';
  };
  target: {
    type: string;
    ref_type: string;
    ref_name: string;
    selector?: {
      type: string;
      pattern: string;
    };
    commit?: BitbucketCommit;
  };
  creator: BitbucketUser;
  created_on: string;
  completed_on?: string;
  run_number: number;
  duration_in_seconds?: number;
  links: BitbucketLinks;
}

export interface BitbucketPipelineStep {
  uuid: string;
  name: string;
  type: string;
  state: {
    name: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'FAILED' | 'PAUSED';
    result?: {
      name: 'SUCCESSFUL' | 'FAILED' | 'STOPPED';
    };
  };
  script_commands?: Array<{
    name: string;
    command: string;
    exit_code?: number;
    duration_in_seconds?: number;
  }>;
  image?: {
    name: string;
  };
  started_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  setup_time_in_seconds?: number;
  teardown_time_in_seconds?: number;
  links?: BitbucketLinks;
}

export interface BitbucketPipelineLog {
  log: string;
  size: number;
  next?: string;
}

export interface BitbucketPipelineTrigger {
  target: {
    type: 'pipeline_ref_target';
    ref_type: 'branch' | 'tag' | 'commit';
    ref_name: string;
    selector?: {
      type: 'custom' | 'default';
      pattern?: string;
    };
  };
  variables?: Array<{
    key: string;
    value: string;
    secured?: boolean;
  }>;
}

// ============================================================================
// Issue Types
// ============================================================================

export interface BitbucketIssue {
  id: number;
  title: string;
  content?: {
    raw: string;
    markup: string;
    html: string;
  };
  state: 'new' | 'open' | 'resolved' | 'on hold' | 'invalid' | 'duplicate' | 'wontfix' | 'closed';
  kind: 'bug' | 'enhancement' | 'proposal' | 'task';
  priority: 'trivial' | 'minor' | 'major' | 'critical' | 'blocker';
  reporter: BitbucketUser;
  assignee?: BitbucketUser;
  component?: string;
  milestone?: string;
  version?: string;
  created_on: string;
  updated_on: string;
  edited_on?: string;
  votes: number;
  watchers: number;
  links: BitbucketLinks;
}

export interface BitbucketIssueCreate {
  title: string;
  content?: {
    raw: string;
    markup?: string;
    html?: string;
  };
  state?: string;
  kind?: string;
  priority?: string;
  component?: string;
  milestone?: string;
  version?: string;
  assignee?: { uuid: string };
}
