/**
 * Terminal Output Formatter
 * Displays findings with colored severity indicators and visual elements
 * Requirements: 7.2, 7.3
 */

import chalk from 'chalk';
import type { Finding, RiskLevel } from '@dra/types';

/**
 * Extended finding with optional Jira issue link
 */
export interface LinkedFinding extends Finding {
  jiraIssueKey?: string;
}

/**
 * Severity color mapping
 */
const SEVERITY_COLORS = {
  CRITICAL: chalk.bgRed.white.bold,
  HIGH: chalk.red.bold,
  MEDIUM: chalk.yellow,
  LOW: chalk.green,
} as const;

/**
 * Severity icons
 */
const SEVERITY_ICONS = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟢',
} as const;

/**
 * Finding type icons
 */
const FINDING_TYPE_ICONS: Record<string, string> = {
  BREAKING_API: '⚡',
  DESTRUCTIVE_MIGRATION: '💾',
  PERMISSION_CHANGE: '🔐',
  LOW_COVERAGE: '📊',
  UNDOCUMENTED_API: '📝',
};

/**
 * Options for terminal formatting
 */
export interface TerminalFormatterOptions {
  verbose?: boolean;
  showCodeSnippets?: boolean;
  maxSnippetLines?: number;
}

/**
 * Terminal formatter for CLI output
 */
export class TerminalFormatter {
  private options: Required<TerminalFormatterOptions>;
  private jiraInstanceUrl?: string;

  constructor(options: TerminalFormatterOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      showCodeSnippets: options.showCodeSnippets ?? true,
      maxSnippetLines: options.maxSnippetLines ?? 5,
    };
  }

  /**
   * Set Jira instance URL for generating issue links
   */
  setJiraInstanceUrl(url: string): void {
    this.jiraInstanceUrl = url;
  }

  /**
   * Format and display findings to terminal
   */
  formatFindings(findings: LinkedFinding[]): string {
    if (findings.length === 0) {
      return chalk.green('\n✅ No deployment risks found!\n');
    }

    const lines: string[] = [];
    lines.push(chalk.bold(`\n⚠️  Found ${findings.length} deployment risk(s):\n`));

    // Show linked issues summary if any
    const linkedFindings = findings.filter(f => f.jiraIssueKey);
    if (linkedFindings.length > 0) {
      lines.push(chalk.dim(`📎 ${linkedFindings.length} finding(s) linked to Jira issues\n`));
    }

    // Group findings by type
    const grouped = this.groupByType(findings);

    for (const [type, typeFindings] of grouped) {
      const icon = FINDING_TYPE_ICONS[type] ?? '📋';
      lines.push(chalk.bold.cyan(`\n${icon} ${type} (${typeFindings.length}):`));
      lines.push(chalk.dim('─'.repeat(60)));

      for (const finding of typeFindings) {
        lines.push(this.formatFinding(finding));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single finding
   */
  private formatFinding(finding: LinkedFinding): string {
    const lines: string[] = [];
    const severityColor = SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] ?? chalk.white;
    const severityIcon = SEVERITY_ICONS[finding.severity as keyof typeof SEVERITY_ICONS] ?? '⚪';

    // Title with severity
    lines.push(`  ${severityIcon} ${severityColor(finding.severity)} ${chalk.bold(finding.title)}`);

    // File path and line numbers
    if (finding.filePath) {
      const location = finding.lineStart
        ? `${finding.filePath}:${finding.lineStart}${finding.lineEnd ? `-${finding.lineEnd}` : ''}`
        : finding.filePath;
      lines.push(`     ${chalk.dim('📁')} ${chalk.cyan(location)}`);
    }

    // Linked Jira issue
    if (finding.jiraIssueKey) {
      const issueLink = this.jiraInstanceUrl
        ? `${this.jiraInstanceUrl}/browse/${finding.jiraIssueKey}`
        : finding.jiraIssueKey;
      lines.push(`     ${chalk.blue('🎫')} ${chalk.blue(finding.jiraIssueKey)} ${chalk.dim(this.jiraInstanceUrl ? `(${issueLink})` : '')}`);
    }

    // Description (always show in verbose mode)
    if (this.options.verbose || finding.description) {
      lines.push(`     ${chalk.dim(finding.description)}`);
    }

    // Code snippet
    if (this.options.showCodeSnippets && finding.codeSnippet) {
      lines.push(this.formatCodeSnippet(finding.codeSnippet, finding.lineStart));
    }

    // Remediation suggestion
    if (finding.remediation) {
      lines.push(`     ${chalk.yellow('💡')} ${chalk.italic(finding.remediation)}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format code snippet with line numbers
   */
  private formatCodeSnippet(snippet: string, startLine?: number): string {
    const lines = snippet.split('\n').slice(0, this.options.maxSnippetLines);
    const formattedLines: string[] = [];

    formattedLines.push(chalk.dim('     ┌' + '─'.repeat(50)));

    lines.forEach((line, index) => {
      const lineNum = startLine ? startLine + index : index + 1;
      const lineNumStr = String(lineNum).padStart(4, ' ');
      formattedLines.push(chalk.dim(`     │ ${lineNumStr} │`) + ` ${line}`);
    });

    if (snippet.split('\n').length > this.options.maxSnippetLines) {
      formattedLines.push(chalk.dim('     │ ... (truncated)'));
    }

    formattedLines.push(chalk.dim('     └' + '─'.repeat(50)));

    return formattedLines.join('\n');
  }

  /**
   * Format risk score with visual progress bar
   */
  formatRiskScore(score: number, level: RiskLevel | string): string {
    const lines: string[] = [];
    const levelColor = SEVERITY_COLORS[level as keyof typeof SEVERITY_COLORS] ?? chalk.white;
    const levelIcon = SEVERITY_ICONS[level as keyof typeof SEVERITY_ICONS] ?? '⚪';

    lines.push('\n' + chalk.bold('═'.repeat(60)));
    lines.push(chalk.bold('  RISK ASSESSMENT'));
    lines.push(chalk.bold('═'.repeat(60)));

    // Progress bar
    const progressBar = this.createProgressBar(score, 100, 40);
    lines.push(`\n  Score: ${chalk.bold(String(score))} / 100`);
    lines.push(`  ${progressBar}`);

    // Risk level
    lines.push(`\n  ${levelIcon} Risk Level: ${levelColor(level)}`);

    // Threshold indicators
    lines.push(chalk.dim('\n  Thresholds: LOW(<35) | MEDIUM(35-59) | HIGH(60-79) | CRITICAL(≥80)'));
    lines.push(chalk.bold('═'.repeat(60)) + '\n');

    return lines.join('\n');
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(value: number, max: number, width: number): string {
    const percentage = Math.min(value / max, 1);
    const filled = Math.round(percentage * width);
    const empty = width - filled;

    let filledBar: string;
    if (value >= 80) {
      filledBar = chalk.bgRed(' '.repeat(filled));
    } else if (value >= 60) {
      filledBar = chalk.bgYellow(' '.repeat(filled));
    } else if (value >= 35) {
      filledBar = chalk.bgYellow(' '.repeat(filled));
    } else {
      filledBar = chalk.bgGreen(' '.repeat(filled));
    }

    const emptyBar = chalk.bgGray(' '.repeat(empty));

    return `[${filledBar}${emptyBar}]`;
  }

  /**
   * Format analysis summary
   */
  formatSummary(filesAnalyzed: number, analyzersRun: string[], warnings: string[]): string {
    const lines: string[] = [];

    lines.push(chalk.dim(`\nAnalyzed ${chalk.bold(String(filesAnalyzed))} file(s) with ${chalk.bold(String(analyzersRun.length))} analyzer(s)`));

    if (this.options.verbose && analyzersRun.length > 0) {
      lines.push(chalk.dim(`  Analyzers: ${analyzersRun.join(', ')}`));
    }

    if (warnings.length > 0) {
      lines.push(chalk.yellow('\n⚠️  Warnings:'));
      for (const warning of warnings) {
        lines.push(chalk.yellow(`   • ${warning}`));
      }
    }

    return lines.join('\n');
  }

  /**
   * Group findings by type
   */
  private groupByType(findings: LinkedFinding[]): Map<string, LinkedFinding[]> {
    const grouped = new Map<string, LinkedFinding[]>();

    for (const finding of findings) {
      const existing = grouped.get(finding.type) || [];
      existing.push(finding);
      grouped.set(finding.type, existing);
    }

    return grouped;
  }

  /**
   * Format error message
   */
  formatError(message: string): string {
    return chalk.red(`\n❌ Error: ${message}\n`);
  }

  /**
   * Format success message
   */
  formatSuccess(message: string): string {
    return chalk.green(`\n✅ ${message}\n`);
  }
}

/**
 * Create a default terminal formatter instance
 */
export function createTerminalFormatter(options?: TerminalFormatterOptions): TerminalFormatter {
  return new TerminalFormatter(options);
}
