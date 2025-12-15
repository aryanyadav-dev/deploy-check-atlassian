# Jira & Confluence Integration Guide

This guide covers how to integrate `deploy-check` with Atlassian Jira and Confluence to track deployment risks, create issues for findings, and publish reports to your team's documentation.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Jira Integration](#jira-integration)
  - [Authentication](#jira-authentication)
  - [Creating Issues](#creating-issues)
  - [Linking Findings](#linking-findings)
  - [Checking Status](#checking-status)
- [Confluence Integration](#confluence-integration)
  - [Authentication](#confluence-authentication)
  - [Publishing Reports](#publishing-reports)
  - [Publishing Runbooks](#publishing-runbooks)
  - [Updating Pages](#updating-pages)
  - [Listing Reports](#listing-reports)
- [Configuration](#configuration)
- [CI/CD Integration Examples](#cicd-integration-examples)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Jira and Confluence integrations allow you to:

- **Jira**: Automatically create issues for high-risk findings, link findings to existing issues, and track remediation status
- **Confluence**: Publish analysis reports and deployment runbooks to your team's documentation space

Both integrations use Atlassian API tokens for authentication and support both Cloud and Data Center deployments.

---

## Prerequisites

1. **Atlassian API Token**: Create one at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. **Jira/Confluence Access**: Ensure your account has appropriate permissions:
   - Jira: Create issues in target project
   - Confluence: Create/edit pages in target space
3. **deploy-check installed**: `npm install -g @dra/cli`

---

## Jira Integration

### Jira Authentication

Before using Jira commands, authenticate with your Atlassian account:

```bash
deploy-check jira auth
```

You'll be prompted for:
- **Instance URL**: Your Jira domain (e.g., `your-company.atlassian.net`)
- **Email**: Your Atlassian account email
- **API Token**: The token you created in prerequisites

**Example:**
```
$ deploy-check jira auth

Jira Authentication
──────────────────────────────────────────────────

You will need your Jira instance URL and an API token.
Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens

✔ Jira instance URL: your-company.atlassian.net
✔ Your email address: developer@company.com
✔ API token: ****

Validating credentials...

✓ Authentication successful!

Logged in as: John Developer
Email: developer@company.com

Credentials stored at: ~/.config/deploy-check/credentials.json
```

To remove stored credentials:
```bash
deploy-check jira auth --logout
```

### Creating Issues

After running an analysis, create Jira issues for findings:

```bash
# First, run analysis
deploy-check analyze --base main

# Create issues for high and critical findings (default)
deploy-check jira create --project DEPLOY

# Create issues for all severity levels
deploy-check jira create --project DEPLOY --severity low,medium,high,critical

# Preview what would be created without actually creating
deploy-check jira create --project DEPLOY --dry-run
```

**Example Output:**
```
$ deploy-check jira create --project DEPLOY

Creating Jira Issues
──────────────────────────────────────────────────

Project: DEPLOY
Findings to create: 3

✓ Created DEPLOY-456: Breaking API change in /api/users endpoint
✓ Created DEPLOY-457: Destructive migration drops column 'email'
✓ Created DEPLOY-458: Permission change in admin routes

Created 3 issue(s)

Issue links:
  https://your-company.atlassian.net/browse/DEPLOY-456
  https://your-company.atlassian.net/browse/DEPLOY-457
  https://your-company.atlassian.net/browse/DEPLOY-458
```

**Dry Run Example:**
```
$ deploy-check jira create --project DEPLOY --dry-run

Creating Jira Issues
──────────────────────────────────────────────────

Project: DEPLOY
Findings to create: 3

DRY RUN - No issues will be created

• Breaking API change in /api/users endpoint
  Severity: HIGH
  Type: BREAKING_API
  File: src/routes/users.ts

• Destructive migration drops column 'email'
  Severity: CRITICAL
  Type: DESTRUCTIVE_MIGRATION
  File: migrations/20231215_drop_email.sql
```

### Linking Findings

Link a finding to an existing Jira issue:

```bash
deploy-check jira link <finding-id> <issue-key>
```

**Example:**
```
$ deploy-check jira link finding-0 DEPLOY-123

✓ Linked finding-0 to DEPLOY-123
  Issue: Investigate API breaking change
  Status: In Progress
```

Finding IDs are shown in the analysis output and can be found in the JSON report.

### Checking Status

View the status of all linked Jira issues:

```bash
deploy-check jira status
```

**Example Output:**
```
$ deploy-check jira status

Linked Jira Issues
──────────────────────────────────────────────────

DEPLOY-456
  Summary: [Deploy Risk] Breaking API change in /api/users endpoint
  Status: In Progress
  Assignee: Jane Developer
  Updated: 12/15/2024, 2:30:00 PM
  Link: https://your-company.atlassian.net/browse/DEPLOY-456

DEPLOY-457
  Summary: [Deploy Risk] Destructive migration drops column 'email'
  Status: Done
  Assignee: John DBA
  Updated: 12/15/2024, 4:15:00 PM
  Link: https://your-company.atlassian.net/browse/DEPLOY-457
```

---

## Confluence Integration

### Confluence Authentication

Authenticate with Confluence (can use the same API token as Jira):

```bash
deploy-check confluence auth
```

**Example:**
```
$ deploy-check confluence auth

Confluence Authentication
──────────────────────────────────────────────────

You will need your Confluence instance URL and an API token.
Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens

✔ Confluence instance URL: your-company.atlassian.net
✔ Your email address: developer@company.com
✔ API token: ****

Validating credentials...

✓ Authentication successful!

Logged in as: John Developer

Credentials stored at: ~/.config/deploy-check/credentials.json
```

To remove stored credentials:
```bash
deploy-check confluence auth --logout
```

### Publishing Reports

Publish a full analysis report to Confluence:

```bash
# First, run analysis
deploy-check analyze --base main

# Publish to a space
deploy-check confluence publish --space DEVOPS

# Publish with custom title
deploy-check confluence publish --space DEVOPS --title "Release 2.5.0 Risk Analysis"

# Publish under a parent page
deploy-check confluence publish --space DEVOPS --parent 123456789
```

**Example Output:**
```
$ deploy-check confluence publish --space DEVOPS --title "Sprint 42 Deployment Analysis"

Publishing to Confluence
──────────────────────────────────────────────────

Space: DevOps Documentation (DEVOPS)
Title: Sprint 42 Deployment Analysis

✓ Page created successfully!

Page ID: 987654321
URL: https://your-company.atlassian.net/wiki/spaces/DEVOPS/pages/987654321
```

### Publishing Runbooks

Publish a deployment runbook with collapsible checklists:

```bash
deploy-check confluence publish --space DEVOPS --runbook
```

The runbook includes:
- Pre-deploy checklist (expanded based on findings)
- Deploy steps (customized for migrations, etc.)
- Post-deploy verification
- Rollback plan with warnings for destructive changes

**Example:**
```
$ deploy-check confluence publish --space DEVOPS --runbook --title "Release 2.5.0 Runbook"

Publishing to Confluence
──────────────────────────────────────────────────

Space: DevOps Documentation (DEVOPS)
Title: Release 2.5.0 Runbook

✓ Page created successfully!

Page ID: 987654322
URL: https://your-company.atlassian.net/wiki/spaces/DEVOPS/pages/987654322
```

### Updating Pages

Update an existing page instead of creating a new one:

```bash
# Replace page content
deploy-check confluence publish --space DEVOPS --update 987654321

# Append to existing content (adds horizontal rule separator)
deploy-check confluence publish --space DEVOPS --update 987654321 --append
```

**Example:**
```
$ deploy-check confluence publish --space DEVOPS --update 987654321 --title "Updated Risk Analysis"

Publishing to Confluence
──────────────────────────────────────────────────

Space: DevOps Documentation (DEVOPS)
Title: Updated Risk Analysis

✓ Page updated successfully!

Page ID: 987654321
URL: https://your-company.atlassian.net/wiki/spaces/DEVOPS/pages/987654321
```

### Listing Reports

List previously published reports in a space:

```bash
deploy-check confluence list --space DEVOPS

# Limit results
deploy-check confluence list --space DEVOPS --limit 5
```

**Example Output:**
```
$ deploy-check confluence list --space DEVOPS

Published Reports
──────────────────────────────────────────────────

Space: DevOps Documentation (DEVOPS)

Found 3 report(s):

Deploy Risk Report - 12/15/2024
  ID: 987654321
  Updated: 12/15/2024, 3:00:00 PM
  Version: 2
  URL: https://your-company.atlassian.net/wiki/spaces/DEVOPS/pages/987654321

Deployment Runbook - 12/14/2024
  ID: 987654320
  Updated: 12/14/2024, 5:30:00 PM
  Version: 1
  URL: https://your-company.atlassian.net/wiki/spaces/DEVOPS/pages/987654320

Deploy Risk Report - 12/13/2024
  ID: 987654319
  Updated: 12/13/2024, 2:15:00 PM
  Version: 1
  URL: https://your-company.atlassian.net/wiki/spaces/DEVOPS/pages/987654319
```

---

## Configuration

Add Jira and Confluence settings to your `.deploy-check.json`:

```json
{
  "coverageThreshold": 40,
  "failOn": "high",
  "jira": {
    "instanceUrl": "https://your-company.atlassian.net",
    "projectKey": "DEPLOY",
    "autoCreateSeverity": "high"
  },
  "confluence": {
    "instanceUrl": "https://your-company.atlassian.net",
    "spaceKey": "DEVOPS",
    "parentPageId": "123456789"
  }
}
```

With this configuration, you can simplify commands:

```bash
# Uses configured project key
deploy-check jira create

# Uses configured space key and parent page
deploy-check confluence publish
```

---

## CI/CD Integration Examples

### GitHub Actions with Jira Issue Creation

```yaml
name: Deploy Risk Analysis with Jira

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install deploy-check
        run: npm install -g @dra/cli

      - name: Run analysis
        run: deploy-check analyze --base ${{ github.event.pull_request.base.sha }} --json > analysis.json

      - name: Create Jira issues for critical findings
        env:
          JIRA_INSTANCE_URL: ${{ secrets.JIRA_INSTANCE_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
        run: |
          # Store credentials (in CI, use environment-based auth)
          mkdir -p ~/.config/deploy-check
          echo '{
            "jira": {
              "instanceUrl": "'$JIRA_INSTANCE_URL'",
              "email": "'$JIRA_EMAIL'",
              "apiToken": "'$JIRA_API_TOKEN'"
            }
          }' > ~/.config/deploy-check/credentials.json
          
          # Create issues for critical findings only
          deploy-check jira create --project DEPLOY --severity critical
```

### GitLab CI with Confluence Publishing

```yaml
stages:
  - analyze
  - publish

variables:
  CONFLUENCE_SPACE: "DEVOPS"

deploy-check:
  image: node:18
  stage: analyze
  before_script:
    - npm install -g @dra/cli
  script:
    - git fetch origin $CI_MERGE_REQUEST_TARGET_BRANCH_NAME --depth=100
    - deploy-check analyze --base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME --json > analysis.json
  artifacts:
    paths:
      - analysis.json
    expire_in: 1 week
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

publish-report:
  image: node:18
  stage: publish
  before_script:
    - npm install -g @dra/cli
    - mkdir -p ~/.config/deploy-check
    - |
      echo '{
        "confluence": {
          "instanceUrl": "'$CONFLUENCE_INSTANCE_URL'",
          "email": "'$CONFLUENCE_EMAIL'",
          "apiToken": "'$CONFLUENCE_API_TOKEN'"
        }
      }' > ~/.config/deploy-check/credentials.json
  script:
    - |
      deploy-check confluence publish \
        --space $CONFLUENCE_SPACE \
        --title "MR !$CI_MERGE_REQUEST_IID - Risk Analysis"
  needs:
    - deploy-check
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: manual
```

### Complete Workflow: Analyze, Create Issues, Publish

```bash
#!/bin/bash
# deploy-risk-workflow.sh

set -e

echo "=== Running Deployment Risk Analysis ==="
deploy-check analyze --base main --json > analysis.json

RISK_LEVEL=$(jq -r '.riskLevel' analysis.json)
echo "Risk Level: $RISK_LEVEL"

if [ "$RISK_LEVEL" = "critical" ] || [ "$RISK_LEVEL" = "high" ]; then
  echo ""
  echo "=== Creating Jira Issues for High-Risk Findings ==="
  deploy-check jira create --project DEPLOY --severity high,critical
  
  echo ""
  echo "=== Publishing Runbook to Confluence ==="
  deploy-check confluence publish --space DEVOPS --runbook \
    --title "$(date +%Y-%m-%d) High-Risk Deployment Runbook"
fi

echo ""
echo "=== Publishing Full Report to Confluence ==="
deploy-check confluence publish --space DEVOPS \
  --title "$(date +%Y-%m-%d) Deployment Risk Report"

echo ""
echo "=== Workflow Complete ==="
```

---

## Troubleshooting

### Authentication Issues

**"Authentication failed: 401 Unauthorized"**
- Verify your API token is correct and not expired
- Ensure you're using the email associated with your Atlassian account
- Check that the instance URL is correct (no trailing slash)

**"Not authenticated. Run `deploy-check jira auth` first."**
- Run the auth command to store credentials
- Credentials are stored in `~/.config/deploy-check/credentials.json`

### Jira Issues

**"Project key required"**
- Specify `--project KEY` or add `jira.projectKey` to config

**"Issue type 'Task' not found"**
- Your Jira project may use different issue types
- Contact your Jira admin to verify available issue types

**"Permission denied creating issue"**
- Verify your account has "Create Issues" permission in the project
- Check project permissions with your Jira admin

### Confluence Issues

**"Space not found or not accessible"**
- Verify the space key is correct (case-sensitive)
- Ensure your account has access to the space

**"Failed to create page: Title already exists"**
- Use `--update <page-id>` to update existing page
- Or use a unique title with `--title`

**"Parent page not found"**
- Verify the parent page ID is correct
- Ensure the parent page is in the same space

### No Analysis Results

**"No analysis results found. Run `deploy-check analyze` first."**
- Run `deploy-check analyze` before Jira/Confluence commands
- Analysis results are cached in `.deploy-check-cache.json`

### Debug Mode

Enable verbose output for troubleshooting:

```bash
deploy-check analyze --verbose
deploy-check jira create --project DEPLOY --dry-run
```

---

## Quick Reference

### Jira Commands

```bash
# Authenticate
deploy-check jira auth
deploy-check jira auth --logout

# Create issues
deploy-check jira create --project KEY
deploy-check jira create --project KEY --severity high,critical
deploy-check jira create --project KEY --dry-run

# Link findings
deploy-check jira link finding-0 PROJ-123

# Check status
deploy-check jira status
```

### Confluence Commands

```bash
# Authenticate
deploy-check confluence auth
deploy-check confluence auth --logout

# Publish report
deploy-check confluence publish --space KEY
deploy-check confluence publish --space KEY --title "Custom Title"
deploy-check confluence publish --space KEY --parent 123456

# Publish runbook
deploy-check confluence publish --space KEY --runbook

# Update existing page
deploy-check confluence publish --space KEY --update 123456
deploy-check confluence publish --space KEY --update 123456 --append

# List reports
deploy-check confluence list --space KEY
deploy-check confluence list --space KEY --limit 5
```

### Configuration Options

| Setting | Description | Example |
|---------|-------------|---------|
| `jira.instanceUrl` | Jira instance URL | `https://company.atlassian.net` |
| `jira.projectKey` | Default project for issues | `DEPLOY` |
| `jira.autoCreateSeverity` | Auto-create threshold | `high` |
| `confluence.instanceUrl` | Confluence instance URL | `https://company.atlassian.net` |
| `confluence.spaceKey` | Default space for publishing | `DEVOPS` |
| `confluence.parentPageId` | Parent page for nesting | `123456789` |
