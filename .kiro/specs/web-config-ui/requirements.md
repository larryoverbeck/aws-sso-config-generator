# Requirements Document

## Introduction

This feature adds a local web-based UI to the existing `aws-sso-config-gen` CLI tool. The web UI is the default mode — running `./aws-sso-config-gen` opens the browser automatically. Users who need terminal-only mode for scripting can use the `--cli` flag. The UI triggers SSO discovery, starts a local HTTP server, and opens a two-panel browser interface. The left panel displays all discovered SSO account/role profiles grouped by production status; the right panel shows the current `~/.aws/config` contents and any profiles the user selects to add. Users can rename profiles inline before saving. Saving creates a backup and appends the selected profiles to the config file. Users can also view and restore previous backups from within the UI.

## Glossary

- **Web_Server**: The local Node.js HTTP server started by default (or with the `--web` flag), serving the Web_UI and exposing a REST API for discovery data and config operations.
- **Web_UI**: The browser-based single-page interface rendered by the Web_Server, consisting of the Discovery_Panel and the Config_Panel.
- **Discovery_Panel**: The left panel of the Web_UI that displays all discovered SSO profiles grouped by production and non-production categories.
- **Config_Panel**: The right panel of the Web_UI that displays the current config file contents and profiles selected for addition.
- **Profile_Card**: A clickable UI element in the Discovery_Panel representing a single discovered SSO account/role combination.
- **Selected_Profile**: A profile that the user has moved from the Discovery_Panel to the Config_Panel for inclusion in the config file.
- **Config_File**: The AWS CLI configuration file at `~/.aws/config` (or the path resolved by `AWS_CONFIG_FILE`).
- **CLI_Mode**: The terminal-only mode activated by the `--cli` flag, which preserves the original CLI behavior (dry-run, `--write`, `--interactive`, etc.).
- **Discovery_Pipeline**: The sequence of operations that resolves platform paths, reads the cached SSO token, discovers accounts and roles, and generates profile names — reusing existing modules (`platform.ts`, `token.ts`, `discovery.ts`, `naming.ts`).
- **Backup_File**: A timestamped copy of the Config_File created before writing new profiles.
- **Backup_Panel**: A section of the Web_UI that lists available Backup_Files and allows the user to preview and restore a previous config.

## Requirements

### Requirement 1: Default Web Mode and CLI Flag

**User Story:** As a user, I want the web UI to launch by default when I run the tool, so that I get the visual interface without remembering extra flags.

#### Acceptance Criteria

1. WHEN the user runs the tool without the `--cli` flag, THE tool SHALL run the Discovery_Pipeline and start the Web_Server on an available local port (web mode is the default).
2. WHEN the Web_Server starts successfully, THE tool SHALL open the user's default browser to the Web_Server URL.
3. WHEN the user passes the `--cli` flag, THE tool SHALL run in terminal-only mode, preserving the existing CLI behavior (dry-run, `--write`, `--interactive`, `--output`, `--force`).
4. WHILE in web mode, THE tool SHALL ignore the `--write`, `--interactive`, `--output`, and `--force` flags and log a warning if any are provided without `--cli`.
5. IF the Discovery_Pipeline fails during web mode startup, THEN THE tool SHALL display the same user-friendly error messages used in CLI_Mode and exit with code 1 without starting the Web_Server.
6. THE `--web` flag SHALL remain as an explicit alias for web mode, for clarity in scripts or documentation.

### Requirement 2: Local Web Server Lifecycle

**User Story:** As a user, I want the web server to start and stop automatically, so that I do not have to manage background processes.

#### Acceptance Criteria

1. THE Web_Server SHALL bind to `127.0.0.1` on an available port (not a fixed port) to avoid conflicts with other local services.
2. WHEN the Web_Server starts, THE CLI SHALL print the local URL (e.g., `http://127.0.0.1:<port>`) to stdout.
3. WHEN the user completes a save operation via the Web_UI, THE Web_Server SHALL remain running so the user can continue to view backups or make additional changes.
4. WHEN the user clicks a "Close" or "Done" button in the Web_UI, OR sends a `SIGINT` or `SIGTERM` signal to the CLI process, THE Web_Server SHALL shut down gracefully without writing partial data to the Config_File.
5. THE Web_Server SHALL serve the Web_UI as inline HTML (no external CDN dependencies or separate static file directories) so the tool remains a single self-contained package.

### Requirement 3: Discovery Data API

**User Story:** As a developer of the Web_UI, I want a local REST endpoint that provides discovery data, so that the frontend can render profiles without re-running discovery.

#### Acceptance Criteria

1. WHEN the Web_UI requests discovery data, THE Web_Server SHALL respond with a JSON payload containing all discovered profiles, each including the profile name, account ID, account name, role name, and production flag.
2. THE Web_Server SHALL include the current Config_File raw contents and the set of existing profile names in the discovery data response.
3. THE Web_Server SHALL include the SSO session metadata (start URL, SSO region, session name, default region, output format) in the discovery data response.

### Requirement 4: Discovery Panel Display

**User Story:** As a user, I want to see all discovered SSO profiles organized by production status, so that I can quickly identify and select the profiles I need.

#### Acceptance Criteria

1. THE Discovery_Panel SHALL display all discovered profiles as Profile_Cards grouped into two sections: "Production" and "Non-Production".
2. THE Discovery_Panel SHALL display each Profile_Card with the profile name, account name, account ID, and role name.
3. THE Discovery_Panel SHALL display a ⚠️ warning indicator on each production Profile_Card.
4. WHEN a profile name already exists in the Config_File, THE Discovery_Panel SHALL visually mark that Profile_Card as "already configured" and disable selection for that Profile_Card.
5. WHEN the user clicks an available Profile_Card, THE Discovery_Panel SHALL move that profile to the Config_Panel as a Selected_Profile and visually indicate the Profile_Card is selected.

### Requirement 5: Config Panel Display

**User Story:** As a user, I want to see my current config and the profiles I am about to add, so that I can review changes before saving.

#### Acceptance Criteria

1. THE Config_Panel SHALL display the current Config_File contents in a read-only text area at the top of the panel.
2. WHEN the Config_File does not exist or is empty, THE Config_Panel SHALL display a placeholder message indicating no existing config was found.
3. THE Config_Panel SHALL display all Selected_Profiles below the current config contents, each showing the profile name, account ID, and role name.
4. WHEN the user has not selected any profiles, THE Config_Panel SHALL display a placeholder message prompting the user to select profiles from the Discovery_Panel.

### Requirement 6: Inline Profile Renaming

**User Story:** As a user, I want to rename profile names before saving, so that I can customize profile names to match my team's naming conventions.

#### Acceptance Criteria

1. THE Config_Panel SHALL display each Selected_Profile name in an editable text field.
2. WHEN the user modifies a profile name, THE Config_Panel SHALL sanitize the input using the same rules as the existing `sanitizeName` function (lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim leading/trailing hyphens).
3. IF the user enters a profile name that conflicts with an existing profile in the Config_File or another Selected_Profile, THEN THE Config_Panel SHALL display an inline validation error and disable the Save button.
4. IF the user clears a profile name field entirely, THEN THE Config_Panel SHALL display an inline validation error indicating the profile name is required.
5. WHEN the user clicks a remove button on a Selected_Profile, THE Config_Panel SHALL remove that profile from the selection and restore the corresponding Profile_Card in the Discovery_Panel to its available state.

### Requirement 7: Save Operation

**User Story:** As a user, I want to save my selected profiles to the config file with one click, so that the profiles are immediately available for use with the AWS CLI.

#### Acceptance Criteria

1. WHEN the user clicks the Save button with one or more valid Selected_Profiles, THE Web_Server SHALL generate config blocks using the existing `generateConfigBlocks` function with the user-specified profile names.
2. WHEN the save operation executes, THE Web_Server SHALL create a Backup_File of the current Config_File before writing, using the existing `writeConfig` function.
3. WHEN the save operation completes successfully, THE Web_UI SHALL display a success message showing the number of profiles written and the Backup_File path.
4. IF the save operation fails due to a file permission error, THEN THE Web_UI SHALL display an error message indicating the Config_File cannot be written and suggest checking file permissions.
5. WHILE no Selected_Profiles are present or any validation error exists, THE Config_Panel SHALL keep the Save button disabled.
6. WHEN the save operation completes successfully, THE Web_UI SHALL refresh the Config_Panel to show the updated Config_File contents and clear the selection.

### Requirement 8: Profile Deselection

**User Story:** As a user, I want to remove profiles from my selection before saving, so that I can adjust my choices without restarting the process.

#### Acceptance Criteria

1. WHEN the user clicks a selected Profile_Card in the Discovery_Panel, THE Web_UI SHALL remove the corresponding Selected_Profile from the Config_Panel and restore the Profile_Card to its available state.
2. WHEN the user removes a Selected_Profile from the Config_Panel, THE Web_UI SHALL restore the corresponding Profile_Card in the Discovery_Panel to its available state.

### Requirement 9: Backup Viewing and Rollback

**User Story:** As a user, I want to view and restore previous config backups from the web UI, so that I can undo changes without manually finding and copying backup files.

#### Acceptance Criteria

1. THE Web_UI SHALL display a Backup_Panel that lists all available Backup_Files found in the same directory as the Config_File, sorted by timestamp (most recent first).
2. WHEN the user clicks a Backup_File entry, THE Web_UI SHALL display the contents of that backup in a preview area.
3. WHEN the user clicks a "Restore" button on a Backup_File, THE Web_Server SHALL create a new Backup_File of the current Config_File, then replace the Config_File contents with the selected Backup_File contents.
4. WHEN a restore operation completes successfully, THE Web_UI SHALL display a success message and refresh the Config_Panel to show the restored contents.
5. IF no Backup_Files exist, THE Backup_Panel SHALL display a message indicating no backups are available.

### Requirement 10: Web UI Accessibility and Usability

**User Story:** As a user, I want the web UI to be usable and accessible, so that I can operate it efficiently regardless of input method.

#### Acceptance Criteria

1. THE Web_UI SHALL use semantic HTML elements (headings, buttons, labels, form inputs) for all interactive components.
2. THE Web_UI SHALL associate all form inputs with visible labels using `<label>` elements or `aria-label` attributes.
3. THE Web_UI SHALL render correctly in viewport widths from 900px to 1920px using a responsive two-panel layout.
4. THE Web_UI SHALL use a color scheme that provides a minimum contrast ratio of 4.5:1 for all text content against its background.
