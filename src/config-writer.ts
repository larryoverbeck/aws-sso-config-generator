import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigWriteError } from './types.js';
import type { GeneratedProfile, ExistingConfig, WriteOptions, SkippedProfile } from './types.js';

/**
 * Generate INI-formatted config blocks for the given profiles.
 *
 * - Produces an SSO session block at the top if the session name is not already present.
 * - Orders production profiles first (alphabetically), then non-production (alphabetically).
 * - Skips profiles that already exist (unless `force` is true), collecting them into a skipped list.
 * - Adds a `# ⚠️  PRODUCTION ACCOUNT` comment above production profile blocks.
 */
export function generateConfigBlocks(
  profiles: GeneratedProfile[],
  existing: ExistingConfig,
  options: WriteOptions,
): { content: string; written: string[]; skipped: SkippedProfile[] } {
  const written: string[] = [];
  const skipped: SkippedProfile[] = [];

  // Partition into included vs skipped based on existing profile names
  const included: GeneratedProfile[] = [];
  for (const profile of profiles) {
    if (!options.force && existing.profileNames.has(profile.profileName)) {
      skipped.push({
        profileName: profile.profileName,
        reason: 'profile already exists in config',
      });
    } else {
      included.push(profile);
    }
  }

  // Sort: production first (alphabetically), then non-production (alphabetically)
  const sorted = [...included].sort((a, b) => {
    if (a.isProduction !== b.isProduction) {
      return a.isProduction ? -1 : 1;
    }
    return a.profileName.localeCompare(b.profileName);
  });

  const blocks: string[] = [];

  // Generate SSO session block if it doesn't already exist
  if (!existing.sessionNames.has(options.sessionName)) {
    blocks.push(
      [
        `[sso-session ${options.sessionName}]`,
        `sso_start_url = ${options.ssoStartUrl}`,
        `sso_region = ${options.ssoRegion}`,
        `sso_registration_scopes = sso:account:access`,
      ].join('\n'),
    );
  }

  // Generate profile blocks
  for (const profile of sorted) {
    const lines: string[] = [];

    if (profile.isProduction) {
      lines.push('# ⚠️  PRODUCTION ACCOUNT');
    }

    lines.push(
      `[profile ${profile.profileName}]`,
      `sso_session = ${options.sessionName}`,
      `sso_account_id = ${profile.accountId}`,
      `sso_role_name = ${profile.roleName}`,
      `region = ${options.defaultRegion}`,
      `output = ${options.outputFormat}`,
    );

    blocks.push(lines.join('\n'));
    written.push(profile.profileName);
  }

  const content = blocks.length > 0 ? '\n' + blocks.join('\n\n') + '\n' : '';

  return { content, written, skipped };
}

/**
 * Write generated config content to disk.
 *
 * - Creates a timestamped backup (`<configPath>.bak.<ISO-timestamp>`) when `createBackup` is true
 *   and the config file already exists.
 * - Appends the content to the config file.
 * - Throws `ConfigWriteError` on permission or other write errors.
 */
export function writeConfig(
  content: string,
  configPath: string,
  createBackup: boolean,
): { backupPath?: string } {
  let backupPath: string | undefined;

  try {
    // Create backup if requested and the file exists
    if (createBackup && fs.existsSync(configPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '');
      backupPath = `${configPath}.bak.${timestamp}`;
      fs.copyFileSync(configPath, backupPath);
    }

    // Ensure the parent directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append generated content
    fs.appendFileSync(configPath, content, 'utf-8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;

    if (code === 'EACCES') {
      throw new ConfigWriteError(configPath);
    }

    throw new ConfigWriteError(
      configPath,
      `Cannot write to ${configPath}: ${(err as Error).message}`,
    );
  }

  return { backupPath };
}
