/**
 * Confluence integration types for CLI
 */

export interface ConfluenceCredentials {
  /**
   * Confluence instance URL (e.g., https://your-domain.atlassian.net/wiki)
   */
  instanceUrl: string;

  /**
   * User email for authentication
   */
  email: string;

  /**
   * API token (encrypted when stored)
   */
  apiToken: string;
}

export interface StoredConfluenceCredentials {
  instanceUrl: string;
  email: string;
  encryptedToken: string;
}

export interface ConfluenceUserProfile {
  accountId: string;
  email: string;
  publicName: string;
  displayName?: string;
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  parentId?: string;
  version: {
    number: number;
    message?: string;
    createdAt: string;
  };
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
  };
  _links?: {
    webui?: string;
    base?: string;
  };
}

export interface ConfluenceCreatePageRequest {
  spaceId: string;
  title: string;
  body: {
    representation: 'storage';
    value: string;
  };
  parentId?: string;
  status?: 'current' | 'draft';
}

export interface ConfluenceUpdatePageRequest {
  id: string;
  title: string;
  body: {
    representation: 'storage';
    value: string;
  };
  version: {
    number: number;
    message?: string;
  };
  status?: 'current' | 'draft';
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  _links?: {
    next?: string;
  };
}

export interface ConfluenceSpaceSearchResult {
  results: ConfluenceSpace[];
  _links?: {
    next?: string;
  };
}
