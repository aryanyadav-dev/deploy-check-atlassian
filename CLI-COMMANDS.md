# CLI Commands Reference

Comprehensive documentation for all `deploy-check` CLI commands.

## Table of Contents

- [Global Options](#global-options)
- [Commands Overview](#commands-overview)
- [analyze](#analyze)
- [config](#config)
- [report](#report)
- [runbook](#runbook)
- [jira](#jira)
- [confluence](#confluence)
- [bitbucket](#bitbucket)

---

## Global Options

These options are available for all commands.

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--verbose` | - | Enable verbose output | `false` |
| `--json` | - | Output results as JSON | `false` |
| `--config <path>` | - | Path to configuration file | `.deploy-check.json` |
| `--version` | `-v` | Display version number | - |
| `--help` | `-h` | Display help information | - |

---

## Commands Overview

| Command | Description |
|---------|-------------|
| `analyze` | Analyze code changes for deployment risks |
| `config` | Manage deploy-check configuration |
| `report` | Generate deployment risk reports |
| `runbook` | Generate deployment runbook |
| `jira` | Jira integration commands |
| `confluence` | Confluence integration commands |
| `bitbucket` | Bitbucket integration commands |

---

## analyze

Analyze code changes for deployment risks.

### Synopsis

```bash
deploy-check analyze [options]
```

### Description

The `analyze` command compares code between two git references and identifies potential deployment risks. It runs multiple analyzers to detect issues like breaking API changes, destructive database migrations, permission changes, and more.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--base <ref>` | Base reference to compare against | `main`/`master` |
| `--head <ref>` | Head reference to analyze | `HEAD` |
| `--staged` | Analyze only staged changes | `false` |
| `--files <glob>` | Glob pattern to limit analysis scope | - |
| `--coverage <path>` | Path to lcov coverage report | - |
| `--openapi <path>` | Path to OpenAPI specification file | - |
| `--output <file>` | Output file path for markdown report | - |
| `--fail-on <level>` | Severity level that causes non-zero exit | `high` |

### fail-on Levels

- `low` - Exit with error on any finding
- `medium` - Exit with error on medium, high, or critical
- `high` - Exit with error on high or critical (default)
- `critical` - Exit with error only on critical findings

### Examples

```bash
# Analyze changes between main and current branch
deploy-check analyze --base main

# Analyze staged changes only (for pre-commit hooks)
deploy-check analyze --staged

# Analyze with coverage report
deploy-check analyze --coverage ./coverage/lcov.info

# Generate markdown report
deploy-check analyze --output risk-report.md

# Fail on medium severity or higher
deploy-check analyze --fail-on medium

# Analyze specific files
deploy-check analyze --files "src/**/*.ts"

# JSON output for scripting
deploy-check analyze --json
```

### Exit Codes

- `0` - Success, no findings above fail-on threshold
- `1` - Analysis error
- `2` - Low severity findings (with `--fail-on low`)
- `3` - Medium severity findings (with `--fail-on low` or `--fail-on medium`)
- `4` - High severity findings (with `--fail-on low`, `--fail-on medium`, or `--fail-on high`)
- `5` - Critical severity findings

---

## config

Manage deploy-check configuration.

### Synopsis

```bash
deploy-check config <subcommand> [options]
```

### Subcommands

### config init

Initialize a new configuration file.

```bash
deploy-check config init [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--force` | Overwrite existing configuration file |
| `--non-interactive` | Use default values without prompts |

#### Examples

```bash
# Interactive initialization
deploy-check config init

# Non-interactive with defaults
deploy-check config init --non-interactive

# Overwrite existing config
deploy-check config init --force
```

### config show

Display current effective configuration.

```bash
deploy-check config show
```

#### Examples

```bash
# Show configuration
deploy-check config show

# Show with verbose JSON output
deploy-check config show --verbose

# Use custom config file
deploy-check config show --config /path/to/config.json
```

---

## report

Generate deployment risk reports in various formats.

### Synopsis

```bash
deploy-check report [options]
```

### Description

Runs analysis and generates a formatted report. Unlike `analyze` which displays results in the terminal, `report` saves the output to a file.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output <file>` | Output file path for the report | stdout |
| `--format <format>` | Report format: `markdown`, `json`, `html` | `markdown` |
| `--base <ref>` | Base reference to compare against | config value |
| `--head <ref>` | Head reference to analyze | `HEAD` |
| `--title <title>` | Custom report title | auto-generated |
| `--include-runbook` | Include deployment runbook in report | `true` |

### Examples

```bash
# Generate markdown report
deploy-check report --output report.md

# Generate JSON report
deploy-check report --output report.json --format json

# Generate HTML report
deploy-check report --output report.html --format html

# Custom title
deploy-check report --output report.md --title "My Deployment Report"
```

---

## runbook

Generate deployment runbook for current changes.

### Synopsis

```bash
deploy-check runbook [options]
```

### Description

Generates a step-by-step deployment runbook based on the analysis of code changes. The runbook includes pre-deploy checks, deploy steps, post-deploy verification, and rollback plan.

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output <file>` | Output file path for the runbook | stdout |
| `--base <ref>` | Base reference to compare against | config value |
| `--head <ref>` | Head reference to analyze | `HEAD` |
| `--template <path>` | Path to custom runbook template | - |
| `--include-migrations` | Include migration commands in runbook | `false` |
| `--feature-flags` | Include feature flag toggle steps | `false` |

### Template Placeholders

When using a custom template, you can use these placeholders:

- `{{prTitle}}` - Pull request title
- `{{riskLevel}}` - Risk level (LOW, MEDIUM, HIGH, CRITICAL)
- `{{riskScore}}` - Numeric risk score
- `{{preDeploy}}` - Pre-deploy checklist items
- `{{deploy}}` - Deploy steps
- `{{postDeploy}}` - Post-deploy verification items
- `{{rollback}}` - Rollback plan steps

### Examples

```bash
# Generate runbook to file
deploy-check runbook --output runbook.md

# Include migration commands
deploy-check runbook --include-migrations

# Include feature flag steps
deploy-check runbook --feature-flags

# Use custom template
deploy-check runbook --template ./templates/runbook.md

# JSON output for automation
deploy-check runbook --json
```

---

## jira

Jira integration commands.

### Synopsis

```bash
deploy-check jira <subcommand> [options]
```

### Subcommands

### jira auth

Authenticate with Jira.

```bash
deploy-check jira auth [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--logout` | Remove stored Jira credentials |

#### Examples

```bash
# Authenticate with Jira
deploy-check jira auth

# Logout
deploy-check jira auth --logout
```

### jira create

Create Jira issues for findings.

```bash
deploy-check jira create [options]
```

#### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--severity <levels>` | `-s` | Severity levels to include (comma-separated) | `high,critical` |
| `--project <key>` | `-p` | Jira project key | config value |
| `--dry-run` | - | Show what would be created without creating | `false` |

#### Examples

```bash
# Create issues for high and critical findings
deploy-check jira create

# Create for all severity levels
deploy-check jira create --severity low,medium,high,critical

# Specify project
deploy-check jira create --project MYPROJ

# Preview without creating
deploy-check jira create --dry-run
```

### jira link

Link a finding to an existing Jira issue.

```bash
deploy-check jira link <finding-id> <issue-key>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `finding-id` | Finding ID (e.g., `finding-0`) |
| `issue-key` | Jira issue key (e.g., `PROJ-123`) |

#### Examples

```bash
# Link finding to issue
deploy-check jira link finding-0 PROJ-123
```

### jira status

Show status of linked Jira issues.

```bash
deploy-check jira status
```

#### Examples

```bash
# View linked issue status
deploy-check jira status
```

### jira board

View and manage Jira boards.

```bash
deploy-check jira board [options]
```

#### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--list` | `-l` | List all accessible boards |
| `--name <name>` | `-n` | View specific board by name |
| `--id <id>` | `-i` | View specific board by ID |
| `--issues` | - | Show issues on the board |
| `--columns` | - | Show board column statistics |
| `--project <key>` | `-p` | Filter boards by project key |
| `--debug` | - | Show debug information |

#### Examples

```bash
# List all boards
deploy-check jira board --list

# List boards for a project
deploy-check jira board --list --project MYPROJ

# View specific board with issues
deploy-check jira board --name "My Board" --issues

# View board columns
deploy-check jira board --id 123 --columns
```

---

## confluence

Confluence integration commands.

### Synopsis

```bash
deploy-check confluence <subcommand> [options]
```

### Subcommands

### confluence auth

Authenticate with Confluence.

```bash
deploy-check confluence auth [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--logout` | Remove stored Confluence credentials |

#### Examples

```bash
# Authenticate with Confluence
deploy-check confluence auth

# Logout
deploy-check confluence auth --logout
```

### confluence publish

Publish analysis report to Confluence.

```bash
deploy-check confluence publish -s <space> [options]
```

#### Required Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--space <key>` | `-s` | Confluence space key |

#### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--parent <page-id>` | `-p` | Parent page ID to nest under |
| `--title <title>` | `-t` | Page title |
| `--runbook` | - | Publish runbook instead of full report |
| `--update <page-id>` | - | Update existing page instead of creating new |
| `--append` | - | Append to existing page content (with `--update`) |

#### Examples

```bash
# Publish report to Confluence
deploy-check confluence publish -s DEPLOY

# Publish with custom title
deploy-check confluence publish -s DEPLOY --title "Weekly Report"

# Publish runbook
deploy-check confluence publish -s DEPLOY --runbook

# Update existing page
deploy-check confluence publish -s DEPLOY --update 123456

# Append to existing page
deploy-check confluence publish -s DEPLOY --update 123456 --append
```

### confluence list

List previously published reports in a space.

```bash
deploy-check confluence list -s <space> [options]
```

#### Required Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--space <key>` | `-s` | Confluence space key |

#### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--title <pattern>` | `-t` | Filter pages by title pattern |
| `--all` | `-a` | List all pages without filtering |
| `--limit <number>` | `-l` | Maximum number of pages to list |

#### Examples

```bash
# List deploy-check reports
deploy-check confluence list -s DEPLOY

# List all pages in space
deploy-check confluence list -s DEPLOY --all

# Filter by title
deploy-check confluence list -s DEPLOY --title "Weekly"
```

---

## bitbucket

Bitbucket integration commands.

### Synopsis

```bash
deploy-check bitbucket <subcommand> [options]
```

### Subcommands

### bitbucket auth

Authenticate with Bitbucket.

```bash
deploy-check bitbucket auth [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--logout` | Remove stored Bitbucket credentials |

#### Examples

```bash
# Authenticate with Bitbucket
deploy-check bitbucket auth

# Logout
deploy-check bitbucket auth --logout
```

### bitbucket repo

Repository operations.

```bash
deploy-check bitbucket repo <subcommand> [options]
```

#### bitbucket repo list

List repositories in workspace.

```bash
deploy-check bitbucket repo list [options]
```

#### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--page <number>` | `-p` | Page number | `1` |
| `--limit <number>` | `-l` | Results per page | `10` |

#### Examples

```bash
# List repositories
deploy-check bitbucket repo list

# Paginate
deploy-check bitbucket repo list --page 2 --limit 20
```

#### bitbucket repo branches

List branches in a repository.

```bash
deploy-check bitbucket repo branches <repo> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--page <number>` | `-p` | Page number | `1` |
| `--limit <number>` | `-l` | Results per page | `10` |

#### Examples

```bash
# List branches
deploy-check bitbucket repo branches my-repo
```

#### bitbucket repo commits

List commits in a repository.

```bash
deploy-check bitbucket repo commits <repo> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--branch <name>` | `-b` | Branch name | - |
| `--page <number>` | `-p` | Page number | `1` |
| `--limit <number>` | `-l` | Results per page | `10` |

#### Examples

```bash
# List commits on main branch
deploy-check bitbucket repo commits my-repo --branch main
```

### bitbucket pr

Pull request operations.

```bash
deploy-check bitbucket pr <subcommand> [options]
```

#### bitbucket pr list

List pull requests.

```bash
deploy-check bitbucket pr list <repo> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--state <state>` | `-s` | Filter by state (OPEN, MERGED, DECLINED) | `OPEN` |
| `--page <number>` | `-p` | Page number | `1` |
| `--limit <number>` | `-l` | Results per page | `10` |

#### Examples

```bash
# List open PRs
deploy-check bitbucket pr list my-repo

# List merged PRs
deploy-check bitbucket pr list my-repo --state MERGED
```

#### bitbucket pr view

View pull request details.

```bash
deploy-check bitbucket pr view <repo> <id>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |
| `id` | Pull request ID |

#### Examples

```bash
# View PR details
deploy-check bitbucket pr view my-repo 123
```

#### bitbucket pr create

Create a pull request.

```bash
deploy-check bitbucket pr create <repo>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Examples

```bash
# Create PR (interactive)
deploy-check bitbucket pr create my-repo
```

#### bitbucket pr approve

Approve a pull request.

```bash
deploy-check bitbucket pr approve <repo> <id>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |
| `id` | Pull request ID |

#### Examples

```bash
# Approve PR
deploy-check bitbucket pr approve my-repo 123
```

#### bitbucket pr merge

Merge a pull request.

```bash
deploy-check bitbucket pr merge <repo> <id> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |
| `id` | Pull request ID |

#### Options

| Option | Description |
|--------|-------------|
| `--close-branch` | Close source branch after merge |

#### Examples

```bash
# Merge PR
deploy-check bitbucket pr merge my-repo 123

# Merge and close branch
deploy-check bitbucket pr merge my-repo 123 --close-branch
```

### bitbucket pipeline

Pipeline operations.

```bash
deploy-check bitbucket pipeline <subcommand> [options]
```

#### bitbucket pipeline list

List pipelines.

```bash
deploy-check bitbucket pipeline list <repo> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--page <number>` | `-p` | Page number | `1` |
| `--limit <number>` | `-l` | Results per page | `10` |

#### Examples

```bash
# List pipelines
deploy-check bitbucket pipeline list my-repo
```

#### bitbucket pipeline view

View pipeline details.

```bash
deploy-check bitbucket pipeline view <repo> <uuid>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |
| `uuid` | Pipeline UUID |

#### Examples

```bash
# View pipeline
deploy-check bitbucket pipeline view my-repo 12345678-1234-1234-1234-123456789012
```

#### bitbucket pipeline trigger

Trigger a pipeline.

```bash
deploy-check bitbucket pipeline trigger <repo>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Examples

```bash
# Trigger pipeline (interactive)
deploy-check bitbucket pipeline trigger my-repo
```

### bitbucket issue

Issue operations.

```bash
deploy-check bitbucket issue <subcommand> [options]
```

#### bitbucket issue list

List issues.

```bash
deploy-check bitbucket issue list <repo> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--state <state>` | `-s` | Filter by state |
| `--kind <kind>` | `-k` | Filter by kind (bug, enhancement, task) |
| `--page <number>` | `-p` | Page number |
| `--limit <number>` | `-l` | Results per page |

#### Examples

```bash
# List open issues
deploy-check bitbucket issue list my-repo

# Filter by kind
deploy-check bitbucket issue list my-repo --kind bug
```

#### bitbucket issue view

View issue details.

```bash
deploy-check bitbucket issue view <repo> <id>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |
| `id` | Issue ID |

#### Examples

```bash
# View issue
deploy-check bitbucket issue view my-repo 123
```

#### bitbucket issue create

Create an issue.

```bash
deploy-check bitbucket issue create <repo>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `repo` | Repository name |

#### Examples

```bash
# Create issue (interactive)
deploy-check bitbucket issue create my-repo
```

---

## Finding Types

The analyzer detects the following types of findings:

| Type | Description | Severity |
|------|-------------|----------|
| `BREAKING_API` | Breaking API change detected | High |
| `DESTRUCTIVE_MIGRATION` | Destructive database migration | Critical |
| `PERMISSION_CHANGE` | Permission/permission change | Medium |
| `LOW_COVERAGE` | Test coverage below threshold | Medium |
| `UNDOCUMENTED_API` | API endpoint without documentation | Low |
| `SQL_MIGRATION` | SQL migration detected | Medium |
| `SECRET_DETECTED` | Potential secret in code | Critical |
| `LARGE_FILE` | Large file that may cause issues | Low |

---

## Risk Levels

| Level | Score Range | Description |
|-------|-------------|-------------|
| `LOW` | 0-25 | Low risk deployment |
| `MEDIUM` | 26-50 | Medium risk, review recommended |
| `HIGH` | 51-75 | High risk, requires careful review |
| `CRITICAL` | 76-100 | Critical risk, requires approval |
