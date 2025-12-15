export type Role = 'ADMIN' | 'DEVELOPER';
export type IntegrationType = 'BITBUCKET' | 'JIRA';
export type PrStatus = 'OPEN' | 'MERGED' | 'DECLINED';
export type AnalysisStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FindingType = 'BREAKING_API' | 'DESTRUCTIVE_MIGRATION' | 'PERMISSION_CHANGE' | 'LOW_COVERAGE' | 'UNDOCUMENTED_API';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface Organization {
    id: string;
    name: string;
    settings: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export interface User {
    id: string;
    orgId: string;
    email: string;
    name: string;
    role: Role;
    createdAt: Date;
}
export interface Integration {
    id: string;
    orgId: string;
    type: IntegrationType;
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export interface Repo {
    id: string;
    orgId: string;
    providerRepoId: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    settings: Record<string, unknown>;
    createdAt: Date;
}
export interface PullRequest {
    id: string;
    repoId: string;
    providerPrId: number;
    title: string;
    author: string;
    sourceBranch: string;
    targetBranch: string;
    status: PrStatus;
    createdAt: Date;
    updatedAt: Date;
}
export interface AnalysisRun {
    id: string;
    prId: string;
    status: AnalysisStatus;
    riskScore?: number | null;
    riskLevel?: RiskLevel | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    errorMessage?: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}
export interface FindingModel {
    id: string;
    analysisRunId: string;
    type: FindingType;
    severity: Severity;
    title: string;
    description: string;
    filePath?: string | null;
    lineStart?: number | null;
    lineEnd?: number | null;
    codeSnippet?: string | null;
    remediation?: string | null;
    metadata: Record<string, unknown>;
    jiraIssueKey?: string | null;
    createdAt: Date;
}
export interface Runbook {
    id: string;
    analysisRunId: string;
    content: string;
    authorId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface AuditLog {
    id: string;
    orgId: string;
    userId?: string | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
}
//# sourceMappingURL=models.d.ts.map