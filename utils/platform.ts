/**
 * Platform Detection Utility
 * Centralized cross-platform detection and helpers
 */

export enum Platform {
  WINDOWS = 'windows',
  MACOS = 'macos',
  LINUX = 'linux',
  UNKNOWN = 'unknown'
}

export enum Environment {
  ELECTRON = 'electron',
  BROWSER = 'browser',
  UNKNOWN = 'unknown'
}

/**
 * Detect the current platform
 */
export function getPlatform(): Platform {
  // Check if we're in a Node/Electron environment
  if (typeof process !== 'undefined' && process.platform) {
    switch (process.platform) {
      case 'win32':
        return Platform.WINDOWS;
      case 'darwin':
        return Platform.MACOS;
      case 'linux':
        return Platform.LINUX;
      default:
        return Platform.UNKNOWN;
    }
  }

  // Fallback: check navigator.userAgent in browser
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return Platform.WINDOWS;
    if (ua.includes('mac')) return Platform.MACOS;
    if (ua.includes('linux')) return Platform.LINUX;
  }

  return Platform.UNKNOWN;
}

/**
 * Detect if running in Electron
 */
export function getEnvironment(): Environment {
  // Check for Electron via process.versions.electron (nodeIntegration mode)
  if (typeof process !== 'undefined' && (process as any).versions?.electron) {
    return Environment.ELECTRON;
  }

  // Check for window.require which is available with nodeIntegration
  if (typeof window !== 'undefined' && (window as any).require) {
    return Environment.ELECTRON;
  }

  // Assume browser if not Electron
  if (typeof window !== 'undefined') {
    return Environment.BROWSER;
  }

  return Environment.UNKNOWN;
}

/**
 * Check if running in Electron
 */
export function isElectron(): boolean {
  return getEnvironment() === Environment.ELECTRON;
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return getEnvironment() === Environment.BROWSER;
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return getPlatform() === Platform.WINDOWS;
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return getPlatform() === Platform.MACOS;
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return getPlatform() === Platform.LINUX;
}

/**
 * Get platform-specific keyboard modifier key
 */
export function getModKey(): string {
  return isMacOS() ? 'Cmd' : 'Ctrl';
}

/**
 * Get platform-specific keyboard shortcuts
 */
export const SHORTCUTS = {
  // Command Palette
  commandPalette: isMacOS() ? 'Cmd+Shift+P' : 'Ctrl+Shift+P',
  // Save
  save: isMacOS() ? 'Cmd+S' : 'Ctrl+S',
  // Undo
  undo: isMacOS() ? 'Cmd+Z' : 'Ctrl+Z',
  // Redo
  redo: isMacOS() ? 'Cmd+Shift+Z' : 'Ctrl+Y',
  // Select All
  selectAll: isMacOS() ? 'Cmd+A' : 'Ctrl+A',
  // Copy
  copy: isMacOS() ? 'Cmd+C' : 'Ctrl+C',
  // Paste
  paste: isMacOS() ? 'Cmd+V' : 'Ctrl+V',
  // Cut
  cut: isMacOS() ? 'Cmd+X' : 'Ctrl+X',
  // Find
  find: isMacOS() ? 'Cmd+F' : 'Ctrl+F',
  // Force Quit (for debugging)
  forceQuit: isMacOS() ? 'Cmd+Q' : 'Alt+F4',
} as const;

/**
 * Get platform-specific Electron title bar style
 */
export function getTitleBarStyle(): 'hiddenInset' | 'default' | 'hidden' | 'customButtonsOnHover' {
  if (isMacOS()) {
    return 'hiddenInset'; // Mac-style seamless header
  }
  return 'default'; // Windows/Linux use default
}

/**
 * Get default path for file dialogs
 */
export function getDefaultPath(): string {
  if (typeof process === 'undefined') return '/';

  if (isWindows()) {
    // On Windows, default to WSL root if available, otherwise home
    return '\\\\wsl$';
  }

  // macOS and Linux
  return process.env.HOME || process.env.USERPROFILE || '/';
}

/**
 * Get path separator for the current platform
 */
export function getPathSeparator(): string {
  return isWindows() ? '\\' : '/';
}

/**
 * Normalize file path for the current platform
 */
export function normalizePath(path: string): string {
  if (!path) return '';

  if (isWindows()) {
    // Replace forward slashes with backslashes on Windows
    return path.replace(/\//g, '\\');
  }

  // Replace backslashes with forward slashes on Unix-like systems
  return path.replace(/\\/g, '/');
}

/**
 * Get Git-specific configuration for the platform
 */
export function getGitConfig(): {
  autocrlf: boolean | 'input';
  symlinks: boolean;
  fileMode: boolean;
} {
  if (isWindows()) {
    return {
      autocrlf: true, // Convert CRLF to LF on commit, LF to CRLF on checkout
      symlinks: false, // Windows has limited symlink support
      fileMode: false, // Windows doesn't support file mode bits
    };
  }

  // macOS and Linux
  return {
    autocrlf: 'input', // Convert CRLF to LF on commit only
    symlinks: true, // Full symlink support
    fileMode: true, // Support file mode bits
  };
}

/**
 * Get platform info object for React components
 */
export function usePlatform() {
  return {
    platform: getPlatform(),
    environment: getEnvironment(),
    isElectron: isElectron(),
    isBrowser: isBrowser(),
    isWindows: isWindows(),
    isMacOS: isMacOS(),
    isLinux: isLinux(),
    modKey: getModKey(),
    shortcuts: SHORTCUTS,
  };
}
