/**
 * Bitbucket Pull Request Operations Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge/api', () => ({
  default: {
    fetch: vi.fn(),
  },
  route: (strings: TemplateStringsArray) => strings[0],
}));

import api from '@forge/api';
import {
  listPullRequestsAction,
  getPullRequestAction,
  getPullRequestDiffAction,
  getPullRequestCommentsAction,
  createPullRequestAction,
  approvePullRequestAction,
  mergePullRequestAction,
} from './pull-requests';

describe('Bitbucket Pull Request Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPullRequestsAction', () => {
    it('should return list of pull requests', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            id: 1,
            title: 'Test PR',
            description: 'A test pull request',
            state: 'OPEN',
            author: { display_name: 'Test User' },
            source: { branch: { name: 'feature' }, repository: { full_name: 'workspace/repo' }, commit: { hash: 'abc', type: 'commit' } },
            destination: { branch: { name: 'main' }, repository: { full_name: 'workspace/repo' }, commit: { hash: 'def', type: 'commit' } },
            created_on: '2024-01-01T00:00:00.000Z',
            updated_on: '2024-01-02T00:00:00.000Z',
            close_source_branch: false,
            comment_count: 2,
            task_count: 0,
            participants: [],
            reviewers: [],
            links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/1' } },
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await listPullRequestsAction({
        payload: { workspace: 'workspace', repo: 'test-repo' },
      });

      expect(result.status).toBe('success');
      expect(result.pullRequests).toHaveLength(1);
      expect(result.pullRequests[0].title).toBe('Test PR');
    });
  });

  describe('getPullRequestAction', () => {
    it('should return pull request details', async () => {
      const mockResponse = {
        id: 1,
        title: 'Test PR',
        description: 'A test pull request',
        state: 'OPEN',
        author: { display_name: 'Test User' },
        source: { branch: { name: 'feature' }, repository: { full_name: 'workspace/repo' }, commit: { hash: 'abc', type: 'commit' } },
        destination: { branch: { name: 'main' }, repository: { full_name: 'workspace/repo' }, commit: { hash: 'def', type: 'commit' } },
        created_on: '2024-01-01T00:00:00.000Z',
        updated_on: '2024-01-02T00:00:00.000Z',
        close_source_branch: false,
        comment_count: 2,
        task_count: 0,
        participants: [{ user: { display_name: 'Reviewer' }, role: 'REVIEWER', approved: true, state: 'approved' }],
        reviewers: [],
        links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/1' } },
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await getPullRequestAction({
        payload: { workspace: 'workspace', repo: 'test-repo', id: 1 },
      });

      expect(result.status).toBe('success');
      expect(result.pullRequest?.title).toBe('Test PR');
      expect(result.pullRequest?.sourceBranch).toBe('feature');
    });
  });

  describe('getPullRequestDiffAction', () => {
    it('should return pull request diff', async () => {
      const mockDiff = 'diff --git a/src/index.ts b/src/index.ts';

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockDiff),
      });

      const result = await getPullRequestDiffAction({
        payload: { workspace: 'workspace', repo: 'test-repo', id: 1 },
      });

      expect(result.status).toBe('success');
    });
  });

  describe('getPullRequestCommentsAction', () => {
    it('should return list of comments', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            id: 1,
            content: { raw: 'Great work!', markup: 'markdown', html: '<p>Great work!</p>' },
            user: { display_name: 'Reviewer' },
            created_on: '2024-01-01T00:00:00.000Z',
            updated_on: '2024-01-02T00:00:00.000Z',
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await getPullRequestCommentsAction({
        payload: { workspace: 'workspace', repo: 'test-repo', id: 1 },
      });

      expect(result.status).toBe('success');
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].content).toBe('Great work!');
    });
  });

  describe('createPullRequestAction', () => {
    it('should create a new pull request', async () => {
      const mockResponse = {
        id: 2,
        title: 'New PR',
        links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/2' } },
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await createPullRequestAction({
        payload: {
          workspace: 'workspace',
          repo: 'test-repo',
          title: 'New PR',
          description: 'Description',
          sourceBranch: 'feature',
          destinationBranch: 'main',
        },
      });

      expect(result.status).toBe('success');
      expect(result.pullRequest?.id).toBe(2);
    });
  });

  describe('approvePullRequestAction', () => {
    it('should approve a pull request', async () => {
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await approvePullRequestAction({
        payload: { workspace: 'workspace', repo: 'test-repo', id: 1 },
      });

      expect(result.status).toBe('success');
      expect(result.message).toContain('approved');
    });
  });

  describe('mergePullRequestAction', () => {
    it('should merge a pull request', async () => {
      const mockResponse = {
        id: 1,
        state: 'MERGED',
        merge_commit: { hash: 'merged123', type: 'commit' },
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await mergePullRequestAction({
        payload: { workspace: 'workspace', repo: 'test-repo', id: 1 },
      });

      expect(result.status).toBe('success');
      expect(result.pullRequest?.state).toBe('MERGED');
    });
  });
});
