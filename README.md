# GitKraken-ish Desktop - Cross-Platform Git GUI

A GitKraken-inspired desktop application built with React, Electron, and isomorphic-git. Features AI-powered commit messages, interactive commit graphs, and support for both local and remote repositories.

## 🎯 Features

- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Dual Mode**: Browser-based (File System Access API) and Electron (system path access)
- **Interactive Commit Graph**: Visualize branches, merges, and commit history
- **AI-Powered**: Generate commit messages with Gemini, OpenAI, Claude, or DeepSeek
- **GitHub Integration**: View issues, PRs, and Actions
- **Advanced Git Operations**: Cherry-pick, rebase, merge, stash, and more

## 🖥️ Platform Support

### Windows
- ✅ Full Electron support with native file dialogs
- ✅ WSL integration for accessing Linux repositories
- ✅ Proper CRLF line ending handling
- ⚠️ Browser mode limited (requires HTTPS or localhost)

### macOS
- ✅ Native title bar integration (hiddenInset style)
- ✅ Full feature support in both modes
- ✅ Code signing ready (manual setup required)
- ✅ Optimize for Apple Silicon

### Linux
- ✅ AppImage/Flatpak/Snap package support
- ✅ Full Git and filesystem support
- ✅ Theme detection (follows system GTK/Qt theme)
- ⚠️ Some desktop environments may have title bar quirks

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Git** (for local repositories)
- **Electron** (included as dev dependency)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd gitkraken-ish-desktop
```

2. Install dependencies:
```bash
npm install
```

3. Set up AI provider (optional but recommended):
```bash
# Create .env.local file
echo "GEMINI_API_KEY=your_api_key_here" > .env.local
```

### Development

**⚡ Quick Start (Recommended):**
```bash
npm run electron:dev
```
This launches the full-featured desktop app with all Git capabilities.

**🌐 Browser Mode (Limited Features):**
```bash
npm run dev
```
For quick viewing or when Electron is unavailable.

**📖 See [MODES.md](MODES.md) for detailed comparison of features in each mode.**

### Building

Build for production:
```bash
npm run build
```

Build platform-specific installers:
```bash
npm run electron:build
```

This will create:
- **Windows**: `.exe` installer (NSIS)
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` package

## ⌨️ Keyboard Shortcuts

Keyboard shortcuts are platform-aware:

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Command Palette | `Ctrl+P` | `Cmd+P` |
| Save | `Ctrl+S` | `Cmd+S` |
| Undo | `Ctrl+Z` | `Cmd+Z` |
| Redo | `Ctrl+Y` | `Cmd+Shift+Z` |
| Select All | `Ctrl+A` | `Cmd+A` |
| Copy | `Ctrl+C` | `Cmd+C` |
| Paste | `Ctrl+V` | `Cmd+V` |
| Cut | `Ctrl+X` | `Cmd+X` |
| Find | `Ctrl+F` | `Cmd+F` |

## 🔧 Configuration

### Git Configuration

The app automatically configures Git settings based on your platform:

**Windows:**
- `core.autocrlf = true` (CRLF ↔ LF conversion)
- `core.symlinks = false` (limited symlink support)
- `core.fileMode = false` (no file mode bits)

**macOS & Linux:**
- `core.autocrlf = input` (CRLF → LF on commit only)
- `core.symlinks = true` (full symlink support)
- `core.fileMode = true` (file mode bits preserved)

### AI Provider Setup

Configure your preferred AI provider in Settings:

1. Click the profile icon in top-right
2. Select "Settings"
3. Choose your provider (Gemini, OpenAI, Claude, DeepSeek)
4. Enter your API key
5. Optionally customize model and commit style

## 🐛 Troubleshooting

**Having issues? Check the comprehensive [Troubleshooting Guide](TROUBLESHOOTING.md)**

### ⚡ Most Common Issue: "Branch creation requires full filesystem access"

**Problem**: You're in **Browser Mode** which has limited Git features.

**Quick Fix**:
1. Stop browser mode: Press `Ctrl+C` in terminal
2. Start Electron mode:
   ```bash
   npm run electron:dev
   ```
3. The toolbar will now show **"Electron"** in blue (instead of "Browser" in yellow)
4. All Git operations will now work!

**📖 Learn More**: See [MODES.md](MODES.md) for feature comparison and [TROUBLESHOOTING.md](TROUBLESHOOTING.md#branch-creation-issues) for detailed solutions.

### Other Common Issues

**GPU errors (Linux/WSL)?**
- These are cosmetic errors, the app still works
- See [Troubleshooting Guide](TROUBLESHOOTING.md#gpu-errors-linuxwsl) for fixes

**Permission denied?**
- Re-grant file permissions to repository
- See [Troubleshooting Guide](TROUBLESHOOTING.md#permission-errors)

### Windows

**Issue**: Can't access local repositories in browser mode
- **Solution**: Use Electron mode or run on localhost/HTTPS

**Issue**: WSL path not accessible
- **Solution**: Use `\\wsl$` path or open repository from within WSL

**Issue**: Line ending conflicts
- **Solution**: The app auto-configures `core.autocrlf`, but you can override with:
```bash
git config --global core.autocrlf true
```

### macOS

**Issue**: "App can't be opened because it is from an unidentified developer"
- **Solution**: Right-click app → Open, or run:
```bash
xattr -cr /path/to/app.app
```

**Issue**: Title bar looks wrong on older macOS versions
- **Solution**: The app automatically falls back to default title bar

### Linux

**Issue**: Scrollbars look wrong
- **Solution**: The app includes Firefox scrollbar styling. If still broken, install GTK themes.

**Issue**: App won't start
- **Solution**: Check dependencies:
```bash
# Ubuntu/Debian
sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libappindicator3-1 libsecret-1-0

# Fedora
sudo dnf install gtk3 libnotify nss libXScrnSaver libXtst xdg-utils at-spi2-atk libappindicator-gtk3 libsecret
```

### Browser Mode Limitations

- File handles don't persist across reloads (security restriction)
- No system path access (limited to user-selected directories)
- Some Git operations may fail due to sandbox restrictions

## 🔐 Security

**Important**: This is a development tool. For production use:

1. Enable `contextIsolation` in Electron
2. Create a preload script for secure IPC
3. Enable `webSecurity` for CSP
4. Use code signing for macOS/Windows

See `electron/main.js` for TODOs on security hardening.

## 📝 Development Notes

### Project Structure

```
gitkraken-ish-desktop/
├── components/          # React components
│   ├── Sidebar.tsx     # Repository sidebar
│   ├── CommitGraph.tsx # Commit visualization
│   └── ...
├── services/           # Business logic
│   ├── localGitService.ts  # Git operations
│   ├── githubService.ts   # GitHub API
│   └── aiService.ts       # AI providers
├── utils/              # Utilities
│   ├── platform.ts    # Platform detection
│   └── shortcuts.ts   # Keyboard shortcuts
├── electron/           # Electron main process
└── types.ts           # TypeScript definitions
```

### Adding Platform-Specific Code

Use the platform utilities:

```typescript
import { isWindows, isMacOS, getPlatform } from './utils/platform';

if (isWindows()) {
  // Windows-specific code
}

if (isMacOS()) {
  // macOS-specific code
}

switch (getPlatform()) {
  case 'windows':
    // ...
}
```

## 🤝 Contributing

Contributions welcome! Please ensure:

1. Code works on all three platforms (Windows, macOS, Linux)
2. Platform-specific code is properly gated
3. Keyboard shortcuts respect platform conventions
4. File paths use `path.join()` or platform utilities

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Inspired by [GitKraken](https://www.gitkraken.com/)
- Built with [isomorphic-git](https://isomorphic-git.org/)
- UI framework: [React](https://reactjs.org/) + [Tailwind CSS](https://tailwindcss.com/)
- Desktop framework: [Electron](https://www.electronjs.org/)

---

**Note**: This is a work-in-progress. Some features may be incomplete or buggy. Please report issues!
