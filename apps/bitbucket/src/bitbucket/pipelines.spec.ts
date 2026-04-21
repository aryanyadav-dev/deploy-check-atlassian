/**
 * Bitbucket Pipeline Operations Tests
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
  listPipelinesAction,
  getPipelineAction,
  getPipelineStepsAction,
  getStepLogsAction,
  triggerPipelineAction,
} from './pipelines';

describe('Bitbucket Pipeline Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPipelinesAction', () => {
    it('should return list of pipelines', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            uuid: '{123}',
            build_number: 1,
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
            trigger: { name: 'MANUAL' },
            target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: 'main' },
            creator: { display_name: 'Test User' },
            created_on: '2024-01-01T00:00:00.000Z',
            completed_on: '2024-01-02T00:00:00.000Z',
            run_number: 1,
            duration_in_seconds: 120,
            links: { html: { href: 'https://bitbucket.org/workspace/repo/pipelines/1' } },
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await listPipelinesAction({
        payload: { workspace: 'workspace', repo: 'test-repo' },
      });

      expect(result.status).toBe('success');
      expect(result.pipelines).toHaveLength(1);
      expect(result.pipelines[0].buildNumber).toBe(1);
      expect(result.pipelines[0].state).toBe('COMPLETED');
    });
  });

  describe('getPipelineAction', () => {
    it('should return pipeline details', async () => {
      const mockResponse = {
        uuid: '{123}',
        build_number: 1,
        state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' }, stage: { name: 'done' } },
        trigger: { name: 'MANUAL' },
        target: {
          type: 'pipeline_ref_target',
          ref_type: 'branch',
          ref_name: 'main',
          commit: { hash: 'abc123', message: 'Test commit', author: { display_name: 'Test User' } },
        },
        creator: { display_name: 'Test User' },
        created_on: '2024-01-01T00:00:00.000Z',
        completed_on: '2024-01-02T00:00:00.000Z',
        run_number: 1,
        duration_in_seconds: 120,
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await getPipelineAction({
        payload: { workspace: 'workspace', repo: 'test-repo', uuid: '{123}' },
      });

      expect(result.status).toBe('success');
      expect(result.pipeline?.buildNumber).toBe(1);
      expect(result.pipeline?.result).toBe('SUCCESSFUL');
    });
  });

  describe('getPipelineStepsAction', () => {
    it('should return pipeline steps', async () => {
      const mockResponse = {
        size: 1,
        page: 1,
        pagelen: 10,
        values: [
          {
            uuid: '{step123}',
            name: 'Build',
            type: 'script',
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
            script_commands: [
              { name: 'npm install', command: 'npm install', exit_code: 0, duration_in_seconds: 30 },
            ],
            image: { name: 'node:18' },
            started_on: '2024-01-01T00:00:00.000Z',
            completed_on: '2024-01-02T00:00:00.000Z',
            duration_in_seconds: 60,
          },
        ],
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await getPipelineStepsAction({
        payload: { workspace: 'workspace', repo: 'test-repo', uuid: '{123}' },
      });

      expect(result.status).toBe('success');
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].name).toBe('Build');
    });
  });

  describe('getStepLogsAction', () => {
    it('should return step logs', async () => {
      const mockLog = 'Starting build...\nInstalling dependencies...\nBuild complete!';

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockLog),
      });

      const result = await getStepLogsAction({
        payload: { workspace: 'workspace', repo: 'test-repo', pipelineUuid: '{123}', stepUuid: '{step123}' },
      });

      expect(result.status).toBe('success');
    });
  });

  describe('triggerPipelineAction', () => {
    it('should trigger a new pipeline', async () => {
      const mockResponse = {
        uuid: '{new123}',
        build_number: 2,
        state: { name: 'PENDING' },
        links: { html: { href: 'https://bitbucket.org/workspace/repo/pipelines/2' } },
      };

      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await triggerPipelineAction({
        payload: { workspace: 'workspace', repo: 'test-repo', branch: 'main' },
      });

      expect(result.status).toBe('success');
      expect(result.pipeline?.buildNumber).toBe(2);
      expect(result.message).toContain('triggered');
    });
  });
});
