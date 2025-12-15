# deploy-check-cli - Deployment Risk Analyzer

A command-line tool that analyzes code changes for deployment risks, including database migrations, breaking API changes, permission changes, and test coverage gaps. Integrates with Atlassian Jira and Confluence.

[![npm version](https://img.shields.io/npm/v/deploy-check-cli.svg)](https://www.npmjs.com/package/deploy-check-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Exit Codes](#exit-codes)
- [CI/CD Integration](#cicd-integration)
- [Requirements](#requirements)
- [License](#license)

## Installation

### Via npm (global)

```bash
npm install -g deploy-check-cli
```

### Via pnpm

```bash
pnpm add -g deploy-check-cli
```

### Via yarn

```bash
yarn global add deploy-check-cli
```

### Via npx (no installation)

```bash
npx deploy-check-cli analyze
```

### Standalone Binaries

Download pre-built binaries from the [releases page](https://github.com/aryanyadav-dev/deploy-check-atlassian/releases):

| Platform | Architecture | Binary |
|----------|--------------|--------|
| macOS | Intel (x64) | `deploy-check-macos-x64` |
| macOS | Apple Silicon (arm64) | `deploy-check-macos-arm64` |
| Linux | x64 | `deploy-check-linux-x64` |
| Linux | ARM64 | `deploy-check-linux-arm64` |
| Windows | x64 | `deploy-check-win-x64.exe` |

```bash
chmod +x deploy-check-*
sudo mv deploy-check-* /usr/local/bin/deploy-check
```

## Quick Start

```bash
deploy-check analyze                    # Analyze against main branch
deploy-check analyze --base develop     # Analyze against specific branch
deploy-check analyze --json             # Output as JSON
deploy-check runbook                    # Generate deployment runbook
deploy-check config init                # Initialize configuration
deploy-check config show                # Show current configuration
```

## Commands

### Global Options

| Option | Description |
|--------|-------------|
| `--verbose` | Enable verbose output |
| `--json` | Output results as JSON |
| `--config <path>` | Path to configuration file |
| `-v, --version` | Display version number |
| `-h, --help` | Display help |

### `deploy-check analyze`

Analyze code changes for deployment risks.

| Option | Description | Default |
|--------|-------------|---------|
| `--base <ref>` | Base branch/commit to compare against | `main` |
| `--head <ref>` | Head commit to analyze | `HEAD` |
| `--files <glob>` | Limit analysis to specific files | - |
| `--coverage <path>` | Path to lcov coverage report | auto-detect |
| `--openapi <path>` | Path to OpenAPI specification | auto-detect |
| `--json` | Output results as JSON | `false` |
| `--output <file>` | Write markdown report to file | - |
| `--fail-on <level>` | Exit with error on severity level | `high` |

**Examples:**

```bash
deploy-check analyze --base abc123 --head def456   # Specific commits
deploy-check analyze --files "**/*.ts"             # TypeScript only
deploy-check analyze --json > results.json         # JSON output
deploy-check analyze --output report.md            # Markdown report
deploy-check analyze --fail-on medium              # Fail on medium+
```

### `deploy-check runbook`

Generate a deployment runbook.

| Option | Description | Default |
|--------|-------------|---------|
| `--output <file>` | Write runbook to file | stdout |
| `--template <path>` | Custom runbook template | built-in |
| `--include-migrations` | Include migration commands | `false` |
| `--feature-flags` | Include feature flag steps | `false` |

### `deploy-check config`

- `config init` - Create configuration file interactively
- `config show` - Display current configuration

### `deploy-check jira`

Integrate with Atlassian Jira to create and track issues for findings.

- `jira auth` - Authenticate with Jira
- `jira auth --logout` - Remove stored credentials
- `jira create --project <key>` - Create issues for findings
- `jira create --severity high,critical` - Filter by severity
- `jira create --dry-run` - Preview without creating
- `jira link <finding-id> <issue-key>` - Link finding to existing issue
- `jira status` - Check linked issue status

### `deploy-check confluence`

Publish reports and runbooks to Atlassian Confluence.

- `confluence auth` - Authenticate with Confluence
- `confluence auth --logout` - Remove stored credentials
- `confluence publish --space <key>` - Publish report to space
- `confluence publish --runbook` - Publish deployment runbook
- `confluence publish --title "Custom Title"` - Set page title
- `confluence publish --update <page-id>` - Update existing page
- `confluence list --space <key>` - List published reports

## Configuration

Create `.deploy-check.json` or `.deploy-check.yaml` in your project root:

```json
{
  "coverageThreshold": 40,
  "ignoredPaths": ["node_modules/**", "dist/**", "**/*.test.ts"],
  "outputFormat": "terminal",
  "coveragePath": "coverage/lcov.info",
  "openapiPath": "openapi.yaml",
  "baseRef": "main",
  "failOn": "high",
  "jira": {
    "instanceUrl": "https://your-org.atlassian.net",
    "projectKey": "DEPLOY",
    "autoCreateSeverity": "critical"
  },
  "confluence": {
    "instanceUrl": "https://your-org.atlassian.net",
    "spaceKey": "DEVOPS",
    "parentPageId": "123456"
  }
}
```

### Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `coverageThreshold` | number | `40` | Minimum coverage % (0-100) |
| `ignoredPaths` | string[] | `[]` | Glob patterns to ignore |
| `outputFormat` | string | `terminal` | `terminal`, `json`, `markdown` |
| `coveragePath` | string | auto | Path to lcov report |
| `openapiPath` | string | auto | Path to OpenAPI spec |
| `baseRef` | string | `main` | Default base reference |
| `failOn` | string | `high` | Severity for non-zero exit |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No findings or all LOW severity |
| `1` | MEDIUM severity findings |
| `2` | HIGH or CRITICAL findings |

## CI/CD Integration

### GitHub Actions

```yaml
name: Deployment Risk Analysis
on:
  pull_request:
    types: [opened, synchronize, reopened]

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
      - run: npm install -g deploy-check-cli
      - run: deploy-check analyze --base ${{ github.event.pull_request.base.sha }} --fail-on high
```

### GitLab CI

```yaml
deploy-check:
  image: node:18
  stage: analyze
  script:
    - npm install -g deploy-check-cli
    - git fetch origin $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
    - deploy-check analyze --base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME --fail-on high
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### Pre-commit Hook (Husky)

```bash
npm install -D husky
npx husky install
npx husky add .husky/pre-commit "npx deploy-check-cli analyze --fail-on high"
```

See [CI Integration Guide](apps/cli/docs/CI_INTEGRATION_GUIDE.md) and [Jira & Confluence Guide](apps/cli/docs/JIRA_CONFLUENCE_GUIDE.md) for complete documentation.

## Requirements

- Node.js >= 18.0.0
- Git repository with history

## License

MIT
