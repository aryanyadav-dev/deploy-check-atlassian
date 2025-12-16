/**
 * Risk Badge UI Component
 *
 * Displays severity-based color-coded badge on Jira board.
 * Shows highest severity finding or neutral state.
 *
 * Requirements: 6.1, 6.2, 6.4
 */

import ForgeUI, { Badge, Fragment, Text, Tooltip } from '@forge/ui';

/**
 * Severity levels supported by the badge
 */
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Props for the RiskBadge component
 */
interface RiskBadgeProps {
  /** The highest severity level from findings, or null if no analysis exists */
  severity: Severity | null;
  /** Optional risk score (0-100) to display */
  riskScore?: number;
  /** Optional count of total findings */
  findingsCount?: number;
  /** Whether the analysis is currently loading */
  isLoading?: boolean;
  /** Optional timestamp of last analysis */
  lastAnalyzed?: string;
}

/**
 * Badge appearance mapping based on severity
 * Requirement 6.2: Use highest severity finding for badge status
 *
 * - CRITICAL: 'removed' (red) - Immediate attention required
 * - HIGH: 'removed' (red) - High priority issues
 * - MEDIUM: 'default' (gray/yellow) - Moderate concerns
 * - LOW: 'added' (green) - Minor issues
 */
const SEVERITY_APPEARANCE: Record<Severity, 'primary' | 'added' | 'removed' | 'default'> = {
  CRITICAL: 'removed',
  HIGH: 'removed',
  MEDIUM: 'default',
  LOW: 'added',
};

/**
 * Badge text mapping based on severity
 */
const SEVERITY_TEXT: Record<Severity, string> = {
  CRITICAL: 'Critical Risk',
  HIGH: 'High Risk',
  MEDIUM: 'Medium Risk',
  LOW: 'Low Risk',
};

/**
 * Tooltip descriptions for each severity level
 */
const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  CRITICAL: 'Critical deployment risks detected. Immediate action required before deployment.',
  HIGH: 'High severity risks found. Review and address before deployment.',
  MEDIUM: 'Moderate risks identified. Consider addressing before deployment.',
  LOW: 'Minor risks detected. Safe to deploy with awareness.',
};

/**
 * Get badge text based on severity and optional findings count
 */
function getBadgeText(severity: Severity, findingsCount?: number): string {
  const baseText = SEVERITY_TEXT[severity];
  if (findingsCount !== undefined && findingsCount > 0) {
    return `${baseText} (${findingsCount})`;
  }
  return baseText;
}

/**
 * Get tooltip content for the badge
 */
function getTooltipContent(
  severity: Severity | null,
  riskScore?: number,
  findingsCount?: number,
  lastAnalyzed?: string
): string {
  if (!severity) {
    return 'No deployment risk analysis available. Run analysis to check for risks.';
  }

  let content = SEVERITY_DESCRIPTIONS[severity];

  if (riskScore !== undefined) {
    content += ` Risk Score: ${riskScore}/100.`;
  }

  if (findingsCount !== undefined) {
    content += ` ${findingsCount} finding${findingsCount !== 1 ? 's' : ''} detected.`;
  }

  if (lastAnalyzed) {
    content += ` Last analyzed: ${lastAnalyzed}.`;
  }

  return content;
}

/**
 * Risk Badge Component
 *
 * Displays a color-coded badge indicating deployment risk level.
 * The badge color is determined by the highest severity finding.
 *
 * Requirements:
 * - 6.1: Display risk badges on issues with linked PRs
 * - 6.2: Use highest severity finding for badge status
 * - 6.4: Display neutral indicator if no analysis exists
 */
const RiskBadge = ({
  severity,
  riskScore,
  findingsCount,
  isLoading = false,
  lastAnalyzed,
}: RiskBadgeProps) => {
  // Loading state
  if (isLoading) {
    return <Badge text="Analyzing..." appearance="default" />;
  }

  // Requirement 6.4: Display neutral indicator if no analysis exists
  if (!severity) {
    return (
      <Tooltip text="No deployment risk analysis available. Run analysis to check for risks.">
        <Badge text="No Analysis" appearance="default" />
      </Tooltip>
    );
  }

  // Requirement 6.2: Badge uses highest severity finding
  const appearance = SEVERITY_APPEARANCE[severity];
  const text = getBadgeText(severity, findingsCount);
  const tooltipContent = getTooltipContent(severity, riskScore, findingsCount, lastAnalyzed);

  return (
    <Tooltip text={tooltipContent}>
      <Badge text={text} appearance={appearance} />
    </Tooltip>
  );
};

/**
 * Compact Risk Badge Component
 *
 * A smaller version of the badge showing only severity level.
 * Useful for board views where space is limited.
 */
export const CompactRiskBadge = ({ severity }: { severity: Severity | null }) => {
  if (!severity) {
    return <Badge text="N/A" appearance="default" />;
  }

  return <Badge text={severity} appearance={SEVERITY_APPEARANCE[severity]} />;
};

/**
 * Risk Badge with Score Component
 *
 * Extended badge that shows both severity and risk score.
 * Useful for detailed views.
 */
export const RiskBadgeWithScore = ({
  severity,
  riskScore,
}: {
  severity: Severity | null;
  riskScore: number;
}) => {
  if (!severity) {
    return (
      <Fragment>
        <Badge text="No Analysis" appearance="default" />
        <Text> Score: --/100</Text>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <Badge text={SEVERITY_TEXT[severity]} appearance={SEVERITY_APPEARANCE[severity]} />
      <Text> Score: {riskScore}/100</Text>
    </Fragment>
  );
};

export default RiskBadge;
