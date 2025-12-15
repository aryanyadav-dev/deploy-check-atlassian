/**
 * Report command for deploy-check CLI
 * Generates deployment risk reports in various formats
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { configLoader } from '../config';
import { runAnalysis } from '../analyzers';
import { calculateRiskScore, classifyRiskLevel } from '../scoring';
import {
  TerminalFormatter,
  JsonFormatter,
  MarkdownFormatter,
} from '../formatters';

/**
 * Options for the report command
 */
interface ReportOptions {
  output?: string;
  format?: 'markdown' | 'json' | 'html';
  base?: string;
  head?: string;
  title?: string;
  includeRunbook?: boolean;
}

export const reportCommand = new Command('report')
  .description('Generate deployment risk reports')
  .option('--output <file>', 'Output file path for the report')
  .option('--format <format>', 'Report format: markdown, json, html', 'markdown')
  .option('--base <ref>', 'Base reference to compare against')
  .option('--head <ref>', 'Head reference to analyze')
  .option('--title <title>', 'Custom report title')
  .option('--include-runbook', 'Include deployment runbook in report', true)
  .action(async (options: ReportOptions) => {
    const parentOpts = reportCommand.parent?.opts() ?? {};
    const verbose = parentOpts.verbose ?? false;
    const jsonOutput = parentOpts.json ?? false;
    const configPath = parentOpts.config;

    const terminalFormatter = new TerminalFormatter({ verbose });
    const jsonFormatter = new JsonFormatter({ pretty: true });

    try {
      // Load configuration
      const config = await configLoader.load(configPath);

      if (verbose) {
        console.log('Generating report with options:', { ...options, verbose, jsonOutput });
      }

      // Run analysis to get findings
      const result = await runAnalysis({
        base: options.base ?? config.baseRef,
        head: options.head,
        coveragePath: config.coveragePath,
        openapiPath: config.openapiPath,
        coverageThreshold: config.coverageThreshold,
        ignoredPaths: config.ignoredPaths,
        verbose,
      });

      // Calculate risk score
      const riskScore = calculateRiskScore(result.findings);
      const riskLevel = classifyRiskLevel(riskScore);

      // Generate report based on format
      let reportContent: string;
      let fileExtension: string;

      switch (options.format) {
        case 'json':
          reportContent = jsonFormatter.format(
            result.findings,
            riskScore,
            riskLevel,
            result.filesAnalyzed,
            result.analyzersRun,
            result.warnings
          );
          fileExtension = '.json';
          break;

        case 'html':
          // HTML format - wrap markdown in basic HTML
          const markdownForHtml = new MarkdownFormatter({
            title: options.title,
            includeRunbook: options.includeRunbook ?? true,
          });
          const mdContent = markdownForHtml.format(
            result.findings,
            riskScore,
            riskLevel,
            result.filesAnalyzed,
            result.analyzersRun,
            result.warnings
          );
          reportContent = wrapInHtml(mdContent, options.title ?? 'Deployment Risk Report');
          fileExtension = '.html';
          break;

        case 'markdown':
        default:
          const markdownFormatter = new MarkdownFormatter({
            title: options.title,
            includeRunbook: options.includeRunbook ?? true,
          });
          reportContent = markdownFormatter.format(
            result.findings,
            riskScore,
            riskLevel,
            result.filesAnalyzed,
            result.analyzersRun,
            result.warnings
          );
          fileExtension = '.md';
          break;
      }

      // Output report
      if (options.output) {
        let outputPath = options.output;
        
        // Add extension if not present
        if (!path.extname(outputPath)) {
          outputPath += fileExtension;
        }

        outputPath = path.resolve(outputPath);
        fs.writeFileSync(outputPath, reportContent, 'utf-8');

        if (!jsonOutput) {
          console.log(terminalFormatter.formatSuccess(`Report saved to: ${outputPath}`));
        }
      } else {
        // Output to stdout
        console.log(reportContent);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (jsonOutput) {
        console.log(jsonFormatter.formatError(message));
      } else {
        console.error(terminalFormatter.formatError(message));
      }

      process.exit(1);
    }
  });

/**
 * Wrap markdown content in basic HTML
 */
function wrapInHtml(markdown: string, title: string): string {
  // Basic HTML wrapper with simple markdown rendering
  // In a full implementation, we'd use a proper markdown-to-html converter
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1, h2, h3, h4 { color: #2c3e50; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
    code { background-color: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background-color: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #e74c3c; margin: 1em 0; padding-left: 1em; color: #666; }
    hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
    .risk-critical { color: #e74c3c; }
    .risk-high { color: #e67e22; }
    .risk-medium { color: #f1c40f; }
    .risk-low { color: #27ae60; }
  </style>
</head>
<body>
<pre style="white-space: pre-wrap; font-family: inherit;">
${escapeHtml(markdown)}
</pre>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
