# aws-sso-config-gen

Stop running `aws configure sso` over and over for every account. This tool discovers all your AWS SSO accounts and roles in one shot and generates the `~/.aws/config` entries for you.

## Before you start

You need two things:

1. **Node.js 22 or later** — check with `node --version`
2. **The AWS CLI installed and an SSO login session** — if you haven't logged in yet:
   ```bash
   aws sso login --start-url https://YOUR-ORG.awsapps.com/start
   ```
   Replace the URL with your organization's actual SSO start URL. You can find this in your AWS access portal or ask your admin.

## Quick start (step by step)

### Step 1: Install the tool

```bash
npm install -g aws-sso-config-gen
```

Don't want to install globally? You can use `npx` instead (just prefix every command below with `npx`).

### Step 2: Preview what it will generate

```bash
aws-sso-config-gen --sso-start-url https://YOUR-ORG.awsapps.com/start
```

This is a **dry run** — it prints the config to your terminal but does not touch any files. Look through the output and make sure it looks right.

### Step 3: Write it to your config

Once you're happy with the preview:

```bash
aws-sso-config-gen --sso-start-url https://YOUR-ORG.awsapps.com/start --write
```

This appends the new profiles to `~/.aws/config`. A timestamped backup is created automatically (e.g. `~/.aws/config.bak.2025-04-14T...`) so you can always roll back.

### Step 4: Use your new profiles

```bash
aws s3 ls --profile my-sandbox
aws sts get-caller-identity --profile prod-my-production-admin
```

That's it. Every account and role you have access to now has a named profile.

## Interactive mode

If you have a lot of accounts and only want some of them:

```bash
aws-sso-config-gen --sso-start-url https://YOUR-ORG.awsapps.com/start -i --write
```

This opens a checkbox picker in your terminal. Use arrow keys to navigate, space to toggle, `a` to select all, `/` to search/filter, and enter to confirm.

## How profile names work

The tool generates short, readable profile names from your account names:

| Account name | Roles | Generated profile(s) |
|---|---|---|
| `my-sandbox` | 1 role | `my-sandbox` |
| `dev-account` | 2 roles | `dev-account-administrator`, `dev-account-readonly` |
| `production-web` | 1 role | `prod-production-web` |

- Single-role accounts use just the account name
- Multi-role accounts append the role name
- Accounts matching production keywords (`prod`, `production`, `prd`) get a `prod-` prefix and a warning comment in the config

## What if I already have profiles?

Existing profiles are left alone. If a generated name matches one you already have, it's skipped and reported. Use `--force` to overwrite them instead.

## All flags

| Flag | Default | What it does |
|---|---|---|
| `--sso-start-url <url>` | reads from config | Your SSO portal URL (required on first run) |
| `--sso-region <region>` | `us-east-1` | Region where your SSO is hosted |
| `--session-name <name>` | derived from URL | Name for the `[sso-session]` block |
| `--default-region <region>` | `us-east-1` | Default region set in each profile |
| `--output-format <format>` | `json` | Default output format set in each profile |
| `--prod-patterns <patterns>` | `prod,production,prd` | Comma-separated keywords to detect production accounts |
| `--write` | off | Actually write to `~/.aws/config` (without this, it's a dry run) |
| `--force` | off | Overwrite profiles that already exist |
| `--output <path>` | — | Write to a different file instead of `~/.aws/config` |
| `-i, --interactive` | off | Open the interactive picker |

## Troubleshooting

**"SSO session expired"** — Run `aws sso login` again, then retry.

**"No SSO token found"** — You haven't logged in yet. Run `aws sso login --start-url https://YOUR-ORG.awsapps.com/start` first.

**"No SSO start URL provided"** — Pass `--sso-start-url` or make sure you have an `[sso-session]` block in your `~/.aws/config`.

**"Cannot write to ~/.aws/config: permission denied"** — Check file permissions, or use `--output /tmp/aws-config` to write somewhere else and copy it manually.

## Contributing

```bash
git clone https://github.com/larryoverbeck/aws-sso-config-generator.git
cd aws-sso-config-generator
npm install
npm test          # 122 tests (unit + property-based)
npm run build     # compile TypeScript → dist/
```

## License

MIT
