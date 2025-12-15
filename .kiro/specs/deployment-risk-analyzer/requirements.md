# Requirements Document

## Introduction

The Deployment Risk Analyzer is a fullstack web application and Atlassian/Rovo app that analyzes code changes (pull requests/diffs) from Bitbucket and produces deployment risk reports for software teams. The system identifies deployment risks including database migrations, breaking API changes, and permission changes. It checks test coverage, flags undocumented API changes, suggests rollback safeguards, and auto-generates deployment runbooks. The application integrates with Bitbucket for code analysis, Jira for issue tracking, and runs within the Atlassian ecosystem.

## Glossary

- **Deployment_Risk_Analyzer**: The main system that analyzes pull requests and generates risk assessments
- **Analysis_Run**: A single execution of the risk analysis pipeline against a pull request
- **Finding**: A specific risk or issue identified during analysis (e.g., breaking API change, destructive migration)
- **Runbook**: An auto-generated deployment checklist with pre-deploy checks, deploy steps, rollback procedures, and observability guidance
- **Breaking_API_Change**: A modification to exported function signatures or public method interfaces that could break consumers
- **Destructive_Migration**: A database migration containing operations like DROP TABLE, DROP COLUMN, or ALTER TYPE that may cause data loss
- **Coverage_Threshold**: A configurable minimum percentage of test coverage required for modified files
- **Risk_Score**: A numeric value (0-100) aggregated from individual findings, mapped to severity levels (low/medium/high/critical)
- **Organization**: A tenant in the multi-tenant system, representing a company or team
- **Integration**: An OAuth connection to an external service (Bitbucket, Jira)
- **Webhook**: An HTTP callback from Bitbucket notifying the system of PR events
- **HMAC_Signature**: A cryptographic signature used to validate webhook authenticity
- **AST**: Abstract Syntax Tree, used for parsing and analyzing code structure
- **lcov**: A coverage report format produced by test coverage tools

## Requirements

### Requirement 1: Bitbucket Integration

**User Story:** As a development team lead, I want to connect my organization's Bitbucket workspace via OAuth, so that the system can access repositories and receive pull request events.

#### Acceptance Criteria

1. WHEN a user initiates Bitbucket OAuth connection THEN the Deployment_Risk_Analyzer SHALL redirect to Atlassian OAuth 2.0 (3LO) authorization endpoint with repository:read, pullrequest:read scopes
2. WHEN the OAuth callback is received with a valid authorization code THEN the Deployment_Risk_Analyzer SHALL exchange the code for access and refresh tokens and store them encrypted using KMS
3. WHEN a Bitbucket webhook payload arrives at the webhook endpoint THEN the Deployment_Risk_Analyzer SHALL validate the HMAC signature before processing
4. WHEN a valid pullrequest:created or pullrequest:updated event is received THEN the Deployment_Risk_Analyzer SHALL enqueue an analysis job for that pull request within 5 seconds
5. WHEN stored OAuth tokens expire THEN the Deployment_Risk_Analyzer SHALL use the refresh token to obtain new access tokens without user intervention
6. WHEN a user tests the Bitbucket connection THEN the Deployment_Risk_Analyzer SHALL verify API access by fetching the authenticated user's profile and return success or failure status

### Requirement 2: Pull Request Analysis Pipeline

**User Story:** As a developer, I want the system to automatically analyze my pull requests for deployment risks, so that I can identify potential issues before merging.

#### Acceptance Criteria

1. WHEN an analysis job is dequeued THEN the Deployment_Risk_Analyzer SHALL fetch the PR diff and modified file contents via Bitbucket REST API
2. WHEN analyzing JavaScript or TypeScript files THEN the Deployment_Risk_Analyzer SHALL parse the code using TypeScript compiler API to detect changes in exported function signatures
3. WHEN a file path matches the pattern `migrations/*` or `db/migrate/*` THEN the Deployment_Risk_Analyzer SHALL parse the SQL content to identify migration operations
4. WHEN SQL content contains DROP TABLE, DROP COLUMN, or ALTER TYPE statements THEN the Deployment_Risk_Analyzer SHALL create a Finding with severity "high" or "critical"
5. WHEN code changes include modifications to access-control patterns (hasPermission, isAdmin, role checks) THEN the Deployment_Risk_Analyzer SHALL create a Finding flagging permission logic changes
6. WHEN analysis completes THEN the Deployment_Risk_Analyzer SHALL persist the Analysis_Run with status, duration, and all Findings to the database
7. WHEN parsing JavaScript or TypeScript files THEN the Deployment_Risk_Analyzer SHALL produce an AST that can be printed back to equivalent source code (round-trip parsing)

### Requirement 3: Test Coverage Analysis

**User Story:** As a quality engineer, I want the system to check test coverage on modified files, so that I can ensure adequate testing before deployment.

#### Acceptance Criteria

1. WHEN an lcov coverage report is available for the repository THEN the Deployment_Risk_Analyzer SHALL parse the report and extract coverage percentages per file
2. WHEN a modified file has test coverage below the configured threshold (default 40%) THEN the Deployment_Risk_Analyzer SHALL create a Finding with severity "medium" indicating low coverage
3. WHEN no coverage report is available THEN the Deployment_Risk_Analyzer SHALL skip coverage analysis and note the absence in the Analysis_Run metadata
4. WHEN parsing lcov format coverage data THEN the Deployment_Risk_Analyzer SHALL correctly extract line coverage, branch coverage, and function coverage metrics
5. WHEN serializing coverage data for storage THEN the Deployment_Risk_Analyzer SHALL encode it as JSON that can be deserialized back to the original structure (round-trip serialization)

### Requirement 4: Risk Scoring

**User Story:** As a release manager, I want pull requests scored by deployment risk level, so that I can prioritize review of high-risk changes.

#### Acceptance Criteria

1. WHEN calculating risk score THEN the Deployment_Risk_Analyzer SHALL sum base scores: breaking API change (+40), destructive migration (+50), permission change (+30), low coverage (+20), undocumented API change (+10)
2. WHEN the aggregated score is 80 or above THEN the Deployment_Risk_Analyzer SHALL classify the risk as "critical"
3. WHEN the aggregated score is between 60 and 79 THEN the Deployment_Risk_Analyzer SHALL classify the risk as "high"
4. WHEN the aggregated score is between 35 and 59 THEN the Deployment_Risk_Analyzer SHALL classify the risk as "medium"
5. WHEN the aggregated score is below 35 THEN the Deployment_Risk_Analyzer SHALL classify the risk as "low"
6. WHEN serializing risk score calculations THEN the Deployment_Risk_Analyzer SHALL produce JSON output that can be deserialized back to the original score breakdown (round-trip serialization)

### Requirement 5: Runbook Generation

**User Story:** As a DevOps engineer, I want auto-generated deployment runbooks for each PR, so that I have consistent deployment procedures with rollback plans.

#### Acceptance Criteria

1. WHEN analysis completes THEN the Deployment_Risk_Analyzer SHALL generate a Runbook containing pre-deploy checks, deploy steps, post-deploy verification, and rollback plan sections
2. WHEN the PR includes database migrations THEN the Runbook SHALL include specific migration commands and corresponding rollback commands with data loss warnings
3. WHEN the PR modifies feature-flaggable code THEN the Runbook SHALL suggest feature flag toggle steps
4. WHEN generating rollback commands THEN the Deployment_Risk_Analyzer SHALL include the previous release reference and migration down commands
5. WHEN a Runbook is generated THEN the Deployment_Risk_Analyzer SHALL store it as markdown content linked to the Analysis_Run
6. WHEN serializing Runbook content THEN the Deployment_Risk_Analyzer SHALL produce markdown that preserves all sections and formatting when parsed and re-serialized (round-trip serialization)

### Requirement 6: Jira Integration

**User Story:** As a project manager, I want findings to create Jira issues automatically, so that remediation tasks are tracked in our existing workflow.

#### Acceptance Criteria

1. WHEN a user initiates Jira OAuth connection THEN the Deployment_Risk_Analyzer SHALL request read:jira-work, write:jira-work scopes and store tokens encrypted
2. WHEN a user clicks "Create Jira Issue" for a Finding THEN the Deployment_Risk_Analyzer SHALL create a Jira issue with the finding title, description, severity, and link back to the PR
3. WHEN a Jira issue is created THEN the Deployment_Risk_Analyzer SHALL store the issue key and link it to the Finding record
4. WHEN fetching Jira issue status THEN the Deployment_Risk_Analyzer SHALL return the current status, assignee, and last updated timestamp
5. WHEN high or critical findings are detected and auto-create is enabled THEN the Deployment_Risk_Analyzer SHALL automatically create Jira issues without user intervention

### Requirement 7: Web User Interface

**User Story:** As a developer, I want a web dashboard to view analysis results and edit runbooks, so that I can review risks and customize deployment procedures.

#### Acceptance Criteria

1. WHEN a user navigates to the dashboard THEN the Deployment_Risk_Analyzer SHALL display a list of recent analyses with risk level indicator, repository name, PR title, and score
2. WHEN a user selects a PR analysis THEN the Deployment_Risk_Analyzer SHALL display the risk summary, findings grouped by type (DB, API, Permissions, Coverage), and the generated runbook
3. WHEN viewing a finding THEN the Deployment_Risk_Analyzer SHALL show the code diff hunk, explanation, recommended fix, and a button to create a Jira issue
4. WHEN editing a runbook THEN the Deployment_Risk_Analyzer SHALL provide a markdown editor with the auto-generated content pre-filled and save changes to the database
5. WHEN displaying analysis results THEN the Deployment_Risk_Analyzer SHALL render within an Atlassian iframe context and as a standalone dashboard

### Requirement 8: Authentication and Multi-tenancy

**User Story:** As an organization administrator, I want to onboard my team with proper access controls, so that our data is isolated and secure.

#### Acceptance Criteria

1. WHEN a user authenticates via Atlassian OAuth THEN the Deployment_Risk_Analyzer SHALL create or retrieve the User and Organization records
2. WHEN a user belongs to an Organization THEN the Deployment_Risk_Analyzer SHALL restrict data access to only that Organization's repositories, analyses, and integrations
3. WHEN a user has the "admin" role THEN the Deployment_Risk_Analyzer SHALL allow access to organization settings, integration management, and threshold configuration
4. WHEN a user has the "developer" role THEN the Deployment_Risk_Analyzer SHALL allow read access to analyses and runbooks but restrict settings modification
5. WHEN storing integration OAuth tokens THEN the Deployment_Risk_Analyzer SHALL encrypt tokens using KMS before database persistence

### Requirement 9: Background Job Processing

**User Story:** As a system operator, I want analysis jobs processed reliably in the background, so that webhook responses are fast and analysis is fault-tolerant.

#### Acceptance Criteria

1. WHEN a PR event webhook is received THEN the Deployment_Risk_Analyzer SHALL enqueue an analysis job to Redis via BullMQ and respond to the webhook within 2 seconds
2. WHEN a worker picks up an analysis job THEN the Deployment_Risk_Analyzer SHALL update the Analysis_Run status to "in_progress" and record the start time
3. WHEN analysis completes successfully THEN the Deployment_Risk_Analyzer SHALL update the Analysis_Run status to "completed" with findings and duration
4. WHEN analysis fails THEN the Deployment_Risk_Analyzer SHALL update the Analysis_Run status to "failed", log the error, and retry up to 3 times with exponential backoff
5. WHEN serializing job payloads for the queue THEN the Deployment_Risk_Analyzer SHALL produce JSON that can be deserialized back to the original job structure (round-trip serialization)

### Requirement 10: API Contract Analysis

**User Story:** As an API developer, I want the system to detect undocumented API changes, so that I can ensure API documentation stays in sync with implementation.

#### Acceptance Criteria

1. WHEN an OpenAPI specification file is modified in the PR THEN the Deployment_Risk_Analyzer SHALL compare the old and new versions to detect breaking changes
2. WHEN API route handlers are modified but the OpenAPI spec is unchanged THEN the Deployment_Risk_Analyzer SHALL create a Finding flagging potentially undocumented API changes
3. WHEN breaking API changes are detected (removed endpoints, changed required parameters) THEN the Deployment_Risk_Analyzer SHALL create a Finding with severity "high"
4. WHEN parsing OpenAPI specifications THEN the Deployment_Risk_Analyzer SHALL validate the spec structure and produce output that can be re-serialized to equivalent YAML/JSON (round-trip parsing)

### Requirement 11: Security and Audit

**User Story:** As a security officer, I want all sensitive operations logged and data protected, so that we maintain compliance and can investigate incidents.

#### Acceptance Criteria

1. WHEN any API endpoint receives a request THEN the Deployment_Risk_Analyzer SHALL log the request with correlation ID, user ID, and timestamp
2. WHEN a webhook is received THEN the Deployment_Risk_Analyzer SHALL validate the HMAC signature and reject requests with invalid signatures with HTTP 401
3. WHEN displaying user-generated content THEN the Deployment_Risk_Analyzer SHALL sanitize and escape HTML to prevent XSS attacks
4. WHEN API rate limits are exceeded THEN the Deployment_Risk_Analyzer SHALL return HTTP 429 and include retry-after header
5. WHEN a runbook is approved or modified THEN the Deployment_Risk_Analyzer SHALL create an audit log entry with the user, action, and timestamp

### Requirement 12: Extensibility for Multiple Languages

**User Story:** As a platform architect, I want the analysis system designed for extensibility, so that we can add support for Python, Java, and Go repositories in the future.

#### Acceptance Criteria

1. WHEN implementing code analyzers THEN the Deployment_Risk_Analyzer SHALL use a plugin architecture where each language analyzer implements a common interface
2. WHEN a repository contains files of an unsupported language THEN the Deployment_Risk_Analyzer SHALL skip analysis for those files and log a notice without failing the entire analysis
3. WHEN adding a new language analyzer THEN the Deployment_Risk_Analyzer SHALL require only implementing the analyzer interface without modifying core pipeline code
4. WHEN serializing analyzer configurations THEN the Deployment_Risk_Analyzer SHALL produce JSON that can be deserialized back to the original configuration (round-trip serialization)
