/**
 * Bitbucket API Client Tests
 *
 * Tests for the Bitbucket API client and all operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @forge/api module
vi.mock('@forge/api', () => ({
  default: {
    fetch: vi.fn(),
  },
  route: (strings: TemplateStringsArray) => strings[0],
}));

import api from '@forge/api';
import { BitbucketClient, BitbucketApiClientError } from './client';

describe('BitbucketClient', () => {
  let client: BitbucketClient;

  beforeEach(() => {
    client = new BitbucketClient();
    vi.clearAllMocks();
  });

  describe('request', () => {
    it('should make a GET request successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: 'test' }),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await client.request<{ data: string }>('test', {
        method: 'GET',
      });

      expect(result).toEqual({ data: 'test' });
      expect(api.fetch).toHaveBeenCalled();
    });

    it('should make a POST request with body', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await client.request<{ id: number }>('test', {
        method: 'POST',
        body: { name: 'test' },
      });

      expect(result).toEqual({ id: 1 });
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ error: { message: 'Not found' } }),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await expect(
        client.request('test', { method: 'GET' })
      ).rejects.toThrow(BitbucketApiClientError);
    });

    it('should handle 204 No Content', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await client.request('test', { method: 'DELETE' });
      expect(result).toEqual({});
    });
  });

  describe('HTTP methods', () => {
    it('should make GET requests', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: 'test' }),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.get<{ data: string }>('test');
      expect(api.fetch).toHaveBeenCalled();
    });

    it('should make POST requests', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.post<{ id: number }>('test', { body: 'test' });
      expect(api.fetch).toHaveBeenCalled();
    });

    it('should make PUT requests', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ updated: true }),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.put<{ updated: boolean }>('test', { body: 'test' });
      expect(api.fetch).toHaveBeenCalled();
    });

    it('should make DELETE requests', async () => {
      const mockResponse = {
        ok: true,
        status: 204,
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.delete('test');
      expect(api.fetch).toHaveBeenCalled();
    });
  });

  describe('URL building', () => {
    it('should call fetch with URL', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.get('repositories/test');
      expect(api.fetch).toHaveBeenCalled();
    });

    it('should call fetch with query parameters', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.get('test', { page: 1, pagelen: 10 });
      expect(api.fetch).toHaveBeenCalled();
    });

    it('should call fetch with full URL', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      };
      (api.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      await client.get('https://api.bitbucket.org/2.0/test');
      expect(api.fetch).toHaveBeenCalled();
    });
  });
});

describe('BitbucketApiClientError', () => {
  it('should create error with status and message', () => {
    const error = new BitbucketApiClientError(404, 'Not found');

    expect(error.name).toBe('BitbucketApiClientError');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
  });
});
