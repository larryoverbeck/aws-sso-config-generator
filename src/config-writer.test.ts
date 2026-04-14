import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateConfigBlocks, writeConfig } from './config-writer.js';
import { ConfigWriteError } from './types.js';
import type { GeneratedProfile, ExistingConfig, WriteOptions } from './types.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-writer-test-'));
}

function makeExistingConfig(overrides: Partial<ExistingConfig> = {}): ExistingConfig {
  return {
    raw: '',
    profileNames: new Set<string>(),
    sessionNames: new Set<string>(),
    ...overrides,
  };
}

function makeWriteOptions(overrides: Partial<WriteOptions> = {}): WriteOptions {
  return {
    ssoStartUrl: 'https://my-org.awsapps.com/start',
    ssoRegion: 'us-east-1',
    sessionName: 'my-org',
    defaultRegion: 'us-east-1',
    outputFormat: 'json',
    force: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<GeneratedProfile> = {}): GeneratedProfile {
  return {
    profileName: 'my-sandbox',
    accountId: '111111111111',
    accountName: 'my-sandbox',
    roleName: 'PowerUserAccess',
    isProduction: false,
    ...overrides,
  };
}

describe('generateConfigBlocks', () => {
  it('generates SSO session block with sso_start_url, sso_region, sso_registration_scopes', () => {
    const profiles = [makeProfile()];
    const existing = makeExistingConfig();
    const options = makeWriteOptions();

    const result = generateConfigBlocks(profiles, existing, options);

    expect(result.content).toContain('[sso-session my-org]');
    expect(result.content).toContain('sso_start_url = https://my-org.awsapps.com/start');
    expect(result.content).toContain('sso_region = us-east-1');
    expect(result.content).toContain('sso_registration_scopes = sso:account:access');
  });

  it('skips session block when session already exists', () => {
    const profiles = [makeProfile()];
    const existing = makeExistingConfig({ sessionNames: new Set(['my-org']) });
    const options = makeWriteOptions();

    const result = generateConfigBlocks(profiles, existing, options);

    expect(result.content).not.toContain('[sso-session');
  });

  it('generates profile blocks with all required fields', () => {
    const profiles = [makeProfile({
      profileName: 'dev-admin',
      accountId: '222222222222',
      roleName: 'AdministratorAccess',
    })];
    const existing = makeExistingConfig({ sessionNames: new Set(['my-org']) });
    const options = makeWriteOptions();

    const result = generateConfigBlocks(profiles, existing, options);

    expect(result.content).toContain('[profile dev-admin]');
    expect(result.content).toContain('sso_session = my-org');
    expect(result.content).toContain('sso_account_id = 222222222222');
    expect(result.content).toContain('sso_role_name = AdministratorAccess');
    expect(result.content).toContain('region = us-east-1');
    expect(result.content).toContain('output = json');
    expect(result.written).toEqual(['dev-admin']);
  });

  it('adds production warning comment above production profiles', () => {
    const profiles = [makeProfile({ profileName: 'prod-account', isProduction: true })];
    const existing = makeExistingConfig({ sessionNames: new Set(['my-org']) });
    const options = makeWriteOptions();

    const result = generateConfigBlocks(profiles, existing, options);

    const lines = result.content.split('\n');
    const warningIdx = lines.findIndex(l => l.includes('# ⚠️  PRODUCTION ACCOUNT'));
    const profileIdx = lines.findIndex(l => l.includes('[profile prod-account]'));
    expect(warningIdx).toBeGreaterThanOrEqual(0);
    expect(profileIdx).toBe(warningIdx + 1);
  });

  it('skips existing profiles when force=false', () => {
    const profiles = [
      makeProfile({ profileName: 'existing-one' }),
      makeProfile({ profileName: 'new-one', accountId: '333333333333' }),
    ];
    const existing = makeExistingConfig({ profileNames: new Set(['existing-one']) });
    const options = makeWriteOptions();

    const result = generateConfigBlocks(profiles, existing, options);

    expect(result.written).toEqual(['new-one']);
    expect(result.skipped).toEqual([
      { profileName: 'existing-one', reason: 'profile already exists in config' },
    ]);
    expect(result.content).not.toContain('[profile existing-one]');
    expect(result.content).toContain('[profile new-one]');
  });

  it('includes existing profiles when force=true', () => {
    const profiles = [
      makeProfile({ profileName: 'existing-one' }),
      makeProfile({ profileName: 'new-one', accountId: '333333333333' }),
    ];
    const existing = makeExistingConfig({ profileNames: new Set(['existing-one']) });
    const options = makeWriteOptions({ force: true });

    const result = generateConfigBlocks(profiles, existing, options);

    expect(result.written).toContain('existing-one');
    expect(result.written).toContain('new-one');
    expect(result.skipped).toEqual([]);
    expect(result.content).toContain('[profile existing-one]');
    expect(result.content).toContain('[profile new-one]');
  });
});

describe('writeConfig', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates backup file with timestamp', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    fs.writeFileSync(configPath, '[profile old]\nregion = us-east-1\n');

    const result = writeConfig('\n[profile new]\nregion = us-west-2\n', configPath, true);

    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).toMatch(/\.bak\.\d{4}-\d{2}-\d{2}T/);
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    // Backup should contain original content
    expect(fs.readFileSync(result.backupPath!, 'utf-8')).toBe('[profile old]\nregion = us-east-1\n');
  });

  it('appends content to existing file', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    const originalContent = '[profile old]\nregion = us-east-1\n';
    fs.writeFileSync(configPath, originalContent);

    const newContent = '\n[profile new]\nregion = us-west-2\n';
    writeConfig(newContent, configPath, false);

    const written = fs.readFileSync(configPath, 'utf-8');
    expect(written).toBe(originalContent + newContent);
  });

  it('creates parent directory if missing', () => {
    tmpDir = makeTmpDir();
    const nestedDir = path.join(tmpDir, 'deep', 'nested');
    const configPath = path.join(nestedDir, 'config');

    writeConfig('[profile test]\nregion = us-east-1\n', configPath, false);

    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, 'utf-8')).toBe('[profile test]\nregion = us-east-1\n');
  });

  it('throws ConfigWriteError on permission error', () => {
    tmpDir = makeTmpDir();
    const configPath = path.join(tmpDir, 'config');
    fs.writeFileSync(configPath, '');
    // Remove write permission on the directory to cause EACCES on append
    fs.chmodSync(tmpDir, 0o444);

    try {
      expect(() => writeConfig('content', configPath, false)).toThrow(ConfigWriteError);
    } finally {
      fs.chmodSync(tmpDir, 0o755);
    }
  });
});
