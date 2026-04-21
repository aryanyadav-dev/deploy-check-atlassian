/**
 * Bitbucket CLI Commands
 *
 * CLI commands for Bitbucket repository, PR, pipeline, and issue operations.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { BitbucketClient } from '../bitbucket/bitbucket-client';
import { bitbucketCredentialsStore } from '../bitbucket/credentials-store';

export const bitbucketCommand = new Command('bitbucket').description(
  'Bitbucket integration commands'
);

/**
 * Get authenticated Bitbucket client
 */
function getClient(): BitbucketClient {
  const credentials = bitbucketCredentialsStore.getBitbucketCredentials();
  if (!credentials) {
    throw new Error('Not authenticated with Bitbucket. Run "deploy-check bitbucket auth" first.');
  }
  return new BitbucketClient(credentials);
}

// Auth subcommand
bitbucketCommand
  .command('auth')
  .description('Authenticate with Bitbucket')
  .option('--logout', 'Remove stored Bitbucket credentials')
  .action(async (options) => {
    if (options.logout) {
      if (bitbucketCredentialsStore.hasBitbucketCredentials()) {
        bitbucketCredentialsStore.removeBitbucketCredentials();
        console.log(chalk.green('Bitbucket credentials removed'));
      } else {
        console.log(chalk.yellow('No Bitbucket credentials stored'));
      }
      return;
    }

    console.log(chalk.bold('Bitbucket Authentication'));
    console.log(chalk.gray(' '.repeat(50)));
    console.log();
    console.log(
      chalk.gray(
        'You will need your Bitbucket workspace, Atlassian account email, and API token.'
      )
    );
    console.log(
      chalk.gray(
        'Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens'
      )
    );
    console.log(
      chalk.gray(
        'If you use an app password instead, enter your Bitbucket username below.'
      )
    );
    console.log();

    const answers = await prompts([
      {
        type: 'text',
        name: 'workspace',
        message: 'Bitbucket workspace (slug):',
        validate: (value) => (value.length > 0 ? true : 'Workspace is required'),
      },
      {
        type: 'text',
        name: 'username',
        message: 'Atlassian email (or Bitbucket username for app passwords):',
        validate: (value) =>
          value.length > 0 ? true : 'Email or username is required',
      },
      {
        type: 'password',
        name: 'apiToken',
        message: 'API token:',
        validate: (value) => (value.length > 0 ? true : 'API token is required'),
      },
    ]);

    if (!answers.workspace || !answers.username || !answers.apiToken) {
      console.log(chalk.yellow('Authentication cancelled'));
      return;
    }

    try {
      const client = new BitbucketClient({
        workspace: answers.workspace,
        username: answers.username,
        apiToken: answers.apiToken,
      });

      await client.validateWorkspaceAccess();

      bitbucketCredentialsStore.saveBitbucketCredentials({
        workspace: answers.workspace,
        username: answers.username,
        apiToken: answers.apiToken,
      });

      console.log();
      console.log(chalk.green('Successfully authenticated with Bitbucket!'));
      console.log(chalk.cyan('Workspace access verified:'), answers.workspace);
    } catch (error) {
      console.error();
      console.error(chalk.red(`Authentication failed: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Repository subcommands
const repoCommand = bitbucketCommand
  .command('repo')
  .description('Repository operations');

repoCommand
  .command('list')
  .description('List repositories in workspace')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '10')
  .action(async (options) => {
    try {
      const client = getClient();
      const result = await client.listRepositories({
        page: parseInt(options.page),
        pagelen: parseInt(options.limit),
      });

      console.log(chalk.bold(`\nRepositories in ${client['credentials'].workspace}`));
      console.log(chalk.gray(' '.repeat(60)));

      if (result.values.length === 0) {
        console.log(chalk.yellow('No repositories found'));
        return;
      }

      for (const repo of result.values) {
        const visibility = repo.isPrivate ? chalk.red('private') : chalk.green('public');
        console.log(`\n${chalk.cyan(repo.name)} (${visibility})`);
        if (repo.description) {
          console.log(`  ${chalk.gray(repo.description)}`);
        }
        console.log(`  ${chalk.gray('Language:')} ${repo.language || 'N/A'}`);
        console.log(`  ${chalk.gray('URL:')} ${repo.links.html}`);
      }

      console.log(chalk.gray(`\nShowing ${result.values.length} of ${result.size} repositories`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

repoCommand
  .command('branches <repo>')
  .description('List branches in a repository')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '10')
  .action(async (repo, options) => {
    try {
      const client = getClient();
      const result = await client.listBranches(repo, {
        page: parseInt(options.page),
        pagelen: parseInt(options.limit),
      });

      console.log(chalk.bold(`\nBranches in ${client['credentials'].workspace}/${repo}`));
      console.log(chalk.gray(' '.repeat(60)));

      if (result.values.length === 0) {
        console.log(chalk.yellow('No branches found'));
        return;
      }

      for (const branch of result.values) {
        console.log(`\n${chalk.cyan(branch.name)}`);
        console.log(`  ${chalk.gray('Author:')} ${branch.author}`);
        console.log(`  ${chalk.gray('Date:')} ${new Date(branch.date).toLocaleDateString()}`);
        console.log(`  ${chalk.gray('Hash:')} ${branch.hash.substring(0, 7)}`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

repoCommand
  .command('commits <repo>')
  .description('List commits in a repository')
  .option('-b, --branch <name>', 'Branch name')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '10')
  .action(async (repo, options) => {
    try {
      const client = getClient();
      const result = await client.listCommits(repo, {
        branch: options.branch,
        page: parseInt(options.page),
        pagelen: parseInt(options.limit),
      });

      console.log(chalk.bold(`\nCommits in ${client['credentials'].workspace}/${repo}${options.branch ? ` (${options.branch})` : ''}`));
      console.log(chalk.gray(' '.repeat(60)));

      if (result.values.length === 0) {
        console.log(chalk.yellow('No commits found'));
        return;
      }

      for (const commit of result.values) {
        console.log(`\n${chalk.cyan(commit.hash.substring(0, 7))} ${chalk.gray(commit.message.split('\n')[0])}`);
        console.log(`  ${chalk.gray('Author:')} ${commit.author}`);
        console.log(`  ${chalk.gray('Date:')} ${new Date(commit.date).toLocaleString()}`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

// Pull Request subcommands
const prCommand = bitbucketCommand
  .command('pr')
  .description('Pull request operations');

prCommand
  .command('list <repo>')
  .description('List pull requests')
  .option('-s, --state <state>', 'Filter by state (OPEN, MERGED, DECLINED)', 'OPEN')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '10')
  .action(async (repo, options) => {
    try {
      const client = getClient();
      const result = await client.listPullRequests(repo, {
        state: options.state as 'OPEN' | 'MERGED' | 'DECLINED',
        page: parseInt(options.page),
        pagelen: parseInt(options.limit),
      });

      console.log(chalk.bold(`\nPull Requests in ${client['credentials'].workspace}/${repo}`));
      console.log(chalk.gray(' '.repeat(60)));

      if (result.values.length === 0) {
        console.log(chalk.yellow('No pull requests found'));
        return;
      }

      for (const pr of result.values) {
        const stateColor = pr.state === 'OPEN' ? chalk.green : pr.state === 'MERGED' ? chalk.cyan : chalk.red;
        console.log(`\n#${pr.id} ${pr.title}`);
        console.log(`  ${chalk.gray('State:')} ${stateColor(pr.state)}`);
        console.log(`  ${chalk.gray('Author:')} ${pr.author}`);
        console.log(`  ${chalk.gray('Branch:')} ${pr.sourceBranch} -> ${pr.destinationBranch}`);
        console.log(`  ${chalk.gray('Comments:')} ${pr.commentCount}`);
        console.log(`  ${chalk.gray('Link:')} ${pr.link}`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

prCommand
  .command('view <repo> <id>')
  .description('View pull request details')
  .action(async (repo, id) => {
    try {
      const client = getClient();
      const pr = await client.getPullRequest(repo, parseInt(id));

      console.log(chalk.bold(`\nPull Request #${pr.id}: ${pr.title}`));
      console.log(chalk.gray(' '.repeat(60)));
      console.log(`\n${chalk.gray('State:')} ${pr.state}`);
      console.log(`${chalk.gray('Author:')} ${pr.author}`);
      console.log(`${chalk.gray('Source:')} ${pr.sourceBranch}`);
      console.log(`${chalk.gray('Destination:')} ${pr.destinationBranch}`);
      console.log(`${chalk.gray('Created:')} ${new Date(pr.createdOn).toLocaleString()}`);
      console.log(`${chalk.gray('Updated:')} ${new Date(pr.updatedOn).toLocaleString()}`);
      console.log(`${chalk.gray('Comments:')} ${pr.commentCount}`);
      console.log(`${chalk.gray('Approved:')} ${pr.approved ? chalk.green('Yes') : chalk.red('No')}`);

      if (pr.description) {
        console.log(`\n${chalk.gray('Description:')}`);
        console.log(pr.description);
      }

      if (pr.reviewers.length > 0) {
        console.log(`\n${chalk.gray('Reviewers:')} ${pr.reviewers.join(', ')}`);
      }

      console.log(`\n${chalk.gray('Link:')} ${pr.link}`);
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

prCommand
  .command('create <repo>')
  .description('Create a pull request')
  .action(async (repo) => {
    try {
      const answers = await prompts([
        {
          type: 'text',
          name: 'title',
          message: 'Pull request title:',
          validate: (value) => (value.length > 0 ? true : 'Title is required'),
        },
        {
          type: 'text',
          name: 'description',
          message: 'Description (optional):',
        },
        {
          type: 'text',
          name: 'sourceBranch',
          message: 'Source branch:',
          validate: (value) => (value.length > 0 ? true : 'Source branch is required'),
        },
        {
          type: 'text',
          name: 'destinationBranch',
          message: 'Destination branch (default: main):',
          initial: 'main',
        },
      ]);

      if (!answers.title || !answers.sourceBranch) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }

      const client = getClient();
      const pr = await client.createPullRequest(repo, {
        title: answers.title,
        description: answers.description,
        sourceBranch: answers.sourceBranch,
        destinationBranch: answers.destinationBranch || 'main',
      });

      console.log(chalk.green(`\nPull request #${pr.id} created successfully!`));
      console.log(chalk.gray(`Link: ${pr.link}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

prCommand
  .command('approve <repo> <id>')
  .description('Approve a pull request')
  .action(async (repo, id) => {
    try {
      const client = getClient();
      await client.approvePullRequest(repo, parseInt(id));
      console.log(chalk.green(`Pull request #${id} approved!`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

prCommand
  .command('merge <repo> <id>')
  .description('Merge a pull request')
  .option('--close-branch', 'Close source branch after merge')
  .action(async (repo, id, options) => {
    try {
      const client = getClient();
      await client.mergePullRequest(repo, parseInt(id), {
        closeSourceBranch: options.closeBranch,
      });
      console.log(chalk.green(`Pull request #${id} merged successfully!`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

// Pipeline subcommands
const pipelineCommand = bitbucketCommand
  .command('pipeline')
  .description('Pipeline operations');

pipelineCommand
  .command('list <repo>')
  .description('List pipelines')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '10')
  .action(async (repo, options) => {
    try {
      const client = getClient();
      const result = await client.listPipelines(repo, {
        page: parseInt(options.page),
        pagelen: parseInt(options.limit),
      });

      console.log(chalk.bold(`\nPipelines in ${client['credentials'].workspace}/${repo}`));
      console.log(chalk.gray(' '.repeat(60)));

      if (result.values.length === 0) {
        console.log(chalk.yellow('No pipelines found'));
        return;
      }

      for (const pipeline of result.values) {
        const stateColor = pipeline.state === 'COMPLETED'
          ? (pipeline.result === 'SUCCESSFUL' ? chalk.green : chalk.red)
          : chalk.yellow;
        console.log(`\n#${pipeline.buildNumber} ${stateColor(pipeline.state)}`);
        if (pipeline.result) {
          console.log(`  ${chalk.gray('Result:')} ${pipeline.result}`);
        }
        console.log(`  ${chalk.gray('Trigger:')} ${pipeline.trigger}`);
        console.log(`  ${chalk.gray('Branch:')} ${pipeline.refName}`);
        console.log(`  ${chalk.gray('Date:')} ${new Date(pipeline.createdOn).toLocaleString()}`);
        if (pipeline.duration) {
          console.log(`  ${chalk.gray('Duration:')} ${pipeline.duration}s`);
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

pipelineCommand
  .command('view <repo> <uuid>')
  .description('View pipeline details')
  .action(async (repo, uuid) => {
    try {
      const client = getClient();
      const pipeline = await client.getPipeline(repo, uuid);

      console.log(chalk.bold(`\nPipeline #${pipeline.buildNumber}`));
      console.log(chalk.gray(' '.repeat(60)));
      console.log(`\n${chalk.gray('State:')} ${pipeline.state}`);
      if (pipeline.result) {
        console.log(`${chalk.gray('Result:')} ${pipeline.result}`);
      }
      console.log(`${chalk.gray('Trigger:')} ${pipeline.trigger}`);
      console.log(`${chalk.gray('Branch:')} ${pipeline.refName}`);
      if (pipeline.commit) {
        console.log(`${chalk.gray('Commit:')} ${pipeline.commit.substring(0, 7)}`);
      }
      console.log(`${chalk.gray('Created:')} ${new Date(pipeline.createdOn).toLocaleString()}`);
      if (pipeline.completedOn) {
        console.log(`${chalk.gray('Completed:')} ${new Date(pipeline.completedOn).toLocaleString()}`);
      }
      if (pipeline.duration) {
        console.log(`${chalk.gray('Duration:')} ${pipeline.duration}s`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

pipelineCommand
  .command('trigger <repo>')
  .description('Trigger a pipeline')
  .action(async (repo) => {
    try {
      const answers = await prompts([
        {
          type: 'text',
          name: 'branch',
          message: 'Branch to run pipeline on:',
          validate: (value) => (value.length > 0 ? true : 'Branch is required'),
        },
      ]);

      if (!answers.branch) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }

      const client = getClient();
      const pipeline = await client.triggerPipeline(repo, answers.branch);

      console.log(chalk.green(`\nPipeline #${pipeline.buildNumber} triggered successfully!`));
      console.log(chalk.gray(`Link: ${pipeline.link}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

// Issue subcommands
const issueCommand = bitbucketCommand
  .command('issue')
  .description('Issue operations');

issueCommand
  .command('list <repo>')
  .description('List issues')
  .option('-s, --state <state>', 'Filter by state')
  .option('-k, --kind <kind>', 'Filter by kind (bug, enhancement, task)')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '10')
  .action(async (repo, options) => {
    try {
      const client = getClient();
      const result = await client.listIssues(repo, {
        state: options.state,
        kind: options.kind,
        page: parseInt(options.page),
        pagelen: parseInt(options.limit),
      });

      console.log(chalk.bold(`\nIssues in ${client['credentials'].workspace}/${repo}`));
      console.log(chalk.gray(' '.repeat(60)));

      if (result.values.length === 0) {
        console.log(chalk.yellow('No issues found'));
        return;
      }

      for (const issue of result.values) {
        const priorityColor = {
          critical: chalk.red,
          major: chalk.yellow,
          minor: chalk.green,
          trivial: chalk.gray,
        }[issue.priority] || chalk.gray;

        console.log(`\n#${issue.id} ${issue.title}`);
        console.log(`  ${chalk.gray('State:')} ${issue.state}`);
        console.log(`  ${chalk.gray('Kind:')} ${issue.kind}`);
        console.log(`  ${chalk.gray('Priority:')} ${priorityColor(issue.priority)}`);
        console.log(`  ${chalk.gray('Reporter:')} ${issue.reporter}`);
        console.log(`  ${chalk.gray('Votes:')} ${issue.votes}`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

issueCommand
  .command('view <repo> <id>')
  .description('View issue details')
  .action(async (repo, id) => {
    try {
      const client = getClient();
      const issue = await client.getIssue(repo, parseInt(id));

      console.log(chalk.bold(`\nIssue #${issue.id}: ${issue.title}`));
      console.log(chalk.gray(' '.repeat(60)));
      console.log(`\n${chalk.gray('State:')} ${issue.state}`);
      console.log(`${chalk.gray('Kind:')} ${issue.kind}`);
      console.log(`${chalk.gray('Priority:')} ${issue.priority}`);
      console.log(`${chalk.gray('Reporter:')} ${issue.reporter}`);
      if (issue.assignee) {
        console.log(`${chalk.gray('Assignee:')} ${issue.assignee}`);
      }
      console.log(`${chalk.gray('Created:')} ${new Date(issue.createdOn).toLocaleString()}`);
      console.log(`${chalk.gray('Updated:')} ${new Date(issue.updatedOn).toLocaleString()}`);
      console.log(`${chalk.gray('Votes:')} ${issue.votes}`);
      console.log(`${chalk.gray('Watchers:')} ${issue.watchers}`);

      if (issue.content) {
        console.log(`\n${chalk.gray('Description:')}`);
        console.log(issue.content);
      }

      console.log(`\n${chalk.gray('Link:')} ${issue.link}`);
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

issueCommand
  .command('create <repo>')
  .description('Create an issue')
  .action(async (repo) => {
    try {
      const answers = await prompts([
        {
          type: 'text',
          name: 'title',
          message: 'Issue title:',
          validate: (value) => (value.length > 0 ? true : 'Title is required'),
        },
        {
          type: 'text',
          name: 'content',
          message: 'Description:',
        },
        {
          type: 'select',
          name: 'kind',
          message: 'Kind:',
          choices: [
            { title: 'Bug', value: 'bug' },
            { title: 'Enhancement', value: 'enhancement' },
            { title: 'Task', value: 'task' },
            { title: 'Proposal', value: 'proposal' },
          ],
        },
        {
          type: 'select',
          name: 'priority',
          message: 'Priority:',
          choices: [
            { title: 'Critical', value: 'critical' },
            { title: 'Major', value: 'major' },
            { title: 'Minor', value: 'minor' },
            { title: 'Trivial', value: 'trivial' },
          ],
        },
      ]);

      if (!answers.title) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }

      const client = getClient();
      const issue = await client.createIssue(repo, {
        title: answers.title,
        content: answers.content,
        kind: answers.kind,
        priority: answers.priority,
      });

      console.log(chalk.green(`\nIssue #${issue.id} created successfully!`));
      console.log(chalk.gray(`Link: ${issue.link}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });
