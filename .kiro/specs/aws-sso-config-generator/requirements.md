# Requirements Document

## Introduction

A standalone CLI tool (its own GitHub project) that automatically generates AWS config profile entries for all AWS accounts accessible via AWS SSO (IAM Identity Center). The tool uses an existing SSO session to discover all available accounts and their permission sets, generates sensible profile names from account names, flags production accounts with a naming convention prefix, and writes the resulting profile blocks into the AWS_Config file without disturbing existing entries. The tool is designed as a shareable, installable project that works across macOS, Linux, and Windows, resolving OS-specific file paths at runtime so that multiple users on different machines can each generate their own AWS configs from the same codebase. The goal is to eliminate the tedious manual process of running `aws configure sso` repeatedly for each account.

## Glossary

- **CLI_Tool**: The standalone command-line application that discovers SSO accounts and generates AWS config profile entries
- **SSO_Session**: An `[sso-session <name>]` block in `~/.aws/config` that defines the `sso_start_url`, `sso_region`, and `sso_registration_scopes` shared across profiles
- **SSO_Portal**: The AWS SSO (IAM Identity Center) service endpoint that the CLI_Tool queries to list accounts and roles
- **AWS_Config**: The AWS CLI configuration file where profiles and SSO sessions are defined; located at `~/.aws/config` on macOS/Linux and `%USERPROFILE%\.aws\config` on Windows
- **Profile_Entry**: A `[profile <name>]` block in AWS_Config containing `sso_session`, `sso_account_id`, `sso_role_name`, `region`, and `output` fields
- **Permission_Set**: An IAM Identity Center role assignment (e.g., `AdministratorAccess`, `PowerUserAccess`) that grants access to an AWS account
- **Account_Name**: The human-readable name assigned to an AWS account in AWS Organizations (e.g., `macp-sandbox`, `macp-prod`)
- **Profile_Name**: The sanitized, lowercase, hyphenated identifier derived from the Account_Name and Permission_Set, used as the profile name in AWS_Config
- **Production_Account**: An AWS account identified as a production environment through name-based pattern matching against configurable keywords
- **Access_Token**: The cached SSO bearer token obtained from a prior `aws sso login` session, stored in the platform-specific SSO_Cache_Directory
- **AWS_Home_Directory**: The OS-specific base directory for AWS CLI configuration; `~/.aws` on macOS/Linux and `%USERPROFILE%\.aws` on Windows
- **SSO_Cache_Directory**: The directory where cached SSO tokens are stored; `~/.aws/sso/cache/` on macOS/Linux and `%USERPROFILE%\.aws\sso\cache\` on Windows
- **Platform_Resolver**: The component within the CLI_Tool responsible for detecting the current operating system and resolving AWS_Home_Directory, AWS_Config, and SSO_Cache_Directory paths at runtime
- **TUI_Mode**: An opt-in interactive Terminal User Interface mode activated by the `--interactive` or `-i` flag, which presents a checkbox-style selection interface for choosing which discovered account-role combinations to generate profiles for

## Requirements

### Requirement 1: SSO Account Discovery

**User Story:** As a developer, I want the CLI_Tool to discover all AWS accounts I have access to via SSO, so that I do not have to manually look up account IDs and role names.

#### Acceptance Criteria

1. WHEN the user runs the CLI_Tool with a valid SSO start URL, THE CLI_Tool SHALL call the SSO `list-accounts` API to retrieve all accounts the authenticated user has access to
2. WHEN accounts are retrieved, THE CLI_Tool SHALL call the SSO `list-account-roles` API for each account to retrieve all Permission_Sets assigned to the user
3. WHEN discovery completes, THE CLI_Tool SHALL display a summary showing the number of accounts found and the total number of account-role combinations discovered
4. IF the Access_Token is expired or missing, THEN THE CLI_Tool SHALL display an error message instructing the user to run `aws sso login` first and exit with a non-zero exit code
5. WHEN the user provides the `--sso-start-url` flag, THE CLI_Tool SHALL use that URL as the SSO portal endpoint for discovery
6. WHEN the user provides the `--sso-region` flag, THE CLI_Tool SHALL use that region for SSO API calls

### Requirement 2: Profile Name Generation

**User Story:** As a developer, I want the CLI_Tool to generate clean, consistent profile names from account names, so that I can easily identify and use profiles without manual renaming.

#### Acceptance Criteria

1. THE CLI_Tool SHALL generate Profile_Names by converting the Account_Name to lowercase, replacing spaces and special characters with hyphens, and collapsing consecutive hyphens into a single hyphen
2. WHEN an account has multiple Permission_Sets, THE CLI_Tool SHALL append the Permission_Set name to the Profile_Name, separated by a hyphen (e.g., `macp-sandbox-poweruseraccess`)
3. WHEN an account has exactly one Permission_Set, THE CLI_Tool SHALL use only the sanitized Account_Name as the Profile_Name without appending the Permission_Set name
4. THE CLI_Tool SHALL strip common suffixes from Permission_Set names when appending them (e.g., `Access` from `AdministratorAccess` yields `administrator`)
5. IF two generated Profile_Names collide after sanitization, THEN THE CLI_Tool SHALL append the account ID as a suffix to disambiguate (e.g., `my-account-838706008019`)

### Requirement 3: Production Account Identification

**User Story:** As a developer, I want production accounts to be clearly flagged in the profile name, so that I can immediately distinguish production profiles from non-production ones and avoid accidental operations.

#### Acceptance Criteria

1. THE CLI_Tool SHALL identify Production_Accounts by matching the Account_Name against a default set of keywords: `prod`, `production`, `prd`
2. WHEN a Production_Account is identified, THE CLI_Tool SHALL prefix the Profile_Name with `prod-` (e.g., `prod-macp-production`)
3. WHEN the user provides the `--prod-patterns` flag with a comma-separated list of keywords, THE CLI_Tool SHALL use those keywords instead of the defaults for Production_Account identification
4. THE CLI_Tool SHALL perform case-insensitive matching when comparing Account_Names against production keywords
5. WHEN generating output, THE CLI_Tool SHALL include a comment above each Production_Account Profile_Entry indicating `# ⚠️  PRODUCTION ACCOUNT` as a visual warning

### Requirement 4: Config File Generation

**User Story:** As a developer, I want the CLI_Tool to generate properly formatted `~/.aws/config` entries, so that I can use the profiles immediately with the AWS CLI.

#### Acceptance Criteria

1. THE CLI_Tool SHALL generate Profile_Entry blocks in standard AWS CLI config format with `sso_session`, `sso_account_id`, `sso_role_name`, `region`, and `output` fields
2. THE CLI_Tool SHALL generate an SSO_Session block containing the `sso_start_url`, `sso_region`, and `sso_registration_scopes` fields
3. WHEN the user provides the `--default-region` flag, THE CLI_Tool SHALL use that value as the `region` field in all generated Profile_Entries; the default value SHALL be `us-east-1`
4. WHEN the user provides the `--output-format` flag, THE CLI_Tool SHALL use that value as the `output` field in all generated Profile_Entries; the default value SHALL be `json`
5. WHEN the user provides the `--session-name` flag, THE CLI_Tool SHALL use that value as the SSO_Session name; otherwise THE CLI_Tool SHALL derive a session name from the SSO start URL domain
6. THE CLI_Tool SHALL group generated Profile_Entries alphabetically, with Production_Account profiles listed first within the output

### Requirement 5: Existing Config Handling

**User Story:** As a developer, I want the CLI_Tool to handle my existing `~/.aws/config` gracefully, so that it does not overwrite or corrupt profiles I have already configured.

#### Acceptance Criteria

1. WHEN the AWS_Config file already exists, THE CLI_Tool SHALL parse it and identify all existing profile names and SSO_Session names
2. WHEN a generated Profile_Name matches an existing profile name in AWS_Config, THE CLI_Tool SHALL skip that profile and report it as already existing
3. WHEN a generated SSO_Session name matches an existing SSO_Session in AWS_Config, THE CLI_Tool SHALL reuse the existing session name and not generate a duplicate session block
4. WHEN the `--force` flag is provided, THE CLI_Tool SHALL overwrite existing profiles that match generated Profile_Names instead of skipping them
5. WHEN profiles are skipped due to duplicates, THE CLI_Tool SHALL display a summary listing each skipped profile name and the reason

### Requirement 6: Output Modes

**User Story:** As a developer, I want to preview the generated config before it is written, so that I can review and approve the changes.

#### Acceptance Criteria

1. THE CLI_Tool SHALL default to dry-run mode, printing the generated config blocks to stdout without modifying AWS_Config
2. WHEN the `--write` flag is provided, THE CLI_Tool SHALL append the generated config blocks to the AWS_Config file
3. WHEN writing to AWS_Config, THE CLI_Tool SHALL create a backup of the existing file at `<AWS_Config>.bak.<timestamp>` in the same directory before making changes
4. WHEN the `--output` flag is provided with a file path, THE CLI_Tool SHALL write the generated config blocks to that file instead of AWS_Config
5. WHEN writing completes, THE CLI_Tool SHALL display a summary showing the number of profiles written, the number skipped, and the file path written to

### Requirement 7: CLI Interface

**User Story:** As a developer, I want a simple CLI interface with sensible defaults, so that I can generate config with minimal flags for common use cases.

#### Acceptance Criteria

1. THE CLI_Tool SHALL accept the following flags: `--sso-start-url` (required), `--sso-region` (default: `us-east-1`), `--session-name`, `--default-region` (default: `us-east-1`), `--output-format` (default: `json`), `--prod-patterns`, `--write`, `--force`, `--output`, `--interactive` / `-i`, `--help`, `--version`
2. WHEN the `--help` flag is provided, THE CLI_Tool SHALL display usage information listing all flags with descriptions and defaults
3. WHEN the `--version` flag is provided, THE CLI_Tool SHALL display the tool version number
4. IF the `--sso-start-url` flag is not provided, THEN THE CLI_Tool SHALL attempt to read the SSO start URL from an existing SSO_Session block in AWS_Config
5. IF no SSO start URL can be determined from flags or AWS_Config, THEN THE CLI_Tool SHALL display an error message and exit with a non-zero exit code
6. WHEN the CLI_Tool runs successfully, THE CLI_Tool SHALL exit with exit code 0

### Requirement 8: Error Handling

**User Story:** As a developer, I want clear error messages when something goes wrong, so that I can quickly diagnose and fix issues.

#### Acceptance Criteria

1. IF the SSO API returns an authorization error, THEN THE CLI_Tool SHALL display a message indicating the SSO session is expired and suggest running `aws sso login`
2. IF the SSO API returns a network error, THEN THE CLI_Tool SHALL display a message indicating the SSO endpoint is unreachable and include the endpoint URL
3. IF the AWS_Config file cannot be read due to permissions, THEN THE CLI_Tool SHALL display a message indicating the file path and the permission error
4. IF the AWS_Config file cannot be written due to permissions, THEN THE CLI_Tool SHALL display a message indicating the file path and the permission error
5. IF the AWS_Config file contains malformed syntax, THEN THE CLI_Tool SHALL display a warning identifying the malformed section and proceed with generation without modifying the malformed content


### Requirement 9: Cross-Platform Path Resolution

**User Story:** As a developer working on macOS, Linux, or Windows, I want the CLI_Tool to resolve the correct AWS config and cache file paths for my operating system, so that I can use the tool without manual path configuration.

#### Acceptance Criteria

1. THE Platform_Resolver SHALL detect the current operating system at runtime and resolve the AWS_Home_Directory accordingly: `~/.aws` on macOS and Linux, `%USERPROFILE%\.aws` on Windows
2. THE CLI_Tool SHALL derive the AWS_Config path from the resolved AWS_Home_Directory (i.e., `<AWS_Home_Directory>/config`)
3. THE CLI_Tool SHALL derive the SSO_Cache_Directory path from the resolved AWS_Home_Directory (i.e., `<AWS_Home_Directory>/sso/cache/`)
4. THE CLI_Tool SHALL NOT contain any hardcoded absolute paths for AWS_Config, SSO_Cache_Directory, or AWS_Home_Directory
5. WHEN the `AWS_CONFIG_FILE` environment variable is set, THE CLI_Tool SHALL use that value as the AWS_Config path instead of the platform-resolved default
6. WHEN the backup file is created during a write operation, THE CLI_Tool SHALL place the backup in the same directory as the resolved AWS_Config path
7. IF the resolved AWS_Home_Directory does not exist, THEN THE CLI_Tool SHALL create it with appropriate permissions before writing

### Requirement 10: Multi-User Shareable Distribution

**User Story:** As a team lead, I want the CLI_Tool to be a shareable GitHub repository that any team member can install and run on their own machine, so that everyone can generate their own AWS configs without per-user customization of the tool itself.

#### Acceptance Criteria

1. THE CLI_Tool SHALL NOT store any user-specific configuration, credentials, or generated output within the project directory
2. THE CLI_Tool SHALL read all user-specific values (SSO start URL, region, production patterns) exclusively from CLI flags, environment variables, or the user's own AWS_Config file
3. THE CLI_Tool SHALL provide a standard installation mechanism (e.g., `npm install`, `pip install`, or a documented build step) so that users can install and run the tool without modifying source files
4. THE CLI_Tool SHALL document all required dependencies and supported runtime versions in the project README
5. THE CLI_Tool SHALL NOT require elevated or administrator privileges for standard operation (discovery and config generation)
6. WHEN the CLI_Tool is cloned or installed by a new user, THE CLI_Tool SHALL be functional after running the documented install step without additional per-user setup within the project


### Requirement 11: Interactive TUI Mode

**User Story:** As a developer with many AWS accounts, I want an interactive terminal interface to select which accounts and roles to generate profiles for, so that I can quickly pick the subset I need without generating profiles for every discovered account.

#### Acceptance Criteria

1. WHEN the user provides the `--interactive` or `-i` flag, THE CLI_Tool SHALL launch TUI_Mode after completing SSO account and role discovery
2. THE CLI_Tool SHALL default to non-interactive mode when the `--interactive` flag is not provided, preserving the existing CLI flag-driven behavior for scripting and automation
3. WHEN TUI_Mode is launched, THE CLI_Tool SHALL present a checkbox-style list of all discovered account-role combinations, with each item showing the Account_Name, account ID, and Permission_Set name
4. WHILE in TUI_Mode, THE CLI_Tool SHALL allow the user to toggle individual account-role combinations on or off using keyboard controls
5. WHILE in TUI_Mode, THE CLI_Tool SHALL provide a "select all" action and a "deselect all" action accessible via keyboard shortcuts
6. WHILE in TUI_Mode, THE CLI_Tool SHALL provide a search or filter input that narrows the displayed list to items matching the typed text against Account_Name, account ID, or Permission_Set name
7. WHEN a Production_Account is displayed in TUI_Mode, THE CLI_Tool SHALL visually distinguish the entry with a warning indicator consistent with the `⚠️  PRODUCTION ACCOUNT` convention defined in Requirement 3
8. WHEN the user confirms the selection in TUI_Mode, THE CLI_Tool SHALL display a summary of the selected profiles including count and profile names before proceeding with generation
9. WHEN the user approves the summary in TUI_Mode, THE CLI_Tool SHALL generate Profile_Entry blocks only for the confirmed account-role combinations
10. IF the user cancels during TUI_Mode selection or summary confirmation, THEN THE CLI_Tool SHALL exit without generating any profiles and display a cancellation message
11. WHEN TUI_Mode is used together with the `--write` flag, THE CLI_Tool SHALL write only the user-confirmed profiles to AWS_Config
12. WHEN TUI_Mode is used together with the `--prod-patterns` flag, THE CLI_Tool SHALL apply the custom production keywords when visually flagging Production_Accounts in the selection list
