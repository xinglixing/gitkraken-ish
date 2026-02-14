
export type AIProvider = 'gemini' | 'openai' | 'claude' | 'deepseek' | 'zai';

export type ShellPreference = 'auto' | 'bash' | 'powershell' | 'zsh' | 'cmd';

export type DiffViewMode = 'split' | 'unified';

export type DateFormatPreference = 'relative' | 'absolute' | 'both';

export interface AIConfig {
  provider: AIProvider;
  keys: {
    gemini?: string;
    openai?: string;
    claude?: string;
    deepseek?: string;
    zai?: string;
  };
  modelOverrides?: {
    [key in AIProvider]?: string;
  };
  commitStyle?: 'conventional' | 'emoji' | 'concise' | 'detailed';
  customInstructions?: string;
  fetchInterval?: number; // 0 = manual, otherwise minutes
  shellPreference?: ShellPreference; // Terminal shell preference

  // Display settings
  defaultDiffView?: DiffViewMode;
  showAvatars?: boolean;
  dateFormat?: DateFormatPreference;

  // Git settings
  defaultBranch?: string; // Default branch name for new repos
  pruneOnFetch?: boolean; // Remove deleted remote branches on fetch
  confirmBeforePush?: boolean; // Show confirmation before pushing

  // Editor settings
  editorFontSize?: number;
  editorWordWrap?: boolean;

  // Feature flags
  enableSubmoduleFeatures?: boolean; // Enable submodule functionality (default: false)
}

export interface Profile {
  id: string;
  name: string; // Display name e.g. "Work"
  gitName: string; // For commit author
  gitEmail: string; // For commit email
  githubToken: string;
  gitConfigOverrides?: {
    defaultRebaseBehavior?: 'merge' | 'rebase' | 'ff-only';
    [key: string]: string | undefined;
  };
  githubUser: User | null;
}

export interface Commit {
  id: string;
  shortId: string;
  message: string;
  author: string;
  avatarUrl?: string;
  date: string;
  branch?: string;
  parents: string[];
  lane: number;
  color: string;
  changes?: FileChange[];
  url?: string;
  isHead?: boolean; // For WIP node
  treeId?: string; // Tree SHA for detecting identical commits
  detailsUnavailable?: boolean; // True when commit details couldn't be loaded (shallow clone, gc'd objects)
  sha?: string; // Alternative to id for compatibility
  timestamp?: number; // Unix timestamp for filtering/sorting
}

export interface FileChange {
  filename: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'conflicted';
  staged: boolean;
  additions: number;
  deletions: number;
  patch?: string;
  conflictContent?: {
    current: string;
    incoming: string;
  };
}

export interface Branch {
  name: string;
  commitId: string;
  isRemote: boolean;
  active?: boolean;
  isCurrent?: boolean; // Alias for active, used in some contexts
}

export interface Stash {
  id: string;
  message: string;
  branch: string;
  commitId: string;
  date: string;
  files?: string[]; // Optional: list of changed files
}

export interface Repository {
  id: number | string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  owner?: {
    login: string;
    avatar_url: string;
  };
  isLocal?: boolean;
  handle?: string; // File system path (Electron desktop app)
  clone_url?: string;
  path?: string;
  isFavorite?: boolean;
  localPath?: string; // Local file system path for cloned repos
  parent?: Repository; // Parent repository for forks
  submodulePath?: string; // Relative path within parent (for submodule change detection)
}

export interface User {
  login: string;
  avatar_url: string;
  name: string;
  email?: string; // User email for commits
}

export enum ViewMode {
  GRAPH = 'GRAPH',
  LAUNCHPAD = 'LAUNCHPAD',
  ISSUES = 'ISSUES',
  SETTINGS = 'SETTINGS',
  ACTIONS = 'ACTIONS',
  PULL_REQUEST = 'PULL_REQUEST',
  ISSUE_DETAIL = 'ISSUE_DETAIL'
}

export interface Issue {
  id: number;
  title: string;
  status: 'open' | 'closed' | 'in-progress';
  number: number;
  author: string;
  body?: string;
  created_at?: string;
  html_url?: string;
}

export interface PullRequest {
  id: number;
  title: string;
  number: number;
  author: string;
  status: 'open' | 'merged' | 'closed';
  checks: 'passing' | 'failing' | 'pending';
  body?: string;
  created_at?: string;
  head?: { ref: string; sha: string };
  base?: { ref: string; sha: string };
  html_url?: string;
  mergeable?: boolean | null;
  mergeable_state?: string;
}

export interface Workspace {
  id: string;
  name: string;
  repos: Repository[];
}


export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  branch: string;
  created_at: string;
  actor: string;
  display_title: string;
}

export interface WorkflowStep {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  steps: WorkflowStep[];
}

// --- Reflog Types ---

export interface ReflogEntry {
  sha: string;
  ref: string;
  index: number;
  action: string;
  message: string;
  timestamp: number;
}

// --- Snapshot Types ---

export interface Snapshot {
  id: string;
  index: number;
  message: string;
  timestamp: number;
  files: string[];
}

// --- LFS Types ---

export interface LfsFile {
  path: string;
  size: string;
  isPointer: boolean;
}

// --- Submodule Types ---

export interface Submodule {
  path: string;
  url: string;
  branch?: string;
  sha?: string;
  initialized: boolean;
}

// --- Commit Template Types ---

export interface CommitTemplate {
  id: string;
  name: string;
  template: string;
  isBuiltIn?: boolean;
}

// --- Custom Shortcut Types ---

export interface ShortcutMapping {
  id: string;
  action: string;
  keys: string; // e.g. "Ctrl+Shift+P"
  isCustom?: boolean;
}

// --- Debug / Observability Types ---

export interface GitCommandLogEntry {
  id: string;
  command: string;
  args: string[];
  timestamp: number;
  duration?: number;
  success: boolean;
  error?: string;
}

export interface AIInteractionLogEntry {
  id: string;
  provider: AIProvider;
  model: string;
  prompt: string;
  response: string;
  timestamp: number;
  duration?: number;
  success: boolean;
  error?: string;
}

// --- Merge Preview Types ---

export interface MergePreview {
  sourceBranch: string;
  targetBranch: string;
  commits: Commit[];
  conflictRisk: 'low' | 'medium' | 'high';
  overlappingFiles: string[];
  totalFiles: number;
}

// --- Git Operation Error Type ---

export interface GitOperationError extends Error {
  code?: string;
  stderr?: string;
  operation?: string;
}