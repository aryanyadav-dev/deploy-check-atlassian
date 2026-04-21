import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BitbucketCredentialsStore } from './credentials-store';

describe('BitbucketCredentialsStore', () => {
  const originalEnv = { ...process.env };
  let tempHome: string;
  let store: BitbucketCredentialsStore;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bitbucket-creds-'));
    process.env = { ...originalEnv };
    delete process.env.BITBUCKET_WORKSPACE;
    delete process.env.BITBUCKET_USERNAME;
    delete process.env.BITBUCKET_API_TOKEN;
    store = new BitbucketCredentialsStore();
    (store as unknown as { getCredentialsPath: () => string }).getCredentialsPath = () =>
      path.join(tempHome, '.deploy-check', 'credentials.json');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('stores encrypted tokens and returns decrypted credentials', () => {
    store.saveBitbucketCredentials({
      workspace: 'acme',
      username: 'arya',
      apiToken: 'secret-token',
    });

    const raw = JSON.parse(fs.readFileSync(store.getStorePath(), 'utf-8')) as {
      bitbucket: { encryptedToken: string };
    };

    expect(raw.bitbucket.encryptedToken).not.toBe('secret-token');
    expect(store.getBitbucketCredentials()).toEqual({
      workspace: 'acme',
      username: 'arya',
      apiToken: 'secret-token',
    });
  });

  it('prefers environment variables over stored credentials', () => {
    store.saveBitbucketCredentials({
      workspace: 'stored-workspace',
      username: 'stored-user',
      apiToken: 'stored-token',
    });

    process.env.BITBUCKET_WORKSPACE = 'env-workspace';
    process.env.BITBUCKET_USERNAME = 'env-user';
    process.env.BITBUCKET_API_TOKEN = 'env-token';

    expect(store.getBitbucketCredentials()).toEqual({
      workspace: 'env-workspace',
      username: 'env-user',
      apiToken: 'env-token',
    });
  });

  it('reads legacy plaintext tokens for backward compatibility', () => {
    fs.mkdirSync(path.dirname(store.getStorePath()), { recursive: true });
    fs.writeFileSync(
      store.getStorePath(),
      JSON.stringify(
        {
          bitbucket: {
            workspace: 'legacy-space',
            username: 'legacy-user',
            encryptedToken: 'legacy-plain-token',
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    expect(store.getBitbucketCredentials()).toEqual({
      workspace: 'legacy-space',
      username: 'legacy-user',
      apiToken: 'legacy-plain-token',
    });
  });
});
