import { BitbucketClient } from './bitbucket-client';

describe('BitbucketClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses Basic auth with the configured identifier and token', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        size: 0,
        page: 1,
        pagelen: 10,
        values: [],
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const client = new BitbucketClient({
      workspace: 'acme',
      username: 'arya@example.com',
      apiToken: 'secret-token',
    });

    await client.listRepositories();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/acme',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('arya@example.com:secret-token').toString('base64')}`,
        }),
      })
    );
  });

  it('adds a helpful hint to 401 errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"type":"error"}',
    }) as typeof fetch;

    const client = new BitbucketClient({
      workspace: 'acme',
      username: 'arya',
      apiToken: 'secret-token',
    });

    await expect(client.listRepositories()).rejects.toThrow(
      'Bitbucket API tokens require Basic auth with your Atlassian account email'
    );
  });

  it('validates workspace access without requiring the user profile scope', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        size: 0,
        page: 1,
        pagelen: 1,
        values: [],
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const client = new BitbucketClient({
      workspace: 'deploycheck',
      username: 'arya@example.com',
      apiToken: 'secret-token',
    });

    await client.validateWorkspaceAccess();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/deploycheck?pagelen=1',
      expect.any(Object)
    );
  });
});
