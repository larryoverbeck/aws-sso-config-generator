import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ProdAccountsConfig {
  description?: string;
  accountIds: string[];
}

/**
 * Resolve the path to prod-accounts.json relative to the project root.
 * Walks up from the current working directory looking for the file,
 * falling back to cwd/prod-accounts.json.
 */
export function resolveProdAccountsPath(): string {
  // Try to find it relative to the executable or cwd
  const candidates = [
    path.join(process.cwd(), 'prod-accounts.json'),
    path.join(path.dirname(process.argv[1] ?? ''), 'prod-accounts.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Default to cwd
  return path.join(process.cwd(), 'prod-accounts.json');
}

/**
 * Load prod account IDs from prod-accounts.json.
 * Returns an empty array if the file doesn't exist or is malformed.
 */
export function loadProdAccountIds(filePath?: string): string[] {
  const resolvedPath = filePath ?? resolveProdAccountsPath();

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(raw) as ProdAccountsConfig;
    if (Array.isArray(parsed.accountIds)) {
      return parsed.accountIds.filter((id) => typeof id === 'string' && id.length > 0);
    }
  } catch {
    // File doesn't exist or is malformed — return empty
  }

  return [];
}

/**
 * Save prod account IDs to prod-accounts.json.
 */
export function saveProdAccountIds(accountIds: string[], filePath?: string): void {
  const resolvedPath = filePath ?? resolveProdAccountsPath();

  const config: ProdAccountsConfig = {
    description: 'Account IDs manually marked as production. Commit this file to share with your team.',
    accountIds: [...new Set(accountIds)].sort(),
  };

  fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
