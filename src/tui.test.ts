import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function makeProfile(overrides: Partial<GeneratedProfile> = {}): GeneratedProfile {
  return {
    profileName: 'test-profile',
    accountId: '111111111111',
    accountName: 'test-account',
    roleName: 'AdministratorAccess',
    isProduction: false,
    ...overrides,
  };
}

describe('selectProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('returns empty array for empty input', async () => {
    const result = await selectProfiles([]);
    expect(result).toEqual([]);
    expect(mockedCheckbox).not.toHaveBeenCalled();
  });

  it('returns selected profiles when user confirms', async () => {
    const profiles = [
      makeProfile({ profileName: 'dev-account', accountName: 'dev-account', accountId: '111111111111' }),
      makeProfile({ profileName: 'staging-account', accountName: 'staging-account', accountId: '222222222222' }),
    ];

    mockedCheckbox.mockResolvedValueOnce(['dev-account']);
    mockedConfirm.mockResolvedValueOnce(true);

    const result = await selectProfiles(profiles);

    expect(result).toHaveLength(1);
    expect(result[0].profileName).toBe('dev-account');
  });

  it('returns empty array when user selects nothing', async () => {
    const profiles = [makeProfile()];

    mockedCheckbox.mockResolvedValueOnce([]);

    const result = await selectProfiles(profiles);
    expect(result).toEqual([]);
  });

  it('returns empty array when user declines confirmation', async () => {
    const profiles = [makeProfile({ profileName: 'my-profile' })];

    mockedCheckbox.mockResolvedValueOnce(['my-profile']);
    mockedConfirm.mockResolvedValueOnce(false);

    const result = await selectProfiles(profiles);
    expect(result).toEqual([]);
  });

  it('returns empty array when checkbox prompt is cancelled', async () => {
    const profiles = [makeProfile()];

    mockedCheckbox.mockRejectedValueOnce(new Error('User cancelled'));

    const result = await selectProfiles(profiles);
    expect(result).toEqual([]);
  });

  it('returns empty array when confirm prompt is cancelled', async () => {
    const profiles = [makeProfile({ profileName: 'my-profile' })];

    mockedCheckbox.mockResolvedValueOnce(['my-profile']);
    mockedConfirm.mockRejectedValueOnce(new Error('User cancelled'));

    const result = await selectProfiles(profiles);
    expect(result).toEqual([]);
  });

  it('sorts production profiles before non-production', async () => {
    const profiles = [
      makeProfile({ profileName: 'dev', accountName: 'dev', isProduction: false }),
      makeProfile({ profileName: 'prod-main', accountName: 'main-prod', isProduction: true }),
    ];

    mockedCheckbox.mockResolvedValueOnce(['prod-main', 'dev']);
    mockedConfirm.mockResolvedValueOnce(true);

    const result = await selectProfiles(profiles);
    expect(result).toHaveLength(2);

    // Verify checkbox was called with production profiles first
    const callArgs = mockedCheckbox.mock.calls[0][0];
    const choiceNames = (callArgs.choices as Array<{ name?: string }>)
      .filter((c) => 'name' in c && c.name)
      .map((c) => c.name);

    // Production profile should appear before non-production
    const prodIdx = choiceNames.findIndex((n) => n!.includes('⚠️'));
    const nonProdIdx = choiceNames.findIndex((n) => !n!.includes('⚠️'));
    expect(prodIdx).toBeLessThan(nonProdIdx);
  });

  it('prefixes production accounts with ⚠️ in display', async () => {
    const profiles = [
      makeProfile({ profileName: 'prod-acct', accountName: 'prod-acct', isProduction: true }),
    ];

    mockedCheckbox.mockResolvedValueOnce(['prod-acct']);
    mockedConfirm.mockResolvedValueOnce(true);

    await selectProfiles(profiles);

    const callArgs = mockedCheckbox.mock.calls[0][0];
    const choices = (callArgs.choices as Array<{ name?: string }>).filter(
      (c) => 'name' in c && c.name,
    );
    expect(choices[0].name).toContain('⚠️');
  });

  it('displays choice as accountName (accountId) — roleName', async () => {
    const profiles = [
      makeProfile({
        profileName: 'my-acct',
        accountName: 'my-acct',
        accountId: '123456789012',
        roleName: 'PowerUserAccess',
        isProduction: false,
      }),
    ];

    mockedCheckbox.mockResolvedValueOnce(['my-acct']);
    mockedConfirm.mockResolvedValueOnce(true);

    await selectProfiles(profiles);

    const callArgs = mockedCheckbox.mock.calls[0][0];
    const choices = (callArgs.choices as Array<{ name?: string }>).filter(
      (c) => 'name' in c && c.name,
    );
    expect(choices[0].name).toBe('my-acct (123456789012) — PowerUserAccess');
  });

  it('returns all selected profiles when multiple are chosen', async () => {
    const profiles = [
      makeProfile({ profileName: 'a', accountName: 'a' }),
      makeProfile({ profileName: 'b', accountName: 'b' }),
      makeProfile({ profileName: 'c', accountName: 'c' }),
    ];

    mockedCheckbox.mockResolvedValueOnce(['a', 'b', 'c']);
    mockedConfirm.mockResolvedValueOnce(true);

    const result = await selectProfiles(profiles);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.profileName)).toEqual(['a', 'b', 'c']);
  });
});
