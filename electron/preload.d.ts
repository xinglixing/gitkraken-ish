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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
