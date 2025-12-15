import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import prompts from 'prompts';
import { configLoader } from '../config/loader';
import { DeployCheckConfig, DEFAULT_CONFIG } from '../config/types';

const CONFIG_FILENAME = '.deploy-check.json';

export const configCommand = new Command('config')
  .description('Manage deploy-check configuration');

/**
 * Generate default configuration content
 */
function generateDefaultConfig(options: {
  coverageThreshold: number;
  ignoredPaths: string[];
}): DeployCheckConfig {
  return {
    coverageThreshold: options.coverageThreshold,
    ignoredPaths: options.ignoredPaths,
    outputFormat: DEFAULT_CONFIG.outputFormat,
    baseRef: DEFAULT_CONFIG.baseRef,
    failOn: DEFAULT_CONFIG.failOn,
  };
}

/**
 * Parse comma-separated paths into array
 */
function parseIgnoredPaths(input: string): string[] {
  if (!input || input.trim() === '') {
    return [];
  }
  return input
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

configCommand
  .command('init')
  .description('Initialize a new configuration file')
  .option('--force', 'Overwrite existing configuration file')
  .option('--non-interactive', 'Use default values without prompts')
  .action(async (options) => {
    const parentOpts = configCommand.parent?.opts() ?? {};
    const verbose = parentOpts.verbose ?? false;

    const configPath = path.resolve(process.cwd(), CONFIG_FILENAME);

    // Check if config file already exists
    if (fs.existsSync(configPath) && !options.force) {
      console.error(
        chalk.red(`Configuration file already exists: ${configPath}`)
      );
      console.error(chalk.yellow('Use --force to overwrite'));
      process.exit(1);
    }

    let coverageThreshold = DEFAULT_CONFIG.coverageThreshold;
    let ignoredPaths: string[] = [];

    if (!options.nonInteractive) {
      // Interactive prompts
      const response = await prompts([
        {
          type: 'number',
          name: 'coverageThreshold',
          message: 'Coverage threshold percentage (0-100)',
          initial: DEFAULT_CONFIG.coverageThreshold,
          min: 0,
          max: 100,
          validate: (value) =>
            value >= 0 && value <= 100
              ? true
              : 'Must be between 0 and 100',
        },
        {
          type: 'text',
          name: 'ignoredPaths',
          message: 'Paths to ignore (comma-separated glob patterns)',
          initial: 'node_modules/**,dist/**,coverage/**',
        },
      ]);

      // Handle user cancellation (Ctrl+C)
      if (response.coverageThreshold === undefined) {
        console.log(chalk.yellow('\nConfiguration cancelled.'));
        process.exit(0);
      }

      coverageThreshold = response.coverageThreshold;
      ignoredPaths = parseIgnoredPaths(response.ignoredPaths || '');
    } else {
      // Non-interactive mode: use defaults
      ignoredPaths = ['node_modules/**', 'dist/**', 'coverage/**'];
    }

    const config = generateDefaultConfig({
      coverageThreshold,
      ignoredPaths,
    });

    if (verbose) {
      console.log(chalk.gray('Generated configuration:'));
      console.log(chalk.gray(JSON.stringify(config, null, 2)));
    }

    // Write configuration file
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log(chalk.green(`✓ Configuration file created: ${configPath}`));
      console.log();
      console.log(chalk.gray('You can customize the configuration by editing the file.'));
      console.log(chalk.gray('Run `deploy-check config show` to view the current configuration.'));
    } catch (error) {
      console.error(chalk.red(`Failed to write configuration file: ${error}`));
      process.exit(1);
    }
  });

configCommand
  .command('show')
  .description('Display current effective configuration')
  .action(async () => {
    const parentOpts = configCommand.parent?.opts() ?? {};
    const verbose = parentOpts.verbose ?? false;
    const configPathOption = parentOpts.config as string | undefined;

    try {
      // Get config file path
      const configPath = await configLoader.getConfigPath(configPathOption);

      // Load and merge configuration
      const config = await configLoader.load(configPathOption);

      // Display config file location
      console.log(chalk.bold('Configuration'));
      console.log(chalk.gray('─'.repeat(50)));

      if (configPath) {
        console.log(chalk.cyan('Config file:'), configPath);
      } else {
        console.log(chalk.yellow('Config file:'), 'Not found (using defaults)');
      }
      console.log();

      // Display effective configuration
      console.log(chalk.bold('Effective Configuration'));
      console.log(chalk.gray('─'.repeat(50)));

      // Core settings
      console.log(chalk.cyan('Coverage threshold:'), `${config.coverageThreshold}%`);
      console.log(chalk.cyan('Output format:'), config.outputFormat);
      console.log(chalk.cyan('Base ref:'), config.baseRef);
      console.log(chalk.cyan('Fail on:'), config.failOn);

      // Paths
      if (config.coveragePath) {
        console.log(chalk.cyan('Coverage path:'), config.coveragePath);
      }
      if (config.openapiPath) {
        console.log(chalk.cyan('OpenAPI path:'), config.openapiPath);
      }

      // Ignored paths
      if (config.ignoredPaths && config.ignoredPaths.length > 0) {
        console.log(chalk.cyan('Ignored paths:'));
        for (const p of config.ignoredPaths) {
          console.log(chalk.gray(`  - ${p}`));
        }
      }

      // Jira settings
      if (config.jira) {
        console.log();
        console.log(chalk.bold('Jira Integration'));
        console.log(chalk.gray('─'.repeat(50)));
        if (config.jira.instanceUrl) {
          console.log(chalk.cyan('Instance URL:'), config.jira.instanceUrl);
        }
        if (config.jira.projectKey) {
          console.log(chalk.cyan('Project key:'), config.jira.projectKey);
        }
        if (config.jira.autoCreateSeverity) {
          console.log(chalk.cyan('Auto-create severity:'), config.jira.autoCreateSeverity);
        }
      }

      // Confluence settings
      if (config.confluence) {
        console.log();
        console.log(chalk.bold('Confluence Integration'));
        console.log(chalk.gray('─'.repeat(50)));
        if (config.confluence.instanceUrl) {
          console.log(chalk.cyan('Instance URL:'), config.confluence.instanceUrl);
        }
        if (config.confluence.spaceKey) {
          console.log(chalk.cyan('Space key:'), config.confluence.spaceKey);
        }
        if (config.confluence.parentPageId) {
          console.log(chalk.cyan('Parent page ID:'), config.confluence.parentPageId);
        }
      }

      // Show defaults indicator
      console.log();
      console.log(chalk.gray('Values shown are the effective merged configuration.'));
      console.log(chalk.gray('Default values are used where not explicitly configured.'));

      if (verbose) {
        console.log();
        console.log(chalk.bold('Raw Configuration (JSON)'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(JSON.stringify(config, null, 2));
      }
    } catch (error) {
      console.error(chalk.red(`Failed to load configuration: ${error}`));
      process.exit(1);
    }
  });
