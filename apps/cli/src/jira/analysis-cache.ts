import * as fs from 'fs';
import * as path from 'path';
import { AnalysisCache, CachedFinding } from './types';
import { Finding } from '@dra/types';

const CACHE_DIR = '.deploy-check';
const CACHE_FILE = 'analysis-cache.json';

/**
 * Manages local cache of analysis results and Jira issue links
 */
export class AnalysisCacheStore {
  private getCachePath(): string {
    return path.join(process.cwd(), CACHE_DIR, CACHE_FILE);
  }

  private ensureCacheDir(): void {
    const dir = path.dirname(this.getCachePath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load the analysis cache
   */
  load(): AnalysisCache | null {
    const cachePath = this.getCachePath();
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(content) as AnalysisCache;
    } catch {
      return null;
    }
  }

  /**
   * Save analysis results to cache
   */
  save(
    findings: Finding[],
    riskScore?: number,
    riskLevel?: string,
    commitRef?: string
  ): void {
    this.ensureCacheDir();

    const cache: AnalysisCache = {
      timestamp: new Date().toISOString(),
      commitRef,
      findings: findings.map((f, index) => ({
        id: `finding-${index}`,
        type: f.type,
        severity: f.severity,
        title: f.title,
        description: f.description,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
      })),
      riskScore,
      riskLevel,
    };

    fs.writeFileSync(this.getCachePath(), JSON.stringify(cache, null, 2));
  }

  /**
   * Update a finding with a linked Jira issue key
   */
  linkJiraIssue(findingId: string, issueKey: string): void {
    const cache = this.load();
    if (!cache) {
      throw new Error('No analysis cache found. Run `deploy-check analyze` first.');
    }

    const finding = cache.findings.find((f) => f.id === findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    finding.jiraIssueKey = issueKey;
    fs.writeFileSync(this.getCachePath(), JSON.stringify(cache, null, 2));
  }

  /**
   * Get all findings with linked Jira issues
   */
  getLinkedFindings(): CachedFinding[] {
    const cache = this.load();
    if (!cache) {
      return [];
    }

    return cache.findings.filter((f) => f.jiraIssueKey);
  }

  /**
   * Get findings by severity
   */
  getFindingsBySeverity(severities: string[]): CachedFinding[] {
    const cache = this.load();
    if (!cache) {
      return [];
    }

    const normalizedSeverities = severities.map((s) => s.toUpperCase());
    return cache.findings.filter((f) =>
      normalizedSeverities.includes(f.severity.toUpperCase())
    );
  }

  /**
   * Get all findings without linked Jira issues
   */
  getUnlinkedFindings(): CachedFinding[] {
    const cache = this.load();
    if (!cache) {
      return [];
    }

    return cache.findings.filter((f) => !f.jiraIssueKey);
  }

  /**
   * Get the cache file path
   */
  getCacheFilePath(): string {
    return this.getCachePath();
  }

  /**
   * Check if cache exists
   */
  exists(): boolean {
    return fs.existsSync(this.getCachePath());
  }
}

/**
 * Singleton instance for convenience
 */
export const analysisCacheStore = new AnalysisCacheStore();
