import type { AnalysisRun, FindingModel, Runbook, RiskLevel, FindingType, Severity } from './models';
export interface ApiError {
    statusCode: number;
    error: string;
    message: string;
    correlationId: string;
}
export interface HealthResponse {
    status: string;
}
export interface TriggerAnalysisRequest {
    repoId: string;
    prId: string;
}
export interface TriggerAnalysisResponse {
    jobId: string;
    analysisRunId: string;
}
export interface AnalysisResultResponse {
    analysisRun: AnalysisRun;
    findings: FindingModel[];
    runbook?: Runbook;
}
export interface AnalysisListItem {
    id: string;
    prTitle: string;
    repoName: string;
    riskScore: number | null;
    riskLevel: RiskLevel | null;
    status: string;
    createdAt: Date;
}
export interface AnalysisListResponse {
    items: AnalysisListItem[];
    total: number;
    page: number;
    pageSize: number;
}
export interface UpdateRunbookRequest {
    content: string;
}
export interface RunbookResponse {
    id: string;
    content: string;
    updatedAt: Date;
}
export interface IntegrationStatus {
    type: string;
    connected: boolean;
    lastVerified?: Date;
}
export interface TestConnectionResponse {
    success: boolean;
    message: string;
}
export interface CreateJiraIssueRequest {
    findingId: string;
    projectKey: string;
}
export interface CreateJiraIssueResponse {
    issueKey: string;
    issueUrl: string;
}
export interface JiraIssueStatus {
    key: string;
    status: string;
    assignee?: string;
    lastUpdated: Date;
}
export interface FindingSummary {
    type: FindingType;
    severity: Severity;
    count: number;
}
export interface RiskSummary {
    score: number;
    level: RiskLevel;
    findingsByType: FindingSummary[];
}
//# sourceMappingURL=api.d.ts.map