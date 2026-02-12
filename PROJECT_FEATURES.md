### PROJECT FEATURE DETAILS

1. Working with Files
☐ Create / Add Files

Allows creating new files directly inside GitKraken.

Files can be created via right-click menus or Command Palette.

Supports creating nested folders by typing paths (e.g. src/utils/file.js).

New files appear immediately as untracked changes.

☐ Delete Files

Files can be deleted from the Commit Panel or file list.

Deletions are staged as Git removals (git rm behavior).

Supports deleting multiple files at once.

☐ View All Files & Filter

Toggle between changed files only and all repository files.

Filter bar allows searching files by name or extension.

Useful for large repositories when locating files quickly.

☐ Built-in File Editor

Files can be opened and edited directly inside GitKraken.

Editor supports syntax highlighting for common file types.

Unsaved changes are visually indicated.

Saving a file updates the working directory state immediately.

☐ Save & Stage Workflow

Saving a file does not automatically stage it.

Users explicitly stage files or hunks after saving.

Prevents accidental commits of unfinished changes.

☐ Markdown Preview

.md files support live preview rendering.

Toggle between raw Markdown and rendered view.

Useful for README and documentation editing.

☐ File Encoding Handling

Displays and manages file encoding (UTF-8 by default).

Prevents encoding-related diffs and corruption.

☐ Diff Viewing

Shows file diffs with clear added/removed highlighting.

Supports split view, inline view, and word-level diffs.

Can compare working directory vs index or commit vs commit.

☐ Multi-Commit Diff

Selecting two commits shows differences between them.

Used for reviewing changes across a range of commits.

☐ Hunk & Line Control

Individual hunks or lines can be staged or reverted.

Enables precise commits without staging entire files.

☐ File History View

Shows all commits that modified a specific file.

Helps track when and why changes were introduced.

☐ Blame View

Displays author, commit, and timestamp per line.

Used to identify ownership and change responsibility.

2. Working with Commits
☐ Stage / Unstage Changes

Files, hunks, or individual lines can be staged.

Unstaging is supported without losing changes.

Gives granular control over commit content.

☐ Create Commit

Commit message editor with summary and description.

Keyboard shortcut support for fast committing.

Commits only include staged changes.

☐ Commit & Push

Option to commit and push in a single action.

Reduces steps for fast workflows.

☐ Commit Templates

Automatically loads commit message templates.

Supports local and global Git commit templates.

Enforces structured commit messages (e.g. Conventional Commits).

☐ Amend Last Commit

Modify the most recent commit.

Can change commit message, add/remove staged changes, or both.

Rewrites commit history locally.

☐ Reset Commits

Supports soft, mixed, and hard resets.

Soft reset keeps changes staged.

Mixed reset keeps changes unstaged.

Hard reset discards changes entirely.

☐ Revert Commits

Creates a new commit that undoes a selected commit.

Does not rewrite history.

Safe for shared branches.

☐ Cherry Pick Commits

Apply selected commits onto another branch.

Supports cherry-picking multiple commits at once.

Interactive mode allows reordering, squashing, editing, or dropping commits.

☐ Undo / Redo Actions

Undo local Git actions before pushing.

Includes commits, resets, merges, and rebases.

☐ Co-Authors Support

Allows adding co-authors to commit messages.

Displays co-authors in commit history.

☐ Skip Git Hooks

Option to bypass commit hooks.

Useful when hooks are slow or temporarily blocking work.

3. Working with Repositories
☐ Open Existing Repository

Open any local Git repository.

Repository Manager provides quick access.

☐ Clone Repository

Clone from URL or Git provider integration.

Supports shallow cloning with depth control.

Branch selection during clone.

☐ Initialize New Repository

Create a new Git repo locally.

Optionally include .gitignore and license files.

☐ Favorite Repositories

Mark repositories as favorites.

Favorites appear pinned for quick switching.

☐ Branch Creation

Create branches from any commit.

Branch creation via context menu or toolbar.

☐ Checkout Branches

Switch branches instantly.

Visual graph makes branch context clear.

☐ Merge Branches

Drag-and-drop merge interaction.

Visual confirmation before merge execution.

☐ Rebase Branches

Rebase one branch onto another.

Supports conflict resolution during rebase.

☐ Conflict Resolution

Built-in conflict editor.

Shows conflicting sections side by side.

Allows choosing incoming, current, or manual edits.

☐ Push / Pull / Fetch

Standard Git remote operations supported.

Clear visual indicators for ahead/behind status.

☐ Submodule Management

Add, update, and initialize submodules.

Automatically updates .gitmodules.

Submodules shown as distinct nodes.

☐ Tags Management

Create, view, and delete Git tags.

Tags appear in the commit graph.

☐ Pull Request Integration

Create and view pull requests inside the app.

Linked to supported Git hosting providers.

☐ Activity Logs

Displays recent repository actions.

Useful for auditing and debugging workflows.

☐ Integrated Terminal

Built-in terminal per repository.

Supports native shell and WSL on Windows.

☐ Git Worktrees

Supports multiple working directories for the same repo.

Useful for parallel branch work.
