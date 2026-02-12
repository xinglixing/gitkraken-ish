# Product Specification

**Git Desktop Client with Visual Graph & AI Assistance**

## 1. Product Overview

A cross-platform desktop Git client similar to **GitKraken** and **GitHub Desktop**, initially supporting **GitHub repositories only**.
The core differentiator is a **high-performance visual commit graph** combined with **interactive Git operations** and **pluggable AI-powered Git assistance**.

Target users:

- Developers working with Git locally and on GitHub
- Teams that want visual Git workflows
- Developers who prefer GUI + AI over CLI memorization

Non-goals (v1):

- GitLab / Bitbucket support
- Self-hosted Git servers
- Mobile support

---

## 2. Core Architecture (Authoritative)

### 2.1 High-Level Data Flow

```
Local Git Repo / GitHub
        ↓
Git Data Extraction Layer
        ↓
Commit DAG Normalization
        ↓
Lane Assignment Algorithm
        ↓
Graph Layout Engine
        ↓
Rendering & Interaction Layer
```

---

## 3. Git Data Extraction

### Purpose

Convert raw Git data into a **normalized DAG model** suitable for visualization and interaction.

### Functional Requirements

- Must read:
  - Commits
  - Parent relationships (1+ parents)
  - Branch refs
  - Tags
  - HEAD

- Must support:
  - Local repositories
  - GitHub remotes (via local clone)

### Data Model (Canonical)

```ts
Commit {
  hash: string
  parents: string[]        // 0–n parents
  authorName: string
  authorEmail: string
  timestamp: number        // UNIX epoch
  message: string
  branches: string[]       // refs pointing here
  tags: string[]
}
```

### Implementation Notes

- Use **Git CLI** as the source of truth (recommended for correctness).
- Cache parsed results.
- Must handle detached HEAD.
- Must handle shallow clones gracefully.

---

## 4. Commit Graph Visualization

### Purpose

Provide a **GitKraken-style lane-based commit graph** that visually represents Git’s DAG.

### Functional Requirements

- Commits rendered top → bottom (time descending).
- Each logical branch path occupies a **horizontal lane**.
- Merge commits display:
  - Multiple inbound edges
  - Colored Bezier curves

- Branch labels stick to the latest commit in that lane.
- Graph must support:
  - Zoom
  - Vertical scrolling
  - Horizontal panning

### Lane Assignment Algorithm (Required Behavior)

1. Start from all branch HEADs.
2. Traverse commits in **topological order**.
3. Assign the **leftmost available lane** to a new branch path.
4. Maintain a set of **active lanes**.
5. When a branch merges:
   - Continue the primary parent lane
   - Release merged lanes

Key invariant:

> At any row, each active branch path occupies exactly one lane.

### Rendering Requirements

- Commit node:
  - Circle
  - Branch color

- Edges:
  - Straight lines for linear history
  - Bezier curves for merges

- Performance:
  - Only render visible rows (virtualization)
  - Canvas or WebGL preferred

---

## 5. Commit Interaction (Click & Inspect)

### Features

- Clicking a commit opens a **Commit Detail Panel**:
  - Full message
  - Author
  - Timestamp
  - Parent(s)
  - Diff summary

- Hover highlights:
  - Connected parents/children
  - Branch name(s)

---

## 6. Drag-and-Drop Git Operations (Critical Feature)

### 6.1 Drag Commit → Commit (Same Branch)

**Operation:** Cherry-pick
**CLI Equivalent:** `git cherry-pick <commit>`

Behavior:

- Create a **new commit** on top of target commit.
- Original commit remains unchanged.
- New commit has a **new SHA**.

Restrictions:

- Must not allow dragging onto its own parent.
- Conflicts must trigger conflict resolution UI.

---

### 6.2 Drag Commit → Branch Label

**Operation:** Cherry-pick to branch

Behavior:

1. Checkout target branch.
2. Cherry-pick dragged commit.
3. Create new commit at branch tip.

---

### 6.3 Drag Commit Before / After Another Commit

**Operation:** Interactive Rebase
**CLI Equivalent:** `git rebase -i`

Behavior:

- Rewrite commit order.
- All affected commits get new SHAs.
- Force-push warning if branch is published.

UI Requirements:

- Visual preview of new order.
- Confirmation modal with risk warning.

---

### 6.4 Drag Multiple Commits Together

**Operation:** Interactive Rebase (Squash / Reorder / Drop)

Behavior:

- User selects multiple commits.
- System prompts:
  - Reorder
  - Squash
  - Drop

- Generates rebase plan.

---

### 6.5 Safety Rules (Mandatory)

- Block operations on:
  - `main`
  - `develop`
  - Protected branches (configurable)

- Require explicit confirmation for:
  - History rewrites
  - Force push

---

## 7. Diff, Blame, and File History

### Diff View

- Unified & split diff modes
- Syntax highlighting
- Stage/unstage hunks

### Blame View

- Line-by-line author attribution
- Click blame line → jump to commit

### File History

- Timeline of commits affecting a file
- Visual mini-graph per file

---

## 8. Merge Conflict Resolution Tool

### Features

- Side-by-side conflict view:
  - Ours / Theirs / Base

- Inline conflict markers
- Visual merge preview

### AI Integration

- AI suggests a merged version.
- Confidence score + explanation.
- User can edit before accepting.

---

## 9. Workspaces

### Purpose

Organize repositories locally.

### Behavior

- Workspace = named collection of repos
- Local only (no cloud sync v1)
- Repo can belong to multiple workspaces

---

## 10. Gitflow Support

### Required Branch Types

- main
- develop
- feature/\*
- release/\*
- hotfix/\*

### Features

- Visual branch categorization
- Guided flow actions:
  - Start feature
  - Finish feature
  - Release prep

---

## 11. Git LFS Support

- Detect LFS-tracked files
- Show pointer vs actual file
- Warn when LFS is missing

---

## 12. Submodules Support

- Detect submodules
- Show submodule status
- Open submodule as nested repo

---

## 13. Terminal Panel

### Features

- Embedded terminal
- Git-aware autocomplete
- Inline Git hints
- Output parsing for clickable commits

---

## 14. GitHub Integration

### Features

- OAuth authentication
- Repo cloning
- PR creation
- Issue linking

---

## 15. Conflict Prevention System

### Behavior

- Analyze incoming merges
- Warn when:
  - Files overlap heavily
  - Same lines changed

- Visual risk indicator before merge

---

## 16. Multiple Profiles

### Purpose

Support multiple identities.

### Profile Data

- Name
- Email
- GitHub account
- AI provider + API keys

Profiles are switchable per repository.

---

# 17. AI Feature System (Pluggable Providers)

### Supported Providers

- OpenAI
- Anthropic
- DeepSeek
- ZAI

Each provider must implement a **common interface**:

```ts
AIProvider {
  generateCommitMessage(diff): string
  explainCommit(commit): string
  suggestMergeResolution(conflict): MergeProposal
}
```

---

## 18. AI Features (Detailed)

### 18.1 AI Commit Messages

Input:

- Staged diff

Output:

- Conventional commit-style message
- Editable before commit

---

### 18.2 AI Commit Explanation

Input:

- Commit or commit range

Output:

- Plain-English explanation
- Intent-focused, not diff-dump

---

### 18.3 AI Commit Composer

Capabilities:

- Group changes into logical commits
- Suggest reordering
- Suggest squashing

Produces:

- Rebase plan preview

---

### 18.4 AI Merge Conflict Resolution

Input:

- Conflict blocks

Output:

- Suggested merged code
- Confidence score
- Explanation

---

### 18.5 AI Stash Messages

Input:

- Working tree diff

Output:

- Descriptive stash name

---

### 18.6 AI PR Title & Description

Input:

- Branch diff vs base

Output:

- Title
- Description
- Bullet summary

---

## 19. Non-Functional Requirements

- Must handle repositories with **50k+ commits**
- UI must remain responsive
- All destructive actions must be reversible where possible
- No AI action is auto-applied without user confirmation

---

## 20. MVP Completion Criteria

MVP is complete when:

- Graph renders correctly for branched & merged repos
- Drag-and-drop cherry-pick works
- Interactive rebase works visually
- At least one AI provider fully integrated
- Local + GitHub repos supported

---

21. Global Command Palette (GitKraken-style)
    Purpose

Allow power users to execute any Git action from the keyboard without navigating UI.

Functional Requirements

Shortcut: Cmd/Ctrl + Shift + P

Fuzzy-searchable command list

Commands grouped by category:

Repository

Branch

Commit

Rebase

Stash

AI

Example Commands

Checkout branch

Create branch from commit

Start interactive rebase

Cherry-pick commit

Squash commits

Open commit diff

Generate AI commit message

Implementation Notes

Commands are declarative objects:

Command {
id: string
label: string
handler(context): void
}

22. Right-Click Context Menus (Critical UX Feature)

Right-click menus must exist everywhere and reflect the object under the cursor.

22.1 Commit Node Context Menu

Triggered by: Right-click on commit node in graph

Required Actions
History & Navigation

View Commit Details

Copy Commit SHA

Copy Commit Message

Reveal in Graph (center view)

Git Operations

Checkout this commit (detached HEAD)

Create branch from commit

Create tag from commit

Cherry-pick commit

Revert commit

Reset current branch to this commit:

Soft

Mixed

Hard

History Rewrite

Interactive rebase from here

Squash into parent

Drop commit (local-only)

AI Actions

Explain this commit (AI)

Generate commit summary

Generate changelog entry

Safety Rules

Disable rewrite options for protected branches

Confirmation modal for destructive actions

22.2 Branch Label Context Menu

Triggered by: Right-click on branch name

Required Actions

Checkout branch

Rename branch

Delete branch (local / remote)

Set upstream

Reset branch to commit

Compare with another branch

Merge into current branch

Rebase onto current branch

AI Actions

Explain branch changes

Generate PR title & description

22.3 Tag Context Menu

Checkout tag

Delete tag

Push tag

Copy tag name

22.4 File Context Menu (Working Tree & History)

Triggered by: Right-click on file

Actions

Open file

View file history

View blame

Discard changes

Stage / unstage

Reset file to commit

AI

Explain file changes

Summarize file history

23. Undo / Safety Net System (Very Important)
    Purpose

Make Git operations feel safe.

Behavior

Track last destructive operations:

Reset

Rebase

Drop commit

Provide Undo when possible:

Reapply via reflog

Show:

“You can undo this” banners

Implementation Notes

Parse git reflog

Store pre-operation HEAD

24. Commit Templates & Message Helpers
    Features

User-defined commit templates

Conventional commit helper UI

Auto-fill scope suggestions

25. Graph Filters & Focus Modes
    Filters

By branch

By author

By date range

By file path

Focus Mode

Isolate a branch and its ancestors

Hide unrelated commits

26. Reflog Viewer (Power Feature)
    Purpose

Expose Git’s recovery mechanism visually.

Features

Visual list of HEAD movements

Jump back to previous states

Restore branch to reflog entry

27. Stash Management UI
    Features

Visual stash list

Apply / pop / drop stash

Rename stash

Diff stash vs working tree

AI

Explain stash contents

28. Patch / Partial Commit Tool
    Purpose

Allow precise control over commits.

Features

Stage individual lines or blocks

Visual hunk splitting

Reorder hunks

29. Search Everywhere
    Scope

Commit messages

SHAs

Branch names

File paths

Behavior

Instant results

Jump to graph location

30. Repository Health Indicators
    Visual Indicators

Dirty working tree

Ahead / behind status

Unpushed commits

Large file warnings

31. Auto-Fetch & Background Sync
    Behavior

Periodic git fetch

Non-blocking

Visual indication of remote changes

32. Visual Merge Preview
    Purpose

Show what will happen before merge.

Features

List of commits to be merged

Conflict risk indicators

File overlap summary

33. Snapshots & Checkpoints (Solo Dev Superpower)
    Purpose

Fast local safety without commits.

Behavior

Create lightweight snapshots

Restore snapshot

Snapshots are local-only

Implementation:

Backed by stashes or temporary refs

34. Custom Keyboard Shortcuts

Fully remappable

Export / import shortcuts

35. Settings Profiles (Local)
    Includes

Git config overrides

Default rebase behavior

Preferred AI provider

36. Observability & Debug Mode (Developer Tool)
    Features

Git command log

AI prompt + response viewer

Error inspection panel
