/**
 * Bitbucket Repository Operations Tests
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
  listRepositoriesAction,
  getRepositoryAction,
  listBranchesAction,
  listCommitsAction,
  browseSourceAction,
} from './repositories';

describe('Bitbucket Repository Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listRepositoriesAction', () => {
    it('should return success with repositories', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            uuid: '{123}',
            slug: 'test-repo',
            name: 'Test Repo',
            full_name: 'workspace/test-repo',
            description: 'A test repo',
            language: 'typescript',
            is_private: false,
            updated_on: '2024-01-01T00:00:00.000Z',
            size: 1000,
            mainbranch: { name: 'main' },
            links: {
              html: { href: 'https://bitbucket.org/workspace/test-repo' },
              clone: [{ href: 'git@bitbucket.org:workspace/test-repo.git', name: 'ssh' }],
            },
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await listRepositoriesAction({
        payload: { workspace: 'workspace' },
      });

      expect(result.status).toBe('success');
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0].name).toBe('Test Repo');
      expect(result.pagination.size).toBe(1);
    });

    it('should handle errors', async () => {
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: { message: 'Unauthorized' } }),
      });

      const result = await listRepositoriesAction({
        payload: { workspace: 'workspace' },
      });

      expect(result.status).toBe('error');
      expect(result.message).toContain('Unauthorized');
    });
  });

  describe('getRepositoryAction', () => {
    it('should return repository details', async () => {
      const mockResponse = {
        uuid: '{123}',
        slug: 'test-repo',
        name: 'Test Repo',
        full_name: 'workspace/test-repo',
        description: 'A test repo',
        language: 'typescript',
        is_private: false,
        created_on: '2024-01-01T00:00:00.000Z',
        updated_on: '2024-01-02T00:00:00.000Z',
        size: 1000,
        mainbranch: { name: 'main' },
        scm: 'git',
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await getRepositoryAction({
        payload: { workspace: 'workspace', repo: 'test-repo' },
      });

      expect(result.status).toBe('success');
      expect(result.repository?.name).toBe('Test Repo');
      expect(result.repository?.language).toBe('typescript');
    });
  });

  describe('listBranchesAction', () => {
    it('should return list of branches', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            name: 'main',
            type: 'branch',
            target: {
              type: 'commit',
              hash: 'abc123',
              date: '2024-01-01T00:00:00.000Z',
              message: 'Initial commit',
              author: { display_name: 'Test User' },
            },
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await listBranchesAction({
        payload: { workspace: 'workspace', repo: 'test-repo' },
      });

      expect(result.status).toBe('success');
      expect(result.branches).toHaveLength(1);
      expect(result.branches[0].name).toBe('main');
    });
  });

  describe('listCommitsAction', () => {
    it('should return list of commits', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            hash: 'abc123',
            type: 'commit',
            message: 'Initial commit',
            date: '2024-01-01T00:00:00.000Z',
            author: { display_name: 'Test User' },
            parents: [],
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await listCommitsAction({
        payload: { workspace: 'workspace', repo: 'test-repo' },
      });

      expect(result.status).toBe('success');
      expect(result.commits).toHaveLength(1);
      expect(result.commits[0].hash).toBe('abc123');
    });
  });

  describe('browseSourceAction', () => {
    it('should return directory listing', async () => {
      const mockResponse = {
        size: 2,
        page: 1,
        pagelen: 10,
        values: [
          { path: 'src/index.ts', type: 'commit_file', size: 100 },
          { path: 'src/utils.ts', type: 'commit_file', size: 200 },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await browseSourceAction({
        payload: { workspace: 'workspace', repo: 'test-repo', path: 'src' },
      });

      expect(result.status).toBe('success');
      expect(result.type).toBe('directory');
      expect(result.entries).toHaveLength(2);
    });
  });
});
