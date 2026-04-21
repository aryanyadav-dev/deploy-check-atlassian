/**
 * Bitbucket Credentials Store
 *
 * Manages secure storage of Bitbucket credentials using app password authentication.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { encryptionService } from '../auth';
import { BitbucketCredentials, StoredBitbucketCredentials } from './types';

const CREDENTIALS_DIR = '.deploy-check';
const CREDENTIALS_FILE = 'credentials.json';

interface StoredCredentials {
  bitbucket?: StoredBitbucketCredentials;
}

/**
 * Manages secure storage of Bitbucket credentials
 */
export class BitbucketCredentialsStore {
  private getCredentialsPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, CREDENTIALS_DIR, CREDENTIALS_FILE);
  }

  private ensureCredentialsDir(): void {
    const dir = path.dirname(this.getCredentialsPath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private loadCredentials(): StoredCredentials {
    const credPath = this.getCredentialsPath();
    if (!fs.existsSync(credPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(credPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private saveCredentials(credentials: StoredCredentials): void {
    this.ensureCredentialsDir();
    const credPath = this.getCredentialsPath();
    fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  private decryptStoredToken(encryptedToken: string): string {
    try {
      return encryptionService.decrypt(encryptedToken);
    } catch {
      // Support tokens stored in plaintext by earlier Bitbucket CLI builds.
      return encryptedToken;
    }
  }

  /**
   * Check if Bitbucket credentials exist
   */
  hasBitbucketCredentials(): boolean {
    const stored = this.loadCredentials();
    return !!stored.bitbucket;
  }

  /**
   * Get stored Bitbucket credentials
   * Priority: Environment variables > Stored credentials
   */
  getBitbucketCredentials(): BitbucketCredentials | null {
    // Check environment variables first
    if (process.env.BITBUCKET_WORKSPACE && process.env.BITBUCKET_USERNAME && process.env.BITBUCKET_API_TOKEN) {
      return {
        workspace: process.env.BITBUCKET_WORKSPACE,
        username: process.env.BITBUCKET_USERNAME,
        apiToken: process.env.BITBUCKET_API_TOKEN,
      };
    }

    // Fall back to stored credentials
    const stored = this.loadCredentials();
    if (!stored.bitbucket) {
      return null;
    }

    return {
      workspace: stored.bitbucket.workspace,
      username: stored.bitbucket.username,
      apiToken: this.decryptStoredToken(stored.bitbucket.encryptedToken),
    };
  }

  /**
   * Save Bitbucket credentials securely
   */
  saveBitbucketCredentials(credentials: BitbucketCredentials): void {
    const stored = this.loadCredentials();
    stored.bitbucket = {
      workspace: credentials.workspace,
      username: credentials.username,
      encryptedToken: encryptionService.encrypt(credentials.apiToken),
    };
    this.saveCredentials(stored);
  }

  /**
   * Remove Bitbucket credentials
   */
  removeBitbucketCredentials(): void {
    const stored = this.loadCredentials();
    delete stored.bitbucket;
    this.saveCredentials(stored);
  }

  /**
   * Get the path where credentials are stored
   */
  getStorePath(): string {
    return this.getCredentialsPath();
  }
}

export const bitbucketCredentialsStore = new BitbucketCredentialsStore();
