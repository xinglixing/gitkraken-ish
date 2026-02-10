/**
 * Preload Script for Electron
 *
 * This script runs in the renderer process before the web page loads.
 * It provides a secure bridge between the renderer and main process.
 */

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Try to load isomorphic-git's node http module
let gitHttp;
try {
  gitHttp = require('isomorphic-git/http/node');
} catch (e) {
  console.warn('Could not load isomorphic-git/http/node:', e.message);
  gitHttp = null;
}

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
// Expose Node modules for isomorphic-git
contextBridge.exposeInMainWorld('nodeModules', {
  fs: fs,
  path: path,
  gitHttp: gitHttp
});

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open a directory selection dialog
   * @returns {Promise<string | null>} Selected directory path or null if canceled
   */
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  /**
   * Open a URL in the default browser
   * @param {string} url - The URL to open
   * @returns {Promise<boolean>} True if successful
   */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  /**
   * Get platform information
   * @returns {Promise<PlatformInfo>} Platform and system information
   */
  getPlatformInfo: () => ipcRenderer.invoke('app:getPlatformInfo'),

  /**
   * Get the user's default shell
   * @returns {Promise<string>} The path to the default shell
   */
  getDefaultShell: () => ipcRenderer.invoke('shell:getDefaultShell'),

  /**
   * Execute a shell command
   * @param {string} command - The command to execute
   * @param {string} cwd - The working directory
   * @param {string} shell - The shell to use (optional)
   * @returns {Promise<{stdout: string, stderr: string, code: number}>} Command result
   */
  executeCommand: (command, cwd, shell) => ipcRenderer.invoke('shell:execute', { command, cwd, shell }),

  /**
   * Send a message to main process (one-way)
   * @param {string} channel - The channel to send on
   * @param {any} data - The data to send
   */
  send: (channel, data) => {
    // Whitelist of allowed channels
    const validChannels = ['app:version', 'repo:refresh', 'git:operation'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  /**
   * Receive messages from main process
   * @param {string} channel - The channel to listen on
   * @param {Function} callback - The callback function
   * @returns {Function} Unsubscribe function
   */
  on: (channel, callback) => {
    // Whitelist of allowed channels
    const validChannels = ['repo:updated', 'git:progress', 'app:error'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },

  /**
   * Receive a single message from main process (one-time listener)
   * @param {string} channel - The channel to listen on
   * @param {Function} callback - The callback function
   */
  once: (channel, callback) => {
    const validChannels = ['app:ready', 'repo:loaded'];
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (_event, ...args) => callback(...args));
    }
  },

  /**
   * Remove all listeners for a channel
   * @param {string} channel - The channel to remove listeners from
   */
  removeAllListeners: (channel) => {
    const validChannels = ['repo:updated', 'git:progress'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});

/**
 * Platform information type definition
 * @typedef {Object} PlatformInfo
 * @property {string} platform - 'win32', 'darwin', or 'linux'
 * @property {string} arch - 'x64', 'arm64', etc.
 * @property {string} version - App version
 * @property {string} electronVersion - Electron version
 * @property {string} chromeVersion - Chrome version
 * @property {string} nodeVersion - Node version
 */

/**
 * TypeScript declarations for the exposed API
 * Add this to your global.d.ts or types file:
 *
 * interface ElectronAPI {
 *   openDirectory: () => Promise<string | null>;
 *   getPlatformInfo: () => Promise<PlatformInfo>;
 *   send: (channel: string, data: any) => void;
 *   on: (channel: string, callback: (...args: any[]) => void) => () => void;
 *   once: (channel: string, callback: (...args: any[]) => void) => void;
 *   removeAllListeners: (channel: string) => void;
 * }
 *
 * declare global {
 *   interface Window {
 *     electronAPI: ElectronAPI;
 *   }
 * }
 */
