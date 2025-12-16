/**
 * Solution Detail Modal Component
 *
 * Displays detailed solution information for a finding including:
 * - Step-by-step mitigation instructions
 * - Code fix suggestions with syntax highlighting
 * - Rollback procedures where applicable
 *
 * Requirements: 2.2
 */

import ForgeUI, {
  Fragment,
  Text,
  ModalDialog,
  SectionMessage,
  Strong,
  Em,
  Code,
  Tag,
  TagGroup,
  Button,
  ButtonSet,
} from '@forge/ui';

/**
 * Code fix suggestion structure
 */
interface CodeFix {
  filePath: string;
  description: string;
  beforeCode?: string;
  afterCode: string;
  lineStart?: number;
  lineEnd?: number;
}

/**
 * Solution structure from the solution service
 */
interface Solution {
  findingId: string;
  findingType: string;
  severity: string;
  title: string;
  description: string;
  mitigationSteps: string[];
  codeFix?: CodeFix;
  rollbackProcedure?: string;
  documentationLinks?: string[];
  urgency: 'immediate' | 'high' | 'medium' | 'low';
}

/**
 * Finding with solution information
 */
interface FindingWithSolution {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string;
  solution?: Solution;
}

/**
 * Props for the SolutionDetailModal component
 */
interface SolutionDetailModalProps {
  finding: FindingWithSolution;
  onClose: () => void;
  onApplyFix?: (finding: FindingWithSolution) => void;
  onCreateIssue?: (finding: FindingWithSolution) => void;
}

/**
 * Urgency color mapping
 */
const URGENCY_COLORS: Record<string, 'red' | 'yellow' | 'blue' | 'green'> = {
  immediate: 'red',
  high: 'red',
  medium: 'yellow',
  low: 'green',
};

/**
 * Severity color mapping
 */
const SEVERITY_COLORS: Record<string, 'red' | 'yellow' | 'blue' | 'green'> = {
  CRITICAL: 'red',
  HIGH: 'red',
  MEDIUM: 'yellow',
  LOW: 'green',
};

/**
 * Get location string for a finding
 */
function getLocationString(finding: FindingWithSolution): string {
  if (!finding.filePath) return '';
  let location = finding.filePath;
  if (finding.lineStart) {
    location += `:${finding.lineStart}`;
    if (finding.lineEnd && finding.lineEnd !== finding.lineStart) {
      location += `-${finding.lineEnd}`;
    }
  }
  return location;
}

/**
 * Get line info string for code fix
 */
function getLineInfoString(codeFix: CodeFix): string {
  if (!codeFix.lineStart) return '';
  let info = ` (line ${codeFix.lineStart}`;
  if (codeFix.lineEnd && codeFix.lineEnd !== codeFix.lineStart) {
    info += `-${codeFix.lineEnd}`;
  }
  info += ')';
  return info;
}

/**
 * Finding Details Section
 * Displays basic information about the finding
 */
const FindingDetailsSection = ({ finding }: { finding: FindingWithSolution }) => {
  const location = getLocationString(finding);

  return (
    <SectionMessage title="Finding Details" appearance="info">
      <Text>
        <Strong>Type:</Strong> {finding.type.replace(/_/g, ' ')}
      </Text>
      <TagGroup>
        <Tag text={`Severity: ${finding.severity}`} color={SEVERITY_COLORS[finding.severity] || 'blue'} />
      </TagGroup>
      <Text>
        <Strong>Location:</Strong> {location || 'Not specified'}
      </Text>
      <Text>
        <Strong>Description:</Strong> {finding.description}
      </Text>
    </SectionMessage>
  );
};

/**
 * Mitigation Steps Section
 * Displays step-by-step instructions for resolving the finding
 * Requirement 2.2: Provide mitigation suggestions
 */
const MitigationStepsSection = ({ steps }: { steps: string[] }) => {
  return (
    <SectionMessage title="Mitigation Steps" appearance="change">
      {steps.map((step, index) => (
        <Text key={index}>
          <Strong>{index + 1}.</Strong> {step}
        </Text>
      ))}
    </SectionMessage>
  );
};

/**
 * Code Fix Section
 * Displays before/after code snippets for the suggested fix
 * Requirement 2.2: Provide code fix suggestions
 */
const CodeFixSection = ({ codeFix }: { codeFix: CodeFix }) => {
  const lineInfo = getLineInfoString(codeFix);

  return (
    <Fragment>
      <Text>
        <Strong>Suggested Code Fix</Strong>
      </Text>
      <Text>
        <Em>{codeFix.description}</Em>
      </Text>
      <Text>
        <Strong>File:</Strong> {codeFix.filePath}
        {lineInfo}
      </Text>
      <Text>
        <Strong>Before:</Strong>
      </Text>
      <Code text={codeFix.beforeCode || '// No before code available'} language="typescript" />
      <Text>
        <Strong>After:</Strong>
      </Text>
      <Code text={codeFix.afterCode} language="typescript" />
    </Fragment>
  );
};

/**
 * Rollback Procedure Section
 * Displays rollback instructions for critical changes
 * Requirement 2.2: Include rollback procedures where applicable
 */
const RollbackSection = ({ procedure }: { procedure: string }) => {
  return (
    <SectionMessage title="Rollback Procedure" appearance="warning">
      <Text>{procedure}</Text>
    </SectionMessage>
  );
};

/**
 * Documentation Links Section
 * Displays links to relevant documentation
 */
const DocumentationSection = ({ links }: { links: string[] }) => {
  return (
    <Fragment>
      <Text>
        <Strong>Related Documentation:</Strong>
      </Text>
      {links.map((link, index) => (
        <Text key={index}>
          <Em>{link}</Em>
        </Text>
      ))}
    </Fragment>
  );
};

/**
 * Solution Content Component
 * Renders the solution details when a solution exists
 */
const SolutionContent = ({ solution }: { solution: Solution }) => {
  const hasMitigationSteps = solution.mitigationSteps.length > 0;
  const hasCodeFix = Boolean(solution.codeFix);
  const hasRollback = Boolean(solution.rollbackProcedure);
  const hasDocLinks = solution.documentationLinks && solution.documentationLinks.length > 0;

  return (
    <Fragment>
      <Text>
        <Strong>Recommended Solution: {solution.title}</Strong>
      </Text>
      <TagGroup>
        <Tag text={`Urgency: ${solution.urgency}`} color={URGENCY_COLORS[solution.urgency] || 'blue'} />
      </TagGroup>
      <Text>{solution.description}</Text>

      {/* Mitigation Steps */}
      {hasMitigationSteps ? (
        <MitigationStepsSection steps={solution.mitigationSteps} />
      ) : (
        <Text>
          <Em>No specific mitigation steps available.</Em>
        </Text>
      )}

      {/* Code Fix Suggestion */}
      {hasCodeFix ? <CodeFixSection codeFix={solution.codeFix!} /> : <Text> </Text>}

      {/* Rollback Procedure */}
      {hasRollback ? <RollbackSection procedure={solution.rollbackProcedure!} /> : <Text> </Text>}

      {/* Documentation Links */}
      {hasDocLinks ? <DocumentationSection links={solution.documentationLinks!} /> : <Text> </Text>}
    </Fragment>
  );
};

/**
 * No Solution Content Component
 * Renders when no solution is available
 */
const NoSolutionContent = () => {
  return (
    <SectionMessage title="No Solution Available" appearance="info">
      <Text>No automated solution is available for this finding. Please review manually.</Text>
    </SectionMessage>
  );
};

/**
 * Action Buttons Component
 * Renders the action buttons for the modal
 */
const ActionButtons = ({
  finding,
  solution,
  onApplyFix,
  onCreateIssue,
  onClose,
}: {
  finding: FindingWithSolution;
  solution?: Solution;
  onApplyFix?: (finding: FindingWithSolution) => void;
  onCreateIssue?: (finding: FindingWithSolution) => void;
  onClose: () => void;
}) => {
  const showApplyFix = solution?.codeFix && onApplyFix;
  const showCreateIssue = onCreateIssue;

  return (
    <ButtonSet>
      {showApplyFix && <Button text="Apply Fix" onClick={() => onApplyFix(finding)} appearance="primary" />}
      {showCreateIssue && <Button text="Create Jira Issue" onClick={() => onCreateIssue(finding)} />}
      <Button text="Close" onClick={onClose} />
    </ButtonSet>
  );
};

/**
 * Solution Detail Modal Component
 *
 * Comprehensive modal for displaying solution details including:
 * - Finding information
 * - Step-by-step mitigation instructions
 * - Code fix suggestions with before/after snippets
 * - Rollback procedures for critical changes
 * - Links to documentation
 *
 * Requirements: 2.2
 */
const SolutionDetailModal = ({ finding, onClose, onApplyFix, onCreateIssue }: SolutionDetailModalProps) => {
  const solution = finding.solution;

  return (
    <ModalDialog header={`Solution: ${finding.title}`} onClose={onClose} width="large">
      <Fragment>
        {/* Finding Details */}
        <FindingDetailsSection finding={finding} />

        {/* Solution Content or No Solution Message */}
        {solution ? <SolutionContent solution={solution} /> : <NoSolutionContent />}

        {/* Action Buttons */}
        <ActionButtons
          finding={finding}
          solution={solution}
          onApplyFix={onApplyFix}
          onCreateIssue={onCreateIssue}
          onClose={onClose}
        />
      </Fragment>
    </ModalDialog>
  );
};

export default SolutionDetailModal;
