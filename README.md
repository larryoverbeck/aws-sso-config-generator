# aws-sso-config-gen

Stop running `aws configure sso` over and over for every account. This tool discovers all your AWS SSO accounts and roles in one shot and generates the `~/.aws/config` entries for you.

## Before you start

You need three things: Node.js, the AWS CLI, and an active SSO session.

### 1. Install Node.js 22 or later

Check with `node --version`. If you don't have it, grab it from [nodejs.org](https://nodejs.org).

### 2. Install the AWS CLI

Check with `aws --version`. If you don't have it, follow the [AWS CLI install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

### 3. Set up your SSO session

If this is your first time, you need to configure an SSO session. Run:

```bash
aws configure sso
```

It will ask you a series of questions. Here's what to enter:

```
SSO session name (Recommended): maxfed
SSO start URL [None]: https://d-90676bd4b4.awsapps.com/start
SSO region [None]: us-east-1
SSO registration scopes [sso:account:access]: (just press Enter)
```

This opens your browser to authorize. Complete the login in the browser, then come back to the terminal. It will ask you to pick an account and role — just pick any one (it doesn't matter which, we're about to generate all of them). For the remaining prompts:

```
CLI default client Region [None]: us-east-1
CLI default output format [None]: json
CLI profile name [...]: (just press Enter to accept the default)
```

You now have an SSO session configured. This only needs to be done once.

### 4. Log in

Whenever your session expires, log back in with:

```bash
aws sso login --sso-session maxfed
```

## Quick start (step by step)

### Step 1: Clone and build

```bash
git clone https://github.com/larryoverbeck/aws-sso-config-generator.git
cd aws-sso-config-generator
npm install
npm run build
```

That's it. No global install, no sudo, no npm link.

### Step 2: Launch the web UI

```bash
./aws-sso-config-gen
```

This discovers all your SSO accounts and roles, starts a local web server, and opens your browser automatically. From the web UI you can:

- Search and filter discovered profiles
- Select which profiles to add to your config
- Rename profiles before saving
- See which profiles are already in your config (matched by account ID)
- Mark accounts as production (persisted to `prod-accounts.json` — commit it to share with your team)
- Delete existing profiles from your config
- Preview and restore backups

If your SSO start URL isn't already in `~/.aws/config`, pass it explicitly:

```bash
./aws-sso-config-gen --sso-start-url https://d-90676bd4b4.awsapps.com/start
```

When you're done, click the "Done" button in the web UI to shut down the server.

### Step 3: Use your new profiles

```bash
aws s3 ls --profile my-sandbox
aws sts get-caller-identity --profile prod-my-production-admin
```

That's it. Every account and role you have access to now has a named profile.

## CLI mode

If you prefer the terminal or want to script it, use `--cli`:

### Dry run (preview)

```bash
./aws-sso-config-gen --cli --sso-start-url https://d-90676bd4b4.awsapps.com/start
```

This prints the generated config to your terminal but does not touch any files.

### Write to config

```bash
./aws-sso-config-gen --cli --sso-start-url https://d-90676bd4b4.awsapps.com/start --write
```

This appends the new profiles to `~/.aws/config`. A timestamped backup is created automatically (e.g. `~/.aws/config.bak.2025-04-14T...`) so you can always roll back.

## Interactive CLI mode

If you're using `--cli` mode and have a lot of accounts, use the interactive picker:

```bash
./aws-sso-config-gen --cli --sso-start-url https://d-90676bd4b4.awsapps.com/start -i --write
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

## Production account marking

Accounts matching production keywords get a `prod-` prefix and a ⚠️ PROD badge in the web UI. You can also manually mark accounts as production from the web UI — this saves to `prod-accounts.json` in the repo root. Commit this file to share production markings with your team.

## All flags

| Flag | Default | What it does |
|---|---|---|
| `--sso-start-url <url>` | reads from config | Your SSO portal URL (required on first run) |
| `--sso-region <region>` | `us-east-1` | Region where your SSO is hosted |
| `--session-name <name>` | derived from URL | Name for the `[sso-session]` block |
| `--default-region <region>` | `us-east-1` | Default region set in each profile |
| `--output-format <format>` | `json` | Default output format set in each profile |
| `--prod-patterns <patterns>` | `prod,production,prd` | Comma-separated keywords to detect production accounts |
| `--write` | off | Actually write to `~/.aws/config` (CLI mode only) |
| `--force` | off | Overwrite profiles that already exist (CLI mode only) |
| `--output <path>` | — | Write to a different file instead of `~/.aws/config` (CLI mode only) |
| `-i, --interactive` | off | Open the interactive TUI picker (CLI mode only) |
| `--cli` | off | Run in terminal-only mode (no web server) |
| `--web` | on | Run in web mode (default) |

## Troubleshooting

**"SSO session expired"** — Run `aws sso login --sso-session maxfed` again, then retry.

**"No SSO token found"** — You haven't logged in yet. Run `aws sso login --sso-session maxfed` first.

**"No SSO start URL provided"** — Pass `--sso-start-url` or make sure you have an `[sso-session]` block in your `~/.aws/config`.

**"Cannot write to ~/.aws/config: permission denied"** — Check file permissions, or use `--output /tmp/aws-config` to write somewhere else and copy it manually.

## Contributing

```bash
git clone https://github.com/larryoverbeck/aws-sso-config-generator.git
cd aws-sso-config-generator
npm install
npm test          # 160 tests (unit + property-based)
npm run build     # compile TypeScript → dist/
```

## License

MIT
