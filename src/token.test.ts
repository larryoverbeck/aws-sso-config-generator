import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readCachedToken, isTokenExpired } from './token.js';
import { TokenExpiredError, TokenNotFoundError } from './types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sso-token-test-'));
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

  it('reads a valid, non-expired token by scanning all files', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://my-org.awsapps.com/start';
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const tokenData = {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9',
      expiresAt: futureDate,
      region: 'us-east-1',
      startUrl,
    };

    // Use an arbitrary filename — not a SHA-1 hash
    fs.writeFileSync(
      path.join(tmpDir, 'some-random-name.json'),
      JSON.stringify(tokenData),
    );

    const token = readCachedToken(tmpDir, startUrl);

    expect(token.accessToken).toBe('eyJhbGciOiJIUzI1NiJ9');
    expect(token.expiresAt).toBe(futureDate);
    expect(token.region).toBe('us-east-1');
    expect(token.startUrl).toBe(startUrl);
  });

  it('picks the most recently modified file when multiple match', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://my-org.awsapps.com/start';
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();

    // Write an older file
    const oldFile = path.join(tmpDir, 'old-token.json');
    fs.writeFileSync(oldFile, JSON.stringify({
      accessToken: 'old-token',
      expiresAt: futureDate,
      startUrl,
    }));

    // Set its mtime to the past
    const pastTime = new Date(Date.now() - 60_000);
    fs.utimesSync(oldFile, pastTime, pastTime);

    // Write a newer file
    fs.writeFileSync(path.join(tmpDir, 'new-token.json'), JSON.stringify({
      accessToken: 'new-token',
      expiresAt: futureDate,
      startUrl,
    }));

    const token = readCachedToken(tmpDir, startUrl);
    expect(token.accessToken).toBe('new-token');
  });

  it('throws TokenExpiredError for an expired token', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://expired.awsapps.com/start';
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();

    fs.writeFileSync(
      path.join(tmpDir, 'expired.json'),
      JSON.stringify({ accessToken: 'expired-tok', expiresAt: pastDate, startUrl }),
    );

    expect(() => readCachedToken(tmpDir, startUrl)).toThrow(TokenExpiredError);
  });

  it('throws TokenNotFoundError when no files match the start URL', () => {
    tmpDir = makeTmpDir();

    // Write a token for a different URL
    fs.writeFileSync(
      path.join(tmpDir, 'other.json'),
      JSON.stringify({
        accessToken: 'tok',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        startUrl: 'https://other-org.awsapps.com/start',
      }),
    );

    expect(() => readCachedToken(tmpDir, 'https://missing.awsapps.com/start')).toThrow(TokenNotFoundError);
  });

  it('throws TokenNotFoundError when cache directory is empty', () => {
    tmpDir = makeTmpDir();
    expect(() => readCachedToken(tmpDir, 'https://any.awsapps.com/start')).toThrow(TokenNotFoundError);
  });

  it('throws TokenNotFoundError when cache directory does not exist', () => {
    expect(() => readCachedToken('/nonexistent/path', 'https://any.awsapps.com/start')).toThrow(TokenNotFoundError);
  });

  it('skips malformed JSON files and finds the valid one', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://my-org.awsapps.com/start';
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();

    // Write a malformed file
    fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not valid json {{{');

    // Write a valid file
    fs.writeFileSync(path.join(tmpDir, 'good.json'), JSON.stringify({
      accessToken: 'valid-tok',
      expiresAt: futureDate,
      startUrl,
    }));

    const token = readCachedToken(tmpDir, startUrl);
    expect(token.accessToken).toBe('valid-tok');
  });

  it('skips files missing required fields', () => {
    tmpDir = makeTmpDir();
    const startUrl = 'https://my-org.awsapps.com/start';
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();

    // Write a file missing accessToken
    fs.writeFileSync(path.join(tmpDir, 'incomplete.json'), JSON.stringify({
      expiresAt: futureDate,
      startUrl,
    }));

    // Write a complete file
    fs.writeFileSync(path.join(tmpDir, 'complete.json'), JSON.stringify({
      accessToken: 'good-tok',
      expiresAt: futureDate,
      startUrl,
    }));

    const token = readCachedToken(tmpDir, startUrl);
    expect(token.accessToken).toBe('good-tok');
  });
});
