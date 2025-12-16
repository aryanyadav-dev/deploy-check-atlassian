/**
 * Markdown Report Formatter
 * Generates markdown reports with summary, findings by category, and runbook
 * Requirements: 5.5, 5.6
 */

import type { Finding, RiskLevel } from '@dra/types';

/**
 * Extended finding with optional Jira issue link
 */
export interface LinkedFinding extends Finding {
  jiraIssueKey?: string;
}

/**
 * Options for markdown formatting
 */
export interface MarkdownFormatterOptions {
  /**
   * Include table of contents
   */
  includeToc?: boolean;

  /**
   * Include runbook section
   */
  includeRunbook?: boolean;

  /**
   * Custom report title
   */
  title?: string;

  /**
   * Include code snippets in findings
   */
  includeCodeSnippets?: boolean;

  /**
   * Custom template path (for future use)
   */
  templatePath?: string;
}

/**
 * Severity emoji mapping
 */
const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟢',
};

/**
 * Finding type labels (no emojis per design requirement)
 */
const FINDING_TYPE_LABELS: Record<string, string> = {
  BREAKING_API: '[API]',
  DESTRUCTIVE_MIGRATION: '[DB]',
  PERMISSION_CHANGE: '[PERM]',
  LOW_COVERAGE: '[COV]',
  UNDOCUMENTED_API: '[DOC]',
};

/**
 * Markdown formatter for report generation
 */
export class MarkdownFormatter {
  private options: Required<MarkdownFormatterOptions>;
  private jiraInstanceUrl?: string;

  constructor(options: MarkdownFormatterOptions = {}) {
    this.options = {
      includeToc: options.includeToc ?? true,
      includeRunbook: options.includeRunbook ?? true,
      title: options.title ?? 'Deployment Risk Analysis Report',
      includeCodeSnippets: options.includeCodeSnippets ?? true,
      templatePath: options.templatePath ?? '',
    };
  }

  /**
   * Set Jira instance URL for generating issue links
   */
  setJiraInstanceUrl(url: string): void {
    this.jiraInstanceUrl = url;
  }

  /**
   * Generate full markdown report
   */
  format(
    findings: LinkedFinding[],
    riskScore: number,
    riskLevel: RiskLevel | string,
    filesAnalyzed: number,
    analyzersRun: string[],
    warnings: string[] = []
  ): string {
    const sections: string[] = [];

    // Title
    sections.push(`# ${this.options.title}`);
    sections.push('');
    sections.push(`*Generated: ${new Date().toISOString()}*`);
    sections.push('');

    // Table of contents
    if (this.options.includeToc) {
      sections.push(this.generateToc(findings));
    }

    // Executive summary
    sections.push(this.generateSummary(findings, riskScore, riskLevel, filesAnalyzed, analyzersRun));

    // Risk score section
    sections.push(this.generateRiskSection(riskScore, riskLevel, findings));

    // Findings by category
    sections.push(this.generateFindingsSection(findings));

    // Warnings
    if (warnings.length > 0) {
      sections.push(this.generateWarningsSection(warnings));
    }

    // Runbook
    if (this.options.includeRunbook) {
      sections.push(this.generateRunbookSection(findings, riskLevel));
    }

    return sections.join('\n');
  }

  /**
   * Generate table of contents
   */
  private generateToc(findings: LinkedFinding[]): string {
    const lines: string[] = [];
    lines.push('## Table of Contents');
    lines.push('');
    lines.push('- [Executive Summary](#executive-summary)');
    lines.push('- [Risk Assessment](#risk-assessment)');
    lines.push('- [Findings](#findings)');

    // Add finding type sections
    const types = [...new Set(findings.map((f) => f.type))];
    for (const type of types) {
      const anchor = type.toLowerCase().replace(/_/g, '-');
      lines.push(`  - [${this.formatTypeName(type)}](#${anchor})`);
    }

    if (this.options.includeRunbook) {
      lines.push('- [Deployment Runbook](#deployment-runbook)');
    }

    lines.push('');
    return lines.join('\n');
  }


  /**
   * Generate executive summary section
   */
  private generateSummary(
    findings: LinkedFinding[],
    riskScore: number,
    riskLevel: RiskLevel | string,
    filesAnalyzed: number,
    analyzersRun: string[]
  ): string {
    const lines: string[] = [];
    const emoji = SEVERITY_EMOJI[riskLevel as string] ?? '⚪';
    const linkedCount = findings.filter(f => f.jiraIssueKey).length;

    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Risk Level | ${emoji} **${riskLevel}** |`);
    lines.push(`| Risk Score | ${riskScore} / 100 |`);
    lines.push(`| Total Findings | ${findings.length} |`);
    lines.push(`| Linked to Jira | ${linkedCount} |`);
    lines.push(`| Files Analyzed | ${filesAnalyzed} |`);
    lines.push(`| Analyzers Run | ${analyzersRun.length} |`);
    lines.push('');

    // Severity breakdown
    const severityCounts = this.countBySeverity(findings);
    if (Object.keys(severityCounts).length > 0) {
      lines.push('### Findings by Severity');
      lines.push('');
      lines.push('| Severity | Count |');
      lines.push('|----------|-------|');
      for (const [severity, count] of Object.entries(severityCounts)) {
        const sEmoji = SEVERITY_EMOJI[severity] ?? '⚪';
        lines.push(`| ${sEmoji} ${severity} | ${count} |`);
      }
      lines.push('');
    }

    // Linked Jira issues
    const linkedFindings = findings.filter(f => f.jiraIssueKey);
    if (linkedFindings.length > 0) {
      lines.push('### Linked Jira Issues');
      lines.push('');
      lines.push('| Issue | Finding | Severity |');
      lines.push('|-------|---------|----------|');
      for (const finding of linkedFindings) {
        const issueLink = this.jiraInstanceUrl
          ? `[${finding.jiraIssueKey}](${this.jiraInstanceUrl}/browse/${finding.jiraIssueKey})`
          : finding.jiraIssueKey;
        const sEmoji = SEVERITY_EMOJI[finding.severity] ?? '⚪';
        lines.push(`| ${issueLink} | ${finding.title} | ${sEmoji} ${finding.severity} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate risk assessment section
   */
  private generateRiskSection(
    riskScore: number,
    riskLevel: RiskLevel | string,
    findings: LinkedFinding[]
  ): string {
    const lines: string[] = [];
    const emoji = SEVERITY_EMOJI[riskLevel as string] ?? '⚪';

    lines.push('## Risk Assessment');
    lines.push('');
    lines.push(`### Overall Risk: ${emoji} ${riskLevel}`);
    lines.push('');
    lines.push(`**Score: ${riskScore} / 100**`);
    lines.push('');

    // Score breakdown by type
    const typeBreakdown = this.calculateTypeBreakdown(findings);
    if (typeBreakdown.length > 0) {
      lines.push('### Score Breakdown');
      lines.push('');
      lines.push('| Finding Type | Count | Score |');
      lines.push('|--------------|-------|-------|');
      for (const item of typeBreakdown) {
        const label = FINDING_TYPE_LABELS[item.type] ?? '[MISC]';
        lines.push(`| ${label} ${this.formatTypeName(item.type)} | ${item.count} | +${item.score} |`);
      }
      lines.push(`| **Total** | **${findings.length}** | **${riskScore}** |`);
      lines.push('');
    }

    // Risk level explanation
    lines.push('### Risk Level Thresholds');
    lines.push('');
    lines.push('| Level | Score Range |');
    lines.push('|-------|-------------|');
    lines.push('| 🟢 LOW | 0 - 34 |');
    lines.push('| 🟡 MEDIUM | 35 - 59 |');
    lines.push('| 🟠 HIGH | 60 - 79 |');
    lines.push('| 🔴 CRITICAL | 80+ |');
    lines.push('');

    return lines.join('\n');
  }


  /**
   * Generate findings section grouped by type
   */
  private generateFindingsSection(findings: LinkedFinding[]): string {
    const lines: string[] = [];

    lines.push('## Findings');
    lines.push('');

    if (findings.length === 0) {
      lines.push('✅ No deployment risks found!');
      lines.push('');
      return lines.join('\n');
    }

    // Group by type
    const grouped = this.groupByType(findings);

    for (const [type, typeFindings] of Object.entries(grouped)) {
      const label = FINDING_TYPE_LABELS[type] ?? '[MISC]';
      const anchor = type.toLowerCase().replace(/_/g, '-');

      lines.push(`### ${label} ${this.formatTypeName(type)} {#${anchor}}`);
      lines.push('');
      lines.push(`*${typeFindings.length} finding(s)*`);
      lines.push('');

      for (let i = 0; i < typeFindings.length; i++) {
        const finding = typeFindings[i];
        lines.push(this.formatFinding(finding, i + 1));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single finding
   */
  private formatFinding(finding: LinkedFinding, index: number): string {
    const lines: string[] = [];
    const sEmoji = SEVERITY_EMOJI[finding.severity] ?? '⚪';

    lines.push(`#### ${index}. ${finding.title}`);
    lines.push('');
    lines.push(`**Severity:** ${sEmoji} ${finding.severity}`);
    lines.push('');

    if (finding.filePath) {
      const location = finding.lineStart
        ? `${finding.filePath}:${finding.lineStart}${finding.lineEnd ? `-${finding.lineEnd}` : ''}`
        : finding.filePath;
      lines.push(`**Location:** \`${location}\``);
      lines.push('');
    }

    // Linked Jira issue
    if (finding.jiraIssueKey) {
      const issueLink = this.jiraInstanceUrl
        ? `[${finding.jiraIssueKey}](${this.jiraInstanceUrl}/browse/${finding.jiraIssueKey})`
        : finding.jiraIssueKey;
      lines.push(`**Jira Issue:** ${issueLink}`);
      lines.push('');
    }

    lines.push(`**Description:** ${finding.description}`);
    lines.push('');

    if (this.options.includeCodeSnippets && finding.codeSnippet) {
      lines.push('**Code:**');
      lines.push('```');
      lines.push(finding.codeSnippet);
      lines.push('```');
      lines.push('');
    }

    if (finding.remediation) {
      lines.push(`**Remediation:** ${finding.remediation}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate warnings section
   */
  private generateWarningsSection(warnings: string[]): string {
    const lines: string[] = [];

    lines.push('## Warnings');
    lines.push('');
    for (const warning of warnings) {
      lines.push(`- ⚠️ ${warning}`);
    }
    lines.push('');

    return lines.join('\n');
  }


  /**
   * Generate deployment runbook section
   */
  private generateRunbookSection(findings: LinkedFinding[], riskLevel: RiskLevel | string): string {
    const lines: string[] = [];
    const hasDestructiveMigrations = findings.some((f) => f.type === 'DESTRUCTIVE_MIGRATION');
    const hasBreakingApi = findings.some((f) => f.type === 'BREAKING_API');
    const hasPermissionChanges = findings.some((f) => f.type === 'PERMISSION_CHANGE');

    lines.push('## Deployment Runbook');
    lines.push('');
    lines.push(`*Auto-generated based on analysis findings*`);
    lines.push('');

    // Pre-deploy section
    lines.push('### Pre-Deploy Checklist');
    lines.push('');
    lines.push('- [ ] Review all findings in this report');
    lines.push('- [ ] Ensure all tests pass');
    lines.push('- [ ] Verify staging environment is ready');

    if (hasDestructiveMigrations) {
      lines.push('- [ ] **CRITICAL:** Back up database before deployment');
      lines.push('- [ ] Review migration rollback procedures');
      lines.push('- [ ] Notify DBA team of destructive migrations');
    }

    if (hasBreakingApi) {
      lines.push('- [ ] Notify API consumers of breaking changes');
      lines.push('- [ ] Update API documentation');
      lines.push('- [ ] Consider API versioning strategy');
    }

    if (hasPermissionChanges) {
      lines.push('- [ ] Review permission changes with security team');
      lines.push('- [ ] Test access control changes in staging');
    }

    lines.push('');

    // Deploy section
    lines.push('### Deploy Steps');
    lines.push('');

    if (hasDestructiveMigrations) {
      lines.push('1. Enable maintenance mode (if applicable)');
      lines.push('2. Create database backup');
      lines.push('3. Run database migrations');
      lines.push('4. Deploy application code');
      lines.push('5. Verify migrations completed successfully');
      lines.push('6. Disable maintenance mode');
    } else {
      lines.push('1. Deploy application code');
      lines.push('2. Verify deployment completed successfully');
    }

    lines.push('');

    // Post-deploy section
    lines.push('### Post-Deploy Verification');
    lines.push('');
    lines.push('- [ ] Verify application is running');
    lines.push('- [ ] Check error rates in monitoring');
    lines.push('- [ ] Verify critical user flows');

    if (hasDestructiveMigrations) {
      lines.push('- [ ] Verify database integrity');
      lines.push('- [ ] Check for data loss indicators');
    }

    if (hasBreakingApi) {
      lines.push('- [ ] Verify API endpoints respond correctly');
      lines.push('- [ ] Monitor API error rates');
    }

    lines.push('');

    // Rollback section
    lines.push('### Rollback Plan');
    lines.push('');

    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      lines.push('> ⚠️ **High-risk deployment:** Have rollback ready before proceeding');
      lines.push('');
    }

    if (hasDestructiveMigrations) {
      lines.push('**Database Rollback:**');
      lines.push('');
      lines.push('> ⚠️ **WARNING:** Destructive migrations detected. Data loss may occur during rollback.');
      lines.push('');
      lines.push('1. Stop application');
      lines.push('2. Restore database from backup');
      lines.push('3. Deploy previous application version');
      lines.push('4. Verify application functionality');
      lines.push('');
    }

    lines.push('**Application Rollback:**');
    lines.push('');
    lines.push('1. Deploy previous application version');
    lines.push('2. Verify application is running');
    lines.push('3. Monitor for issues');
    lines.push('');

    return lines.join('\n');
  }


  /**
   * Format finding type name for display
   */
  private formatTypeName(type: string): string {
    return type
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Group findings by type
   */
  private groupByType(findings: LinkedFinding[]): Record<string, LinkedFinding[]> {
    const grouped: Record<string, LinkedFinding[]> = {};

    for (const finding of findings) {
      if (!grouped[finding.type]) {
        grouped[finding.type] = [];
      }
      grouped[finding.type].push(finding);
    }

    return grouped;
  }

  /**
   * Count findings by severity
   */
  private countBySeverity(findings: LinkedFinding[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const finding of findings) {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
    }

    return counts;
  }

  /**
   * Calculate score breakdown by type
   */
  private calculateTypeBreakdown(findings: LinkedFinding[]): Array<{ type: string; count: number; score: number }> {
    const FINDING_SCORES: Record<string, number> = {
      BREAKING_API: 40,
      DESTRUCTIVE_MIGRATION: 50,
      PERMISSION_CHANGE: 30,
      LOW_COVERAGE: 20,
      UNDOCUMENTED_API: 10,
    };

    const typeMap = new Map<string, { count: number; score: number }>();

    for (const finding of findings) {
      const existing = typeMap.get(finding.type) || { count: 0, score: 0 };
      const baseScore = FINDING_SCORES[finding.type] ?? 0;
      existing.count++;
      existing.score += baseScore;
      typeMap.set(finding.type, existing);
    }

    return Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      score: data.score,
    }));
  }
}

/**
 * Create a default markdown formatter instance
 */
export function createMarkdownFormatter(options?: MarkdownFormatterOptions): MarkdownFormatter {
  return new MarkdownFormatter(options);
}
