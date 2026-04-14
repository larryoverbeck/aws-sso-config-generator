import type { DiscoveredRole, GeneratedProfile, ProfileNameOptions } from './types.js';

/**
 * Common suffixes stripped from permission set names when building profile names.
 * Checked case-insensitively; longest match wins.
 */
const COMMON_SUFFIXES = ['Access', 'Role', 'Policy'];

/**
 * Sanitize a raw string into a valid profile-name segment.
 *
 * Rules:
 *  1. Lowercase the input
 *  2. Replace non-alphanumeric characters (except hyphens) with hyphens
 *  3. Collapse consecutive hyphens into one
 *  4. Trim leading/trailing hyphens
 */
export function sanitizeName(raw: string): string {
  if (!raw) return '';

  const result = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return result;
}

/**
 * Strip common suffixes from a permission set name.
 * e.g. "AdministratorAccess" → "Administrator", "ReadOnlyAccess" → "ReadOnly"
 */
export function stripCommonSuffixes(permissionSetName: string): string {
  for (const suffix of COMMON_SUFFIXES) {
    if (
      permissionSetName.length > suffix.length &&
      permissionSetName.toLowerCase().endsWith(suffix.toLowerCase())
    ) {
      return permissionSetName.slice(0, -suffix.length);
    }
  }
  return permissionSetName;
}

/**
 * Case-insensitive substring match of account name against production patterns.
 */
export function isProductionAccount(accountName: string, patterns: string[]): boolean {
  const lower = accountName.toLowerCase();
  return patterns.some((p) => p.length > 0 && lower.includes(p.toLowerCase()));
}

/**
 * Generate unique, human-friendly profile names for a set of discovered roles.
 *
 * Algorithm:
 *  1. Group roles by accountId
 *  2. Single-role accounts → sanitized account name only
 *  3. Multi-role accounts  → sanitized account name + stripped, sanitized permission set name
 *  4. Detect production accounts and prefix with "prod-"
 *  5. Resolve any collisions by appending the account ID suffix
 */
export function generateProfileNames(
  roles: DiscoveredRole[],
  options: ProfileNameOptions,
): GeneratedProfile[] {
  // Group roles by accountId
  const byAccount = new Map<string, DiscoveredRole[]>();
  for (const role of roles) {
    const group = byAccount.get(role.accountId) ?? [];
    group.push(role);
    byAccount.set(role.accountId, group);
  }

  // Phase 1: build raw profile names
  const profiles: GeneratedProfile[] = [];

  for (const [, accountRoles] of byAccount) {
    const isSingleRole = accountRoles.length === 1;

    for (const role of accountRoles) {
      const isProd = isProductionAccount(role.accountName, options.prodPatterns);
      let baseName = sanitizeName(role.accountName);

      // Fallback to account ID when sanitized name is empty
      if (!baseName) {
        baseName = role.accountId;
      }

      let profileName: string;
      if (isSingleRole) {
        profileName = baseName;
      } else {
        const strippedRole = sanitizeName(stripCommonSuffixes(role.roleName));
        profileName = strippedRole ? `${baseName}-${strippedRole}` : baseName;
      }

      if (isProd) {
        profileName = `prod-${profileName}`;
      }

      profiles.push({
        profileName,
        accountId: role.accountId,
        accountName: role.accountName,
        roleName: role.roleName,
        isProduction: isProd,
      });
    }
  }

  // Phase 2: resolve collisions by appending account ID suffix
  const nameCounts = new Map<string, number>();
  for (const p of profiles) {
    nameCounts.set(p.profileName, (nameCounts.get(p.profileName) ?? 0) + 1);
  }

  const seenNames = new Set<string>();
  for (const p of profiles) {
    if (nameCounts.get(p.profileName)! > 1 || seenNames.has(p.profileName)) {
      // Collision detected — append account ID
      const candidate = `${p.profileName}-${p.accountId}`;
      p.profileName = candidate;
    }
    seenNames.add(p.profileName);
  }

  return profiles;
}
