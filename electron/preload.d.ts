/**
 * Global type declarations for Electron preload script
 */

interface PlatformInfo {
  platform: 'win32' | 'darwin' | 'linux';
  arch: string;
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

interface ElectronAPI {
  /**
   * Open a directory selection dialog
   */
  openDirectory: () => Promise<string | null>;

  /**
   * Open a URL in the default browser
   */
  openExternal: (url: string) => Promise<boolean>;

  /**
   * Get platform and system information
   */
  getPlatformInfo: () => Promise<PlatformInfo>;

  /**
   * Send a message to main process (one-way)
   */
  send: (channel: string, data: any) => void;

  /**
   * Receive messages from main process
   * Returns an unsubscribe function
   */
  on: (channel: string, callback: (...args: any[]) => void) => () => void;

  /**
   * Receive a single message from main process (one-time listener)
   */
  once: (channel: string, callback: (...args: any[]) => void) => void;

  /**
   * Remove all listeners for a channel
   */
  removeAllListeners: (channel: string) => void;

  // Auto-Updater API

  /**
   * Check for updates
   */
  checkForUpdates: () => Promise<{ success: boolean; version?: string; error?: string }>;

  /**
   * Download available update
   */
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;

  /**
   * Install downloaded update and restart app
   */
  installUpdate: () => Promise<void>;

  /**
   * Get current app version
   */
  getAppVersion: () => Promise<string>;

  /**
   * Listen for update status events
   * Returns an unsubscribe function
   */
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
