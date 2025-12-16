/**
 * Retry Utility
 *
 * Provides retry mechanism with exponential backoff for handling transient failures.
 *
 * Requirements: 3.4
 */

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Optional callback for retry notifications */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
  /** Optional callback for final failure notification */
  onFinalFailure?: (error: Error, attempts: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'onFinalFailure'>> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * The delay between retries follows the formula: delay = baseDelay * 2^attempt
 * For example, with baseDelay=1000ms:
 * - Attempt 1 failure: wait 1000ms (1s)
 * - Attempt 2 failure: wait 2000ms (2s)
 * - Attempt 3 failure: wait 4000ms (4s)
 *
 * Requirement 3.4: Retry with exponential backoff and notify user on final failure
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result or throwing on final failure
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    baseDelay = DEFAULT_OPTIONS.baseDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    onRetry,
    onFinalFailure,
  } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      if (attempt > maxRetries) {
        // Final failure - notify user
        if (onFinalFailure) {
          onFinalFailure(lastError, attempt);
        }
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delay = calculateBackoffDelay(attempt - 1, baseDelay, maxDelay);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Calculate exponential backoff delay.
 *
 * Formula: delay = baseDelay * 2^attempt, capped at maxDelay
 *
 * @param attempt - The current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic, returning a result object instead of throwing.
 *
 * This variant is useful when you want to handle failures gracefully without exceptions.
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to a RetryResult object
 */
export async function withRetryResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    baseDelay = DEFAULT_OPTIONS.baseDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    onRetry,
    onFinalFailure,
  } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      if (attempt > maxRetries) {
        // Final failure - notify user
        if (onFinalFailure) {
          onFinalFailure(lastError, attempt);
        }
        return {
          success: false,
          error: lastError,
          attempts: attempt,
        };
      }

      // Calculate exponential backoff delay
      const delay = calculateBackoffDelay(attempt - 1, baseDelay, maxDelay);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // This should never be reached
  return {
    success: false,
    error: lastError ?? new Error('Retry failed'),
    attempts: attempt,
  };
}
