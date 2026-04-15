import { spawn } from 'node:child_process';

/**
 * Open a URL in the user's default browser.
 * Returns true if the command was spawned successfully, false otherwise.
 */
export function openBrowser(url: string): boolean {
  try {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      command = 'open';
      args = [url];
    } else if (platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '""', url];
    } else {
      // Linux and other Unix-like systems
      command = 'xdg-open';
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();
    return true;
  } catch {
    return false;
  }
}
