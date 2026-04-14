import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readCachedToken, isTokenExpired } from './token.js';
import { TokenExpiredError, TokenNotFoundError } from './types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sso-token-test-'));
}

function cacheFileName(startUrl: string): string {
  return createHash('sha1').update(startUrl).digest('hex') + '.json';
}

describe('isTokenExpired', () => {
  it('returns false for a token expiring in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isTokenExpired({ accessToken: 'tok', expiresAt: future })).toBe(false);
  });

  it('returns true for a token that expired in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isTokenExpired({ accessToken: 'tok', expiresAt: past })).toBe(true);
  });

  it('returns true for a token expiring exactly now (boundary)', () => {
    // expiresAt <= Date.now() is expired
    const now = new Date(Date.now() - 1).toISOString();
    expect(isTokenExpired({ accessToken: 'tok', expiresAt: now })).toBe(true);
  });
});

describe('readCachedToken', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reads a valid, non-expired token', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://my-org.awsapps.com/start';
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const tokenData = {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9',
      expiresAt: futureDate,
      region: 'us-east-1',
      startUrl,
    };

    fs.writeFileSync(
      path.join(tmpDir, cacheFileName(startUrl)),
      JSON.stringify(tokenData),
    );

    const token = readCachedToken(tmpDir, startUrl);

    expect(token.accessToken).toBe('eyJhbGciOiJIUzI1NiJ9');
    expect(token.expiresAt).toBe(futureDate);
    expect(token.region).toBe('us-east-1');
    expect(token.startUrl).toBe(startUrl);
  });

  it('throws TokenExpiredError for an expired token', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://expired.awsapps.com/start';
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();
    const tokenData = {
      accessToken: 'expired-tok',
      expiresAt: pastDate,
    };

    fs.writeFileSync(
      path.join(tmpDir, cacheFileName(startUrl)),
      JSON.stringify(tokenData),
    );

    expect(() => readCachedToken(tmpDir, startUrl)).toThrow(TokenExpiredError);
  });

  it('throws TokenNotFoundError when cache file does not exist', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://missing.awsapps.com/start';

    expect(() => readCachedToken(tmpDir, startUrl)).toThrow(TokenNotFoundError);
  });

  it('throws TokenNotFoundError for malformed JSON in cache file', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://malformed.awsapps.com/start';

    fs.writeFileSync(
      path.join(tmpDir, cacheFileName(startUrl)),
      'not valid json {{{',
    );

    expect(() => readCachedToken(tmpDir, startUrl)).toThrow(TokenNotFoundError);
  });

  it('throws TokenNotFoundError when JSON is valid but missing required fields', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://incomplete.awsapps.com/start';

    fs.writeFileSync(
      path.join(tmpDir, cacheFileName(startUrl)),
      JSON.stringify({ someOtherField: 'value' }),
    );

    expect(() => readCachedToken(tmpDir, startUrl)).toThrow(TokenNotFoundError);
  });
});
