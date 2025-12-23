/**
 * Jira Service
 *
 * Handles Jira API interactions for issue creation.
 * Maps findings to Jira issues with proper priority, summary, and description.
 */

import api, { route } from '@forge/api';
import type { Finding, Severity } from '@dra/types';
import { solutionService } from './solution.service';
import type { Solution } from '../types';

/**
 * Result of creating a Jira issue
 */
export interface IssueCreateResult {
  issueKey: string;
  issueId: string;
  self: string;
}

/**
 * ADF Node for Atlassian Document Format
 */
interface ADFNode {
  type: string;
  content?: ADFNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * ADF Document structure for issue description
 */
interface ADFDocument {
  version: 1;
  type: 'doc';
  content: ADFNode[];
}

/**
 * Jira issue creation request
 */
interface JiraCreateIssueRequest {
  fields: {
    project: { key: string };
    summary: string;
    description: ADFDocument;
    issuetype: { name: string };
    priority?: { name: string };
    labels?: string[];
  };
}

/**
 * Jira issue creation response
 */
interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

/**
 * Maps finding severity to Jira priority names
 * Requirement 5.2: Populate severity-based priority
 */
const SEVERITY_TO_PRIORITY: Record<Severity, string> = {
  CRITICAL: 'Highest',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/**
 * Human-readable labels for finding types
 */
const FINDING_TYPE_LABELS: Record<string, string> = {
  BREAKING_API: 'Breaking API Change',
  DESTRUCTIVE_MIGRATION: 'Destructive Migration',
  PERMISSION_CHANGE: 'Permission Change',
  LOW_COVERAGE: 'Low Test Coverage',
  UNDOCUMENTED_API: 'Undocumented API',
};

/**
 * Interface for JiraService
 */
export interface IJiraService {
  createIssueFromFinding(
    finding: Finding,
    projectKey: string,
    prLink?: string
  ): Promise<IssueCreateResult>;
}

/**
 * JiraService handles Jira API interactions for issue creation.
 */
export class JiraService implements IJiraService {
  /**
   * Create a Jira issue from a deployment risk finding.
   *
   * Requirement 5.1: Create a Jira issue with finding details
   * Requirement 5.2: Populate summary, description, and severity-based priority
   * Requirement 5.3: Link the issue to the source PR or commit
   *
   * @param finding - The finding to create an issue for
   * @param projectKey - The Jira project key
   * @param prLink - Optional link to the PR or commit
   * @returns The created issue details
   */
  async createIssueFromFinding(
    finding: Finding,
    projectKey: string,
    prLink?: string
  ): Promise<IssueCreateResult> {
    // Generate solution recommendations for the finding
    const solution = solutionService.generateSolution(finding);

    // Build the issue request
    const request = this.buildIssueRequest(finding, projectKey, solution, prLink);

    // Create the issue via Jira API
    const response = await api.asApp().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Jira issue: ${errorText}`);
    }

    const result = (await response.json()) as JiraCreateIssueResponse;

    return {
      issueKey: result.key,
      issueId: result.id,
      self: result.self,
    };
  }

  /**
   * Build the Jira issue creation request
   */
  private buildIssueRequest(
    finding: Finding,
    projectKey: string,
    solution: Solution,
    prLink?: string
  ): JiraCreateIssueRequest {
    return {
      fields: {
        project: { key: projectKey },
        summary: this.generateSummary(finding),
        description: this.generateDescription(finding, solution, prLink),
        issuetype: { name: 'Task' },
        priority: { name: this.mapSeverityToPriority(finding.severity) },
        labels: this.generateLabels(finding),
      },
    };
  }

  /**
   * Generate issue summary from finding
   * Requirement 5.2: Generate summary from finding message
   */
  private generateSummary(finding: Finding): string {
    const typeLabel = FINDING_TYPE_LABELS[finding.type] ?? finding.type;
    const location = finding.filePath ? ` in ${this.getFileName(finding.filePath)}` : '';
    return `[${finding.severity}] ${typeLabel}${location}: ${this.truncate(finding.title, 100)}`;
  }

  /**
   * Map finding severity to Jira priority
   * Requirement 5.2: Populate severity-based priority
   */
  private mapSeverityToPriority(severity: Severity): string {
    return SEVERITY_TO_PRIORITY[severity] ?? 'Medium';
  }

  /**
   * Generate labels for the issue
   */
  private generateLabels(finding: Finding): string[] {
    const labels = ['deploy-check', 'deployment-risk'];

    // Add severity label
    labels.push(`severity-${finding.severity.toLowerCase()}`);

    // Add type label
    labels.push(`type-${finding.type.toLowerCase().replace(/_/g, '-')}`);

    return labels;
  }

  /**
   * Generate ADF description with finding details and solution recommendations
   * Requirement 5.2: Generate description with full finding details
   * Requirement 5.3: Include PR/commit link
   */
  private generateDescription(
    finding: Finding,
    solution: Solution,
    prLink?: string
  ): ADFDocument {
    const content: ADFNode[] = [];

    // Overview section
    content.push(this.createHeading('Deployment Risk Finding', 2));
    content.push(this.createParagraph(finding.description));

    // Finding details table
    content.push(this.createHeading('Details', 3));
    content.push(this.createDetailsTable(finding, prLink));

    // Code snippet if available
    if (finding.codeSnippet) {
      content.push(this.createHeading('Code Snippet', 3));
      content.push(this.createCodeBlock(finding.codeSnippet, finding.filePath));
    }

    // Solution recommendations section
    content.push(this.createHeading('Recommended Solution', 2));
    content.push(this.createParagraph(solution.description));

    // Mitigation steps
    if (solution.mitigationSteps.length > 0) {
      content.push(this.createHeading('Mitigation Steps', 3));
      content.push(this.createNumberedList(solution.mitigationSteps));
    }

    // Code fix suggestion if available
    if (solution.codeFix) {
      content.push(this.createHeading('Suggested Code Fix', 3));
      content.push(this.createParagraph(solution.codeFix.description));
      content.push(this.createCodeBlock(solution.codeFix.afterCode, solution.codeFix.filePath));
    }

    // Rollback procedure if available
    if (solution.rollbackProcedure) {
      content.push(this.createHeading('Rollback Procedure', 3));
      content.push(this.createParagraph(solution.rollbackProcedure));
    }

    // Documentation links if available
    if (solution.documentationLinks && solution.documentationLinks.length > 0) {
      content.push(this.createHeading('Documentation', 3));
      content.push(this.createLinkList(solution.documentationLinks));
    }

    return {
      version: 1,
      type: 'doc',
      content,
    };
  }

  /**
   * Create a details table with finding information
   */
  private createDetailsTable(finding: Finding, prLink?: string): ADFNode {
    const rows: ADFNode[] = [
      this.createTableRow([
        this.createTableHeader('Property'),
        this.createTableHeader('Value'),
      ]),
      this.createTableRow([
        this.createTableCell('Type'),
        this.createTableCell(FINDING_TYPE_LABELS[finding.type] ?? finding.type),
      ]),
      this.createTableRow([
        this.createTableCell('Severity'),
        this.createTableCell(finding.severity),
      ]),
    ];

    // Add file location if available
    if (finding.filePath) {
      const location = finding.lineStart
        ? `${finding.filePath}:${finding.lineStart}${finding.lineEnd ? `-${finding.lineEnd}` : ''}`
        : finding.filePath;
      rows.push(
        this.createTableRow([
          this.createTableCell('Location'),
          this.createTableCellWithCode(location),
        ])
      );
    }

    // Add PR link if available (Requirement 5.3)
    if (prLink) {
      rows.push(
        this.createTableRow([
          this.createTableCell('Source'),
          this.createTableCellWithLink('View PR/Commit', prLink),
        ])
      );
    }

    // Add remediation if available
    if (finding.remediation) {
      rows.push(
        this.createTableRow([
          this.createTableCell('Remediation'),
          this.createTableCell(finding.remediation),
        ])
      );
    }

    return {
      type: 'table',
      attrs: { isNumberColumnEnabled: false, layout: 'default' },
      content: rows,
    };
  }

  /**
   * Create a heading node
   */
  private createHeading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6): ADFNode {
    return {
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Create a paragraph node
   */
  private createParagraph(text: string): ADFNode {
    return {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    };
  }

  /**
   * Create a code block node
   */
  private createCodeBlock(code: string, filePath?: string): ADFNode {
    return {
      type: 'codeBlock',
      attrs: { language: this.detectLanguage(filePath) },
      content: [{ type: 'text', text: code }],
    };
  }

  /**
   * Create a numbered list node
   */
  private createNumberedList(items: string[]): ADFNode {
    return {
      type: 'orderedList',
      content: items.map((item) => ({
        type: 'listItem',
        content: [this.createParagraph(item)],
      })),
    };
  }

  /**
   * Create a list of links
   */
  private createLinkList(links: string[]): ADFNode {
    return {
      type: 'bulletList',
      content: links.map((link) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: link,
                marks: [{ type: 'link', attrs: { href: link } }],
              },
            ],
          },
        ],
      })),
    };
  }

  /**
   * Create a table row node
   */
  private createTableRow(cells: ADFNode[]): ADFNode {
    return {
      type: 'tableRow',
      content: cells,
    };
  }

  /**
   * Create a table header cell node
   */
  private createTableHeader(text: string): ADFNode {
    return {
      type: 'tableHeader',
      attrs: {},
      content: [this.createParagraph(text)],
    };
  }

  /**
   * Create a table cell node
   */
  private createTableCell(text: string): ADFNode {
    return {
      type: 'tableCell',
      attrs: {},
      content: [this.createParagraph(text)],
    };
  }

  /**
   * Create a table cell with code formatting
   */
  private createTableCellWithCode(text: string): ADFNode {
    return {
      type: 'tableCell',
      attrs: {},
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text, marks: [{ type: 'code' }] }],
        },
      ],
    };
  }

  /**
   * Create a table cell with a link
   */
  private createTableCellWithLink(text: string, href: string): ADFNode {
    return {
      type: 'tableCell',
      attrs: {},
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text,
              marks: [{ type: 'link', attrs: { href } }],
            },
          ],
        },
      ],
    };
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguage(filePath?: string): string {
    if (!filePath) return 'text';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      sql: 'sql',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      md: 'markdown',
      sh: 'bash',
      bash: 'bash',
    };

    return languageMap[ext ?? ''] ?? 'text';
  }

  /**
   * Get file name from path
   */
  private getFileName(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
  }

  /**
   * Truncate text to a maximum length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

// Export singleton instance
export const jiraService = new JiraService();
