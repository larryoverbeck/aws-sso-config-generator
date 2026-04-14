import * as fs from 'node:fs';
import * as ini from 'ini';
import { ConfigReadError, MalformedConfigWarning } from './types.js';
import type { ExistingConfig } from './types.js';

/**
 * Parse an existing AWS CLI config file and extract profile and session names.
 *
 * - Returns empty sets when the file does not exist (ENOENT).
 * - Throws `ConfigReadError` on permission errors (EACCES).
 * - Emits `MalformedConfigWarning` on parse errors, preserving raw content.
 */
export function parseExistingConfig(configPath: string): ExistingConfig {
  let raw: string;

  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;

    if (code === 'ENOENT') {
      return { raw: '', profileNames: new Set(), sessionNames: new Set() };
    }

    if (code === 'EACCES') {
      throw new ConfigReadError(configPath);
    }

    // Any other read error — treat as unrecoverable
    throw new ConfigReadError(
      configPath,
      `Cannot read ${configPath}: ${(err as Error).message}`
    );
  }

  const profileNames = new Set<string>();
  const sessionNames = new Set<string>();

  try {
    const parsed = ini.parse(raw);

    for (const section of Object.keys(parsed)) {
      if (section.startsWith('profile ')) {
        profileNames.add(section.slice('profile '.length));
      } else if (section.startsWith('sso-session ')) {
        sessionNames.add(section.slice('sso-session '.length));
      } else if (section === 'default') {
        // The [default] section is a valid profile name in AWS config
        profileNames.add('default');
      }
    }
  } catch {
    // INI parse failed — emit warning, preserve raw content, return what we can
    const warning = new MalformedConfigWarning(configPath);
    console.warn(warning.message);
  }

  return { raw, profileNames, sessionNames };
}
