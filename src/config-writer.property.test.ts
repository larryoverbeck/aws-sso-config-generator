// Feature: aws-sso-config-generator, Property 5: Generated config blocks contain all required fields and production warnings
// **Validates: Requirements 3.5, 4.1**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateConfigBlocks } from './config-writer.js';
import type { GeneratedProfile, ExistingConfig, WriteOptions } from './types.js';

/**
 * Generator for profile names: lowercase alpha start, then alphanumeric/hyphens.
 */
const profileName = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);

/**
 * Generator for 12-digit AWS account IDs.
 */
const accountId = fc.stringMatching(/^[0-9]{12}$/);

/**
 * Generator for simple alpha role names.
 */
const roleName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/);

/**
 * Generator for a GeneratedProfile with random field values.
 */
const generatedProfile: fc.Arbitrary<GeneratedProfile> = fc.record({
  profileName,
  accountId,
  accountName: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 -]{2,20}$/),
  roleName,
  isProduction: fc.boolean(),
});

/**
 * Empty existing config — no pre-existing profiles or sessions.
 */
const emptyExisting: ExistingConfig = {
  raw: '',
  profileNames: new Set<string>(),
  sessionNames: new Set<string>(),
};

/**
 * Default write options for testing.
 */
const defaultOptions: WriteOptions = {
  ssoStartUrl: 'https://test.awsapps.com/start',
  ssoRegion: 'us-east-1',
  sessionName: 'test-session',
  defaultRegion: 'us-east-1',
  outputFormat: 'json',
  force: false,
};

describe('Property 5: Generated config blocks contain all required fields and production warnings', () => {
  it('every written profile block contains sso_session, sso_account_id, sso_role_name, region, and output', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 15 }).filter((profiles) => {
          // Ensure unique profile names so none get deduplicated
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        (profiles: GeneratedProfile[]) => {
          const { content, written } = generateConfigBlocks(profiles, emptyExisting, defaultOptions);

          // Every profile should have been written (empty existing, no duplicates)
          expect(written.length).toBe(profiles.length);

          // For each written profile, verify the config block contains all required fields
          for (const profile of profiles) {
            const profileHeader = `[profile ${profile.profileName}]`;
            expect(content).toContain(profileHeader);

            // Extract the block for this profile (from header to next header or end)
            const headerIdx = content.indexOf(profileHeader);
            const nextHeaderIdx = content.indexOf('\n[', headerIdx + profileHeader.length);
            const block = nextHeaderIdx === -1
              ? content.slice(headerIdx)
              : content.slice(headerIdx, nextHeaderIdx);

            expect(block).toContain(`sso_session = ${defaultOptions.sessionName}`);
            expect(block).toContain(`sso_account_id = ${profile.accountId}`);
            expect(block).toContain(`sso_role_name = ${profile.roleName}`);
            expect(block).toContain(`region = ${defaultOptions.defaultRegion}`);
            expect(block).toContain(`output = ${defaultOptions.outputFormat}`);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('production profiles are preceded by # ⚠️  PRODUCTION ACCOUNT comment', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 15 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        (profiles: GeneratedProfile[]) => {
          const { content } = generateConfigBlocks(profiles, emptyExisting, defaultOptions);

          for (const profile of profiles) {
            const profileHeader = `[profile ${profile.profileName}]`;
            const headerIdx = content.indexOf(profileHeader);

            if (profile.isProduction) {
              // The production warning comment should appear before the profile header
              const preceding = content.slice(0, headerIdx);
              const lastNewline = preceding.lastIndexOf('\n');
              const lineBeforeHeader = preceding.slice(
                preceding.lastIndexOf('\n', lastNewline - 1) + 1,
                lastNewline,
              );
              expect(lineBeforeHeader).toBe('# ⚠️  PRODUCTION ACCOUNT');
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('non-production profiles do NOT have the production warning comment before their header', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 15 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        (profiles: GeneratedProfile[]) => {
          const { content } = generateConfigBlocks(profiles, emptyExisting, defaultOptions);

          for (const profile of profiles) {
            if (!profile.isProduction) {
              const profileHeader = `[profile ${profile.profileName}]`;
              const headerIdx = content.indexOf(profileHeader);

              // Get the line immediately before the profile header
              const preceding = content.slice(0, headerIdx);
              const lastNewline = preceding.lastIndexOf('\n');
              const lineBeforeHeader = preceding.slice(
                preceding.lastIndexOf('\n', lastNewline - 1) + 1,
                lastNewline,
              );
              expect(lineBeforeHeader).not.toBe('# ⚠️  PRODUCTION ACCOUNT');
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

// Feature: aws-sso-config-generator, Property 6: Output ordering — production first, then alphabetical
// **Validates: Requirements 4.6**

describe('Property 6: Output ordering — production first, then alphabetical', () => {
  it('all production profile names appear before all non-production profile names in the written array', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 20 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        (profiles: GeneratedProfile[]) => {
          const { written } = generateConfigBlocks(profiles, emptyExisting, defaultOptions);

          // Build a lookup from profileName → isProduction
          const prodLookup = new Map(profiles.map((p) => [p.profileName, p.isProduction]));

          // Find the last production index and first non-production index in written order
          let lastProdIdx = -1;
          let firstNonProdIdx = written.length;

          for (let i = 0; i < written.length; i++) {
            const isProd = prodLookup.get(written[i]);
            if (isProd) {
              lastProdIdx = i;
            } else if (firstNonProdIdx === written.length) {
              firstNonProdIdx = i;
            }
          }

          // All production profiles must come before all non-production profiles
          expect(lastProdIdx).toBeLessThan(firstNonProdIdx);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('within the production group, profiles are sorted alphabetically by profile name', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 20 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        (profiles: GeneratedProfile[]) => {
          const { written } = generateConfigBlocks(profiles, emptyExisting, defaultOptions);

          const prodLookup = new Map(profiles.map((p) => [p.profileName, p.isProduction]));
          const prodNames = written.filter((name) => prodLookup.get(name));

          // Production names should be in alphabetical order
          for (let i = 1; i < prodNames.length; i++) {
            expect(prodNames[i - 1].localeCompare(prodNames[i])).toBeLessThanOrEqual(0);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('within the non-production group, profiles are sorted alphabetically by profile name', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 20 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        (profiles: GeneratedProfile[]) => {
          const { written } = generateConfigBlocks(profiles, emptyExisting, defaultOptions);

          const prodLookup = new Map(profiles.map((p) => [p.profileName, p.isProduction]));
          const nonProdNames = written.filter((name) => !prodLookup.get(name));

          // Non-production names should be in alphabetical order
          for (let i = 1; i < nonProdNames.length; i++) {
            expect(nonProdNames[i - 1].localeCompare(nonProdNames[i])).toBeLessThanOrEqual(0);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

// Feature: aws-sso-config-generator, Property 7: Duplicate profiles are skipped when force is false
// **Validates: Requirements 5.2**

describe('Property 7: Duplicate profiles are skipped when force is false', () => {
  it('when force is false, written output contains none of the profiles whose names appear in the existing set', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 15 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        fc.uniqueArray(profileName, { minLength: 0, maxLength: 10 }),
        (profiles: GeneratedProfile[], existingNames: string[]) => {
          const existing: ExistingConfig = {
            raw: '',
            profileNames: new Set(existingNames),
            sessionNames: new Set<string>(),
          };

          const options: WriteOptions = { ...defaultOptions, force: false };
          const { written } = generateConfigBlocks(profiles, existing, options);

          // No written profile name should appear in the existing set
          for (const name of written) {
            expect(existing.profileNames.has(name)).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('skipped list contains exactly the profile names that overlap with the existing set', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 15 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        fc.uniqueArray(profileName, { minLength: 0, maxLength: 10 }),
        (profiles: GeneratedProfile[], existingNames: string[]) => {
          const existing: ExistingConfig = {
            raw: '',
            profileNames: new Set(existingNames),
            sessionNames: new Set<string>(),
          };

          const options: WriteOptions = { ...defaultOptions, force: false };
          const { skipped } = generateConfigBlocks(profiles, existing, options);

          // Compute expected overlapping names
          const profileNameSet = new Set(profiles.map((p) => p.profileName));
          const expectedSkipped = new Set(
            existingNames.filter((name) => profileNameSet.has(name)),
          );

          const skippedNames = new Set(skipped.map((s) => s.profileName));
          expect(skippedNames).toEqual(expectedSkipped);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('when force is true, all profiles are written regardless of existing set', () => {
    fc.assert(
      fc.property(
        fc.array(generatedProfile, { minLength: 1, maxLength: 15 }).filter((profiles) => {
          const names = profiles.map((p) => p.profileName);
          return new Set(names).size === names.length;
        }),
        fc.uniqueArray(profileName, { minLength: 0, maxLength: 10 }),
        (profiles: GeneratedProfile[], existingNames: string[]) => {
          const existing: ExistingConfig = {
            raw: '',
            profileNames: new Set(existingNames),
            sessionNames: new Set<string>(),
          };

          const options: WriteOptions = { ...defaultOptions, force: true };
          const { written, skipped } = generateConfigBlocks(profiles, existing, options);

          // All profiles should be written when force is true
          expect(written.length).toBe(profiles.length);
          expect(skipped.length).toBe(0);
        },
      ),
      { numRuns: 150 },
    );
  });
});
