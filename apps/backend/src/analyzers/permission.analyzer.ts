import { Injectable } from '@nestjs/common';
import type { AnalysisContext, Finding, FileChange, DiffHunk } from '@dra/types';
import { BaseAnalyzer } from './base.analyzer';

/**
 * Represents a permission pattern match found in code.
 */
export interface PermissionMatch {
  pattern: string;
  lineNumber: number;
  context: string;
  matchType: 'function_call' | 'property_access' | 'comparison' | 'decorator';
}

/**
 * Permission pattern analyzer for detecting access control changes.
 * Scans diffs for ACL patterns like hasPermission, isAdmin, role checks
 * (Requirements 2.5).
 */
@Injectable()
export class PermissionAnalyzer extends BaseAnalyzer {
  readonly name = 'permission';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rb'];

  // Patterns that indicate permission/access control logic
  private readonly permissionPatterns: Array<{
    pattern: RegExp;
    description: string;
    matchType: PermissionMatch['matchType'];
  }> = [
    // Function calls
    {
      pattern: /\bhasPermission\s*\(/gi,
      description: 'Permission check function',
      matchType: 'function_call',
    },
    {
      pattern: /\bcheckPermission\s*\(/gi,
      description: 'Permission check function',
      matchType: 'function_call',
    },
    {
      pattern: /\bcanAccess\s*\(/gi,
      description: 'Access check function',
      matchType: 'function_call',
    },
    {
      pattern: /\bisAuthorized\s*\(/gi,
      description: 'Authorization check function',
      matchType: 'function_call',
    },
    {
      pattern: /\brequirePermission\s*\(/gi,
      description: 'Permission requirement function',
      matchType: 'function_call',
    },
    {
      pattern: /\bverifyAccess\s*\(/gi,
      description: 'Access verification function',
      matchType: 'function_call',
    },

    // Admin checks
    {
      pattern: /\bisAdmin\b/gi,
      description: 'Admin status check',
      matchType: 'property_access',
    },
    {
      pattern: /\bisSuperAdmin\b/gi,
      description: 'Super admin status check',
      matchType: 'property_access',
    },
    {
      pattern: /\bisOwner\b/gi,
      description: 'Owner status check',
      matchType: 'property_access',
    },
    {
      pattern: /\bisModerator\b/gi,
      description: 'Moderator status check',
      matchType: 'property_access',
    },

    // Role comparisons
    {
      pattern: /\.role\s*===?\s*['"`]/gi,
      description: 'Role comparison',
      matchType: 'comparison',
    },
    {
      pattern: /['"`]\s*===?\s*\.?role\b/gi,
      description: 'Role comparison',
      matchType: 'comparison',
    },
    {
      pattern: /\.roles\s*\.\s*includes\s*\(/gi,
      description: 'Role inclusion check',
      matchType: 'function_call',
    },
    {
      pattern: /req\.user\.roles?\b/gi,
      description: 'Request user role access',
      matchType: 'property_access',
    },
    {
      pattern: /user\.roles?\b/gi,
      description: 'User role access',
      matchType: 'property_access',
    },
    {
      pattern: /currentUser\.roles?\b/gi,
      description: 'Current user role access',
      matchType: 'property_access',
    },

    // Decorators (NestJS, etc.)
    {
      pattern: /@Roles\s*\(/gi,
      description: 'Roles decorator',
      matchType: 'decorator',
    },
    {
      pattern: /@RequirePermission\s*\(/gi,
      description: 'Permission decorator',
      matchType: 'decorator',
    },
    {
      pattern: /@Authorize\s*\(/gi,
      description: 'Authorization decorator',
      matchType: 'decorator',
    },
    {
      pattern: /@UseGuards\s*\([^)]*(?:Auth|Role|Permission)/gi,
      description: 'Guard decorator with auth',
      matchType: 'decorator',
    },

    // ACL patterns
    {
      pattern: /\bacl\s*\.\s*(?:check|verify|allow|deny)\s*\(/gi,
      description: 'ACL method call',
      matchType: 'function_call',
    },
    {
      pattern: /\bpermissions?\s*\.\s*(?:has|check|includes)\s*\(/gi,
      description: 'Permission method call',
      matchType: 'function_call',
    },
  ];

  async analyze(context: AnalysisContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const supportedFiles = this.filterSupportedFiles(context);

    for (const file of supportedFiles) {
      const fileFindings = this.analyzeFile(file);
      findings.push(...fileFindings);
    }

    return findings;
  }

  /**
   * Analyze a single file for permission pattern changes.
   */
  private analyzeFile(file: FileChange): Finding[] {
    const findings: Finding[] = [];

    // Analyze the diff hunks for added/modified permission patterns
    for (const hunk of file.hunks) {
      const matches = this.detectPermissionPatterns(hunk.content);

      if (matches.length > 0) {
        findings.push(this.createFinding(file.path, matches, hunk));
      }
    }

    // If no hunks, analyze the new content directly
    if (file.hunks.length === 0 && file.newContent && file.oldContent) {
      const oldMatches = this.detectPermissionPatterns(file.oldContent);
      const newMatches = this.detectPermissionPatterns(file.newContent);

      // Check if permission patterns changed
      if (this.hasPermissionChanges(oldMatches, newMatches)) {
        findings.push(this.createFindingFromContent(file.path, newMatches));
      }
    }

    return findings;
  }

  /**
   * Detect permission patterns in content.
   */
  detectPermissionPatterns(content: string): PermissionMatch[] {
    const matches: PermissionMatch[] = [];
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Skip comment lines
      if (this.isCommentLine(line)) {
        continue;
      }

      for (const { pattern, description, matchType } of this.permissionPatterns) {
        // Reset regex state
        pattern.lastIndex = 0;

        while (pattern.exec(line) !== null) {
          matches.push({
            pattern: description,
            lineNumber: lineIndex + 1,
            context: line.trim(),
            matchType,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Check if a line is a comment.
   */
  private isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('#')
    );
  }

  /**
   * Check if permission patterns have changed between old and new content.
   */
  private hasPermissionChanges(
    oldMatches: PermissionMatch[],
    newMatches: PermissionMatch[],
  ): boolean {
    // Simple check: if the count or types of patterns changed
    if (oldMatches.length !== newMatches.length) {
      return true;
    }

    const oldPatterns = new Set(oldMatches.map((m) => m.pattern));
    const newPatterns = new Set(newMatches.map((m) => m.pattern));

    // Check if any patterns were added or removed
    for (const p of newPatterns) {
      if (!oldPatterns.has(p)) return true;
    }
    for (const p of oldPatterns) {
      if (!newPatterns.has(p)) return true;
    }

    return false;
  }

  /**
   * Create a finding from diff hunk matches.
   */
  private createFinding(
    filePath: string,
    matches: PermissionMatch[],
    hunk: DiffHunk,
  ): Finding {
    const uniquePatterns = [...new Set(matches.map((m) => m.pattern))];

    return {
      type: 'PERMISSION_CHANGE',
      severity: 'MEDIUM',
      title: `Permission logic modified in ${filePath.split('/').pop()}`,
      description: this.buildDescription(matches),
      filePath,
      lineStart: hunk.newStart,
      lineEnd: hunk.newStart + hunk.newLines - 1,
      codeSnippet: matches.slice(0, 3).map((m) => m.context).join('\n'),
      remediation: this.buildRemediation(uniquePatterns),
      metadata: {
        patterns: uniquePatterns,
        matchCount: matches.length,
      },
    };
  }

  /**
   * Create a finding from content analysis.
   */
  private createFindingFromContent(
    filePath: string,
    matches: PermissionMatch[],
  ): Finding {
    const uniquePatterns = [...new Set(matches.map((m) => m.pattern))];

    return {
      type: 'PERMISSION_CHANGE',
      severity: 'MEDIUM',
      title: `Permission logic modified in ${filePath.split('/').pop()}`,
      description: this.buildDescription(matches),
      filePath,
      codeSnippet: matches.slice(0, 3).map((m) => m.context).join('\n'),
      remediation: this.buildRemediation(uniquePatterns),
      metadata: {
        patterns: uniquePatterns,
        matchCount: matches.length,
      },
    };
  }

  /**
   * Build description for the finding.
   */
  private buildDescription(matches: PermissionMatch[]): string {
    const uniquePatterns = [...new Set(matches.map((m) => m.pattern))];
    const patternList = uniquePatterns.slice(0, 5).join(', ');

    return `This file contains modifications to permission/access control logic. ` +
      `Detected patterns: ${patternList}. ` +
      `Changes to authorization logic require careful review to prevent security vulnerabilities.`;
  }

  /**
   * Build remediation advice.
   */
  private buildRemediation(patterns: string[]): string {
    const advice = [
      'Review all permission changes carefully before deployment.',
      'Ensure changes do not inadvertently grant or revoke access.',
      'Consider adding tests for the modified authorization logic.',
    ];

    if (patterns.some((p) => p.includes('Admin'))) {
      advice.push('Admin-level permission changes require additional security review.');
    }

    if (patterns.some((p) => p.includes('decorator'))) {
      advice.push('Verify decorator changes apply to the correct routes/methods.');
    }

    return advice.join(' ');
  }
}
