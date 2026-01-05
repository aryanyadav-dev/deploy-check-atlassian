# deploy-check-cli

Analyze code changes for deployment risks before they reach production.

[![npm version](https://img.shields.io/npm/v/deploy-check-cli.svg)](https://www.npmjs.com/package/deploy-check-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
# npm
npm install -g deploy-check-cli

# pnpm
pnpm add -g deploy-check-cli

# yarn
yarn global add deploy-check-cli

# npx (no install)
npx deploy-check-cli analyze
```

## Quick Start

```bash
deploy-check analyze                    # Analyze against main branch
deploy-check analyze --base develop     # Analyze against specific branch
deploy-check analyze --json             # Output as JSON
deploy-check runbook                    # Generate deployment runbook
deploy-check config init                # Initialize configuration
```

## What It Detects

| Risk Type | Languages/Files | Detection |
|-----------|-----------------|-----------|
| Breaking API Changes | TypeScript, Python, Go, Java, C/C++, Swift, Rust | AST-based analysis |
| Destructive Migrations | SQL files | Pattern matching (DROP, TRUNCATE, etc.) |
| Permission Changes | IAM, RBAC configs | Pattern detection |
| Low Test Coverage | All (via LCOV) | Coverage report parsing |
| Undocumented APIs | OpenAPI specs | Spec comparison |

## Commands

### `deploy-check analyze`

Analyze code changes for deployment risks.

```bash
deploy-check analyze [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--base <ref>` | Base branch/commit to compare against | `main` |
| `--head <ref>` | Head commit to analyze | `HEAD` |
| `--files <glob>` | Limit analysis to specific files | all |
| `--coverage <path>` | Path to lcov coverage report | auto-detect |
| `--openapi <path>` | Path to OpenAPI specification | auto-detect |
| `--json` | Output results as JSON | `false` |
| `--output <file>` | Write markdown report to file | stdout |
| `--fail-on <level>` | Exit with error on severity level | `high` |

### `deploy-check runbook`

Generate a deployment runbook based on detected risks.

```bash
deploy-check runbook [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--output <file>` | Write runbook to file | stdout |
| `--template <path>` | Custom runbook template | built-in |

### `deploy-check config`

Manage configuration.

```bash
deploy-check config init    # Create config interactively
deploy-check config show    # Display current config
```

### `deploy-check jira`

Integrate with Atlassian Jira.

```bash
deploy-check jira auth                      # Authenticate
deploy-check jira auth --logout             # Remove credentials
deploy-check jira create --project KEY      # Create issues for findings
deploy-check jira create --severity high    # Filter by severity
deploy-check jira create --dry-run          # Preview without creating
```

### `deploy-check confluence`

Publish reports to Atlassian Confluence.

```bash
deploy-check confluence auth                # Authenticate
deploy-check confluence publish --space KEY # Publish report
deploy-check confluence publish --runbook   # Publish runbook
```

## Configuration

Create `.deploy-check.json` in your project root:

```json
{
  "coverageThreshold": 40,
  "ignoredPaths": ["node_modules/**", "dist/**"],
  "outputFormat": "terminal",
  "baseRef": "main",
  "failOn": "high"
}
```

## Risk Scoring

| Finding Type | Points | Description |
|--------------|--------|-------------|
| `DESTRUCTIVE_MIGRATION` | 30 | DROP TABLE, DROP COLUMN, etc. |
| `BREAKING_API` | 25 | Removed exports, changed signatures |
| `PERMISSION_CHANGE` | 20 | IAM/RBAC modifications |
| `LOW_COVERAGE` | 10 | Test coverage below threshold |
| `UNDOCUMENTED_API` | 5 | Endpoints missing from OpenAPI spec |

### Risk Levels

| Level | Score | Exit Code |
|-------|-------|-----------|
| LOW | 0-34 | 0 |
| MEDIUM | 35-59 | 1 |
| HIGH | 60-79 | 2 |
| CRITICAL | 80+ | 2 |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No findings or all LOW severity |
| `1` | MEDIUM severity findings |
| `2` | HIGH or CRITICAL findings |

## CI/CD Integration

### GitHub Actions

```yaml
- run: npm install -g deploy-check-cli
- run: deploy-check analyze --base ${{ github.event.pull_request.base.sha }} --fail-on high
```

### GitLab CI

```yaml
script:
  - npm install -g deploy-check-cli
  - deploy-check analyze --base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME --fail-on high
```

### Pre-commit Hook

```bash
npx husky add .husky/pre-commit "npx deploy-check-cli analyze --fail-on high"
```

## Supported Languages

| Language | Extensions | What's Detected |
|----------|------------|-----------------|
| TypeScript/JavaScript | `.ts`, `.tsx`, `.js`, `.jsx` | Exported functions, classes, interfaces |
| Python | `.py` | Functions, classes, methods |
| Go | `.go` | Exported functions, structs |
| Java | `.java` | Public methods, classes, interfaces |
| C/C++ | `.c`, `.cpp`, `.h`, `.hpp` | Functions, structs, classes |
| Swift | `.swift` | Public functions, classes, protocols |
| Rust | `.rs` | `pub fn`, structs, enums, traits |

## Links

- [GitHub Repository](https://github.com/aryanyadav-dev/deploy-check-atlassian)
- [Full Documentation](https://drive.google.com/drive/folders/1bAd9QNvOacGY-hq025j_Uun0QJFQS0pI)
- [Atlassian Forge App](https://developer.atlassian.com/console/install/6e6f43d6-6312-46e6-8a22-20ea3401c700)

## License

MIT License

Copyright (c) 2025 Aryan Yadav
