/**
 * Solution Knowledge Base
 *
 * Contains best practices, mitigation strategies, and solution templates
 * for each finding type. This knowledge base powers the SolutionService.
 */

import type { FindingType } from '@dra/types';

/**
 * Template for generating solutions
 */
export interface SolutionTemplate {
  title: string;
  description: string;
  mitigationSteps: string[];
  rollbackProcedure?: string;
  documentationLinks?: string[];
  codeFixTemplate?: {
    description: string;
    fixPattern?: string;
  };
}

/**
 * Knowledge base mapping finding types to solution templates
 */
export const solutionKnowledgeBase: Record<FindingType, SolutionTemplate> = {
  /**
   * Breaking API Change Solutions
   */
  BREAKING_API: {
    title: 'Address Breaking API Change',
    description:
      'A breaking API change has been detected in {filePath}. This change may affect downstream consumers and requires careful migration planning.',
    mitigationSteps: [
      'Identify all consumers of the affected API endpoint',
      'Create a deprecation notice for the old API version',
      'Implement API versioning (e.g., /v1/, /v2/) to support both versions',
      'Update API documentation with migration guide',
      'Communicate changes to API consumers with timeline',
      'Set deprecation deadline and monitor usage of old version',
      'Remove deprecated version only after migration period',
    ],
    rollbackProcedure: `
1. Revert the API changes to restore previous contract
2. Deploy the reverted version immediately
3. Notify affected consumers that rollback occurred
4. Investigate root cause and plan proper migration
5. Re-implement with proper versioning strategy
    `.trim(),
    documentationLinks: [
      'https://semver.org/',
      'https://www.atlassian.com/blog/technology/api-versioning',
    ],
    codeFixTemplate: {
      description: 'Add API versioning to maintain backward compatibility',
      fixPattern: `// Consider implementing API versioning:
// - Keep the old endpoint at /api/v1/resource
// - Add new endpoint at /api/v2/resource
// - Add deprecation header to v1 responses`,
    },
  },

  /**
   * Destructive Migration Solutions
   */
  DESTRUCTIVE_MIGRATION: {
    title: 'Handle Destructive Database Migration',
    description:
      'A potentially destructive database migration has been detected. This operation may cause data loss or extended downtime.',
    mitigationSteps: [
      'Create a complete database backup before migration',
      'Test migration on a copy of production data',
      'Estimate migration duration and plan maintenance window',
      'Prepare rollback migration script',
      'Notify stakeholders of planned downtime',
      'Execute migration during low-traffic period',
      'Verify data integrity after migration completes',
      'Keep backup for at least 7 days post-migration',
    ],
    rollbackProcedure: `
1. Stop the application to prevent further data changes
2. Execute the rollback migration script
3. Restore from backup if rollback script fails
4. Verify data integrity after restoration
5. Restart application and monitor for issues
6. Document lessons learned for future migrations
    `.trim(),
    documentationLinks: [
      'https://www.postgresql.org/docs/current/backup.html',
      'https://dev.mysql.com/doc/refman/8.0/en/backup-and-recovery.html',
    ],
    codeFixTemplate: {
      description: 'Add safety checks and reversibility to migration',
      fixPattern: `-- Add safety checks before destructive operations:
-- 1. Verify row count before DELETE/DROP
-- 2. Create backup table before modification
-- 3. Add IF EXISTS clauses
-- 4. Include rollback statements in comments`,
    },
  },

  /**
   * Permission Change Solutions
   */
  PERMISSION_CHANGE: {
    title: 'Review Permission Change',
    description:
      'A permission or access control change has been detected. This may affect user access and security posture.',
    mitigationSteps: [
      'Document the permission change and its justification',
      'Review against principle of least privilege',
      'Identify all users/roles affected by the change',
      'Verify change aligns with security policies',
      'Test permission changes in staging environment',
      'Update access control documentation',
      'Notify security team for audit trail',
      'Monitor access logs after deployment',
    ],
    rollbackProcedure: `
1. Identify the specific permission changes made
2. Revert permission configuration to previous state
3. Clear any cached permissions/sessions
4. Verify users have correct access restored
5. Document the rollback in security audit log
6. Review why original change was problematic
    `.trim(),
    documentationLinks: [
      'https://owasp.org/www-project-web-security-testing-guide/',
      'https://cheatsheetseries.owasp.org/cheatsheets/Access_Control_Cheat_Sheet.html',
    ],
    codeFixTemplate: {
      description: 'Add permission validation and audit logging',
      fixPattern: `// Add permission audit logging:
// logger.audit('permission_change', {
//   user: currentUser,
//   action: 'modify_permissions',
//   target: resourceId,
//   oldPermissions: previous,
//   newPermissions: updated
// });`,
    },
  },

  /**
   * Low Coverage Solutions
   */
  LOW_COVERAGE: {
    title: 'Improve Test Coverage',
    description:
      'Test coverage for {filePath} is below the required threshold. Insufficient coverage increases deployment risk.',
    mitigationSteps: [
      'Identify untested code paths and critical functions',
      'Write unit tests for core business logic',
      'Add integration tests for API endpoints',
      'Implement edge case testing for error handling',
      'Set up coverage reporting in CI pipeline',
      'Consider property-based testing for complex logic',
      'Review and update existing tests for relevance',
    ],
    rollbackProcedure: `
1. Coverage issues don't typically require rollback
2. If deployment proceeds, monitor error rates closely
3. Prioritize adding tests in next sprint
4. Consider feature flag to disable risky code paths
    `.trim(),
    documentationLinks: [
      'https://jestjs.io/docs/getting-started',
      'https://testing-library.com/docs/',
    ],
    codeFixTemplate: {
      description: 'Add test file for uncovered code',
      fixPattern: `// Create test file: {filePath}.test.ts
describe('ModuleName', () => {
  it('should handle the primary use case', () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle edge cases', () => {
    // Test boundary conditions
  });

  it('should handle errors gracefully', () => {
    // Test error scenarios
  });
});`,
    },
  },

  /**
   * Undocumented API Solutions
   */
  UNDOCUMENTED_API: {
    title: 'Document API Endpoint',
    description:
      'An API endpoint lacks proper documentation. Undocumented APIs create integration challenges and maintenance burden.',
    mitigationSteps: [
      'Add OpenAPI/Swagger documentation for the endpoint',
      'Document request/response schemas with examples',
      'Include authentication requirements',
      'Document error responses and status codes',
      'Add usage examples and common scenarios',
      'Generate and publish API reference documentation',
      'Set up documentation linting in CI pipeline',
    ],
    rollbackProcedure: `
1. Documentation issues don't require rollback
2. Prioritize documentation before next release
3. Consider blocking deployment if API is public-facing
4. Add documentation task to sprint backlog
    `.trim(),
    documentationLinks: [
      'https://swagger.io/specification/',
      'https://stoplight.io/api-documentation-guide',
    ],
    codeFixTemplate: {
      description: 'Add OpenAPI documentation decorator',
      fixPattern: `/**
 * @openapi
 * /api/resource:
 *   get:
 *     summary: Brief description of endpoint
 *     description: Detailed description of what this endpoint does
 *     tags:
 *       - ResourceName
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *       404:
 *         description: Resource not found
 */`,
    },
  },
};

/**
 * Get all available finding types
 */
export function getAvailableFindingTypes(): FindingType[] {
  return Object.keys(solutionKnowledgeBase) as FindingType[];
}

/**
 * Check if a finding type has a solution template
 */
export function hasSolutionTemplate(findingType: FindingType): boolean {
  return findingType in solutionKnowledgeBase;
}
