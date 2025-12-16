# Jira Integration Guide

This guide shows you how to create and track Jira issues for deployment risks directly from the CLI.

## What You Can Do

- **Create Issues Automatically** - Turn deployment risk findings into Jira issues with one command
- **Link to Existing Issues** - Connect findings to issues you've already created
- **Track Issue Status** - See the status of all linked issues without leaving your terminal
- **Filter by Severity** - Only create issues for high/critical risks, or include everything

## Prerequisites

1. An Atlassian Cloud account
2. A Jira project where you want to create issues
3. An API token (we'll create this below)

## Quick Start

### Step 1: Create an API Token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a name like "deploy-check-cli"
4. Copy the token (you won't see it again!)

### Step 2: Authenticate

```bash
deploy-check jira auth
```

You'll be prompted for:
- **Instance URL**: Your Atlassian site (e.g., `your-company.atlassian.net`)
- **Email**: Your Atlassian account email
- **API Token**: The token you just created

### Step 3: Find Your Project Key

The project key is a short identifier for your Jira project. Find it in:
- The URL when viewing the project: `https://your-company.atlassian.net/browse/PROJ-123` → `PROJ`
- Project settings page
- The prefix on all issue keys (e.g., `DEPLOY-123` means project key is `DEPLOY`)

### Step 4: Run Analysis & Create Issues

```bash
# First, run the analysis
deploy-check analyze

# Then create Jira issues for high/critical findings
deploy-check jira create --project DEPLOY
```

That's it! Issues will be created in your Jira project with all the finding details.

## All Commands

### Authentication

```bash
# Login to Jira
deploy-check jira auth

# Logout (remove stored credentials)
deploy-check jira auth --logout
```

### Creating Issues

```bash
# Create issues for high and critical findings (default)
deploy-check jira create --project DEPLOY

# Create issues for all severity levels
deploy-check jira create --project DEPLOY --severity low,medium,high,critical

# Create only for critical findings
deploy-check jira create --project DEPLOY --severity critical

# Preview what would be created (no actual issues created)
deploy-check jira create --project DEPLOY --dry-run
```

### Linking to Existing Issues

If you already have a Jira issue for a finding, you can link them:

```bash
# Link a finding to an existing issue
deploy-check jira link finding-0 DEPLOY-123
```

The finding ID (like `finding-0`) is shown in the analysis output.

### Checking Issue Status

```bash
# See status of all linked issues
deploy-check jira status
```

This shows:
- Issue key and summary
- Current status (To Do, In Progress, Done, etc.)
- Assignee
- Last updated time
- Direct link to the issue

## What Gets Created

When you run `deploy-check jira create`, each finding becomes a Jira issue with:

- **Summary**: `[Deploy Risk] <finding title>`
- **Description**: Full details including:
  - Finding description
  - Severity level
  - Finding type (API change, SQL migration, etc.)
  - File path and line numbers
- **Labels**: `deploy-risk` + severity level (e.g., `critical`, `high`)
- **Issue Type**: Task (default)

## Example Workflow

Here's a typical workflow for a release:

```bash
# 1. Analyze your changes
deploy-check analyze --base main

# 2. Review findings in terminal
# (decide which need tracking)

# 3. Preview what issues would be created
deploy-check jira create --project DEPLOY --dry-run

# 4. Create the issues
deploy-check jira create --project DEPLOY

# 5. Later, check on issue progress
deploy-check jira status
```

## CI/CD Integration

You can automate issue creation in your CI pipeline:

```yaml
# GitHub Actions example
- name: Analyze and Create Issues
  env:
    JIRA_INSTANCE: ${{ secrets.JIRA_INSTANCE }}
    JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
    JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
  run: |
    deploy-check analyze
    deploy-check jira create --project DEPLOY --severity critical
```

## Configuration File

You can set defaults in `.deploy-check.json`:

```json
{
  "jira": {
    "instanceUrl": "https://your-company.atlassian.net",
    "projectKey": "DEPLOY",
    "autoCreateSeverity": "critical"
  }
}
```

With this config, you can just run:
```bash
deploy-check jira create
```

## Severity Levels

| Level | When to Create Issues |
|-------|----------------------|
| `critical` | Always - these block deployment |
| `high` | Usually - significant risks |
| `medium` | Sometimes - depends on team policy |
| `low` | Rarely - informational only |

Default is `high,critical` which catches the most important risks.

## Troubleshooting

### "Not authenticated"

Run `deploy-check jira auth` to login again.

### "No analysis results found"

Run `deploy-check analyze` before trying to create issues.

### "Project key required"

Either:
- Use `--project YOUR_KEY` flag
- Set `jira.projectKey` in your config file

### "Failed to create issue"

Common causes:
- Project key doesn't exist
- You don't have permission to create issues in that project
- Issue type "Task" doesn't exist (some projects use different types)

### "Could not verify issue" when linking

The issue might exist but you don't have permission to view it. The link is still saved locally.

## Tips

1. **Use dry-run first** - Preview with `--dry-run` before creating issues
2. **Set up config** - Add project key to config file so you don't have to type it every time
3. **Filter by severity** - Don't create issues for every finding, focus on what matters
4. **Check status regularly** - Use `jira status` to track progress without leaving terminal
5. **Link existing issues** - If someone already created an issue, link it instead of duplicating

## Forge App Integration

The Forge app provides additional Jira features:
- **Issue Panel** - See deployment risks directly on Jira issues
- **Risk Badges** - Visual indicators on Jira boards
- **Rovo Agent** - Ask the AI to create issues conversationally

See [Forge Deployment Guide](../../../apps/forge/DEPLOYMENT.md) for setup.

## Need Help?

- Check the main [README](../../../README.md) for general CLI usage
- See [Confluence Guide](./CONFLUENCE_GUIDE.md) for publishing reports
- See [CI Integration Guide](./CI_INTEGRATION_GUIDE.md) for pipeline setup
