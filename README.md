# aws-sso-config-gen

CLI tool that automatically generates AWS CLI config profile entries for all accounts accessible via AWS SSO (IAM Identity Center).

## What it does

- Discovers all AWS accounts and permission sets you have access to via SSO
- Generates clean, consistent profile names from account names
- Flags production accounts with a `prod-` prefix
- Writes (or previews) `[profile ...]` blocks into your `~/.aws/config`
- Optional interactive TUI mode to cherry-pick which profiles to generate

## Requirements

- Node.js >= 22
- An active SSO session (`aws sso login`)

## Install

```bash
npm install -g aws-sso-config-gen
```

Or run directly:

```bash
npx aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start
```

## Usage

```bash
# Dry-run (preview only, default)
aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start

# Write to ~/.aws/config
aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start --write

# Interactive mode — pick which profiles to generate
aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start -i --write

# Force overwrite existing profiles
aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start --write --force
```

## Flags

| Flag | Default | Description |
|---|---|---|
| `--sso-start-url <url>` | from config | SSO portal URL |
| `--sso-region <region>` | `us-east-1` | SSO API region |
| `--session-name <name>` | derived from URL | SSO session name |
| `--default-region <region>` | `us-east-1` | Region for generated profiles |
| `--output-format <format>` | `json` | Output format for profiles |
| `--prod-patterns <patterns>` | `prod,production,prd` | Comma-separated production keywords |
| `--write` | `false` | Write to `~/.aws/config` |
| `--force` | `false` | Overwrite existing profiles |
| `--output <path>` | — | Write to a custom file |
| `-i, --interactive` | `false` | Launch interactive TUI |

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
