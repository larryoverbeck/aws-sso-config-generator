import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderWebUI } from './web-ui.js';
import { generateConfigBlocks, writeConfig } from './config-writer.js';
import { parseExistingConfig } from './config-parser.js';
import { ConfigWriteError } from './types.js';
import type { GeneratedProfile, ExistingConfig } from './types.js';

export interface WebServerOptions {
  profiles: GeneratedProfile[];
  existingConfig: ExistingConfig;
  configPath: string;
  ssoStartUrl: string;
  ssoRegion: string;
  sessionName: string;
  defaultRegion: string;
  outputFormat: string;
}

export interface WebServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Read and parse the full JSON body from an incoming request. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Send a JSON response. */
function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Start the web server and return a handle for lifecycle management. */
export function startWebServer(options: WebServerOptions): Promise<WebServerHandle> {
  let { existingConfig } = options;
  const { profiles, configPath, ssoStartUrl, ssoRegion, sessionName, defaultRegion, outputFormat } = options;

  const html = renderWebUI();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';
    const pathname = url.pathname;

    try {
      // GET / — serve inline HTML
      if (method === 'GET' && pathname === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
        });
        res.end(html);
        return;
      }

      // GET /api/data — return discovery data as JSON
      if (method === 'GET' && pathname === '/api/data') {
        sendJson(res, 200, {
          profiles,
          existingConfig: {
            raw: existingConfig.raw,
            profileNames: Array.from(existingConfig.profileNames),
          },
          sso: {
            startUrl: ssoStartUrl,
            region: ssoRegion,
            sessionName,
            defaultRegion,
            outputFormat,
          },
        });
        return;
      }

      // POST /api/save — save selected profiles to config
      if (method === 'POST' && pathname === '/api/save') {
        let body: string;
        let parsed: unknown;
        try {
          body = await readBody(req);
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { success: false, error: 'Invalid request' });
          return;
        }

        const payload = parsed as { selections?: unknown };
        if (!payload || !Array.isArray(payload.selections) || payload.selections.length === 0) {
          sendJson(res, 400, { success: false, error: 'Invalid request' });
          return;
        }

        const selections = payload.selections as Array<{
          originalProfileName?: string;
          customProfileName?: string;
          accountId?: string;
          accountName?: string;
          roleName?: string;
          isProduction?: boolean;
        }>;

        // Build GeneratedProfile[] from selections using customProfileName
        const profilesToWrite: GeneratedProfile[] = selections.map((sel) => ({
          profileName: sel.customProfileName ?? sel.originalProfileName ?? '',
          accountId: sel.accountId ?? '',
          accountName: sel.accountName ?? '',
          roleName: sel.roleName ?? '',
          isProduction: sel.isProduction ?? false,
        }));

        try {
          const { content, written } = generateConfigBlocks(profilesToWrite, existingConfig, {
            ssoStartUrl,
            ssoRegion,
            sessionName,
            defaultRegion,
            outputFormat,
            force: true,
          });

          const { backupPath } = writeConfig(content, configPath, true);

          // Re-read config to update stored state
          existingConfig = parseExistingConfig(configPath);

          sendJson(res, 200, {
            success: true,
            writtenCount: written.length,
            backupPath: backupPath ?? null,
          });
        } catch (err: unknown) {
          if (err instanceof ConfigWriteError) {
            sendJson(res, 500, { success: false, error: err.message });
          } else {
            sendJson(res, 500, { success: false, error: (err as Error).message });
          }
        }
        return;
      }

      // GET /api/backups — list backup files
      if (method === 'GET' && pathname === '/api/backups') {
        const configDir = path.dirname(configPath);
        const configBase = path.basename(configPath);
        let files: string[] = [];
        try {
          files = fs.readdirSync(configDir);
        } catch {
          // Directory unreadable — return empty list
        }

        const backups = files
          .filter((f) => f.startsWith(configBase + '.bak.'))
          .map((f) => {
            const fullPath = path.join(configDir, f);
            let stat: fs.Stats | undefined;
            try {
              stat = fs.statSync(fullPath);
            } catch {
              // skip unreadable files
            }
            // Extract timestamp from filename: config.bak.20250414T190700000Z
            const tsRaw = f.slice((configBase + '.bak.').length);
            // Convert back to ISO: 20250414T190700000Z → 2025-04-14T19:07:00.000Z
            const isoTs = tsRaw.replace(
              /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/,
              '$1-$2-$3T$4:$5:$6.$7Z',
            );
            return {
              filename: f,
              path: fullPath,
              timestamp: isoTs,
              size: stat?.size ?? 0,
            };
          })
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        sendJson(res, 200, { backups });
        return;
      }

      // GET /api/backup-preview — preview a backup file's contents
      if (method === 'GET' && pathname === '/api/backup-preview') {
        const backupPath = url.searchParams.get('path');
        if (!backupPath) {
          sendJson(res, 400, { error: 'Missing path parameter' });
          return;
        }

        // Security: validate the backup path is within the config directory
        const configDir = path.dirname(configPath);
        const resolved = path.resolve(backupPath);
        if (!resolved.startsWith(path.resolve(configDir))) {
          sendJson(res, 403, { error: 'Access denied' });
          return;
        }

        try {
          const content = fs.readFileSync(resolved, 'utf-8');
          sendJson(res, 200, { content });
        } catch {
          sendJson(res, 500, { error: 'Cannot read backup file' });
        }
        return;
      }

      // POST /api/restore — restore a backup file
      if (method === 'POST' && pathname === '/api/restore') {
        let body: string;
        let parsed: unknown;
        try {
          body = await readBody(req);
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { success: false, error: 'Invalid request' });
          return;
        }

        const payload = parsed as { backupPath?: string };
        if (!payload || typeof payload.backupPath !== 'string' || !payload.backupPath) {
          sendJson(res, 400, { success: false, error: 'Invalid request' });
          return;
        }

        // Security: validate the backup path is within the config directory
        const configDir = path.dirname(configPath);
        const resolved = path.resolve(payload.backupPath);
        if (!resolved.startsWith(path.resolve(configDir))) {
          sendJson(res, 403, { success: false, error: 'Access denied' });
          return;
        }

        try {
          // Read backup contents
          const backupContent = fs.readFileSync(resolved, 'utf-8');

          // Create a new backup of the current config before restoring
          let newBackupPath: string | undefined;
          if (fs.existsSync(configPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '');
            newBackupPath = `${configPath}.bak.${timestamp}`;
            fs.copyFileSync(configPath, newBackupPath);
          }

          // Replace config with backup contents
          fs.writeFileSync(configPath, backupContent, 'utf-8');

          // Re-read config to update stored state
          existingConfig = parseExistingConfig(configPath);

          sendJson(res, 200, {
            success: true,
            newBackupPath: newBackupPath ?? null,
            restoredFrom: resolved,
          });
        } catch (err: unknown) {
          sendJson(res, 500, {
            success: false,
            error: `Cannot restore backup: ${(err as Error).message}`,
          });
        }
        return;
      }

      // POST /api/delete-profile — remove a profile from config
      if (method === 'POST' && pathname === '/api/delete-profile') {
        let body: string;
        let parsed: unknown;
        try {
          body = await readBody(req);
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { success: false, error: 'Invalid request' });
          return;
        }

        const payload = parsed as { profileName?: string };
        if (!payload || typeof payload.profileName !== 'string' || !payload.profileName) {
          sendJson(res, 400, { success: false, error: 'Missing profileName' });
          return;
        }

        const profileToDelete = payload.profileName;

        try {
          // Read current config
          const raw = fs.readFileSync(configPath, 'utf-8');

          // Create backup before modifying
          const timestamp = new Date().toISOString().replace(/[:.]/g, '');
          const backupFilePath = `${configPath}.bak.${timestamp}`;
          fs.copyFileSync(configPath, backupFilePath);

          // Remove the [profile <name>] section by parsing lines
          const lines = raw.split('\n');
          const result: string[] = [];
          let skipping = false;
          const sectionHeader = `[profile ${profileToDelete}]`;

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === sectionHeader) {
              skipping = true;
              // Also remove a preceding blank line if the last result line is empty
              if (result.length > 0 && result[result.length - 1].trim() === '') {
                result.pop();
              }
              continue;
            }
            if (skipping && trimmed.startsWith('[')) {
              skipping = false;
            }
            if (!skipping) {
              result.push(line);
            }
          }

          // Write updated config
          fs.writeFileSync(configPath, result.join('\n'), 'utf-8');

          // Re-read config to update stored state
          existingConfig = parseExistingConfig(configPath);

          sendJson(res, 200, {
            success: true,
            deletedProfile: profileToDelete,
            backupPath: backupFilePath,
          });
        } catch (err: unknown) {
          sendJson(res, 500, {
            success: false,
            error: `Cannot delete profile: ${(err as Error).message}`,
          });
        }
        return;
      }

      // POST /api/shutdown — graceful shutdown
      if (method === 'POST' && pathname === '/api/shutdown') {
        sendJson(res, 200, { ok: true });
        // Close server after response is sent
        setImmediate(() => {
          server.close();
        });
        return;
      }

      // All other routes → 404
      sendJson(res, 404, { error: 'Not found' });
    } catch (err: unknown) {
      // Unexpected error
      console.error('Unexpected server error:', err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' });
      }
    }
  });

  return new Promise<WebServerHandle>((resolve, reject) => {
    server.on('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }

      const port = addr.port;
      const url = `http://127.0.0.1:${port}`;

      resolve({
        url,
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) rejectClose(err);
              else resolveClose();
            });
          }),
      });
    });
  });
}
