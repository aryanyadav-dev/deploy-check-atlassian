import * as fc from 'fast-check';
import type { Finding, FindingType, Severity } from '@dra/types';
import {
  generateRunbook,
  serializeRunbookToMarkdown,
  parseRunbookFromMarkdown,
  RUNBOOK_SECTIONS,
} from './runbook.generator';

/**
 * Property tests for Runbook Generator
 */

// Generator for finding types
const findingTypeArb: fc.Arbitrary<FindingType> = fc.constantFrom(
  'BREAKING_API',
  'DESTRUCTIVE_MIGRATION',
  'PERMISSION_CHANGE',
  'LOW_COVERAGE',
  'UNDOCUMENTED_API',
);

// Generator for severity
const severityArb: fc.Arbitrary<Severity> = fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

// Generator for valid file paths (non-empty, no leading/trailing whitespace, no newlines)
const filePathArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !s.includes('\n') && s === s.trim());

// Generator for a single finding
const findingArb: fc.Arbitrary<Finding> = fc
  .tuple(
    findingTypeArb,
    severityArb,
    fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
    fc.option(filePathArb, { nil: undefined }),
  )
  .map(([type, severity, title, description, filePath]) => ({
    type,
    severity,
    title,
    description,
    filePath,
  }));

// Generator for array of findings
const findingsArb = fc.array(findingArb, { minLength: 0, maxLength: 10 });

// Generator for PR title (avoiding special markdown characters)
const prTitleArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => !s.includes('\n') && !s.includes('#') && s.trim().length > 0)
  .map((s) => s.trim());

describe('Runbook Required Sections Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 19: Runbook Required Sections**
   *
   * For any completed analysis, the generated runbook should contain non-empty
   * sections for: pre-deploy checks, deploy steps, post-deploy verification, and rollback plan.
   */

  it('should generate runbook with all required sections non-empty', () => {
    fc.assert(
      fc.property(prTitleArb, findingsArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);

        // All sections must be non-empty arrays
        expect(runbook.preDeploy.length).toBeGreaterThan(0);
        expect(runbook.deploy.length).toBeGreaterThan(0);
        expect(runbook.postDeploy.length).toBeGreaterThan(0);
        expect(runbook.rollback.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should include PR title in runbook', () => {
    fc.assert(
      fc.property(prTitleArb, findingsArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);
        expect(runbook.prTitle).toBe(prTitle);
      }),
      { numRuns: 100 },
    );
  });

  it('should include risk level and score in runbook', () => {
    fc.assert(
      fc.property(prTitleArb, findingsArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);

        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(runbook.riskLevel);
        expect(typeof runbook.riskScore).toBe('number');
        expect(runbook.riskScore).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should serialize to markdown with all section headers', () => {
    fc.assert(
      fc.property(prTitleArb, findingsArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);
        const markdown = serializeRunbookToMarkdown(runbook);

        // All section headers must be present
        expect(markdown).toContain(RUNBOOK_SECTIONS.PRE_DEPLOY);
        expect(markdown).toContain(RUNBOOK_SECTIONS.DEPLOY);
        expect(markdown).toContain(RUNBOOK_SECTIONS.POST_DEPLOY);
        expect(markdown).toContain(RUNBOOK_SECTIONS.ROLLBACK);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Runbook Migration Commands Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 20: Runbook Migration Commands**
   *
   * For any analysis containing DESTRUCTIVE_MIGRATION findings, the generated runbook
   * should include migration up commands, migration down commands, and data loss warnings.
   */

  // Generator for destructive migration finding
  const destructiveMigrationFindingArb: fc.Arbitrary<Finding> = fc
    .tuple(
      severityArb,
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.string({ minLength: 1, maxLength: 500 }),
      fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    )
    .map(([severity, title, description, filePath]) => ({
      type: 'DESTRUCTIVE_MIGRATION' as FindingType,
      severity,
      title,
      description,
      filePath,
    }));

  // Generator for findings that include at least one destructive migration
  const findingsWithMigrationArb = fc
    .tuple(destructiveMigrationFindingArb, findingsArb)
    .map(([migration, others]) => [migration, ...others]);

  it('should include migration up command when destructive migration present', () => {
    fc.assert(
      fc.property(prTitleArb, findingsWithMigrationArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);

        // Deploy section should include migration up command
        const deployText = runbook.deploy.join(' ');
        expect(deployText.toLowerCase()).toContain('migrate');
      }),
      { numRuns: 100 },
    );
  });

  it('should include migration down command in rollback when destructive migration present', () => {
    fc.assert(
      fc.property(prTitleArb, findingsWithMigrationArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);

        // Rollback section should include migration down command
        const rollbackText = runbook.rollback.join(' ');
        expect(rollbackText.toLowerCase()).toContain('migrate:down');
      }),
      { numRuns: 100 },
    );
  });

  it('should include data loss warning when destructive migration present', () => {
    fc.assert(
      fc.property(prTitleArb, findingsWithMigrationArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);

        // Rollback section should include data loss warning
        const rollbackText = runbook.rollback.join(' ');
        expect(rollbackText.toLowerCase()).toContain('data loss');
      }),
      { numRuns: 100 },
    );
  });

  it('should include database backup in pre-deploy when destructive migration present', () => {
    fc.assert(
      fc.property(prTitleArb, findingsWithMigrationArb, (prTitle, findings) => {
        const runbook = generateRunbook(prTitle, findings);

        // Pre-deploy section should include backup step
        const preDeployText = runbook.preDeploy.join(' ');
        expect(preDeployText.toLowerCase()).toContain('backup');
      }),
      { numRuns: 100 },
    );
  });
});

describe('Runbook Markdown Round-Trip Property', () => {
  /**
   * **Feature: deployment-risk-analyzer, Property 4: Runbook Markdown Round-Trip**
   *
   * For any generated runbook containing pre-deploy, deploy, post-deploy, and rollback sections,
   * parsing the markdown structure and re-serializing should preserve all sections and their content.
   */

  it('should round-trip serialize and parse runbook', () => {
    fc.assert(
      fc.property(prTitleArb, findingsArb, (prTitle, findings) => {
        const original = generateRunbook(prTitle, findings);
        const markdown = serializeRunbookToMarkdown(original);
        const parsed = parseRunbookFromMarkdown(markdown);

        // Verify all fields are preserved
        expect(parsed.prTitle).toBe(original.prTitle);
        expect(parsed.riskLevel).toBe(original.riskLevel);
        expect(parsed.riskScore).toBe(original.riskScore);

        // Verify all sections are preserved
        expect(parsed.preDeploy).toEqual(original.preDeploy);
        expect(parsed.deploy).toEqual(original.deploy);
        expect(parsed.postDeploy).toEqual(original.postDeploy);
        expect(parsed.rollback).toEqual(original.rollback);
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve section content exactly', () => {
    fc.assert(
      fc.property(prTitleArb, findingsArb, (prTitle, findings) => {
        const original = generateRunbook(prTitle, findings);
        const markdown = serializeRunbookToMarkdown(original);
        const parsed = parseRunbookFromMarkdown(markdown);

        // Each section item should be preserved exactly
        for (let i = 0; i < original.preDeploy.length; i++) {
          expect(parsed.preDeploy[i]).toBe(original.preDeploy[i]);
        }
        for (let i = 0; i < original.deploy.length; i++) {
          expect(parsed.deploy[i]).toBe(original.deploy[i]);
        }
        for (let i = 0; i < original.postDeploy.length; i++) {
          expect(parsed.postDeploy[i]).toBe(original.postDeploy[i]);
        }
        for (let i = 0; i < original.rollback.length; i++) {
          expect(parsed.rollback[i]).toBe(original.rollback[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should handle empty findings', () => {
    const runbook = generateRunbook('Test PR', []);
    const markdown = serializeRunbookToMarkdown(runbook);
    const parsed = parseRunbookFromMarkdown(markdown);

    expect(parsed.prTitle).toBe('Test PR');
    expect(parsed.riskLevel).toBe('LOW');
    expect(parsed.riskScore).toBe(0);
    expect(parsed.preDeploy.length).toBeGreaterThan(0);
    expect(parsed.deploy.length).toBeGreaterThan(0);
    expect(parsed.postDeploy.length).toBeGreaterThan(0);
    expect(parsed.rollback.length).toBeGreaterThan(0);
  });
});
