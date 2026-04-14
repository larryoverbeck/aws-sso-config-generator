import { describe, it, expect, vi } from 'vitest';
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

describe('createProgram', () => {
  describe('flag parsing and defaults', () => {
    it('should set default sso-region to us-east-1', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().ssoRegion).toBe('us-east-1');
    });

    it('should set default default-region to us-east-1', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().defaultRegion).toBe('us-east-1');
    });

    it('should set default output-format to json', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().outputFormat).toBe('json');
    });

    it('should set default prod-patterns to prod,production,prd', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().prodPatterns).toBe('prod,production,prd');
    });

    it('should default write to false', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().write).toBe(false);
    });

    it('should default force to false', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().force).toBe(false);
    });

    it('should default interactive to false', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start']);
      expect(program.opts().interactive).toBe(false);
    });

    it('should accept custom sso-region', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--sso-region', 'eu-west-1']);
      expect(program.opts().ssoRegion).toBe('eu-west-1');
    });

    it('should accept custom session-name', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--session-name', 'my-session']);
      expect(program.opts().sessionName).toBe('my-session');
    });

    it('should accept custom output-format', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--output-format', 'yaml']);
      expect(program.opts().outputFormat).toBe('yaml');
    });

    it('should accept custom prod-patterns', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--prod-patterns', 'live,production']);
      expect(program.opts().prodPatterns).toBe('live,production');
    });

    it('should accept --write flag', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--write']);
      expect(program.opts().write).toBe(true);
    });

    it('should accept --force flag', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--force']);
      expect(program.opts().force).toBe(true);
    });

    it('should accept --output flag with path', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--output', '/tmp/config']);
      expect(program.opts().output).toBe('/tmp/config');
    });

    it('should accept -i shorthand for --interactive', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '-i']);
      expect(program.opts().interactive).toBe(true);
    });

    it('should accept --interactive flag', () => {
      const program = createProgram();
      program.parse(['node', 'cli', '--sso-start-url', 'https://myorg.awsapps.com/start', '--interactive']);
      expect(program.opts().interactive).toBe(true);
    });
  });
});
