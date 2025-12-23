/**
 * Confluence Service
 *
 * Handles Confluence API interactions for report publishing.
 * Formats findings to Atlassian Document Format (ADF) and publishes reports.
 */

import api, { route } from '@forge/api';
import type { Finding, Severity } from '@dra/types';
import type { Solution, AnalysisResult } from '../types';
import { StorageService } from './storage.service';
import { withRetry, type RetryOptions } from '../utils/retry';

/**
 * ADF Node types for Atlassian Document Format
 */
interface ADFNode {
  type: string;
  content?: ADFNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * ADF Document structure
 */
export interface ADFDocument {
  version: 1;
  type: 'doc';
  content: ADFNode[];
}

/**
 * Confluence page response
 */
interface ConfluencePageResponse {
  id: string;
  title: string;
  version: { number: number };
  _links?: { webui?: string };
}

/**
 * Confluence search response
 */
interface ConfluenceSearchResponse {
  results: ConfluencePageResponse[];
}

/**
 * Severity to color mapping for status badges
 */
const SEVERITY_COLORS: Record<Severity, 'red' | 'yellow' | 'blue' | 'green'> = {
  CRITICAL: 'red',
  HIGH: 'red',
  MEDIUM: 'yellow',
  LOW: 'blue',
};

/**
 * Severity display labels
 */
const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/**
 * Publish options for retry configuration
 */
export interface PublishOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Callback for retry notifications */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
  /** Callback for final failure notification */
  onFinalFailure?: (error: Error, attempts: number) => void;
}

export interface IConfluenceService {
  formatToADF(findings: Finding[], solutions?: Solution[]): ADFDocument;
  publishReport(resultId: string, spaceKey: string, options?: PublishOptions): Promise<{ pageId: string }>;
}

/**
 * ConfluenceService handles formatting and publishing deployment risk reports.
 */
export class ConfluenceService implements IConfluenceService {
  private readonly storageService: StorageService;

  constructor(storageService?: StorageService) {
    this.storageService = storageService ?? new StorageService();
  }

  /**
   * Format findings to Atlassian Document Format (ADF).
   * Generates valid ADF markup including all finding details and solution recommendations.
   *
   * Requirement 3.2: Format findings using Confluence-compatible markup
   *
   * @param findings - Array of findings to format
   * @param solutions - Optional array of solutions for the findings
   * @returns Valid ADF document
   */
  formatToADF(findings: Finding[], solutions?: Solution[]): ADFDocument {
    const content: ADFNode[] = [];

    // Add report header
    content.push(this.createHeading('Deployment Risk Analysis Report', 1));
    content.push(this.createParagraph(`Generated: ${new Date().toISOString()}`));

    // Add summary section
    content.push(this.createHeading('Summary', 2));
    content.push(...this.createSummarySection(findings));

    // Add findings section grouped by severity
    content.push(this.createHeading('Findings', 2));

    if (findings.length === 0) {
      content.push(this.createInfoPanel('No deployment risks detected.'));
    } else {
      // Group findings by severity
      const groupedFindings = this.groupFindingsBySeverity(findings);

      // Add findings for each severity level (CRITICAL first)
      const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      for (const severity of severityOrder) {
        const severityFindings = groupedFindings.get(severity);
        if (severityFindings && severityFindings.length > 0) {
          content.push(this.createHeading(`${SEVERITY_LABELS[severity]} Severity`, 3));
          for (const finding of severityFindings) {
            content.push(...this.createFindingSection(finding, solutions));
          }
        }
      }
    }

    // Add solutions section if available
    if (solutions && solutions.length > 0) {
      content.push(this.createHeading('Recommended Solutions', 2));
      content.push(...this.createSolutionsSection(solutions));
    }

    return {
      version: 1,
      type: 'doc',
      content,
    };
  }

  /**
   * Publish a deployment risk report to Confluence.
   * Creates a new page or updates an existing one.
   * Uses retry with exponential backoff for transient failures.
   *
   * Requirement 3.3: Create or update pages in the configured space
   * Requirement 3.4: Retry with exponential backoff and notify user on final failure
   *
   * @param resultId - The analysis result ID to publish
   * @param spaceKey - The Confluence space key
   * @param options - Optional retry configuration
   * @returns Object containing the page ID
   */
  async publishReport(
    resultId: string,
    spaceKey: string,
    options: PublishOptions = {}
  ): Promise<{ pageId: string }> {
    // Get the cached analysis result
    const result = await this.getAnalysisResult(resultId);
    if (!result) {
      throw new Error(`Analysis result not found: ${resultId}`);
    }

    // Format the report
    const adfDocument = this.formatToADF(result.findings, result.solutions);

    // Generate page title
    const pageTitle = this.generatePageTitle(result);

    // Configure retry options
    const retryOptions: RetryOptions = {
      maxRetries: options.maxRetries ?? 3,
      baseDelay: options.baseDelay ?? 1000,
      onRetry: options.onRetry,
      onFinalFailure: options.onFinalFailure ?? ((error, attempts) => {
        console.error(`Publishing failed after ${attempts} attempts: ${error.message}`);
      }),
    };

    // Execute publish with retry
    return withRetry(async () => {
      // Check if page already exists
      const existingPage = await this.findExistingPage(spaceKey, pageTitle);

      if (existingPage) {
        // Update existing page
        const updatedPage = await this.updatePage(
          existingPage.id,
          pageTitle,
          adfDocument,
          existingPage.version.number + 1
        );
        return { pageId: updatedPage.id };
      } else {
        // Create new page
        const newPage = await this.createPage(spaceKey, pageTitle, adfDocument);
        return { pageId: newPage.id };
      }
    }, retryOptions);
  }

  /**
   * Get analysis result from storage or cache
   */
  private async getAnalysisResult(resultId: string): Promise<AnalysisResult | null> {
    return this.storageService.getCachedResult(resultId);
  }

  /**
   * Generate page title from analysis result
   */
  private generatePageTitle(result: AnalysisResult): string {
    const date = result.timestamp.toISOString().split('T')[0];
    const projectKey = result.projectKey ?? 'Unknown';
    return `Deployment Risk Report - ${projectKey} - ${date}`;
  }

  /**
   * Find an existing page by title in a space
   */
  private async findExistingPage(
    spaceKey: string,
    title: string
  ): Promise<ConfluencePageResponse | null> {
    try {
      const response = await api.asApp().requestConfluence(
        route`/wiki/api/v2/spaces/${spaceKey}/pages?title=${encodeURIComponent(title)}`,
        { method: 'GET' }
      );

      const data = (await response.json()) as ConfluenceSearchResponse;
      return data.results?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Create a new Confluence page
   */
  private async createPage(
    spaceKey: string,
    title: string,
    body: ADFDocument
  ): Promise<ConfluencePageResponse> {
    const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spaceId: spaceKey,
        title,
        body: {
          representation: 'atlas_doc_format',
          value: JSON.stringify(body),
        },
        status: 'current',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Confluence page: ${errorText}`);
    }

    return (await response.json()) as ConfluencePageResponse;
  }

  /**
   * Update an existing Confluence page
   */
  private async updatePage(
    pageId: string,
    title: string,
    body: ADFDocument,
    version: number
  ): Promise<ConfluencePageResponse> {
    const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pageId,
        title,
        body: {
          representation: 'atlas_doc_format',
          value: JSON.stringify(body),
        },
        version: { number: version },
        status: 'current',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update Confluence page: ${errorText}`);
    }

    return (await response.json()) as ConfluencePageResponse;
  }

  /**
   * Group findings by severity level
   */
  private groupFindingsBySeverity(findings: Finding[]): Map<Severity, Finding[]> {
    const grouped = new Map<Severity, Finding[]>();

    for (const finding of findings) {
      const existing = grouped.get(finding.severity) || [];
      existing.push(finding);
      grouped.set(finding.severity, existing);
    }

    return grouped;
  }

  /**
   * Create summary section with statistics
   */
  private createSummarySection(findings: Finding[]): ADFNode[] {
    const nodes: ADFNode[] = [];

    // Count by severity
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const finding of findings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
      byType[finding.type] = (byType[finding.type] || 0) + 1;
    }

    // Create summary table
    const tableRows: ADFNode[] = [
      this.createTableRow([
        this.createTableHeader('Metric'),
        this.createTableHeader('Value'),
      ]),
      this.createTableRow([
        this.createTableCell('Total Findings'),
        this.createTableCell(String(findings.length)),
      ]),
    ];

    // Add severity counts
    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]) {
      const count = bySeverity[severity] || 0;
      if (count > 0) {
        tableRows.push(
          this.createTableRow([
            this.createTableCell(`${SEVERITY_LABELS[severity]} Severity`),
            this.createTableCell(String(count)),
          ])
        );
      }
    }

    nodes.push({
      type: 'table',
      attrs: { isNumberColumnEnabled: false, layout: 'default' },
      content: tableRows,
    });

    return nodes;
  }

  /**
   * Create a section for a single finding
   */
  private createFindingSection(finding: Finding, solutions?: Solution[]): ADFNode[] {
    const nodes: ADFNode[] = [];

    // Finding panel with status
    const panelContent: ADFNode[] = [];

    // Title with severity badge
    panelContent.push({
      type: 'paragraph',
      content: [
        this.createStatusBadge(finding.severity),
        { type: 'text', text: ' ' },
        { type: 'text', text: finding.title, marks: [{ type: 'strong' }] },
      ],
    });

    // Description
    panelContent.push(this.createParagraph(finding.description));

    // Location info
    if (finding.filePath) {
      const locationText = finding.lineStart
        ? `${finding.filePath}:${finding.lineStart}${finding.lineEnd ? `-${finding.lineEnd}` : ''}`
        : finding.filePath;
      panelContent.push({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Location: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: locationText, marks: [{ type: 'code' }] },
        ],
      });
    }

    // Code snippet if available
    if (finding.codeSnippet) {
      panelContent.push({
        type: 'codeBlock',
        attrs: { language: this.detectLanguage(finding.filePath) },
        content: [{ type: 'text', text: finding.codeSnippet }],
      });
    }

    // Remediation if available
    if (finding.remediation) {
      panelContent.push({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Remediation: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: finding.remediation },
        ],
      });
    }

    // Find matching solution
    const solution = solutions?.find(
      (s) => s.findingType === finding.type && s.severity === finding.severity
    );
    if (solution && solution.mitigationSteps.length > 0) {
      panelContent.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Mitigation Steps:', marks: [{ type: 'strong' }] }],
      });
      panelContent.push(this.createBulletList(solution.mitigationSteps));
    }

    // Wrap in panel
    nodes.push({
      type: 'panel',
      attrs: { panelType: this.getPanelType(finding.severity) },
      content: panelContent,
    });

    return nodes;
  }

  /**
   * Create solutions section
   */
  private createSolutionsSection(solutions: Solution[]): ADFNode[] {
    const nodes: ADFNode[] = [];

    for (const solution of solutions) {
      // Solution heading
      nodes.push(this.createHeading(solution.title, 3));
      nodes.push(this.createParagraph(solution.description));

      // Mitigation steps
      if (solution.mitigationSteps.length > 0) {
        nodes.push({
          type: 'paragraph',
          content: [{ type: 'text', text: 'Steps:', marks: [{ type: 'strong' }] }],
        });
        nodes.push(this.createBulletList(solution.mitigationSteps));
      }

      // Code fix if available
      if (solution.codeFix) {
        nodes.push({
          type: 'paragraph',
          content: [{ type: 'text', text: 'Suggested Fix:', marks: [{ type: 'strong' }] }],
        });
        nodes.push({
          type: 'codeBlock',
          attrs: { language: this.detectLanguage(solution.codeFix.filePath) },
          content: [{ type: 'text', text: solution.codeFix.afterCode }],
        });
      }

      // Rollback procedure if available
      if (solution.rollbackProcedure) {
        nodes.push({
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Rollback Procedure: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: solution.rollbackProcedure },
          ],
        });
      }
    }

    return nodes;
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
   * Create an info panel node
   */
  private createInfoPanel(text: string): ADFNode {
    return {
      type: 'panel',
      attrs: { panelType: 'info' },
      content: [this.createParagraph(text)],
    };
  }

  /**
   * Create a status badge (lozenge) node
   */
  private createStatusBadge(severity: Severity): ADFNode {
    return {
      type: 'status',
      attrs: {
        text: SEVERITY_LABELS[severity],
        color: SEVERITY_COLORS[severity],
      },
    };
  }

  /**
   * Create a bullet list node
   */
  private createBulletList(items: string[]): ADFNode {
    return {
      type: 'bulletList',
      content: items.map((item) => ({
        type: 'listItem',
        content: [this.createParagraph(item)],
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
   * Get panel type based on severity
   */
  private getPanelType(severity: Severity): 'error' | 'warning' | 'info' | 'note' {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warning';
      case 'LOW':
      default:
        return 'info';
    }
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
}
