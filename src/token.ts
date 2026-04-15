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
 * Scans all `.json` files in the cache directory and finds the one whose
 * `startUrl` field matches and that contains a valid `accessToken`.
 * The AWS CLI v2 does not use a predictable filename scheme, so we check every file.
 *
 * @throws {TokenNotFoundError} if no matching cache file exists or the file is unreadable/malformed
 * @throws {TokenExpiredError} if the token's `expiresAt` is in the past
 */
export function readCachedToken(ssoCacheDir: string, startUrl: string): SsoToken {
  let files: string[];
  try {
    files = fs.readdirSync(ssoCacheDir).filter((f) => f.endsWith('.json'));
  } catch {
    throw new TokenNotFoundError();
  }

  // Find the most recently modified matching token
  let bestToken: SsoToken | undefined;
  let bestMtime = 0;

  for (const file of files) {
    const filePath = path.join(ssoCacheDir, file);

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).accessToken !== 'string' ||
      typeof (parsed as Record<string, unknown>).expiresAt !== 'string' ||
      typeof (parsed as Record<string, unknown>).startUrl !== 'string'
    ) {
      continue;
    }

    const candidate = parsed as SsoToken;

    if (candidate.startUrl !== startUrl) {
      continue;
    }

    // Pick the most recently modified file in case there are multiple matches
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs > bestMtime) {
        bestToken = candidate;
        bestMtime = stat.mtimeMs;
      }
    } catch {
      // If we can't stat it, still use it if it's the only match
      if (!bestToken) {
        bestToken = candidate;
      }
    }
  }

  if (!bestToken) {
    throw new TokenNotFoundError();
  }

  if (isTokenExpired(bestToken)) {
    throw new TokenExpiredError();
  }

  return bestToken;
}
