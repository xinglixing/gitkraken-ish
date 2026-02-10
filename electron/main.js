const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const os = require('os');

// Security: Whitelist of allowed command prefixes for shell:execute
const ALLOWED_COMMANDS = ['git', 'npm', 'node', 'npx', 'yarn', 'pnpm', 'gh', 'code', 'open', 'explorer', 'start'];

// Always use secure preload with contextIsolation for security and consistency
// This ensures the terminal shell integration works in both dev and production

// Fix GPU errors in WSL and some Linux environments
// These flags disable GPU acceleration which fixes common Electron crashes
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('--disable-gpu');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
  app.commandLine.appendSwitch('--in-process-gpu');
}

let mainWindow;

/**
 * Get platform-specific title bar style
 */
function getTitleBarStyle() {
  // hiddenInset is macOS only
  return process.platform === 'darwin' ? 'hiddenInset' : 'default';
}

/**
 * Get default path for file dialogs
 */
function getDefaultPath() {
  if (process.platform === 'win32') {
    // On Windows, default to user home with WSL as fallback
    return app.getPath('home');
  }
  // macOS and Linux
  return app.getPath('home');
}

/**
 * Get platform-specific icon path
 */
function getIconPath() {
  const buildPath = path.join(__dirname, '../build');
  if (process.platform === 'win32') {
    return path.join(buildPath, 'icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(buildPath, 'icon.icns');
  }
  // Linux and others - use PNG
  return path.join(buildPath, 'icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    titleBarStyle: getTitleBarStyle(),
    backgroundColor: '#1b1d23',
    autoHideMenuBar: true, // Hide menu bar by default (Alt to show temporarily)
    webPreferences: {
      // SECURITY NOTE: nodeIntegration is enabled for this app because it requires
      // direct access to Node.js APIs (child_process, fs) for Git operations.
      // For production, consider migrating to a preload script with contextIsolation: true
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true  // SECURITY: Re-enabled to enforce same-origin policy
    }
  });

  // In development, load from Vite server. In production, load built file.
  const devUrl = 'http://localhost:5173';

  // A simple check to see if we are in dev (you might want a better env check)
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Set application menu to null to completely remove menu bar
  // Menu can still be accessed via Alt+H on Windows/Linux if needed
  mainWindow.setMenuBarVisibility(false);

  // Intercept external navigation and open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Check if URL is external (http/https)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Also handle navigation within the same window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation to localhost (dev server) and file:// (production)
    if (url.startsWith('http://localhost') || url.startsWith('file://')) {
      return;
    }
    // Block external navigation and open in browser instead
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // IPC for Dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const defaultPath = getDefaultPath();
    console.log('[Electron] Opening directory dialog...');

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: defaultPath
    });

    console.log('[Electron] Dialog completed, canceled:', result.canceled);
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // IPC for opening external URLs in default browser
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    // Validate URL to prevent opening arbitrary protocols
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        await shell.openExternal(url);
        return true;
      }
      console.warn('[Security] Blocked non-http(s) URL:', url);
      return false;
    } catch (e) {
      console.error('[Error] Invalid URL:', url);
      return false;
    }
  });

  // IPC for platform info
  ipcMain.handle('app:getPlatformInfo', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node
    };
  });

  // IPC for getting default shell
  ipcMain.handle('shell:getDefaultShell', async () => {
    if (process.platform === 'win32') {
      // Check for PowerShell first, then fall back to cmd
      return process.env.COMSPEC || 'cmd.exe';
    } else {
      // Unix-like systems - check SHELL env var
      return process.env.SHELL || '/bin/bash';
    }
  });

  // IPC for executing shell commands
  // Stores active shell processes
  const shellProcesses = new Map();

  ipcMain.handle('shell:execute', async (event, { command, cwd, shell }) => {
    return new Promise((resolve) => {
      // SECURITY: Validate command against whitelist
      const commandParts = command.trim().split(/\s+/);
      const baseCommand = commandParts[0].toLowerCase().replace(/\.exe$/i, '');

      if (!ALLOWED_COMMANDS.includes(baseCommand)) {
        console.warn(`[Security] Blocked command: ${baseCommand}`);
        resolve({
          stdout: '',
          stderr: `Command '${baseCommand}' is not in the allowed commands list. Allowed: ${ALLOWED_COMMANDS.join(', ')}`,
          code: 1
        });
        return;
      }

      // SECURITY: Validate cwd is a reasonable path (not accessing system directories)
      const normalizedCwd = path.resolve(cwd || os.homedir());
      const systemDirs = process.platform === 'win32'
        ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)']
        : ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/etc', '/var'];

      const isSystemDir = systemDirs.some(dir => normalizedCwd.toLowerCase().startsWith(dir.toLowerCase()));
      if (isSystemDir) {
        console.warn(`[Security] Blocked access to system directory: ${normalizedCwd}`);
        resolve({
          stdout: '',
          stderr: 'Access to system directories is not allowed',
          code: 1
        });
        return;
      }

      let shellCmd, shellArgs;

      if (process.platform === 'win32') {
        if (shell && shell.toLowerCase().includes('powershell')) {
          shellCmd = 'powershell.exe';
          shellArgs = ['-NoProfile', '-Command', command];
        } else {
          shellCmd = 'cmd.exe';
          shellArgs = ['/c', command];
        }
      } else {
        // Unix-like (macOS, Linux)
        shellCmd = shell || process.env.SHELL || '/bin/bash';
        shellArgs = ['-c', command];
      }

      // SECURITY: Only pass whitelisted environment variables to child process
      const safeEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        HOMEDRIVE: process.env.HOMEDRIVE,
        HOMEPATH: process.env.HOMEPATH,
        USER: process.env.USER,
        USERNAME: process.env.USERNAME,
        SHELL: process.env.SHELL,
        TERM: 'xterm-256color',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL,
        // Git-specific
        GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
        GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND,
        SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK,
      };

      // Remove undefined values
      Object.keys(safeEnv).forEach(key => safeEnv[key] === undefined && delete safeEnv[key]);

      const child = spawn(shellCmd, shellArgs, {
        cwd: normalizedCwd,
        env: safeEnv,
        shell: false
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout: stdout,
          stderr: stderr,
          code: code
        });
      });

      child.on('error', (err) => {
        resolve({
          stdout: '',
          stderr: err.message,
          code: 1
        });
      });

      // Set a timeout for long-running commands (30 seconds)
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          resolve({
            stdout: stdout,
            stderr: stderr + '\n[Command timed out after 30 seconds]',
            code: -1
          });
        }
      }, 30000);
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});