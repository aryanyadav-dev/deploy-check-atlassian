import type { Finding, RiskLevel } from '@dra/types';
import { calculateRiskScoreWithBreakdown } from './risk-score.calculator';

/**
 * Runbook structure with required sections
 */
export interface Runbook {
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
export const RUNBOOK_SECTIONS = {
  PRE_DEPLOY: '## Pre-Deploy Checks',
  DEPLOY: '## Deploy Steps',
  POST_DEPLOY: '## Post-Deploy Verification',
  ROLLBACK: '## Rollback Plan',
} as const;

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
export function generateRunbook(prTitle: string, findings: Finding[]): Runbook {
  const { totalScore, riskLevel } = calculateRiskScoreWithBreakdown(findings);

  const preDeploy = generatePreDeployChecks(findings);
  const deploy = generateDeploySteps(findings);
  const postDeploy = generatePostDeployVerification(findings);
  const rollback = generateRollbackPlan(findings);

  return {
    prTitle,
    riskLevel,
    riskScore: totalScore,
    preDeploy,
    deploy,
    postDeploy,
    rollback,
  };
}

/**
 * Generate pre-deploy checks based on findings
 */
function generatePreDeployChecks(findings: Finding[]): string[] {
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

  return checks;
}

/**
 * Generate deploy steps based on findings
 */
function generateDeploySteps(findings: Finding[]): string[] {
  const steps: string[] = ['Deploy application to staging environment', 'Run smoke tests'];

  const migrationFindings = findings.filter((f) => f.type === 'DESTRUCTIVE_MIGRATION');

  if (migrationFindings.length > 0) {
    steps.unshift('Run database migrations: `npm run migrate:up` or equivalent');
    steps.push('Verify database schema changes applied correctly');
  }

  steps.push('Deploy application to production environment');
  steps.push('Monitor application logs for errors');

  return steps;
}

/**
 * Generate post-deploy verification steps
 */
function generatePostDeployVerification(findings: Finding[]): string[] {
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

  if (hasDestructiveMigration) {
    verifications.push('Verify data integrity after migration');
    verifications.push('Run data validation queries');
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
function generateRollbackPlan(findings: Finding[]): string[] {
  const rollbackSteps: string[] = [
    'Revert to previous release: `git revert <commit>` or deploy previous version',
  ];

  const migrationFindings = findings.filter((f) => f.type === 'DESTRUCTIVE_MIGRATION');

  if (migrationFindings.length > 0) {
    rollbackSteps.push('Run migration rollback: `npm run migrate:down` or equivalent');
    rollbackSteps.push(
      '⚠️ DATA LOSS WARNING: Destructive migrations may cause irreversible data loss',
    );
    rollbackSteps.push('Restore database from backup if data loss occurred');

    // Add specific warnings for each destructive migration
    for (const finding of migrationFindings) {
      if (finding.filePath) {
        rollbackSteps.push(`Review rollback for: ${finding.filePath}`);
      }
    }
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
export function serializeRunbookToMarkdown(runbook: Runbook): string {
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
 * Parse runbook from markdown format.
 */
export function parseRunbookFromMarkdown(markdown: string): Runbook {
  const lines = markdown.split('\n');

  let prTitle = '';
  let riskLevel: RiskLevel = 'LOW';
  let riskScore = 0;
  const preDeploy: string[] = [];
  const deploy: string[] = [];
  const postDeploy: string[] = [];
  const rollback: string[] = [];

  let currentSection: 'none' | 'preDeploy' | 'deploy' | 'postDeploy' | 'rollback' = 'none';

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse title
    if (trimmed.startsWith('# Deployment Runbook:')) {
      prTitle = trimmed.replace('# Deployment Runbook:', '').trim();
      continue;
    }

    // Parse risk level
    if (trimmed.startsWith('**Risk Level:**')) {
      riskLevel = trimmed.replace('**Risk Level:**', '').trim() as RiskLevel;
      continue;
    }

    // Parse risk score
    if (trimmed.startsWith('**Risk Score:**')) {
      riskScore = parseInt(trimmed.replace('**Risk Score:**', '').trim(), 10) || 0;
      continue;
    }

    // Detect section changes
    if (trimmed === RUNBOOK_SECTIONS.PRE_DEPLOY) {
      currentSection = 'preDeploy';
      continue;
    }
    if (trimmed === RUNBOOK_SECTIONS.DEPLOY) {
      currentSection = 'deploy';
      continue;
    }
    if (trimmed === RUNBOOK_SECTIONS.POST_DEPLOY) {
      currentSection = 'postDeploy';
      continue;
    }
    if (trimmed === RUNBOOK_SECTIONS.ROLLBACK) {
      currentSection = 'rollback';
      continue;
    }

    // Skip empty lines
    if (!trimmed) continue;

    // Parse list items based on current section
    let content = '';

    // Checkbox items: - [ ] content (preserve content as-is after the checkbox)
    if (trimmed.startsWith('- [ ]')) {
      content = trimmed.slice(5).trimStart();
    }
    // Numbered items: 1. content (preserve content as-is after the number)
    else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^\d+\.\s/);
      if (match) {
        content = trimmed.slice(match[0].length);
      }
    }

    if (content) {
      switch (currentSection) {
        case 'preDeploy':
          preDeploy.push(content);
          break;
        case 'deploy':
          deploy.push(content);
          break;
        case 'postDeploy':
          postDeploy.push(content);
          break;
        case 'rollback':
          rollback.push(content);
          break;
      }
    }
  }

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
