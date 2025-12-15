import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze';
import { configCommand } from './commands/config';
import { reportCommand } from './commands/report';
import { runbookCommand } from './commands/runbook';
import { jiraCommand } from './commands/jira';
import { confluenceCommand } from './commands/confluence';

const program = new Command();

program
  .name('deploy-check')
  .description('Deployment Risk Analyzer - Analyze code changes for deployment risks')
  .version('0.0.1', '-v, --version', 'Display version number')
  .option('--verbose', 'Enable verbose output', false)
  .option('--json', 'Output results as JSON', false)
  .option('--config <path>', 'Path to configuration file');

program.addCommand(analyzeCommand);
program.addCommand(configCommand);
program.addCommand(reportCommand);
program.addCommand(runbookCommand);
program.addCommand(jiraCommand);
program.addCommand(confluenceCommand);

program.parse(process.argv);
