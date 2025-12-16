/**
 * Suggest Fix Action
 *
 * Rovo agent action handler for code fix suggestions.
 * Generates specific code changes to resolve findings with before/after snippets.
 *
 * Requirements: 2.2
 */

import type { FindingType, Finding } from '@dra/types';
import { solutionService } from '../../services/solution.service';
import { solutionKnowledgeBase } from '../../services/solution-knowledge-base';
import { StorageService } from '../../services/storage.service';
import type { CodeFix } from '../../types';

/**
 * Input payload for suggest fix action
 */
export interface SuggestFixInput {
  /** Finding ID from analysis result */
  findingId?: string;
  /** Analysis result ID */
  resultId?: string;
  /** Risk type for general fix suggestions */
  riskType?: FindingType;
  /** File path for context */
  filePath?: string;
  /** Code snippet to fix */
  codeSnippet?: string;
}

/**
 * Agent context provided by Rovo
 */
export interface AgentActionContext {
  accountId: string;
  conversationId?: string;
}

/**
 * Suggest fix response
 */
export interface SuggestFixResponse {
  status: 'success' | 'error' | 'not_found' | 'no_fix_available';
  fix?: DetailedCodeFix;
  testSuggestions?: string[];
  message: string;
}

/**
 * Detailed code fix with before/after and test suggestions
 */
export interface DetailedCodeFix {
  filePath: string;
  description: string;
  beforeCode?: string;
  afterCode: string;
  lineStart?: number;
  lineEnd?: number;
  explanation: string;
  additionalChanges?: Array<{
    filePath: string;
    description: string;
    code: string;
  }>;
}

const storageService = new StorageService();

/**
 * Suggest fix action handler
 *
 * Generates specific code changes to resolve identified findings,
 * including before/after code snippets and test suggestions.
 *
 * Requirements: 2.2 - Provide mitigation suggestions including code fixes
 */
export const suggestFixAction = async (args: {
  payload: SuggestFixInput;
  context: AgentActionContext;
}): Promise<SuggestFixResponse> => {
  const { payload } = args;

  if (!payload.findingId && !payload.riskType) {
    return {
      status: 'error',
      message: 'Please provide either a findingId with resultId, or a riskType to get fix suggestions.',
    };
  }

  try {
    // If finding ID provided, get fix for specific finding
    if (payload.findingId && payload.resultId) {
      return await suggestFixForFinding(payload.resultId, payload.findingId);
    }

    // If risk type provided, get general fix template
    if (payload.riskType) {
      return suggestFixForRiskType(payload.riskType, payload.filePath, payload.codeSnippet);
    }

    return {
      status: 'error',
      message: 'Invalid input. Provide findingId with resultId, or riskType.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to suggest fix: ${errorMessage}`,
    };
  }
};

/**
 * Suggest fix for a specific finding
 */
async function suggestFixForFinding(
  resultId: string,
  findingId: string
): Promise<SuggestFixResponse> {
  const result = await storageService.getCachedResult(resultId);

  if (!result) {
    return {
      status: 'not_found',
      message: `Analysis result ${resultId} not found or has expired.`,
    };
  }

  const finding = result.findings.find(
    (f) =>
      `${f.type}-${f.filePath?.replace(/[^a-zA-Z0-9]/g, '-')}-${f.lineStart ?? 0}` === findingId ||
      `${f.type}-${f.lineStart ?? 0}` === findingId
  );

  if (!finding) {
    return {
      status: 'not_found',
      message: `Finding ${findingId} not found in analysis result.`,
    };
  }

  // Generate solution with code fix
  const solution = solutionService.generateSolution(finding);

  if (!solution.codeFix) {
    // Generate a generic fix suggestion based on finding type
    const genericFix = generateGenericFix(finding);
    if (genericFix) {
      return {
        status: 'success',
        fix: genericFix,
        testSuggestions: generateTestSuggestions(finding),
        message: buildFixMessage(genericFix, finding),
      };
    }

    return {
      status: 'no_fix_available',
      testSuggestions: generateTestSuggestions(finding),
      message: `No automatic code fix available for this ${finding.type} finding. ${getManualFixGuidance(finding.type as FindingType)}`,
    };
  }

  const detailedFix: DetailedCodeFix = {
    filePath: solution.codeFix.filePath,
    description: solution.codeFix.description,
    beforeCode: solution.codeFix.beforeCode,
    afterCode: solution.codeFix.afterCode,
    lineStart: solution.codeFix.lineStart,
    lineEnd: solution.codeFix.lineEnd,
    explanation: buildFixExplanation(finding, solution.codeFix),
    additionalChanges: getAdditionalChanges(finding),
  };

  return {
    status: 'success',
    fix: detailedFix,
    testSuggestions: generateTestSuggestions(finding),
    message: buildFixMessage(detailedFix, finding),
  };
}

/**
 * Suggest fix for a risk type (general template)
 */
function suggestFixForRiskType(
  riskType: FindingType,
  filePath?: string,
  codeSnippet?: string
): SuggestFixResponse {
  const template = solutionKnowledgeBase[riskType];

  if (!template || !template.codeFixTemplate) {
    return {
      status: 'no_fix_available',
      message: `No code fix template available for ${riskType}. ${getManualFixGuidance(riskType)}`,
    };
  }

  const detailedFix: DetailedCodeFix = {
    filePath: filePath ?? 'example.ts',
    description: template.codeFixTemplate.description,
    beforeCode: codeSnippet,
    afterCode: template.codeFixTemplate.fixPattern ?? '',
    explanation: `This fix addresses ${riskType} issues by following best practices.`,
  };

  const testSuggestions = generateTestSuggestionsForType(riskType);

  return {
    status: 'success',
    fix: detailedFix,
    testSuggestions,
    message: buildGenericFixMessage(detailedFix, riskType),
  };
}

/**
 * Generate a generic fix based on finding type
 */
function generateGenericFix(finding: Finding): DetailedCodeFix | null {
  const fixes: Record<string, () => DetailedCodeFix> = {
    BREAKING_API: () => ({
      filePath: finding.filePath ?? 'api.ts',
      description: 'Add API versioning to maintain backward compatibility',
      beforeCode: finding.codeSnippet,
      afterCode: `// Versioned API approach:
// 1. Keep existing endpoint at /api/v1/...
// 2. Add new version at /api/v2/...
// 3. Add deprecation header to v1

// Example:
app.get('/api/v1/resource', legacyHandler);  // Deprecated
app.get('/api/v2/resource', newHandler);     // New version

// Add deprecation header middleware:
const deprecationMiddleware = (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2025 00:00:00 GMT');
  next();
};`,
      explanation: 'Implement API versioning to support both old and new consumers during transition.',
    }),
    DESTRUCTIVE_MIGRATION: () => ({
      filePath: finding.filePath ?? 'migration.sql',
      description: 'Add safety checks and backup before destructive operation',
      beforeCode: finding.codeSnippet,
      afterCode: `-- Safe migration pattern:

-- 1. Create backup table first
CREATE TABLE IF NOT EXISTS backup_table_name AS SELECT * FROM table_name;

-- 2. Verify backup has data
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM backup_table_name) = 0 THEN
    RAISE EXCEPTION 'Backup table is empty, aborting migration';
  END IF;
END $$;

-- 3. Perform the migration with IF EXISTS
-- DROP TABLE IF EXISTS table_name;
-- or
-- ALTER TABLE table_name DROP COLUMN IF EXISTS column_name;

-- 4. Rollback script (save separately):
-- DROP TABLE IF EXISTS table_name;
-- ALTER TABLE backup_table_name RENAME TO table_name;`,
      explanation: 'Always create backups and use IF EXISTS clauses for destructive operations.',
    }),
    PERMISSION_CHANGE: () => ({
      filePath: finding.filePath ?? 'permissions.ts',
      description: 'Add audit logging for permission changes',
      beforeCode: finding.codeSnippet,
      afterCode: `// Add permission change audit logging:

async function updatePermissions(userId: string, newPermissions: Permission[]) {
  const oldPermissions = await getPermissions(userId);
  
  // Log the change for audit trail
  await auditLog.record({
    action: 'PERMISSION_CHANGE',
    userId,
    performedBy: getCurrentUser(),
    timestamp: new Date(),
    changes: {
      before: oldPermissions,
      after: newPermissions,
    },
  });
  
  // Apply the change
  await applyPermissions(userId, newPermissions);
  
  // Notify security team for review
  if (isElevatedPermission(newPermissions)) {
    await notifySecurityTeam(userId, newPermissions);
  }
}`,
      explanation: 'Add audit logging and security notifications for permission changes.',
    }),
    LOW_COVERAGE: () => ({
      filePath: finding.filePath?.replace(/\.(ts|js)$/, '.test.$1') ?? 'module.test.ts',
      description: 'Add test file for uncovered code',
      afterCode: `import { describe, it, expect } from 'vitest';
// or: import { describe, it, expect } from '@jest/globals';

describe('ModuleName', () => {
  describe('primaryFunction', () => {
    it('should handle the primary use case', () => {
      // Arrange
      const input = { /* test data */ };
      
      // Act
      const result = primaryFunction(input);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
    });

    it('should handle edge cases', () => {
      // Test boundary conditions
      expect(() => primaryFunction(null)).toThrow();
      expect(primaryFunction({})).toEqual({ default: true });
    });

    it('should handle errors gracefully', () => {
      // Test error scenarios
      const invalidInput = { invalid: true };
      expect(() => primaryFunction(invalidInput)).toThrow('Invalid input');
    });
  });
});`,
      explanation: 'Create comprehensive tests covering primary use cases, edge cases, and error handling.',
    }),
    UNDOCUMENTED_API: () => ({
      filePath: finding.filePath ?? 'api.ts',
      description: 'Add OpenAPI documentation',
      beforeCode: finding.codeSnippet,
      afterCode: `/**
 * @openapi
 * /api/resource/{id}:
 *   get:
 *     summary: Get resource by ID
 *     description: Retrieves a specific resource by its unique identifier
 *     tags:
 *       - Resources
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Unique resource identifier
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Resource found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Resource'
 *       404:
 *         description: Resource not found
 *       401:
 *         description: Unauthorized - authentication required
 */
app.get('/api/resource/:id', authenticate, getResourceHandler);`,
      explanation: 'Add OpenAPI/Swagger documentation with request/response schemas.',
    }),
  };

  const fixGenerator = fixes[finding.type];
  return fixGenerator ? fixGenerator() : null;
}

/**
 * Get additional changes that might be needed
 */
function getAdditionalChanges(
  finding: Finding
): Array<{ filePath: string; description: string; code: string }> | undefined {
  const changes: Array<{ filePath: string; description: string; code: string }> = [];

  if (finding.type === 'BREAKING_API') {
    changes.push({
      filePath: 'CHANGELOG.md',
      description: 'Document the API change',
      code: `## [Unreleased]

### Breaking Changes
- Changed \`/api/resource\` endpoint - see migration guide

### Migration Guide
1. Update API calls to use \`/api/v2/resource\`
2. Update response handling for new schema
3. Remove deprecated field usage by [date]`,
    });
  }

  if (finding.type === 'DESTRUCTIVE_MIGRATION') {
    changes.push({
      filePath: 'migrations/rollback.sql',
      description: 'Create rollback script',
      code: `-- Rollback script for migration
-- Run this to undo the migration if issues occur

-- Restore from backup
-- ALTER TABLE backup_table RENAME TO original_table;`,
    });
  }

  return changes.length > 0 ? changes : undefined;
}

/**
 * Generate test suggestions for a finding
 */
function generateTestSuggestions(finding: Finding): string[] {
  const suggestions: string[] = [];

  suggestions.push(`Write a test to verify the fix resolves the ${finding.type} issue`);

  if (finding.type === 'BREAKING_API') {
    suggestions.push('Add contract tests to verify API backward compatibility');
    suggestions.push('Test that both v1 and v2 endpoints work correctly');
  } else if (finding.type === 'DESTRUCTIVE_MIGRATION') {
    suggestions.push('Test migration on a copy of production data');
    suggestions.push('Verify rollback script works correctly');
    suggestions.push('Test data integrity after migration');
  } else if (finding.type === 'PERMISSION_CHANGE') {
    suggestions.push('Test that authorized users can access the resource');
    suggestions.push('Test that unauthorized users are denied access');
    suggestions.push('Verify audit logs are created correctly');
  } else if (finding.type === 'LOW_COVERAGE') {
    suggestions.push('Aim for at least 80% code coverage');
    suggestions.push('Include tests for error handling paths');
    suggestions.push('Add integration tests for critical flows');
  } else if (finding.type === 'UNDOCUMENTED_API') {
    suggestions.push('Validate OpenAPI spec with a linter');
    suggestions.push('Generate and review API documentation');
    suggestions.push('Test documented examples work correctly');
  }

  return suggestions;
}

/**
 * Generate test suggestions for a risk type
 */
function generateTestSuggestionsForType(riskType: FindingType): string[] {
  return generateTestSuggestions({ type: riskType } as Finding);
}

/**
 * Get manual fix guidance when no automatic fix is available
 */
function getManualFixGuidance(riskType: FindingType): string {
  const guidance: Record<string, string> = {
    BREAKING_API: 'Consider implementing API versioning and adding deprecation notices.',
    DESTRUCTIVE_MIGRATION: 'Create a backup before the migration and prepare a rollback script.',
    PERMISSION_CHANGE: 'Review the permission change against security policies and add audit logging.',
    LOW_COVERAGE: 'Add unit tests for the uncovered code paths.',
    UNDOCUMENTED_API: 'Add OpenAPI/Swagger documentation for the endpoint.',
  };

  return guidance[riskType] ?? 'Review the finding and apply appropriate fixes manually.';
}

/**
 * Build explanation for a code fix
 */
function buildFixExplanation(finding: Finding, codeFix: CodeFix): string {
  return `This fix addresses the ${finding.type} issue in ${codeFix.filePath}. ${codeFix.description}`;
}

/**
 * Build message for a specific fix
 */
function buildFixMessage(fix: DetailedCodeFix, finding: Finding): string {
  const parts: string[] = [];

  parts.push(`## Suggested Fix for ${finding.type}`);
  parts.push('');
  parts.push(`**File:** \`${fix.filePath}\``);
  parts.push('');
  parts.push(`**Description:** ${fix.description}`);
  parts.push('');

  if (fix.beforeCode) {
    parts.push('### Before');
    parts.push('```');
    parts.push(fix.beforeCode);
    parts.push('```');
    parts.push('');
  }

  parts.push('### After');
  parts.push('```');
  parts.push(fix.afterCode);
  parts.push('```');
  parts.push('');

  parts.push('### Explanation');
  parts.push(fix.explanation);

  if (fix.additionalChanges && fix.additionalChanges.length > 0) {
    parts.push('');
    parts.push('### Additional Changes Needed');
    for (const change of fix.additionalChanges) {
      parts.push(`- **${change.filePath}**: ${change.description}`);
    }
  }

  return parts.join('\n');
}

/**
 * Build message for a generic fix
 */
function buildGenericFixMessage(fix: DetailedCodeFix, riskType: FindingType): string {
  const parts: string[] = [];

  parts.push(`## Fix Template for ${riskType}`);
  parts.push('');
  parts.push(`**Description:** ${fix.description}`);
  parts.push('');
  parts.push('### Suggested Code');
  parts.push('```');
  parts.push(fix.afterCode);
  parts.push('```');
  parts.push('');
  parts.push('Adapt this template to your specific situation.');

  return parts.join('\n');
}
