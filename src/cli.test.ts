import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgram } from './cli.js';

// Mock all pipeline modules to prevent real side effects
vi.mock('./platform.js', () => ({
  resolvePlatformPaths: vi.fn(() => ({
    awsHomeDir: '/home/user/.aws',
    configPath: '/home/user/.aws/config',
    ssoCacheDir: '/home/user/.aws/sso/cache',
  })),
}));

vi.mock('./token.js', () => ({
  readCachedToken: vi.fn(() => ({
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  })),
}));

vi.mock('./discovery.js', () => ({
  discoverAccountsAndRoles: vi.fn(async () => ({
    accounts: [
      { accountId: '111111111111', accountName: 'my-sandbox', emailAddress: 'sandbox@example.com' },
    ],
    roles: [
      { accountId: '111111111111', accountName: 'my-sandbox', roleName: 'AdministratorAccess' },
    ],
  })),
}));

vi.mock('./naming.js', () => ({
  generateProfileNames: vi.fn(() => [
    {
      profileName: 'my-sandbox',
      accountId: '111111111111',
      accountName: 'my-sandbox',
      roleName: 'AdministratorAccess',
      isProduction: false,
    },
  ]),
}));

vi.mock('./config-parser.js', () => ({
  parseExistingConfig: vi.fn(() => ({
    raw: '',
    profileNames: new Set<string>(),
    sessionNames: new Set<string>(),
  })),
}));

vi.mock('./config-writer.js', () => ({
  generateConfigBlocks: vi.fn(() => ({
    content: '\n[sso-session myorg]\nsso_start_url = https://myorg.awsapps.com/start\n\n[profile my-sandbox]\nsso_session = myorg\n',
    written: ['my-sandbox'],
    skipped: [],
  })),
  writeConfig: vi.fn(() => ({ backupPath: '/home/user/.aws/config.bak.2025' })),
}));

vi.mock('./tui.js', () => ({
  selectProfiles: vi.fn(async (profiles: unknown[]) => profiles),
}));

// Mock web-server and browser to prevent real server starts and browser launches
const mockClose = vi.fn(async () => {});
vi.mock('./web-server.js', () => ({
  startWebServer: vi.fn(async () => ({
    url: 'http://127.0.0.1:54321',
    port: 54321,
    close: mockClose,
  })),
}));

vi.mock('./browser.js', () => ({
  openBrowser: vi.fn(() => true),
}));

describe('createProgram', () => {
  describe('flag parsing and defaults (CLI mode)', () => {
    it('should set default sso-region to us-east-1', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().ssoRegion).toBe('us-east-1');
    });

    it('should set default default-region to us-east-1', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().defaultRegion).toBe('us-east-1');
    });

    it('should set default output-format to json', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().outputFormat).toBe('json');
    });

    it('should set default prod-patterns to prod,production,prd', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().prodPatterns).toBe('prod,production,prd');
    });

    it('should default write to false', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().write).toBe(false);
    });

    it('should default force to false', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().force).toBe(false);
    });

    it('should default interactive to false', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().interactive).toBe(false);
    });

    it('should accept custom sso-region', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--sso-region', 'eu-west-1']);
      expect(program.opts().ssoRegion).toBe('eu-west-1');
    });

    it('should accept custom session-name', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--session-name', 'my-session']);
      expect(program.opts().sessionName).toBe('my-session');
    });

    it('should accept custom output-format', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--output-format', 'yaml']);
      expect(program.opts().outputFormat).toBe('yaml');
    });

    it('should accept custom prod-patterns', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--prod-patterns', 'live,production']);
      expect(program.opts().prodPatterns).toBe('live,production');
    });

    it('should accept --write flag', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--write']);
      expect(program.opts().write).toBe(true);
    });

    it('should accept --force flag', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--force']);
      expect(program.opts().force).toBe(true);
    });

    it('should accept --output flag with path', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--output', '/tmp/config']);
      expect(program.opts().output).toBe('/tmp/config');
    });

    it('should accept -i shorthand for --interactive', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '-i']);
      expect(program.opts().interactive).toBe(true);
    });

    it('should accept --interactive flag', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--interactive']);
      expect(program.opts().interactive).toBe(true);
    });
  });
});

describe('createProgram — web mode', () => {
  let sigintListeners: Array<(...args: unknown[]) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Track SIGINT listeners added during tests so we can clean them up
    sigintListeners = [];
    const origOn = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        sigintListeners.push(listener);
      }
      return origOn(event, listener);
    });
  });

  afterEach(() => {
    // Remove any SIGINT/SIGTERM listeners added during the test
    for (const listener of sigintListeners) {
      process.removeListener('SIGINT', listener);
      process.removeListener('SIGTERM', listener);
    }
  });

  it('default mode (no flags) triggers web server path', async () => {
    const { startWebServer } = await import('./web-server.js');
    const { openBrowser } = await import('./browser.js');

    const program = createProgram();
    const parsePromise = program.parseAsync([
      'node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start',
    ]);

    // Allow the async action to execute
    await new Promise((r) => setTimeout(r, 50));

    expect(startWebServer).toHaveBeenCalled();
    expect(openBrowser).toHaveBeenCalledWith('http://127.0.0.1:54321');

    // Unblock the awaited Promise by emitting SIGINT
    process.emit('SIGINT');
    await parsePromise;
  });

  it('--cli flag triggers terminal-only mode (no web server)', async () => {
    const { startWebServer } = await import('./web-server.js');

    const program = createProgram();
    await program.parseAsync([
      'node', 'cli', '--cli', '--sso-start-url', 'https://myorg.awsapps.com/start',
    ]);

    expect(startWebServer).not.toHaveBeenCalled();
  });

  it('--web flag triggers web server path', async () => {
    const { startWebServer } = await import('./web-server.js');
    const { openBrowser } = await import('./browser.js');

    const program = createProgram();
    const parsePromise = program.parseAsync([
      'node', 'cli', '--web', '--sso-start-url', 'https://myorg.awsapps.com/start',
    ]);

    await new Promise((r) => setTimeout(r, 50));

    expect(startWebServer).toHaveBeenCalled();
    expect(openBrowser).toHaveBeenCalledWith('http://127.0.0.1:54321');

    process.emit('SIGINT');
    await parsePromise;
  });

  it('--web with --write logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const program = createProgram();
    const parsePromise = program.parseAsync([
      'node', 'cli', '--web', '--write', '--sso-start-url', 'https://myorg.awsapps.com/start',
    ]);

    await new Promise((r) => setTimeout(r, 50));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--write'));

    process.emit('SIGINT');
    await parsePromise;
    warnSpy.mockRestore();
  });

  it('--web with --interactive logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const program = createProgram();
    const parsePromise = program.parseAsync([
      'node', 'cli', '--web', '--interactive', '--sso-start-url', 'https://myorg.awsapps.com/start',
    ]);

    await new Promise((r) => setTimeout(r, 50));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--interactive'));

    process.emit('SIGINT');
    await parsePromise;
    warnSpy.mockRestore();
  });

  it('--web with --output logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const program = createProgram();
    const parsePromise = program.parseAsync([
      'node', 'cli', '--web', '--output', '/tmp/config', '--sso-start-url', 'https://myorg.awsapps.com/start',
    ]);

    await new Promise((r) => setTimeout(r, 50));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--output'));

    process.emit('SIGINT');
    await parsePromise;
    warnSpy.mockRestore();
  });

  it('discovery failure in web mode shows error and exits with code 1', async () => {
    const { discoverAccountsAndRoles } = await import('./discovery.js');
    const { TokenExpiredError } = await import('./types.js');

    vi.mocked(discoverAccountsAndRoles).mockRejectedValueOnce(new TokenExpiredError());

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const program = createProgram();
    try {
      await program.parseAsync([
        'node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start',
      ]);
    } catch {
      // Expected — process.exit throws
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('expired'));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
