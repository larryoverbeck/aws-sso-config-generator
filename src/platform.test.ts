import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePlatformPaths, ensureDirectoryExists } from './platform.js';

describe('resolvePlatformPaths', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('resolves paths on macOS/Linux using os.homedir()', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.spyOn(os, 'homedir').mockReturnValue('/home/testuser');
    delete process.env.AWS_CONFIG_FILE;

    const paths = resolvePlatformPaths();

    expect(paths.awsHomeDir).toBe(path.join('/home/testuser', '.aws'));
    expect(paths.configPath).toBe(path.join('/home/testuser', '.aws', 'config'));
    expect(paths.ssoCacheDir).toBe(path.join('/home/testuser', '.aws', 'sso', 'cache'));
  });

  it('resolves paths on Linux using os.homedir()', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.spyOn(os, 'homedir').mockReturnValue('/home/linuxuser');
    delete process.env.AWS_CONFIG_FILE;

    const paths = resolvePlatformPaths();

    expect(paths.awsHomeDir).toBe(path.join('/home/linuxuser', '.aws'));
    expect(paths.configPath).toBe(path.join('/home/linuxuser', '.aws', 'config'));
    expect(paths.ssoCacheDir).toBe(path.join('/home/linuxuser', '.aws', 'sso', 'cache'));
  });

  it('resolves paths on Windows using USERPROFILE env var', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.USERPROFILE = 'C:\\Users\\winuser';
    vi.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\fallback');
    delete process.env.AWS_CONFIG_FILE;

    const paths = resolvePlatformPaths();

    expect(paths.awsHomeDir).toBe(path.join('C:\\Users\\winuser', '.aws'));
    expect(paths.configPath).toBe(path.join('C:\\Users\\winuser', '.aws', 'config'));
    expect(paths.ssoCacheDir).toBe(path.join('C:\\Users\\winuser', '.aws', 'sso', 'cache'));
  });

  it('falls back to os.homedir() on Windows when USERPROFILE is not set', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.USERPROFILE;
    vi.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\fallback');
    delete process.env.AWS_CONFIG_FILE;

    const paths = resolvePlatformPaths();

    expect(paths.awsHomeDir).toBe(path.join('C:\\Users\\fallback', '.aws'));
  });

  it('respects AWS_CONFIG_FILE env var override for configPath', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.spyOn(os, 'homedir').mockReturnValue('/home/testuser');
    process.env.AWS_CONFIG_FILE = '/custom/path/aws-config';

    const paths = resolvePlatformPaths();

    expect(paths.configPath).toBe('/custom/path/aws-config');
    // awsHomeDir and ssoCacheDir should still be derived from homedir
    expect(paths.awsHomeDir).toBe(path.join('/home/testuser', '.aws'));
    expect(paths.ssoCacheDir).toBe(path.join('/home/testuser', '.aws', 'sso', 'cache'));
  });

  it('does not contain hardcoded absolute paths', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.spyOn(os, 'homedir').mockReturnValue('/unique/test/home');
    delete process.env.AWS_CONFIG_FILE;

    const paths = resolvePlatformPaths();

    // All paths should be based on the mocked homedir, not hardcoded
    expect(paths.awsHomeDir).toContain('/unique/test/home');
    expect(paths.configPath).toContain('/unique/test/home');
    expect(paths.ssoCacheDir).toContain('/unique/test/home');
  });
});

describe('ensureDirectoryExists', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fs.mkdirSync with recursive and secure permissions', () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

    ensureDirectoryExists('/some/test/dir');

    expect(mkdirSpy).toHaveBeenCalledWith('/some/test/dir', {
      recursive: true,
      mode: 0o700,
    });
  });

  it('does not throw when directory already exists', () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

    expect(() => ensureDirectoryExists('/existing/dir')).not.toThrow();
  });
});
