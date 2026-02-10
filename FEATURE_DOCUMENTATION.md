# GitKraken Clone - Complete Feature Documentation

## Table of Contents
1. [Core Features](#core-features)
2. [User Interface](#user-interface)
3. [Git Operations](#git-operations)
4. [Advanced Features](#advanced-features)
5. [Keyboard Shortcuts](#keyboard-shortcuts)
6. [Context Menus](#context-menus)

---

## Core Features

### 1. Repository Management
- **Local Repositories**: Connect to any local Git repository
- **GitHub Integration**: Connect to GitHub repositories with API token
- **Workspace Management**: Organize repositories into workspaces
- **Branch Visualization**: See all branches (local and remote) in one unified list

### 2. Commit Graph
- **Interactive Graph**: Visual representation of commit history
- **Author Circles**: Color-coded circles showing commit authors (indigo/purple theme)
- **Multi-Select**: Select multiple commits using Ctrl/Cmd + click
- **Drag & Drop**: Cherry-pick commits by dragging them onto other commits

### 3. Branch Management
- **Unified Branch List**: Local and remote branches shown together
- **Active Branch Indicator**: Green dot shows currently checked-out branch
- **Branch Creation**: Create new branches from any commit
- **Branch Deletion**: Right-click to delete branches (protected for active/default branches)
- **Branch Switching**: Click any branch to check it out

---

## User Interface

### Toolbar Components

#### Left Side (Navigation)
- **Repos Button**: Return to workspace selection
- **Pull Button**: Pull changes from remote
- **Push Button**: Push changes to remote
- **Branch Button**: Create new branch
- **Gitflow Button**: Initialize Gitflow branching (hidden when develop branch exists)
- **Branch Switcher**: Quick access to branch selection dropdown
- **Create PR Button**: Create pull request (GitHub repos)

#### Right Side (User)
- **Undo Button**: Appears after Git operations to revert changes
- **User Profile**: Shows current profile with avatar and username

### Sidebar Sections

#### Branches
- Combines LOCAL and REMOTE branches into single section
- **Local Branches**: Shown with branch icon (🌿)
- **Remote Branches**: Shown with globe icon (🌐) and dimmed
- **Active Branch**: Marked with green dot indicator
- **Default Branch**: Highlighted with accent color
- **Drag & Drop**: Drag commits onto branches to cherry-pick

#### GitHub Actions (Web/Cloud Mode Only)
- Shows recent workflow runs
- Status indicators: ✓ Success, ✗ Failure, ⟳ In Progress
- Auto-refreshes on changes

#### Pull Requests (Web/Cloud Mode Only)
- Shows open pull requests
- Color-coded by status (open/merged)
- Shows PR number and author

#### Issues (Web/Cloud Mode Only)
- Shows open issues
- Displays issue number and author

#### Tags
- View repository tags
- Organized by version

---

## Git Operations

### Cherry-Pick

#### Method 1: Right-Click Context Menu
1. Right-click on any commit(s)
2. Choose cherry-pick option:
   - **Cherry-pick to HEAD**: Apply commits to current branch
   - **Cherry-pick to branch**: Select target branch from submenu
3. Confirm in dialog
4. **Undo Available**: Click undo button in toolbar to revert

#### Method 2: Drag & Drop
1. Select commit(s) with Ctrl/Cmd + click
2. Drag to target commit
3. Drop on the **center** of the target (cherry-pick zone)
4. Confirm in dialog
5. **Undo Available**: Click undo button in toolbar to revert

**Rules**:
- Cannot cherry-pick root commits
- Cannot cherry-pick commits that are ancestors of target
- Reordering via drag-drop is disabled (safety feature)

### Commit Staging

#### Stage Files
- **Stage Individual**: Click + button next to file
- **Stage All**: Click "Stage All" button in Unstaged section
- Files move from "Unstaged Files" to "Staged Files"

#### Unstage Files
- **Unstage Individual**: Click - button next to staged file
- **Unstage All**: Click "Unstage All" button in Staged section
- Files move from "Staged Files" to "Unstaged Files"

#### Discard Changes
- Click trash icon next to any file to discard changes
- **Warning**: This cannot be undone

#### Create Commit
1. Stage desired files
2. Enter commit message
3. Click "Commit" button
4. **AI Feature**: Click "✨ Generate" to auto-generate commit message with AI

### Branch Operations

#### Create Branch
1. Click "Branch" button in toolbar OR
2. Right-click commit → "Create branch here"
3. Enter branch name
4. Branch created at selected commit/current HEAD

#### Delete Branch
1. Right-click branch in sidebar
2. Select "Delete Branch"
3. Confirm in dialog
4. **Protections**:
   - Cannot delete default branch
   - Cannot delete active branch (menu doesn't appear)
   - No page reload (smooth refresh)

#### Checkout Branch
- Click any branch in sidebar to check it out
- Active branch shown with green dot

#### Checkout Commit
1. Right-click commit → "Checkout this commit"
2. Read warning about detached HEAD state
3. Confirm to checkout
4. **Important**: You're in detached HEAD state
   - Click any branch to return to normal state
   - New commits will be disconnected

### Undo Feature

#### When Undo Button Appears
- After cherry-pick operations
- After branch operations
- Any operation that modifies repository state

#### Using Undo
1. Click purple "Undo [Operation]" button in toolbar
2. Confirm in dialog
3. Repository resets to previous state
4. Button disappears after undo

#### What Undo Does
- Resets HEAD to before state
- Returns to previous branch if switched
- Removes applied commits
- Restores repository to exact pre-operation state

### Stash Changes

#### Access Stash
- Right-click WIP node → "Stash Changes"

#### What Stash Does
- Saves all uncommitted changes
- Cleans working directory
- Changes can be restored later
- Useful for quick context switches

---

## Advanced Features

### GitHub Integration

#### Setup
1. Go to Settings
2. Enter GitHub Personal Access Token
3. Token scope required: `repo`, `user`, `workflow`

#### Features Enabled
- View remote repositories
- See GitHub Actions workflows
- View Pull Requests
- View Issues
- Create Pull Requests
- View commits on GitHub (right-click → "View on GitHub")

### AI Commit Message Generation

#### Generate Message with AI
1. Stage at least one file
2. Click "✨ Generate" button
3. AI analyzes staged changes
4. Commit message auto-generated based on changes

#### Requirements
- At least one staged file
- Valid OpenAI API key configured
- Internet connection

### Terminal

#### Git Commands Supported
- `git status` - Show working tree status
- `git checkout <branch>` - Switch branches
- `git branch` - List all branches
- `git log` - Show recent commits
- `git add <file>` - Stage files
- `git commit -m "message"` - Create commit
- `clear` - Clear terminal

#### Limitations
- **Git commands only** - Not a system terminal
- Cannot run: `ls`, `cd`, `mkdir`, or other system commands
- Use your system terminal for non-Git operations

#### Tips
- Use terminal for quick Git operations
- Commands sync with main UI
- Auto-refreshes after commands

### Merge Tool (Coming Soon)
- Visual conflict resolution
- Side-by-side diff view
- Accept/reject changes
- Currently in development

---

## Keyboard Shortcuts

### Selection
- `Ctrl/Cmd + Click` - Multi-select commits
- `Click` - Select single commit

### Navigation
- `Cmd/Ctrl + P` - Focus filter input (planned)
- `Esc` - Close modals/dialogs

### Actions
- `Enter` - Confirm dialogs
- `Esc` - Cancel dialogs

---

## Context Menus

### Commit Right-Click Menu

#### Cherry-Pick Section (Local Repos Only)
- **Cherry-pick to HEAD**: Apply to current branch
- **Cherry-pick to branch**: Select target branch from submenu
  - Shows all local branches
  - Active branch marked with green dot
  - Hover to see submenu

#### Branch Operations (Local Repos Only)
- **Create branch here**: Create new branch at this commit
- **Checkout this commit**: Checkout specific commit (detached HEAD)

#### Information
- **Copy SHA**: Copy commit hash to clipboard

#### GitHub Operations (Remote Repos Only)
- **View on GitHub**: Open commit in browser

### Branch Right-Click Menu

#### Delete Branch
- Only appears for **local branches**
- **Hidden for active branch** (safety feature)
- **Hidden for default branch** (protected)
- Shows confirmation dialog with warning

### WIP Node Right-Click Menu

#### File Operations
- **Stage All Changes**: Move all unstaged files to staged
- **Unstage All Changes**: Move all staged files to unstaged
- **Stash Changes**: Save all changes to stash
- **Discard All Changes**: ⚠️ **Dangerous** - Permanently delete all unstaged changes

---

## Safety Features

### Protected Operations
- Cannot delete default branch
- Cannot delete active branch (right-click disabled)
- Cannot reorder commits (drag-drop reordering disabled)
- Cannot cherry-pick root commits
- Cannot cherry-pick onto descendants (circular prevention)
- Warnings for dangerous operations (detached HEAD, discard changes)

### Undo Protection
- All major operations track undo state
- One-click undo for cherry-pick
- Restore previous branch if switched
- Safe reset to pre-operation state

### Confirmation Dialogs
- Cherry-pick confirmation shows commit count and target
- Delete branch shows branch name and warning
- Checkout commit explains detached HEAD
- Discard changes warns about data loss

---

## Error Handling

### Beautiful Error Messages
- All alerts use AlertDialog component
- Clear error descriptions
- Helpful suggestions for resolution
- Color-coded by type (success/error/info/warning)

### Examples
- **"Cannot delete default branch"**: Error dialog with explanation
- **"Cherry-pick failed"**: Shows specific error message
- **"No staged files"**: Info dialog with instructions
- **"Stage files first"**: Helpful guidance

---

## UI/UX Features

### Responsive Design
- Adapts to different screen sizes
- Scrollable commit graph
- Collapsible sidebar sections
- Custom scrollbars

### Visual Indicators
- **Green dot**: Active branch
- **Purple/Indigo circles**: Commit authors
- **Red text**: Delete operations
- **Yellow warnings**: Caution required
- **Green success**: Operation completed

### Animations
- Fade-in dialogs
- Smooth hover transitions
- Loading spinners for async operations
- Animated undo button appearance

### Dark Theme
- GitKraken-inspired dark color scheme
- High contrast for readability
- Accent colors for important elements
- Consistent across all components

---

## Tips & Best Practices

### Cherry-Picking
- Use "Cherry-pick to branch" when you want to apply commits to a different branch
- Always check the confirmation dialog to verify target
- Use undo if you cherry-picked to wrong location
- Multi-select with Ctrl/Cmd to cherry-pick multiple commits at once

### Branch Management
- Keep branches organized in the unified list
- Remote branches shown with globe icon - don't delete unless sure
- Active branch protected from accidental deletion
- Use Gitflow button to initialize Gitflow branching structure

### Commit Workflow
1. Make changes to files
2. Review in Commit Panel (bottom)
3. Stage files individually or all at once
4. Write descriptive commit message (or use AI generation)
5. Commit changes
6. Push to remote when ready

### Safety First
- Right-click menus don't show dangerous options for active/default branches
- Confirmation dialogs prevent accidental actions
- Undo button available for major operations
- Warnings explain consequences before irreversible actions

---

## Troubleshooting

### Cherry-Pick Issues
- **"Cannot cherry-pick"**: Commit might be ancestor of target, or is a root commit
- **"Cherry-pick failed"**: Merge conflict - resolve conflicts first
- **Solution**: Use undo button to reset

### Branch Deletion
- **"Cannot delete default branch"**: Expected behavior - default branch protected
- **Menu doesn't appear**: Branch is active - switch to another branch first
- **"Failed to delete"**: Branch might have unmerged changes

### Checkout Commit
- **"Detached HEAD" warning**: Normal state when checking out commits
- **"How do I get back?"**: Click any branch in sidebar to return
- **"New commits disconnected"**: Create a branch from detached HEAD to save work

### Undo Issues
- **"Undo button not appearing"**: Operation didn't change repository state
- **"Undo failed"**: Repository state changed since operation
- **Solution**: Manually reset to desired commit

---

## File Organization

### Component Structure
```
components/
├── App.tsx                    # Main application logic
├── Toolbar.tsx               # Top navigation toolbar
├── Sidebar.tsx               # Left sidebar with branches/PRs/issues
├── CommitPanel.tsx           # Bottom staging/commit panel
├── GraphNode.tsx             # Commit graph node circles
├── ContextMenu.tsx           # Right-click context menus
├── AlertDialog.tsx           # Beautiful dialog component
├── UndoButton.tsx            # Undo operation button
└── Terminal.tsx              # Git terminal interface
```

### Services
```
services/
├── localGitService.ts        # Git operations (isomorphic-git)
├── githubService.ts          # GitHub API integration
└── openaiService.ts          # AI commit message generation
```

### Types
```
types/
└── index.ts                  # TypeScript type definitions
```

---

## Technical Details

### Git Library
- **isomorphic-git**: Pure JavaScript Git implementation
- Browser-compatible Git operations
- No native Git required

### State Management
- React useState hooks
- Context for global state
- Optimistic UI updates

### Data Flow
1. User action (click, drag, right-click)
2. Handler function (e.g., handleDeleteBranch)
3. Show confirmation dialog (if needed)
4. Execute Git operation (via localGitService)
5. Update UI state
6. Record undo state (if applicable)
7. Refresh repository data
8. Show success/error dialog

---

## Future Enhancements

### Planned Features
- [ ] Full merge tool with conflict resolution
- [ ] Gitflow integration (feature/finish/hotfix workflows)
- [ ] Commit rebase operations
- [ ] Tag management
- [ ] Diff viewer
- [ ] Blame view
- [ ] Submodule support
- [ ] Git LFS support
- [ ] More keyboard shortcuts
- [ ] Custom themes

### In Development
- Merge tool UI
- Enhanced terminal capabilities
- Performance optimizations for large repositories

---

## Support

### Getting Help
- Check this documentation first
- Review error messages in dialogs
- Use undo button to revert problematic changes
- Check browser console for technical errors

### Reporting Issues
When reporting bugs, include:
- What operation you were performing
- Error message from dialog
- Steps to reproduce
- Browser and OS information

---

**Last Updated**: 2026-01-26
**Version**: 1.0.0
**Author**: GitKraken Clone Project
