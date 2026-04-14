import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationError, NetworkError } from './types.js';

// Mock the entire @aws-sdk/client-sso module
vi.mock('@aws-sdk/client-sso', () => {
  const sendMock = vi.fn();
  return {
    SSOClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
    ListAccountsCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'ListAccounts' })),
    ListAccountRolesCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'ListAccountRoles' })),
    __sendMock: sendMock,
  };
});

// Grab the shared send mock
async function getSendMock() {
  const mod = await import('@aws-sdk/client-sso') as unknown as { __sendMock: ReturnType<typeof vi.fn> };
  return mod.__sendMock;
}

describe('discoverAccountsAndRoles', () => {
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    sendMock = await getSendMock();
  });

  it('returns accounts and roles for a single page with single roles', async () => {
    // Page 1: one account, no nextToken
    sendMock.mockImplementation((cmd: Record<string, unknown>) => {
      if (cmd._type === 'ListAccounts') {
        return {
          accountList: [
            { accountId: '111111111111', accountName: 'dev-account', emailAddress: 'dev@example.com' },
          ],
          nextToken: undefined,
        };
      }
      if (cmd._type === 'ListAccountRoles') {
        return {
          roleList: [{ roleName: 'AdministratorAccess' }],
          nextToken: undefined,
        };
      }
    });

    const { discoverAccountsAndRoles } = await import('./discovery.js');
    const result = await discoverAccountsAndRoles('tok-123', 'us-east-1');

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toEqual({
      accountId: '111111111111',
      accountName: 'dev-account',
      emailAddress: 'dev@example.com',
    });
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0]).toEqual({
      accountId: '111111111111',
      accountName: 'dev-account',
      roleName: 'AdministratorAccess',
    });
  });

  it('handles multi-page pagination for accounts and roles', async () => {
    let accountCallCount = 0;
    let roleCallCounts: Record<string, number> = {};

    sendMock.mockImplementation((cmd: Record<string, unknown>) => {
      if (cmd._type === 'ListAccounts') {
        accountCallCount++;
        if (accountCallCount === 1) {
          return {
            accountList: [
              { accountId: '111111111111', accountName: 'account-one', emailAddress: 'one@example.com' },
            ],
            nextToken: 'accounts-page-2',
          };
        }
        return {
          accountList: [
            { accountId: '222222222222', accountName: 'account-two', emailAddress: 'two@example.com' },
          ],
          nextToken: undefined,
        };
      }
      if (cmd._type === 'ListAccountRoles') {
        const acctId = cmd.accountId as string;
        roleCallCounts[acctId] = (roleCallCounts[acctId] ?? 0) + 1;

        if (acctId === '111111111111') {
          if (roleCallCounts[acctId] === 1) {
            return {
              roleList: [{ roleName: 'AdminAccess' }],
              nextToken: 'roles-page-2',
            };
          }
          return {
            roleList: [{ roleName: 'ReadOnlyAccess' }],
            nextToken: undefined,
          };
        }
        // account-two: single page
        return {
          roleList: [{ roleName: 'PowerUserAccess' }],
          nextToken: undefined,
        };
      }
    });

    const { discoverAccountsAndRoles } = await import('./discovery.js');
    const result = await discoverAccountsAndRoles('tok-456', 'us-west-2');

    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.map((a) => a.accountId)).toEqual(['111111111111', '222222222222']);

    expect(result.roles).toHaveLength(3);
    expect(result.roles).toEqual([
      { accountId: '111111111111', accountName: 'account-one', roleName: 'AdminAccess' },
      { accountId: '111111111111', accountName: 'account-one', roleName: 'ReadOnlyAccess' },
      { accountId: '222222222222', accountName: 'account-two', roleName: 'PowerUserAccess' },
    ]);
  });

  it('wraps UnauthorizedException into AuthorizationError', async () => {
    const sdkError = new Error('Token is not valid');
    sdkError.name = 'UnauthorizedException';

    sendMock.mockRejectedValue(sdkError);

    const { discoverAccountsAndRoles } = await import('./discovery.js');
    await expect(discoverAccountsAndRoles('bad-tok', 'us-east-1')).rejects.toThrow(AuthorizationError);
  });

  it('wraps ECONNREFUSED network error into NetworkError', async () => {
    const netError = new Error('connect ECONNREFUSED 127.0.0.1:443');
    netError.name = 'Error';

    sendMock.mockRejectedValue(netError);

    const { discoverAccountsAndRoles } = await import('./discovery.js');
    await expect(discoverAccountsAndRoles('tok', 'eu-west-1')).rejects.toThrow(NetworkError);
  });

  it('returns empty accounts and roles when account list is empty', async () => {
    sendMock.mockImplementation((cmd: Record<string, unknown>) => {
      if (cmd._type === 'ListAccounts') {
        return { accountList: [], nextToken: undefined };
      }
    });

    const { discoverAccountsAndRoles } = await import('./discovery.js');
    const result = await discoverAccountsAndRoles('tok-empty', 'us-east-1');

    expect(result.accounts).toEqual([]);
    expect(result.roles).toEqual([]);
  });
});
