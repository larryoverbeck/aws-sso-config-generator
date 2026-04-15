#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as ini from 'ini';
import { resolvePlatformPaths } from './platform.js';
import { readCachedToken } from './token.js';
import { discoverAccountsAndRoles } from './discovery.js';
import { generateProfileNames } from './naming.js';
import { parseExistingConfig } from './config-parser.js';
import { generateConfigBlocks, writeConfig } from './config-writer.js';
import { selectProfiles } from './tui.js';
import { startWebServer } from './web-server.js';
import { openBrowser } from './browser.js';
import { loadProdAccountIds } from './prod-accounts.js';
import { execFileSync } from 'node:child_process';
import type { CliConfig } from './types.js';
import {
  TokenExpiredError,
  TokenNotFoundError,
  AuthorizationError,
  NetworkError,
  ConfigReadError,
  ConfigWriteError,
  MissingStartUrlError,
} from './types.js';

/**
 * Derive a session name from an SSO start URL by extracting the hostname
 * and taking the first segment before the first dot.
 * e.g. "https://myorg.awsapps.com/start" → "myorg"
 */
function deriveSessionName(ssoStartUrl: string): string {
  try {
    const hostname = new URL(ssoStartUrl).hostname;
    return hostname.split('.')[0];
  } catch {
    return 'default';
  }
}

/**
 * Attempt to read an SSO start URL from an existing AWS config file.
 * Looks for the first `[sso-session ...]` section that has a `sso_start_url` key.
 */
function readStartUrlFromConfig(configPath: string): string | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    return undefined;
  }

  try {
    const parsed = ini.parse(raw);
    for (const section of Object.keys(parsed)) {
      if (section.startsWith('sso-session ')) {
        const value = parsed[section];
        if (value && typeof value === 'object' && typeof value.sso_start_url === 'string') {
          return value.sso_start_url;
        }
      }
    }
  } catch {
    // Config is malformed or unparseable — ignore
  }

  return undefined;
}

/**
 * Attempt to read a cached SSO token, automatically running `aws sso login`
 * if the token is expired or not found.
 */
function readTokenWithAutoLogin(ssoCacheDir: string, ssoStartUrl: string, sessionName: string): ReturnType<typeof readCachedToken> {
  try {
    return readCachedToken(ssoCacheDir, ssoStartUrl);
  } catch (err) {
    if (err instanceof TokenExpiredError || err instanceof TokenNotFoundError) {
      const reason = err instanceof TokenExpiredError ? 'SSO session expired' : 'No SSO token found';
      console.log(`\n⚠️  ${reason}. Logging in automatically...\n`);
      console.log(`  Your browser will open — log in with Okta, then click "Allow access" to authorize the CLI.\n`);

      try {
        execFileSync('aws', ['sso', 'login', '--sso-session', sessionName], {
          stdio: 'inherit',
        });
      } catch {
        console.error(`\n✖ aws sso login failed. Please run it manually:\n  aws sso login --sso-session ${sessionName}\n`);
        process.exit(1);
      }

      // Retry after login
      return readCachedToken(ssoCacheDir, ssoStartUrl);
    }
    throw err;
  }
}

/**
 * Handle known error types with user-friendly messages and exit with code 1.
 */
function handleError(error: unknown): never {
  if (error instanceof TokenExpiredError) {
    console.error(`\n✖ SSO session expired.\n  Run \`aws sso login\` to refresh, then try again.\n`);
    process.exit(1);
  }

  if (error instanceof TokenNotFoundError) {
    console.error(`\n✖ No SSO token found.\n  Run \`aws sso login\` first.\n`);
    process.exit(1);
  }

  if (error instanceof AuthorizationError) {
    console.error(`\n✖ SSO authorization failed — session may be expired.\n  Run \`aws sso login\` to refresh.\n`);
    process.exit(1);
  }

  if (error instanceof NetworkError) {
    console.error(`\n✖ Cannot reach SSO endpoint at ${error.endpoint}\n  Check your network connectivity and verify the SSO start URL is correct.\n`);
    process.exit(1);
  }

  if (error instanceof ConfigReadError) {
    console.error(`\n✖ ${error.message}\n`);
    process.exit(1);
  }

  if (error instanceof ConfigWriteError) {
    console.error(`\n✖ ${error.message}\n  Check file permissions or use --output <path> to write to a different location.\n`);
    process.exit(1);
  }

  if (error instanceof MissingStartUrlError) {
    console.error(`\n✖ No SSO start URL provided.\n  Use --sso-start-url <url> or configure an sso-session in ~/.aws/config.\n\n  Example:\n    aws-sso-config-gen --sso-start-url https://my-org.awsapps.com/start\n`);
    process.exit(1);
  }

  // Unknown error
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/**
 * Creates and returns the commander program instance (exported for testing).
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('aws-sso-config-gen')
    .description('Generate AWS CLI config profiles from SSO account discovery')
    .version('1.0.0')
    .option('--sso-start-url <url>', 'SSO portal start URL')
    .option('--sso-region <region>', 'SSO API region', 'us-east-1')
    .option('--session-name <name>', 'SSO session name (derived from URL if omitted)')
    .option('--default-region <region>', 'Default region for generated profiles', 'us-east-1')
    .option('--output-format <format>', 'Output format for generated profiles', 'json')
    .option('--prod-patterns <patterns>', 'Comma-separated production keywords', 'prod,production,prd')
    .option('--write', 'Write generated config to ~/.aws/config', false)
    .option('--force', 'Overwrite existing profiles', false)
    .option('--output <path>', 'Write generated config to a custom file path')
    .option('-i, --interactive', 'Launch interactive TUI selection mode', false)
    .option('--cli', 'Run in terminal-only mode (original CLI behavior)', false)
    .option('--web', 'Run in web mode (default)', false);

  program.action(async (opts) => {
    if (opts.cli) {
      await runPipeline(opts);
    } else {
      await runWebMode(opts);
    }
  });

  return program;
}

/**
 * Main pipeline: resolves config, discovers accounts, generates profiles, outputs results.
 */
async function runPipeline(opts: Record<string, unknown>): Promise<void> {
  try {
    // 1. Resolve platform paths
    const paths = resolvePlatformPaths();

    // 2. Determine SSO start URL
    let ssoStartUrl = opts.ssoStartUrl as string | undefined;

    if (!ssoStartUrl) {
      ssoStartUrl = readStartUrlFromConfig(paths.configPath);
    }

    if (!ssoStartUrl) {
      throw new MissingStartUrlError();
    }

    // 3. Resolve CLI config
    const ssoRegion = opts.ssoRegion as string;
    const sessionName = (opts.sessionName as string | undefined) ?? deriveSessionName(ssoStartUrl);
    const defaultRegion = opts.defaultRegion as string;
    const outputFormat = opts.outputFormat as string;
    const prodPatterns = (opts.prodPatterns as string).split(',').map((s: string) => s.trim());
    const shouldWrite = opts.write as boolean;
    const force = opts.force as boolean;
    const outputPath = opts.output as string | undefined;
    const interactive = opts.interactive as boolean;

    const config: CliConfig = {
      ssoStartUrl,
      ssoRegion,
      sessionName,
      defaultRegion,
      outputFormat,
      prodPatterns,
      write: shouldWrite,
      force,
      outputPath,
      interactive,
    };

    // 4. Read cached SSO token
    console.log(`\n🔍 Discovering accounts for ${config.ssoStartUrl} ...\n`);
    const token = readTokenWithAutoLogin(paths.ssoCacheDir, config.ssoStartUrl, config.sessionName);

    // 5. Discover accounts and roles
    const discovery = await discoverAccountsAndRoles(token.accessToken, config.ssoRegion);

    // 6. Display discovery summary
    console.log(`  Found ${discovery.accounts.length} accounts, ${discovery.roles.length} account-role combinations.\n`);

    if (discovery.roles.length === 0) {
      console.log('  No roles discovered. Nothing to generate.\n');
      return;
    }

    // 7. Generate profile names
    const prodAccountIds = loadProdAccountIds();
    let profiles = generateProfileNames(discovery.roles, { prodPatterns: config.prodPatterns, prodAccountIds });

    // 8. Interactive TUI selection
    if (config.interactive) {
      profiles = await selectProfiles(profiles);
      if (profiles.length === 0) {
        return;
      }
    }

    // 9. Parse existing config
    const existing = parseExistingConfig(paths.configPath);

    // 10. Generate config blocks
    const { content, written, skipped } = generateConfigBlocks(profiles, existing, {
      ssoStartUrl: config.ssoStartUrl,
      ssoRegion: config.ssoRegion,
      sessionName: config.sessionName,
      defaultRegion: config.defaultRegion,
      outputFormat: config.outputFormat,
      force: config.force,
    });

    // 11. Output based on mode
    if (outputPath) {
      // Write to custom output path
      fs.writeFileSync(outputPath, content.trimStart(), 'utf-8');
      console.log(`✅ Written to ${outputPath}\n`);
    } else if (shouldWrite) {
      // Write to config file
      const { backupPath } = writeConfig(content, paths.configPath, true);

      if (backupPath) {
        console.log(`📂 Backed up existing config to:\n   ${backupPath}\n`);
      }

      // Report skipped profiles
      if (skipped.length > 0 && !force) {
        console.log(`⚠️  Skipped (already exist in ${paths.configPath}):`);
        for (const s of skipped) {
          console.log(`   Skipped: ${s.profileName} — ${s.reason}`);
        }
        console.log();
      }

      console.log(`✅ Written to ${paths.configPath}\n`);
    } else {
      // Dry-run: print to stdout
      console.log('📝 Generated config (dry-run — not written):\n');
      console.log(content.trimStart());
    }

    // 12. Display summary
    printSummary(written, skipped, shouldWrite, outputPath, paths.configPath);
  } catch (error) {
    handleError(error);
  }
}

/**
 * Web mode: runs Discovery Pipeline, starts web server, opens browser.
 */
async function runWebMode(opts: Record<string, unknown>): Promise<void> {
  try {
    // Warn about flags that are ignored in web mode
    const ignoredFlags: string[] = [];
    if (opts.write) ignoredFlags.push('--write');
    if (opts.interactive) ignoredFlags.push('--interactive');
    if (opts.output) ignoredFlags.push('--output');
    if (opts.force) ignoredFlags.push('--force');

    if (ignoredFlags.length > 0) {
      console.warn(`\n⚠️  ${ignoredFlags.join(', ')} ignored in web mode. Use --cli for terminal-only mode.\n`);
    }

    // 1. Resolve platform paths
    const paths = resolvePlatformPaths();

    // 2. Determine SSO start URL
    let ssoStartUrl = opts.ssoStartUrl as string | undefined;

    if (!ssoStartUrl) {
      ssoStartUrl = readStartUrlFromConfig(paths.configPath);
    }

    if (!ssoStartUrl) {
      throw new MissingStartUrlError();
    }

    // 3. Resolve config
    const ssoRegion = opts.ssoRegion as string;
    const sessionName = (opts.sessionName as string | undefined) ?? deriveSessionName(ssoStartUrl);
    const defaultRegion = opts.defaultRegion as string;
    const outputFormat = opts.outputFormat as string;
    const prodPatterns = (opts.prodPatterns as string).split(',').map((s: string) => s.trim());

    // 4. Read cached SSO token
    console.log(`\n🔍 Discovering accounts for ${ssoStartUrl} ...\n`);
    const token = readTokenWithAutoLogin(paths.ssoCacheDir, ssoStartUrl, sessionName);

    // 5. Discover accounts and roles
    const discovery = await discoverAccountsAndRoles(token.accessToken, ssoRegion);

    console.log(`  Found ${discovery.accounts.length} accounts, ${discovery.roles.length} account-role combinations.\n`);

    if (discovery.roles.length === 0) {
      console.log('  No roles discovered. Nothing to generate.\n');
      return;
    }

    // 6. Generate profile names
    const prodAccountIds = loadProdAccountIds();
    const profiles = generateProfileNames(discovery.roles, { prodPatterns, prodAccountIds });

    // 7. Parse existing config
    const existingConfig = parseExistingConfig(paths.configPath);

    // 8. Start web server
    const handle = await startWebServer({
      profiles,
      existingConfig,
      configPath: paths.configPath,
      ssoStartUrl,
      ssoRegion,
      sessionName,
      defaultRegion,
      outputFormat,
    });

    console.log(`\n🌐 Web UI available at ${handle.url}\n`);

    // 9. Open browser
    const opened = openBrowser(handle.url);
    if (!opened) {
      console.log(`  Could not open browser automatically. Open ${handle.url} in your browser.\n`);
    }

    // 10. Wait for server to close (via /api/shutdown or signal)
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        console.log('\n🛑 Shutting down...\n');
        handle.close().then(resolve).catch(resolve);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
  } catch (error) {
    handleError(error);
  }
}

/**
 * Print a final summary of the operation.
 */
function printSummary(
  written: string[],
  skipped: { profileName: string; reason: string }[],
  isWrite: boolean,
  outputPath: string | undefined,
  configPath: string,
): void {
  console.log('─────────────────────────────────────────');

  const mode = isWrite || outputPath ? 'Summary' : 'Summary (dry-run)';
  console.log(`${mode}:`);
  console.log(`  ${written.length} profiles ${isWrite || outputPath ? 'written' : 'generated'}`);
  console.log(`  ${skipped.length} profiles skipped${skipped.length > 0 ? ' (already exist)' : ''}`);

  if (!isWrite && !outputPath) {
    console.log(`  Use --write to apply to ${configPath}`);
  }

  console.log();
}

// Run the CLI only when executed directly (not imported for testing)
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/cli.js') || process.argv[1].endsWith('\\cli.js'));

if (isDirectRun) {
  const program = createProgram();
  program.parse();
}
