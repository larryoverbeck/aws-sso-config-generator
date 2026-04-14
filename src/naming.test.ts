import { describe, it, expect } from 'vitest';
import {
  sanitizeName,
  stripCommonSuffixes,
  generateProfileNames,
  isProductionAccount,
} from './naming.js';
import type { DiscoveredRole } from './types.js';

// ── sanitizeName ───────────────────────────────────────────────────
// Requirements: 2.1

describe('sanitizeName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(sanitizeName('My Account')).toBe('my-account');
  });

  it('collapses and trims leading/trailing hyphens', () => {
    expect(sanitizeName('---test---')).toBe('test');
  });

  it('replaces underscores and lowercases', () => {
    expect(sanitizeName('UPPER_CASE')).toBe('upper-case');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeName('')).toBe('');
  });

  it('strips non-ASCII characters', () => {
    expect(sanitizeName('café')).toBe('caf');
  });

  it('handles special characters', () => {
    expect(sanitizeName('hello!@#world')).toBe('hello-world');
  });

  it('handles all-special-character input', () => {
    expect(sanitizeName('!@#$%^&*()')).toBe('');
  });

  it('preserves digits', () => {
    expect(sanitizeName('account-123')).toBe('account-123');
  });

  it('handles mixed whitespace', () => {
    expect(sanitizeName('  spaced  out  ')).toBe('spaced-out');
  });
});

// ── stripCommonSuffixes ────────────────────────────────────────────
// Requirements: 2.4

describe('stripCommonSuffixes', () => {
  it('strips "Access" suffix', () => {
    expect(stripCommonSuffixes('AdministratorAccess')).toBe('Administrator');
  });

  it('strips "Access" from PowerUserAccess', () => {
    expect(stripCommonSuffixes('PowerUserAccess')).toBe('PowerUser');
  });

  it('strips "Access" from ReadOnlyAccess', () => {
    expect(stripCommonSuffixes('ReadOnlyAccess')).toBe('ReadOnly');
  });

  it('leaves names without known suffixes unchanged', () => {
    expect(stripCommonSuffixes('CustomRole')).toBe('Custom');
  });

  it('leaves names with no matching suffix unchanged', () => {
    expect(stripCommonSuffixes('ViewOnly')).toBe('ViewOnly');
  });

  it('is case-insensitive for suffix matching', () => {
    expect(stripCommonSuffixes('Adminaccess')).toBe('Admin');
  });

  it('does not strip if result would be empty', () => {
    expect(stripCommonSuffixes('Access')).toBe('Access');
    expect(stripCommonSuffixes('Role')).toBe('Role');
  });
});

// ── generateProfileNames ──────────────────────────────────────────
// Requirements: 2.2, 2.3, 2.5

describe('generateProfileNames', () => {
  it('uses sanitized account name only for single-role accounts', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '111111111111', accountName: 'My Sandbox', roleName: 'AdministratorAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: [] });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].profileName).toBe('my-sandbox');
  });

  it('appends stripped role name for multi-role accounts', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '222222222222', accountName: 'Dev Account', roleName: 'AdministratorAccess' },
      { accountId: '222222222222', accountName: 'Dev Account', roleName: 'ReadOnlyAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: [] });

    expect(profiles).toHaveLength(2);
    const names = profiles.map((p) => p.profileName).sort();
    expect(names).toEqual(['dev-account-administrator', 'dev-account-readonly']);
  });

  it('resolves collisions by appending account ID', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '111111111111', accountName: 'shared', roleName: 'ViewerAccess' },
      { accountId: '222222222222', accountName: 'shared', roleName: 'ViewerAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: [] });

    expect(profiles).toHaveLength(2);
    const names = new Set(profiles.map((p) => p.profileName));
    expect(names.size).toBe(2);
    // Both should have account ID appended to resolve collision
    for (const p of profiles) {
      expect(p.profileName).toContain(p.accountId);
    }
  });

  it('falls back to account ID when account name sanitizes to empty', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '333333333333', accountName: '!!!', roleName: 'AdminAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: [] });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].profileName).toBe('333333333333');
  });

  it('handles mix of single-role and multi-role accounts', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '111111111111', accountName: 'sandbox', roleName: 'PowerUserAccess' },
      { accountId: '222222222222', accountName: 'staging', roleName: 'AdministratorAccess' },
      { accountId: '222222222222', accountName: 'staging', roleName: 'ReadOnlyAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: [] });

    expect(profiles).toHaveLength(3);
    const nameMap = new Map(profiles.map((p) => [p.profileName, p]));
    expect(nameMap.has('sandbox')).toBe(true);
    expect(nameMap.has('staging-administrator')).toBe(true);
    expect(nameMap.has('staging-readonly')).toBe(true);
  });
});

// ── isProductionAccount ───────────────────────────────────────────
// Requirements: 3.1, 3.2, 3.3, 3.4

describe('isProductionAccount', () => {
  const defaultPatterns = ['prod', 'production', 'prd'];

  it('detects "prod" substring', () => {
    expect(isProductionAccount('my-prod-account', defaultPatterns)).toBe(true);
  });

  it('detects "production" substring', () => {
    expect(isProductionAccount('production-web', defaultPatterns)).toBe(true);
  });

  it('detects "prd" substring', () => {
    expect(isProductionAccount('app-prd-01', defaultPatterns)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isProductionAccount('PRODUCTION-APP', defaultPatterns)).toBe(true);
    expect(isProductionAccount('My-Prod-Account', defaultPatterns)).toBe(true);
    expect(isProductionAccount('PRD-Service', defaultPatterns)).toBe(true);
  });

  it('returns false when no pattern matches', () => {
    expect(isProductionAccount('sandbox', defaultPatterns)).toBe(false);
    expect(isProductionAccount('dev-account', defaultPatterns)).toBe(false);
    expect(isProductionAccount('staging', defaultPatterns)).toBe(false);
  });

  it('works with custom patterns', () => {
    const custom = ['live', 'release'];
    expect(isProductionAccount('live-api', custom)).toBe(true);
    expect(isProductionAccount('release-v2', custom)).toBe(true);
    expect(isProductionAccount('prod-app', custom)).toBe(false);
  });

  it('returns false for empty patterns array', () => {
    expect(isProductionAccount('production', [])).toBe(false);
  });

  it('ignores empty string patterns', () => {
    expect(isProductionAccount('anything', [''])).toBe(false);
  });
});

// ── Production prefix in generateProfileNames ─────────────────────
// Requirements: 3.1, 3.2, 3.4

describe('generateProfileNames — production prefix', () => {
  it('prefixes production accounts with prod-', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '123456789012', accountName: 'production-web', roleName: 'AdminAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: ['production'] });

    expect(profiles[0].profileName).toBe('prod-production-web');
    expect(profiles[0].isProduction).toBe(true);
  });

  it('does not prefix non-production accounts', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '111111111111', accountName: 'sandbox', roleName: 'AdminAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: ['prod'] });

    expect(profiles[0].profileName).toBe('sandbox');
    expect(profiles[0].isProduction).toBe(false);
  });

  it('applies prod- prefix to multi-role production accounts', () => {
    const roles: DiscoveredRole[] = [
      { accountId: '123456789012', accountName: 'prod-app', roleName: 'AdministratorAccess' },
      { accountId: '123456789012', accountName: 'prod-app', roleName: 'ReadOnlyAccess' },
    ];

    const profiles = generateProfileNames(roles, { prodPatterns: ['prod'] });

    expect(profiles).toHaveLength(2);
    for (const p of profiles) {
      expect(p.profileName.startsWith('prod-')).toBe(true);
      expect(p.isProduction).toBe(true);
    }
  });
});
