# GitKraken-ish

A powerful, cross-platform Git GUI with AI-powered commit messages. Built with React, Electron, and TypeScript.

## Features

**Git Operations**
- Visual commit graph with branch visualization
- Commit, push, pull, fetch with progress tracking
- Branch management (create, delete, rename, checkout)
- Merge, rebase, and cherry-pick support
- Interactive rebase with drag-and-drop
- Stash management
- Conflict resolution with built-in merge tool

**AI Integration**
- Generate commit messages automatically
- Supports Gemini, OpenAI, Claude, and DeepSeek
- Customizable commit styles (conventional, emoji, concise, detailed)

**GitHub Integration**
- Pull request management
- Issue tracking
- GitHub Actions workflow status
- Create PRs directly from the app

**Advanced Features**
- Multi-profile support for work/personal accounts
- Command palette (Ctrl/Cmd + P)
- File history and blame view
- Reflog viewer
- Submodule and worktree management
- Gitflow workflow support
- Undo/redo for git operations

## Installation

### Download

Download the latest release for your platform:
- **Windows**: `.exe` installer
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage`, `.deb`, or `.rpm`

### Build from Source

```bash
# Clone the repository
git clone https://github.com/xinglixing/gitkraken-ish.git
cd gitkraken-ish

# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run electron:build
```

## Quick Start

1. Launch the app
2. Click "Open Repository" and select a Git repository
3. View your commit history in the graph
4. Stage changes and commit with AI-generated messages

### AI Setup (Optional)

1. Open Settings (gear icon)
2. Select your AI provider
3. Enter your API key
4. Click "Save"

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Command Palette | `Ctrl+P` | `Cmd+P` |
| Commit | `Ctrl+Enter` | `Cmd+Enter` |
| Push | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| Pull | `Ctrl+Shift+L` | `Cmd+Shift+L` |
| New Branch | `Ctrl+B` | `Cmd+B` |
| Stash | `Ctrl+Shift+S` | `Cmd+Shift+S` |

## Requirements

- Windows 10+, macOS 10.15+, or Linux
- Git installed and available in PATH
- 4GB RAM recommended

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Desktop**: Electron
- **Git**: isomorphic-git + native Git CLI
- **AI**: Gemini, OpenAI, Claude, DeepSeek APIs

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by [GitKraken](https://www.gitkraken.com/)
- Built with [isomorphic-git](https://isomorphic-git.org/)
- Icons by [Lucide](https://lucide.dev/)
