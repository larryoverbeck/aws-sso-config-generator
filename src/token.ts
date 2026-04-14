import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SsoToken } from './types.js';
import { TokenExpiredError, TokenNotFoundError } from './types.js';

/**
 * Returns `true` if the token's `expiresAt` timestamp is in the past.
 */
export function isTokenExpired(token: SsoToken): boolean {
  return new Date(token.expiresAt).getTime() <= Date.now();
}

/**
 * Reads the cached SSO token for the given `startUrl` from the SSO cache directory.
 *
 * The cache filename is the SHA-1 hex digest of the `startUrl` with a `.json` extension.
 *
 * @throws {TokenNotFoundError} if no matching cache file exists or the file is unreadable/malformed
 * @throws {TokenExpiredError} if the token's `expiresAt` is in the past
 */
export function readCachedToken(ssoCacheDir: string, startUrl: string): SsoToken {
  const hash = createHash('sha1').update(startUrl).digest('hex');
  const cacheFile = path.join(ssoCacheDir, `${hash}.json`);

  let raw: string;
  try {
    raw = fs.readFileSync(cacheFile, 'utf-8');
  } catch {
    throw new TokenNotFoundError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TokenNotFoundError();
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).accessToken !== 'string' ||
    typeof (parsed as Record<string, unknown>).expiresAt !== 'string'
  ) {
    throw new TokenNotFoundError();
  }

  const token = parsed as SsoToken;

  if (isTokenExpired(token)) {
    throw new TokenExpiredError();
  }

  return token;
}
