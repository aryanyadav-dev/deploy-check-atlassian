/**
 * Config Resolver
 *
 * Handles project settings panel requests for configuration management.
 * Loads and saves configuration via StorageService.
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import Resolver from '@forge/resolver';
import {
  StorageService,
  mergeWithDefaults,
  DEFAULT_CONFIG,
  ConfigValidationError,
} from '../services/storage.service';
import { validateConfig, type ValidationError } from '../services/validation.service';
import type { ProjectConfig } from '../types';

const resolver = new Resolver();
const storageService = new StorageService();

/**
 * Forge resolver request context types
 */
interface ForgeContext {
  extension?: {
    project?: { key: string };
  };
}

interface ResolverRequest<T = unknown> {
  payload?: T;
  context: ForgeContext;
}

/**
 * Available analyzers that can be enabled/disabled
 */
const AVAILABLE_ANALYZERS = [
  { id: 'coverage', name: 'Test Coverage', description: 'Analyzes test coverage for changed files' },
  { id: 'openapi', name: 'OpenAPI', description: 'Detects breaking API changes in OpenAPI specs' },
  { id: 'permission', name: 'Permissions', description: 'Identifies permission and security changes' },
  { id: 'sql-migration', name: 'SQL Migration', description: 'Analyzes database migration risks' },
  { id: 'typescript', name: 'TypeScript', description: 'Detects TypeScript breaking changes' },
  { id: 'undocumented-api', name: 'Undocumented API', description: 'Finds undocumented API endpoints' },
];

/**
 * Response structure for config operations
 */
interface ConfigResponse {
  status: 'success' | 'error' | 'validation_error';
  message?: string;
  config?: ProjectConfig;
  availableAnalyzers?: typeof AVAILABLE_ANALYZERS;
  validationErrors?: ValidationError[];
}

/**
 * Get configuration for a project
 * Requirement 4.1: Display a configuration panel
 */
resolver.define(
  'getConfig',
  async (args: ResolverRequest) => {
    const projectKey = args.context?.extension?.project?.key;

    if (!projectKey) {
      return {
        status: 'error',
        message: 'No project context available',
      } as ConfigResponse;
    }

    try {
      // Load project configuration (Requirement 4.3)
      const projectConfig = await storageService.getConfig(projectKey);

      // Merge with defaults (Requirement 4.4)
      const config = mergeWithDefaults(projectConfig, DEFAULT_CONFIG);

      return {
        status: 'success',
        config,
        availableAnalyzers: AVAILABLE_ANALYZERS,
      } as ConfigResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        status: 'error',
        message: `Failed to load configuration: ${errorMessage}`,
      } as ConfigResponse;
    }
  }
);

/**
 * Save configuration for a project
 * Requirements: 4.2, 4.3
 */
resolver.define(
  'saveConfig',
  async (args: ResolverRequest<Partial<ProjectConfig>>) => {
    const projectKey = args.context?.extension?.project?.key;
    const payload = args.payload;

    if (!projectKey) {
      return {
        status: 'error',
        message: 'No project context available',
      } as ConfigResponse;
    }

    if (!payload) {
      return {
        status: 'error',
        message: 'No configuration data provided',
      } as ConfigResponse;
    }

    // Load existing config and merge with new values
    const existingConfig = await storageService.getConfig(projectKey);
    const mergedConfig = mergeWithDefaults(existingConfig, DEFAULT_CONFIG);

    // Apply updates from payload
    const updatedConfig: ProjectConfig = {
      coverageThreshold: payload.coverageThreshold ?? mergedConfig.coverageThreshold,
      enabledAnalyzers: payload.enabledAnalyzers ?? mergedConfig.enabledAnalyzers,
      confluenceSpaceKey: payload.confluenceSpaceKey ?? mergedConfig.confluenceSpaceKey,
      autoPublish: payload.autoPublish ?? mergedConfig.autoPublish,
      severityThreshold: payload.severityThreshold ?? mergedConfig.severityThreshold,
    };

    // Validate configuration before saving (Requirement 4.2)
    const validationResult = validateConfig(updatedConfig);

    if (!validationResult.valid) {
      return {
        status: 'validation_error',
        message: 'Configuration validation failed',
        validationErrors: validationResult.errors,
      } as ConfigResponse;
    }

    try {
      // Save configuration to Forge storage (Requirement 4.3)
      await storageService.setConfig(projectKey, updatedConfig);

      return {
        status: 'success',
        message: 'Configuration saved successfully',
        config: updatedConfig,
        availableAnalyzers: AVAILABLE_ANALYZERS,
      } as ConfigResponse;
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        return {
          status: 'validation_error',
          message: error.message,
          validationErrors: [
            {
              field: error.field,
              message: error.message,
              value: error.value,
            },
          ],
        } as ConfigResponse;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        status: 'error',
        message: `Failed to save configuration: ${errorMessage}`,
      } as ConfigResponse;
    }
  }
);

/**
 * Reset configuration to defaults
 */
resolver.define(
  'resetConfig',
  async (args: ResolverRequest) => {
    const projectKey = args.context?.extension?.project?.key;

    if (!projectKey) {
      return {
        status: 'error',
        message: 'No project context available',
      } as ConfigResponse;
    }

    try {
      // Save default configuration
      await storageService.setConfig(projectKey, DEFAULT_CONFIG);

      return {
        status: 'success',
        message: 'Configuration reset to defaults',
        config: DEFAULT_CONFIG,
        availableAnalyzers: AVAILABLE_ANALYZERS,
      } as ConfigResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        status: 'error',
        message: `Failed to reset configuration: ${errorMessage}`,
      } as ConfigResponse;
    }
  }
);

export const configResolver = resolver.getDefinitions();
