# CI Integration Guide

This guide provides step-by-step instructions for integrating `deploy-check` into your CI/CD pipelines. Learn how to set up automated deployment risk analysis for GitHub Actions, GitLab CI, and local git hooks.

## Table of Contents

- [Overview](#overview)
- [GitHub Actions Setup](#github-actions-setup)
- [GitLab CI Setup](#gitlab-ci-setup)
- [Pre-commit Hooks](#pre-commit-hooks)
- [Threshold Configuration Best Practices](#threshold-configuration-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

`deploy-check` analyzes your code changes for deployment risks including:
- Breaking API changes
- Destructive database migrations
- Permission/ACL modifications
- Low test coverage on modified files
- Undocumented API changes

### Exit Codes

The CLI uses exit codes to communicate risk levels for CI integration:

| Exit Code | Risk Level | Recommended Action |
|-----------|------------|-------------------|
| 0 | LOW or no findings | Safe to proceed |
| 1 | MEDIUM | Review findings, proceed with caution |
| 2 | HIGH or CRITICAL | Block deployment, address findings |

Use the `--fail-on` flag to customize which risk level triggers a non-zero exit.

---

## GitHub Actions Setup

### Step 1: Create Workflow File

Create `.github/workflows/deploy-check.yml` in your repository:

```yaml
name: Deployment Risk Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  analyze:
    name: Analyze Deployment Risks
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for diff analysis

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install deploy-check
        run: npm install -g @dra/cli

      - name: Run tests with coverage (optional)
        run: npm test -- --coverage
        continue-on-error: true

      - name: Run deployment risk analysis
        id: analysis
        run: |
          deploy-check analyze \
            --base ${{ github.event.pull_request.base.sha }} \
            --head ${{ github.event.pull_request.head.sha }} \
            --json > analysis.json
          
          RISK_LEVEL=$(jq -r '.riskLevel' analysis.json)
          echo "risk_level=$RISK_LEVEL" >> $GITHUB_OUTPUT

      - name: Fail on high risk
        if: steps.analysis.outputs.risk_level == 'high' || steps.analysis.outputs.risk_level == 'critical'
        run: exit 1
```

### Step 2: Add PR Comments (Optional)

To post analysis results as PR comments, add this step after the analysis:

```yaml
      - name: Post PR comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const result = JSON.parse(fs.readFileSync('analysis.json', 'utf8'));
            
            const badges = {
              low: '2ea44f', medium: 'f9c513',
              high: 'd73a49', critical: 'b60205'
            };
            
            let body = `## 🔍 Deployment Risk Analysis\n\n`;
            body += `![Risk](https://img.shields.io/badge/Risk-${result.riskLevel.toUpperCase()}-${badges[result.riskLevel]})\n`;
            body += `**Score:** ${result.riskScore}/100\n\n`;
            
            if (result.findings.length > 0) {
              body += `### Findings\n`;
              for (const f of result.findings.slice(0, 10)) {
                body += `- **${f.severity}** ${f.type}: ${f.title}\n`;
              }
            }
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body
            });
```

### Step 3: Upload Artifacts

Store analysis results for later review:

```yaml
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: risk-analysis
          path: analysis.json
          retention-days: 30
```

### Complete Example

See [examples/.github/workflows/pr-analysis.yml](../examples/.github/workflows/pr-analysis.yml) for a full working example with PR comments and artifact uploads.

---

## GitLab CI Setup

### Step 1: Add Pipeline Configuration

Add to your `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - analyze

variables:
  RISK_FAIL_THRESHOLD: "high"

deploy-check:
  image: node:18
  stage: analyze
  before_script:
    - npm install -g @dra/cli
  script:
    - git fetch origin $CI_MERGE_REQUEST_TARGET_BRANCH_NAME --depth=100
    - |
      deploy-check analyze \
        --base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME \
        --head $CI_COMMIT_SHA \
        --json > analysis.json
    - |
      RISK_LEVEL=$(jq -r '.riskLevel' analysis.json)
      if [ "$RISK_LEVEL" = "critical" ] || [ "$RISK_LEVEL" = "high" ]; then
        echo "Risk level $RISK_LEVEL exceeds threshold"
        exit 1
      fi
  artifacts:
    paths:
      - analysis.json
    expire_in: 1 month
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### Step 2: Include Coverage Analysis

If you have test coverage, include it in the analysis:

```yaml
test:
  image: node:18
  stage: test
  script:
    - npm ci
    - npm test -- --coverage
  artifacts:
    paths:
      - coverage/
    expire_in: 1 week
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

deploy-check:
  # ... previous config ...
  script:
    - git fetch origin $CI_MERGE_REQUEST_TARGET_BRANCH_NAME --depth=100
    - |
      deploy-check analyze \
        --base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME \
        --coverage coverage/lcov.info \
        --json > analysis.json
  needs:
    - job: test
      optional: true
```

### Step 3: Post MR Comments (Optional)

Add a job to post results to the merge request:

```yaml
post-comment:
  image: node:18
  stage: analyze
  script:
    - |
      RISK=$(jq -r '.riskLevel' analysis.json)
      SCORE=$(jq -r '.riskScore' analysis.json)
      curl --request POST \
        --header "PRIVATE-TOKEN: ${GITLAB_API_TOKEN}" \
        --data "body=Risk: $RISK (Score: $SCORE)" \
        "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}/notes"
  needs:
    - deploy-check
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### Complete Example

See [examples/.gitlab-ci.yml](../examples/.gitlab-ci.yml) for a comprehensive GitLab CI configuration.

---

## Pre-commit Hooks

### Option 1: Using Husky (Recommended for Node.js projects)

1. Install husky:
   ```bash
   npm install -D husky
   npx husky install
   ```

2. Add the pre-commit hook:
   ```bash
   npx husky add .husky/pre-commit "npx deploy-check analyze --fail-on high"
   ```

3. The hook will run automatically on `git commit`.

### Option 2: Using pre-commit Framework

1. Install pre-commit:
   ```bash
   pip install pre-commit
   ```

2. Create `.pre-commit-config.yaml`:
   ```yaml
   repos:
     - repo: local
       hooks:
         - id: deploy-check
           name: Deployment Risk Analysis
           entry: deploy-check analyze --fail-on high
           language: system
           pass_filenames: false
           stages: [commit]
   ```

3. Install the hook:
   ```bash
   pre-commit install
   ```

### Option 3: Manual Git Hook

1. Copy the hook script:
   ```bash
   cp node_modules/@dra/cli/examples/git-hooks/pre-commit .git/hooks/
   chmod +x .git/hooks/pre-commit
   ```

2. Or create your own `.git/hooks/pre-commit`:
   ```bash
   #!/bin/bash
   deploy-check analyze --fail-on high
   ```

### Bypassing Hooks

To skip the pre-commit hook when needed:
```bash
git commit --no-verify -m "your message"
```

---

## Threshold Configuration Best Practices

### Understanding Risk Scores

Risk scores are calculated by summing finding weights:

| Finding Type | Base Score |
|--------------|------------|
| Destructive Migration | +50 |
| Breaking API Change | +40 |
| Permission Change | +30 |
| Low Coverage | +20 |
| Undocumented API | +10 |

### Severity Classification

| Score Range | Severity |
|-------------|----------|
| 0-34 | LOW |
| 35-59 | MEDIUM |
| 60-79 | HIGH |
| 80+ | CRITICAL |

### Recommended Thresholds by Environment


#### Development/Feature Branches
```json
{
  "failOn": "critical",
  "coverageThreshold": 30
}
```
- Allow most changes to proceed
- Only block truly dangerous changes
- Lower coverage threshold for experimental work

#### Main/Release Branches
```json
{
  "failOn": "high",
  "coverageThreshold": 40
}
```
- Block high-risk changes
- Require reasonable test coverage
- Standard for production-bound code

#### Hotfix Branches
```json
{
  "failOn": "medium",
  "coverageThreshold": 50
}
```
- Stricter controls for emergency fixes
- Higher coverage requirement
- Extra scrutiny for quick changes

### Configuration File

Create `.deploy-check.json` in your project root:

```json
{
  "coverageThreshold": 40,
  "ignoredPaths": [
    "node_modules/**",
    "dist/**",
    "**/*.test.ts",
    "**/*.spec.ts"
  ],
  "failOn": "high",
  "coveragePath": "coverage/lcov.info",
  "openapiPath": "openapi.yaml"
}
```

### Per-Environment Configuration

Use environment variables to override settings:

```bash
# In CI pipeline
DEPLOY_CHECK_FAIL_ON=critical deploy-check analyze

# Or use CLI flags
deploy-check analyze --fail-on critical --coverage-threshold 50
```

### Ignoring Specific Paths

Exclude paths from analysis:

```json
{
  "ignoredPaths": [
    "migrations/seed/**",
    "scripts/**",
    "**/*.generated.ts"
  ]
}
```

---

## Troubleshooting

### Common Issues

#### 1. "No git repository found"

**Problem:** deploy-check cannot find the git repository.

**Solution:**
- Ensure you're running from within a git repository
- In CI, make sure the checkout step includes full history:
  ```yaml
  # GitHub Actions
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  # GitLab CI
  script:
    - git fetch origin $CI_MERGE_REQUEST_TARGET_BRANCH_NAME --depth=100
  ```

#### 2. "Base ref not found"

**Problem:** The base branch/commit for comparison doesn't exist.

**Solution:**
- Fetch the base branch in CI:
  ```bash
  git fetch origin main --depth=100
  ```
- Use the correct ref format:
  ```bash
  # For branches
  deploy-check analyze --base origin/main
  
  # For commits
  deploy-check analyze --base abc123
  ```

#### 3. "Coverage file not found"

**Problem:** The lcov coverage report is missing.

**Solution:**
- Run tests with coverage before analysis:
  ```bash
  npm test -- --coverage
  deploy-check analyze --coverage coverage/lcov.info
  ```
- Or skip coverage analysis:
  ```bash
  deploy-check analyze  # Will warn but continue
  ```

#### 4. "Permission denied" for pre-commit hook

**Problem:** The hook script isn't executable.

**Solution:**
```bash
chmod +x .git/hooks/pre-commit
# Or for husky
chmod +x .husky/pre-commit
```

#### 5. Analysis takes too long

**Problem:** Analysis is slow on large repositories.

**Solutions:**
- Limit analysis scope with `--files`:
  ```bash
  deploy-check analyze --files "src/**/*.ts"
  ```
- Ignore irrelevant paths in config:
  ```json
  {
    "ignoredPaths": ["vendor/**", "generated/**"]
  }
  ```
- Use shallow clones in CI (but ensure enough depth for diffs):
  ```yaml
  fetch-depth: 100  # Instead of 0
  ```

#### 6. False positives in findings

**Problem:** Analysis reports issues that aren't real risks.

**Solutions:**
- Add specific paths to ignore list
- Adjust thresholds for your project
- Use inline comments to suppress (coming soon)

#### 7. "jq: command not found" in CI

**Problem:** The `jq` JSON processor isn't installed.

**Solution:**
```yaml
# GitHub Actions - jq is pre-installed

# GitLab CI
before_script:
  - apt-get update && apt-get install -y jq

# Or use Node.js for JSON parsing
script:
  - node -e "console.log(JSON.parse(require('fs').readFileSync('analysis.json')).riskLevel)"
```

#### 8. OpenAPI spec not detected

**Problem:** API changes aren't being analyzed.

**Solution:**
- Specify the OpenAPI file path:
  ```bash
  deploy-check analyze --openapi docs/openapi.yaml
  ```
- Or configure in `.deploy-check.json`:
  ```json
  {
    "openapiPath": "docs/openapi.yaml"
  }
  ```

### Debug Mode

Enable verbose output for troubleshooting:

```bash
deploy-check analyze --verbose
```

This shows:
- Files being analyzed
- Analyzers being run
- Individual finding details
- Timing information

### Getting Help

- Check the [CLI README](../README.md) for command reference
- Review [example configurations](../examples/)
- Open an issue on GitHub for bugs or feature requests

---

## Quick Reference

### CLI Commands

```bash
# Basic analysis
deploy-check analyze

# Compare specific refs
deploy-check analyze --base main --head feature-branch

# With coverage
deploy-check analyze --coverage coverage/lcov.info

# JSON output for CI
deploy-check analyze --json > results.json

# Generate runbook
deploy-check runbook --output runbook.md

# Initialize config
deploy-check config init
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEPLOY_CHECK_FAIL_ON` | Risk level to fail on | `high` |
| `DEPLOY_CHECK_COVERAGE_THRESHOLD` | Minimum coverage % | `40` |
| `DEPLOY_CHECK_CONFIG` | Config file path | `.deploy-check.json` |

### Exit Codes Summary

| Code | Meaning |
|------|---------|
| 0 | Success (LOW risk or no findings) |
| 1 | MEDIUM risk detected |
| 2 | HIGH or CRITICAL risk detected |
