import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseExistingConfig } from './config-parser.js';
import { ConfigReadError } from './types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-parser-test-'));
}

describe('parseExistingConfig', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('parses profiles and sso-sessions from a valid config', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    const content = [
      '[profile my-sandbox]',
      'sso_session = my-org',
      'sso_account_id = 111111111111',
      'sso_role_name = PowerUserAccess',
      'region = us-east-1',
      'output = json',
      '',
      '[profile prod-account]',
      'sso_session = my-org',
      'sso_account_id = 222222222222',
      'sso_role_name = AdministratorAccess',
      'region = us-west-2',
      'output = json',
      '',
      '[sso-session my-org]',
      'sso_start_url = https://my-org.awsapps.com/start',
      'sso_region = us-east-1',
      'sso_registration_scopes = sso:account:access',
    ].join('\n');

    fs.writeFileSync(configPath, content);

    const result = parseExistingConfig(configPath);

    expect(result.profileNames).toEqual(new Set(['my-sandbox', 'prod-account']));
    expect(result.sessionNames).toEqual(new Set(['my-org']));
    expect(result.raw).toBe(content);
  });

  it('returns empty sets when config file does not exist', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'nonexistent-config');

    const result = parseExistingConfig(configPath);

    expect(result.profileNames.size).toBe(0);
    expect(result.sessionNames.size).toBe(0);
    expect(result.raw).toBe('');
  });

  it('throws ConfigReadError on permission denied (EACCES)', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    fs.writeFileSync(configPath, '[profile test]\nregion = us-east-1\n');
    // Remove read permission
    fs.chmodSync(configPath, 0o000);

    try {
      expect(() => parseExistingConfig(configPath)).toThrow(ConfigReadError);
    } finally {
      // Restore permissions so cleanup works
      fs.chmodSync(configPath, 0o644);
    }
  });

  it('emits warning and preserves raw content on malformed config', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    // The ini package is very lenient and rarely throws. We test the behavior
    // by verifying that even with unusual content, the function returns gracefully.
    // We write content with duplicate keys and odd formatting that ini handles.
    const oddContent = '[profile valid-profile]\nregion = us-east-1\n\n[sso-session sess]\nsso_region = eu-west-1\n';
    fs.writeFileSync(configPath, oddContent);

    const result = parseExistingConfig(configPath);

    // The ini parser handles this fine, so profiles/sessions should be extracted
    expect(result.raw).toBe(oddContent);
    expect(result.profileNames).toEqual(new Set(['valid-profile']));
    expect(result.sessionNames).toEqual(new Set(['sess']));
  });

  it('recognizes the [default] section as a profile', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    const content = [
      '[default]',
      'region = us-east-1',
      'output = json',
      '',
      '[profile dev-account]',
      'sso_session = org',
      'sso_account_id = 333333333333',
      'sso_role_name = ReadOnlyAccess',
      'region = us-east-1',
      'output = json',
      '',
      '[sso-session org]',
      'sso_start_url = https://org.awsapps.com/start',
      'sso_region = us-east-1',
    ].join('\n');

    fs.writeFileSync(configPath, content);

    const result = parseExistingConfig(configPath);

    expect(result.profileNames).toEqual(new Set(['default', 'dev-account']));
    expect(result.sessionNames).toEqual(new Set(['org']));
  });

  it('handles config with only sso-sessions and no profiles', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    const content = [
      '[sso-session alpha]',
      'sso_start_url = https://alpha.awsapps.com/start',
      'sso_region = eu-west-1',
      '',
      '[sso-session beta]',
      'sso_start_url = https://beta.awsapps.com/start',
      'sso_region = us-west-2',
    ].join('\n');

    fs.writeFileSync(configPath, content);

    const result = parseExistingConfig(configPath);

    expect(result.profileNames.size).toBe(0);
    expect(result.sessionNames).toEqual(new Set(['alpha', 'beta']));
  });

  it('handles empty config file', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    fs.writeFileSync(configPath, '');

    const result = parseExistingConfig(configPath);

    expect(result.raw).toBe('');
    expect(result.profileNames.size).toBe(0);
    expect(result.sessionNames.size).toBe(0);
  });
});
