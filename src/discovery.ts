import {
  SSOClient,
  ListAccountsCommand,
  ListAccountRolesCommand,
} from '@aws-sdk/client-sso';
import type {
  DiscoveredAccount,
  DiscoveredRole,
  DiscoveryResult,
} from './types.js';
import { AuthorizationError, NetworkError } from './types.js';

/**
 * Discovers all SSO accounts and their roles using the provided access token.
 *
 * Paginates through ListAccounts and ListAccountRoles, returning a flat
 * list of every account-role combination the caller has access to.
 */
export async function discoverAccountsAndRoles(
  accessToken: string,
  ssoRegion: string,
): Promise<DiscoveryResult> {
  const client = new SSOClient({ region: ssoRegion });

  try {
    const accounts = await listAllAccounts(client, accessToken);
    const roles: DiscoveredRole[] = [];

    for (const account of accounts) {
      const accountRoles = await listAllRoles(client, accessToken, account);
      roles.push(...accountRoles);
    }

    return { accounts, roles };
  } catch (error) {
    throw wrapSdkError(error, ssoRegion);
  }
}

/**
 * Paginate through all accounts via ListAccountsCommand.
 */
async function listAllAccounts(
  client: SSOClient,
  accessToken: string,
): Promise<DiscoveredAccount[]> {
  const accounts: DiscoveredAccount[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListAccountsCommand({ accessToken, nextToken }),
    );

    for (const info of response.accountList ?? []) {
      accounts.push({
        accountId: info.accountId ?? '',
        accountName: info.accountName ?? '',
        emailAddress: info.emailAddress ?? '',
      });
    }

    nextToken = response.nextToken;
  } while (nextToken);

  return accounts;
}

/**
 * Paginate through all roles for a single account via ListAccountRolesCommand.
 */
async function listAllRoles(
  client: SSOClient,
  accessToken: string,
  account: DiscoveredAccount,
): Promise<DiscoveredRole[]> {
  const roles: DiscoveredRole[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListAccountRolesCommand({
        accessToken,
        accountId: account.accountId,
        nextToken,
      }),
    );

    for (const info of response.roleList ?? []) {
      roles.push({
        accountId: account.accountId,
        accountName: account.accountName,
        roleName: info.roleName ?? '',
      });
    }

    nextToken = response.nextToken;
  } while (nextToken);

  return roles;
}

/**
 * Wrap AWS SDK errors into our domain error types.
 * - UnauthorizedException / 401 / 403 → AuthorizationError
 * - Network / connection failures → NetworkError
 * - Already-wrapped errors pass through
 */
function wrapSdkError(error: unknown, ssoRegion: string): Error {
  if (error instanceof AuthorizationError || error instanceof NetworkError) {
    return error;
  }

  if (error instanceof Error) {
    // AWS SDK UnauthorizedException or HTTP 401/403
    const name = error.name;
    if (
      name === 'UnauthorizedException' ||
      name === 'ForbiddenException' ||
      name === 'AccessDeniedException'
    ) {
      return new AuthorizationError(error.message);
    }

    // Check for HTTP status code on SDK errors
    const statusCode = (error as unknown as Record<string, unknown>)['$metadata'] as
      | { httpStatusCode?: number }
      | undefined;
    if (statusCode?.httpStatusCode === 401 || statusCode?.httpStatusCode === 403) {
      return new AuthorizationError(error.message);
    }

    // Network / connection errors
    if (
      name === 'NetworkingError' ||
      name === 'TimeoutError' ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('getaddrinfo') ||
      error.message.includes('socket hang up')
    ) {
      return new NetworkError(ssoRegion, error.message);
    }
  }

  // Unknown errors — re-throw as-is
  return error instanceof Error ? error : new Error(String(error));
}
