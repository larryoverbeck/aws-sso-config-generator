import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { WebServerHandle } from './web-server.js';
import type { GeneratedProfile, ExistingConfig } from './types.js';
import { ConfigWriteError } from './types.js';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ size: 100 })),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
  },
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ size: 100 })),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

// Mock config-writer
const mockGenerateConfigBlocks = vi.fn(() => ({
  content: '\n[profile test]\nregion = us-east-1\n',
  written: ['test'],
  skipped: [],
}));
const mockWriteConfig = vi.fn(() => ({
  backupPath: '/home/user/.aws/config.bak.20250101T120000000Z',
}));

vi.mock('./config-writer.js', () => ({
  generateConfigBlocks: (...args: unknown[]) => mockGenerateConfigBlocks(...args),
  writeConfig: (...args: unknown[]) => mockWriteConfig(...args),
}));

// Mock config-parser
const mockParseExistingConfig = vi.fn(() => ({
  raw: '',
  profileNames: new Set<string>(),
  sessionNames: new Set<string>(),
}));

vi.mock('./config-parser.js', () => ({
  parseExistingConfig: (...args: unknown[]) => mockParseExistingConfig(...args),
}));

// Mock web-ui
vi.mock('./web-ui.js', () => ({
  renderWebUI: () => '<html><body>Mock Web UI</body></html>',
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeProfiles(): GeneratedProfile[] {
  return [
    {
      profileName: 'dev-admin',
      accountId: '111111111111',
      accountName: 'dev-account',
      roleName: 'AdministratorAccess',
      isProduction: false,
    },
    {
      profileName: 'prod-readonly',
      accountId: '222222222222',
      accountName: 'prod-account',
      roleName: 'ReadOnlyAccess',
      isProduction: true,
    },
  ];
}

function makeExistingConfig(): ExistingConfig {
  return {
    raw: '[profile old]\nregion = us-east-1\n',
    profileNames: new Set(['old']),
    sessionNames: new Set<string>(),
  };
}

function makeServerOptions() {
  return {
    profiles: makeProfiles(),
    existingConfig: makeExistingConfig(),
    configPath: '/home/user/.aws/config',
    ssoStartUrl: 'https://myorg.awsapps.com/start',
    ssoRegion: 'us-east-1',
    sessionName: 'myorg',
    defaultRegion: 'us-east-1',
    outputFormat: 'json',
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('web-server', () => {
  let handle: WebServerHandle;

  beforeAll(async () => {
    const { startWebServer } = await import('./web-server.js');
    handle = await startWebServer(makeServerOptions());
  });

  afterAll(async () => {
    try {
      await handle.close();
    } catch {
      // Server may already be closed by shutdown test
    }
  });

  beforeEach(() => {
    mockGenerateConfigBlocks.mockClear();
    mockWriteConfig.mockClear();
    mockParseExistingConfig.mockClear();
    mockGenerateConfigBlocks.mockReturnValue({
      content: '\n[profile test]\nregion = us-east-1\n',
      written: ['test'],
      skipped: [],
    });
    mockWriteConfig.mockReturnValue({
      backupPath: '/home/user/.aws/config.bak.20250101T120000000Z',
    });
    mockParseExistingConfig.mockReturnValue({
      raw: '',
      profileNames: new Set<string>(),
      sessionNames: new Set<string>(),
    });
  });

  // Requirement 2.1: Server binds to 127.0.0.1 on a random port
  it('binds to 127.0.0.1 on a random port', () => {
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.port).toBeLessThan(65536);
  });

  // Requirement 2.1: GET / returns HTML with correct content-type
  it('GET / returns HTML with correct content-type', async () => {
    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('<html');
  });

  // Requirement 3.1: GET /api/data returns correct JSON structure
  it('GET /api/data returns correct JSON structure for known profiles', async () => {
    const res = await fetch(`${handle.url}/api/data`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const data = await res.json();

    // Profiles
    expect(data.profiles).toHaveLength(2);
    expect(data.profiles[0]).toEqual({
      profileName: 'dev-admin',
      accountId: '111111111111',
      accountName: 'dev-account',
      roleName: 'AdministratorAccess',
      isProduction: false,
    });
    expect(data.profiles[1]).toEqual({
      profileName: 'prod-readonly',
      accountId: '222222222222',
      accountName: 'prod-account',
      roleName: 'ReadOnlyAccess',
      isProduction: true,
    });

    // Existing config
    expect(data.existingConfig.raw).toBe('[profile old]\nregion = us-east-1\n');
    expect(data.existingConfig.profileNames).toEqual(['old']);

    // SSO metadata
    expect(data.sso).toEqual({
      startUrl: 'https://myorg.awsapps.com/start',
      region: 'us-east-1',
      sessionName: 'myorg',
      defaultRegion: 'us-east-1',
      outputFormat: 'json',
    });
  });

  // Requirement 7.1: POST /api/save calls generateConfigBlocks and writeConfig
  it('POST /api/save calls generateConfigBlocks and writeConfig with correct arguments', async () => {
    const res = await fetch(`${handle.url}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selections: [
          {
            originalProfileName: 'dev-admin',
            customProfileName: 'my-dev',
            accountId: '111111111111',
            accountName: 'dev-account',
            roleName: 'AdministratorAccess',
            isProduction: false,
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.writtenCount).toBe(1);
    expect(data.backupPath).toBeDefined();

    // Verify generateConfigBlocks was called with the custom profile name
    expect(mockGenerateConfigBlocks).toHaveBeenCalledTimes(1);
    const [profiles, , writeOpts] = mockGenerateConfigBlocks.mock.calls[0] as [GeneratedProfile[], ExistingConfig, unknown];
    expect(profiles[0].profileName).toBe('my-dev');
    expect(profiles[0].accountId).toBe('111111111111');
    expect((writeOpts as { force: boolean }).force).toBe(true);

    // Verify writeConfig was called
    expect(mockWriteConfig).toHaveBeenCalledTimes(1);
    expect(mockWriteConfig).toHaveBeenCalledWith(
      '\n[profile test]\nregion = us-east-1\n',
      '/home/user/.aws/config',
      true,
    );

    // Verify config was re-read
    expect(mockParseExistingConfig).toHaveBeenCalledWith('/home/user/.aws/config');
  });

  // Requirement 7.4: POST /api/save returns error when writeConfig throws ConfigWriteError
  it('POST /api/save returns error response when writeConfig throws ConfigWriteError', async () => {
    mockWriteConfig.mockImplementation(() => {
      throw new ConfigWriteError('/home/user/.aws/config');
    });

    const res = await fetch(`${handle.url}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selections: [
          {
            originalProfileName: 'dev-admin',
            customProfileName: 'my-dev',
            accountId: '111111111111',
            accountName: 'dev-account',
            roleName: 'AdministratorAccess',
            isProduction: false,
          },
        ],
      }),
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('permission denied');
  });

  // Unknown routes return 404
  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${handle.url}/unknown/path`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Not found');
  });

  // Malformed POST body returns 400
  it('returns 400 for malformed POST body on /api/save', async () => {
    const res = await fetch(`${handle.url}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{{{',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid request');
  });

  it('returns 400 for empty selections on /api/save', async () => {
    const res = await fetch(`${handle.url}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selections: [] }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid request');
  });

  // Requirement 9.3: GET /api/backups returns sorted backup list
  it('GET /api/backups returns sorted backup list', async () => {
    const fs = await import('node:fs');
    const readdirMock = vi.mocked(fs.readdirSync);
    const statMock = vi.mocked(fs.statSync);

    readdirMock.mockReturnValue([
      'config.bak.20250101T120000000Z',
      'config.bak.20250415T080000000Z',
      'config.bak.20250301T150000000Z',
      'unrelated-file.txt',
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    statMock.mockReturnValue({ size: 256 } as unknown as ReturnType<typeof fs.statSync>);

    const res = await fetch(`${handle.url}/api/backups`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.backups).toHaveLength(3);
    // Most recent first
    expect(data.backups[0].filename).toBe('config.bak.20250415T080000000Z');
    expect(data.backups[1].filename).toBe('config.bak.20250301T150000000Z');
    expect(data.backups[2].filename).toBe('config.bak.20250101T120000000Z');

    // Each backup has required fields
    for (const b of data.backups) {
      expect(b).toHaveProperty('filename');
      expect(b).toHaveProperty('path');
      expect(b).toHaveProperty('timestamp');
      expect(b).toHaveProperty('size');
    }
  });

  // Requirement 9.3: POST /api/restore creates backup before restoring
  it('POST /api/restore creates backup before restoring', async () => {
    const fs = await import('node:fs');
    const existsMock = vi.mocked(fs.existsSync);
    const readMock = vi.mocked(fs.readFileSync);
    const copyMock = vi.mocked(fs.copyFileSync);
    const writeMock = vi.mocked(fs.writeFileSync);

    existsMock.mockReturnValue(true);
    readMock.mockReturnValue('[profile restored]\nregion = eu-west-1\n');
    copyMock.mockImplementation(() => {});
    writeMock.mockImplementation(() => {});

    const res = await fetch(`${handle.url}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backupPath: '/home/user/.aws/config.bak.20250101T120000000Z',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.newBackupPath).toBeDefined();
    expect(data.restoredFrom).toContain('config.bak.20250101T120000000Z');

    // Verify a backup was created before restoring
    expect(copyMock).toHaveBeenCalled();
    // Verify config was overwritten with backup contents
    expect(writeMock).toHaveBeenCalledWith(
      '/home/user/.aws/config',
      '[profile restored]\nregion = eu-west-1\n',
      'utf-8',
    );
  });

  it('POST /api/restore returns 400 for missing backupPath', async () => {
    const res = await fetch(`${handle.url}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});

// Separate describe for shutdown test since it closes the server
describe('web-server shutdown', () => {
  // Requirement 2.4: POST /api/shutdown triggers graceful shutdown
  it('POST /api/shutdown triggers graceful shutdown', async () => {
    const { startWebServer } = await import('./web-server.js');
    const shutdownHandle = await startWebServer(makeServerOptions());

    const res = await fetch(`${shutdownHandle.url}/api/shutdown`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Give the server a moment to close
    await new Promise((r) => setTimeout(r, 100));

    // Verify server is no longer accepting connections
    try {
      await fetch(`${shutdownHandle.url}/`);
      // If we get here, the server is still running — that's unexpected
      expect.fail('Server should have shut down');
    } catch {
      // Expected: connection refused
    }
  });
});
