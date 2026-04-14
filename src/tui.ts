import { checkbox, confirm, Separator } from '@inquirer/prompts';
import type { GeneratedProfile } from './types.js';

/**
 * Formats a single profile for display in the checkbox list.
 * Production accounts are prefixed with ⚠️.
 */
function formatChoiceLabel(profile: GeneratedProfile): string {
  const prefix = profile.isProduction ? '⚠️  ' : '';
  return `${prefix}${profile.accountName} (${profile.accountId}) — ${profile.roleName}`;
}

/**
 * Sorts profiles: production first (alphabetically by label), then non-production (alphabetically).
 */
function sortProfiles(profiles: GeneratedProfile[]): GeneratedProfile[] {
  return [...profiles].sort((a, b) => {
    if (a.isProduction !== b.isProduction) {
      return a.isProduction ? -1 : 1;
    }
    const labelA = `${a.accountName}-${a.roleName}`.toLowerCase();
    const labelB = `${b.accountName}-${b.roleName}`.toLowerCase();
    return labelA.localeCompare(labelB);
  });
}

/**
 * Presents an interactive checkbox prompt for the user to select which
 * profiles to generate. Shows a confirmation summary before proceeding.
 *
 * Returns the selected profiles, or an empty array if the user cancels.
 */
export async function selectProfiles(
  profiles: GeneratedProfile[],
): Promise<GeneratedProfile[]> {
  if (profiles.length === 0) {
    return [];
  }

  const sorted = sortProfiles(profiles);

  // Build choices with separators for production vs non-production groups
  const prodProfiles = sorted.filter((p) => p.isProduction);
  const nonProdProfiles = sorted.filter((p) => !p.isProduction);

  const choices: Array<
    { name: string; value: string; checked: boolean } | Separator
  > = [];

  if (prodProfiles.length > 0) {
    choices.push(new Separator('── ⚠️  PRODUCTION ──'));
    for (const p of prodProfiles) {
      choices.push({
        name: formatChoiceLabel(p),
        value: p.profileName,
        checked: false,
      });
    }
  }

  if (nonProdProfiles.length > 0) {
    choices.push(new Separator('── ACCOUNTS ──'));
    for (const p of nonProdProfiles) {
      choices.push({
        name: formatChoiceLabel(p),
        value: p.profileName,
        checked: false,
      });
    }
  }

  // Create a lookup map from profileName to GeneratedProfile
  const profileMap = new Map<string, GeneratedProfile>();
  for (const p of profiles) {
    profileMap.set(p.profileName, p);
  }

  let selectedNames: string[];
  try {
    selectedNames = await checkbox({
      message:
        'Select profiles to generate (space toggle, a select all, i invert, enter confirm):',
      choices,
      pageSize: 20,
      loop: true,
    });
  } catch {
    // User cancelled (Ctrl+C or escape)
    console.log('\n✖ Selection cancelled. No profiles generated.');
    return [];
  }

  if (selectedNames.length === 0) {
    console.log('\n✖ No profiles selected. Nothing to generate.');
    return [];
  }

  // Resolve selected profiles
  const selected = selectedNames
    .map((name) => profileMap.get(name))
    .filter((p): p is GeneratedProfile => p !== undefined);

  // Show confirmation summary
  console.log(`\n📋 Confirm selection (${selected.length} profile${selected.length === 1 ? '' : 's'}):\n`);
  for (const p of selected) {
    const prefix = p.isProduction ? '  ⚠️  ' : '  ';
    console.log(`${prefix}${p.profileName}  (${p.accountId}) — ${p.roleName}`);
  }
  console.log();

  let confirmed: boolean;
  try {
    confirmed = await confirm({
      message: `Write these ${selected.length} profile${selected.length === 1 ? '' : 's'}?`,
      default: true,
    });
  } catch {
    // User cancelled confirmation (Ctrl+C or escape)
    console.log('\n✖ Selection cancelled. No profiles generated.');
    return [];
  }

  if (!confirmed) {
    console.log('\n✖ Selection cancelled. No profiles generated.');
    return [];
  }

  return selected;
}
