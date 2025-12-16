/**
 * Storage Service
 *
 * Handles Forge storage operations for configuration and caching.
 * Uses Forge storage API for persistent key-value storage.
 *
 * Requirements: 4.3, 4.4
 */

import { storage } from '@forge/api';
import type { ProjectConfig, AnalysisResult } from '../types';
import { validateConfig, type ValidationResult } from './validation.service';

/**
 * Storage key prefixes for different data types
 */
const STORAGE_KEYS = {
  CONFIG: 'config:',
  CACHE: 'cache:',
  CACHE_META: 'cache-meta:',
} as const;

/**
 * Cache metadata for TTL handling
 */
interface CacheMetadata {
  expiresAt: number; // Unix timestamp in milliseconds
  createdAt: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ProjectConfig = {
  coverageThreshold: 80,
  enabledAnalyzers: ['coverage', 'openapi', 'permission', 'sql-migration', 'typescript', 'undocumented-api'],
  autoPublish: false,
  severityThreshold: 'MEDIUM',
};

/**
 * Validation error for configuration
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Interface for storage service operations
 */
export interface IStorageService {
  getConfig(projectKey: string): Promise<ProjectConfig | null>;
  setConfig(projectKey: string, config: ProjectConfig): Promise<void>;
  cacheResult(key: string, result: AnalysisResult, ttl: number): Promise<void>;
  getCachedResult(key: string): Promise<AnalysisResult | null>;
}

/**
 * Storage service implementation using Forge storage API
 */
export class StorageService implements IStorageService {
  /**
   * Get project configuration from Forge storage
   *
   * @param projectKey - The Jira project key
   * @returns The project configuration or null if not found
   */
  async getConfig(projectKey: string): Promise<ProjectConfig | null> {
    const key = `${STORAGE_KEYS.CONFIG}${projectKey}`;
    const stored = await storage.get(key);

    if (!stored) {
      return null;
    }

    return stored as ProjectConfig;
  }

  /**
   * Save project configuration to Forge storage with validation
   *
   * @param projectKey - The Jira project key
   * @param config - The configuration to save
   * @throws ConfigValidationError if configuration is invalid
   */
  async setConfig(projectKey: string, config: ProjectConfig): Promise<void> {
    this.validateConfigInternal(config);

    const key = `${STORAGE_KEYS.CONFIG}${projectKey}`;
    await storage.set(key, config);
  }

  /**
   * Cache an analysis result with TTL
   *
   * @param key - Cache key identifier
   * @param result - The analysis result to cache
   * @param ttl - Time to live in milliseconds
   */
  async cacheResult(key: string, result: AnalysisResult, ttl: number): Promise<void> {
    const cacheKey = `${STORAGE_KEYS.CACHE}${key}`;
    const metaKey = `${STORAGE_KEYS.CACHE_META}${key}`;

    const now = Date.now();
    const metadata: CacheMetadata = {
      expiresAt: now + ttl,
      createdAt: now,
    };

    // Store both the result and metadata
    await Promise.all([
      storage.set(cacheKey, this.serializeForCache(result)),
      storage.set(metaKey, metadata),
    ]);
  }

  /**
   * Get a cached analysis result if not expired
   *
   * @param key - Cache key identifier
   * @returns The cached result or null if not found/expired
   */
  async getCachedResult(key: string): Promise<AnalysisResult | null> {
    const cacheKey = `${STORAGE_KEYS.CACHE}${key}`;
    const metaKey = `${STORAGE_KEYS.CACHE_META}${key}`;

    // Fetch metadata first to check expiry
    const metadata = (await storage.get(metaKey)) as CacheMetadata | null;

    if (!metadata) {
      return null;
    }

    // Check if cache has expired
    if (Date.now() > metadata.expiresAt) {
      // Clean up expired cache entries
      await Promise.all([storage.delete(cacheKey), storage.delete(metaKey)]);
      return null;
    }

    const cached = await storage.get(cacheKey);

    if (!cached) {
      return null;
    }

    return this.deserializeFromCache(cached);
  }

  /**
   * Validate configuration values using the validation service
   *
   * @param config - Configuration to validate
   * @throws ConfigValidationError if validation fails
   */
  private validateConfigInternal(config: ProjectConfig): void {
    const result: ValidationResult = validateConfig(config);

    if (!result.valid && result.errors.length > 0) {
      const firstError = result.errors[0];
      throw new ConfigValidationError(
        firstError.message,
        firstError.field,
        firstError.value
      );
    }
  }

  /**
   * Serialize analysis result for cache storage
   * Converts Date to ISO string for JSON compatibility
   */
  private serializeForCache(result: AnalysisResult): Record<string, unknown> {
    return {
      ...result,
      timestamp: result.timestamp.toISOString(),
    };
  }

  /**
   * Deserialize cached data back to AnalysisResult
   * Converts ISO string back to Date
   */
  private deserializeFromCache(cached: unknown): AnalysisResult {
    const data = cached as Record<string, unknown>;
    return {
      ...data,
      timestamp: new Date(data.timestamp as string),
    } as AnalysisResult;
  }
}

/**
 * Merge project configuration with defaults
 * Project values override defaults, missing values fall back to defaults
 *
 * @param projectConfig - Partial project configuration
 * @param defaults - Default configuration values
 * @returns Merged configuration with all required fields
 *
 * Requirements: 4.4
 */
export function mergeWithDefaults(
  projectConfig: Partial<ProjectConfig> | null | undefined,
  defaults: ProjectConfig = DEFAULT_CONFIG
): ProjectConfig {
  if (!projectConfig) {
    return { ...defaults };
  }

  return {
    coverageThreshold: projectConfig.coverageThreshold ?? defaults.coverageThreshold,
    enabledAnalyzers: projectConfig.enabledAnalyzers ?? defaults.enabledAnalyzers,
    confluenceSpaceKey: projectConfig.confluenceSpaceKey ?? defaults.confluenceSpaceKey,
    autoPublish: projectConfig.autoPublish ?? defaults.autoPublish,
    severityThreshold: projectConfig.severityThreshold ?? defaults.severityThreshold,
  };
}
