/**
 * Base analyzer for CLI
 * Provides common functionality without NestJS dependencies
 */

import type { Analyzer, AnalysisContext, Finding } from '@dra/types';

/**
 * Base abstract class for CLI analyzers providing common functionality.
 * New language analyzers should extend this class (Requirements 12.1, 12.3).
 */
export abstract class BaseAnalyzerCli implements Analyzer {
  abstract readonly name: string;
  abstract readonly supportedExtensions: string[];

  /**
   * Analyze the given context and return findings.
   * @param context The analysis context containing files and configuration
   * @returns Array of findings
   */
  abstract analyze(context: AnalysisContext): Promise<Finding[]>;

  /**
   * Check if this analyzer supports a given file extension.
   * @param extension The file extension (including the dot)
   * @returns True if the extension is supported
   */
  supportsExtension(extension: string): boolean {
    return this.supportedExtensions.includes(extension.toLowerCase());
  }

  /**
   * Filter files from context that this analyzer supports.
   * @param context The analysis context
   * @returns Filtered file changes
   */
  protected filterSupportedFiles(context: AnalysisContext) {
    return context.files.filter((file) => {
      const ext = this.getExtension(file.path);
      return this.supportsExtension(ext);
    });
  }

  /**
   * Get the file extension from a path.
   * @param filePath The file path
   * @returns The extension including the dot
   */
  protected getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filePath.slice(lastDot).toLowerCase();
  }
}
