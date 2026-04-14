// Feature: aws-sso-config-generator, Property 8: TUI selection filters output to confirmed profiles only
// **Validates: Requirements 11.9**

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { GeneratedProfile } from './types.js';

// Mock @inquirer/prompts before importing tui
vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  Separator: class Separator {
    separator: string;
    type = 'separator' as const;
    constructor(sep = '---') {
      this.separator = sep;
    }
  },
}));

import { selectProfiles } from './tui.js';
import { checkbox, confirm } from '@inquirer/prompts';

const mockedCheckbox = vi.mocked(checkbox);
const mockedConfirm = vi.mocked(confirm);

/**
 * Generator for profile names: lowercase alpha start, then alphanumeric/hyphens.
 */
const profileNameGen = fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/);

/**
 * Generator for 12-digit AWS account IDs.
 */
const accountIdGen = fc.stringMatching(/^[0-9]{12}$/);

/**
 * Generator for simple alpha role names.
 */
const roleNameGen = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,15}$/);

/**
 * Generator for a list of GeneratedProfiles with unique profile names,
 * paired with a subarray representing the user's selection.
 */
const profilesWithSelectionGen = fc
  .uniqueArray(profileNameGen, { minLength: 1, maxLength: 12 })
  .chain((names) =>
    fc.tuple(
      fc.tuple(
        ...names.map((name) =>
          fc.record({
            profileName: fc.constant(name),
            accountId: accountIdGen,
            accountName: fc.constant(name),
            roleName: roleNameGen,
            isProduction: fc.boolean(),
          }),
        ),
      ),
    ).chain(([profiles]) =>
      fc.record({
        profiles: fc.constant(profiles as GeneratedProfile[]),
        selected: fc.subarray(profiles as GeneratedProfile[], { minLength: 1 }),
      }),
    ),
  );

const profilesOnlyGen = fc
  .uniqueArray(profileNameGen, { minLength: 1, maxLength: 12 })
  .chain((names) =>
    fc.tuple(
      ...names.map((name) =>
        fc.record({
          profileName: fc.constant(name),
          accountId: accountIdGen,
          accountName: fc.constant(name),
          roleName: roleNameGen,
          isProduction: fc.boolean(),
        }),
      ),
    ).map((profiles) => profiles as GeneratedProfile[]),
  );

describe('Property 8: TUI selection filters output to confirmed profiles only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('for any list of profiles and any confirmed subset, selectProfiles returns exactly the selected profiles and no others', async () => {
    await fc.assert(
      fc.asyncProperty(
        profilesWithSelectionGen,
        async ({ profiles, selected }) => {
          const selectedNames = selected.map((p) => p.profileName);

          // Mock checkbox to return the selected profile names
          mockedCheckbox.mockResolvedValueOnce(selectedNames);
          // Mock confirm to approve the selection
          mockedConfirm.mockResolvedValueOnce(true);

          const result = await selectProfiles(profiles);

          // Result should contain exactly the selected profiles
          const resultNames = result.map((p) => p.profileName);
          expect(resultNames).toHaveLength(selectedNames.length);
          expect(new Set(resultNames)).toEqual(new Set(selectedNames));

          // Every returned profile should be a full match from the original list
          for (const resultProfile of result) {
            const original = profiles.find((p) => p.profileName === resultProfile.profileName);
            expect(original).toBeDefined();
            expect(resultProfile.accountId).toBe(original!.accountId);
            expect(resultProfile.accountName).toBe(original!.accountName);
            expect(resultProfile.roleName).toBe(original!.roleName);
            expect(resultProfile.isProduction).toBe(original!.isProduction);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when user declines confirmation, no profiles are returned regardless of selection', async () => {
    await fc.assert(
      fc.asyncProperty(
        profilesWithSelectionGen,
        async ({ profiles, selected }) => {
          const selectedNames = selected.map((p) => p.profileName);

          mockedCheckbox.mockResolvedValueOnce(selectedNames);
          // User declines confirmation
          mockedConfirm.mockResolvedValueOnce(false);

          const result = await selectProfiles(profiles);
          expect(result).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('empty selection returns no profiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        profilesOnlyGen,
        async (profiles) => {
          // User selects nothing
          mockedCheckbox.mockResolvedValueOnce([]);

          const result = await selectProfiles(profiles);
          expect(result).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
