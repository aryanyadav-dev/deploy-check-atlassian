import { cosmiconfig } from 'cosmiconfig';
import * as path from 'path';
import * as fs from 'fs';
import { DeployCheckConfig, DEFAULT_CONFIG } from './types';

const MODULE_NAME = 'deploy-check';

/**
 * Configuration loader using cosmiconfig
 * Searches for configuration in the following order:
 * 1. --config CLI option path
 * 2. .deploy-check.json in current directory
 * 3. .deploy-check.yaml in current directory
 * 4. .deploy-check.yml in current directory
 * 5. deploy-check.config.js in current directory
 * 6. "deploy-check" key in package.json
 * 7. Same search in parent directories up to home directory
 */
export class ConfigLoader {
  private explorer = cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      'package.json',
      `.${MODULE_NAME}.json`,
      `.${MODULE_NAME}.yaml`,
      `.${MODULE_NAME}.yml`,
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.cjs`,
    ],
  });

  /**
   * Load configuration from file or search for it
   * @param configPath Optional explicit path to config file
   * @returns Merged configuration with defaults
   */
  async load(configPath?: string): Promise<DeployCheckConfig> {
    let result;

    if (configPath) {
      // Load from explicit path
      const absolutePath = path.resolve(configPath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found: ${absolutePath}`);
      }
      result = await this.explorer.load(absolutePath);
    } else {
      // Search for config file
      result = await this.explorer.search();
    }

    const userConfig = result?.config ?? {};
    return this.mergeWithDefaults(userConfig);
  }

  /**
   * Get the path where config was found
   * @param configPath Optional explicit path to config file
   * @returns Path to config file or null if not found
   */
  async getConfigPath(configPath?: string): Promise<string | null> {
    if (configPath) {
      const absolutePath = path.resolve(configPath);
      return fs.existsSync(absolutePath) ? absolutePath : null;
    }

    const result = await this.explorer.search();
    return result?.filepath ?? null;
  }

  /**
   * Merge user configuration with defaults
   */
  private mergeWithDefaults(userConfig: Partial<DeployCheckConfig>): DeployCheckConfig {
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      jira: userConfig.jira,
      confluence: userConfig.confluence,
    };
  }

  /**
   * Validate configuration values
   * @throws Error if configuration is invalid
   */
  validate(config: DeployCheckConfig): void {
    if (config.coverageThreshold !== undefined) {
      if (typeof config.coverageThreshold !== 'number' || 
          config.coverageThreshold < 0 || 
          config.coverageThreshold > 100) {
        throw new Error('coverageThreshold must be a number between 0 and 100');
      }
    }

    if (config.ignoredPaths !== undefined) {
      if (!Array.isArray(config.ignoredPaths)) {
        throw new Error('ignoredPaths must be an array of strings');
      }
      for (const p of config.ignoredPaths) {
        if (typeof p !== 'string') {
          throw new Error('ignoredPaths must contain only strings');
        }
      }
    }

    if (config.outputFormat !== undefined) {
      const validFormats = ['terminal', 'json', 'markdown'];
      if (!validFormats.includes(config.outputFormat)) {
        throw new Error(`outputFormat must be one of: ${validFormats.join(', ')}`);
      }
    }

    if (config.failOn !== undefined) {
      const validLevels = ['low', 'medium', 'high', 'critical'];
      if (!validLevels.includes(config.failOn)) {
        throw new Error(`failOn must be one of: ${validLevels.join(', ')}`);
      }
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const configLoader = new ConfigLoader();
