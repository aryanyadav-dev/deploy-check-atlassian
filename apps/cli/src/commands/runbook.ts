/**
 * Runbook command for deploy-check CLI
 * Generates deployment runbooks for current changes
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { configLoader } from '../config';
import { runAnalysis } from '../analyzers';
import { calculateRiskScore, classifyRiskLevel } from '../scoring';
import { TerminalFormatter, JsonFormatter } from '../formatters';
import type { Finding, RiskLevel } from '@dra/types';

/**
 * Options for the runbook command
 */
interface RunbookOptions {
  output?: string;
  base?: string;
  head?: string;
  template?: string;
  includeMigrations?: boolean;
  featureFlags?: boolean;
}

/**
 * Runbook structure with required sections
 */
interface Runbook {
  prTitle: string;
  riskLevel: RiskLevel;
  riskScore: number;
  preDeploy: string[];
  deploy: string[];
  postDeploy: string[];
  rollback: string[];
}

/**
 * Runbook section markers for parsing
 */
const RUNBOOK_SECTIONS = {
  PRE_DEPLOY: '## Pre-Deploy Checks',
  DEPLOY: '## Deploy Steps',
  POST_DEPLOY: '## Post-Deploy Verification',
  ROLLBACK: '## Rollback Plan',
} as const;

export const runbookCommand = new Command('runbook')
  .description('Generate deployment runbook for current changes')
  .option('--output <file>', 'Output file path for the runbook')
  .option('--base <ref>', 'Base reference to compare against (default: main/master)')
  .option('--head <ref>', 'Head reference to analyze (default: HEAD)')
  .option('--template <path>', 'Path to custom runbook template')
  .option('--include-migrations', 'Include migration commands in runbook', false)
  .option('--feature-flags', 'Include feature flag toggle steps', false)
  .action(async (options: RunbookOptions) => {
    const parentOpts = runbookCommand.parent?.opts() ?? {};
    const verbose = parentOpts.verbose ?? false;
    const jsonOutput = parentOpts.json ?? false;
    const configPath = parentOpts.config;

    const terminalFormatter = new TerminalFormatter({ verbose });
    const jsonFormatter = new JsonFormatter({ pretty: true });

    try {
      // Load configuration
      const config = await configLoader.load(configPath);

      if (verbose) {
        console.log('Generating runbook with options:', { ...options, verbose, jsonOutput });
      }

      // Run analysis to get findings
      const result = await runAnalysis({
        base: options.base ?? config.baseRef,
        head: options.head,
        coveragePath: config.coveragePath,
        openapiPath: config.openapiPath,
        coverageThreshold: config.coverageThreshold,
        ignoredPaths: config.ignoredPaths,
        verbose,
      });

      // Calculate risk score
      const riskScore = calculateRiskScore(result.findings);
      const riskLevel = classifyRiskLevel(riskScore) as RiskLevel;

      // Load custom template if provided
      let customTemplate: string | undefined;
      if (options.template) {
        const templatePath = path.resolve(options.template);
        if (fs.existsSync(templatePath)) {
          customTemplate = fs.readFileSync(templatePath, 'utf-8');
          if (verbose) {
            console.log(`Loaded custom template from: ${templatePath}`);
          }
        } else {
          console.warn(`Template file not found: ${templatePath}, using default template`);
        }
      }

      // Generate runbook
      const runbook = generateRunbook(
        'Current Changes',
        result.findings,
        {
          includeMigrations: options.includeMigrations ?? false,
          featureFlags: options.featureFlags ?? false,
          customTemplate,
        }
      );

      // Serialize runbook to markdown (use custom template if provided)
      const runbookMarkdown = customTemplate
        ? applyCustomTemplate(customTemplate, runbook)
        : serializeRunbookToMarkdown(runbook);

      // Output runbook
      if (jsonOutput) {
        // JSON output
        const output = JSON.stringify({
          runbook,
          riskScore,
          riskLevel,
          findingsCount: result.findings.length,
          generatedAt: new Date().toISOString(),
        }, null, 2);
        console.log(output);
      } else if (options.output) {
        // Write to file
        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, runbookMarkdown, 'utf-8');
        console.log(terminalFormatter.formatSuccess(`Runbook saved to: ${outputPath}`));
      } else {
        // Output to stdout
        console.log(runbookMarkdown);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (jsonOutput) {
        console.log(jsonFormatter.formatError(message));
      } else {
        console.error(terminalFormatter.formatError(message));
      }

      process.exit(1);
    }
  });

/**
 * Options for runbook generation
 */
interface RunbookGenerationOptions {
  includeMigrations?: boolean;
  featureFlags?: boolean;
  customTemplate?: string;
}

/**
 * Generate a deployment runbook from analysis findings.
 * 
 * Property 19: Runbook Required Sections
 * For any completed analysis, the generated runbook should contain non-empty
 * sections for: pre-deploy checks, deploy steps, post-deploy verification, and rollback plan.
 * 
 * Property 20: Runbook Migration Commands
 * For any analysis containing DESTRUCTIVE_MIGRATION findings, the generated runbook
 * should include migration up commands, migration down commands, and data loss warnings.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.4**
 */
function generateRunbook(
  prTitle: string,
  findings: Finding[],
  options: RunbookGenerationOptions = {}
): Runbook {
  const riskScore = calculateRiskScore(findings);
  const riskLevel = classifyRiskLevel(riskScore) as RiskLevel;

  const preDeploy = generatePreDeployChecks(findings, options);
  const deploy = generateDeploySteps(findings, options);
  const postDeploy = generatePostDeployVerification(findings, options);
  const rollback = generateRollbackPlan(findings, options);

  return {
    prTitle,
    riskLevel,
    riskScore,
    preDeploy,
    deploy,
    postDeploy,
    rollback,
  };
}

/**
 * Generate pre-deploy checks based on findings
 */
function generatePreDeployChecks(findings: Finding[], options: RunbookGenerationOptions): string[] {
  const checks: string[] = [
    'Verify all tests pass in CI/CD pipeline',
    'Review code changes with team',
  ];

  const hasBreakingApi = findings.some((f) => f.type === 'BREAKING_API');
  const hasDestructiveMigration = findings.some((f) => f.type === 'DESTRUCTIVE_MIGRATION');
  const hasPermissionChange = findings.some((f) => f.type === 'PERMISSION_CHANGE');
  const hasLowCoverage = findings.some((f) => f.type === 'LOW_COVERAGE');

  if (hasBreakingApi) {
    checks.push('Notify downstream consumers of API changes');
    checks.push('Verify API versioning strategy is in place');
  }

  if (hasDestructiveMigration) {
    checks.push('Create database backup before deployment');
    checks.push('Verify migration rollback scripts are tested');
    checks.push('Schedule deployment during low-traffic window');
  }

  if (hasPermissionChange) {
    checks.push('Review permission changes with security team');
    checks.push('Verify access control tests are passing');
  }

  if (hasLowCoverage) {
    checks.push('Consider adding tests for uncovered code paths');
  }

  if (options.featureFlags) {
    checks.push('Verify feature flags are configured correctly');
    checks.push('Ensure feature flag rollback plan is documented');
  }

  return checks;
}

/**
 * Generate deploy steps based on findings
 */
function generateDeploySteps(findings: Finding[], options: RunbookGenerationOptions): string[] {
  const steps: string[] = ['Deploy application to staging environment', 'Run smoke tests'];

  const migrationFindings = findings.filter((f) => f.type === 'DESTRUCTIVE_MIGRATION');

  if (migrationFindings.length > 0 || options.includeMigrations) {
    steps.unshift('Run database migrations: `npm run migrate:up` or equivalent');
    steps.push('Verify database schema changes applied correctly');
  }

  if (options.featureFlags) {
    steps.push('Enable feature flags for new functionality');
    steps.push('Verify feature flag states in configuration');
  }

  steps.push('Deploy application to production environment');
  steps.push('Monitor application logs for errors');

  return steps;
}

/**
 * Generate post-deploy verification steps
 */
function generatePostDeployVerification(findings: Finding[], options: RunbookGenerationOptions): string[] {
  const verifications: string[] = [
    'Verify application health checks pass',
    'Monitor error rates in observability dashboard',
    'Verify key user flows are working',
  ];

  const hasBreakingApi = findings.some((f) => f.type === 'BREAKING_API');
  const hasDestructiveMigration = findings.some((f) => f.type === 'DESTRUCTIVE_MIGRATION');

  if (hasBreakingApi) {
    verifications.push('Verify API consumers are functioning correctly');
    verifications.push('Check API response times and error rates');
  }

  if (hasDestructiveMigration || options.includeMigrations) {
    verifications.push('Verify data integrity after migration');
    verifications.push('Run data validation queries');
  }

  if (options.featureFlags) {
    verifications.push('Verify feature flag behavior in production');
    verifications.push('Monitor feature-specific metrics');
  }

  return verifications;
}

/**
 * Generate rollback plan based on findings
 * 
 * Property 20: Runbook Migration Commands
 * For any analysis containing DESTRUCTIVE_MIGRATION findings, the generated runbook
 * should include migration up commands, migration down commands, and data loss warnings.
 * 
 * **Validates: Requirements 5.2, 5.4**
 */
function generateRollbackPlan(findings: Finding[], options: RunbookGenerationOptions): string[] {
  const rollbackSteps: string[] = [
    'Revert to previous release: `git revert <commit>` or deploy previous version',
  ];

  const migrationFindings = findings.filter((f) => f.type === 'DESTRUCTIVE_MIGRATION');

  if (migrationFindings.length > 0 || options.includeMigrations) {
    rollbackSteps.push('Run migration rollback: `npm run migrate:down` or equivalent');
    
    if (migrationFindings.length > 0) {
      rollbackSteps.push(
        '⚠️ DATA LOSS WARNING: Destructive migrations may cause irreversible data loss',
      );
    }
    
    rollbackSteps.push('Restore database from backup if data loss occurred');

    // Add specific warnings for each destructive migration
    for (const finding of migrationFindings) {
      if (finding.filePath) {
        rollbackSteps.push(`Review rollback for: ${finding.filePath}`);
      }
    }
  }

  if (options.featureFlags) {
    rollbackSteps.push('Disable feature flags for new functionality');
    rollbackSteps.push('Verify feature flag states after rollback');
  }

  rollbackSteps.push('Verify application is functioning after rollback');
  rollbackSteps.push('Notify stakeholders of rollback');

  return rollbackSteps;
}

/**
 * Serialize runbook to markdown format.
 * 
 * Property 4: Runbook Markdown Round-Trip
 * For any generated runbook, parsing the markdown structure and re-serializing
 * should preserve all sections and their content.
 * 
 * **Validates: Requirements 5.6**
 */
function serializeRunbookToMarkdown(runbook: Runbook): string {
  const lines: string[] = [];

  lines.push(`# Deployment Runbook: ${runbook.prTitle}`);
  lines.push('');
  lines.push(`**Risk Level:** ${runbook.riskLevel}`);
  lines.push(`**Risk Score:** ${runbook.riskScore}`);
  lines.push('');

  // Pre-Deploy section
  lines.push(RUNBOOK_SECTIONS.PRE_DEPLOY);
  lines.push('');
  for (const check of runbook.preDeploy) {
    lines.push(`- [ ] ${check}`);
  }
  lines.push('');

  // Deploy section
  lines.push(RUNBOOK_SECTIONS.DEPLOY);
  lines.push('');
  for (let i = 0; i < runbook.deploy.length; i++) {
    lines.push(`${i + 1}. ${runbook.deploy[i]}`);
  }
  lines.push('');

  // Post-Deploy section
  lines.push(RUNBOOK_SECTIONS.POST_DEPLOY);
  lines.push('');
  for (const verification of runbook.postDeploy) {
    lines.push(`- [ ] ${verification}`);
  }
  lines.push('');

  // Rollback section
  lines.push(RUNBOOK_SECTIONS.ROLLBACK);
  lines.push('');
  for (let i = 0; i < runbook.rollback.length; i++) {
    lines.push(`${i + 1}. ${runbook.rollback[i]}`);
  }

  return lines.join('\n');
}


/**
 * Apply a custom template to the runbook data.
 * Supports placeholders like {{prTitle}}, {{riskLevel}}, {{riskScore}},
 * {{preDeploy}}, {{deploy}}, {{postDeploy}}, {{rollback}}
 * 
 * Requirements: 5.3
 */
function applyCustomTemplate(template: string, runbook: Runbook): string {
  let result = template;

  // Replace simple placeholders
  result = result.replace(/\{\{prTitle\}\}/g, runbook.prTitle);
  result = result.replace(/\{\{riskLevel\}\}/g, runbook.riskLevel);
  result = result.replace(/\{\{riskScore\}\}/g, String(runbook.riskScore));

  // Replace section placeholders with formatted lists
  result = result.replace(
    /\{\{preDeploy\}\}/g,
    runbook.preDeploy.map((item) => `- [ ] ${item}`).join('\n')
  );

  result = result.replace(
    /\{\{deploy\}\}/g,
    runbook.deploy.map((item, i) => `${i + 1}. ${item}`).join('\n')
  );

  result = result.replace(
    /\{\{postDeploy\}\}/g,
    runbook.postDeploy.map((item) => `- [ ] ${item}`).join('\n')
  );

  result = result.replace(
    /\{\{rollback\}\}/g,
    runbook.rollback.map((item, i) => `${i + 1}. ${item}`).join('\n')
  );

  return result;
}
