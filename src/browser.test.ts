import { describe, it, expect, vi, afterEach } from 'vitest';
import { openBrowser } from './browser.js';

// Mock child_process.spawn
const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref });

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Requirements: 2.2

describe('openBrowser', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
    mockSpawn.mockClear();
    mockUnref.mockClear();
    mockSpawn.mockReturnValue({ unref: mockUnref });
  });

  it('spawns "open" on macOS (darwin)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const result = openBrowser('http://localhost:3000');

    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith('open', ['http://localhost:3000'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(mockUnref).toHaveBeenCalled();
  });

  it('spawns "xdg-open" on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const result = openBrowser('http://127.0.0.1:8080');

    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith('xdg-open', ['http://127.0.0.1:8080'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(mockUnref).toHaveBeenCalled();
  });

  it('spawns "cmd /c start" on Windows (win32)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const result = openBrowser('http://localhost:5000');

    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith('cmd', ['/c', 'start', '""', 'http://localhost:5000'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(mockUnref).toHaveBeenCalled();
  });

  it('returns false when spawn throws an error', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockSpawn.mockImplementation(() => {
      throw new Error('command not found');
    });

    const result = openBrowser('http://localhost:3000');

    expect(result).toBe(false);
  });

  it('defaults to xdg-open for unknown platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });

    const result = openBrowser('http://localhost:9000');

    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith('xdg-open', ['http://localhost:9000'], {
      detached: true,
      stdio: 'ignore',
    });
  });
});
