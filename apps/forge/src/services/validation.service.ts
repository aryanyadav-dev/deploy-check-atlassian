/**
 * Configuration Validation Service
 *
 * Provides validation functions for ProjectConfig and its fields.
 * Returns structured validation errors for invalid inputs.
 *
 * Requirements: 4.2
 */

import type { ProjectConfig } from '../types';
import type { Severity } from '@dra/types';

/**
 * Valid severity values for threshold configuration
 */
const VALID_SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];



/**
 * Structured validation error containing field information
 */
export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a coverage threshold value
 *
 * Coverage threshold must be a number between 0 and 100 (inclusive).
 *
 * @param value - The threshold value to validate
 * @returns ValidationResult indicating if the value is valid
 *
 * Requirements: 4.2
 */
export function validateThreshold(value: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof value !== 'number') {
    errors.push({
      field: 'coverageThreshold',
      message: 'Coverage threshold must be a number',
      value,
    });
    return { valid: false, errors };
  }

  if (Number.isNaN(value)) {
    errors.push({
      field: 'coverageThreshold',
      message: 'Coverage threshold must be a valid number, not NaN',
      value,
    });
    return { valid: false, errors };
  }

  if (!Number.isFinite(value)) {
    errors.push({
      field: 'coverageThreshold',
      message: 'Coverage threshold must be a finite number',
      value,
    });
    return { valid: false, errors };
  }

  if (value < 0 || value > 100) {
    errors.push({
      field: 'coverageThreshold',
      message: 'Coverage threshold must be between 0 and 100',
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate enabled analyzers array
 *
 * @param analyzers - Array of analyzer names to validate
 * @returns ValidationResult indicating if the array is valid
 */
export function validateEnabledAnalyzers(analyzers: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!Array.isArray(analyzers)) {
    errors.push({
      field: 'enabledAnalyzers',
      message: 'Enabled analyzers must be an array',
      value: analyzers,
    });
    return { valid: false, errors };
  }

  // Check each analyzer is a valid string
  for (let i = 0; i < analyzers.length; i++) {
    if (typeof analyzers[i] !== 'string') {
      errors.push({
        field: `enabledAnalyzers[${i}]`,
        message: 'Each analyzer must be a string',
        value: analyzers[i],
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate severity threshold value
 *
 * @param severity - The severity value to validate
 * @returns ValidationResult indicating if the value is valid
 */
export function validateSeverityThreshold(severity: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof severity !== 'string') {
    errors.push({
      field: 'severityThreshold',
      message: `Severity threshold must be a string, one of: ${VALID_SEVERITIES.join(', ')}`,
      value: severity,
    });
    return { valid: false, errors };
  }

  if (!VALID_SEVERITIES.includes(severity as Severity)) {
    errors.push({
      field: 'severityThreshold',
      message: `Severity threshold must be one of: ${VALID_SEVERITIES.join(', ')}`,
      value: severity,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate auto publish setting
 *
 * @param autoPublish - The auto publish value to validate
 * @returns ValidationResult indicating if the value is valid
 */
export function validateAutoPublish(autoPublish: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof autoPublish !== 'boolean') {
    errors.push({
      field: 'autoPublish',
      message: 'Auto publish must be a boolean',
      value: autoPublish,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate confluence space key (optional field)
 *
 * @param spaceKey - The space key to validate
 * @returns ValidationResult indicating if the value is valid
 */
export function validateConfluenceSpaceKey(spaceKey: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // undefined is valid (optional field)
  if (spaceKey === undefined) {
    return { valid: true, errors: [] };
  }

  if (typeof spaceKey !== 'string') {
    errors.push({
      field: 'confluenceSpaceKey',
      message: 'Confluence space key must be a string',
      value: spaceKey,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate a complete ProjectConfig object
 *
 * Validates all fields and returns a combined result with all errors.
 *
 * @param config - The configuration object to validate
 * @returns ValidationResult with all validation errors
 *
 * Requirements: 4.2
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if config is an object
  if (config === null || typeof config !== 'object') {
    errors.push({
      field: 'config',
      message: 'Configuration must be an object',
      value: config,
    });
    return { valid: false, errors };
  }

  const configObj = config as Record<string, unknown>;

  // Validate coverage threshold
  const thresholdResult = validateThreshold(configObj.coverageThreshold);
  errors.push(...thresholdResult.errors);

  // Validate enabled analyzers
  const analyzersResult = validateEnabledAnalyzers(configObj.enabledAnalyzers);
  errors.push(...analyzersResult.errors);

  // Validate auto publish
  const autoPublishResult = validateAutoPublish(configObj.autoPublish);
  errors.push(...autoPublishResult.errors);

  // Validate severity threshold
  const severityResult = validateSeverityThreshold(configObj.severityThreshold);
  errors.push(...severityResult.errors);

  // Validate confluence space key (optional)
  const spaceKeyResult = validateConfluenceSpaceKey(configObj.confluenceSpaceKey);
  errors.push(...spaceKeyResult.errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Type guard to check if a value is a valid ProjectConfig
 *
 * @param config - Value to check
 * @returns True if the value is a valid ProjectConfig
 */
export function isValidProjectConfig(config: unknown): config is ProjectConfig {
  return validateConfig(config).valid;
}
