import { Injectable, Logger } from '@nestjs/common';
import type {
  Analyzer,
  AnalyzerRegistry as IAnalyzerRegistry,
} from '@dra/types';
import * as path from 'path';

/**
 * Registry for managing analyzer plugins.
 * Implements the plugin architecture for extensibility (Requirements 12.1, 12.3).
 */
@Injectable()
export class AnalyzerRegistry implements IAnalyzerRegistry {
  private readonly logger = new Logger(AnalyzerRegistry.name);
  private readonly analyzers = new Map<string, Analyzer>();

  /**
   * Register an analyzer plugin.
   * @param analyzer The analyzer to register
   */
  register(analyzer: Analyzer): void {
    if (this.analyzers.has(analyzer.name)) {
      this.logger.warn(
        `Analyzer "${analyzer.name}" is already registered. Overwriting.`,
      );
    }
    this.analyzers.set(analyzer.name, analyzer);
    this.logger.log(
      `Registered analyzer: ${analyzer.name} (extensions: ${analyzer.supportedExtensions.join(', ')})`,
    );
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
      if (analyzer.supportedExtensions.includes(ext)) {
        matchingAnalyzers.push(analyzer);
      }
    }

    if (matchingAnalyzers.length === 0) {
      this.logger.debug(
        `No analyzers found for file: ${filePath} (extension: ${ext})`,
      );
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
    const removed = this.analyzers.delete(name);
    if (removed) {
      this.logger.log(`Unregistered analyzer: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all registered analyzers.
   */
  clear(): void {
    this.analyzers.clear();
    this.logger.log('Cleared all analyzers');
  }
}
