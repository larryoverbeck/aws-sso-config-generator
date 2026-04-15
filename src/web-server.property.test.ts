// Feature: web-config-ui, Property 1: API data response completeness
// **Validates: Requirements 3.1, 3.2, 3.3**

import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import type { GeneratedProfile, ExistingConfig } from './types.js';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  default: {
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ size: 0 })),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
  },
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ size: 0 })),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock('./config-writer.js', () => ({
  generateConfigBlocks: vi.fn(() => ({ content: '', written: [], skipped: [] })),
  writeConfig: vi.fn(() => ({ backupPath: undefined })),
}));

vi.mock('./config-parser.js', () => ({
  parseExistingConfig: vi.fn(() => ({
    raw: '',
    profileNames: new Set<string>(),
    sessionNames: new Set<string>(),
  })),
}));

vi.mock('./web-ui.js', () => ({
  renderWebUI: () => '<html><body>Mock</body></html>',
}));

// ── Generators ─────────────────────────────────────────────────────

const profileNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);
const accountIdArb = fc.stringMatching(/^[0-9]{12}$/);
const accountNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{2,20}$/);
const roleNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/);

const generatedProfileArb: fc.Arbitrary<GeneratedProfile> = fc.record({
  profileName: profileNameArb,
  accountId: accountIdArb,
  accountName: accountNameArb,
  roleName: roleNameArb,
  isProduction: fc.boolean(),
});

const rawConfigArb = fc.oneof(
  fc.constant(''),
  fc.stringMatching(/^[a-zA-Z0-9\[\] =\n]{0,200}$/),
);

const existingProfileNamesArb = fc.uniqueArray(profileNameArb, { minLength: 0, maxLength: 10 });

const ssoArb = fc.record({
  startUrl: fc.stringMatching(/^https:\/\/[a-z]{3,10}\.awsapps\.com\/start$/),
  region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'),
  sessionName: fc.stringMatching(/^[a-z]{3,15}$/),
  defaultRegion: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'),
  outputFormat: fc.constantFrom('json', 'yaml', 'text', 'table'),
});

// ── Tests ──────────────────────────────────────────────────────────

describe('Property 1: API data response completeness', () => {
  afterEach(async () => {
    // Clean up any lingering server handles tracked in the test
  });

  it('GET /api/data response contains every profile with all fields, raw config, existing profile names, and all SSO fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(generatedProfileArb, { minLength: 0, maxLength: 8 }),
        rawConfigArb,
        existingProfileNamesArb,
        ssoArb,
        async (profiles, rawConfig, existingNames, sso) => {
          const existingConfig: ExistingConfig = {
            raw: rawConfig,
            profileNames: new Set(existingNames),
            sessionNames: new Set<string>(),
          };

          const { startWebServer } = await import('./web-server.js');
          const handle = await startWebServer({
            profiles,
            existingConfig,
            configPath: '/tmp/test-config',
            ssoStartUrl: sso.startUrl,
            ssoRegion: sso.region,
            sessionName: sso.sessionName,
            defaultRegion: sso.defaultRegion,
            outputFormat: sso.outputFormat,
          });

          try {
            const res = await fetch(`${handle.url}/api/data`);
            expect(res.status).toBe(200);

            const data = await res.json();

            // Verify profiles array matches input exactly
            expect(data.profiles).toHaveLength(profiles.length);
            for (let i = 0; i < profiles.length; i++) {
              const expected = profiles[i];
              const actual = data.profiles[i];
              expect(actual.profileName).toBe(expected.profileName);
              expect(actual.accountId).toBe(expected.accountId);
              expect(actual.accountName).toBe(expected.accountName);
              expect(actual.roleName).toBe(expected.roleName);
              expect(actual.isProduction).toBe(expected.isProduction);
            }

            // Verify raw config string
            expect(data.existingConfig.raw).toBe(rawConfig);

            // Verify all existing profile names are present
            const returnedNames = new Set<string>(data.existingConfig.profileNames);
            expect(returnedNames.size).toBe(existingNames.length);
            for (const name of existingNames) {
              expect(returnedNames.has(name)).toBe(true);
            }

            // Verify SSO metadata fields
            expect(data.sso.startUrl).toBe(sso.startUrl);
            expect(data.sso.region).toBe(sso.region);
            expect(data.sso.sessionName).toBe(sso.sessionName);
            expect(data.sso.defaultRegion).toBe(sso.defaultRegion);
            expect(data.sso.outputFormat).toBe(sso.outputFormat);
          } finally {
            await handle.close();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// Feature: web-config-ui, Property 2: Already-configured profiles are correctly identified
// **Validates: Requirements 4.4**

describe('Property 2: Already-configured profiles are correctly identified', () => {
  it('a profile is marked "already configured" if and only if its name appears in the existing profile names set', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(profileNameArb, { minLength: 1, maxLength: 15 }),
        existingProfileNamesArb,
        (discoveredNames, existingNames) => {
          const existingSet = new Set(existingNames);

          for (const name of discoveredNames) {
            const isAlreadyConfigured = existingSet.has(name);

            if (existingNames.includes(name)) {
              expect(isAlreadyConfigured).toBe(true);
            } else {
              expect(isAlreadyConfigured).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no profile outside the existing set is incorrectly marked as already configured', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(profileNameArb, { minLength: 1, maxLength: 10 }),
        fc.uniqueArray(profileNameArb, { minLength: 0, maxLength: 10 }),
        (discoveredNames, existingNames) => {
          const existingSet = new Set(existingNames);

          const alreadyConfigured = discoveredNames.filter((name) => existingSet.has(name));
          const notConfigured = discoveredNames.filter((name) => !existingSet.has(name));

          // Every "already configured" profile must be in the existing set
          for (const name of alreadyConfigured) {
            expect(existingNames).toContain(name);
          }

          // Every "not configured" profile must NOT be in the existing set
          for (const name of notConfigured) {
            expect(existingNames).not.toContain(name);
          }

          // The two partitions must cover all discovered names
          expect(alreadyConfigured.length + notConfigured.length).toBe(discoveredNames.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
