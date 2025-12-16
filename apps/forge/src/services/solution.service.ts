/**
 * Solution Service
 *
 * Provides solution recommendations for deployment risk findings.
 * Maps risk types to mitigation strategies, code fixes, and rollback procedures.
 *
 * Requirements: 2.2
 */

import type { Finding, Severity } from '@dra/types';
import type { Solution, CodeFix } from '../types';
import { solutionKnowledgeBase } from './solution-knowledge-base';
import type { SolutionTemplate } from './solution-knowledge-base';

/**
 * Urgency level based on severity
 */
type UrgencyLevel = 'immediate' | 'high' | 'medium' | 'low';

/**
 * Maps severity levels to urgency indicators
 */
const SEVERITY_TO_URGENCY: Record<Severity, UrgencyLevel> = {
  CRITICAL: 'immediate',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * SolutionService provides solution recommendations for findings
 */
export class SolutionService {
  /**
   * Generate a complete solution for a finding
   */
  generateSolution(finding: Finding): Solution {
    const template = this.getTemplateForFinding(finding);
    const urgency = SEVERITY_TO_URGENCY[finding.severity];
    const mitigationSteps = this.generateMitigationSteps(finding);
    const codeFix = this.generateCodeFixSuggestion(finding);

    return {
      findingId: this.generateFindingId(finding),
      findingType: finding.type,
      severity: finding.severity,
      title: template.title,
      description: this.interpolateDescription(template.description, finding),
      mitigationSteps,
      codeFix: codeFix ?? undefined,
      rollbackProcedure: template.rollbackProcedure,
      documentationLinks: template.documentationLinks,
      urgency,
    };
  }

  /**
   * Generate mitigation steps for a finding
   */
  generateMitigationSteps(finding: Finding): string[] {
    const template = this.getTemplateForFinding(finding);
    const baseSteps = [...template.mitigationSteps];

    // Add context-aware steps based on file type
    const contextSteps = this.getContextAwareSteps(finding);

    return [...baseSteps, ...contextSteps];
  }

  /**
   * Generate a code fix suggestion for a finding
   * Returns null if no code fix is applicable
   */
  generateCodeFixSuggestion(finding: Finding): CodeFix | null {
    if (!finding.filePath) {
      return null;
    }

    const template = this.getTemplateForFinding(finding);
    if (!template.codeFixTemplate) {
      return null;
    }

    return {
      filePath: finding.filePath,
      description: template.codeFixTemplate.description,
      beforeCode: finding.codeSnippet,
      afterCode: this.generateFixedCode(finding, template.codeFixTemplate),
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
    };
  }

  /**
   * Get the solution template for a finding type
   */
  private getTemplateForFinding(finding: Finding): SolutionTemplate {
    const template = solutionKnowledgeBase[finding.type];
    if (!template) {
      return this.getDefaultTemplate(finding);
    }
    return template;
  }

  /**
   * Get default template for unknown finding types
   */
  private getDefaultTemplate(finding: Finding): SolutionTemplate {
    return {
      title: `Address ${finding.type} Issue`,
      description: 'Review and address this deployment risk before proceeding.',
      mitigationSteps: [
        'Review the finding details carefully',
        'Assess the impact on production systems',
        'Implement appropriate fixes',
        'Test changes thoroughly before deployment',
      ],
      documentationLinks: [],
    };
  }

  /**
   * Generate a unique ID for a finding
   */
  private generateFindingId(finding: Finding): string {
    const pathPart = finding.filePath?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'unknown';
    const linePart = finding.lineStart ?? 0;
    return `${finding.type}-${pathPart}-${linePart}`;
  }

  /**
   * Interpolate description with finding-specific details
   */
  private interpolateDescription(template: string, finding: Finding): string {
    return template
      .replace('{filePath}', finding.filePath ?? 'unknown file')
      .replace('{title}', finding.title)
      .replace('{severity}', finding.severity);
  }

  /**
   * Get context-aware mitigation steps based on file type and scope
   */
  private getContextAwareSteps(finding: Finding): string[] {
    const steps: string[] = [];
    const filePath = finding.filePath ?? '';

    // Add steps based on file extension
    if (filePath.endsWith('.sql')) {
      steps.push('Ensure database backup exists before applying migration');
      steps.push('Test migration on staging environment first');
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      steps.push('Run TypeScript compiler to verify type safety');
      steps.push('Execute unit tests for affected modules');
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      steps.push('Validate YAML syntax before deployment');
      steps.push('Review configuration changes with team');
    } else if (filePath.includes('openapi') || filePath.includes('swagger')) {
      steps.push('Update API documentation');
      steps.push('Notify API consumers of changes');
    }

    // Add steps based on severity
    if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
      steps.push('Consider implementing feature flag for gradual rollout');
      steps.push('Prepare rollback plan before deployment');
    }

    return steps;
  }

  /**
   * Generate fixed code based on template and finding
   */
  private generateFixedCode(
    finding: Finding,
    codeFixTemplate: NonNullable<SolutionTemplate['codeFixTemplate']>
  ): string {
    // If we have a specific fix pattern, use it
    if (codeFixTemplate.fixPattern) {
      return codeFixTemplate.fixPattern;
    }

    // Otherwise, provide a placeholder with guidance
    return `// TODO: ${codeFixTemplate.description}\n${finding.codeSnippet ?? '// Original code here'}`;
  }
}

// Export singleton instance
export const solutionService = new SolutionService();
