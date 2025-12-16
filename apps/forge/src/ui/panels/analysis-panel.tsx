/**
 * Analysis Panel UI Component
 *
 * Displays deployment risk analysis results in Jira issue panel.
 * Shows findings grouped by severity with solution recommendations.
 *
 * Requirements: 1.1, 1.3
 */

import ForgeUI, {
  render,
  Fragment,
  Text,
  IssuePanel,
  useState,
  useEffect,
  Button,
  ButtonSet,
  SectionMessage,
  Table,
  Head,
  Row,
  Cell,
  Tag,
  TagGroup,
  Strong,
  Em,
  ModalDialog,
  Form,
  TextField,
} from '@forge/ui';

// Forge bridge invoke function type
declare function invoke(functionKey: string, payload?: unknown): Promise<unknown>;

/**
 * Severity levels for display ordering
 */
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

/**
 * Severity color mapping for tags
 */
const SEVERITY_COLORS: Record<string, 'red' | 'yellow' | 'blue' | 'green'> = {
  CRITICAL: 'red',
  HIGH: 'red',
  MEDIUM: 'yellow',
  LOW: 'green',
};

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
  solution?: {
    title: string;
    mitigationSteps: string[];
    urgency: string;
  };
}

/**
 * Analysis response from resolver
 */
interface AnalysisResponse {
  status: 'success' | 'error' | 'no_repository';
  message?: string;
  result?: {
    id: string;
    timestamp: string;
    riskScore: number;
    maxSeverity: string | null;
    summary: {
      totalFindings: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
    };
    findingsBySeverity: Record<string, FindingWithSolution[]>;
    solutions: Array<{
      findingId: string;
      title: string;
      description: string;
      urgency: string;
      mitigationSteps: string[];
    }>;
  };
}

/**
 * Risk Score Display Component
 */
const RiskScoreDisplay = ({ score, maxSeverity }: { score: number; maxSeverity: string | null }) => {
  const getRiskLevel = (s: number): string => {
    if (s >= 80) return 'Critical Risk';
    if (s >= 60) return 'High Risk';
    if (s >= 40) return 'Medium Risk';
    if (s >= 20) return 'Low Risk';
    return 'Minimal Risk';
  };

  return (
    <Fragment>
      <Text>
        <Strong>Risk Score: {score}/100</Strong> - {getRiskLevel(score)}
      </Text>
      {maxSeverity ? (
        <TagGroup>
          <Tag text={`Highest: ${maxSeverity}`} color={SEVERITY_COLORS[maxSeverity] || 'blue'} />
        </TagGroup>
      ) : (
        <Text> </Text>
      )}
    </Fragment>
  );
};

/**
 * Summary Statistics Component
 */
const SummaryStats = ({
  summary,
}: {
  summary: { totalFindings: number; bySeverity: Record<string, number>; byType: Record<string, number> };
}) => {
  return (
    <Fragment>
      <Text>
        <Strong>Total Findings:</Strong> {summary.totalFindings}
      </Text>
      <TagGroup>
        {SEVERITY_ORDER.map((severity) => {
          const count = summary.bySeverity[severity] || 0;
          if (count === 0) return null;
          return <Tag key={severity} text={`${severity}: ${count}`} color={SEVERITY_COLORS[severity]} />;
        })}
      </TagGroup>
    </Fragment>
  );
};

/**
 * Finding Row Component
 */
/**
 * Get location string for a finding
 */
function getLocationString(finding: FindingWithSolution): string {
  if (!finding.filePath) return '';
  let location = finding.filePath;
  if (finding.lineStart) {
    location += `:${finding.lineStart}`;
  }
  return location;
}

const FindingRow = ({
  finding,
  onViewDetails,
}: {
  finding: FindingWithSolution;
  onViewDetails: (finding: FindingWithSolution) => void;
}) => {
  const location = getLocationString(finding);

  return (
    <Row>
      <Cell>
        <Tag text={finding.severity} color={SEVERITY_COLORS[finding.severity] || 'blue'} />
      </Cell>
      <Cell>
        <Text>{finding.title}</Text>
        <Text>
          <Em>{location || 'No location'}</Em>
        </Text>
      </Cell>
      <Cell>
        <Text>{finding.type.replace(/_/g, ' ')}</Text>
      </Cell>
      <Cell>
        <ButtonSet>
          <Button text="View Details" onClick={() => onViewDetails(finding)} />
        </ButtonSet>
      </Cell>
    </Row>
  );
};

/**
 * Findings Table Component - Groups findings by severity
 * Requirement 1.3: Display findings grouped by severity level
 */
const FindingsTable = ({
  findingsBySeverity,
  onViewDetails,
}: {
  findingsBySeverity: Record<string, FindingWithSolution[]>;
  onViewDetails: (finding: FindingWithSolution) => void;
}) => {
  const allFindings: FindingWithSolution[] = [];

  // Collect findings in severity order
  for (const severity of SEVERITY_ORDER) {
    const findings = findingsBySeverity[severity] || [];
    allFindings.push(...findings);
  }

  if (allFindings.length === 0) {
    return (
      <SectionMessage title="No Findings" appearance="confirmation">
        <Text>No deployment risks detected. Your code looks safe to deploy!</Text>
      </SectionMessage>
    );
  }

  return (
    <Table>
      <Head>
        <Cell>
          <Text>Severity</Text>
        </Cell>
        <Cell>
          <Text>Finding</Text>
        </Cell>
        <Cell>
          <Text>Type</Text>
        </Cell>
        <Cell>
          <Text>Actions</Text>
        </Cell>
      </Head>
      {allFindings.map((finding) => (
        <FindingRow key={finding.id} finding={finding} onViewDetails={onViewDetails} />
      ))}
    </Table>
  );
};

/**
 * Solution Detail Modal Component
 * Displays detailed solution information for a finding
 * Requirement 2.2: Provide mitigation suggestions
 */
/**
 * Get full location string for modal display
 */
function getFullLocationString(finding: FindingWithSolution): string {
  if (!finding.filePath) return 'Not specified';
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
 * Solution Content Component for modal
 */
const SolutionContent = ({ solution }: { solution: { title: string; mitigationSteps: string[]; urgency: string } }) => {
  const urgencyColor =
    solution.urgency === 'immediate' || solution.urgency === 'high'
      ? 'red'
      : solution.urgency === 'medium'
        ? 'yellow'
        : 'green';

  return (
    <Fragment>
      <Text>
        <Strong>Recommended Solution: {solution.title}</Strong>
      </Text>
      <TagGroup>
        <Tag text={`Urgency: ${solution.urgency}`} color={urgencyColor} />
      </TagGroup>

      {/* Mitigation Steps - Requirement 2.2 */}
      <SectionMessage title="Mitigation Steps" appearance="change">
        {solution.mitigationSteps.map((step, index) => (
          <Text key={index}>
            <Strong>{index + 1}.</Strong> {step}
          </Text>
        ))}
      </SectionMessage>
    </Fragment>
  );
};

/**
 * No Solution Content Component
 */
const NoSolutionContent = () => {
  return (
    <SectionMessage title="No Solution Available" appearance="info">
      <Text>No automated solution is available for this finding. Please review manually.</Text>
    </SectionMessage>
  );
};

const SolutionDetailModal = ({
  finding,
  onClose,
  onCreateIssue,
}: {
  finding: FindingWithSolution;
  onClose: () => void;
  onCreateIssue?: (finding: FindingWithSolution) => void;
}) => {
  const location = getFullLocationString(finding);
  const hasSolution = Boolean(finding.solution);
  const hasCreateIssue = Boolean(onCreateIssue);

  return (
    <ModalDialog header={`Solution: ${finding.title}`} onClose={onClose} width="large">
      <Fragment>
        {/* Finding Details Section */}
        <SectionMessage title="Finding Details" appearance="info">
          <Text>
            <Strong>Type:</Strong> {finding.type.replace(/_/g, ' ')}
          </Text>
          <Text>
            <Strong>Severity:</Strong> {finding.severity}
          </Text>
          <Text>
            <Strong>Location:</Strong> {location}
          </Text>
          <Text>
            <Strong>Description:</Strong> {finding.description}
          </Text>
        </SectionMessage>

        {/* Solution Section */}
        {hasSolution ? <SolutionContent solution={finding.solution!} /> : <NoSolutionContent />}

        {/* Action Buttons */}
        <ButtonSet>
          {hasCreateIssue ? (
            <Button text="Create Jira Issue" onClick={() => onCreateIssue!(finding)} />
          ) : (
            <Text> </Text>
          )}
          <Button text="Close" onClick={onClose} />
        </ButtonSet>
      </Fragment>
    </ModalDialog>
  );
};

/**
 * Repository Input Modal Component
 * Shown when no repository is linked to the issue
 */
const RepositoryInputModal = ({
  onSubmit,
  onClose,
}: {
  onSubmit: (data: { repositoryUrl: string; baseRef: string; headRef: string }) => void;
  onClose: () => void;
}) => {
  return (
    <ModalDialog header="Provide Repository Details" onClose={onClose}>
      <Form
        onSubmit={(data) => {
          onSubmit({
            repositoryUrl: data.repositoryUrl as string,
            baseRef: (data.baseRef as string) || 'main',
            headRef: (data.headRef as string) || 'HEAD',
          });
        }}
        submitButtonText="Run Analysis"
      >
        <TextField name="repositoryUrl" label="Repository URL" isRequired placeholder="https://github.com/org/repo" />
        <TextField name="baseRef" label="Base Branch" placeholder="main" />
        <TextField name="headRef" label="Head Branch/Commit" placeholder="HEAD or feature-branch" />
      </Form>
    </ModalDialog>
  );
};

/**
 * Main Analysis Panel Component
 * Requirement 1.1: Display a deployment risk analysis panel
 */
const AnalysisPanel = () => {
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedFinding, setSelectedFinding] = useState<FindingWithSolution | null>(null);
  const [showRepoInput, setShowRepoInput] = useState<boolean>(false);

  // Load analysis data on mount
  useEffect(async () => {
    try {
      const response = (await invoke('getAnalysis')) as AnalysisResponse;
      setAnalysisData(response);
    } catch (error) {
      setAnalysisData({
        status: 'error',
        message: 'Failed to load analysis data',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle running analysis
  const handleRunAnalysis = async (repoData?: { repositoryUrl: string; baseRef: string; headRef: string }) => {
    setIsLoading(true);
    setShowRepoInput(false);
    try {
      const response = (await invoke('triggerAnalysis', repoData || {})) as AnalysisResponse;
      setAnalysisData(response);

      // If no repository, show input modal
      if (response.status === 'no_repository') {
        setShowRepoInput(true);
      }
    } catch (error) {
      setAnalysisData({
        status: 'error',
        message: 'Failed to run analysis',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle viewing finding details
  const handleViewDetails = (finding: FindingWithSolution) => {
    setSelectedFinding(finding);
  };

  // Handle closing detail modal
  const handleCloseDetails = () => {
    setSelectedFinding(null);
  };

  // Handle creating a Jira issue for a finding
  const handleCreateIssue = async (finding: FindingWithSolution) => {
    try {
      await invoke('createIssueFromFinding', { findingId: finding.id, finding });
      // Close the modal after creating the issue
      setSelectedFinding(null);
    } catch (error) {
      // Error handling - the resolver will return appropriate error messages
      console.error('Failed to create issue:', error);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Fragment>
        <Text>Loading deployment risk analysis...</Text>
      </Fragment>
    );
  }

  // Error state
  if (analysisData?.status === 'error') {
    return (
      <Fragment>
        <SectionMessage title="Analysis Error" appearance="error">
          <Text>{analysisData.message || 'An error occurred during analysis'}</Text>
        </SectionMessage>
        <ButtonSet>
          <Button text="Retry Analysis" onClick={() => handleRunAnalysis()} />
        </ButtonSet>
      </Fragment>
    );
  }

  // No repository state - prompt for details
  if (analysisData?.status === 'no_repository') {
    return (
      <Fragment>
        <SectionMessage title="Repository Required" appearance="warning">
          <Text>{analysisData.message || 'No repository linked to this issue.'}</Text>
        </SectionMessage>
        <ButtonSet>
          <Button text="Provide Repository Details" onClick={() => setShowRepoInput(true)} />
        </ButtonSet>
        {showRepoInput && (
          <RepositoryInputModal onSubmit={handleRunAnalysis} onClose={() => setShowRepoInput(false)} />
        )}
      </Fragment>
    );
  }

  // Success state with results
  if (analysisData?.status === 'success' && analysisData.result) {
    const { result } = analysisData;

    return (
      <Fragment>
        {/* Risk Score Summary */}
        <RiskScoreDisplay score={result.riskScore} maxSeverity={result.maxSeverity} />

        {/* Summary Statistics */}
        <SummaryStats summary={result.summary} />

        {/* Action Buttons */}
        <ButtonSet>
          <Button text="Refresh Analysis" onClick={() => handleRunAnalysis()} />
        </ButtonSet>

        {/* Findings Table - Grouped by Severity (Requirement 1.3) */}
        <FindingsTable findingsBySeverity={result.findingsBySeverity} onViewDetails={handleViewDetails} />

        {/* Solution Detail Modal */}
        {selectedFinding && (
          <SolutionDetailModal
            finding={selectedFinding}
            onClose={handleCloseDetails}
            onCreateIssue={handleCreateIssue}
          />
        )}
      </Fragment>
    );
  }

  // Initial state - no analysis yet
  return (
    <Fragment>
      <SectionMessage title="No Analysis Available" appearance="info">
        <Text>Click the button below to analyze deployment risks for this issue.</Text>
      </SectionMessage>
      <ButtonSet>
        <Button text="Run Analysis" onClick={() => handleRunAnalysis()} appearance="primary" />
      </ButtonSet>
      {showRepoInput && <RepositoryInputModal onSubmit={handleRunAnalysis} onClose={() => setShowRepoInput(false)} />}
    </Fragment>
  );
};

export const run = render(
  <IssuePanel>
    <AnalysisPanel />
  </IssuePanel>
);
