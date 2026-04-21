# Deployment Risk Analyzer - Forge App

Atlassian Forge application that brings deployment risk analysis capabilities directly into Jira and Confluence.

## Features

- **Jira Issue Panel**: View deployment risk analysis directly on Jira issues
- **Confluence Reports**: Automatically publish risk reports to Confluence
- **Rovo Agent**: AI-powered conversational agent for deployment risk assessment
- **Risk Badges**: Visual indicators on Jira boards showing deployment risk levels

## Project Structure

```
apps/forge/
├── manifest.yml              # Forge app manifest
├── package.json
├── src/
│   ├── index.ts             # Main entry point
│   ├── resolvers/           # UI Kit resolver functions
│   ├── triggers/            # Event triggers
│   ├── agent/               # Rovo agent implementation
│   │   └── actions/         # Agent action handlers
│   ├── services/            # Business logic
│   └── ui/                  # UI Kit components
│       ├── panels/
│       └── badges/
├── static/                  # Static assets
└── test/                    # Test files
    ├── __mocks__/           # Forge API mocks
    ├── properties/          # Property-based tests
    ├── unit/                # Unit tests
    └── generators/          # fast-check generators
```

## Dependencies

This app uses shared libraries from the monorepo:

- `@dra/types` - Shared type definitions
- `@dra/backend` - Analyzer implementations and scoring

## Development

```bash
# Install dependencies
pnpm install

# Build the app
pnpm --filter @dra/forge build

# Run tests
pnpm --filter @dra/forge test

# Start development tunnel
pnpm --filter @dra/forge dev

# Deploy to Atlassian
pnpm --filter @dra/forge deploy
```

## Forge CLI Commands

```bash
# Login to Atlassian (required first)
npx @forge/cli login

# Register the app (first time only)
npx @forge/cli register

# Deploy to development environment
npx @forge/cli deploy

# Install on an Atlassian site
npx @forge/cli install

# Get shareable installation link
npx @forge/cli install --upgrade

# Start development tunnel for local testing
npx @forge/cli tunnel

# View app logs
npx @forge/cli logs
```

## Deployment

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

### Quick Start Deployment

1. **Login**: `npx @forge/cli login`
2. **Register**: `npx @forge/cli register`
3. **Build**: `pnpm build`
4. **Deploy**: `npx @forge/cli deploy`
5. **Install**: `npx @forge/cli install`

### Installation Link

After deployment, get a shareable installation link:

```bash
npx @forge/cli install --upgrade
```

The link format: `https://developer.atlassian.com/console/install/<app-id>?signature=<sig>`

## Requirements

- Node.js >= 18.0.0
- Atlassian developer account ([create one here](https://developer.atlassian.com))
- Atlassian Cloud site for testing

## App Permissions

| Scope | Purpose |
|-------|---------|
| `read:jira-work` | Read Jira issues and projects |
| `write:jira-work` | Create issues for findings |
| `read:confluence-content.all` | Read Confluence pages |
| `write:confluence-content` | Publish risk reports |
| `storage:app` | Store configuration and cached results |
| `read:bitbucket-pullrequest` | Read PR information for analysis |
