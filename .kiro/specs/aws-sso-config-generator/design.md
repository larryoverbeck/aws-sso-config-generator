# Design Document: AWS SSO Config Generator

## Overview

The AWS SSO Config Generator is a standalone Node.js CLI tool that automates the creation of AWS CLI config profile entries for all accounts accessible via AWS IAM Identity Center (SSO). It reads a cached SSO access token from a prior `aws sso login` session, queries the SSO portal to discover accounts and permission sets, generates sanitized profile names with production-account flagging, and writes (or previews) the resulting `[profile ...]` blocks into the user's `~/.aws/config` file.

The tool is distributed as an npm package, installable via `npm install -g`, and works across macOS, Linux, and Windows by resolving OS-specific paths at runtime. An optional interactive TUI mode lets users cherry-pick which account-role combinations to generate profiles for.

### Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js (>=22) | Cross-platform, strong AWS SDK support, good CLI ecosystem, native ESM and modern language features |
| AWS SDK | `@aws-sdk/client-sso` (v3) | Modular, tree-shakeable, provides `ListAccountsCommand` and `ListAccountRolesCommand` |
| CLI parsing | `commander` | Mature, widely used, supports flags, defaults, and help generation |
| TUI prompts | `@inquirer/prompts` (checkbox) | Modern Inquirer rewrite with built-in checkbox, search, and keyboard controls |
| INI parsing | `ini` npm package | Lightweight parser/serializer for AWS config INI format |
| Testing | `vitest` + `fast-check` | Fast test runner with native ESM support; fast-check for property-based testing |
| Build | TypeScript compiled to ESM | Type safety during development, standard JS output |

## Architecture

The tool follows a pipeline architecture with clearly separated stages:

```mermaid
flowchart TD
    A[CLI Entry Point] --> B[Parse CLI Flags]
    B --> C[Resolve Platform Paths]
    C --> D[Read SSO Access Token from Cache]
    D --> E{Token Valid?}
    E -- No --> F[Error: Run aws sso login]
    E -- Yes --> G[Discover Accounts via SSO API]
    G --> H[Discover Roles per Account]
    H --> I[Generate Profile Names]
    I --> J[Identify Production Accounts]
    J --> K{Interactive Mode?}
    K -- Yes --> L[TUI Selection]
    K -- No --> M[Use All Profiles]
    L --> M
    M --> N[Parse Existing Config]
    N --> O[Resolve Duplicates]
    O --> P[Generate Config Blocks]
    P --> Q{Output Mode}
    Q -- dry-run --> R[Print to stdout]
    Q -- --write --> S[Backup & Append to Config]
    Q -- --output --> T[Write to Custom File]
    R --> U[Print Summary]
    S --> U
    T --> U
```

### Module Decomposition

The codebase is organized into focused modules:

- `cli.ts` — Entry point, flag parsing with `commander`, orchestrates the pipeline
- `platform.ts` — OS detection and path resolution (AWS_Home_Directory, config, cache)
- `token.ts` — SSO cache token discovery and validation
- `discovery.ts` — SSO API calls (`listAccounts`, `listAccountRoles`), pagination handling
- `naming.ts` — Profile name generation, sanitization, suffix stripping, collision resolution, production detection
- `config-parser.ts` — Parse existing `~/.aws/config`, identify existing profiles and sessions
- `config-writer.ts` — Generate INI-formatted profile/session blocks, handle backup, append/write
- `tui.ts` — Interactive TUI mode using `@inquirer/prompts`
- `types.ts` — Shared TypeScript interfaces and types

## Components and Interfaces

### `platform.ts` — Platform Resolver

```typescript
interface PlatformPaths {
  awsHomeDir: string;       // ~/.aws or %USERPROFILE%\.aws
  configPath: string;       // <awsHomeDir>/config
  ssoCacheDir: string;      // <awsHomeDir>/sso/cache
}

function resolvePlatformPaths(): PlatformPaths;
function ensureDirectoryExists(dirPath: string): void;
```

Resolves paths based on `process.platform` and `os.homedir()`. Respects `AWS_CONFIG_FILE` env var override for `configPath`. No hardcoded absolute paths.

### `token.ts` — Token Reader

```typescript
interface SsoToken {
  accessToken: string;
  expiresAt: string;       // ISO 8601 timestamp
  region?: string;
  startUrl?: string;
}

function readCachedToken(ssoCacheDir: string, startUrl: string): SsoToken;
function isTokenExpired(token: SsoToken): boolean;
```

Reads JSON files from the SSO cache directory. The cache filename is the SHA-1 hash of the `startUrl`. Validates expiry before returning.

### `discovery.ts` — SSO Account & Role Discovery

```typescript
interface DiscoveredAccount {
  accountId: string;
  accountName: string;
  emailAddress: string;
}

interface DiscoveredRole {
  accountId: string;
  accountName: string;
  roleName: string;         // Permission set name, e.g. "AdministratorAccess"
}

interface DiscoveryResult {
  accounts: DiscoveredAccount[];
  roles: DiscoveredRole[];
}

async function discoverAccountsAndRoles(
  accessToken: string,
  ssoRegion: string
): Promise<DiscoveryResult>;
```

Uses `@aws-sdk/client-sso` with `ListAccountsCommand` and `ListAccountRolesCommand`. Handles pagination via `nextToken`. Returns flat list of all account-role combinations.

### `naming.ts` — Profile Name Generator

```typescript
interface ProfileNameOptions {
  prodPatterns: string[];   // e.g. ["prod", "production", "prd"]
}

interface GeneratedProfile {
  profileName: string;
  accountId: string;
  accountName: string;
  roleName: string;
  isProduction: boolean;
}

function sanitizeName(raw: string): string;
function stripCommonSuffixes(permissionSetName: string): string;
function generateProfileNames(
  roles: DiscoveredRole[],
  options: ProfileNameOptions
): GeneratedProfile[];
function isProductionAccount(accountName: string, patterns: string[]): boolean;
```

**Sanitization rules:**
1. Lowercase the input
2. Replace non-alphanumeric characters (except hyphens) with hyphens
3. Collapse consecutive hyphens into one
4. Trim leading/trailing hyphens

**Profile name construction:**
- Group roles by `accountId`
- If an account has exactly one role → use sanitized account name only
- If multiple roles → append stripped, sanitized permission set name
- If collision after sanitization → append account ID suffix

**Production detection:**
- Case-insensitive substring match of account name against each pattern in `prodPatterns`
- If matched, prefix profile name with `prod-`

### `config-parser.ts` — Existing Config Parser

```typescript
interface ExistingConfig {
  raw: string;                          // Original file content
  profileNames: Set<string>;            // Existing profile names
  sessionNames: Set<string>;            // Existing sso-session names
}

function parseExistingConfig(configPath: string): ExistingConfig;
```

Uses the `ini` package to parse the config file. Extracts section headers to identify existing profiles (`[profile X]`) and sessions (`[sso-session X]`).

**Duplicate detection and user notification:** When the tool generates profiles, it compares each generated `profileName` against the `profileNames` set from the parsed existing config. If a match is found and `--force` is not set, the profile is skipped and added to a `skipped` list. After generation completes, the tool prints a clear summary to stdout listing every skipped profile name alongside the reason (e.g., `Skipped: macp-sandbox — profile already exists in ~/.aws/config`). This ensures users are always informed about which accounts are already configured and are not silently ignored.

### `config-writer.ts` — Config Block Generator & Writer

```typescript
interface WriteOptions {
  ssoStartUrl: string;
  ssoRegion: string;
  sessionName: string;
  defaultRegion: string;
  outputFormat: string;
  force: boolean;
}

interface WriteResult {
  written: string[];        // Profile names written
  skipped: SkippedProfile[];// Profile names skipped with reasons
  backupPath?: string;      // Path to backup file, if created
  outputPath: string;       // Path written to
}

function generateConfigBlocks(
  profiles: GeneratedProfile[],
  existing: ExistingConfig,
  options: WriteOptions
): { content: string; written: string[]; skipped: SkippedProfile[] };

function writeConfig(
  content: string,
  configPath: string,
  createBackup: boolean
): { backupPath?: string };
```

```typescript
interface SkippedProfile {
  profileName: string;
  reason: string;           // e.g. "profile already exists in config"
}
```

**Ordering:** Production profiles first (alphabetically), then non-production profiles (alphabetically).

**Session block:** Generated once at the top if the session name doesn't already exist.

**Backup:** Creates `<configPath>.bak.<ISO-timestamp>` before modifying.

**Append-safe duplicate handling:** `generateConfigBlocks` checks every generated profile name against `existing.profileNames`. Matches are excluded from the output content and collected into the `skipped` array with a human-readable reason. The caller (CLI entry point) prints the skipped list so the user sees exactly which accounts were already configured. When `--force` is set, matches are included in the output instead of skipped, overwriting the existing entries.

### `tui.ts` — Interactive TUI

```typescript
async function selectProfiles(
  profiles: GeneratedProfile[]
): Promise<GeneratedProfile[]>;
```

Uses `@inquirer/prompts` checkbox with:
- Each choice shows: `accountName (accountId) — roleName`
- Production accounts prefixed with `⚠️` indicator
- Search/filter support built into Inquirer checkbox
- Select all / deselect all via keyboard shortcuts
- Confirmation summary before proceeding

### `cli.ts` — CLI Entry Point

Orchestrates the full pipeline. Uses `commander` to define flags:

| Flag | Type | Default | Description |
|---|---|---|---|
| `--sso-start-url` | string | from config | SSO portal URL |
| `--sso-region` | string | `us-east-1` | SSO API region |
| `--session-name` | string | derived from URL | SSO session name |
| `--default-region` | string | `us-east-1` | Profile region |
| `--output-format` | string | `json` | Profile output format |
| `--prod-patterns` | string | `prod,production,prd` | Comma-separated keywords |
| `--write` | boolean | `false` | Write to config file |
| `--force` | boolean | `false` | Overwrite existing profiles |
| `--output` | string | — | Custom output file path |
| `-i, --interactive` | boolean | `false` | Launch TUI mode |

## Data Models

### SSO Cache Token (JSON file in `~/.aws/sso/cache/`)

```json
{
  "startUrl": "https://my-org.awsapps.com/start",
  "region": "us-east-1",
  "accessToken": "eyJ...",
  "expiresAt": "2024-01-15T12:00:00Z"
}
```

The filename is the SHA-1 hex digest of the `startUrl` value, with a `.json` extension.

### AWS Config Profile Entry (INI format)

```ini
[sso-session my-org]
sso_start_url = https://my-org.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

# ⚠️  PRODUCTION ACCOUNT
[profile prod-macp-production-administrator]
sso_session = my-org
sso_account_id = 123456789012
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[profile macp-sandbox]
sso_session = my-org
sso_account_id = 838706008019
sso_role_name = PowerUserAccess
region = us-east-1
output = json
```

### Internal Data Structures

```typescript
// Core domain model flowing through the pipeline
interface DiscoveredRole {
  accountId: string;
  accountName: string;
  roleName: string;
}

interface GeneratedProfile {
  profileName: string;
  accountId: string;
  accountName: string;
  roleName: string;
  isProduction: boolean;
}

// CLI configuration resolved from flags + defaults
interface CliConfig {
  ssoStartUrl: string;
  ssoRegion: string;
  sessionName: string;
  defaultRegion: string;
  outputFormat: string;
  prodPatterns: string[];
  write: boolean;
  force: boolean;
  outputPath?: string;
  interactive: boolean;
}
```


## User Interaction Flows

The following mockups illustrate how users interact with the CLI tool across its primary modes and error scenarios.

### 1. Basic Dry-Run Flow

The default mode — user runs the tool with just `--sso-start-url` and sees a preview printed to stdout.

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start

🔍 Discovering accounts for https://myorg.awsapps.com/start ...

  Found 5 accounts, 9 account-role combinations.

  Accounts:
    macp-sandbox       (838706008019)  — 1 role
    macp-dev           (114433228899)  — 2 roles
    macp-staging       (556677889900)  — 2 roles
    macp-prod          (123456789012)  — 2 roles
    shared-services    (998877665544)  — 2 roles

📝 Generated config (dry-run — not written):

[sso-session myorg]
sso_start_url = https://myorg.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

# ⚠️  PRODUCTION ACCOUNT
[profile prod-macp-prod-administrator]
sso_session = myorg
sso_account_id = 123456789012
sso_role_name = AdministratorAccess
region = us-east-1
output = json

# ⚠️  PRODUCTION ACCOUNT
[profile prod-macp-prod-readonly]
sso_session = myorg
sso_account_id = 123456789012
sso_role_name = ReadOnlyAccess
region = us-east-1
output = json

[profile macp-dev-administrator]
sso_session = myorg
sso_account_id = 114433228899
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[profile macp-dev-poweruser]
sso_session = myorg
sso_account_id = 114433228899
sso_role_name = PowerUserAccess
region = us-east-1
output = json

[profile macp-sandbox]
sso_session = myorg
sso_account_id = 838706008019
sso_role_name = PowerUserAccess
region = us-east-1
output = json

[profile macp-staging-administrator]
sso_session = myorg
sso_account_id = 556677889900
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[profile macp-staging-readonly]
sso_session = myorg
sso_account_id = 556677889900
sso_role_name = ReadOnlyAccess
region = us-east-1
output = json

[profile shared-services-administrator]
sso_session = myorg
sso_account_id = 998877665544
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[profile shared-services-readonly]
sso_session = myorg
sso_account_id = 998877665544
sso_role_name = ReadOnlyAccess
region = us-east-1
output = json

─────────────────────────────────────────
Summary (dry-run):
  9 profiles generated
  0 profiles skipped
  Use --write to apply to ~/.aws/config
```

### 2. Write Mode with Existing Profiles

User runs with `--write` and some profiles already exist in `~/.aws/config`.

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start --write

🔍 Discovering accounts for https://myorg.awsapps.com/start ...

  Found 5 accounts, 9 account-role combinations.

📂 Backed up existing config to:
   ~/.aws/config.bak.2025-01-15T083022Z

⚠️  Skipped (already exist in ~/.aws/config):
   Skipped: macp-sandbox — profile already exists
   Skipped: macp-dev-administrator — profile already exists
   Skipped: shared-services-readonly — profile already exists

✅ Written to ~/.aws/config

─────────────────────────────────────────
Summary:
  6 profiles written
  3 profiles skipped (already exist)
  Backup saved to ~/.aws/config.bak.2025-01-15T083022Z
```

### 3. Force Overwrite Flow

User runs with `--write --force` to replace existing profiles.

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start --write --force

🔍 Discovering accounts for https://myorg.awsapps.com/start ...

  Found 5 accounts, 9 account-role combinations.

📂 Backed up existing config to:
   ~/.aws/config.bak.2025-01-15T084510Z

🔄 Overwriting 3 existing profiles (--force):
   Replaced: macp-sandbox
   Replaced: macp-dev-administrator
   Replaced: shared-services-readonly

✅ Written to ~/.aws/config

─────────────────────────────────────────
Summary:
  9 profiles written (3 replaced)
  0 profiles skipped
  Backup saved to ~/.aws/config.bak.2025-01-15T084510Z
```

### 4. Interactive TUI Mode Flow

User runs with `-i` to launch the interactive checkbox selection interface.

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start -i --write

🔍 Discovering accounts for https://myorg.awsapps.com/start ...

  Found 5 accounts, 9 account-role combinations.

? Select profiles to generate (↑↓ navigate, space toggle, a select all, / filter, enter confirm):

  ┌──────────────────────────────────────────────────────────────────────┐
  │  Filter: _                                                          │
  │                                                                     │
  │  ⚠️  PRODUCTION                                                     │
  │  [x]  ⚠️  macp-prod       (123456789012) — AdministratorAccess      │
  │  [ ]  ⚠️  macp-prod       (123456789012) — ReadOnlyAccess           │
  │                                                                     │
  │  ACCOUNTS                                                           │
  │  [x]  macp-dev            (114433228899) — AdministratorAccess      │
  │  [x]  macp-dev            (114433228899) — PowerUserAccess          │
  │  [x]  macp-sandbox        (838706008019) — PowerUserAccess          │
  │  [ ]  macp-staging        (556677889900) — AdministratorAccess      │
  │  [ ]  macp-staging        (556677889900) — ReadOnlyAccess           │
  │  [x]  shared-services     (998877665544) — AdministratorAccess      │
  │  [ ]  shared-services     (998877665544) — ReadOnlyAccess           │
  │                                                                     │
  │  5 of 9 selected                                                    │
  └──────────────────────────────────────────────────────────────────────┘

  Keyboard: ↑↓ move  ␣ toggle  a select all  n deselect all  / filter  ⏎ confirm  q cancel
```

After the user presses Enter to confirm, a summary is shown before writing:

```
📋 Confirm selection (5 profiles):

  ⚠️  prod-macp-prod-administrator   (123456789012) — AdministratorAccess
  macp-dev-administrator              (114433228899) — AdministratorAccess
  macp-dev-poweruser                  (114433228899) — PowerUserAccess
  macp-sandbox                        (838706008019) — PowerUserAccess
  shared-services-administrator       (998877665544) — AdministratorAccess

? Write these 5 profiles to ~/.aws/config? (Y/n): Y

📂 Backed up existing config to:
   ~/.aws/config.bak.2025-01-15T090112Z

✅ Written to ~/.aws/config

─────────────────────────────────────────
Summary:
  5 profiles written
  0 profiles skipped
  Backup saved to ~/.aws/config.bak.2025-01-15T090112Z
```

If the user types `/` to filter, the list narrows in real time:

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Filter: staging                                                    │
  │                                                                     │
  │  [ ]  macp-staging        (556677889900) — AdministratorAccess      │
  │  [ ]  macp-staging        (556677889900) — ReadOnlyAccess           │
  │                                                                     │
  │  0 of 2 shown selected                                              │
  └──────────────────────────────────────────────────────────────────────┘
```

If the user cancels with `q`:

```
✖ Selection cancelled. No profiles generated.
```

### 5. Error Flows

#### Expired SSO Token

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start

✖ SSO session expired.
  Run `aws sso login --sso-session myorg` to refresh, then try again.
```

Exit code: 1

#### No Start URL Provided

```
$ aws-sso-config-gen

✖ No SSO start URL provided.
  Use --sso-start-url <url> or configure an sso-session in ~/.aws/config.

  Example:
    aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start
```

Exit code: 1

#### Network Error

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start

✖ Cannot reach SSO endpoint at https://myorg.awsapps.com/start
  Check your network connectivity and verify the SSO start URL is correct.
```

Exit code: 1

#### Config File Permission Error

```
$ aws-sso-config-gen --sso-start-url https://myorg.awsapps.com/start --write

✖ Cannot write to /home/user/.aws/config: permission denied.
  Check file permissions or use --output <path> to write to a different location.
```

Exit code: 1

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sanitization invariants

*For any* input string, the `sanitizeName` function SHALL produce output that is entirely lowercase, contains only characters matching `[a-z0-9-]`, contains no consecutive hyphens, and has no leading or trailing hyphens.

**Validates: Requirements 2.1**

### Property 2: Profile naming follows single/multi role rules

*For any* set of discovered roles grouped by account, if an account has exactly one role then its profile name SHALL equal the sanitized account name (with optional `prod-` prefix), and if an account has multiple roles then each profile name SHALL contain the sanitized, suffix-stripped permission set name as a suffix.

**Validates: Requirements 2.2, 2.3**

### Property 3: All generated profile names are unique

*For any* set of discovered roles, the `generateProfileNames` function SHALL produce a list where every `profileName` is distinct. Collisions are resolved by appending the account ID.

**Validates: Requirements 2.5**

### Property 4: Production detection is case-insensitive and prefixes with prod-

*For any* account name and set of production keywords, if the account name contains any keyword (case-insensitive substring match), then `isProductionAccount` SHALL return true and the generated profile name SHALL start with `prod-`. If the account name does not contain any keyword, the profile name SHALL NOT start with `prod-`.

**Validates: Requirements 3.1, 3.2, 3.4**

### Property 5: Generated config blocks contain all required fields and production warnings

*For any* `GeneratedProfile`, the generated config block SHALL contain the fields `sso_session`, `sso_account_id`, `sso_role_name`, `region`, and `output`. Additionally, if the profile is a production account, the block SHALL be preceded by a comment containing `# ⚠️  PRODUCTION ACCOUNT`.

**Validates: Requirements 3.5, 4.1**

### Property 6: Output ordering — production first, then alphabetical

*For any* set of generated profiles, the output SHALL list all production profiles before all non-production profiles, and within each group profiles SHALL be sorted alphabetically by profile name.

**Validates: Requirements 4.6**

### Property 7: Duplicate profiles are skipped when force is false

*For any* set of generated profiles and existing profile names, when `force` is false, the written output SHALL contain none of the profiles whose names appear in the existing set, and the skipped list SHALL contain exactly those overlapping names.

**Validates: Requirements 5.2**

### Property 8: TUI selection filters output to confirmed profiles only

*For any* list of generated profiles and any subset selected by the user, the final output SHALL contain exactly the profiles in the selected subset and no others.

**Validates: Requirements 11.9**

## Error Handling

The tool uses a structured error handling approach with specific error types for each failure mode:

### Error Categories

| Error Type | Trigger | User Message | Exit Code |
|---|---|---|---|
| `TokenExpiredError` | SSO access token `expiresAt` is in the past | "SSO session expired. Run `aws sso login --sso-session <name>` to refresh." | 1 |
| `TokenNotFoundError` | No cache file matching the start URL SHA-1 | "No SSO token found. Run `aws sso login --sso-session <name>` first." | 1 |
| `AuthorizationError` | SSO API returns 401/403 | "SSO authorization failed — session may be expired. Run `aws sso login`." | 1 |
| `NetworkError` | SSO API connection failure | "Cannot reach SSO endpoint at `<url>`. Check network connectivity." | 1 |
| `ConfigReadError` | Permission denied reading config | "Cannot read `<path>`: permission denied." | 1 |
| `ConfigWriteError` | Permission denied writing config | "Cannot write to `<path>`: permission denied." | 1 |
| `MalformedConfigWarning` | INI parse error in existing config | "Warning: malformed section in `<path>` near line `<n>`. Existing content preserved." | 0 (continues) |
| `MissingStartUrlError` | No `--sso-start-url` flag and no session in config | "No SSO start URL provided. Use `--sso-start-url` or configure an sso-session in `~/.aws/config`." | 1 |

### Error Handling Strategy

- All errors that prevent operation result in a non-zero exit code and a human-readable message to stderr.
- Malformed config is the only warning-level issue — the tool continues and preserves the malformed content untouched.
- Network and auth errors include actionable remediation steps in the message.
- All file path references in error messages use the resolved absolute path so the user knows exactly which file is affected.

## Testing Strategy

### Unit Tests (vitest)

Unit tests cover specific examples, edge cases, and error conditions:

- **`naming.ts`**: Specific sanitization examples (spaces, special chars, unicode), suffix stripping for known permission set names (`AdministratorAccess` → `administrator`), single-role vs multi-role naming, collision resolution with account ID suffix
- **`token.ts`**: Expired token detection, missing cache file, malformed JSON
- **`config-parser.ts`**: Parsing sample config files with profiles and sessions, malformed config handling
- **`config-writer.ts`**: Session block generation with required fields, backup file creation, append behavior
- **`platform.ts`**: Path resolution per OS (mocking `process.platform`), `AWS_CONFIG_FILE` env var override
- **`cli.ts`**: Flag parsing, default values, help/version output, missing required flags
- **Error handling**: Each error type produces the correct message and exit code

### Property-Based Tests (vitest + fast-check)

Property-based tests verify universal correctness properties across randomized inputs. Each property test runs a minimum of 100 iterations and is tagged with its design document property reference.

| Property | Module Under Test | Generator Strategy |
|---|---|---|
| Property 1: Sanitization invariants | `naming.sanitizeName` | `fc.string()` — arbitrary strings including unicode, whitespace, special chars |
| Property 2: Single/multi role naming | `naming.generateProfileNames` | `fc.array(fc.record({accountId, accountName, roleName}))` with controlled group sizes |
| Property 3: Unique profile names | `naming.generateProfileNames` | `fc.array(...)` including deliberately similar account names to trigger collisions |
| Property 4: Production detection + prefix | `naming.isProductionAccount` + `naming.generateProfileNames` | `fc.record({accountName: fc.string(), patterns: fc.array(fc.string())})` |
| Property 5: Config block completeness | `config-writer.generateConfigBlocks` | `fc.array(GeneratedProfile)` with random field values |
| Property 6: Output ordering | `config-writer.generateConfigBlocks` | `fc.array(GeneratedProfile)` with mixed `isProduction` flags |
| Property 7: Duplicate skipping | `config-writer.generateConfigBlocks` | `fc.record({profiles: fc.array(...), existing: fc.set(fc.string())})` |
| Property 8: TUI selection filtering | Pipeline integration | `fc.record({profiles: fc.array(...), selected: fc.subarray(...)})` |

Tag format: `// Feature: aws-sso-config-generator, Property N: <property text>`

### Integration Tests

Integration tests verify end-to-end behavior with mocked AWS SDK:

- Full pipeline: discovery → naming → config generation → output
- Write mode: backup creation, file append, correct file content
- Existing config preservation: profiles not overwritten without `--force`
- Cross-platform path resolution with mocked `process.platform`

### Manual / E2E Tests

- TUI mode interaction (keyboard navigation, search, select all)
- Real SSO endpoint discovery (requires active SSO session)
- Fresh install on clean machine
