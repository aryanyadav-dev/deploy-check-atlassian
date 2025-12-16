# Confluence Integration Guide

This guide shows you how to publish deployment risk reports directly to Confluence from the CLI.

## What You Can Do

- **Publish Risk Reports** - Automatically create Confluence pages with your deployment risk analysis
- **Generate Runbooks** - Create deployment checklists with pre-deploy, deploy, and rollback steps
- **Update Existing Pages** - Keep your documentation up-to-date by updating existing reports
- **List Published Reports** - See all your previously published risk reports in a space

## Prerequisites

1. An Atlassian Cloud account
2. A Confluence space where you want to publish reports
3. An API token (we'll create this below)

## Quick Start

### Step 1: Create an API Token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a name like "deploy-check-cli"
4. Copy the token (you won't see it again!)

### Step 2: Authenticate

```bash
deploy-check confluence auth
```

You'll be prompted for:
- **Instance URL**: Your Atlassian site (e.g., `your-company.atlassian.net`)
- **Email**: Your Atlassian account email
- **API Token**: The token you just created

### Step 3: Find Your Space Key

The space key is a short identifier for your Confluence space. Find it in the URL:

```
https://your-company.atlassian.net/wiki/spaces/DEVOPS/...
                                            ^^^^^^
                                            This is your space key
```

Common examples: `DEV`, `DEVOPS`, `TEAM`, `ENG`

### Step 4: Run Analysis & Publish

```bash
# First, run the analysis
deploy-check analyze

# Then publish to Confluence
deploy-check confluence publish --space DEVOPS
```

That's it! A new page will be created in your Confluence space with the full risk report.

## All Commands

### Authentication

```bash
# Login to Confluence
deploy-check confluence auth

# Logout (remove stored credentials)
deploy-check confluence auth --logout
```

### Publishing Reports

```bash
# Basic publish - creates a new page
deploy-check confluence publish --space DEVOPS

# Custom page title
deploy-check confluence publish --space DEVOPS --title "Release 2.0 Risk Report"

# Publish under a parent page
deploy-check confluence publish --space DEVOPS --parent 123456

# Publish a deployment runbook instead of full report
deploy-check confluence publish --space DEVOPS --runbook

# Update an existing page
deploy-check confluence publish --space DEVOPS --update 789012

# Append to an existing page (adds new content below existing)
deploy-check confluence publish --space DEVOPS --update 789012 --append
```

### Listing Reports

```bash
# List all deploy-check reports in a space
deploy-check confluence list --space DEVOPS

# Limit results
deploy-check confluence list --space DEVOPS --limit 5
```

## What Gets Published

### Risk Report (Default)

When you run `deploy-check confluence publish`, it creates a page with:

- **Risk Score** - Overall deployment risk level (LOW/MEDIUM/HIGH/CRITICAL)
- **Findings Summary** - Count of issues by severity
- **Detailed Findings** - Each risk with:
  - Type (SQL Migration, API Change, Permission Change, etc.)
  - Severity level
  - File location and line numbers
  - Description of the issue
  - Recommended fix

### Deployment Runbook

When you add `--runbook`, it creates a page with collapsible sections:

- **Pre-Deploy Checklist** - Things to verify before deploying
- **Deploy Steps** - Step-by-step deployment instructions
- **Post-Deploy Verification** - What to check after deployment
- **Rollback Plan** - How to revert if something goes wrong

The runbook automatically adapts based on your findings:
- Destructive migrations? Adds database backup steps
- Breaking API changes? Adds consumer notification steps
- Permission changes? Adds security review steps

## Example Workflow

Here's a typical workflow for a release:

```bash
# 1. Analyze your changes
deploy-check analyze --base main

# 2. Review findings in terminal
# (fix any critical issues)

# 3. Publish report for team review
deploy-check confluence publish --space DEVOPS --title "v2.1.0 Release Risk Report"

# 4. Generate runbook for deployment day
deploy-check confluence publish --space DEVOPS --runbook --title "v2.1.0 Deployment Runbook"
```

## CI/CD Integration

You can automate publishing in your CI pipeline:

```yaml
# GitHub Actions example
- name: Analyze and Publish
  env:
    CONFLUENCE_INSTANCE: ${{ secrets.CONFLUENCE_INSTANCE }}
    CONFLUENCE_EMAIL: ${{ secrets.CONFLUENCE_EMAIL }}
    CONFLUENCE_TOKEN: ${{ secrets.CONFLUENCE_TOKEN }}
  run: |
    deploy-check analyze
    deploy-check confluence publish --space DEVOPS
```

## Configuration File

You can set defaults in `.deploy-check.json`:

```json
{
  "confluence": {
    "instanceUrl": "https://your-company.atlassian.net",
    "spaceKey": "DEVOPS",
    "parentPageId": "123456"
  }
}
```

## Troubleshooting

### "Space not found or not accessible"

- Make sure you're using just the space key, not the full URL
- Check that your API token has access to that space
- Personal spaces start with `~` (e.g., `~712020...`)

### "Not authenticated"

Run `deploy-check confluence auth` to login again.

### "No analysis results found"

Run `deploy-check analyze` before trying to publish.

### "Permission denied"

Your API token might not have write access. Create a new token or check your Confluence permissions.

## Tips

1. **Create a dedicated space** - Consider creating a "DevOps" or "Releases" space for all your reports
2. **Use parent pages** - Organize reports under a parent page like "Risk Reports" or by release version
3. **Automate in CI** - Publish reports automatically on PR merge or before releases
4. **Update, don't duplicate** - Use `--update` to keep a single page current instead of creating many pages

## Need Help?

- Check the main [README](../../../README.md) for general CLI usage
- See [CI Integration Guide](./CI_INTEGRATION_GUIDE.md) for pipeline setup
- See [Jira & Confluence Guide](./JIRA_CONFLUENCE_GUIDE.md) for Jira integration
