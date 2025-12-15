import { Injectable } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Represents a destructive SQL operation found in a migration.
 */
export interface DestructiveOperation {
  type: 'DROP_TABLE' | 'DROP_COLUMN' | 'ALTER_TYPE' | 'DROP_INDEX' | 'TRUNCATE';
  statement: string;
  lineNumber?: number;
  objectName?: string;
}

/**
 * SQL Migration analyzer for detecting destructive database operations.
 * Detects DROP TABLE, DROP COLUMN, ALTER TYPE statements in migration files
 * (Requirements 2.3, 2.4).
 */
@Injectable()
export class SqlMigrationAnalyzer extends BaseAnalyzer {
  readonly name = 'sql-migration';
  readonly supportedExtensions = ['.sql'];

  // Patterns for migration file paths
  private readonly migrationPathPatterns = [
    /^migrations\//i,
    /\/migrations\//i,
    /^db\/migrate\//i,
    /\/db\/migrate\//i,
    /^database\/migrations\//i,
    /\/database\/migrations\//i,
  ];

  // Regex patterns for destructive SQL operations
  private readonly destructivePatterns: Array<{
    pattern: RegExp;
    type: DestructiveOperation['type'];
    extractName: (match: RegExpMatchArray) => string | undefined;
  }> = [
    {
      pattern: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:`|"|')?(\w+)(?:`|"|')?/gi,
      type: 'DROP_TABLE',
      extractName: (match) => match[1],
    },
    {
      pattern: /ALTER\s+TABLE\s+(?:`|"|')?(\w+)(?:`|"|')?\s+DROP\s+(?:COLUMN\s+)?(?:`|"|')?(\w+)(?:`|"|')?/gi,
      type: 'DROP_COLUMN',
      extractName: (match) => `${match[1]}.${match[2]}`,
    },
    {
      pattern: /ALTER\s+(?:TYPE|COLUMN)\s+(?:`|"|')?(\w+)(?:`|"|')?\s+(?:TYPE|SET\s+DATA\s+TYPE)/gi,
      type: 'ALTER_TYPE',
      extractName: (match) => match[1],
    },
    {
      pattern: /ALTER\s+TABLE\s+(?:`|"|')?(\w+)(?:`|"|')?\s+ALTER\s+(?:COLUMN\s+)?(?:`|"|')?(\w+)(?:`|"|')?\s+(?:TYPE|SET\s+DATA\s+TYPE)/gi,
      type: 'ALTER_TYPE',
      extractName: (match) => `${match[1]}.${match[2]}`,
    },
    {
      pattern: /TRUNCATE\s+(?:TABLE\s+)?(?:`|"|')?(\w+)(?:`|"|')?/gi,
      type: 'TRUNCATE',
      extractName: (match) => match[1],
    },
  ];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const file of context.files) {
      // Check if file is a migration file
      if (!this.isMigrationFile(file.path)) {
        continue;
      }

      // Analyze the file content
      const fileFindings = this.analyzeFile(file);
      findings.push(...fileFindings);
    }

    return findings;
  }

  /**
   * Check if a file path matches migration patterns.
   */
  isMigrationFile(filePath: string): boolean {
    return this.migrationPathPatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Analyze a single migration file for destructive operations.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Only analyze new content (what's being added)
    const content = file.newContent;
    if (!content) {
      return findings;
    }

    const operations = this.detectDestructiveOperations(content);

    for (const op of operations) {
      findings.push(this.createFinding(file.path, op));
    }

    return findings;
  }

  /**
   * Detect destructive SQL operations in content.
   */
  detectDestructiveOperations(content: string): DestructiveOperation[] {
    const operations: DestructiveOperation[] = [];

    for (const { pattern, type, extractName } of this.destructivePatterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        // Find line number
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        operations.push({
          type,
          statement: match[0].trim(),
          lineNumber,
          objectName: extractName(match),
        });
      }
    }

    return operations;
  }

  /**
   * Create a finding for a destructive operation.
   */
  private createFinding(filePath: string, op: DestructiveOperation): Finding {
    const severity = this.getSeverity(op.type);
    const title = this.getTitle(op);
    const description = this.getDescription(op);
    const remediation = this.getRemediation(op);

    return {
      type: 'DESTRUCTIVE_MIGRATION',
      severity,
      title,
      description,
      filePath,
      lineStart: op.lineNumber,
      codeSnippet: op.statement,
      remediation,
      metadata: {
        operationType: op.type,
        objectName: op.objectName,
      },
    };
  }

  /**
   * Determine severity based on operation type.
   */
  private getSeverity(type: DestructiveOperation['type']): 'HIGH' | 'CRITICAL' {
    switch (type) {
      case 'DROP_TABLE':
      case 'TRUNCATE':
        return 'CRITICAL';
      case 'DROP_COLUMN':
      case 'ALTER_TYPE':
      case 'DROP_INDEX':
      default:
        return 'HIGH';
    }
  }

  /**
   * Generate title for the finding.
   */
  private getTitle(op: DestructiveOperation): string {
    switch (op.type) {
      case 'DROP_TABLE':
        return `Destructive migration: DROP TABLE ${op.objectName || ''}`.trim();
      case 'DROP_COLUMN':
        return `Destructive migration: DROP COLUMN ${op.objectName || ''}`.trim();
      case 'ALTER_TYPE':
        return `Destructive migration: ALTER TYPE ${op.objectName || ''}`.trim();
      case 'TRUNCATE':
        return `Destructive migration: TRUNCATE ${op.objectName || ''}`.trim();
      default:
        return `Destructive migration: ${op.type}`;
    }
  }

  /**
   * Generate description for the finding.
   */
  private getDescription(op: DestructiveOperation): string {
    switch (op.type) {
      case 'DROP_TABLE':
        return `This migration drops table '${op.objectName}'. This is a destructive operation that will permanently delete all data in the table.`;
      case 'DROP_COLUMN':
        return `This migration drops column '${op.objectName}'. This will permanently delete all data in this column.`;
      case 'ALTER_TYPE':
        return `This migration alters the type of '${op.objectName}'. This may cause data loss or conversion errors.`;
      case 'TRUNCATE':
        return `This migration truncates table '${op.objectName}'. This will permanently delete all rows in the table.`;
      default:
        return `Destructive SQL operation detected: ${op.statement}`;
    }
  }

  /**
   * Generate remediation advice for the finding.
   */
  private getRemediation(op: DestructiveOperation): string {
    const common = 'Ensure you have a backup before running this migration. Consider adding a rollback migration.';

    switch (op.type) {
      case 'DROP_TABLE':
        return `${common} If the table contains important data, consider renaming it instead of dropping.`;
      case 'DROP_COLUMN':
        return `${common} Consider creating a backup column or table before dropping.`;
      case 'ALTER_TYPE':
        return `${common} Test the type conversion with production-like data to ensure no data loss.`;
      case 'TRUNCATE':
        return `${common} Consider using DELETE with a WHERE clause for more controlled data removal.`;
      default:
        return common;
    }
  }
}
