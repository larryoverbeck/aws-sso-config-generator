import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { PlatformPaths } from './types.js';

/**
 * Resolves OS-specific paths for AWS CLI configuration and SSO cache.
 *
 * - On Windows (`win32`): uses `process.env.USERPROFILE` or `os.homedir()`
 * - On macOS/Linux: uses `os.homedir()`
 * - Respects `AWS_CONFIG_FILE` env var override for `configPath`
 */
export function resolvePlatformPaths(): PlatformPaths {
  const home =
    process.platform === 'win32'
      ? process.env.USERPROFILE || os.homedir()
      : os.homedir();

  const awsHomeDir = path.join(home, '.aws');
  const configPath =
    process.env.AWS_CONFIG_FILE || path.join(awsHomeDir, 'config');
  const ssoCacheDir = path.join(awsHomeDir, 'sso', 'cache');

  return { awsHomeDir, configPath, ssoCacheDir };
}

/**
 * Creates a directory (and any missing parents) if it does not already exist.
 * Uses mode `0o700` (owner-only rwx) for security.
 */
export function ensureDirectoryExists(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
}
