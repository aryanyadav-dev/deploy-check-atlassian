import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { JiraClient } from '../jira/jira-client';
import { credentialsStore } from '../jira/credentials-store';
import { analysisCacheStore } from '../jira/analysis-cache';
import { configLoader } from '../config/loader';
import { CachedFinding } from '../jira/types';

export const jiraCommand = new Command('jira').description(
  'Jira integration commands'
);

/**
 * Normalize Jira instance URL
 */
function normalizeInstanceUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  return normalized.replace(/\/$/, '');
}

/**
 * Create Jira issue description in ADF format
 */
function createIssueDescription(finding: CachedFinding): {
  type: 'doc';
  version: 1;
  content: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
} {
  const content: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }> = [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: finding.description }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: `Severity: ${finding.severity.toUpperCase()}` },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: `Type: ${finding.type}` }],
    },
  ];

  if (finding.filePath) {
    let locationText = `File: ${finding.filePath}`;
    if (finding.lineStart) {
      locationText += `:${finding.lineStart}`;
      if (finding.lineEnd && finding.lineEnd !== finding.lineStart) {
        locationText += `-${finding.lineEnd}`;
      }
    }
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: locationText }],
    });
  }

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

// Auth subcommand
jiraCommand
  .command('auth')
  .description('Authenticate with Jira')
  .option('--logout', 'Remove stored Jira credentials')
  .action(async (options) => {
    if (options.logout) {
      if (credentialsStore.hasJiraCredentials()) {
        credentialsStore.removeJiraCredentials();
        console.log(chalk.green('✓ Jira credentials removed'));
      } else {
        console.log(chalk.yellow('No Jira credentials stored'));
      }
      return;
    }

    console.log(chalk.bold('Jira Authentication'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(
      chalk.gray(
        'You will need your Jira instance URL and an API token.'
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
        message: 'Jira instance URL (e.g., your-domain.atlassian.net)',
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
      const client = new JiraClient({
        instanceUrl,
        email: response.email,
        apiToken: response.apiToken,
      });

      const profile = await client.validateCredentials();

      // Store credentials securely
      credentialsStore.storeJiraCredentials({
        instanceUrl,
        email: response.email,
        apiToken: response.apiToken,
      });

      console.log();
      console.log(chalk.green('✓ Authentication successful!'));
      console.log();
      console.log(chalk.cyan('Logged in as:'), profile.displayName);
      console.log(chalk.cyan('Email:'), profile.emailAddress);
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

// Create subcommand
jiraCommand
  .command('create')
  .description('Create Jira issues for findings')
  .option(
    '-s, --severity <levels>',
    'Severity levels to include (comma-separated)',
    'high,critical'
  )
  .option('-p, --project <key>', 'Jira project key')
  .option('--dry-run', 'Show what would be created without creating')
  .action(async (options) => {
    const parentOpts = jiraCommand.parent?.opts() ?? {};
    const configPath = parentOpts.config as string | undefined;

    // Check for credentials
    const credentials = credentialsStore.getJiraCredentials();
    if (!credentials) {
      console.error(
        chalk.red('Not authenticated. Run `deploy-check jira auth` first.')
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

    // Load config for default project key
    const config = await configLoader.load(configPath);
    const projectKey = options.project || config.jira?.projectKey;

    if (!projectKey) {
      console.error(
        chalk.red(
          'Project key required. Use --project <key> or set jira.projectKey in config.'
        )
      );
      process.exit(1);
    }

    // Parse severity levels
    const severities = options.severity
      .split(',')
      .map((s: string) => s.trim().toUpperCase());

    // Get findings matching severity
    const findings = analysisCacheStore.getFindingsBySeverity(severities);
    const unlinkedFindings = findings.filter((f) => !f.jiraIssueKey);

    if (unlinkedFindings.length === 0) {
      console.log(
        chalk.yellow(
          `No unlinked findings with severity ${severities.join(', ')}`
        )
      );
      return;
    }

    console.log(chalk.bold('Creating Jira Issues'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(chalk.cyan('Project:'), projectKey);
    console.log(chalk.cyan('Findings to create:'), unlinkedFindings.length);
    console.log();

    if (options.dryRun) {
      console.log(chalk.yellow('DRY RUN - No issues will be created'));
      console.log();
      for (const finding of unlinkedFindings) {
        console.log(chalk.bold(`• ${finding.title}`));
        console.log(chalk.gray(`  Severity: ${finding.severity}`));
        console.log(chalk.gray(`  Type: ${finding.type}`));
        if (finding.filePath) {
          console.log(chalk.gray(`  File: ${finding.filePath}`));
        }
        console.log();
      }
      return;
    }

    const client = new JiraClient(credentials);
    
    // Validate project exists and get project ID
    let projectId: string;
    try {
      const project = await client.getProject(projectKey);
      projectId = project.id;
      console.log(chalk.gray(`Validated project: ${project.name} (${project.key})`));
      console.log();
    } catch (error) {
      console.error(
        chalk.red(`✗ Project "${projectKey}" not found or not accessible.`),
        '\n',
        chalk.yellow('Make sure the project key is correct and you have access to it.')
      );
      process.exit(1);
    }
    
    const createdIssues: Array<{ finding: CachedFinding; issueKey: string }> =
      [];

    for (const finding of unlinkedFindings) {
      try {
        const result = await client.createIssue({
          fields: {
            project: { id: projectId },
            summary: `[Deploy Risk] ${finding.title}`,
            description: createIssueDescription(finding),
            issuetype: { name: 'Task' },
            labels: ['deploy-risk', finding.severity.toLowerCase()],
          },
        });

        // Link the issue to the finding
        analysisCacheStore.linkJiraIssue(finding.id, result.key);
        createdIssues.push({ finding, issueKey: result.key });

        console.log(
          chalk.green(`✓ Created ${result.key}:`),
          finding.title
        );
      } catch (error) {
        console.error(
          chalk.red(`✗ Failed to create issue for "${finding.title}":`),
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    console.log();
    console.log(
      chalk.bold(`Created ${createdIssues.length} issue(s)`)
    );

    if (createdIssues.length > 0) {
      console.log();
      console.log(chalk.gray('Issue links:'));
      for (const { issueKey } of createdIssues) {
        console.log(
          chalk.gray(`  ${credentials.instanceUrl}/browse/${issueKey}`)
        );
      }
    }
  });

// Link subcommand
jiraCommand
  .command('link')
  .description('Link a finding to an existing Jira issue')
  .argument('<finding-id>', 'Finding ID (e.g., finding-0)')
  .argument('<issue-key>', 'Jira issue key (e.g., PROJ-123)')
  .action(async (findingId: string, issueKey: string) => {
    // Check for credentials
    const credentials = credentialsStore.getJiraCredentials();
    if (!credentials) {
      console.error(
        chalk.red('Not authenticated. Run `deploy-check jira auth` first.')
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

    // Verify the issue exists
    const client = new JiraClient(credentials);
    try {
      const issue = await client.getIssue(issueKey);
      analysisCacheStore.linkJiraIssue(findingId, issueKey);

      console.log(chalk.green(`✓ Linked ${findingId} to ${issueKey}`));
      console.log(chalk.gray(`  Issue: ${issue.fields.summary}`));
      console.log(chalk.gray(`  Status: ${issue.fields.status.name}`));
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        // Try to link anyway - the issue might exist but user doesn't have access
        try {
          analysisCacheStore.linkJiraIssue(findingId, issueKey);
          console.log(
            chalk.yellow(
              `⚠ Linked ${findingId} to ${issueKey} (could not verify issue)`
            )
          );
        } catch (linkError) {
          console.error(
            chalk.red('Failed to link:'),
            linkError instanceof Error ? linkError.message : 'Unknown error'
          );
          process.exit(1);
        }
      } else {
        console.error(
          chalk.red('Failed to verify issue:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    }
  });

// Status subcommand
jiraCommand
  .command('status')
  .description('Show status of linked Jira issues')
  .action(async () => {
    // Check for credentials
    const credentials = credentialsStore.getJiraCredentials();
    if (!credentials) {
      console.error(
        chalk.red('Not authenticated. Run `deploy-check jira auth` first.')
      );
      process.exit(1);
    }

    // Get linked findings
    const linkedFindings = analysisCacheStore.getLinkedFindings();

    if (linkedFindings.length === 0) {
      console.log(chalk.yellow('No findings linked to Jira issues'));
      console.log(
        chalk.gray(
          'Use `deploy-check jira create` or `deploy-check jira link` to link findings'
        )
      );
      return;
    }

    const issueKeys = linkedFindings
      .map((f) => f.jiraIssueKey)
      .filter((k): k is string => !!k);

    console.log(chalk.bold('Linked Jira Issues'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();

    const client = new JiraClient(credentials);

    try {
      const issues = await client.getIssues(issueKeys);
      const issueMap = new Map(issues.map((i) => [i.key, i]));

      for (const finding of linkedFindings) {
        const issue = issueMap.get(finding.jiraIssueKey!);

        console.log(chalk.bold(finding.jiraIssueKey));
        if (issue) {
          const statusColor =
            issue.fields.status.statusCategory.key === 'done'
              ? chalk.green
              : issue.fields.status.statusCategory.key === 'indeterminate'
                ? chalk.blue
                : chalk.yellow;

          console.log(chalk.gray(`  Summary: ${issue.fields.summary}`));
          console.log(`  Status: ${statusColor(issue.fields.status.name)}`);
          if (issue.fields.assignee) {
            console.log(
              chalk.gray(`  Assignee: ${issue.fields.assignee.displayName}`)
            );
          } else {
            console.log(chalk.gray('  Assignee: Unassigned'));
          }
          console.log(
            chalk.gray(
              `  Updated: ${new Date(issue.fields.updated).toLocaleString()}`
            )
          );
          console.log(
            chalk.gray(
              `  Link: ${credentials.instanceUrl}/browse/${issue.key}`
            )
          );
        } else {
          console.log(chalk.yellow('  Could not fetch issue details'));
        }
        console.log();
      }
    } catch (error) {
      console.error(
        chalk.red('Failed to fetch issue status:'),
        error instanceof Error ? error.message : 'Unknown error'
      );
      process.exit(1);
    }
  });
