# Implementation Plan: Web Config UI

## Overview

Add a browser-based configuration UI as the default mode for `aws-sso-config-gen`. The implementation creates three new modules (`web-server.ts`, `web-ui.ts`, `browser.ts`), modifies `cli.ts` to make web mode the default, and adds `--cli` flag for terminal-only mode. The web server uses Node.js built-in `http` module with REST API endpoints. The entire frontend is inline HTML/CSS/JS with no external dependencies.

## Tasks

- [x] 1. Create browser opener and web UI types
  - [x] 1.1 Create `src/browser.ts` — cross-platform browser opening
    - Export `openBrowser(url: string): boolean` function
    - Use `child_process.spawn` with detached/unref for: macOS (`open`), Linux (`xdg-open`), Windows (`cmd /c start "" "<url>"`)
    - Return `false` if spawn throws (command not found, etc.)
    - _Requirements: 2.2_

  - [x] 1.2 Write unit tests for `src/browser.ts`
    - Test correct command is spawned per platform (darwin, linux, win32)
    - Test returns false when spawn fails
    - Mock `child_process.spawn` and `process.platform`
    - _Requirements: 2.2_

  - [x] 1.3 Create `src/web-ui.ts` — inline HTML page
    - Export `renderWebUI(): string` function returning complete HTML/CSS/JS as a template string
    - Two-panel responsive layout (Discovery Panel left, Config Panel right) for 900px–1920px viewports
    - Discovery Panel: Profile_Cards grouped into "Production" (with ⚠️ indicator) and "Non-Production" sections
    - Config Panel: read-only text area for current config, Selected_Profiles list with editable name fields, Save/Done buttons
    - Backup Panel: list backups, preview, restore functionality
    - Vanilla JS: fetch `/api/data` on load, handle select/deselect/rename/remove/save/restore/shutdown via fetch calls
    - Frontend validation: sanitize profile names (lowercase, replace non-alphanumeric with hyphens, collapse, trim), check empty, check duplicates against existing and other selections
    - Save button disabled when no selections or validation errors exist
    - Semantic HTML: headings, buttons, labels, `<label>` elements or `aria-label` on all form inputs
    - Minimum 4.5:1 contrast ratio for text
    - No external CDN dependencies
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.5, 7.6, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4_

  - [x] 1.4 Write unit tests for `src/web-ui.ts`
    - `renderWebUI()` returns valid HTML with no external CDN references
    - HTML contains semantic elements (headings, buttons, labels)
    - HTML contains "Production" and "Non-Production" section structure
    - Production profile cards include ⚠️ indicator markup
    - All form inputs have associated labels or aria-label attributes
    - _Requirements: 10.1, 10.2, 4.3_

- [x] 2. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement web server with REST API endpoints
  - [x] 3.1 Create `src/web-server.ts` — HTTP server lifecycle and routing
    - Export `WebServerOptions` and `WebServerHandle` interfaces as defined in design
    - Export `startWebServer(options: WebServerOptions): Promise<WebServerHandle>` function
    - Bind to `127.0.0.1:0` (OS-assigned port) using Node.js built-in `http` module
    - Route `GET /` → serve inline HTML from `renderWebUI()` with `text/html` content-type
    - Route `GET /api/data` → return JSON with profiles, existingConfig (raw + profileNames array), and SSO metadata
    - Route `POST /api/save` → parse JSON body, validate request, build `GeneratedProfile[]` from selections using custom names, call `generateConfigBlocks()` and `writeConfig()`, re-read config, return result JSON
    - Route `GET /api/backups` → scan config file directory for `.bak.` files, return sorted list (most recent first) with filename, path, timestamp, size
    - Route `POST /api/restore` → validate backup path is in config directory, create new backup of current config, replace config with backup contents, return result JSON
    - Route `POST /api/shutdown` → send `{ ok: true }` response, then close server gracefully
    - All other routes → 404
    - Malformed POST bodies → 400 with `{ success: false, error: "Invalid request" }`
    - Config write errors → 500 with error message from `ConfigWriteError`
    - Return `WebServerHandle` with url, port, and `close()` method
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 3.2 Write unit tests for `src/web-server.ts`
    - Server binds to 127.0.0.1 on a random port
    - `GET /` returns HTML with correct content-type
    - `GET /api/data` returns correct JSON structure for known profiles
    - `POST /api/save` calls `generateConfigBlocks` and `writeConfig` with correct arguments
    - `POST /api/save` returns error response when `writeConfig` throws `ConfigWriteError`
    - `POST /api/shutdown` triggers graceful shutdown
    - Unknown routes return 404
    - Malformed POST body returns 400
    - `GET /api/backups` returns sorted backup list
    - `POST /api/restore` creates backup before restoring
    - _Requirements: 2.1, 2.4, 3.1, 7.1, 7.4, 9.3_

  - [x] 3.3 Write property test: API data response completeness
    - **Property 1: API data response completeness**
    - Generate arbitrary profiles (profileName, accountId, accountName, roleName, isProduction), config raw strings, existing profile name sets, and SSO metadata using fast-check
    - Start server with generated data, call `GET /api/data`, verify response contains every profile with all fields, raw config string, all existing profile names, and all SSO fields
    - Minimum 100 iterations
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 3.4 Write property test: Already-configured profiles identification
    - **Property 2: Already-configured profiles are correctly identified**
    - Generate arbitrary sets of discovered profile names and existing profile name sets using fast-check
    - Verify a profile is marked "already configured" if and only if its name appears in the existing profile names set
    - Minimum 100 iterations
    - **Validates: Requirements 4.4**

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement frontend validation logic and property tests
  - [x] 5.1 Export sanitization and validation helpers from `src/web-ui.ts` or a shared module
    - Extract the frontend sanitization logic into a testable function (can be exported from `web-ui.ts` or a new `src/web-validation.ts`)
    - Implement `sanitizeProfileName(input: string): string` matching `sanitizeName` rules
    - Implement `validateSelections(selections, existingNames): Map<string, string>` returning validation errors
    - Implement `isSaveDisabled(selections, validationErrors): boolean`
    - _Requirements: 6.2, 6.3, 6.4, 7.5_

  - [x] 5.2 Write property test: Frontend sanitization equivalence
    - **Property 3: Frontend sanitization equivalence**
    - Generate arbitrary strings using fast-check
    - Verify the web UI sanitization function produces the same result as `sanitizeName` from `naming.ts`
    - Minimum 100 iterations
    - **Validates: Requirements 6.2**

  - [x] 5.3 Write property test: Duplicate profile name detection
    - **Property 4: Duplicate profile name detection**
    - Generate arbitrary sets of existing profile names and selected profiles with custom names using fast-check
    - Verify a validation error is reported for a selected profile if and only if its sanitized custom name matches an existing profile name or another selected profile's sanitized custom name
    - Minimum 100 iterations
    - **Validates: Requirements 6.3**

  - [x] 5.4 Write property test: Save button disabled invariant
    - **Property 5: Save button disabled invariant**
    - Generate arbitrary UI states (varying selection counts and validation error counts) using fast-check
    - Verify Save button is disabled if and only if selections are empty or validation errors are non-empty
    - Minimum 100 iterations
    - **Validates: Requirements 7.5**

- [x] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Modify CLI to make web mode default and add --cli flag
  - [x] 7.1 Modify `src/cli.ts` — default web mode with `--cli` fallback
    - Add `--cli` flag option: "Run in terminal-only mode (original CLI behavior)"
    - Add `--web` flag as explicit alias for web mode (for documentation clarity)
    - Default behavior (no `--cli`): run Discovery Pipeline, then call `startWebServer()` + `openBrowser()`
    - When `--cli` is passed: preserve existing terminal-only behavior (dry-run, `--write`, `--interactive`, `--output`, `--force`)
    - When in web mode with `--write`, `--interactive`, `--output`, or `--force`: log a warning that these flags are ignored in web mode
    - After `startWebServer()` returns handle, print URL to stdout, call `openBrowser(handle.url)`, then await server close
    - Handle `SIGINT`/`SIGTERM`: call `handle.close()` for graceful shutdown
    - If `openBrowser()` returns false, print URL to stdout and continue (not fatal)
    - If Discovery Pipeline fails in web mode, use same `handleError()` path — exit code 1, no server started
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.2, 2.4_

  - [x] 7.2 Write unit tests for CLI web mode changes
    - Default mode (no flags) triggers web server path
    - `--cli` flag triggers terminal-only mode
    - `--web` flag triggers web server path
    - `--web` with `--write` logs a warning
    - `--web` with `--interactive` logs a warning
    - `--web` with `--output` logs a warning
    - Discovery failure in web mode shows error and exits with code 1
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 5 correctness properties from the design document using fast-check (already a dev dependency)
- Unit tests validate specific examples and edge cases
- The entire frontend is inline HTML/CSS/JS — no build step, no framework, no external dependencies
- All new modules use ESM imports with `.js` extensions per project convention
