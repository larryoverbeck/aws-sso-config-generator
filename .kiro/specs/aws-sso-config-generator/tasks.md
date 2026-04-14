# Implementation Plan: AWS SSO Config Generator

## Overview

Build a standalone Node.js CLI tool (TypeScript, ESM) that discovers AWS SSO accounts and roles, generates sanitized profile names, and writes AWS CLI config entries. Implementation follows the pipeline architecture: CLI → Platform → Token → Discovery → Naming → Config Parse → Config Write → TUI → Output.

## Tasks

- [x] 1. Initialize project structure and shared types
  - [x] 1.1 Set up the Node.js project with `package.json` (type: module, bin entry for `aws-sso-config-gen`), `tsconfig.json` (ESM, Node22, strict), and install dependencies: `@aws-sdk/client-sso`, `commander`, `@inquirer/prompts`, `ini`, `vitest`, `fast-check`
    - Create `src/` directory for source files
    - Configure `vitest` in `vitest.config.ts`
    - _Requirements: 10.3, 10.4_

  - [x] 1.2 Create `src/types.ts` with all shared interfaces and error types
    - Define `PlatformPaths`, `SsoToken`, `DiscoveredAccount`, `DiscoveredRole`, `DiscoveryResult`, `ProfileNameOptions`, `GeneratedProfile`, `ExistingConfig`, `SkippedProfile`, `WriteOptions`, `WriteResult`, `CliConfig`
    - Define error classes: `TokenExpiredError`, `TokenNotFoundError`, `AuthorizationError`, `NetworkError`, `ConfigReadError`, `ConfigWriteError`, `MalformedConfigWarning`, `MissingStartUrlError`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Implement platform path resolution
  - [x] 2.1 Create `src/platform.ts` with `resolvePlatformPaths()` and `ensureDirectoryExists()`
    - Detect OS via `process.platform` and resolve `awsHomeDir`, `configPath`, `ssoCacheDir`
    - Respect `AWS_CONFIG_FILE` env var override for `configPath`
    - No hardcoded absolute paths
    - Create directories with appropriate permissions when missing
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7_

  - [x] 2.2 Write unit tests for `platform.ts`
    - Test path resolution per OS (mock `process.platform` and `os.homedir()`)
    - Test `AWS_CONFIG_FILE` env var override
    - Test directory creation when missing
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 3. Implement SSO token reading and validation
  - [x] 3.1 Create `src/token.ts` with `readCachedToken()` and `isTokenExpired()`
    - Read JSON files from SSO cache directory
    - Compute SHA-1 hash of `startUrl` to find the correct cache file
    - Validate token expiry against current time
    - Throw `TokenNotFoundError` if no matching cache file exists
    - Throw `TokenExpiredError` if token is expired
    - _Requirements: 1.4, 8.1_

  - [x] 3.2 Write unit tests for `token.ts`
    - Test expired token detection
    - Test missing cache file error
    - Test malformed JSON handling
    - Test valid token reading
    - _Requirements: 1.4, 8.1_

- [x] 4. Implement SSO account and role discovery
  - [x] 4.1 Create `src/discovery.ts` with `discoverAccountsAndRoles()`
    - Use `@aws-sdk/client-sso` with `ListAccountsCommand` and `ListAccountRolesCommand`
    - Handle pagination via `nextToken` for both API calls
    - Return flat list of all account-role combinations in `DiscoveryResult`
    - Catch and wrap SDK errors into `AuthorizationError` (401/403) and `NetworkError` (connection failures)
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 8.1, 8.2_

  - [x] 4.2 Write unit tests for `discovery.ts`
    - Mock `@aws-sdk/client-sso` client
    - Test pagination handling across multiple pages
    - Test authorization error wrapping
    - Test network error wrapping
    - _Requirements: 1.1, 1.2, 8.1, 8.2_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement profile name generation and production detection
  - [x] 6.1 Create `src/naming.ts` with `sanitizeName()`, `stripCommonSuffixes()`, `generateProfileNames()`, and `isProductionAccount()`
    - Sanitize: lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim leading/trailing hyphens
    - Strip common suffixes (e.g., `Access` from `AdministratorAccess`)
    - Single-role accounts use sanitized account name only; multi-role accounts append stripped permission set name
    - Resolve collisions by appending account ID suffix
    - Production detection: case-insensitive substring match against patterns, prefix with `prod-`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 6.2 Write property test: Sanitization invariants (Property 1)
    - **Property 1: Sanitization invariants**
    - For any input string, `sanitizeName` output is lowercase, matches `[a-z0-9-]`, has no consecutive hyphens, no leading/trailing hyphens
    - Use `fc.string()` generator with unicode, whitespace, special chars
    - **Validates: Requirements 2.1**

  - [x] 6.3 Write property test: Profile naming follows single/multi role rules (Property 2)
    - **Property 2: Profile naming follows single/multi role rules**
    - Single-role accounts → profile name equals sanitized account name (with optional `prod-` prefix)
    - Multi-role accounts → profile name contains sanitized, suffix-stripped permission set name as suffix
    - Use `fc.array(fc.record({accountId, accountName, roleName}))` with controlled group sizes
    - **Validates: Requirements 2.2, 2.3**

  - [x] 6.4 Write property test: All generated profile names are unique (Property 3)
    - **Property 3: All generated profile names are unique**
    - For any set of discovered roles, all `profileName` values are distinct
    - Use `fc.array(...)` including deliberately similar account names to trigger collisions
    - **Validates: Requirements 2.5**

  - [x] 6.5 Write property test: Production detection is case-insensitive and prefixes with prod- (Property 4)
    - **Property 4: Production detection is case-insensitive and prefixes with prod-**
    - If account name contains any keyword (case-insensitive), `isProductionAccount` returns true and profile name starts with `prod-`
    - If no keyword match, profile name does not start with `prod-`
    - Use `fc.record({accountName: fc.string(), patterns: fc.array(fc.string())})`
    - **Validates: Requirements 3.1, 3.2, 3.4**

  - [x] 6.6 Write unit tests for `naming.ts`
    - Test specific sanitization examples (spaces, special chars, unicode)
    - Test suffix stripping for known permission set names
    - Test single-role vs multi-role naming
    - Test collision resolution with account ID suffix
    - Test production detection with default and custom patterns
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [x] 7. Implement existing config parsing
  - [x] 7.1 Create `src/config-parser.ts` with `parseExistingConfig()`
    - Use `ini` package to parse the config file
    - Extract existing profile names from `[profile X]` sections and session names from `[sso-session X]` sections
    - Handle missing config file gracefully (return empty sets)
    - Throw `ConfigReadError` on permission errors
    - Emit `MalformedConfigWarning` on parse errors, preserving raw content
    - _Requirements: 5.1, 8.3, 8.5_

  - [x] 7.2 Write unit tests for `config-parser.ts`
    - Test parsing sample config files with profiles and sessions
    - Test missing config file returns empty sets
    - Test malformed config handling
    - Test permission error wrapping
    - _Requirements: 5.1, 8.3, 8.5_

- [x] 8. Implement config block generation and file writing
  - [x] 8.1 Create `src/config-writer.ts` with `generateConfigBlocks()` and `writeConfig()`
    - Generate SSO session block if session name doesn't already exist
    - Generate profile entry blocks with all required fields: `sso_session`, `sso_account_id`, `sso_role_name`, `region`, `output`
    - Add `# ⚠️  PRODUCTION ACCOUNT` comment above production profiles
    - Order: production profiles first (alphabetically), then non-production (alphabetically)
    - Skip profiles that already exist (unless `--force`), collect into skipped list with reasons
    - Create backup `<configPath>.bak.<ISO-timestamp>` before writing
    - Append generated content to existing config file
    - Throw `ConfigWriteError` on permission errors
    - _Requirements: 3.5, 4.1, 4.2, 4.3, 4.4, 4.6, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 6.4, 6.5, 8.4, 9.6_

  - [x] 8.2 Write property test: Generated config blocks contain all required fields and production warnings (Property 5)
    - **Property 5: Generated config blocks contain all required fields and production warnings**
    - For any `GeneratedProfile`, the config block contains `sso_session`, `sso_account_id`, `sso_role_name`, `region`, `output`
    - Production profiles are preceded by `# ⚠️  PRODUCTION ACCOUNT` comment
    - Use `fc.array(GeneratedProfile)` with random field values
    - **Validates: Requirements 3.5, 4.1**

  - [x] 8.3 Write property test: Output ordering — production first, then alphabetical (Property 6)
    - **Property 6: Output ordering — production first, then alphabetical**
    - All production profiles appear before non-production profiles
    - Within each group, profiles are sorted alphabetically by profile name
    - Use `fc.array(GeneratedProfile)` with mixed `isProduction` flags
    - **Validates: Requirements 4.6**

  - [x] 8.4 Write property test: Duplicate profiles are skipped when force is false (Property 7)
    - **Property 7: Duplicate profiles are skipped when force is false**
    - When `force` is false, written output contains none of the profiles whose names appear in the existing set
    - Skipped list contains exactly the overlapping names
    - Use `fc.record({profiles: fc.array(...), existing: fc.set(fc.string())})`
    - **Validates: Requirements 5.2**

  - [x] 8.5 Write unit tests for `config-writer.ts`
    - Test session block generation with required fields
    - Test backup file creation with timestamp
    - Test append behavior to existing config
    - Test force overwrite behavior
    - Test skipped profile reporting
    - _Requirements: 4.1, 4.2, 5.2, 5.3, 5.4, 5.5, 6.3, 6.5_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement interactive TUI mode
  - [x] 10.1 Create `src/tui.ts` with `selectProfiles()`
    - Use `@inquirer/prompts` checkbox with search/filter support
    - Display each choice as `accountName (accountId) — roleName`
    - Prefix production accounts with `⚠️` indicator
    - Support select all / deselect all via keyboard shortcuts
    - Show confirmation summary with count and profile names before proceeding
    - Handle cancellation gracefully (exit without generating profiles)
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [x] 10.2 Write property test: TUI selection filters output to confirmed profiles only (Property 8)
    - **Property 8: TUI selection filters output to confirmed profiles only**
    - For any list of profiles and any subset selected, the final output contains exactly the selected profiles and no others
    - Use `fc.record({profiles: fc.array(...), selected: fc.subarray(...)})`
    - Test at the pipeline integration level (mock TUI selection, verify output)
    - **Validates: Requirements 11.9**

- [x] 11. Implement CLI entry point and wire pipeline together
  - [x] 11.1 Create `src/cli.ts` as the main entry point using `commander`
    - Define all CLI flags: `--sso-start-url`, `--sso-region`, `--session-name`, `--default-region`, `--output-format`, `--prod-patterns`, `--write`, `--force`, `--output`, `--interactive`/`-i`, `--help`, `--version`
    - Set default values: `sso-region=us-east-1`, `default-region=us-east-1`, `output-format=json`, `prod-patterns=prod,production,prd`
    - Derive session name from SSO start URL domain when not provided
    - Attempt to read SSO start URL from existing config if flag not provided
    - Display error and exit with code 1 if no SSO start URL can be determined
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 11.2 Wire the full pipeline in `cli.ts`
    - Orchestrate: resolve platform paths → read token → discover accounts/roles → display discovery summary → generate profile names → (TUI selection if interactive) → parse existing config → generate config blocks → output (dry-run to stdout / write to file / write to custom path) → display summary
    - Handle all error types with user-friendly messages and appropriate exit codes
    - Display discovery summary showing account count and role combination count
    - In dry-run mode, print generated config to stdout with summary
    - In write mode, create backup, append to config, display write summary
    - In output mode, write to specified file path
    - _Requirements: 1.3, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.6, 8.1, 8.2, 8.3, 8.4, 11.2, 11.11, 11.12_

  - [x] 11.3 Write unit tests for CLI flag parsing
    - Test all flag defaults
    - Test missing `--sso-start-url` fallback to config
    - Test error when no SSO start URL available
    - Test `--help` and `--version` output
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 12. Implement project distribution setup
  - [x] 12.1 Configure `package.json` bin entry and build script
    - Add `bin` field pointing to compiled CLI entry point
    - Add `build` script for TypeScript compilation
    - Add shebang line (`#!/usr/bin/env node`) to CLI entry point
    - Ensure `npm install -g` or `npx` usage works
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 8 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The tool stores no user-specific data in the project directory — all config comes from CLI flags, env vars, or the user's own AWS config
