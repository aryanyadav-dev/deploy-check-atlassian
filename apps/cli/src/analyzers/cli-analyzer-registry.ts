/**
 * CLI Analyzer Registry
 * A simplified analyzer registry for CLI use without NestJS dependencies
 */

import type { Analyzer, AnalyzerRegistry } from '@dra/types';
import * as path from 'path';

/**
 * Registry for managing analyzer plugins in CLI context.
 * Implements the plugin architecture for extensibility (Requirements 12.1, 12.3).
 */
export class CliAnalyzerRegistry implements AnalyzerRegistry {
  private readonly analyzers = new Map<string, Analyzer>();
  private verbose = false;

  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false;
  }

  /**
   * Register an analyzer plugin.
   * @param analyzer The analyzer to register
   */
  register(analyzer: Analyzer): void {
    if (this.analyzers.has(analyzer.name)) {
      if (this.verbose) {
        console.warn(`Analyzer "${analyzer.name}" is already registered. Overwriting.`);
      }
    }
    this.analyzers.set(analyzer.name, analyzer);
    if (this.verbose) {
      console.log(`Registered analyzer: ${analyzer.name} (extensions: ${analyzer.supportedExtensions.join(', ')})`);
    }
  }

  /**
   * Get an analyzer by name.
   * @param name The analyzer name
   * @returns The analyzer or undefined if not found
   */
  getAnalyzer(name: string): Analyzer | undefined {
    return this.analyzers.get(name);
  }

  /**
   * Get all analyzers that support a given file path based on extension.
   * Implements graceful handling for unsupported files (Requirements 12.2).
   * @param filePath The file path to check
   * @returns Array of analyzers that support the file extension
   */
  getAnalyzersForFile(filePath: string): Analyzer[] {
    const ext = path.extname(filePath).toLowerCase();
    const matchingAnalyzers: Analyzer[] = [];

    for (const analyzer of this.analyzers.values()) {
      // Special case: '*' means all extensions
      if (analyzer.supportedExtensions.includes('*') || analyzer.supportedExtensions.includes(ext)) {
        matchingAnalyzers.push(analyzer);
      }
    }

    if (matchingAnalyzers.length === 0 && this.verbose) {
      console.log(`No analyzers found for file: ${filePath} (extension: ${ext})`);
    }

    return matchingAnalyzers;
  }

  /**
   * Get all registered analyzers.
   * @returns Array of all registered analyzers
   */
  getAllAnalyzers(): Analyzer[] {
    return Array.from(this.analyzers.values());
  }

  /**
   * Check if an analyzer is registered.
   * @param name The analyzer name
   * @returns True if the analyzer is registered
   */
  hasAnalyzer(name: string): boolean {
    return this.analyzers.has(name);
  }

  /**
   * Unregister an analyzer.
   * @param name The analyzer name
   * @returns True if the analyzer was removed
   */
  unregister(name: string): boolean {
    return this.analyzers.delete(name);
  }

  /**
   * Clear all registered analyzers.
   */
  clear(): void {
    this.analyzers.clear();
  }
}
