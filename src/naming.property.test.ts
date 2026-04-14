// Feature: aws-sso-config-generator, Property 1: Sanitization invariants
// **Validates: Requirements 2.1**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeName } from './naming.js';

describe('Property 1: Sanitization invariants', () => {
  it('sanitizeName output is lowercase, matches [a-z0-9-], has no consecutive hyphens, and no leading/trailing hyphens', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (input: string) => {
          const result = sanitizeName(input);

          // 1. Output is entirely lowercase
          expect(result).toBe(result.toLowerCase());

          // 2. Output only contains characters matching [a-z0-9-]
          expect(result).toMatch(/^[a-z0-9-]*$/);

          // 3. Output has no consecutive hyphens
          expect(result).not.toMatch(/--/);

          // 4. Output has no leading or trailing hyphens
          if (result.length > 0) {
            expect(result[0]).not.toBe('-');
            expect(result[result.length - 1]).not.toBe('-');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('handles unicode, whitespace, and special characters', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 100, unit: 'grapheme' }),
          fc.constant('---leading-trailing---'),
          fc.constant('  spaces  everywhere  '),
          fc.constant('UPPERCASE_AND_special!@#'),
          fc.constant('café résumé naïve'),
          fc.constant('\t\n\r'),
          fc.constant('!!!@@@###$$$'),
        ),
        (input: string) => {
          const result = sanitizeName(input);

          expect(result).toBe(result.toLowerCase());
          expect(result).toMatch(/^[a-z0-9-]*$/);
          expect(result).not.toMatch(/--/);
          if (result.length > 0) {
            expect(result[0]).not.toBe('-');
            expect(result[result.length - 1]).not.toBe('-');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: aws-sso-config-generator, Property 2: Profile naming follows single/multi role rules
// **Validates: Requirements 2.2, 2.3**

import { generateProfileNames, stripCommonSuffixes } from './naming.js';
import type { DiscoveredRole } from './types.js';

/**
 * Generator for alphanumeric names that won't sanitize to empty strings.
 */
const alphaName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/);

/**
 * Generator for a 12-digit AWS account ID.
 */
const accountId = fc.stringMatching(/^[0-9]{12}$/);

describe('Property 2: Profile naming follows single/multi role rules', () => {
  it('single-role accounts have profile name equal to sanitized account name (with optional prod- prefix)', () => {
    fc.assert(
      fc.property(
        accountId,
        alphaName,
        alphaName,
        (acctId: string, acctName: string, roleName: string) => {
          const roles: DiscoveredRole[] = [
            { accountId: acctId, accountName: acctName, roleName },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [] });

          expect(profiles).toHaveLength(1);
          const profile = profiles[0];
          // Single-role: profile name should be exactly the sanitized account name
          const expectedName = acctName.toLowerCase();
          expect(profile.profileName).toBe(expectedName);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('single-role accounts with prod detection get prod- prefix on sanitized account name', () => {
    fc.assert(
      fc.property(
        accountId,
        alphaName,
        alphaName,
        (acctId: string, acctName: string, roleName: string) => {
          // Inject the account name itself as a prod pattern to guarantee a match
          const roles: DiscoveredRole[] = [
            { accountId: acctId, accountName: acctName, roleName },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [acctName] });

          expect(profiles).toHaveLength(1);
          const profile = profiles[0];
          const sanitized = acctName.toLowerCase();
          expect(profile.profileName).toBe(`prod-${sanitized}`);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('multi-role accounts have profile name containing sanitized suffix-stripped permission set name', () => {
    fc.assert(
      fc.property(
        accountId,
        alphaName,
        alphaName,
        alphaName,
        (acctId: string, acctName: string, roleName1: string, roleName2: string) => {
          // Ensure two distinct role names so the account is multi-role
          fc.pre(roleName1.toLowerCase() !== roleName2.toLowerCase());

          const roles: DiscoveredRole[] = [
            { accountId: acctId, accountName: acctName, roleName: roleName1 },
            { accountId: acctId, accountName: acctName, roleName: roleName2 },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [] });

          expect(profiles).toHaveLength(2);

          for (const profile of profiles) {
            const strippedRole = stripCommonSuffixes(profile.roleName).toLowerCase();
            const sanitizedAccount = acctName.toLowerCase();

            // Multi-role: profile name should be `<sanitizedAccount>-<strippedRole>`
            expect(profile.profileName).toBe(`${sanitizedAccount}-${strippedRole}`);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('multi-role accounts with prod detection get prod- prefix and contain role suffix', () => {
    fc.assert(
      fc.property(
        accountId,
        alphaName,
        alphaName,
        alphaName,
        (acctId: string, acctName: string, roleName1: string, roleName2: string) => {
          fc.pre(roleName1.toLowerCase() !== roleName2.toLowerCase());

          const roles: DiscoveredRole[] = [
            { accountId: acctId, accountName: acctName, roleName: roleName1 },
            { accountId: acctId, accountName: acctName, roleName: roleName2 },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [acctName] });

          expect(profiles).toHaveLength(2);

          for (const profile of profiles) {
            const strippedRole = stripCommonSuffixes(profile.roleName).toLowerCase();
            const sanitizedAccount = acctName.toLowerCase();

            expect(profile.profileName).toBe(`prod-${sanitizedAccount}-${strippedRole}`);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: aws-sso-config-generator, Property 3: All generated profile names are unique
// **Validates: Requirements 2.5**

describe('Property 3: All generated profile names are unique', () => {
  /**
   * Generator for names constrained to valid alphanumeric strings.
   * Uses short names (3-15 chars) to increase collision likelihood after sanitization.
   */
  const shortName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,15}$/);

  /**
   * Generator for a 12-digit AWS account ID.
   */
  const acctId = fc.stringMatching(/^[0-9]{12}$/);

  /**
   * Generator for a single DiscoveredRole with controlled field values.
   */
  const discoveredRole = fc.record({
    accountId: acctId,
    accountName: shortName,
    roleName: shortName,
  });

  it('all profile names are distinct for any set of discovered roles', () => {
    fc.assert(
      fc.property(
        fc.array(discoveredRole, { minLength: 1, maxLength: 20 }),
        (roles: DiscoveredRole[]) => {
          const profiles = generateProfileNames(roles, { prodPatterns: [] });

          const names = profiles.map((p) => p.profileName);
          const uniqueNames = new Set(names);

          expect(uniqueNames.size).toBe(names.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('profile names remain unique when deliberately similar account names cause collisions', () => {
    fc.assert(
      fc.property(
        acctId,
        acctId,
        shortName,
        shortName,
        (id1: string, id2: string, roleName1: string, roleName2: string) => {
          // Two different accounts with the SAME account name — forces collision
          fc.pre(id1 !== id2);

          const sharedAccountName = 'SharedAccount';
          const roles: DiscoveredRole[] = [
            { accountId: id1, accountName: sharedAccountName, roleName: roleName1 },
            { accountId: id2, accountName: sharedAccountName, roleName: roleName2 },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [] });

          const names = profiles.map((p) => p.profileName);
          const uniqueNames = new Set(names);

          expect(uniqueNames.size).toBe(names.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('profile names remain unique with mixed prod and non-prod accounts sharing names', () => {
    fc.assert(
      fc.property(
        acctId,
        acctId,
        shortName,
        (id1: string, id2: string, roleName: string) => {
          fc.pre(id1 !== id2);

          // Same account name, same role name, different account IDs
          // One is prod, one is not — but after prod prefix they could still collide
          const roles: DiscoveredRole[] = [
            { accountId: id1, accountName: 'production-app', roleName },
            { accountId: id2, accountName: 'production-app', roleName },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: ['production'] });

          const names = profiles.map((p) => p.profileName);
          const uniqueNames = new Set(names);

          expect(uniqueNames.size).toBe(names.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('profile names remain unique with accounts that sanitize to the same string', () => {
    fc.assert(
      fc.property(
        acctId,
        acctId,
        shortName,
        (id1: string, id2: string, roleName: string) => {
          fc.pre(id1 !== id2);

          // These account names differ in raw form but sanitize identically
          // e.g. "My_App" and "my-app" both become "my-app"
          const roles: DiscoveredRole[] = [
            { accountId: id1, accountName: 'My_App', roleName },
            { accountId: id2, accountName: 'my-app', roleName },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [] });

          const names = profiles.map((p) => p.profileName);
          const uniqueNames = new Set(names);

          expect(uniqueNames.size).toBe(names.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: aws-sso-config-generator, Property 4: Production detection is case-insensitive and prefixes with prod-
// **Validates: Requirements 3.1, 3.2, 3.4**

import { isProductionAccount } from './naming.js';

describe('Property 4: Production detection is case-insensitive and prefixes with prod-', () => {
  /**
   * Generator for alphanumeric names that won't sanitize to empty strings.
   */
  const alphaNameP4 = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/);

  /**
   * Generator for a 12-digit AWS account ID.
   */
  const accountIdP4 = fc.stringMatching(/^[0-9]{12}$/);

  /**
   * Generator for non-empty alphanumeric patterns (at least 1 char).
   */
  const alphaPattern = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/);

  it('isProductionAccount returns true when account name contains a pattern (case-insensitive)', () => {
    fc.assert(
      fc.property(
        alphaNameP4,
        alphaNameP4,
        alphaPattern,
        (prefix: string, suffix: string, pattern: string) => {
          // Randomize the case of the pattern embedded in the account name
          const mixedCasePattern = pattern
            .split('')
            .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
            .join('');

          // Embed the pattern into the account name to guarantee a substring match
          const accountName = `${prefix}${mixedCasePattern}${suffix}`;

          expect(isProductionAccount(accountName, [pattern])).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('isProductionAccount returns false when account name contains no pattern', () => {
    fc.assert(
      fc.property(
        alphaNameP4,
        fc.array(alphaPattern, { minLength: 1, maxLength: 5 }),
        (accountName: string, patterns: string[]) => {
          // Precondition: none of the patterns appear in the account name (case-insensitive)
          const lowerName = accountName.toLowerCase();
          fc.pre(patterns.every((p) => !lowerName.includes(p.toLowerCase())));

          expect(isProductionAccount(accountName, patterns)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('generated profile names start with prod- when production detected', () => {
    fc.assert(
      fc.property(
        accountIdP4,
        alphaNameP4,
        alphaNameP4,
        alphaPattern,
        (acctId: string, prefix: string, roleName: string, pattern: string) => {
          // Build an account name that contains the pattern
          const accountName = `${prefix}${pattern}`;

          const roles: DiscoveredRole[] = [
            { accountId: acctId, accountName, roleName },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: [pattern] });

          expect(profiles).toHaveLength(1);
          expect(profiles[0].isProduction).toBe(true);
          expect(profiles[0].profileName.startsWith('prod-')).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('generated profile names do NOT start with prod- when not production', () => {
    fc.assert(
      fc.property(
        accountIdP4,
        alphaNameP4,
        alphaNameP4,
        fc.array(alphaPattern, { minLength: 1, maxLength: 5 }),
        (acctId: string, accountName: string, roleName: string, patterns: string[]) => {
          // Precondition: account name does not contain any pattern
          const lowerName = accountName.toLowerCase();
          fc.pre(patterns.every((p) => !lowerName.includes(p.toLowerCase())));

          const roles: DiscoveredRole[] = [
            { accountId: acctId, accountName, roleName },
          ];

          const profiles = generateProfileNames(roles, { prodPatterns: patterns });

          expect(profiles).toHaveLength(1);
          expect(profiles[0].isProduction).toBe(false);
          expect(profiles[0].profileName.startsWith('prod-')).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
