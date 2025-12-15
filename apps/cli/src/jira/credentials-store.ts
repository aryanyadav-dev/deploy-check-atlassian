import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { encryptionService } from '../auth';
import { JiraCredentials, StoredJiraCredentials } from './types';

const CREDENTIALS_DIR = '.deploy-check';
const CREDENTIALS_FILE = 'credentials.json';

export interface ConfluenceCredentials {
  instanceUrl: string;
  email: string;
  apiToken: string;
}

export interface StoredConfluenceCredentials {
  instanceUrl: string;
  email: string;
  encryptedToken: string;
}

interface StoredCredentials {
  jira?: StoredJiraCredentials;
  confluence?: StoredConfluenceCredentials;
}

/**
 * Manages secure storage of integration credentials
 */
export class CredentialsStore {
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
      return JSON.parse(content) as StoredCredentials;
    } catch {
      return {};
    }
  }

  private saveCredentials(credentials: StoredCredentials): void {
    this.ensureCredentialsDir();
    const credPath = this.getCredentialsPath();
    fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
  }

  /**
   * Store Jira credentials securely
   */
  storeJiraCredentials(credentials: JiraCredentials): void {
    const stored = this.loadCredentials();
    stored.jira = {
      instanceUrl: credentials.instanceUrl,
      email: credentials.email,
      encryptedToken: encryptionService.encrypt(credentials.apiToken),
    };
    this.saveCredentials(stored);
  }

  /**
   * Retrieve Jira credentials
   */
  getJiraCredentials(): JiraCredentials | null {
    const stored = this.loadCredentials();
    if (!stored.jira) {
      return null;
    }

    try {
      return {
        instanceUrl: stored.jira.instanceUrl,
        email: stored.jira.email,
        apiToken: encryptionService.decrypt(stored.jira.encryptedToken),
      };
    } catch {
      // Decryption failed, credentials may be corrupted
      return null;
    }
  }

  /**
   * Check if Jira credentials are stored
   */
  hasJiraCredentials(): boolean {
    const stored = this.loadCredentials();
    return !!stored.jira;
  }

  /**
   * Remove Jira credentials
   */
  removeJiraCredentials(): void {
    const stored = this.loadCredentials();
    delete stored.jira;
    this.saveCredentials(stored);
  }

  /**
   * Get the path where credentials are stored
   */
  getStorePath(): string {
    return this.getCredentialsPath();
  }

  /**
   * Store Confluence credentials securely
   */
  storeConfluenceCredentials(credentials: ConfluenceCredentials): void {
    const stored = this.loadCredentials();
    stored.confluence = {
      instanceUrl: credentials.instanceUrl,
      email: credentials.email,
      encryptedToken: encryptionService.encrypt(credentials.apiToken),
    };
    this.saveCredentials(stored);
  }

  /**
   * Retrieve Confluence credentials
   */
  getConfluenceCredentials(): ConfluenceCredentials | null {
    const stored = this.loadCredentials();
    if (!stored.confluence) {
      return null;
    }

    try {
      return {
        instanceUrl: stored.confluence.instanceUrl,
        email: stored.confluence.email,
        apiToken: encryptionService.decrypt(stored.confluence.encryptedToken),
      };
    } catch {
      // Decryption failed, credentials may be corrupted
      return null;
    }
  }

  /**
   * Check if Confluence credentials are stored
   */
  hasConfluenceCredentials(): boolean {
    const stored = this.loadCredentials();
    return !!stored.confluence;
  }

  /**
   * Remove Confluence credentials
   */
  removeConfluenceCredentials(): void {
    const stored = this.loadCredentials();
    delete stored.confluence;
    this.saveCredentials(stored);
  }
}

/**
 * Singleton instance for convenience
 */
export const credentialsStore = new CredentialsStore();
