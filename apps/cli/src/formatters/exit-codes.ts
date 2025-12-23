/**
 * Exit Code Handler
 * Determines appropriate exit codes for CI integration
 */

import type { RiskLevel } from '@dra/types';

/**
 * Exit code definitions
 * - 0: No findings or all LOW severity
 * - 1: MEDIUM severity findings
 * - 2: HIGH or CRITICAL severity findings
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  MEDIUM_RISK: 1,
  HIGH_RISK: 2,
} as const;

/**
 * Risk level order for comparison
 */
const RISK_LEVEL_ORDER: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/**
 * Options for exit code determination
 */
export interface ExitCodeOptions {
  /**
   * Minimum severity level that causes non-zero exit
   * @default 'HIGH'
   */
  failOn?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Exit code handler for CI integration
 */
export class ExitCodeHandler {
  private failOnLevel: number;

  constructor(options: ExitCodeOptions = {}) {
    const failOn = (options.failOn ?? 'high').toUpperCase();
    this.failOnLevel = RISK_LEVEL_ORDER[failOn] ?? RISK_LEVEL_ORDER.HIGH;
  }

  /**
   * Get exit code based on risk level
   */
  getExitCode(riskLevel: RiskLevel | string): number {
    const level = riskLevel.toUpperCase();
    const levelOrder = RISK_LEVEL_ORDER[level] ?? 0;

    // If risk level is below fail threshold, return success
    if (levelOrder < this.failOnLevel) {
      return EXIT_CODES.SUCCESS;
    }

    // Return appropriate exit code based on severity
    if (levelOrder >= RISK_LEVEL_ORDER.HIGH) {
      return EXIT_CODES.HIGH_RISK;
    }

    if (levelOrder >= RISK_LEVEL_ORDER.MEDIUM) {
      return EXIT_CODES.MEDIUM_RISK;
    }

    return EXIT_CODES.SUCCESS;
  }

  /**
   * Check if the risk level should cause failure
   */
  shouldFail(riskLevel: RiskLevel | string): boolean {
    return this.getExitCode(riskLevel) !== EXIT_CODES.SUCCESS;
  }

  /**
   * Get human-readable exit code description
   */
  getExitCodeDescription(exitCode: number): string {
    switch (exitCode) {
      case EXIT_CODES.SUCCESS:
        return 'Success - No significant risks detected';
      case EXIT_CODES.MEDIUM_RISK:
        return 'Medium risk - Review recommended before deployment';
      case EXIT_CODES.HIGH_RISK:
        return 'High/Critical risk - Deployment not recommended';
      default:
        return 'Unknown exit code';
    }
  }

  /**
   * Get the configured fail-on level
   */
  getFailOnLevel(): string {
    for (const [level, order] of Object.entries(RISK_LEVEL_ORDER)) {
      if (order === this.failOnLevel) {
        return level;
      }
    }
    return 'HIGH';
  }
}

/**
 * Convenience function to get exit code
 */
export function getExitCode(
  riskLevel: RiskLevel | string,
  failOn?: 'low' | 'medium' | 'high' | 'critical'
): number {
  const handler = new ExitCodeHandler({ failOn });
  return handler.getExitCode(riskLevel);
}

/**
 * Convenience function to check if should fail
 */
export function shouldFailOnRisk(
  riskLevel: RiskLevel | string,
  failOn?: 'low' | 'medium' | 'high' | 'critical'
): boolean {
  const handler = new ExitCodeHandler({ failOn });
  return handler.shouldFail(riskLevel);
}
