// ── Shared Interfaces ──────────────────────────────────────────────

/** OS-specific paths for AWS CLI configuration and SSO cache. */
export interface PlatformPaths {
  awsHomeDir: string;
  configPath: string;
  ssoCacheDir: string;
}

/** Cached SSO bearer token read from the SSO cache directory. */
export interface SsoToken {
  accessToken: string;
  expiresAt: string; // ISO 8601 timestamp
  region?: string;
  startUrl?: string;
}

/** An AWS account discovered via the SSO list-accounts API. */
export interface DiscoveredAccount {
  accountId: string;
  accountName: string;
  emailAddress: string;
}

/** A single account + role combination discovered via SSO. */
export interface DiscoveredRole {
  accountId: string;
  accountName: string;
  roleName: string; // Permission set name, e.g. "AdministratorAccess"
}

/** Aggregated result of SSO account and role discovery. */
export interface DiscoveryResult {
  accounts: DiscoveredAccount[];
  roles: DiscoveredRole[];
}

/** Options controlling profile name generation. */
export interface ProfileNameOptions {
  prodPatterns: string[]; // e.g. ["prod", "production", "prd"]
  prodAccountIds?: string[]; // manually marked account IDs from prod-accounts.json
}

/** A generated AWS CLI profile with metadata. */
export interface GeneratedProfile {
  profileName: string;
  accountId: string;
  accountName: string;
  roleName: string;
  isProduction: boolean;
}

/** Parsed representation of an existing AWS config file. */
export interface ExistingConfig {
  raw: string;
  profileNames: Set<string>;
  sessionNames: Set<string>;
}

/** A profile that was skipped during config generation. */
export interface SkippedProfile {
  profileName: string;
  reason: string; // e.g. "profile already exists in config"
}

/** Options for config block generation and writing. */
export interface WriteOptions {
  ssoStartUrl: string;
  ssoRegion: string;
  sessionName: string;
  defaultRegion: string;
  outputFormat: string;
  force: boolean;
}

/** Result of a config write operation. */
export interface WriteResult {
  written: string[];
  skipped: SkippedProfile[];
  backupPath?: string;
  outputPath: string;
}

/** CLI configuration resolved from flags and defaults. */
export interface CliConfig {
  ssoStartUrl: string;
  ssoRegion: string;
  sessionName: string;
  defaultRegion: string;
  outputFormat: string;
  prodPatterns: string[];
  write: boolean;
  force: boolean;
  outputPath?: string;
  interactive: boolean;
}

// ── Error Classes ──────────────────────────────────────────────────

/** SSO access token has expired. */
export class TokenExpiredError extends Error {
  constructor(message = 'SSO session expired. Run `aws sso login` to refresh.') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

/** No cached SSO token found for the given start URL. */
export class TokenNotFoundError extends Error {
  constructor(message = 'No SSO token found. Run `aws sso login` first.') {
    super(message);
    this.name = 'TokenNotFoundError';
  }
}

/** SSO API returned a 401/403 authorization error. */
export class AuthorizationError extends Error {
  constructor(message = 'SSO authorization failed — session may be expired. Run `aws sso login`.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** SSO API endpoint is unreachable. */
export class NetworkError extends Error {
  public readonly endpoint: string;

  constructor(endpoint: string, message?: string) {
    super(message ?? `Cannot reach SSO endpoint at ${endpoint}. Check network connectivity.`);
    this.name = 'NetworkError';
    this.endpoint = endpoint;
  }
}

/** AWS config file cannot be read (e.g. permission denied). */
export class ConfigReadError extends Error {
  public readonly filePath: string;

  constructor(filePath: string, message?: string) {
    super(message ?? `Cannot read ${filePath}: permission denied.`);
    this.name = 'ConfigReadError';
    this.filePath = filePath;
  }
}

/** AWS config file cannot be written (e.g. permission denied). */
export class ConfigWriteError extends Error {
  public readonly filePath: string;

  constructor(filePath: string, message?: string) {
    super(message ?? `Cannot write to ${filePath}: permission denied.`);
    this.name = 'ConfigWriteError';
    this.filePath = filePath;
  }
}

/** Warning: existing config contains malformed syntax. */
export class MalformedConfigWarning extends Error {
  public readonly filePath: string;
  public readonly section?: string;

  constructor(filePath: string, section?: string, message?: string) {
    super(
      message ??
        `Warning: malformed section in ${filePath}${section ? ` near ${section}` : ''}. Existing content preserved.`
    );
    this.name = 'MalformedConfigWarning';
    this.filePath = filePath;
    this.section = section;
  }
}

/** No SSO start URL could be determined from flags or config. */
export class MissingStartUrlError extends Error {
  constructor(
    message = 'No SSO start URL provided. Use --sso-start-url or configure an sso-session in ~/.aws/config.'
  ) {
    super(message);
    this.name = 'MissingStartUrlError';
  }
}
