/**
 * Analyze command for deploy-check CLI
 * Analyzes code changes for deployment risks
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
  ExitCodeHandler,
  LinkedFinding,
} from '../formatters';
import { analysisCacheStore, credentialsStore } from '../jira';
import type { Finding } from '@dra/types';

/**
 * Options for the analyze command
 */
interface AnalyzeOptions {
  base?: string;
  head?: string;
  files?: string;
  coverage?: string;
  openapi?: string;
  output?: string;
  failOn?: 'low' | 'medium' | 'high' | 'critical';
}

export const analyzeCommand = new Command('analyze')
  .description('Analyze code changes for deployment risks')
  .option('--base <ref>', 'Base reference to compare against (default: main/master)')
  .option('--head <ref>', 'Head reference to analyze (default: HEAD)')
  .option('--files <glob>', 'Glob pattern to limit analysis scope')
  .option('--coverage <path>', 'Path to lcov coverage report')
  .option('--openapi <path>', 'Path to OpenAPI specification file')
  .option('--output <file>', 'Output file path for markdown report')
  .option('--fail-on <level>', 'Severity level that causes non-zero exit (low, medium, high, critical)', 'high')
  .action(async (options: AnalyzeOptions) => {
    const parentOpts = analyzeCommand.parent?.opts() ?? {};
    const verbose = parentOpts.verbose ?? false;
    const jsonOutput = parentOpts.json ?? false;
    const configPath = parentOpts.config;

    // Initialize formatters
    const terminalFormatter = new TerminalFormatter({ verbose });
    const jsonFormatter = new JsonFormatter({ pretty: true });
    const markdownFormatter = new MarkdownFormatter({ includeRunbook: true });
    const exitCodeHandler = new ExitCodeHandler({ failOn: options.failOn });

    try {
      // Load configuration
      const config = await configLoader.load(configPath);


      if (verbose) {
        console.log('Running analysis with options:', { ...options, verbose, jsonOutput });
        console.log('Configuration:', config);
      }

      // Run analysis
      const result = await runAnalysis({
        base: options.base ?? config.baseRef,
        head: options.head,
        files: options.files,
        coveragePath: options.coverage ?? config.coveragePath,
        openapiPath: options.openapi ?? config.openapiPath,
        coverageThreshold: config.coverageThreshold,
        ignoredPaths: config.ignoredPaths,
        verbose,
      });

      // Calculate risk score
      const riskScore = calculateRiskScore(result.findings);
      const riskLevel = classifyRiskLevel(riskScore);

      // Load existing cache to preserve Jira links
      const existingCache = analysisCacheStore.load();
      const existingLinks = new Map<string, string>();
      if (existingCache) {
        for (const cachedFinding of existingCache.findings) {
          if (cachedFinding.jiraIssueKey) {
            // Create a key based on finding properties to match
            const key = `${cachedFinding.type}:${cachedFinding.title}:${cachedFinding.filePath ?? ''}`;
            existingLinks.set(key, cachedFinding.jiraIssueKey);
          }
        }
      }

      // Save results to analysis cache for Jira integration
      analysisCacheStore.save(
        result.findings,
        riskScore,
        riskLevel,
        options.head ?? 'HEAD'
      );

      // Restore Jira links to the new cache
      if (existingLinks.size > 0) {
        const newCache = analysisCacheStore.load();
        if (newCache) {
          for (const finding of newCache.findings) {
            const key = `${finding.type}:${finding.title}:${finding.filePath ?? ''}`;
            const existingIssueKey = existingLinks.get(key);
            if (existingIssueKey) {
              analysisCacheStore.linkJiraIssue(finding.id, existingIssueKey);
            }
          }
        }
      }

      // Merge Jira issue links into findings for display
      const linkedFindings = mergeJiraLinks(result.findings, analysisCacheStore);

      // Get Jira instance URL for link generation
      const jiraCredentials = credentialsStore.getJiraCredentials();
      if (jiraCredentials) {
        terminalFormatter.setJiraInstanceUrl(jiraCredentials.instanceUrl);
        markdownFormatter.setJiraInstanceUrl(jiraCredentials.instanceUrl);
      }

      // Output results based on format
      if (jsonOutput) {
        // JSON output for piping to other tools
        const output = jsonFormatter.format(
          linkedFindings,
          riskScore,
          riskLevel,
          result.filesAnalyzed,
          result.analyzersRun,
          result.warnings
        );
        console.log(output);
      } else {
        // Terminal output with colors
        if (result.warnings.length > 0 && verbose) {
          console.log(terminalFormatter.formatSummary(0, [], result.warnings));
        }

        // Display findings
        console.log(terminalFormatter.formatFindings(linkedFindings));

        // Display risk score with progress bar
        console.log(terminalFormatter.formatRiskScore(riskScore, riskLevel));

        // Display summary
        console.log(terminalFormatter.formatSummary(
          result.filesAnalyzed,
          result.analyzersRun,
          verbose ? [] : result.warnings
        ));
      }

      // Generate markdown report if output path specified
      if (options.output) {
        const markdownReport = markdownFormatter.format(
          linkedFindings,
          riskScore,
          riskLevel,
          result.filesAnalyzed,
          result.analyzersRun,
          result.warnings
        );

        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, markdownReport, 'utf-8');

        if (!jsonOutput) {
          console.log(terminalFormatter.formatSuccess(`Report saved to: ${outputPath}`));
        }
      }

      // Exit with appropriate code based on risk level and fail-on setting
      const exitCode = exitCodeHandler.getExitCode(riskLevel);
      if (exitCode !== 0) {
        if (!jsonOutput) {
          console.log(`\nExiting with code ${exitCode}: ${exitCodeHandler.getExitCodeDescription(exitCode)}`);
        }
        process.exit(exitCode);
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
 * Merge Jira issue links from cache into findings for display
 */
function mergeJiraLinks(
  findings: Finding[],
  cacheStore: typeof analysisCacheStore
): LinkedFinding[] {
  const cache = cacheStore.load();
  if (!cache) {
    return findings as LinkedFinding[];
  }

  // Create a map of finding index to Jira issue key
  const issueKeyMap = new Map<number, string>();
  for (const cachedFinding of cache.findings) {
    if (cachedFinding.jiraIssueKey) {
      // Extract index from finding ID (e.g., "finding-0" -> 0)
      const match = cachedFinding.id.match(/finding-(\d+)/);
      if (match) {
        issueKeyMap.set(parseInt(match[1], 10), cachedFinding.jiraIssueKey);
      }
    }
  }

  // Merge Jira issue keys into findings
  return findings.map((finding, index): LinkedFinding => ({
    ...finding,
    jiraIssueKey: issueKeyMap.get(index),
  }));
}
