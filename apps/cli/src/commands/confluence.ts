import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { ConfluenceClient } from '../confluence/confluence-client';
import { credentialsStore } from '../jira/credentials-store';
import { analysisCacheStore } from '../jira/analysis-cache';
import { createMarkdownFormatter } from '../formatters/markdown.formatter';
import {
  markdownToConfluenceStorage,
  wrapInExpandMacro,
  createPanelMacro,
} from '../confluence/markdown-converter';

export const confluenceCommand = new Command('confluence').description(
  'Confluence integration commands'
);

/**
 * Normalize Confluence instance URL
 */
function normalizeInstanceUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  // Remove trailing slash and /wiki suffix for consistency
  normalized = normalized.replace(/\/$/, '').replace(/\/wiki$/, '');
  return normalized;
}

// Auth subcommand
confluenceCommand
  .command('auth')
  .description('Authenticate with Confluence')
  .option('--logout', 'Remove stored Confluence credentials')
  .action(async (options) => {
    if (options.logout) {
      if (credentialsStore.hasConfluenceCredentials()) {
        credentialsStore.removeConfluenceCredentials();
        console.log(chalk.green('✓ Confluence credentials removed'));
      } else {
        console.log(chalk.yellow('No Confluence credentials stored'));
      }
      return;
    }

    console.log(chalk.bold('Confluence Authentication'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(
      chalk.gray(
        'You will need your Confluence instance URL and an API token.'
      )
    );
    console.log(
      chalk.gray(
        'Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens'
      )
    );
    console.log();

    const response = await prompts([
      {
        type: 'text',
        name: 'instanceUrl',
        message: 'Confluence instance URL (e.g., your-domain.atlassian.net)',
        validate: (value) =>
          value.trim().length > 0 ? true : 'Instance URL is required',
      },
      {
        type: 'text',
        name: 'email',
        message: 'Your email address',
        validate: (value) =>
          value.includes('@') ? true : 'Please enter a valid email',
      },
      {
        type: 'password',
        name: 'apiToken',
        message: 'API token',
        validate: (value) =>
          value.trim().length > 0 ? true : 'API token is required',
      },
    ]);

    // Handle user cancellation
    if (!response.instanceUrl || !response.email || !response.apiToken) {
      console.log(chalk.yellow('\nAuthentication cancelled.'));
      process.exit(0);
    }

    const instanceUrl = normalizeInstanceUrl(response.instanceUrl);

    console.log();
    console.log(chalk.gray('Validating credentials...'));

    try {
      const client = new ConfluenceClient({
        instanceUrl,
        email: response.email,
        apiToken: response.apiToken,
      });

      const profile = await client.validateCredentials();

      // Store credentials securely
      credentialsStore.storeConfluenceCredentials({
        instanceUrl,
        email: response.email,
        apiToken: response.apiToken,
      });

      console.log();
      console.log(chalk.green('✓ Authentication successful!'));
      console.log();
      console.log(chalk.cyan('Logged in as:'), profile.publicName || profile.displayName);
      if (profile.email) {
        console.log(chalk.cyan('Email:'), profile.email);
      }
      console.log();
      console.log(
        chalk.gray(`Credentials stored at: ${credentialsStore.getStorePath()}`)
      );
    } catch (error) {
      console.error();
      console.error(
        chalk.red('✗ Authentication failed:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });


// Publish subcommand
confluenceCommand
  .command('publish')
  .description('Publish analysis report to Confluence')
  .requiredOption('-s, --space <key>', 'Confluence space key')
  .option('-p, --parent <page-id>', 'Parent page ID to nest under')
  .option('-t, --title <title>', 'Page title (default: "Deploy Risk Report - {date}")')
  .option('--runbook', 'Publish runbook instead of full report')
  .option('--update <page-id>', 'Update existing page instead of creating new')
  .option('--append', 'Append to existing page content (with --update)')
  .action(async (options) => {
    // Check for credentials
    const credentials = credentialsStore.getConfluenceCredentials();
    if (!credentials) {
      console.error(
        chalk.red('Not authenticated. Run `deploy-check confluence auth` first.')
      );
      process.exit(1);
    }

    // Check for analysis cache
    if (!analysisCacheStore.exists()) {
      console.error(
        chalk.red(
          'No analysis results found. Run `deploy-check analyze` first.'
        )
      );
      process.exit(1);
    }

    const client = new ConfluenceClient(credentials);

    // Get space info
    const space = await client.getSpaceByKey(options.space);
    if (!space) {
      console.error(chalk.red(`Space "${options.space}" not found or not accessible.`));
      process.exit(1);
    }

    // Load analysis data
    const cache = analysisCacheStore.load();
    if (!cache) {
      console.error(chalk.red('Failed to load analysis cache.'));
      process.exit(1);
    }

    // Generate content
    let storageContent: string;
    let pageTitle: string;

    if (options.runbook) {
      // Generate runbook content with collapsible sections for Confluence
      storageContent = generateRunbookStorageContent(cache);
      pageTitle = options.title || `Deployment Runbook - ${new Date().toLocaleDateString()}`;
    } else {
      // Generate full report
      const content = generateReportContent(cache);
      pageTitle = options.title || `Deploy Risk Report - ${new Date().toLocaleDateString()}`;
      // Convert markdown to Confluence storage format
      storageContent = markdownToConfluenceStorage(content);
    }

    console.log(chalk.bold('Publishing to Confluence'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(chalk.cyan('Space:'), space.name, `(${space.key})`);
    console.log(chalk.cyan('Title:'), pageTitle);
    if (options.parent) {
      console.log(chalk.cyan('Parent Page:'), options.parent);
    }
    console.log();

    try {
      let page;

      if (options.update) {
        // Update existing page
        const existingPage = await client.getPage(options.update);
        let finalContent = storageContent;

        if (options.append && existingPage.body?.storage?.value) {
          // Append to existing content
          finalContent = existingPage.body.storage.value + '\n<hr />\n' + storageContent;
        }

        page = await client.updatePage({
          id: options.update,
          title: pageTitle,
          body: {
            representation: 'storage',
            value: finalContent,
          },
          version: {
            number: existingPage.version.number + 1,
            message: `Updated by deploy-check at ${new Date().toISOString()}`,
          },
        });

        console.log(chalk.green('✓ Page updated successfully!'));
      } else {
        // Create new page
        page = await client.createPage({
          spaceId: space.id,
          title: pageTitle,
          body: {
            representation: 'storage',
            value: storageContent,
          },
          parentId: options.parent,
        });

        console.log(chalk.green('✓ Page created successfully!'));
      }

      console.log();
      console.log(chalk.cyan('Page ID:'), page.id);
      console.log(chalk.cyan('URL:'), client.getPageUrl(page));
    } catch (error) {
      console.error();
      console.error(
        chalk.red('✗ Failed to publish:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });

/**
 * Generate report content from analysis cache
 */
function generateReportContent(
  cache: ReturnType<typeof analysisCacheStore.load>
): string {
  if (!cache) return '';

  const formatter = createMarkdownFormatter({
    includeToc: true,
    includeRunbook: true,
    title: 'Deployment Risk Analysis Report',
  });

  // Set Jira instance URL if we have Jira credentials
  const jiraCredentials = credentialsStore.getJiraCredentials();
  if (jiraCredentials) {
    formatter.setJiraInstanceUrl(jiraCredentials.instanceUrl);
  }

  const findings = cache.findings.map((f) => ({
    id: f.id,
    type: f.type as import('@dra/types').FindingType,
    severity: f.severity as import('@dra/types').Severity,
    title: f.title,
    description: f.description,
    filePath: f.filePath,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
    jiraIssueKey: f.jiraIssueKey,
  }));

  return formatter.format(
    findings,
    cache.riskScore || 0,
    cache.riskLevel || 'LOW',
    findings.length,
    ['TypeScript', 'SQL', 'Permission', 'Coverage', 'OpenAPI'],
    []
  );
}

/**
 * Generate runbook content in Confluence storage format with collapsible sections
 * Requirements: 5.1, 5.5
 */
function generateRunbookStorageContent(
  cache: ReturnType<typeof analysisCacheStore.load>
): string {
  if (!cache) return '';

  const findings = cache.findings;
  const hasDestructiveMigrations = findings.some((f) => f.type === 'DESTRUCTIVE_MIGRATION');
  const hasBreakingApi = findings.some((f) => f.type === 'BREAKING_API');
  const hasPermissionChanges = findings.some((f) => f.type === 'PERMISSION_CHANGE');
  const riskLevel = cache.riskLevel || 'LOW';

  const sections: string[] = [];

  // Header with status
  sections.push('<h1>Deployment Runbook</h1>');
  sections.push(`<p><strong>Risk Level:</strong> ${riskLevel}</p>`);
  sections.push(`<p><strong>Generated:</strong> ${new Date().toISOString()}</p>`);

  // Risk warning panel for high-risk deployments
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
    sections.push(createPanelMacro(
      'warning',
      '<p>High-risk deployment detected. Ensure all pre-deploy checks are completed and rollback plan is ready before proceeding.</p>',
      'High Risk Deployment'
    ));
  }

  // Pre-deploy section (collapsible)
  const preDeployItems: string[] = [];
  preDeployItems.push('<li>Review all findings in the analysis report</li>');
  preDeployItems.push('<li>Ensure all tests pass</li>');
  preDeployItems.push('<li>Verify staging environment is ready</li>');

  if (hasDestructiveMigrations) {
    preDeployItems.push('<li><strong>CRITICAL:</strong> Back up database before deployment</li>');
    preDeployItems.push('<li>Review migration rollback procedures</li>');
    preDeployItems.push('<li>Notify DBA team of destructive migrations</li>');
  }

  if (hasBreakingApi) {
    preDeployItems.push('<li>Notify API consumers of breaking changes</li>');
    preDeployItems.push('<li>Update API documentation</li>');
  }

  if (hasPermissionChanges) {
    preDeployItems.push('<li>Review permission changes with security team</li>');
    preDeployItems.push('<li>Test access control changes in staging</li>');
  }

  sections.push(wrapInExpandMacro(
    'Pre-Deploy Checklist',
    `<ul>${preDeployItems.join('')}</ul>`
  ));

  // Deploy section (collapsible)
  const deployItems: string[] = [];
  if (hasDestructiveMigrations) {
    deployItems.push('<li>Enable maintenance mode (if applicable)</li>');
    deployItems.push('<li>Create database backup</li>');
    deployItems.push('<li>Run database migrations</li>');
    deployItems.push('<li>Deploy application code</li>');
    deployItems.push('<li>Verify migrations completed successfully</li>');
    deployItems.push('<li>Disable maintenance mode</li>');
  } else {
    deployItems.push('<li>Deploy application code</li>');
    deployItems.push('<li>Verify deployment completed successfully</li>');
  }

  sections.push(wrapInExpandMacro(
    'Deploy Steps',
    `<ol>${deployItems.join('')}</ol>`
  ));

  // Post-deploy section (collapsible)
  const postDeployItems: string[] = [];
  postDeployItems.push('<li>Verify application is running</li>');
  postDeployItems.push('<li>Check error rates in monitoring</li>');
  postDeployItems.push('<li>Verify critical user flows</li>');

  if (hasDestructiveMigrations) {
    postDeployItems.push('<li>Verify database integrity</li>');
    postDeployItems.push('<li>Check for data loss indicators</li>');
  }

  if (hasBreakingApi) {
    postDeployItems.push('<li>Verify API endpoints respond correctly</li>');
    postDeployItems.push('<li>Monitor API error rates</li>');
  }

  sections.push(wrapInExpandMacro(
    'Post-Deploy Verification',
    `<ul>${postDeployItems.join('')}</ul>`
  ));

  // Rollback section (collapsible)
  let rollbackContent = '';

  if (hasDestructiveMigrations) {
    rollbackContent += createPanelMacro(
      'warning',
      '<p>Destructive migrations detected. Data loss may occur during rollback.</p>',
      'Database Rollback Warning'
    );
    rollbackContent += '<h3>Database Rollback</h3>';
    rollbackContent += '<ol>';
    rollbackContent += '<li>Stop application</li>';
    rollbackContent += '<li>Restore database from backup</li>';
    rollbackContent += '<li>Deploy previous application version</li>';
    rollbackContent += '<li>Verify application functionality</li>';
    rollbackContent += '</ol>';
  }

  rollbackContent += '<h3>Application Rollback</h3>';
  rollbackContent += '<ol>';
  rollbackContent += '<li>Deploy previous application version</li>';
  rollbackContent += '<li>Verify application is running</li>';
  rollbackContent += '<li>Monitor for issues</li>';
  rollbackContent += '</ol>';

  sections.push(wrapInExpandMacro('Rollback Plan', rollbackContent));

  return sections.join('\n');
}


// List subcommand
confluenceCommand
  .command('list')
  .description('List previously published reports in a space')
  .requiredOption('-s, --space <key>', 'Confluence space key')
  .option('-l, --limit <number>', 'Maximum number of pages to list', '10')
  .action(async (options) => {
    // Check for credentials
    const credentials = credentialsStore.getConfluenceCredentials();
    if (!credentials) {
      console.error(
        chalk.red('Not authenticated. Run `deploy-check confluence auth` first.')
      );
      process.exit(1);
    }

    const client = new ConfluenceClient(credentials);

    // Get space info
    const space = await client.getSpaceByKey(options.space);
    if (!space) {
      console.error(chalk.red(`Space "${options.space}" not found or not accessible.`));
      process.exit(1);
    }

    console.log(chalk.bold('Published Reports'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(chalk.cyan('Space:'), space.name, `(${space.key})`);
    console.log();

    try {
      // Search for pages with "Deploy Risk" or "Deployment Runbook" in title
      const limit = parseInt(options.limit, 10) || 10;
      const pages = await client.searchPages(space.id, { limit });

      // Filter for deploy-check related pages
      const reportPages = pages.filter(
        (p) =>
          p.title.includes('Deploy Risk') ||
          p.title.includes('Deployment Runbook') ||
          p.title.includes('deploy-check')
      );

      if (reportPages.length === 0) {
        console.log(chalk.yellow('No deploy-check reports found in this space.'));
        console.log(
          chalk.gray(
            'Use `deploy-check confluence publish` to publish a report.'
          )
        );
        return;
      }

      console.log(chalk.bold(`Found ${reportPages.length} report(s):`));
      console.log();

      for (const page of reportPages) {
        const createdDate = new Date(page.version.createdAt).toLocaleString();

        console.log(chalk.bold(page.title));
        console.log(chalk.gray(`  ID: ${page.id}`));
        console.log(chalk.gray(`  Updated: ${createdDate}`));
        console.log(chalk.gray(`  Version: ${page.version.number}`));
        console.log(chalk.gray(`  URL: ${client.getPageUrl(page)}`));
        console.log();
      }
    } catch (error) {
      console.error();
      console.error(
        chalk.red('✗ Failed to list pages:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
