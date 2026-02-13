import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import CommitPanel from './components/CommitPanel';
import GraphNode from './components/GraphNode';
import CommitGraph from './components/CommitGraph';
import LoginModal from './components/LoginModal';
import RepoSelector from './components/RepoSelector';
import SettingsModal from './components/SettingsModal';
import Launchpad from './components/Launchpad';
import Terminal from './components/Terminal';
import MergeTool from './components/MergeTool';
import ContextMenu from './components/ContextMenu';
import CreatePRModal from './components/CreatePRModal';
import BranchSwitcher from './components/BranchSwitcher';
import ActionDetails from './components/ActionDetails';
import PullRequestDetails from './components/PullRequestDetails';
import IssueDetails from './components/IssueDetails';
import PromptModal from './components/PromptModal';
import ConfirmDialog, { CherryPickDialog, ReorderCommitsDialog } from './components/ConfirmDialog';
import AlertDialog from './components/AlertDialog';
import UndoButton from './components/UndoButton';
import StashPanel from './components/StashPanel';
import SquashDialog from './components/SquashDialog';
import RemoteManager from './components/RemoteManager';
import CommandPalette, { createAppCommands } from './components/CommandPalette';
import SearchPanel from './components/SearchPanel';
import BlameView from './components/BlameView';
import FileHistory from './components/FileHistory';
import { FileEditor } from './components/FileEditor';
import { ReflogViewer } from './components/ReflogViewer';
import { GraphFilters, GraphFilterState, filterCommits } from './components/GraphFilters';
import { GitflowPanel } from './components/GitflowPanel';
import { SnapshotsPanel } from './components/SnapshotsPanel';
import { SubmodulesPanel } from './components/SubmodulesPanel';
import { WorktreesPanel } from './components/WorktreesPanel';
import { InteractiveRebasePanel, RebaseCommit } from './components/InteractiveRebasePanel';
import DebugPanel from './components/DebugPanel';
import MergePreviewModal from './components/MergePreviewModal';
import { ToastContainer, ToastItem } from './components/Toast';
import UpdateDialog from './components/UpdateDialog';
import { isDebugMode } from './services/debugService';
import { checkForUpdates, ReleaseInfo, CURRENT_VERSION } from './services/updateService';
import { MoveHorizontal, Plus, AlertCircle, AlertTriangle, Check, X, Sparkles, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';

import { Commit, Branch, Repository, User, AIConfig, ViewMode, Profile, WorkflowRun, PullRequest, Issue, Stash } from './types';
import { fetchBranches, fetchCommits } from './services/githubService';
import {
    fetchLocalBranches, fetchLocalCommits, gitPull, gitPush, createBranch,
    gitCherryPick, gitCheckout, gitInitGitflow, gitStageAll, gitUnstageAll, gitDiscardAll, gitStash, fetchStashes, gitStashApply, gitStashPop, gitStashDrop, gitSquashCommits,
    gitCherryPickMultiple, gitReorderCommits, gitIsDirty, gitResolveRef, gitReset, gitDeleteBranch, gitCreateBranchAt,
    gitAmend, gitUndoCommit, gitRevert, gitHasCommits,
    gitCreateTag, gitRenameBranch, getAheadBehind, gitMerge, gitListTags, gitResolveTagRefs,
    gitListRemotes, fastBranchRefresh, hasMoreCommits as checkHasMoreCommits, gitClone,
    gitGetFileContent, gitStage, gitWriteFile, gitListFiles
} from './services/localGitService';
import { getCurrentBranch, isGitRepoPath } from './services/localGitService';
import { hasConflicts, detectPotentialConflicts, generateMergePreview } from './services/conflictDetectionService';
import { generateCommitSummary, generateChangelogEntry, explainBranchChanges, explainFileChanges, summarizeFileHistory } from './services/aiService';
import { gitPushTag, gitSetUpstream, gitRebase, gitCompareBranches, gitDropCommit, gitResetBranch } from './services/localGitService';
import { processGraphLayout } from './services/graphLayout';
import { startWatching, stopWatching } from './services/gitWatcherService';
import { getProfiles, getActiveProfileId, setActiveProfileId, createProfile, saveProfile, createLocalProfile, isDuplicateProfile, clearAllProfileData } from './services/profileService';
import { isElectron } from './utils/platform';
import { formatDate } from './utils/dateUtils';
import { useAutoFetch } from './hooks/useAutoFetch';
import { useUndo, GitOperation } from './hooks/useUndo';
import { useConfirmDialog } from './hooks/useConfirmDialog';
import { useAlert } from './hooks/useAlert';

/**
 * SECURITY: Safe git command execution using execFileSync.
 * This prevents command injection by passing arguments as an array, never interpolated into a shell string.
 * All git commands in this file should use this helper instead of execSync with template literals.
 */
const safeGitExec = (args: string[], cwd: string, env?: NodeJS.ProcessEnv): string => {
    const { execFileSync } = require('child_process');
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: env || process.env,
    });
};

/**
 * SECURITY: Validates that a branch name or ref is safe (no shell metacharacters).
 * This is a defense-in-depth measure - safeGitExec already prevents injection.
 */
const isValidGitRef = (ref: string): boolean => {
    // Git ref must not contain: space, ~, ^, :, \, ?, *, [, control chars
    // Also reject shell metacharacters: $, `, |, &, ;, <, >, (, ), {, }
    const invalidChars = /[\s~^:\\?*\[\]$`|&;<>(){}'"!#]/;
    return ref.length > 0 && ref.length < 256 && !invalidChars.test(ref);
};

const ROW_HEIGHT = 28; // Slightly taller for bigger nodes
const COLUMN_WIDTH = 14; 
const GRAPH_PADDING_LEFT = 14;
const MIN_GRAPH_WIDTH = 100;
const MIN_COL_WIDTH = 50;

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  keys: {},
  commitStyle: 'conventional',
  fetchInterval: 0
};

interface ColWidths {
    graph: number;
    date: number;
    author: number;
    sha: number;
}

const HeaderCell = ({ 
    label, 
    width, 
    colName, 
    isFlex, 
    onResize 
}: { 
    label: string, 
    width?: number, 
    colName: keyof ColWidths | 'desc', 
    isFlex?: boolean,
    onResize: (e: React.MouseEvent, col: keyof ColWidths | 'desc') => void
}) => (
    <div 
        className={`relative flex items-center h-full px-2 group ${isFlex ? 'flex-1 min-w-[100px]' : ''}`} 
        style={width ? { width } : {}}
    >
        <span className="truncate">{label}</span>
        {/* Resize Handle */}
        <div 
            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onMouseDown={(e) => onResize(e, colName)}
        >
            <MoveHorizontal className="w-3 h-3 text-gk-blue pointer-events-none" />
        </div>
    </div>
);

const App: React.FC = () => {
  // Initialize active profile from localStorage to avoid showing LoginModal on reload
  const [activeProfile, setActiveProfile] = useState<Profile | null>(() => {
    try {
      const profiles = getProfiles();
      const activeId = getActiveProfileId();
      if (activeId) {
        const found = profiles.find(p => p.id === activeId);
        if (found) return found;
      }
      return null;
    } catch (e) {
      console.warn('Failed to load saved profile:', e);
      return null;
    }
  });
  const [skipLogin, setSkipLogin] = useState(false);

  // SECURITY WARNING: AI config containing API keys is stored in localStorage.
  // For production, consider migrating to OS keychain (electron-keytar) or encrypted storage.
  // localStorage is accessible via DevTools and persists unencrypted on disk.
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    try {
      const saved = localStorage.getItem('gk_ai_config');
      return saved ? JSON.parse(saved) : DEFAULT_AI_CONFIG;
    } catch (e) {
      console.warn('Failed to parse saved AI config, using defaults:', e);
      return DEFAULT_AI_CONFIG;
    }
  });

  // Initialize last opened repo from localStorage
  const [currentRepo, setCurrentRepo] = useState<Repository | null>(() => {
    try {
      const saved = localStorage.getItem('gk_last_repo');
      if (saved) {
        const repo = JSON.parse(saved) as Repository;
        // For local repos, we'll validate the path exists in a useEffect
        // For now, just return the saved repo
        return repo;
      }
      return null;
    } catch (e) {
      console.warn('Failed to load last repo:', e);
      return null;
    }
  });
  // Parent repo tracking for submodules/worktrees navigation
  const [parentRepo, setParentRepo] = useState<Repository | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [commitIdsRef] = useState(() => ({ current: new Set<string>() })); // Mutable ref for O(1) commit lookup
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy loading state for commits
  const [commitPage, setCommitPage] = useState(1);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const [loadingMoreCommits, setLoadingMoreCommits] = useState(false);
  const COMMITS_PER_PAGE = 100;
  const INITIAL_COMMITS_LOAD = 50; // Faster initial load with fewer commits

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRAPH);
  
  // Selection State
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [selectedCommits, setSelectedCommits] = useState<Commit[]>([]); // Multi-select support
  
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  
  // Panel state: Default to false (closed) or true if you prefer it open on load.
  const [isPanelOpen, setIsPanelOpen] = useState(false); 

  const [showSettings, setShowSettings] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showMergeTool, setShowMergeTool] = useState(false);
  const [showPRModal, setShowPRModal] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [branchSwitcherPosition, setBranchSwitcherPosition] = useState<{ top: number; left: number } | undefined>(undefined);
  const [showStashPanel, setShowStashPanel] = useState(false);
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [showSquashDialog, setShowSquashDialog] = useState(false);
  const [selectedForSquash, setSelectedForSquash] = useState<Commit[]>([]);
  const [showRemoteManager, setShowRemoteManager] = useState(false);
  const [showReflogViewer, setShowReflogViewer] = useState(false);
  const [showGitflowPanel, setShowGitflowPanel] = useState(false);
  const [showSnapshotsPanel, setShowSnapshotsPanel] = useState(false);
  const [showSubmodulesPanel, setShowSubmodulesPanel] = useState(false);
  const [showWorktreesPanel, setShowWorktreesPanel] = useState(false);
  const [showGraphFilters, setShowGraphFilters] = useState(false);
  const [graphFilters, setGraphFilters] = useState<GraphFilterState>({ focusMode: false, searchQuery: '' });
  const [showInteractiveRebase, setShowInteractiveRebase] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugModeEnabled, setDebugModeEnabled] = useState(isDebugMode());
  const [showMergePreview, setShowMergePreview] = useState(false);
  const [mergePreviewData, setMergePreviewData] = useState<any>(null);
  const [rebaseInProgress, setRebaseInProgress] = useState<{
    originalBranch: string;
    parentCommit: string;
    remainingCommits: RebaseCommit[];
    currentIndex: number;
  } | null>(null);
  const [pendingRemoteAction, setPendingRemoteAction] = useState<'pull' | 'push' | null>(null);
  const [remoteCount, setRemoteCount] = useState(-1);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'commit' | 'wip', commit?: Commit } | null>(null);
  // Trigger to close sidebar context menus when commit context menu opens
  const [sidebarContextMenuCloseTrigger, setSidebarContextMenuCloseTrigger] = useState(0);

  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);

  // AI Loading State
  const [aiLoading, setAiLoading] = useState<{ isLoading: boolean; message: string }>({ isLoading: false, message: '' });

  // Toast notifications
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Update dialog state
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ releaseInfo: ReleaseInfo; currentVersion: string } | null>(null);

  // Sync Loading State (Push/Pull/Fetch)
  const [syncLoading, setSyncLoading] = useState<{ isLoading: boolean; message: string; type: 'push' | 'pull' | 'fetch' | null }>({ isLoading: false, message: '', type: null });

  // DnD State
  const [dragOverCommitId, setDragOverCommitId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | 'center' | null>(null);
  const [isValidDropTarget, setIsValidDropTarget] = useState(true);

  // Confirm dialog state
  const [cherryPickDialog, setCherryPickDialog] = useState<{
    isOpen: boolean;
    commitCount: number;
    targetCommit?: string;
    onConfirm: () => void;
  } | null>(null);

  const [reorderDialog, setReorderDialog] = useState<{
    isOpen: boolean;
    commitCount: number;
    onConfirm: () => void;
  } | null>(null);

  // Commit operation dialogs
  const [amendDialog, setAmendDialog] = useState<{
    isOpen: boolean;
    commitMessage: string;
  }>({ isOpen: false, commitMessage: '' });

  const [undoCommitDialog, setUndoCommitDialog] = useState<{
    isOpen: boolean;
  }>({ isOpen: false });

  const [revertDialog, setRevertDialog] = useState<{
    isOpen: boolean;
    commit: Commit | null;
  }>({ isOpen: false, commit: null });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    details?: string;
    onAddRemote?: () => void;
  } | null>(null);

  // Conflict warning state
  const [conflictWarning, setConflictWarning] = useState<{
    isOpen: boolean;
    files: string[];
    onContinue?: () => void;
  }>({ isOpen: false, files: [] });

  // Empty cherry-pick dialog state
  const [emptyCherryPickDialog, setEmptyCherryPickDialog] = useState<{
    isOpen: boolean;
    commitSha: string;
  } | null>(null);

  // Gitflow confirmation state
  const [gitflowDialog, setGitflowDialog] = useState<{
    isOpen: boolean;
  }>({ isOpen: false });

  // Discard all confirmation state
  const [discardAllDialog, setDiscardAllDialog] = useState<{
    isOpen: boolean;
  }>({ isOpen: false });

  // Checkout commit confirmation state
  const [checkoutDialog, setCheckoutDialog] = useState<{
    isOpen: boolean;
    commit: Commit | null;
    currentBranch: string;
  }>({ isOpen: false, commit: null, currentBranch: '' });

  // Undo/Redo state using hook
  const {
    undoState,
    redoState,
    recordOperation,
    clearUndo,
    performUndo,
    performRedo,
  } = useUndo();

  // Undo/Redo handlers
  const handleUndo = useCallback(async () => {
    if (!currentRepo) throw new Error('No repository selected');
    await performUndo(currentRepo, gitReset, gitCheckout);
  }, [currentRepo, performUndo]);

  const handleRedo = useCallback(async () => {
    if (!currentRepo) throw new Error('No repository selected');
    await performRedo(currentRepo, gitReset, gitCheckout);
  }, [currentRepo, performRedo]);

  // Trigger state for Sidebar auto-refresh
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Command Palette & Search state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  // Blame & File History state
  const [blameView, setBlameView] = useState<{ filepath: string; ref?: string } | null>(null);
  const [fileHistoryView, setFileHistoryView] = useState<{ filepath: string } | null>(null);
  const [fileEditorView, setFileEditorView] = useState<{ filepath: string } | null>(null);

  // Ahead/Behind state
  const [aheadBehind, setAheadBehind] = useState<{ ahead: number; behind: number }>({ ahead: 0, behind: 0 });
  const [tags, setTags] = useState<string[]>([]);
  const [repoFiles, setRepoFiles] = useState<string[]>([]);
  const [largeFileWarnings, setLargeFileWarnings] = useState<{ path: string; sizeMB: number }[]>([]);

  // Ref to prevent refresh loop when syncing branch name
  const activeBranchRef = useRef<string | null>(null);

  // Refs to avoid stale closures in refreshRepoData
  const currentRepoRef = useRef(currentRepo);
  currentRepoRef.current = currentRepo;
  const activeProfileRef = useRef(activeProfile);
  activeProfileRef.current = activeProfile;
  const commitPageRef = useRef(commitPage);
  commitPageRef.current = commitPage;
  // Debounce ref for refresh to prevent rapid multiple calls
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 150;

  // Reusable styled confirm dialog
  const { dialogState: confirmState, confirm: triggerConfirm, handleConfirm: onConfirmYes, handleCancel: onConfirmNo } = useConfirmDialog();
  const { showAlert } = useAlert();

  // Graph scroll tracking for virtualization
  const [graphScrollTop, setGraphScrollTop] = useState(0);
  const [graphViewportHeight, setGraphViewportHeight] = useState(800);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Prompt Modal State
  const [promptConfig, setPromptConfig] = useState<{
      isOpen: boolean;
      title: string;
      defaultValue: string;
      resolve: (value: string | null) => void;
  }>({
      isOpen: false,
      title: '',
      defaultValue: '',
      resolve: () => {}
  });

  const triggerPrompt = (title: string, defaultValue = ''): Promise<string | null> => {
      return new Promise((resolve) => {
          setPromptConfig({
              isOpen: true,
              title,
              defaultValue,
              resolve: (val) => {
                  setPromptConfig(prev => ({ ...prev, isOpen: false }));
                  resolve(val);
              }
          });
      });
  };

  // Column Width State
  const [colWidths, setColWidths] = useState<ColWidths>({
      graph: 0, // 0 means use calculated auto width
      date: 130,
      author: 130,
      sha: 80
  });

  // Calculate dynamic graph width based on max lane
  const calculatedGraphWidth = useMemo(() => {
    const maxLane = commits.length > 0 ? commits.reduce((max, c) => Math.max(max, c.lane), 0) : 0;
    const required = (maxLane + 2) * COLUMN_WIDTH + 20; 
    return Math.max(MIN_GRAPH_WIDTH, required);
  }, [commits]);

  const graphW = colWidths.graph > 0 ? colWidths.graph : calculatedGraphWidth;

  // Filtered commits for graph display
  const filteredCommits = useMemo(() => {
    return filterCommits(commits, graphFilters);
  }, [commits, graphFilters]);

  // Resize Handler
  const resizingRef = useRef<{ col: keyof ColWidths | 'desc', startX: number, startWidth: number } | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  // Cleanup any lingering resize listeners on unmount
  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  const startResize = (e: React.MouseEvent, col: keyof ColWidths | 'desc') => {
      e.preventDefault();
      // Clean up any previous resize session that wasn't properly ended
      resizeCleanupRef.current?.();

      // For description, we are effectively resizing the Date column (inverted)
      const startW = col === 'desc' ? colWidths.date : colWidths[col as keyof ColWidths];
      resizingRef.current = { col, startX: e.clientX, startWidth: startW };

      const onMouseMove = (ev: MouseEvent) => {
          if (!resizingRef.current) return;
          const { col, startX, startWidth } = resizingRef.current;
          const delta = ev.clientX - startX;

          if (col === 'desc') {
              // Dragging Desc right (positive delta) makes Date smaller
              setColWidths(prev => ({
                  ...prev,
                  date: Math.max(MIN_COL_WIDTH, startWidth - delta)
              }));
          } else {
              setColWidths(prev => ({
                  ...prev,
                  [col]: Math.max(MIN_COL_WIDTH, startWidth + delta)
              }));
          }
      };

      const cleanup = () => {
          resizingRef.current = null;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', cleanup);
          document.body.style.cursor = 'default';
          resizeCleanupRef.current = null;
      };

      resizeCleanupRef.current = cleanup;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', cleanup);
      document.body.style.cursor = 'col-resize';
  };

  // Note: Profile is now initialized in useState to avoid flash of LoginModal on reload

  // Toast notification helpers
  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Check for updates on app start
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const result = await checkForUpdates();
        if (result.hasUpdate && result.releaseInfo) {
          // Show toast notification for update
          addToast({
            type: 'update',
            title: `Update Available (v${result.latestVersion})`,
            message: 'A new version is ready to download.',
            duration: 0, // Persistent until user interacts
            actions: [
              {
                label: 'Update Now',
                variant: 'primary',
                onClick: () => {
                  setUpdateInfo({
                    releaseInfo: result.releaseInfo!,
                    currentVersion: result.currentVersion
                  });
                  setUpdateDialogOpen(true);
                }
              },
              {
                label: 'Later',
                variant: 'secondary',
                onClick: () => {} // Just close the toast
              }
            ]
          });
        }
      } catch (e) {
        console.warn('Failed to check for updates:', e);
      }
    };

    // Small delay to not block initial render
    const timer = setTimeout(checkUpdates, 2000);
    return () => clearTimeout(timer);
  }, [addToast]);

  // Save current repo to localStorage when it changes
  useEffect(() => {
    if (currentRepo) {
      localStorage.setItem('gk_last_repo', JSON.stringify(currentRepo));
    } else {
      localStorage.removeItem('gk_last_repo');
    }
  }, [currentRepo]);

  // Validate saved local repo path exists on startup
  useEffect(() => {
    const validateSavedRepo = async () => {
      if (currentRepo?.isLocal && currentRepo.handle) {
        try {
          // Check if the path still exists and is a git repo
          const isValid = await isGitRepoPath(currentRepo.handle);
          if (!isValid) {
            console.warn('Saved repo path no longer exists or is not a git repo:', currentRepo.handle);
            setCurrentRepo(null);
            localStorage.removeItem('gk_last_repo');
          }
        } catch (e) {
          console.warn('Failed to validate saved repo:', e);
          setCurrentRepo(null);
          localStorage.removeItem('gk_last_repo');
        }
      }
    };
    validateSavedRepo();
  }, []); // Only run on mount

  useEffect(() => {
    localStorage.setItem('gk_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  // Polling for local dirty status
  // Track previous dirty state and HEAD to detect external changes
  const prevDirtyRef = useRef(false);
  const prevHeadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentRepo?.isLocal) {
        setHasUncommittedChanges(false);
        prevDirtyRef.current = false;
        prevHeadRef.current = null;
        return;
    }

    const checkStatus = async () => {
        const dirty = await gitIsDirty(currentRepo);
        const wasDirty = prevDirtyRef.current;
        prevDirtyRef.current = dirty;
        setHasUncommittedChanges(dirty);

        // Also check if HEAD moved (external commit, checkout, pull, etc.)
        let currentHead: string | null = null;
        try {
            currentHead = await gitResolveRef(currentRepo);
        } catch (e) { console.warn('resolveRef failed:', e); }

        const prevHead = prevHeadRef.current;
        prevHeadRef.current = currentHead;

        // Refresh graph if:
        // 1. Repo went from dirty to clean (external commit/discard)
        // 2. HEAD SHA changed (external commit, pull, checkout, rebase, etc.)
        if ((wasDirty && !dirty) || (prevHead !== null && currentHead !== null && prevHead !== currentHead)) {
            refreshRepoData(false);
        }
    };

    checkStatus(); // Immediate check

    // Use file watcher for efficient change detection (replaces polling)
    const stopWatch = startWatching(currentRepo, (changeType) => {
        // File watcher detected a change - check status
        if (changeType === 'head' || changeType === 'refs' || changeType === 'rebase') {
            // HEAD, refs, or rebase state changed - refresh graph
            refreshRepoData(false);
        } else if (changeType === 'index') {
            // Staging area changed - update dirty status
            checkStatus();
        } else if (changeType === 'fetch') {
            // Fetch completed - refresh to show new remote commits
            refreshRepoData(false);
        }
    });

    // Fallback: Long interval poll for edge cases where watcher might miss changes
    const timer = setInterval(checkStatus, 60000); // 60s fallback poll

    // Also check on window focus (user returns to app)
    const onFocus = () => checkStatus();
    window.addEventListener('focus', onFocus);

    return () => {
        stopWatch(); // Stop file watcher
        clearInterval(timer);
        window.removeEventListener('focus', onFocus);
    }
  }, [currentRepo]);

  // Auto-Fetch using hook
  const { isFetching, setIsFetching, lastFetchTime, setLastFetchTime, fetchNow } = useAutoFetch({
    repo: currentRepo,
    config: aiConfig,
    token: activeProfile?.githubToken || null,
    onFetchComplete: () => {
      refreshRepoData(false);
      setRefreshTrigger(prev => prev + 1);
    }
  });

  // Update ahead/behind when repo changes (not on every commit load)
  useEffect(() => {
    if (!currentRepo?.isLocal) {
      setAheadBehind({ ahead: 0, behind: 0 });
      return;
    }
    const update = async () => {
      try {
        const ab = await getAheadBehind(currentRepo);
        setAheadBehind(ab);
      } catch {
        setAheadBehind({ ahead: 0, behind: 0 });
      }
    };
    update();
  }, [currentRepo]); // Removed commits dependency - only need to check when repo/branch changes

  // Load tags and tag→commit map when repo changes
  const [tagMap, setTagMap] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!currentRepo?.isLocal) { setTags([]); setTagMap(new Map()); return; }
    gitListTags(currentRepo).then(setTags).catch(() => setTags([]));
    gitResolveTagRefs(currentRepo).then(setTagMap).catch(() => setTagMap(new Map()));
  }, [currentRepo]); // Removed commits dependency - tags don't change when loading more commits

  // Load repo files for search
  useEffect(() => {
    if (!currentRepo?.isLocal) { setRepoFiles([]); return; }
    gitListFiles(currentRepo).then(setRepoFiles).catch(() => setRepoFiles([]));
  }, [currentRepo]);

  // Check for large files when repo changes
  useEffect(() => {
    if (!currentRepo?.isLocal) { setLargeFileWarnings([]); return; }
    import('./services/localGitService').then(({ findLargeFiles }) => {
      findLargeFiles(currentRepo, 10).then(setLargeFileWarnings).catch(() => setLargeFileWarnings([]));
    });
  }, [currentRepo]);

  const refreshRepoData = (showLoading = true, append = false) => {
    // Use refs to always read latest state, avoiding stale closures
    const repo = currentRepoRef.current;
    const profile = activeProfileRef.current;
    const page = commitPageRef.current;

    if (repo) {
      // Debounce rapid refresh calls (except for append/pagination)
      const now = Date.now();
      if (!append && now - lastRefreshTimeRef.current < REFRESH_DEBOUNCE_MS) {
        // Clear any pending refresh and schedule a new one
        if (refreshDebounceRef.current) {
          clearTimeout(refreshDebounceRef.current);
        }
        refreshDebounceRef.current = setTimeout(() => {
          refreshDebounceRef.current = null;
          refreshRepoData(showLoading, append);
        }, REFRESH_DEBOUNCE_MS);
        return;
      }
      lastRefreshTimeRef.current = now;

      if (showLoading) setLoadingData(true);
      setError(null);

      // Reset pagination on fresh load (not append)
      if (!append) {
        setCommitPage(1);
        setHasMoreCommits(true);
      }

      // Use requestIdleCallback for non-critical updates
      const runWhenIdle = (fn: () => void) => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(fn, { timeout: 500 });
        } else {
          setTimeout(fn, 100);
        }
      };

      // Update dirty status and remotes in background (non-blocking)
      if (repo.isLocal) {
        runWhenIdle(() => {
          gitIsDirty(repo).then(setHasUncommittedChanges);
          gitListRemotes(repo).then(r => setRemoteCount(r.length)).catch(() => setRemoteCount(0));
        });
      } else {
        setHasUncommittedChanges(false);
        setRemoteCount(-1);
      }

      const token = profile?.githubToken || '';

      const isLocal = repo.isLocal;
      if (!isLocal && !token) {
          setLoadingData(false);
          return;
      }

      // Calculate skip based on page - use smaller initial load for faster first render
      const skip = append ? (page - 1) * COMMITS_PER_PAGE : 0;
      const limit = append ? COMMITS_PER_PAGE : INITIAL_COMMITS_LOAD;
      // For efficient pagination, pass the last commit OID so we don't re-fetch all previous pages
      const lastOid = append && commits.length > 0 ? commits[commits.length - 1].id : undefined;

      // Use fast parallel fetch with pagination
      const fetchPromise = isLocal
        ? Promise.all([
            fetchLocalBranches(repo),
            fetchLocalCommits(repo, repo.default_branch, skip, limit, lastOid)
          ]).then(([branches, commits]) => ({ branches, commits }))
        : Promise.all([
            fetchBranches(token, repo.owner!.login, repo.name),
            fetchCommits(token, repo.owner!.login, repo.name, repo.default_branch, page, limit)
          ]).then(([branches, commits]) => ({ branches, commits }));

      fetchPromise
      .then(async ({ branches: fetchedBranches, commits: fetchedCommits }) => {
        setBranches(fetchedBranches);

        // Check if there are more commits
        const moreAvailable = fetchedCommits.length === COMMITS_PER_PAGE;
        setHasMoreCommits(moreAvailable);

        // Sync displayed branch name to the actual active branch
        if (isLocal) {
          const activeBranch = fetchedBranches.find(b => b.active);
          if (activeBranch && activeBranch.name !== 'HEAD' && activeBranch.name !== repo.default_branch) {
            activeBranchRef.current = activeBranch.name;
            setCurrentRepo(prev => prev ? ({ ...prev, default_branch: activeBranch.name }) : null);
          }
        }

        // Defer expensive layout processing to keep UI responsive
        runWhenIdle(() => {
          // Augment local commits with avatar if they match current user
          if (repo.isLocal && profile?.githubUser?.avatar_url) {
              fetchedCommits.forEach(c => {
                   const isMe = c.author === profile.gitName ||
                                c.author === profile.githubUser?.login ||
                                c.author === profile.githubUser?.name;
                   if (isMe && !c.avatarUrl) {
                       c.avatarUrl = profile.githubUser.avatar_url;
                   }
              });
          }

          const layoutCommits = processGraphLayout(fetchedCommits);

          // Append or replace commits
          if (append) {
            setCommits(prev => {
              // Use tracked Set for O(1) lookup instead of recreating Set every time
              const newCommits = layoutCommits.filter(c => !commitIdsRef.current.has(c.id));
              newCommits.forEach(c => commitIdsRef.current.add(c.id));
              return [...prev, ...newCommits];
            });
          } else {
            // Reset the tracked set when replacing
            commitIdsRef.current.clear();
            layoutCommits.forEach(c => commitIdsRef.current.add(c.id));
            setCommits(layoutCommits);
          }
        });
      })
      .catch(err => {
          console.error(err);
          if (showLoading) setError(err.message);
      })
      .finally(() => {
        if (showLoading) setLoadingData(false);
        setLoadingMoreCommits(false);
      });
    }
  };

  // Load more commits for lazy loading
  const loadMoreCommits = () => {
    if (!hasMoreCommits || loadingMoreCommits || !currentRepo) return;

    setLoadingMoreCommits(true);
    setCommitPage(prev => prev + 1);
    // refreshRepoData will be triggered by useEffect when commitPage changes
  };

  // Trigger refresh when commitPage changes for loading more commits
  useEffect(() => {
    if (loadingMoreCommits && commitPage > 1) {
      refreshRepoData(false, true);
    }
  }, [commitPage]);

  useEffect(() => {
    // Skip refresh if the only thing that changed was default_branch being synced
    // to the actual active branch (to avoid infinite loop)
    if (currentRepo && activeBranchRef.current && currentRepo.default_branch === activeBranchRef.current) {
      activeBranchRef.current = null;
      return;
    }
    activeBranchRef.current = null;
    refreshRepoData();
  }, [currentRepo, activeProfile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // Ctrl+S - Stash with message
      if (e.ctrlKey && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (currentRepo?.isLocal) {
          triggerPrompt('Stash message (optional):', `WIP on ${currentRepo.default_branch || 'main'}`)
            .then((message) => {
              if (message !== null) {
                performStash(message);
              }
            });
        }
      }

      // Ctrl+K - Open stash list
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (currentRepo?.isLocal) {
          handleOpenStashList();
        }
      }

      // Ctrl+Shift+S - Start squash
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        if (currentRepo?.isLocal) {
          handleStartSquash();
        }
      }

      // Ctrl+Shift+P - Command Palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setShowCommandPalette(true);
      }

      // Ctrl+F - Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setShowSearchPanel(true);
      }

      // Ctrl+` - Toggle Terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setShowTerminal(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentRepo]);

  const handleLogin = (u: User, t: string) => {
      // Check for duplicate account
      if (isDuplicateProfile(u.login)) {
          setAlertDialog({
              isOpen: true,
              title: 'Account Already Exists',
              message: `A profile for GitHub user "${u.login}" already exists. Please use a different account or switch to the existing profile.`,
              type: 'warning'
          });
          return;
      }

      const newProfile = createProfile('Personal', u, t);
      saveProfile(newProfile);
      setActiveProfileId(newProfile.id);
      setActiveProfile(newProfile);
  };
  
  const handleSkipLogin = () => { 
      setSkipLogin(true); 
      const local = createLocalProfile();
      setActiveProfile(local);
  };
  
  const handleLogout = () => {
      setCurrentRepo(null);
      setActiveProfile(null);
      setActiveProfileId('');
      setSkipLogin(false);
      // Clear undo state when logging out
      clearUndo();
      // Clear all stored profile and account data
      clearAllProfileData();
  };

  const handleSwitchProfile = (id: string) => {
      if (!id) {
          setActiveProfile(null);
          setActiveProfileId('');
          setSkipLogin(false);
          return;
      }
      const profiles = getProfiles();
      const target = profiles.find(p => p.id === id);
      if (target) {
          setActiveProfile(target);
          setActiveProfileId(target.id);
          setCurrentRepo(null);
          // Clear undo state when switching profiles
          clearUndo();
      }
  };

  const handlePull = async () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Pull is only implemented for Local Repos in this version.',
          type: 'error'
        });
        return;
      }

      // Show prominent progress indicator
      const pullStartTime = performance.now();
      setIsFetching(true);
      setSyncLoading({ isLoading: true, message: 'Pulling changes from remote...', type: 'pull' });

      // Allow React to render the loading state before starting the async operation
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        // Prepare author info from profile
        const author = activeProfile?.gitName && activeProfile?.gitEmail
          ? { name: activeProfile.gitName, email: activeProfile.gitEmail }
          : undefined;

        // Pull with progress callback
        await gitPull(currentRepo, activeProfile?.githubToken || null, author, (msg) => {
          if (isDebugMode()) console.debug(`[Pull] ${msg}`);
          setSyncLoading(prev => ({ ...prev, message: msg || 'Pulling changes from remote...' }));
        }, { prune: aiConfig.pruneOnFetch });

        const pullDuration = (performance.now() - pullStartTime).toFixed(0);
        if (isDebugMode()) console.debug(`[Pull] Completed in ${pullDuration}ms`);

        setAlertDialog({
          isOpen: true,
          title: 'Pull Successful',
          message: `Changes pulled successfully from remote in ${pullDuration}ms.`,
          type: 'success'
        });

        // Background refresh without blocking UI
        fastBranchRefresh(currentRepo, currentRepo.default_branch)
          .then(({ commits: newCommits, branches: newBranches }) => {
            setBranches(newBranches);

            // Defer expensive layout processing
            const applyLayout = () => {
              const layoutCommits = processGraphLayout(newCommits);
              setCommits(layoutCommits);
            };
            if ('requestIdleCallback' in window) {
              requestIdleCallback(applyLayout, { timeout: 500 });
            } else {
              setTimeout(applyLayout, 100);
            }

            // Update status indicators
            gitIsDirty(currentRepo).then(setHasUncommittedChanges);
            getAheadBehind(currentRepo).then(setAheadBehind);
          })
          .catch(e => console.error('Post-pull refresh failed:', e));
      }
      catch (e) {
        if (e.message && e.message.startsWith('NO_REMOTES_CONFIGURED')) {
          setAlertDialog({
            isOpen: true,
            title: 'No Remotes Configured',
            message: 'This repository has no remotes. Add a remote to pull from.',
            type: 'warning',
            onAddRemote: () => {
              setAlertDialog(null);
              setPendingRemoteAction('pull');
              setShowRemoteManager(true);
            }
          });
        } else {
          setAlertDialog({
            isOpen: true,
            title: 'Pull Failed',
            message: e.message || 'Failed to pull changes.',
            type: 'error'
          });
        }
      } finally {
        setIsFetching(false);
        setSyncLoading({ isLoading: false, message: '', type: null });
        setLastFetchTime(new Date());
      }
  };
  const handlePush = async () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Push is only implemented for Local Repos in this version.',
          type: 'error'
        });
        return;
      }

      // Confirm before push if setting is enabled
      if (aiConfig.confirmBeforePush) {
        const confirmed = await triggerConfirm({
          title: 'Confirm Push',
          message: `Push ${aheadBehind.ahead} commit${aheadBehind.ahead !== 1 ? 's' : ''} to remote?`,
          type: 'info',
          confirmText: 'Push',
          cancelText: 'Cancel'
        });
        if (!confirmed) return;
      }

      // Conflict Prevention: Check if behind remote
      if (aheadBehind.behind > 0) {
        const confirmed = await triggerConfirm({
          title: 'Potential Push Conflict',
          message: `The remote branch has ${aheadBehind.behind} commit${aheadBehind.behind > 1 ? 's' : ''} that you don't have locally.`,
          type: 'warning',
          confirmText: 'Force Push (Dangerous)',
          cancelText: 'Pull First (Recommended)',
          details: 'Pushing now would overwrite the remote commits.\n\nRecommended: Pull the remote changes first to merge them with your work.'
        });

        if (!confirmed) {
          // User chose to pull first
          handlePull();
          return;
        }
        // User confirmed force push - continue with push
      }

      // Show prominent progress indicator
      const pushStartTime = performance.now();
      setIsFetching(true);
      setSyncLoading({ isLoading: true, message: 'Pushing changes to remote...', type: 'push' });

      // Allow React to render the loading state before starting the async operation
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        // Prepare author info from profile
        const author = activeProfile?.gitName && activeProfile?.gitEmail
          ? { name: activeProfile.gitName, email: activeProfile.gitEmail }
          : undefined;

        await gitPush(currentRepo, activeProfile?.githubToken || null, author, (msg) => {
          if (isDebugMode()) console.debug(`[Push] ${msg}`);
          setSyncLoading(prev => ({ ...prev, message: msg || 'Pushing changes to remote...' }));
        });

        const pushDuration = (performance.now() - pushStartTime).toFixed(0);
        if (isDebugMode()) console.debug(`[Push] Completed in ${pushDuration}ms`);

        // Update ahead/behind immediately (fast operation)
        const ab = await getAheadBehind(currentRepo);
        setAheadBehind(ab);

        setAlertDialog({
          isOpen: true,
          title: 'Push Successful',
          message: `Changes pushed successfully to remote in ${pushDuration}ms.`,
          type: 'success'
        });

        // Background refresh to show updated refs
        fastBranchRefresh(currentRepo, currentRepo.default_branch)
          .then(({ commits: newCommits, branches: newBranches }) => {
            setBranches(newBranches);

            const applyLayout = () => {
              const layoutCommits = processGraphLayout(newCommits);
              setCommits(layoutCommits);
            };
            if ('requestIdleCallback' in window) {
              requestIdleCallback(applyLayout, { timeout: 500 });
            } else {
              setTimeout(applyLayout, 100);
            }
          })
          .catch(e => console.error('Post-push refresh failed:', e));
      }
      catch (e) {
        if (e.message && e.message.startsWith('NO_REMOTES_CONFIGURED')) {
          setAlertDialog({
            isOpen: true,
            title: 'No Remotes Configured',
            message: 'This repository has no remotes. Add a remote to push to.',
            type: 'warning',
            onAddRemote: () => {
              setAlertDialog(null);
              setPendingRemoteAction('push');
              setShowRemoteManager(true);
            }
          });
        } else {
          setAlertDialog({
            isOpen: true,
            title: 'Push Failed',
            message: e.message || 'Failed to push changes.',
            type: 'error'
          });
        }
      }
      finally {
        setIsFetching(false);
        setSyncLoading({ isLoading: false, message: '', type: null });
        // Force refresh ahead/behind after push completes (in case of error or success)
        if (currentRepo?.isLocal) {
          getAheadBehind(currentRepo).then(ab => setAheadBehind(ab));
        }
      }
  };
  const handleBranch = async () => {
      if (!currentRepo?.isLocal) {
          return showAlert('Not Available', 'Branching is only available for Local repositories.', 'warning', 'Remote repositories (GitHub) do not support direct branch creation through the UI.');
      }

      // Check if we're in Electron but using browser file handle
      if (isElectron() && currentRepo.handle && typeof currentRepo.handle !== 'string') {
          const message = '⚠️ Wrong Repository Access Method!\n\n' +
              'You are in Electron mode but opened the repository using "Open Local" (Browser API).\n\n' +
              '❌ This limits Git features.\n\n' +
              '✅ SOLUTION:\n' +
              '1. Click the "Repos" button (folder icon) in the toolbar\n' +
              '2. Use "Open System" (middle button with Terminal icon)\n' +
              '3. Select your repository again\n' +
              '4. Then try creating the branch\n\n' +
              'See BRANCH_FIX.md for detailed instructions.';

          const openInstructions = await triggerConfirm({
            title: 'Wrong Repository Access Method',
            message: 'You are in Electron mode but opened the repository using "Open Local" (Browser API). This limits Git features.',
            details: 'SOLUTION:\n1. Click the "Repos" button (folder icon) in the toolbar\n2. Use "Open System" (middle button with Terminal icon)\n3. Select your repository again\n4. Then try creating the branch',
            type: 'warning',
            confirmText: 'Open Instructions',
            cancelText: 'Dismiss',
          });
          if (openInstructions) {
              window.open('BRANCH_FIX.md', '_blank');
          }
          return;
      }

      // Check if we're in browser mode
      if (!isElectron()) {
          showAlert('Browser Mode', 'Branch creation is not available in browser mode.', 'warning', 'Stop the app (Ctrl+C) and run:\nnpm run electron:dev\n\nThen use "Open System" to open your repository.\nSee MODES.md for more information.');
          return;
      }

      const name = await triggerPrompt("Enter new branch name (starts at HEAD):");
      if (!name) return;

      // Validate branch name
      if (!/^[a-zA-Z0-9\-_\/]+$/.test(name)) {
          showAlert('Invalid Name', 'Invalid branch name. Use only letters, numbers, hyphens, underscores, and forward slashes.', 'warning');
          return;
      }

      try {
        setLoadingData(true);

        await createBranch(currentRepo, name);

        // Automatically checkout new branch
        await gitCheckout(currentRepo, name);

        // Update current repo reference
        setCurrentRepo(prev => prev ? ({ ...prev, default_branch: name }) : null);

        refreshRepoData();
      }
      catch (e) {
        console.error('Branch creation error:', e);

        let errorMessage = 'Failed to create branch';
        let suggestion = '';

        if (e.message.includes('not allowed') || e.message.includes('user agent')) {
            errorMessage = 'Branch creation not supported in current environment';
            suggestion = '\n\nThis Git operation requires full filesystem access.\n\nPossible solutions:\n' +
                          '1. Use Electron mode (download the desktop app)\n' +
                          '2. Re-grant file permissions to the directory\n' +
                          '3. Use command line: git branch ' + name;
        } else if (e.message.includes('already exists')) {
            errorMessage = 'Branch already exists';
            suggestion = '\n\nA branch with this name already exists.\nChoose a different name or checkout the existing branch.';
        } else if (e.message.includes('permission') || e.message.includes('Permission')) {
            errorMessage = 'Permission denied';
            suggestion = '\n\nThe application does not have write access to this repository.\n\n' +
                          'Please check file permissions or try reopening the directory.';
        } else {
            suggestion = '\n\nError: ' + e.message;
        }

        showAlert('Branch Error', errorMessage, 'error', suggestion.trim());
      }
      finally {
        setLoadingData(false);
      }
  };
  const handleGitflow = async () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Gitflow is only available for Local Repos.',
          type: 'error'
        });
        return;
      }
      setGitflowDialog({ isOpen: true });
  };

  const executeGitflow = async () => {
      if (!currentRepo?.isLocal) return;
      try {
        setLoadingData(true);
        await gitInitGitflow(currentRepo);
        refreshRepoData();
        setGitflowDialog({ isOpen: false }); // Close dialog on success
        setAlertDialog({
          isOpen: true,
          title: 'Gitflow Initialized',
          message: 'Gitflow has been successfully initialized. A new "develop" branch has been created.',
          type: 'success'
        });
      }
      catch (e) {
        setGitflowDialog({ isOpen: false }); // Close dialog on error
        setAlertDialog({
          isOpen: true,
          title: 'Gitflow Init Failed',
          message: e.message || 'Failed to initialize Gitflow.',
          type: 'error'
        });
      }
      finally {
        setLoadingData(false);
      }
  }

  const handleSwitchBranch = async (branchName: string) => {
    if (!currentRepo) return;

    // Check for uncommitted changes before switching branches
    if (currentRepo.isLocal) {
        try {
            const dirty = await gitIsDirty(currentRepo);
            if (dirty) {
                const proceed = await triggerConfirm({
                    title: 'Uncommitted Changes',
                    message: 'You have uncommitted changes that may be lost or cause conflicts when switching branches.',
                    details: 'You can stash your changes first, or proceed anyway.',
                    type: 'warning',
                    confirmText: 'Switch Anyway',
                    cancelText: 'Cancel',
                });
                if (!proceed) return;
            }
        } catch {
            // If dirty check fails, proceed with checkout
        }
    }

    // Reset pagination when switching branches
    setCommitPage(1);
    setHasMoreCommits(true);

    // For local repos, perform actual checkout
    if (currentRepo.isLocal) {
        const originalBranch = currentRepo.default_branch;
        try {
            // Optimistic UI update - show branch switch immediately
            setCurrentRepo(prev => prev ? ({ ...prev, default_branch: branchName }) : null);

            // Use faster native git checkout (non-blocking for UI)
            await gitCheckout(currentRepo, branchName);

            // Background data refresh - fire and forget with smaller initial load
            Promise.all([
              fetchLocalBranches(currentRepo),
              fetchLocalCommits(currentRepo, branchName, 0, INITIAL_COMMITS_LOAD)
            ]).then(([newBranches, newCommits]) => {
                // Check if more commits available
                const moreAvailable = newCommits.length === INITIAL_COMMITS_LOAD;
                setHasMoreCommits(moreAvailable);

                setBranches(newBranches);

                // Sync displayed branch name to actual active branch
                const activeBranch = newBranches.find(b => b.active);
                if (activeBranch && activeBranch.name !== 'HEAD' && activeBranch.name !== branchName) {
                    setCurrentRepo(prev => prev ? ({ ...prev, default_branch: activeBranch.name }) : null);
                }

                // Defer expensive layout processing
                const applyLayout = () => {
                    const layoutCommits = processGraphLayout(newCommits);

                    // Augment avatars
                    if (activeProfile?.githubUser?.avatar_url) {
                        layoutCommits.forEach(c => {
                            const isMe = c.author === activeProfile.gitName ||
                                         c.author === activeProfile.githubUser?.login ||
                                         c.author === activeProfile.githubUser?.name;
                            if (isMe && !c.avatarUrl) {
                                c.avatarUrl = activeProfile.githubUser.avatar_url;
                            }
                        });
                    }

                    setCommits(layoutCommits);
                };
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(applyLayout, { timeout: 500 });
                } else {
                    setTimeout(applyLayout, 100);
                }

                // Update dirty status in background
                gitIsDirty(currentRepo).then(setHasUncommittedChanges);

            }).catch((e: any) => {
                console.error('Branch refresh failed:', e);
                // Fallback to full refresh on error
                refreshRepoData(false);
            });

        } catch(e: any) {
            // Revert optimistic update on error
            setCurrentRepo(prev => prev ? ({ ...prev, default_branch: originalBranch }) : null);
            setAlertDialog({
              isOpen: true,
              title: 'Checkout Failed',
              message: e.message || 'Failed to checkout branch.',
              type: 'error'
            });
        }
    } else {
        // Remote repo - just update the view
        setCurrentRepo(prev => prev ? ({ ...prev, default_branch: branchName }) : null);
    }
  };

  const handleSelectRun = (run: WorkflowRun) => {
      setSelectedRun(run);
      setViewMode(ViewMode.ACTIONS);
  };

  const handleSelectPR = (pr: PullRequest) => {
      setSelectedPR(pr);
      setViewMode(ViewMode.PULL_REQUEST);
  };

  const handleSelectIssue = (issue: Issue) => {
      setSelectedIssue(issue);
      setViewMode(ViewMode.ISSUE_DETAIL);
  };

  const handleCommitContextMenu = (e: React.MouseEvent, commit: Commit) => {
    e.preventDefault();
    // Close any sidebar context menus (branch/tag)
    setSidebarContextMenuCloseTrigger(prev => prev + 1);
    // Select if not already part of selection
    if (!selectedCommits.find(c => c.id === commit.id)) {
        setSelectedCommits([commit]);
        setSelectedCommit(commit);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'commit', commit });
  };

  const handleWipContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      // Close any sidebar context menus (branch/tag)
      setSidebarContextMenuCloseTrigger(prev => prev + 1);
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'wip' });
  };

  // --- Click Selection Handler ---
  const handleCommitClick = (e: React.MouseEvent, commit: Commit) => {
      e.stopPropagation();
      
      // Multi-select with Ctrl/Cmd
      if (e.ctrlKey || e.metaKey) {
          if (selectedCommits.find(c => c.id === commit.id)) {
              // Deselect
              const newSelection = selectedCommits.filter(c => c.id !== commit.id);
              setSelectedCommits(newSelection);
              // Update panel focus to last one or null
              setSelectedCommit(newSelection.length > 0 ? newSelection[newSelection.length - 1] : null);
              if (newSelection.length === 0) setIsPanelOpen(false);
          } else {
              // Add to selection
              const newSelection = [...selectedCommits, commit];
              setSelectedCommits(newSelection);
              setSelectedCommit(commit);
              setIsPanelOpen(true);
          }
      } else {
          // Single select
          setSelectedCommits([commit]);
          setSelectedCommit(commit);
          setIsPanelOpen(true);
      }
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, commit: Commit) => {
      // If dragging a commit not in selection, select it first (exclusive)
      let drags = selectedCommits;
      if (!selectedCommits.find(c => c.id === commit.id)) {
          drags = [commit];
          setSelectedCommits(drags);
          setSelectedCommit(commit);
      }
      
      e.dataTransfer.setData('commits', JSON.stringify(drags));
      e.dataTransfer.effectAllowed = 'copyMove';
      
      // Create drag image (optional, default usually fine)
  };

  const handleDragOver = (e: React.DragEvent, targetCommit: Commit) => {
      e.preventDefault(); // Allow drop
      if (!currentRepo?.isLocal) {
        setIsValidDropTarget(false);
        return;
      }

      setDragOverCommitId(targetCommit.id);

      // Determine position FIRST (Top/Center/Bottom)
      // Top/Bottom imply reordering (Interactive Rebase)
      // Center implies Cherry-pick onto that commit
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;

      let position: 'top' | 'bottom' | 'center';
      if (y < height * 0.25) position = 'top';
      else if (y > height * 0.75) position = 'bottom';
      else position = 'center';

      setDropPosition(position);

      // Validate using the freshly computed position
      const isValid = validateDropTarget(targetCommit, position);
      setIsValidDropTarget(isValid);
  };

  // Validation function to prevent invalid drops
  const validateDropTarget = (targetCommit: Commit, position: 'top' | 'bottom' | 'center' | null): boolean => {
      if (!selectedCommits || selectedCommits.length === 0) return false;

      const droppedCommits = selectedCommits;

      // Rule 1: Cannot drop root commits
      if (droppedCommits.some(c => c.parents.length === 0)) {
        return false;
      }

      // Rule 2: Protected branch check for reorder operations
      if (position === 'top' || position === 'bottom') {
          const activeBranch = branches.find(b => b.active)?.name || '';
          const protectedBranches = ['main', 'master', 'develop', 'production', 'staging'];
          if (protectedBranches.includes(activeBranch)) {
              return false;
          }
      }

      // Rule 3: Cannot drop commit onto itself
      if (droppedCommits.some(c => c.id === targetCommit.id)) {
          return false;
      }

      // Rule 4: Cannot drop commits before their ancestors (creates circular history)
      // Get all descendant IDs of the target commit
      const getDescendantIds = (commit: Commit): Set<string> => {
          const descendants = new Set<string>();
          const queue = [commit];

          while (queue.length > 0) {
              const current = queue.shift()!;
              if (descendants.has(current.id)) continue;
              descendants.add(current.id);

              // Find children (commits that have this as parent)
              const children = commits.filter(c => c.parents.includes(current.id));
              queue.push(...children);
          }

          return descendants;
      };

      const targetDescendants = getDescendantIds(targetCommit);

      // Check if any dropped commit is a descendant of target
      if (droppedCommits.some(c => targetDescendants.has(c.id))) {
          return false;
      }

      return true;
  };

  const handleDragLeave = () => {
      setDragOverCommitId(null);
      setDropPosition(null);
      setIsValidDropTarget(true);
  };

  const handleDrop = async (e: React.DragEvent, targetCommit: Commit) => {
      e.preventDefault();

      // Capture position before clearing UI state
      const currentDropPosition = dropPosition;

      setDragOverCommitId(null);
      setDropPosition(null);

      if (!currentRepo?.isLocal) return;

      const data = e.dataTransfer.getData('commits');
      if (!data) return;

      // Validate drop target
      if (!validateDropTarget(targetCommit, currentDropPosition)) {
          setAlertDialog({
              isOpen: true,
              title: 'Invalid Drop Target',
              message: 'This commit cannot be dropped here. Possible reasons: dropping onto a protected branch, dropping a root commit, or creating circular history.',
              type: 'warning'
          });
          return;
      }

      try {
          const droppedCommits: Commit[] = JSON.parse(data);

          // Self-drop check
          if (droppedCommits.some(c => c.id === targetCommit.id)) return;

          if (currentDropPosition === 'center') {
              // Feature 1: Cherry-pick onto another commit - Use beautiful dialog
              setCherryPickDialog({
                  isOpen: true,
                  commitCount: droppedCommits.length,
                  targetCommit: targetCommit.shortId,
                  onConfirm: async () => {
                      setLoadingData(true);
                      setCherryPickDialog(null);
                      try {
                          // Get current HEAD before cherry-pick
                          const beforeHEAD = await gitResolveRef(currentRepo);
                          const currentBranch = branches.find(b => b.active)?.name || null;

                          await gitCheckout(currentRepo, targetCommit.id);
                          await gitCherryPickMultiple(currentRepo, droppedCommits);

                          // Get new HEAD after cherry-pick
                          const afterHEAD = await gitResolveRef(currentRepo);

                          refreshRepoData();

                          // Record undo state
                          recordOperation(
                              'cherry-pick',
                              beforeHEAD,
                              afterHEAD,
                              `Cherry-picked ${droppedCommits.length} commit(s) onto ${targetCommit.shortId}`,
                              currentBranch
                          );

                          // Show success alert
                          setAlertDialog({
                              isOpen: true,
                              title: 'Cherry-pick Successful',
                              message: `Successfully cherry-picked ${droppedCommits.length} commit(s) onto ${targetCommit.shortId}.`,
                              details: 'You are now in detached HEAD state.',
                              type: 'success'
                          });
                      } catch (err) {
                          setAlertDialog({
                              isOpen: true,
                              title: 'Cherry-pick Failed',
                              message: err.message,
                              type: 'error'
                          });
                          throw err;
                      } finally {
                          setLoadingData(false);
                      }
                  }
              });
          } else if (currentDropPosition === 'top' || currentDropPosition === 'bottom') {
              // Reorder requires native git (Electron mode)
              if (!isElectron()) {
                  setAlertDialog({
                      isOpen: true,
                      title: 'Not Available',
                      message: 'Commit reordering requires Electron/desktop mode.',
                      details: 'Run the app with: npm run electron:dev\n\nAlternatively, use cherry-pick by dropping onto the center of a commit.',
                      type: 'warning'
                  });
                  return;
              }

              // Check protected branches
              const activeBranch = branches.find(b => b.active)?.name || '';
              const protectedBranches = ['main', 'master', 'develop', 'production', 'staging'];
              if (protectedBranches.includes(activeBranch)) {
                  setAlertDialog({
                      isOpen: true,
                      title: 'Protected Branch',
                      message: `Cannot reorder commits on protected branch "${activeBranch}".`,
                      details: 'Reordering commits rewrites history. This is not allowed on protected branches.\n\nSwitch to a feature branch first.',
                      type: 'warning'
                  });
                  return;
              }

              // Show reorder confirmation dialog
              setReorderDialog({
                  isOpen: true,
                  commitCount: droppedCommits.length,
                  onConfirm: async () => {
                      setLoadingData(true);
                      setReorderDialog(null);
                      try {
                          const beforeHEAD = await gitResolveRef(currentRepo);
                          const currentBranch = branches.find(b => b.active)?.name || null;

                          const position = currentDropPosition === 'top' ? 'before' : 'after';
                          await gitReorderCommits(currentRepo, droppedCommits, targetCommit, position, commits);

                          const afterHEAD = await gitResolveRef(currentRepo);
                          refreshRepoData();

                          recordOperation(
                              'interactive-rebase' as GitOperation,
                              beforeHEAD,
                              afterHEAD,
                              `Reordered ${droppedCommits.length} commit(s) ${position} ${targetCommit.shortId}`,
                              currentBranch
                          );

                          setAlertDialog({
                              isOpen: true,
                              title: 'Reorder Successful',
                              message: `Successfully reordered ${droppedCommits.length} commit(s).`,
                              details: 'Git history has been rewritten. Avoid force-pushing if these commits have been shared.',
                              type: 'success'
                          });
                      } catch (err) {
                          setAlertDialog({
                              isOpen: true,
                              title: 'Reorder Failed',
                              message: err.message,
                              type: 'error'
                          });
                      } finally {
                          setLoadingData(false);
                      }
                  }
              });
          }

      } catch (err) {
          setAlertDialog({
              isOpen: true,
              title: 'Operation Failed',
              message: err.message,
              type: 'error'
          });
      } finally {
          setLoadingData(false);
      }
  };

  // --- Context Menu Actions ---
  const performCherryPick = async () => {
      if (!currentRepo?.isLocal) { showAlert('Not Available', 'Cherry-pick is only implemented for Local Repos.', 'warning'); return; }

      // If multi-select, cherry pick all
      const targets = selectedCommits.length > 0 ? selectedCommits : (contextMenu?.commit ? [contextMenu.commit] : []);
      if (targets.length === 0) return;

      // Get current branch/commit info for the dialog
      const currentBranch = branches.find(b => b.active)?.name || 'HEAD';
      const currentHead = commits[0];

      // Check for potential conflicts BEFORE showing confirmation
      const conflictCheck = await detectPotentialConflicts(currentRepo, targets, currentBranch);

      const showConflictsWarning = () => {
        setConflictWarning({
          isOpen: true,
          files: conflictCheck.conflictingFiles,
          onContinue: () => {
            setConflictWarning({ isOpen: false, files: [] });
            executeCherryPick(targets, currentBranch);
          }
        });
      };

      // Show confirmation dialog (with or without conflict warning)
      const executeCherryPick = async (targets: Commit[], currentBranch: string) => {
        setCherryPickDialog({
          isOpen: true,
          commitCount: targets.length,
          targetCommit: currentHead?.shortId || currentBranch,
          onConfirm: async () => {
            setLoadingData(true);
            setCherryPickDialog(null);
            try {
              // Get current HEAD before cherry-pick
              const beforeHEAD = await gitResolveRef(currentRepo);
              const branchBefore = branches.find(b => b.active)?.name || null;

              await gitCherryPickMultiple(currentRepo, targets);

              // Check if conflicts occurred
              const hasConflictsNow = await hasConflicts(currentRepo);

              if (hasConflictsNow) {
                setLoadingData(false);
                setShowMergeTool(true);
                setAlertDialog({
                  isOpen: true,
                  title: 'Conflicts Detected',
                  message: 'Merge conflicts occurred during cherry-pick. Please resolve them in the Merge Tool.',
                  type: 'info'
                });
                return;
              }

              // Get new HEAD after cherry-pick
              const afterHEAD = await gitResolveRef(currentRepo);

              refreshRepoData();

              // Record undo state
              recordOperation(
                  'cherry-pick',
                  beforeHEAD,
                  afterHEAD,
                  `Cherry-picked ${targets.length} commit(s) onto ${currentBranch}`,
                  branchBefore
              );

              // Show success alert
              setAlertDialog({
                isOpen: true,
                title: 'Cherry-pick Successful',
                message: `Successfully cherry-picked ${targets.length} commit(s) onto ${currentBranch}.`,
                details: targets.length === 1
                  ? `Commit: ${targets[0].shortId} - ${targets[0].message.split('\n')[0]}`
                  : `${targets.length} commits applied to current branch`,
                type: 'success'
              });
            } catch (err) {
              setLoadingData(false);
              setAlertDialog({
                isOpen: true,
                title: 'Cherry-pick Failed',
                message: err.message,
                type: 'error'
              });
              throw err;
            } finally {
              if (!await hasConflicts(currentRepo)) {
                setLoadingData(false);
              }
            }
          }
        });
      };

      // If conflicts detected, show warning first, then confirmation
      if (conflictCheck.hasConflicts) {
        showConflictsWarning();
      } else {
        executeCherryPick(targets, currentBranch);
      }
  };

  const performCherryPickToBranch = async (targetBranch: string) => {
      if (!currentRepo?.isLocal) { showAlert('Not Available', 'Cherry-pick is only implemented for Local Repos.', 'warning'); return; }

      // If multi-select, cherry pick all
      const targets = selectedCommits.length > 0 ? selectedCommits : (contextMenu?.commit ? [contextMenu.commit] : []);
      if (targets.length === 0) return;

      // Show confirmation dialog
      setCherryPickDialog({
          isOpen: true,
          commitCount: targets.length,
          targetCommit: targetBranch,
          onConfirm: async () => {
              setLoadingData(true);
              setCherryPickDialog(null);
              try {
                  // Get current HEAD before cherry-pick
                  const beforeHEAD = await gitResolveRef(currentRepo);
                  const branchBefore = branches.find(b => b.active)?.name || null;

                  // Checkout target branch
                  await gitCheckout(currentRepo, targetBranch);

                  // Cherry-pick commits
                  await gitCherryPickMultiple(currentRepo, targets);

                  // Get new HEAD after cherry-pick
                  const afterHEAD = await gitResolveRef(currentRepo);

                  refreshRepoData();

                  // Record undo state
                  recordOperation(
                      'cherry-pick',
                      beforeHEAD,
                      afterHEAD,
                      `Cherry-picked ${targets.length} commit(s) onto ${targetBranch}`,
                      branchBefore
                  );

                  // Show success alert
                  setAlertDialog({
                      isOpen: true,
                      title: 'Cherry-pick Successful',
                      message: `Successfully cherry-picked ${targets.length} commit(s) onto ${targetBranch}.`,
                      details: targets.length === 1
                          ? `Commit: ${targets[0].shortId} - ${targets[0].message.split('\n')[0]}`
                          : `${targets.length} commits applied to ${targetBranch}`,
                      type: 'success'
                  });
              } catch (err) {
                  if (await hasConflicts(currentRepo)) {
                      setShowMergeTool(true);
                      setAlertDialog({
                          isOpen: true,
                          title: 'Cherry-pick Conflicts',
                          message: `Merge conflicts occurred while cherry-picking onto ${targetBranch}. Resolve them in the Merge Tool.`,
                          type: 'warning'
                      });
                  } else {
                      setAlertDialog({
                          isOpen: true,
                          title: 'Cherry-pick Failed',
                          message: err.message,
                          type: 'error'
                      });
                  }
              } finally {
                  setLoadingData(false);
              }
          }
      });
  };

  const performCreateBranch = async (commit: Commit) => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Branch creation is only available for Local Repos.',
          type: 'error'
        });
        return;
      }

      // Auto-generate branch name from commit SHA
      const defaultBranchName = `branch-${commit.shortId}`;

      try {
          setLoadingData(true);
          await createBranch(currentRepo, defaultBranchName, commit.id);
          refreshRepoData();
          setAlertDialog({
            isOpen: true,
            title: 'Branch Created',
            message: `Successfully created branch "${defaultBranchName}" at commit ${commit.shortId}.`,
            details: `The branch has been automatically created with the commit SHA as its name. You can rename it later if needed.`,
            type: 'success'
          });
      } catch (e) {
        setAlertDialog({
          isOpen: true,
          title: 'Branch Creation Failed',
          message: e.message || 'Failed to create branch.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  };

  const performCheckout = async (commit: Commit) => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Checkout is only available for Local Repos.',
          type: 'error'
        });
        return;
      }

      // Get current branch name to show in message
      const currentBranch = branches.find(b => b.active)?.name || 'current branch';

      setCheckoutDialog({
        isOpen: true,
        commit: commit,
        currentBranch: currentBranch
      });
  };

  const executeCheckout = async () => {
      if (!currentRepo?.isLocal || !checkoutDialog.commit) return;

      setCheckoutDialog({ isOpen: false, commit: null, currentBranch: '' });

      try {
        setLoadingData(true);
        await gitCheckout(currentRepo, checkoutDialog.commit.id);
        refreshRepoData();

        // Show success message
        setAlertDialog({
          isOpen: true,
          title: 'Checked Out Commit',
          message: `Successfully checked out commit ${checkoutDialog.commit.shortId}.`,
          details: `You are now in detached HEAD state.\n\nSelect a branch from the sidebar to return to a normal branch.`,
          type: 'success'
        });
      } catch (e) {
        setAlertDialog({
          isOpen: true,
          title: 'Checkout Failed',
          message: e.message || 'Failed to checkout commit.',
          type: 'error'
        });
      } finally {
        setLoadingData(false);
      }
  };

  const performStageAll = async () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Stage is only available for Local Repos.',
          type: 'error'
        });
        return;
      }
      try {
        setLoadingData(true);
        await gitStageAll(currentRepo);
        refreshRepoData();
        setAlertDialog({
          isOpen: true,
          title: 'All Files Staged',
          message: 'All uncommitted changes have been staged.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Stage Failed',
          message: e.message || 'Failed to stage files.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const performUnstageAll = async () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Unstage is only available for Local Repos.',
          type: 'error'
        });
        return;
      }
      try {
        setLoadingData(true);
        await gitUnstageAll(currentRepo);
        refreshRepoData();
        setAlertDialog({
          isOpen: true,
          title: 'All Files Unstaged',
          message: 'All staged files have been unstaged.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Unstage Failed',
          message: e.message || 'Failed to unstage files.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const performDiscardAll = async () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Discard changes is only available for Local Repos.',
          type: 'error'
        });
        return;
      }
      setDiscardAllDialog({ isOpen: true });
  };

  const executeDiscardAll = async () => {
      if (!currentRepo?.isLocal) return;
      try {
        setLoadingData(true);
        await gitDiscardAll(currentRepo);
        refreshRepoData();

        setAlertDialog({
          isOpen: true,
          title: 'Changes Discarded',
          message: 'All uncommitted changes have been discarded.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Discard Failed',
          message: e.message || 'Failed to discard changes.',
          type: 'error'
        });
      }
      finally {
        setLoadingData(false);
      }
  }

  const performStash = async (message?: string) => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Stash is only available for Local Repos.',
          type: 'error'
        });
        return;
      }
      try {
        setLoadingData(true);
        const author = {
          name: activeProfile?.gitName || activeProfile?.name || 'User',
          email: activeProfile?.gitEmail || 'user@local'
        };
        await gitStash(currentRepo, message || '', author);
        await loadStashes();
        refreshRepoData();

        setAlertDialog({
          isOpen: true,
          title: 'Changes Stashed',
          message: 'All uncommitted changes have been stashed.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Stash Failed',
          message: e.message || 'Failed to stash changes.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const loadStashes = async () => {
      if (!currentRepo?.isLocal) {
        setStashes([]);
        return;
      }
      try {
        const stashList = await fetchStashes(currentRepo);
        setStashes(stashList);
      } catch (e) {
        console.error('Failed to load stashes:', e);
        setStashes([]);
      }
  }

  const handleStashApply = async (stashId: string) => {
      if (!currentRepo?.isLocal) return;
      try {
        setLoadingData(true);
        await gitStashApply(currentRepo, stashId);
        await loadStashes();
        refreshRepoData();
        setAlertDialog({
          isOpen: true,
          title: 'Stash Applied',
          message: 'The stash has been applied to your working directory.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Apply Failed',
          message: e.message || 'Failed to apply stash.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const handleStashPop = async (stashId: string) => {
      if (!currentRepo?.isLocal) return;
      try {
        setLoadingData(true);
        await gitStashPop(currentRepo, stashId);
        await loadStashes();
        refreshRepoData();
        setAlertDialog({
          isOpen: true,
          title: 'Stash Popped',
          message: 'The stash has been applied and removed from the list.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Pop Failed',
          message: e.message || 'Failed to pop stash.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const handleStashDrop = async (stashId: string) => {
      if (!currentRepo?.isLocal) return;
      try {
        setLoadingData(true);
        await gitStashDrop(currentRepo, stashId);
        await loadStashes();
        setAlertDialog({
          isOpen: true,
          title: 'Stash Dropped',
          message: 'The stash has been removed from the list.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Drop Failed',
          message: e.message || 'Failed to drop stash.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const handleOpenStashList = () => {
      loadStashes();
      setShowStashPanel(true);
  }

  // Auto-load stashes when currentRepo changes
  useEffect(() => {
      if (currentRepo?.isLocal) {
          loadStashes();
      } else {
          setStashes([]);
      }
  }, [currentRepo]);

  const handleUnstash = async () => {
      if (!currentRepo?.isLocal) return;

      try {
        setLoadingData(true);
        // Load stashes to check if there are any
        const stashList = await fetchStashes(currentRepo);

        if (stashList.length === 0) {
          setAlertDialog({
            isOpen: true,
            title: 'No Stashes',
            message: 'There are no stashes to apply. Stash some changes first.',
            type: 'error'
          });
          return;
        }

        // Apply the most recent stash (stash@{0})
        await gitStashPop(currentRepo, 'stash@{0}');
        await loadStashes();
        refreshRepoData();

        setAlertDialog({
          isOpen: true,
          title: 'Unstash Complete',
          message: 'The most recent stash has been applied to your working directory.',
          type: 'success'
        });
      }
      catch(e: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Unstash Failed',
          message: e.message || 'Failed to apply stash.',
          type: 'error'
        });
      }
      finally { setLoadingData(false); }
  }

  const handleStartSquash = () => {
      if (!currentRepo?.isLocal) {
        setAlertDialog({
          isOpen: true,
          title: 'Not Supported',
          message: 'Squash is only available for Local Repos.',
          type: 'error'
        });
        return;
      }

      // Use selected commits if 2 or more are selected, otherwise use last 3
      let commitsToSquash = selectedCommits.length >= 2 ? selectedCommits : commits.slice(0, 3);

      if (commitsToSquash.length < 2) {
        setAlertDialog({
          isOpen: true,
          title: 'Cannot Squash',
          message: 'Need at least 2 commits to squash.',
          type: 'error'
        });
        return;
      }

      // Check for merge commits in selection
      const hasMergeCommits = commitsToSquash.some(c => c.parents && c.parents.length > 1);
      if (hasMergeCommits) {
        setAlertDialog({
          isOpen: true,
          title: 'Cannot Squash Merge Commits',
          message: 'One or more selected commits are merge commits. Squashing merge commits is not recommended as it loses branch history.',
          type: 'error'
        });
        return;
      }

      // Check if commits are in a linear sequence (no gaps)
      const sortedIndices = commitsToSquash
        .map(c => commits.findIndex(original => original.id === c.id))
        .sort((a, b) => a - b);

      // Check if all commits were found
      if (sortedIndices.some(index => index === -1)) {
        setAlertDialog({
          isOpen: true,
          title: 'Cannot Squash',
          message: 'One or more selected commits could not be found in the commit list.',
          type: 'error'
        });
        return;
      }

      // Check if there are gaps in the sequence
      const hasGaps = sortedIndices.some((index, i) => {
        if (i === 0) return false;
        return index !== sortedIndices[i - 1] + 1;
      });

      if (hasGaps) {
        setAlertDialog({
          isOpen: true,
          title: 'Cannot Squash Non-Sequential Commits',
          message: 'Selected commits are not in a continuous sequence. Please select adjacent commits to squash.',
          type: 'error'
        });
        return;
      }

      // Check if commits point to different trees (have actual changes)
      // If all commits have the same tree ID, there's nothing to squash
      const treeIds = new Set(commitsToSquash.map(c => c.treeId || c.sha));
      if (treeIds.size === 1 && commitsToSquash.length > 1) {
        const commitInfo = commitsToSquash.map(c => `${c.shortId} (tree: ${c.treeId ? c.treeId.substring(0, 7) : 'N/A'})`).join(', ');
        setAlertDialog({
          isOpen: true,
          title: 'Cannot Squash Identical Commits',
          message: 'These commits point to the same tree state. There are no changes to squash.',
          details: `Commits: ${commitInfo}\n\nThis can happen if:\n- You cherry-picked the same commit multiple times\n- The commits have identical file contents\n- One commit is already included in another`,
          type: 'error'
        });
        return;
      }

      setSelectedForSquash(commitsToSquash);
      setShowSquashDialog(true);
  }

  const handleSquashCommits = async (message: string) => {
      if (!currentRepo?.isLocal) return;

      try {
        setLoadingData(true);
        const commitIds = selectedForSquash.map(c => c.id);
        const author = {
          name: activeProfile?.gitName || activeProfile?.name || 'User',
          email: activeProfile?.gitEmail || 'user@local'
        };

        // Save state before squash for undo
        const beforeHEAD = await gitResolveRef(currentRepo);
        const currentBranchName = branches.find(b => b.active)?.name || null;

        await gitSquashCommits(currentRepo, commitIds, message, author);

        // Get new state after squash
        const afterHEAD = await gitResolveRef(currentRepo);

        // Close dialog and clean up state
        setShowSquashDialog(false);
        setSelectedForSquash([]);
        refreshRepoData();

        // Record undo state
        recordOperation(
            'squash',
            beforeHEAD,
            afterHEAD,
            `Squashed ${commitIds.length} commits into one`,
            currentBranchName
        );

        setAlertDialog({
          isOpen: true,
          title: 'Commits Squashed',
          message: `Successfully squashed ${commitIds.length} commits into one.`,
          type: 'success'
        });
      }
      catch(e: any) {
        // Still close the dialog even on error
        setShowSquashDialog(false);
        setSelectedForSquash([]);

        setAlertDialog({
          isOpen: true,
          title: 'Squash Failed',
          message: e.message || 'Failed to squash commits.',
          type: 'error'
        });
      }
      finally {
        setLoadingData(false);
      }
  }

  // --- Interactive Rebase Handler ---
  const handleInteractiveRebase = async (rebaseCommits: RebaseCommit[]) => {
    if (!currentRepo?.isLocal) return;

    const dir = currentRepo.path || (typeof currentRepo.handle === 'string' ? currentRepo.handle : null);
    let currentBranchName: string | null = null;

    try {
      setLoadingData(true);

      if (!dir) {
        throw new Error('Repository path not found');
      }

      // Save state before rebase for undo
      const beforeHEAD = await gitResolveRef(currentRepo);

      // Get current branch name using git directly (not from React state which may have "HEAD")
      try {
        currentBranchName = safeGitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
      } catch (e) {
        currentBranchName = null;
      }

      if (!currentBranchName || currentBranchName === 'HEAD') {
        throw new Error('Cannot rebase in detached HEAD state. Please checkout a branch first.');
      }

      // Filter out dropped commits
      const commitsToKeep = rebaseCommits.filter(c => c.action !== 'drop');

      if (commitsToKeep.length === 0) {
        throw new Error('Cannot drop all commits');
      }

      // Get the parent of the first original commit (we'll rebase onto this)
      const firstOriginalCommit = rebaseCommits[0];
      const parentCommit = firstOriginalCommit.parents?.[0];

      if (!parentCommit) {
        throw new Error('Cannot rebase root commits');
      }

      // Setup git environment variables for author/committer
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: activeProfile?.gitName || 'User',
        GIT_AUTHOR_EMAIL: activeProfile?.gitEmail || 'user@example.com',
        GIT_COMMITTER_NAME: activeProfile?.gitName || 'User',
        GIT_COMMITTER_EMAIL: activeProfile?.gitEmail || 'user@example.com'
      };

      // Check for and abort any ongoing git operations
      try {
        // Check if there's a cherry-pick in progress
        const cherryPickHead = `${dir}/.git/sequencer/todo`;
        if (require('fs').existsSync(cherryPickHead)) {
          safeGitExec(['cherry-pick', '--abort'], dir);
        }
      } catch (e) { console.warn('cherry-pick abort failed:', e); }

      try {
        // Check if there's a rebase in progress
        const rebaseDir = `${dir}/.git/rebase-merge`;
        const rebaseApplyDir = `${dir}/.git/rebase-apply`;
        if (require('fs').existsSync(rebaseDir) || require('fs').existsSync(rebaseApplyDir)) {
          safeGitExec(['rebase', '--abort'], dir);
        }
      } catch (e) { console.warn('rebase abort failed:', e); }

      try {
        // Check if there's a merge in progress
        const mergeHead = `${dir}/.git/MERGE_HEAD`;
        if (require('fs').existsSync(mergeHead)) {
          safeGitExec(['merge', '--abort'], dir);
        }
      } catch (e) { console.warn('merge abort failed:', e); }

      try {
        // Check if there's a revert in progress
        const revertHead = `${dir}/.git/REVERT_HEAD`;
        if (require('fs').existsSync(revertHead)) {
          safeGitExec(['revert', '--abort'], dir);
        }
      } catch (e) { console.warn('revert abort failed:', e); }

      // Reset any staged changes
      try {
        safeGitExec(['reset', '--hard'], dir);
      } catch (e) { console.warn('git reset --hard failed:', e); }

      // Checkout the parent commit (detached HEAD)
      // SECURITY: Validate parentCommit is a valid git ref
      if (!isValidGitRef(parentCommit)) {
        throw new Error('Invalid parent commit reference');
      }
      try {
        safeGitExec(['checkout', parentCommit], dir, gitEnv);
      } catch (e) {
        const stderr = e.stderr?.toString() || e.message || 'Unknown error';
        throw new Error(`Failed to checkout parent commit: ${stderr}`);
      }

      // Process commits in the NEW order
      for (let i = 0; i < rebaseCommits.length; i++) {
        const commit = rebaseCommits[i];

        if (commit.action === 'drop') {
          continue; // Skip dropped commits
        }

        const commitSha = commit.id;

        // Helper function to check if cherry-pick caused conflicts
        const hasConflicts = () => {
          try {
            // Check for CHERRY_PICK_HEAD which indicates cherry-pick in progress
            const cpHead = `${dir}/.git/CHERRY_PICK_HEAD`;
            return require('fs').existsSync(cpHead);
          } catch (e) { console.warn('conflict check failed:', e); return false; }
        };

        // SECURITY: Validate commit SHA
        if (!isValidGitRef(commitSha)) {
          throw new Error(`Invalid commit reference: ${commitSha.substring(0, 7)}`);
        }

        if (commit.action === 'squash' && i > 0) {
          // For squash: cherry-pick and squash into previous
          try {
            safeGitExec(['cherry-pick', commitSha], dir, gitEnv);
          } catch (e) {
            // Check if it's a conflict
            if (hasConflicts()) {
              // Save rebase state and show conflict message
              setRebaseInProgress({
                originalBranch: currentBranchName,
                parentCommit,
                remainingCommits: rebaseCommits.slice(i),
                currentIndex: i
              });
              setShowMergeTool(true);
              setAlertDialog({
                isOpen: true,
                title: 'Rebase Paused - Conflicts Detected',
                message: `Conflicts occurred while applying ${commitSha.substring(0, 7)}. Resolve the conflicts in the merge tool, then click "Continue Rebase" to proceed.`,
                type: 'warning'
              });
              return; // Exit without completing - we'll resume later
            }
            const stderr = e.stderr?.toString() || e.message || 'Unknown error';
            throw new Error(`Cherry-pick failed for ${commitSha.substring(0, 7)}: ${stderr}`);
          }
          try {
            safeGitExec(['reset', '--soft', 'HEAD~2'], dir, gitEnv);
          } catch (e) {
            const stderr = e.stderr?.toString() || e.message || 'Unknown error';
            throw new Error(`Squash reset failed: ${stderr}`);
          }
          try {
            safeGitExec(['commit', '-m', commit.message || 'Squashed commit'], dir, gitEnv);
          } catch (e) {
            const stderr = e.stderr?.toString() || e.message || 'Unknown error';
            throw new Error(`Squash commit failed: ${stderr}`);
          }
        } else if (commit.action === 'reword' && commit.newMessage) {
          // For reword: cherry-pick and amend with new message
          try {
            safeGitExec(['cherry-pick', commitSha], dir, gitEnv);
          } catch (e) {
            // Check if it's a conflict
            if (hasConflicts()) {
              setRebaseInProgress({
                originalBranch: currentBranchName,
                parentCommit,
                remainingCommits: rebaseCommits.slice(i),
                currentIndex: i
              });
              setShowMergeTool(true);
              setAlertDialog({
                isOpen: true,
                title: 'Rebase Paused - Conflicts Detected',
                message: `Conflicts occurred while applying ${commitSha.substring(0, 7)}. Resolve the conflicts in the merge tool, then click "Continue Rebase" to proceed.`,
                type: 'warning'
              });
              return;
            }
            const stderr = e.stderr?.toString() || e.message || 'Unknown error';
            throw new Error(`Cherry-pick failed for ${commitSha.substring(0, 7)}: ${stderr}`);
          }
          try {
            safeGitExec(['commit', '--amend', '-m', commit.newMessage], dir, gitEnv);
          } catch (e) {
            const stderr = e.stderr?.toString() || e.message || 'Unknown error';
            throw new Error(`Reword commit failed: ${stderr}`);
          }
        } else {
          // For pick: just cherry-pick
          try {
            safeGitExec(['cherry-pick', commitSha], dir, gitEnv);
          } catch (e) {
            // Check if it's a conflict
            if (hasConflicts()) {
              setRebaseInProgress({
                originalBranch: currentBranchName,
                parentCommit,
                remainingCommits: rebaseCommits.slice(i),
                currentIndex: i
              });
              setShowMergeTool(true);
              setAlertDialog({
                isOpen: true,
                title: 'Rebase Paused - Conflicts Detected',
                message: `Conflicts occurred while applying ${commitSha.substring(0, 7)}. Resolve the conflicts in the merge tool, then click "Continue Rebase" to proceed.`,
                type: 'warning'
              });
              return;
            }
            const stderr = e.stderr?.toString() || e.message || 'Unknown error';
            throw new Error(`Cherry-pick failed for ${commitSha.substring(0, 7)}: ${stderr}`);
          }
        }
      }

      // Move the branch to the new HEAD
      // SECURITY: Validate branch name
      if (!isValidGitRef(currentBranchName)) {
        throw new Error('Invalid branch name');
      }
      try {
        safeGitExec(['checkout', '-B', currentBranchName], dir, gitEnv);
      } catch (e) {
        const stderr = e.stderr?.toString() || e.message || 'Unknown error';
        throw new Error(`Failed to move branch to new HEAD: ${stderr}`);
      }


      // Get new state after rebase
      const afterHEAD = await gitResolveRef(currentRepo);

      // Clear selected commits
      setSelectedCommits([]);

      await refreshRepoData();

      // Record undo state
      recordOperation(
        'interactive-rebase',
        beforeHEAD,
        afterHEAD,
        `Interactive rebase with ${rebaseCommits.length} commits`,
        currentBranchName
      );

      setAlertDialog({
        isOpen: true,
        title: 'Interactive Rebase Complete',
        message: `Successfully rebased ${rebaseCommits.length} commits.`,
        type: 'success'
      });
    } catch (error) {
      // Try to recover by going back to the original branch
      if (dir && currentBranchName && currentBranchName !== 'HEAD' && isValidGitRef(currentBranchName)) {
        try {
          safeGitExec(['cherry-pick', '--abort'], dir);
        } catch { /* ignore */ }
        try {
          safeGitExec(['checkout', currentBranchName], dir);
        } catch {
          console.warn('Recovery: failed to checkout original branch', currentBranchName);
        }
      }

      setAlertDialog({
        isOpen: true,
        title: 'Rebase Failed',
        message: error.message || 'Failed to perform interactive rebase.',
        type: 'error'
      });
    } finally {
      setLoadingData(false);
    }
  };

  // --- Continue Rebase Handler (after conflict resolution) ---
  const handleContinueRebase = async () => {
    if (!currentRepo?.isLocal || !rebaseInProgress) return;

    try {
      setLoadingData(true);

      const dir = currentRepo.path || (typeof currentRepo.handle === 'string' ? currentRepo.handle : null);

      if (!dir) {
        throw new Error('Repository path not found');
      }

      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: activeProfile?.gitName || 'User',
        GIT_AUTHOR_EMAIL: activeProfile?.gitEmail || 'user@example.com',
        GIT_COMMITTER_NAME: activeProfile?.gitName || 'User',
        GIT_COMMITTER_EMAIL: activeProfile?.gitEmail || 'user@example.com'
      };

      // First, check if we're in a cherry-pick state and continue it
      const cpHead = `${dir}/.git/CHERRY_PICK_HEAD`;
      if (require('fs').existsSync(cpHead)) {
        // Stage all resolved files
        safeGitExec(['add', '-A'], dir);
        // Continue the cherry-pick
        try {
          safeGitExec(['cherry-pick', '--continue'], dir, gitEnv);
        } catch (cpError) {
          const cpStderr = (cpError.stderr?.toString() || cpError.message || '').toLowerCase();
          if (cpStderr.includes('allow-empty') || cpStderr.includes('nothing to commit') || cpStderr.includes('empty')) {
            // Show empty cherry-pick dialog and pause
            const currentCommitSha = rebaseInProgress.remainingCommits[0]?.id || 'unknown';
            setEmptyCherryPickDialog({
              isOpen: true,
              commitSha: currentCommitSha
            });
            setLoadingData(false);
            return;
          }
          throw cpError;
        }
      }

      // Continue with remaining commits
      const { remainingCommits, originalBranch } = rebaseInProgress;

      // Process remaining commits (skip the first one since we just finished it)
      for (let i = 1; i < remainingCommits.length; i++) {
        const commit = remainingCommits[i];

        if (commit.action === 'drop') {
          continue;
        }

        const commitSha = commit.id;

        const hasConflicts = () => {
          try {
            const cpHead = `${dir}/.git/CHERRY_PICK_HEAD`;
            return require('fs').existsSync(cpHead);
          } catch (e) { console.warn('conflict check failed:', e); return false; }
        };

        // SECURITY: Validate commit SHA
        if (!isValidGitRef(commitSha)) {
          throw new Error(`Invalid commit reference: ${commitSha.substring(0, 7)}`);
        }

        if (commit.action === 'squash') {
          try {
            safeGitExec(['cherry-pick', commitSha], dir, gitEnv);
          } catch (e) {
            if (hasConflicts()) {
              setRebaseInProgress({
                ...rebaseInProgress,
                remainingCommits: remainingCommits.slice(i),
                currentIndex: rebaseInProgress.currentIndex + i
              });
              setShowMergeTool(true);
              setAlertDialog({
                isOpen: true,
                title: 'Rebase Paused - More Conflicts',
                message: `More conflicts while applying ${commitSha.substring(0, 7)}. Resolve and click "Continue Rebase".`,
                type: 'warning'
              });
              return;
            }
            throw e;
          }
          try {
            safeGitExec(['reset', '--soft', 'HEAD~2'], dir, gitEnv);
          } catch (e) {
            throw new Error(`Squash reset failed: ${e.stderr?.toString() || e.message}`);
          }
          try {
            safeGitExec(['commit', '-m', commit.message || 'Squashed commit'], dir, gitEnv);
          } catch (e) {
            throw new Error(`Squash commit failed: ${e.stderr?.toString() || e.message}. Changes are staged but not committed.`);
          }
        } else if (commit.action === 'reword' && commit.newMessage) {
          try {
            safeGitExec(['cherry-pick', commitSha], dir, gitEnv);
          } catch (e) {
            if (hasConflicts()) {
              setRebaseInProgress({
                ...rebaseInProgress,
                remainingCommits: remainingCommits.slice(i),
                currentIndex: rebaseInProgress.currentIndex + i
              });
              setShowMergeTool(true);
              setAlertDialog({
                isOpen: true,
                title: 'Rebase Paused - More Conflicts',
                message: `More conflicts while applying ${commitSha.substring(0, 7)}. Resolve and click "Continue Rebase".`,
                type: 'warning'
              });
              return;
            }
            throw e;
          }
          try {
            safeGitExec(['commit', '--amend', '-m', commit.newMessage], dir, gitEnv);
          } catch (e) {
            throw new Error(`Reword amend failed: ${e.stderr?.toString() || e.message}. Cherry-pick succeeded but message was not changed.`);
          }
        } else {
          try {
            safeGitExec(['cherry-pick', commitSha], dir, gitEnv);
          } catch (e) {
            if (hasConflicts()) {
              setRebaseInProgress({
                ...rebaseInProgress,
                remainingCommits: remainingCommits.slice(i),
                currentIndex: rebaseInProgress.currentIndex + i
              });
              setShowMergeTool(true);
              setAlertDialog({
                isOpen: true,
                title: 'Rebase Paused - More Conflicts',
                message: `More conflicts while applying ${commitSha.substring(0, 7)}. Resolve and click "Continue Rebase".`,
                type: 'warning'
              });
              return;
            }
            throw e;
          }
        }
      }

      // Move the branch to the new HEAD
      if (!originalBranch || originalBranch === 'HEAD') {
        throw new Error('Cannot complete rebase: original branch name is unknown. Please manually checkout your branch.');
      }
      // SECURITY: Validate branch name
      if (!isValidGitRef(originalBranch)) {
        throw new Error('Invalid branch name');
      }
      safeGitExec(['checkout', '-B', originalBranch], dir, gitEnv);

      // Clear rebase state
      setRebaseInProgress(null);

      await refreshRepoData();

      setAlertDialog({
        isOpen: true,
        title: 'Interactive Rebase Complete',
        message: 'Successfully completed the rebase after resolving conflicts.',
        type: 'success'
      });
    } catch (error) {
      setAlertDialog({
        isOpen: true,
        title: 'Continue Rebase Failed',
        message: error.message || 'Failed to continue the rebase.',
        type: 'error'
      });
    } finally {
      setLoadingData(false);
    }
  };

  // --- Abort Rebase Handler ---
  const handleAbortRebase = async () => {
    if (!currentRepo?.isLocal || !rebaseInProgress) return;

    try {
      const dir = currentRepo.path || (typeof currentRepo.handle === 'string' ? currentRepo.handle : null);

      if (!dir) return;

      // Abort cherry-pick if in progress
      try {
        safeGitExec(['cherry-pick', '--abort'], dir);
      } catch (e) { console.warn('cherry-pick abort failed:', e); }

      // Go back to original branch
      // SECURITY: Validate branch name
      if (rebaseInProgress.originalBranch && isValidGitRef(rebaseInProgress.originalBranch)) {
        try {
          safeGitExec(['checkout', rebaseInProgress.originalBranch], dir);
        } catch (e) { console.warn('checkout original branch failed:', e); }
      }

      setRebaseInProgress(null);
      setShowMergeTool(false);
      await refreshRepoData();

      setAlertDialog({
        isOpen: true,
        title: 'Rebase Aborted',
        message: 'The rebase has been aborted and the repository restored to its original state.',
        type: 'info'
      });
    } catch (error) {
      setAlertDialog({
        isOpen: true,
        title: 'Abort Failed',
        message: error.message || 'Failed to abort the rebase.',
        type: 'error'
      });
    }
  };

  // --- Empty Cherry-Pick Handlers ---
  const handleEmptyCherryPickSkip = async () => {
    setEmptyCherryPickDialog(null);
    try {
      const dir = currentRepo?.path || (typeof currentRepo?.handle === 'string' ? currentRepo.handle : null);
      if (!dir) return;
      try {
        safeGitExec(['cherry-pick', '--skip'], dir);
      } catch (skipError) {
        try {
          safeGitExec(['reset'], dir);
        } catch (resetError) {
          throw new Error(
            `Failed to skip cherry-pick: ${(skipError as any).message || 'unknown'}. ` +
            `Recovery reset also failed: ${resetError.message || 'unknown'}.`
          );
        }
      }
      // Continue the rebase
      await handleContinueRebase();
    } catch (error) {
      setAlertDialog({
        isOpen: true,
        title: 'Skip Failed',
        message: error.message || 'Failed to skip empty commit.',
        type: 'error'
      });
    }
  };

  const handleEmptyCherryPickAllowEmpty = async () => {
    setEmptyCherryPickDialog(null);
    try {
      const dir = currentRepo?.path || (typeof currentRepo?.handle === 'string' ? currentRepo.handle : null);
      if (!dir) return;

      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: activeProfile?.gitName || 'User',
        GIT_AUTHOR_EMAIL: activeProfile?.gitEmail || 'user@example.com',
        GIT_COMMITTER_NAME: activeProfile?.gitName || 'User',
        GIT_COMMITTER_EMAIL: activeProfile?.gitEmail || 'user@example.com'
      };

      safeGitExec(['commit', '--allow-empty', '-m', 'Empty commit (conflict resolution produced identical content)'], dir, gitEnv);
      // Continue the rebase
      await handleContinueRebase();
    } catch (error) {
      setAlertDialog({
        isOpen: true,
        title: 'Allow Empty Failed',
        message: error.message || 'Failed to create empty commit.',
        type: 'error'
      });
    }
  };

  const handleEmptyCherryPickAbort = async () => {
    setEmptyCherryPickDialog(null);
    await handleAbortRebase();
  };

  // --- Amend Commit Handler ---
  const handleAmendCommit = async () => {
    if (!currentRepo?.isLocal) {
      setAlertDialog({
        isOpen: true,
        title: 'Not Supported',
        message: 'Amend is only available for Local Repos.',
        type: 'error'
      });
      return;
    }

    // Check if repo has commits
    const hasCommits = await gitHasCommits(currentRepo);
    if (!hasCommits) {
      setAlertDialog({
        isOpen: true,
        title: 'Cannot Amend',
        message: 'No commits found in repository. You cannot amend the first commit.',
        type: 'error'
      });
      return;
    }

    // Get last commit message (commits are ordered newest-first)
    const lastCommit = commits[0];
    if (!lastCommit) return;

    setAmendDialog({
      isOpen: true,
      commitMessage: lastCommit.message
    });
  };

  const executeAmend = async () => {
    if (!currentRepo?.isLocal || !amendDialog.commitMessage.trim()) return;

    setLoadingData(true);
    try {
      await gitAmend(currentRepo, amendDialog.commitMessage.trim());

      setAmendDialog({ isOpen: false, commitMessage: '' });
      refreshRepoData();

      setAlertDialog({
        isOpen: true,
        title: 'Commit Amended',
        message: 'Successfully amended the last commit.',
        details: 'The commit message has been updated. If there were staged changes, they were included in the amended commit.',
        type: 'success'
      });
    } catch (e) {
      setAlertDialog({
        isOpen: true,
        title: 'Amend Failed',
        message: e.message,
        type: 'error'
      });
    } finally {
      setLoadingData(false);
    }
  };

  // --- Undo Commit Handler ---
  const handleUndoCommit = async () => {
    if (!currentRepo?.isLocal) {
      setAlertDialog({
        isOpen: true,
        title: 'Not Supported',
        message: 'Undo is only available for Local Repos.',
        type: 'error'
      });
      return;
    }

    // Check if repo has commits
    const hasCommits = await gitHasCommits(currentRepo);
    if (!hasCommits) {
      setAlertDialog({
        isOpen: true,
        title: 'Cannot Undo',
        message: 'No commits found in repository.',
        type: 'error'
      });
      return;
    }

    setUndoCommitDialog({ isOpen: true });
  };

  const executeUndoCommit = async (keepChanges: boolean) => {
    if (!currentRepo?.isLocal) return;

    setUndoCommitDialog({ isOpen: false });
    setLoadingData(true);

    try {
      await gitUndoCommit(currentRepo, keepChanges);
      refreshRepoData();

      setAlertDialog({
        isOpen: true,
        title: 'Commit Undone',
        message: keepChanges
          ? 'Successfully undid the last commit. Changes are kept staged.'
          : 'Successfully undid the last commit and discarded all changes.',
        details: keepChanges
          ? 'The commit was removed, but all changes from that commit are now staged.'
          : '⚠️ This action cannot be undone. All changes from the last commit have been permanently discarded.',
        type: 'success'
      });
    } catch (e) {
      setAlertDialog({
        isOpen: true,
        title: 'Undo Failed',
        message: e.message,
        type: 'error'
      });
    } finally {
      setLoadingData(false);
    }
  };

  // --- Revert Commit Handler ---
  const handleRevertCommit = (commit: Commit) => {
    if (!currentRepo?.isLocal) {
      setAlertDialog({
        isOpen: true,
        title: 'Not Supported',
        message: 'Revert is only available for Local Repos.',
        type: 'error'
      });
      return;
    }

    setRevertDialog({
      isOpen: true,
      commit: commit
    });
  };

  const executeRevert = async () => {
    if (!currentRepo?.isLocal || !revertDialog.commit) return;

    setRevertDialog({ isOpen: false, commit: null });
    setLoadingData(true);

    try {
      const author = {
        name: activeProfile?.gitName || activeProfile?.name || 'User',
        email: activeProfile?.gitEmail || 'user@local'
      };

      await gitRevert(currentRepo, revertDialog.commit.id, author);
      refreshRepoData();

      setAlertDialog({
        isOpen: true,
        title: 'Commit Reverted',
        message: `Successfully reverted commit ${revertDialog.commit.shortId}.`,
        details: `A new commit has been created that undoes the changes from "${revertDialog.commit.message.split('\n')[0]}".`,
        type: 'success'
      });
    } catch (e) {
      if (e.message === 'REVERT_CONFLICTS') {
        // Conflicts left in working tree — open the merge tool directly
        setShowMergeTool(true);
      } else {
        setAlertDialog({
          isOpen: true,
          title: 'Revert Failed',
          message: e.message,
          type: 'error'
        });
      }
    } finally {
      setLoadingData(false);
    }
  };

  // --- Tag Creation Handler ---
  const handleCreateTag = async (commit?: Commit) => {
    if (!currentRepo?.isLocal) return;
    const ref = commit?.id || 'HEAD';
    const name = await triggerPrompt('Enter tag name:', '');
    if (!name) return;
    try {
      setLoadingData(true);
      await gitCreateTag(currentRepo, name, ref);
      // Refresh tags immediately so the sidebar and graph update
      const newTags = await gitListTags(currentRepo);
      setTags(newTags);
      const newTagMap = await gitResolveTagRefs(currentRepo);
      setTagMap(newTagMap);
      refreshRepoData();
      setAlertDialog({ isOpen: true, title: 'Tag Created', message: `Tag "${name}" created at ${commit?.shortId || 'HEAD'}.`, type: 'success' });
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Tag Failed', message: e.message, type: 'error' });
    } finally { setLoadingData(false); }
  };

  // --- Reset to Commit Handler ---
  const handleResetToCommit = async (mode: 'soft' | 'mixed' | 'hard') => {
    if (!currentRepo?.isLocal || !contextMenu?.commit) return;
    const commit = contextMenu.commit;

    const modeDescriptions = {
      soft: 'Moves HEAD to this commit. All changes since then will be staged (ready to commit).',
      mixed: 'Moves HEAD to this commit. All changes since then will be unstaged (in your working directory).',
      hard: 'Moves HEAD to this commit. All changes since then will be permanently discarded.'
    };

    const typeMap = { soft: 'info' as const, mixed: 'warning' as const, hard: 'danger' as const };

    const confirmed = await triggerConfirm({
      title: `Reset ${mode.charAt(0).toUpperCase() + mode.slice(1)} to ${commit.shortId}`,
      message: modeDescriptions[mode],
      details: `Commit: ${commit.shortId} - ${commit.message}` +
        (mode === 'hard' ? '\n\nWARNING: This action cannot be undone! All changes will be permanently lost.' : ''),
      type: typeMap[mode],
      confirmText: `Reset ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
    });
    if (!confirmed) return;

    try {
      setLoadingData(true);
      // Record state for undo
      const beforeHEAD = await gitResolveRef(currentRepo);
      const currentBranchName = branches.find(b => b.active)?.name || null;

      await gitReset(currentRepo, commit.id, mode);

      const afterHEAD = await gitResolveRef(currentRepo);

      // Record undo state
      recordOperation(
        'reset',
        beforeHEAD,
        afterHEAD,
        `Reset (${mode}) to ${commit.shortId}`,
        currentBranchName
      );

      // Clear selection and refresh
      setSelectedCommit(null);
      setSelectedCommits([]);
      refreshRepoData();

      const resultDetails = {
        soft: 'Changes from removed commits are now staged.',
        mixed: 'Changes from removed commits are now in your working directory.',
        hard: 'All changes from removed commits have been discarded.'
      };

      setAlertDialog({
        isOpen: true,
        title: `Reset Complete (${mode})`,
        message: `HEAD moved to ${commit.shortId}. ${resultDetails[mode]}`,
        type: mode === 'hard' ? 'warning' : 'success'
      });
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Reset Failed', message: e.message, type: 'error' });
    } finally { setLoadingData(false); }
  };

  // --- Branch Rename Handler ---
  const handleRenameBranch = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    const newName = await triggerPrompt('New branch name:', branchName);
    if (!newName || newName === branchName) return;
    try {
      setLoadingData(true);
      await gitRenameBranch(currentRepo, branchName, newName);
      refreshRepoData();
      setAlertDialog({ isOpen: true, title: 'Branch Renamed', message: `"${branchName}" renamed to "${newName}".`, type: 'success' });
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Rename Failed', message: e.message, type: 'error' });
    } finally { setLoadingData(false); }
  };

  // --- Merge Branch Handler ---
  const handleMergeBranch = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    try {
      setLoadingData(true);
      const author = {
        name: activeProfile?.gitName || activeProfile?.name || 'User',
        email: activeProfile?.githubUser?.email || 'user@example.com'
      };
      await gitMerge(currentRepo, branchName, author);
      refreshRepoData();
      setAlertDialog({ isOpen: true, title: 'Merge Successful', message: `"${branchName}" merged into current branch.`, type: 'success' });
    } catch (e) {
      if (await hasConflicts(currentRepo)) {
        setShowMergeTool(true);
        setAlertDialog({ isOpen: true, title: 'Conflicts Detected', message: 'Merge conflicts occurred. Please resolve them.', type: 'info' });
      } else {
        setAlertDialog({ isOpen: true, title: 'Merge Failed', message: e.message, type: 'error' });
      }
    } finally { setLoadingData(false); }
  };

  // --- Clone Repository Handler ---
  const handleCloneRepo = async (repo: Repository) => {
    if (!repo || repo.isLocal) return;

    try {
      setLoadingData(true);

      // Open directory picker (Electron only)
      const electronAPI = (window as any).electronAPI;
      let selectedPath: string | null = null;

      if (electronAPI && electronAPI.openDirectory) {
        selectedPath = await electronAPI.openDirectory();
      } else {
        const { ipcRenderer } = (window as any).require('electron');
        selectedPath = await ipcRenderer.invoke('dialog:openDirectory');
      }

      if (!selectedPath) {
        setLoadingData(false);
        return;
      }

      const targetDir = `${selectedPath}/${repo.name}`;

      // Show sync loading overlay for clone operation
      setSyncLoading({ isLoading: true, message: `Cloning ${repo.name}...`, type: 'pull' });

      // Allow React to render the loading state before starting the async operation
      await new Promise(resolve => setTimeout(resolve, 50));

      // Import gitClone dynamically
      const { gitClone } = await import('./services/localGitService');
      await gitClone(repo, activeProfile?.githubToken || null, targetDir);

      // Create new Repository object for the cloned repo
      const clonedRepo: Repository = {
        ...repo,
        id: `local-${repo.id}`,
        isLocal: true,
        handle: targetDir
      };

      // Add to current workspace
      try {
        const savedWorkspaces = localStorage.getItem('gk_workspaces');
        if (savedWorkspaces) {
          const workspaces = JSON.parse(savedWorkspaces);
          const activeWorkspaceId = localStorage.getItem('gk_active_workspace') || 'default';
          const updatedWorkspaces = workspaces.map((ws: any) => {
            if (ws.id === activeWorkspaceId) {
              return { ...ws, repos: [clonedRepo, ...ws.repos] };
            }
            return ws;
          });
          localStorage.setItem('gk_workspaces', JSON.stringify(updatedWorkspaces));
        }
      } catch (e) {
        console.warn('Failed to update workspaces in localStorage:', e);
      }

      // Switch to cloned repo
      handleSelectRepo(clonedRepo);

      setAlertDialog({
        isOpen: true,
        title: 'Clone Successful',
        message: `Repository cloned to ${targetDir}`,
        type: 'success'
      });
    } catch (e) {
      setAlertDialog({
        isOpen: true,
        title: 'Clone Failed',
        message: e.message || 'Failed to clone repository.',
        type: 'error'
      });
    } finally {
      setLoadingData(false);
      setSyncLoading({ isLoading: false, message: '', type: null });
    }
  };

  // ==========================================
  // New handlers for gap closure features
  // ==========================================

  // --- Commit Actions ---
  const handleInteractiveRebaseFromCommit = async () => {
    if (!currentRepo?.isLocal || !contextMenu?.commit) return;
    const commit = contextMenu.commit;
    const ok = await triggerConfirm({
      title: 'Interactive Rebase',
      message: `Start interactive rebase from commit ${commit.shortId}?`,
      details: 'This will rebase all commits after this point.',
      type: 'warning',
      confirmText: 'Start Rebase',
    });
    if (!ok) return;
    try {
      await gitRebase(currentRepo, commit.id);
      showAlert('Rebase', 'Rebase completed successfully.', 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Rebase Failed', err.message || 'Unknown error.', 'error');
    }
  };

  const handleDropCommit = async () => {
    if (!currentRepo?.isLocal || !contextMenu?.commit) return;
    const commit = contextMenu.commit;
    const ok = await triggerConfirm({
      title: 'Drop Commit',
      message: `Are you sure you want to drop commit "${commit.message}" (${commit.shortId})?`,
      details: 'This action cannot be easily undone.',
      type: 'danger',
      confirmText: 'Drop Commit',
    });
    if (!ok) return;
    setLoadingData(true);
    try {
      await gitDropCommit(currentRepo, commit.id);
      showAlert('Drop Commit', 'Commit dropped successfully.', 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Drop Failed', err.message || 'Unknown error.', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  const handleGenerateCommitSummary = async () => {
    if (!contextMenu?.commit) return;
    if (!aiConfig.keys[aiConfig.provider]) {
      showAlert('AI Error', `Configure an API key for ${aiConfig.provider} in Settings.`, 'warning');
      return;
    }
    setAiLoading({ isLoading: true, message: 'Generating commit summary...' });
    try {
      const summary = await generateCommitSummary([contextMenu.commit], aiConfig);
      setAlertDialog({
        isOpen: true,
        title: 'AI Commit Summary',
        message: summary,
        type: 'info'
      });
    } catch (err) {
      showAlert('AI Error', err.message || 'Failed to generate summary.', 'error');
    } finally {
      setAiLoading({ isLoading: false, message: '' });
    }
  };

  const handleGenerateChangelogEntry = async () => {
    if (!contextMenu?.commit) return;
    if (!aiConfig.keys[aiConfig.provider]) {
      showAlert('AI Error', `Configure an API key for ${aiConfig.provider} in Settings.`, 'warning');
      return;
    }
    setAiLoading({ isLoading: true, message: 'Generating changelog entry...' });
    try {
      const entry = await generateChangelogEntry([contextMenu.commit], aiConfig);
      setAlertDialog({
        isOpen: true,
        title: 'AI Changelog Entry',
        message: entry,
        type: 'info'
      });
    } catch (err) {
      showAlert('AI Error', err.message || 'Failed to generate changelog.', 'error');
    } finally {
      setAiLoading({ isLoading: false, message: '' });
    }
  };

  const handleRevealInGraph = () => {
    if (!contextMenu?.commit) return;
    navigateToCommit(contextMenu.commit.id);
  };

  // --- Branch Actions ---
  const handleSetUpstream = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    const remoteBranch = await triggerPrompt('Set upstream tracking branch:', `origin/${branchName}`);
    if (!remoteBranch) return;
    try {
      await gitSetUpstream(currentRepo, branchName, 'origin', remoteBranch.replace('origin/', ''));
      showAlert('Upstream Set', `Tracking branch set to ${remoteBranch}`, 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Failed', err.message || 'Unknown error.', 'error');
    }
  };

  const handleResetBranch = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    const targetRef = await triggerPrompt('Reset branch to ref:', 'HEAD');
    if (!targetRef) return;
    const ok = await triggerConfirm({
      title: 'Reset Branch',
      message: `Reset "${branchName}" to "${targetRef}"?`,
      type: 'danger',
      confirmText: 'Reset',
    });
    if (!ok) return;
    setLoadingData(true);
    try {
      await gitResetBranch(currentRepo, branchName, targetRef, 'mixed');
      showAlert('Branch Reset', `Branch "${branchName}" reset to ${targetRef}.`, 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Reset Failed', err.message || 'Unknown error.', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  const handleCompareBranch = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    const currentBranch = branches.find(b => b.active)?.name || 'HEAD';
    try {
      const result = await gitCompareBranches(currentRepo, currentBranch, branchName);
      setAlertDialog({
        isOpen: true,
        title: `Compare: ${currentBranch} vs ${branchName}`,
        message: `Ahead: ${result.ahead.length} commit(s)\nBehind: ${result.behind.length} commit(s)`,
        type: 'info'
      });
    } catch (err) {
      showAlert('Compare Failed', err.message || 'Unknown error.', 'error');
    }
  };

  const handleRebaseBranch = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    const ok = await triggerConfirm({
      title: 'Rebase Branch',
      message: `Rebase "${branchName}" onto the current branch?`,
      type: 'warning',
      confirmText: 'Rebase',
    });
    if (!ok) return;
    setLoadingData(true);
    try {
      await gitRebase(currentRepo, branchName);
      showAlert('Rebase', 'Rebase completed successfully.', 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Rebase Failed', err.message || 'Unknown error.', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  const handleAIExplainBranch = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    if (!aiConfig.keys[aiConfig.provider]) {
      showAlert('AI Error', `Configure an API key for ${aiConfig.provider} in Settings.`, 'warning');
      return;
    }
    setAiLoading({ isLoading: true, message: `Analyzing branch "${branchName}"...` });
    try {
      const explanation = await explainBranchChanges(branchName, commits, aiConfig);
      setAlertDialog({
        isOpen: true,
        title: `AI: Branch "${branchName}"`,
        message: explanation,
        type: 'info'
      });
    } catch (err) {
      showAlert('AI Error', err.message || 'Failed to explain branch.', 'error');
    } finally {
      setAiLoading({ isLoading: false, message: '' });
    }
  };

  const handleAIGeneratePR = async (branchName: string) => {
    if (!currentRepo?.isLocal) return;
    if (!aiConfig.keys[aiConfig.provider]) {
      showAlert('AI Error', `Configure an API key for ${aiConfig.provider} in Settings.`, 'warning');
      return;
    }
    setAiLoading({ isLoading: true, message: 'Generating PR description...' });
    try {
      const { generatePRDescription } = await import('./services/aiService');
      const result = await generatePRDescription(branchName, commits, aiConfig);
      setAlertDialog({
        isOpen: true,
        title: `AI PR Description: ${branchName}`,
        message: `**${result.title}**\n\n${result.body}`,
        type: 'info'
      });
    } catch (err) {
      showAlert('AI Error', err.message || 'Failed to generate PR description.', 'error');
    } finally {
      setAiLoading({ isLoading: false, message: '' });
    }
  };

  // --- Tag Actions ---
  const handleCheckoutTag = async (tagName: string) => {
    if (!currentRepo?.isLocal) return;
    const ok = await triggerConfirm({
      title: 'Checkout Tag',
      message: `Checkout tag "${tagName}"? This will put you in detached HEAD state.`,
      type: 'warning',
      confirmText: 'Checkout',
    });
    if (!ok) return;
    try {
      await gitCheckout(currentRepo, tagName);
      showAlert('Checkout', `Checked out tag "${tagName}".`, 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Checkout Failed', err.message || 'Unknown error.', 'error');
    }
  };

  const handlePushTag = async (tagName: string) => {
    if (!currentRepo?.isLocal) return;
    setSyncLoading({ isLoading: true, message: `Pushing tag "${tagName}" to remote...`, type: 'push' });

    // Allow React to render the loading state before starting the async operation
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      await gitPushTag(currentRepo, tagName, 'origin');
      showAlert('Push Tag', `Tag "${tagName}" pushed to origin.`, 'success');
      refreshRepoData();
    } catch (err) {
      showAlert('Push Failed', err.message || 'Unknown error.', 'error');
    } finally {
      setSyncLoading({ isLoading: false, message: '', type: null });
    }
  };

  const handleCopyTagName = (tagName: string) => {
    navigator.clipboard.writeText(tagName);
    showAlert('Copied', `Tag name "${tagName}" copied to clipboard.`, 'success');
  };

  // --- File Actions ---
  const handleFileOpen = async (filepath: string) => {
    // In Electron, open with system default; in browser, show alert
    if (isElectron()) {
      try {
        const { shell } = (window as any).require('electron');
        shell.openPath(`${currentRepo?.path}/${filepath}`);
      } catch { showAlert('Error', 'Could not open file.', 'error'); }
    } else {
      showAlert('Open File', `File: ${filepath}\n(Open file is only available in the desktop app)`, 'info');
    }
  };

  const handleFileResetToCommit = async (filepath: string) => {
    if (!currentRepo?.isLocal) return;
    const ref = await triggerPrompt('Reset file to ref:', 'HEAD');
    if (!ref) return;
    try {
      const content = await gitGetFileContent(currentRepo, ref, filepath);
      if (content !== null) {
        await gitWriteFile(currentRepo, filepath, content);
        await gitStage(currentRepo, filepath);
        showAlert('Reset File', `File "${filepath}" reset to ${ref}.`, 'success');
        refreshRepoData();
      } else {
        showAlert('Reset Failed', `Could not read file "${filepath}" at ${ref}.`, 'error');
      }
    } catch (err) {
      showAlert('Reset Failed', err.message || 'Unknown error.', 'error');
    }
  };

  const handleAIExplainFile = async (filepath: string) => {
    if (!aiConfig.keys[aiConfig.provider]) {
      showAlert('AI Error', `Configure an API key for ${aiConfig.provider} in Settings.`, 'warning');
      return;
    }
    try {
      const explanation = await explainFileChanges(filepath, [], aiConfig);
      setAlertDialog({
        isOpen: true,
        title: `AI: Changes in ${filepath}`,
        message: explanation,
        type: 'info'
      });
    } catch (err) {
      showAlert('AI Error', err.message || 'Failed to explain file.', 'error');
    }
  };

  const handleAISummarizeFile = async (filepath: string) => {
    if (!aiConfig.keys[aiConfig.provider]) {
      showAlert('AI Error', `Configure an API key for ${aiConfig.provider} in Settings.`, 'warning');
      return;
    }
    try {
      const summary = await summarizeFileHistory(filepath, commits, aiConfig);
      setAlertDialog({
        isOpen: true,
        title: `AI: History of ${filepath}`,
        message: summary,
        type: 'info'
      });
    } catch (err) {
      showAlert('AI Error', err.message || 'Failed to summarize file.', 'error');
    }
  };

  // --- Merge Preview ---
  const handleShowMergePreview = async (sourceBranch: string) => {
    if (!currentRepo?.isLocal) return;
    const targetBranch = branches.find(b => b.active)?.name || 'HEAD';
    try {
      const preview = await generateMergePreview(currentRepo, sourceBranch, targetBranch, commits);
      setMergePreviewData(preview);
      setShowMergePreview(true);
    } catch (err) {
      showAlert('Preview Failed', err.message || 'Unknown error.', 'error');
    }
  };

  // --- Navigate to commit by ID ---
  const navigateToCommit = useCallback((commitId: string) => {
    const commit = commits.find(c => c.id === commitId);
    if (commit) {
      setSelectedCommit(commit);
      setSelectedCommits([commit]);
      setIsPanelOpen(true);
      // Scroll to commit
      const idx = commits.indexOf(commit);
      if (scrollContainerRef.current && idx >= 0) {
        scrollContainerRef.current.scrollTop = idx * ROW_HEIGHT;
      }
    }
  }, [commits]);

  // --- Build Command Palette commands ---
  const paletteCommands = useMemo(() => {
    return createAppCommands({
      onPull: currentRepo?.isLocal ? handlePull : undefined,
      onPush: currentRepo?.isLocal ? handlePush : undefined,
      onBranch: currentRepo?.isLocal ? handleBranch : undefined,
      onStash: currentRepo?.isLocal ? () => performStashWithMessage() : undefined,
      onSettings: () => setShowSettings(true),
      onCheckout: handleSwitchBranch,
      onCommitAmend: currentRepo?.isLocal ? handleAmendCommit : undefined,
      onSquash: currentRepo?.isLocal ? handleStartSquash : undefined,
      onCreateTag: currentRepo?.isLocal ? () => handleCreateTag() : undefined,
      onBlame: currentRepo?.isLocal ? () => {
        const name = prompt('Enter file path for blame:');
        if (name) setBlameView({ filepath: name });
      } : undefined,
      onFileHistory: currentRepo?.isLocal ? () => {
        const name = prompt('Enter file path for history:');
        if (name) setFileHistoryView({ filepath: name });
      } : undefined,
      onSearch: () => setShowSearchPanel(true),
      onRefresh: () => refreshRepoData(),
      onOpenReflogViewer: () => {
        setShowSnapshotsPanel(false);
        setShowSubmodulesPanel(false);
        setShowGitflowPanel(false);
        setShowGraphFilters(false);
        setShowInteractiveRebase(false);
        setShowWorktreesPanel(false);
        setShowReflogViewer(true);
      },
      onOpenGraphFilters: () => {
        setShowReflogViewer(false);
        setShowSnapshotsPanel(false);
        setShowSubmodulesPanel(false);
        setShowGitflowPanel(false);
        setShowInteractiveRebase(false);
        setShowWorktreesPanel(false);
        setShowGraphFilters(true);
      },
      onOpenGitflowPanel: () => {
        setShowReflogViewer(false);
        setShowSnapshotsPanel(false);
        setShowSubmodulesPanel(false);
        setShowGraphFilters(false);
        setShowInteractiveRebase(false);
        setShowWorktreesPanel(false);
        setShowGitflowPanel(true);
      },
      onOpenSnapshotsPanel: () => {
        setShowReflogViewer(false);
        setShowSubmodulesPanel(false);
        setShowGitflowPanel(false);
        setShowGraphFilters(false);
        setShowInteractiveRebase(false);
        setShowWorktreesPanel(false);
        setShowSnapshotsPanel(true);
      },
      onCreateSnapshot: async () => {
        if (currentRepo) {
          try {
            const { createSnapshot } = await import('./services/localGitService');
            await createSnapshot(currentRepo);
            refreshRepoData();
          } catch (e) {
            showAlert('Snapshot Error', e.message, 'error');
          }
        }
      },
      onOpenSubmodulesPanel: () => {
        setShowReflogViewer(false);
        setShowSnapshotsPanel(false);
        setShowGitflowPanel(false);
        setShowGraphFilters(false);
        setShowInteractiveRebase(false);
        setShowWorktreesPanel(false);
        setShowSubmodulesPanel(true);
      },
      onOpenWorktrees: currentRepo?.isLocal ? () => {
        setShowReflogViewer(false);
        setShowSnapshotsPanel(false);
        setShowGitflowPanel(false);
        setShowGraphFilters(false);
        setShowInteractiveRebase(false);
        setShowSubmodulesPanel(false);
        setShowWorktreesPanel(true);
      } : undefined,
      onInteractiveRebase: currentRepo?.isLocal ? () => {
        if (selectedCommits.length >= 2) {
          setShowInteractiveRebase(true);
        } else {
          showAlert('Interactive Rebase', 'Select 2 or more commits first.', 'info');
        }
      } : undefined,
      onCherryPickCommit: currentRepo?.isLocal ? () => {
        if (selectedCommit) {
          performCherryPick();
        } else {
          showAlert('Cherry-pick', 'Select a commit first.', 'info');
        }
      } : undefined,
      onGenerateAICommitMessage: () => {
        // Trigger AI message generation via the commit panel
        showAlert('AI Commit Message', 'Open the commit panel and click "Generate Message with AI".', 'info');
      },
      onCheckForUpdates: async () => {
        try {
          const result = await checkForUpdates(true); // Force check
          if (result.hasUpdate && result.releaseInfo) {
            setUpdateInfo({
              releaseInfo: result.releaseInfo,
              currentVersion: result.currentVersion
            });
            setUpdateDialogOpen(true);
          } else {
            addToast({
              type: 'success',
              title: 'Up to Date',
              message: `You're running the latest version (v${CURRENT_VERSION}).`,
              duration: 4000
            });
          }
        } catch (e: any) {
          addToast({
            type: 'error',
            title: 'Update Check Failed',
            message: e.message || 'Could not check for updates.',
            duration: 5000
          });
        }
      },
      isLocal: !!currentRepo?.isLocal,
      branches: branches,
    });
  }, [currentRepo, branches, selectedCommits, selectedCommit, addToast]);

  const performStashWithMessage = async () => {
      if (!currentRepo?.isLocal) return;
      const msg = await triggerPrompt("Stash message (optional):", "WIP");
      if (msg === null) return;
      try { setLoadingData(true); await gitStash(currentRepo, msg); refreshRepoData(); }
      catch(e:any) { showAlert('Stash Error', e.message, 'error'); } finally { setLoadingData(false); }
  }

  if (!activeProfile && !skipLogin) return <LoginModal onLogin={handleLogin} onSkip={handleSkipLogin} />;
  
  const handleSelectRepo = (repo: Repository | null) => {
    // Clear undo state when switching repos
    if (repo?.id !== currentRepo?.id) {
      clearUndo();
    }
    // Clear parent repo when going back to repo selector
    if (repo === null) {
      setParentRepo(null);
    }
    setCurrentRepo(repo);
  };

  if (!currentRepo) return (
    <>
        <RepoSelector
            user={activeProfile?.githubUser || null}
            token={activeProfile?.githubToken || ''}
            onSelect={handleSelectRepo}
            onLogout={handleLogout}
            onOpenSettings={() => setShowSettings(true)}
        />
        {showSettings && (
            <SettingsModal
                config={aiConfig}
                activeProfile={activeProfile}
                onSaveConfig={(cfg) => { setAiConfig(cfg); }}
                onUpdateProfile={(p) => setActiveProfile(p)}
                onSwitchProfile={handleSwitchProfile}
                onClose={() => { setShowSettings(false); setDebugModeEnabled(isDebugMode()); }}
            />
        )}
    </>
  );

  const renderContent = () => {
      if (viewMode === ViewMode.LAUNCHPAD) return <Launchpad repo={currentRepo} onSelectPR={handleSelectPR} token={activeProfile?.githubToken} />;
      if (viewMode === ViewMode.ISSUES) return <Launchpad repo={currentRepo} onSelectPR={handleSelectPR} token={activeProfile?.githubToken} />; 
      if (viewMode === ViewMode.ACTIONS && selectedRun) {
          return <ActionDetails run={selectedRun} repo={currentRepo} token={activeProfile?.githubToken} onClose={() => setViewMode(ViewMode.GRAPH)} />;
      }
      if (viewMode === ViewMode.PULL_REQUEST && selectedPR) {
          return <PullRequestDetails pr={selectedPR} repo={currentRepo} token={activeProfile?.githubToken} onClose={() => setViewMode(ViewMode.GRAPH)} onCheckout={(b) => handleSwitchBranch(b)} />;
      }
      if (viewMode === ViewMode.ISSUE_DETAIL && selectedIssue) {
          return <IssueDetails issue={selectedIssue} repo={currentRepo} token={activeProfile?.githubToken} aiConfig={aiConfig} onClose={() => setViewMode(ViewMode.GRAPH)} onRefresh={() => refreshRepoData(false)} />;
      }

      // Determine visibility of WIP node (GitKraken style - always show when there are uncommitted changes)
      const showWip = currentRepo?.isLocal && hasUncommittedChanges;
      const topOffset = showWip ? 1 : 0;
      
      return (
        <div className="flex-1 flex flex-col relative bg-gk-bg overflow-hidden">
            {/* Table Header */}
            <div className="h-8 flex items-center border-b border-black/20 text-[10px] font-bold text-gray-500 uppercase bg-gk-bg select-none sticky top-0 z-20 shadow-sm pl-4">
                <HeaderCell label="Graph" width={graphW} colName="graph" onResize={startResize} />
                <HeaderCell label="Description" colName="desc" isFlex onResize={startResize} />
                <HeaderCell label="Date" width={colWidths.date} colName="date" onResize={startResize} />
                <HeaderCell label="Author" width={colWidths.author} colName="author" onResize={startResize} />
                <HeaderCell label="SHA" width={colWidths.sha} colName="sha" onResize={startResize} />
            </div>

            {error && <div className="p-4 text-gk-red bg-gk-red/10 border-b border-gk-red/20 text-sm text-center">{error}</div>}
            {loadingData && (
              <div className="absolute inset-0 flex items-center justify-center z-30 bg-gk-bg/50 backdrop-blur-sm">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 border-2 border-gk-accent border-t-transparent rounded-full animate-spin mb-2"></div>
                  <span className="text-sm font-bold text-gray-400">Loading {currentRepo.name}...</span>
                </div>
              </div>
            )}

            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto custom-scrollbar relative"
                onClick={() => { setIsPanelOpen(false); setSelectedCommit(null); setSelectedCommits([]); setContextMenu(null); }}
                onScroll={(e) => {
                  const target = e.currentTarget;
                  setGraphScrollTop(target.scrollTop);
                  setGraphViewportHeight(target.clientHeight);
                }}
            >
                <div className="relative min-h-full" style={{ height: (filteredCommits.length + topOffset) * ROW_HEIGHT + 200 }}>
                    {/* Graph SVG - clipped to Graph Column width */}
                    <div className="absolute top-0 left-0 bottom-0 overflow-hidden z-0" style={{ width: graphW + GRAPH_PADDING_LEFT }}>
                        <CommitGraph commits={filteredCommits} rowHeight={ROW_HEIGHT} columnWidth={COLUMN_WIDTH} topRowOffset={topOffset} scrollTop={graphScrollTop} viewportHeight={graphViewportHeight} />
                    </div>

                    {/* WIP Node */}
                    {showWip && (() => {
                        // Find the HEAD commit of the current branch to position WIP correctly
                        const currentBranch = branches.find(b => b.active);
                        const headCommit = currentBranch
                            ? filteredCommits.find(c => c.id === currentBranch.commitId)
                            : filteredCommits[0]; // Fallback to first commit if no branch found

                        const wipLane = headCommit ? headCommit.lane : 0;
                        const wipDotLeft = (wipLane + 1) * COLUMN_WIDTH - 6;

                        return (
                        <div
                            className={`absolute w-full flex items-center text-sm hover:bg-white/5 cursor-pointer transition-colors border-l-2 border-dashed z-10 ${(!selectedCommit && isPanelOpen) ? 'bg-white/10 border-gk-yellow' : 'border-transparent'}`}
                            style={{ top: 0, height: ROW_HEIGHT, paddingLeft: GRAPH_PADDING_LEFT }}
                            onClick={(e) => { e.stopPropagation(); setSelectedCommit(null); setSelectedCommits([]); setIsPanelOpen(true); }}
                            onContextMenu={handleWipContextMenu}
                        >
                            <div style={{ width: graphW, minWidth: graphW, position: 'relative', height: '100%', overflow: 'hidden' }}>
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-gk-yellow bg-gk-bg"
                                    style={{ left: wipDotLeft }}
                                />
                            </div>
                            <div className="flex-1 font-bold text-gk-yellow italic text-xs px-2 truncate min-w-[100px]">Uncommitted Changes (WIP)</div>
                            <div className="px-2 text-xs text-gray-500 truncate border-l border-transparent" style={{ width: colWidths.date }}>Now</div>
                            <div className="px-2 text-xs text-gray-400 truncate border-l border-transparent" style={{ width: colWidths.author }}>You</div>
                            <div className="px-2 text-xs font-mono text-gray-600 truncate border-l border-transparent" style={{ width: colWidths.sha }}>---</div>
                        </div>
                        );
                    })()}

                    {/* Commits */}
                    {filteredCommits.map((commit, index) => {
                        const isSelected = selectedCommits.some(c => c.id === commit.id);
                        const isDragOver = dragOverCommitId === commit.id;

                        let borderClass = 'border-transparent';
                        if (isSelected) borderClass = 'bg-white/10 border-gk-blue';
                        else if (isDragOver) {
                            if (dropPosition === 'top') borderClass = 'border-t-2 border-gk-blue bg-gk-blue/10';
                            else if (dropPosition === 'bottom') borderClass = 'border-b-2 border-gk-blue bg-gk-blue/10';
                            else borderClass = 'bg-gk-blue/20 border-gk-blue'; // center
                        }

                        // Adjust top position based on WIP visibility
                        const topPos = (index + topOffset) * ROW_HEIGHT;

                        // Check if commit is unpushed (first N commits where N = aheadBehind.ahead)
                        const isUnpushed = currentRepo?.isLocal && aheadBehind.ahead > 0 && index < aheadBehind.ahead;

                        return (
                            <div
                                key={commit.id}
                                draggable={currentRepo?.isLocal}
                                onDragStart={currentRepo?.isLocal ? (e) => handleDragStart(e, commit) : undefined}
                                onDragOver={currentRepo?.isLocal ? (e) => handleDragOver(e, commit) : undefined}
                                onDragLeave={currentRepo?.isLocal ? handleDragLeave : undefined}
                                onDrop={currentRepo?.isLocal ? (e) => handleDrop(e, commit) : undefined}
                                className={`absolute w-full flex items-center text-xs cursor-pointer transition-all border-l-2 z-10 hover:bg-white/5 ${borderClass}`}
                                style={{ top: topPos, height: ROW_HEIGHT, paddingLeft: GRAPH_PADDING_LEFT }}
                                onClick={(e) => handleCommitClick(e, commit)}
                                onContextMenu={(e) => handleCommitContextMenu(e, commit)}
                            >
                                {/* Unpushed indicator - tiny vertical bar */}
                                {isUnpushed && (
                                    <div
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gk-accent rounded-full"
                                        title={`Unpushed commit (${index + 1} of ${aheadBehind.ahead})`}
                                    />
                                )}
                                <div style={{ width: graphW, minWidth: graphW, position: 'relative', height: '100%', overflow: 'hidden' }}>
                                    <GraphNode commit={commit} columnWidth={COLUMN_WIDTH} showAvatars={aiConfig.showAvatars !== false} />
                                </div>
                                <div className="flex-1 truncate px-2 flex items-center min-w-[100px]">
                                    <span className={`truncate font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>{commit.message}</span>
                                    {commit.branch && <span className="ml-2 px-1.5 py-0.5 bg-gk-panel border border-white/10 rounded text-[9px] font-bold text-gk-accent uppercase tracking-wider">{commit.branch}</span>}
                                    {tagMap.get(commit.id)?.map(tag => (
                                        <span key={tag} className="ml-1 px-1.5 py-0.5 bg-gk-yellow/10 border border-gk-yellow/30 rounded text-[9px] font-bold text-gk-yellow tracking-wider">{tag}</span>
                                    ))}
                                </div>
                                <div className="px-2 text-gray-500 truncate text-[10px] border-l border-white/5" style={{ width: colWidths.date }}>{formatDate(commit.date, aiConfig.dateFormat)}</div>
                                <div className="px-2 text-gray-400 flex items-center truncate border-l border-white/5" style={{ width: colWidths.author }}>
                                    {(aiConfig.showAvatars !== false) && commit.avatarUrl ? (
                                        <img src={commit.avatarUrl} className="w-4 h-4 rounded-full mr-2" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full bg-gk-blue/30 flex items-center justify-center mr-2 flex-shrink-0">
                                            <span className="text-[8px] font-bold text-gk-blue">
                                                {commit.author.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <span className="truncate">{commit.author}</span>
                                </div>
                                <div className="px-2 font-mono text-gray-600 truncate border-l border-white/5" style={{ width: colWidths.sha }}>{commit.shortId}</div>
                            </div>
                        );
                    })}

                    {/* Load More Button */}
                    {(hasMoreCommits || loadingMoreCommits) && (
                        <div
                            className="absolute w-full flex items-center justify-center py-4"
                            style={{ top: (filteredCommits.length + topOffset) * ROW_HEIGHT }}
                        >
                            <button
                                onClick={loadMoreCommits}
                                disabled={loadingMoreCommits}
                                className="flex items-center gap-2 px-4 py-2 bg-gk-panel border border-gk-header hover:border-gk-accent rounded-lg text-sm text-gray-400 hover:text-white transition-all disabled:opacity-50"
                            >
                                {loadingMoreCommits ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gk-accent border-t-transparent rounded-full animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        Load More Commits
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="flex h-screen bg-gk-bg text-gray-400 overflow-hidden font-sans selection:bg-gk-blue/30 selection:text-white">
      <Sidebar
        branches={branches}
        currentView={viewMode}
        onViewChange={setViewMode}
        repo={currentRepo}
        token={activeProfile?.githubToken}
        activeProfile={activeProfile}
        onSelectBranch={handleSwitchBranch}
        onCreateBranch={handleBranch}
        onSelectRun={handleSelectRun}
        onSelectPR={handleSelectPR}
        onSelectIssue={handleSelectIssue}
        refreshTrigger={refreshTrigger}
        onRefresh={refreshRepoData}
        onOpenMergeTool={() => setShowMergeTool(true)}
        tags={tags}
        onDeleteTag={async (tag) => {
          if (!currentRepo?.isLocal) return;
          try {
            const { gitDeleteTag } = await import('./services/localGitService');
            await gitDeleteTag(currentRepo, tag);
            refreshRepoData();
          } catch (e) {
            setAlertDialog({ isOpen: true, title: 'Delete Tag Failed', message: e.message, type: 'error' });
          }
        }}
        onCloneRepo={handleCloneRepo}
        // New branch actions
        onRenameBranch={async (branch) => {
          const newName = await triggerPrompt('Rename branch to:', branch);
          if (newName && newName !== branch) {
            try {
              await gitRenameBranch(currentRepo!, branch, newName);
              showAlert('Renamed', `Branch renamed to "${newName}".`, 'success');
              refreshRepoData();
            } catch (e) {
              showAlert('Rename Failed', e.message, 'error');
            }
          }
        }}
        onSetUpstream={handleSetUpstream}
        onResetBranch={handleResetBranch}
        onCompareBranch={handleCompareBranch}
        onRebaseBranch={handleRebaseBranch}
        onAIExplainBranch={handleAIExplainBranch}
        onAIGeneratePR={handleAIGeneratePR}
        // New tag actions
        onCheckoutTag={handleCheckoutTag}
        onPushTag={handlePushTag}
        onCopyTagName={handleCopyTagName}
        // Context menu coordination
        contextMenuCloseTrigger={sidebarContextMenuCloseTrigger}
        onContextMenuOpen={() => setContextMenu(null)}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        {/* Rebase In Progress Banner */}
        {rebaseInProgress && (
          <div className="flex items-center justify-between px-4 py-2 bg-gk-yellow/20 border-b border-gk-yellow/50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-gk-yellow" />
              <span className="text-sm text-gk-yellow">
                Rebase in progress - Resolve conflicts in the merge tool, then continue
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleContinueRebase}
                disabled={loadingData}
                className="flex items-center gap-1 px-3 py-1 bg-gk-accent hover:bg-gk-accent/80 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
              >
                {loadingData ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Continuing...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    Continue Rebase
                  </>
                )}
              </button>
              <button
                onClick={handleAbortRebase}
                disabled={loadingData}
                className="flex items-center gap-1 px-3 py-1 bg-gk-red hover:bg-gk-red/80 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
              >
                <X className="w-3 h-3" />
                Abort
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center bg-gk-panel border-b border-black/20">
          <Toolbar
              activeProfile={activeProfile}
              repo={currentRepo || undefined}
              branches={branches}
              onOpenSettings={() => setShowSettings(true)}
              onSwitchRepo={() => handleSelectRepo(null)}
              onPull={handlePull}
              onPush={handlePush}
              onBranch={handleBranch}
              onGitflow={handleGitflow}
              onCreatePR={() => setShowPRModal(true)}
              onOpenBranchSwitcher={(pos) => { setBranchSwitcherPosition(pos); setShowBranchSwitcher(true); }}
              onOpenCommandPalette={() => setShowCommandPalette(true)}
              onOpenSearch={() => setShowSearchPanel(true)}
              onManageRemotes={() => setShowRemoteManager(true)}
              remoteCount={remoteCount}
              onStash={() => {
                  if (currentRepo?.isLocal) {
                    triggerPrompt('Stash message (optional):', `WIP on ${currentRepo.default_branch || 'main'}`)
                      .then((message) => {
                        if (message !== null) {
                          performStash(message);
                        }
                      });
                  }
              }}
              onUnstash={handleUnstash}
              onOpenStashList={handleOpenStashList}
              onOpenReflog={() => {
                setShowSnapshotsPanel(false);
                setShowSubmodulesPanel(false);
                setShowGitflowPanel(false);
                setShowGraphFilters(false);
                setShowInteractiveRebase(false);
                setShowWorktreesPanel(false);
                setShowReflogViewer(true);
              }}
              onOpenGraphFilters={() => {
                setShowReflogViewer(false);
                setShowSnapshotsPanel(false);
                setShowSubmodulesPanel(false);
                setShowGitflowPanel(false);
                setShowInteractiveRebase(false);
                setShowWorktreesPanel(false);
                setShowGraphFilters(true);
              }}
              onOpenSnapshots={() => {
                setShowReflogViewer(false);
                setShowSubmodulesPanel(false);
                setShowGitflowPanel(false);
                setShowGraphFilters(false);
                setShowInteractiveRebase(false);
                setShowWorktreesPanel(false);
                setShowSnapshotsPanel(true);
              }}
              onOpenSubmodules={() => {
                setShowReflogViewer(false);
                setShowSnapshotsPanel(false);
                setShowGitflowPanel(false);
                setShowGraphFilters(false);
                setShowInteractiveRebase(false);
                setShowWorktreesPanel(false);
                setShowSubmodulesPanel(true);
              }}
              onOpenWorktrees={currentRepo?.isLocal ? () => {
                setShowReflogViewer(false);
                setShowSnapshotsPanel(false);
                setShowGitflowPanel(false);
                setShowGraphFilters(false);
                setShowInteractiveRebase(false);
                setShowSubmodulesPanel(false);
                setShowWorktreesPanel(true);
              } : undefined}
              hasUncommittedChanges={hasUncommittedChanges}
              stashCount={stashes.length}
              aheadCount={aheadBehind.ahead}
              behindCount={aheadBehind.behind}
              isFetching={isFetching}
              lastFetchTime={lastFetchTime}
              largeFileWarnings={largeFileWarnings}
              onOpenDebugPanel={() => setShowDebugPanel(true)}
              debugMode={debugModeEnabled}
              parentRepo={parentRepo}
              onBackToParent={parentRepo ? () => {
                const parent = parentRepo;
                setParentRepo(null);
                handleSelectRepo(parent);
              } : undefined}
              undoButton={
                <UndoButton repo={currentRepo} onRefresh={refreshRepoData} undoState={undoState} onUndo={handleUndo} redoState={redoState} onRedo={handleRedo} />
              }
          />
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          {renderContent()}

          {/* Right Panel (Commit Details / WIP) - Only for local repos or when viewing commit details */}
          {(selectedCommit || (currentRepo?.isLocal && hasUncommittedChanges && isPanelOpen)) && isPanelOpen && (
              <CommitPanel
                commit={selectedCommit}
                onClose={() => setIsPanelOpen(false)}
                aiConfig={aiConfig}
                githubToken={activeProfile?.githubToken || ''}
                repository={currentRepo!}
                refreshGraph={refreshRepoData}
                activeProfile={activeProfile}
                onBlame={(filepath) => setBlameView({ filepath })}
                onFileHistory={(filepath) => setFileHistoryView({ filepath })}
                onEditFile={(filepath) => setFileEditorView({ filepath })}
                recentMessages={commits.slice(0, 50).map(c => c.message)}
              />
          )}

          {/* Floating Terminal */}
          <div className="absolute bottom-0 left-0 right-0 z-40">
              <Terminal
                isOpen={showTerminal}
                toggle={() => setShowTerminal(!showTerminal)}
                repo={currentRepo}
                onRefresh={refreshRepoData}
                onNavigateToCommit={navigateToCommit}
                gitAuthor={activeProfile ? { name: activeProfile.gitName || activeProfile.name || 'User', email: activeProfile.gitEmail || 'user@local' } : undefined}
                shellPreference={aiConfig.shellPreference}
              />
          </div>
        </div>
      </div>
      
      {/* Prompt Modal Overlay */}
      <PromptModal 
          isOpen={promptConfig.isOpen}
          title={promptConfig.title}
          defaultValue={promptConfig.defaultValue}
          onConfirm={(val) => promptConfig.resolve(val)}
          onCancel={() => promptConfig.resolve(null)}
      />

      {/* Existing Modals */}
      {showSettings && (
        <SettingsModal
            config={aiConfig}
            activeProfile={activeProfile}
            onSaveConfig={(cfg) => { setAiConfig(cfg); }}
            onUpdateProfile={(p) => setActiveProfile(p)}
            onSwitchProfile={handleSwitchProfile}
            onClose={() => { setShowSettings(false); setDebugModeEnabled(isDebugMode()); }}
        />
      )}
      {showMergeTool && <MergeTool config={aiConfig} repo={currentRepo} onResolved={() => { setShowMergeTool(false); refreshRepoData(); }} onClose={() => setShowMergeTool(false)} />}
      {showPRModal && currentRepo && <CreatePRModal repo={currentRepo} currentBranch={currentRepo.default_branch} baseBranch={currentRepo.parent?.default_branch || 'main'} token={activeProfile?.githubToken} config={aiConfig} onClose={() => setShowPRModal(false)} onCreated={() => refreshRepoData()} />}
      {showBranchSwitcher && (
        <BranchSwitcher
          branches={branches}
          currentBranch={currentRepo?.default_branch || 'HEAD'}
          onSelect={handleSwitchBranch}
          onClose={() => setShowBranchSwitcher(false)}
          position={branchSwitcherPosition}
        />
      )}

      {showStashPanel && (
        <StashPanel
          stashes={stashes}
          onApply={handleStashApply}
          onPop={handleStashPop}
          onDrop={handleStashDrop}
          onClose={() => setShowStashPanel(false)}
          isLoading={loadingData}
        />
      )}

      {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            type={contextMenu.type}
            repo={currentRepo}
            commit={contextMenu.commit}
            branches={branches}
            selectedCommits={selectedCommits}
            isMostRecent={contextMenu.commit?.id === commits[0]?.id}
            onClose={() => setContextMenu(null)}
            onCherryPick={performCherryPick}
            onCherryPickToBranch={performCherryPickToBranch}
            onCopyHash={() => { if(contextMenu.commit) navigator.clipboard.writeText(contextMenu.commit.id); }}
            onCopyMessage={() => { if(contextMenu.commit) navigator.clipboard.writeText(contextMenu.commit.message); }}
            onCreateBranch={() => { if(contextMenu.commit) performCreateBranch(contextMenu.commit); }}
            onCreateTag={() => { if(contextMenu.commit) handleCreateTag(contextMenu.commit); }}
            onCheckout={() => { if(contextMenu.commit) performCheckout(contextMenu.commit); }}
            onResetToCommit={handleResetToCommit}
            onRevertCommit={() => { if(contextMenu.commit) handleRevertCommit(contextMenu.commit); }}
            onSquash={selectedCommits.length >= 2 ? handleStartSquash : undefined}
            onReorderCommits={selectedCommits.length >= 2 ? () => {
              setShowInteractiveRebase(true);
            } : undefined}
            onStageAll={performStageAll}
            onUnstageAll={performUnstageAll}
            onDiscardAll={performDiscardAll}
            onStash={() => {
                if (currentRepo?.isLocal) {
                  triggerPrompt('Stash message (optional):', `WIP on ${currentRepo.default_branch || 'main'}`)
                    .then((message) => {
                      if (message !== null) {
                        performStash(message);
                      }
                    });
                }
            }}
            onUnstash={handleUnstash}
            onAmendCommit={handleAmendCommit}
            onUndoLastCommit={handleUndoCommit}
            // New commit actions
            onInteractiveRebase={handleInteractiveRebaseFromCommit}
            onDropCommit={handleDropCommit}
            onGenerateCommitSummary={handleGenerateCommitSummary}
            onGenerateChangelog={handleGenerateChangelogEntry}
            onRevealInGraph={handleRevealInGraph}
          />
      )}

      {/* Reusable Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={onConfirmNo}
        onConfirm={onConfirmYes}
        title={confirmState.title}
        message={confirmState.message}
        details={confirmState.details}
        type={confirmState.type}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        icon={confirmState.icon}
      />

      {/* Beautiful Dialogs */}
      {cherryPickDialog && (
        <CherryPickDialog
          isOpen={cherryPickDialog.isOpen}
          commitCount={cherryPickDialog.commitCount}
          targetCommit={cherryPickDialog.targetCommit}
          onConfirm={cherryPickDialog.onConfirm}
          onClose={() => setCherryPickDialog(null)}
        />
      )}

      {reorderDialog && (
        <ReorderCommitsDialog
          isOpen={reorderDialog.isOpen}
          commitCount={reorderDialog.commitCount}
          onConfirm={reorderDialog.onConfirm}
          onClose={() => setReorderDialog(null)}
        />
      )}

      {/* AI Loading Overlay */}
      {aiLoading.isLoading && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gk-panel border border-gk-header rounded-xl p-6 shadow-2xl flex flex-col items-center">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-gk-purple/30"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-gk-purple animate-spin"></div>
              <Sparkles className="absolute inset-2 w-8 h-8 text-gk-purple animate-pulse" />
            </div>
            <p className="text-white font-medium">{aiLoading.message || 'AI is thinking...'}</p>
            <p className="text-gray-500 text-sm mt-1">This may take a few seconds</p>
          </div>
        </div>
      )}

      {/* Sync Loading Overlay (Push/Pull/Fetch) */}
      {syncLoading.isLoading && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gk-panel border border-gk-header rounded-xl p-6 shadow-2xl flex flex-col items-center min-w-[280px]">
            <div className="relative w-12 h-12 mb-4">
              <div className={`absolute inset-0 rounded-full border-4 ${
                syncLoading.type === 'push' ? 'border-gk-green/30' :
                syncLoading.type === 'pull' ? 'border-gk-cyan/30' : 'border-gk-accent/30'
              }`}></div>
              <div className={`absolute inset-0 rounded-full border-4 border-transparent animate-spin ${
                syncLoading.type === 'push' ? 'border-t-gk-green' :
                syncLoading.type === 'pull' ? 'border-t-gk-cyan' : 'border-t-gk-accent'
              }`}></div>
              {syncLoading.type === 'push' && (
                <ArrowUp className="absolute inset-2 w-8 h-8 text-gk-green animate-pulse" />
              )}
              {syncLoading.type === 'pull' && (
                <ArrowDown className="absolute inset-2 w-8 h-8 text-gk-cyan animate-pulse" />
              )}
              {syncLoading.type === 'fetch' && (
                <RefreshCw className="absolute inset-2 w-8 h-8 text-gk-accent animate-spin" />
              )}
            </div>
            <p className="text-white font-medium text-center">{syncLoading.message || 'Syncing with remote...'}</p>
            <p className="text-gray-500 text-sm mt-1">Please wait...</p>
          </div>
        </div>
      )}

      {alertDialog && (
        <AlertDialog
          isOpen={alertDialog.isOpen}
          title={alertDialog.title}
          type={alertDialog.type}
          onClose={() => setAlertDialog(null)}
          onConfirm={() => setAlertDialog(null)}
        >
          <div className="space-y-2">
            <p className="text-gray-200">{alertDialog.message}</p>
            {alertDialog.details && (
              <div className="mt-3 p-3 bg-black/20 border border-white/10 rounded-lg">
                <p className="text-sm text-gray-400 whitespace-pre-wrap">{alertDialog.details}</p>
              </div>
            )}
            {alertDialog.onAddRemote && (
              <button
                onClick={alertDialog.onAddRemote}
                className="mt-3 px-4 py-2 bg-gk-blue hover:bg-gk-blue/80 text-white text-sm rounded transition-colors"
              >
                Add Remote
              </button>
            )}
          </div>
        </AlertDialog>
      )}

      {/* Empty Cherry-Pick Dialog */}
      {emptyCherryPickDialog?.isOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gk-panel border border-gk-header rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-gk-yellow flex-shrink-0" />
              <h2 className="text-lg font-bold text-white">Empty Cherry-Pick</h2>
            </div>
            <p className="text-gray-300 text-sm mb-2">
              The cherry-pick for commit <span className="font-mono text-gk-yellow">{emptyCherryPickDialog.commitSha.substring(0, 7)}</span> resulted in no changes.
            </p>
            <p className="text-gray-400 text-xs mb-4">
              This typically happens when the conflict resolution produced content identical to the current state. Choose how to proceed:
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleEmptyCherryPickSkip}
                className="w-full py-2 bg-gk-accent/20 border border-gk-accent/30 text-gk-accent rounded text-sm hover:bg-gk-accent/30 transition-colors"
              >
                Skip this commit
              </button>
              <button
                onClick={handleEmptyCherryPickAllowEmpty}
                className="w-full py-2 bg-gk-blue/20 border border-gk-blue/30 text-gk-blue rounded text-sm hover:bg-gk-blue/30 transition-colors"
              >
                Commit anyway (allow empty)
              </button>
              <button
                onClick={handleEmptyCherryPickAbort}
                className="w-full py-2 bg-gk-red/20 border border-gk-red/30 text-gk-red rounded text-sm hover:bg-gk-red/30 transition-colors"
              >
                Abort rebase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remote Manager Modal */}
      {showRemoteManager && currentRepo && (
        <RemoteManager
          isOpen={showRemoteManager}
          onClose={() => {
            setShowRemoteManager(false);
            if (pendingRemoteAction) {
              const action = pendingRemoteAction;
              setPendingRemoteAction(null);
              // Check if remotes were actually added before retrying
              gitListRemotes(currentRepo).then(remotes => {
                if (remotes.length > 0) {
                  if (action === 'pull') handlePull();
                  else if (action === 'push') handlePush();
                }
              }).catch((e) => { console.warn('remote list check failed:', e); });
            }
          }}
          repo={currentRepo}
        />
      )}

      {/* Conflict Warning Dialog */}
      {conflictWarning.isOpen && (
        <AlertDialog
          isOpen={conflictWarning.isOpen}
          title="⚠️ Potential Conflicts Detected"
          type="warning"
          onClose={() => setConflictWarning({ isOpen: false, files: [] })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              Potential merge conflicts detected in <span className="font-bold text-gk-yellow">{conflictWarning.files.length}</span> file(s).
            </p>
            <div className="bg-gk-yellow/10 border border-gk-yellow/30 rounded-lg p-3">
              <p className="text-sm font-bold text-gk-yellow mb-2">Potentially Conflicting Files:</p>
              <ul className="text-sm text-gray-300 space-y-1 max-h-40 overflow-y-auto">
                {conflictWarning.files.map((file) => (
                  <li key={file} className="flex items-center">
                    <span className="w-1.5 h-1.5 bg-gk-yellow rounded-full mr-2"></span>
                    {file}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-yellow-400 text-sm">
              You can continue with the cherry-pick, but conflicts will need to be resolved manually if they occur.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setConflictWarning({ isOpen: false, files: [] })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => conflictWarning.onContinue?.()}
                className="px-4 py-2 bg-gk-yellow hover:bg-yellow-600 text-black font-bold rounded transition-colors"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Amend Commit Dialog */}
      {amendDialog.isOpen && (
        <AlertDialog
          isOpen={amendDialog.isOpen}
          title="Amend Last Commit"
          type="info"
          onClose={() => setAmendDialog({ isOpen: false, commitMessage: '' })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              Edit the commit message for the last commit. Any staged changes will be included in the amended commit.
            </p>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3">
              <label className="block text-xs text-gray-400 mb-2">Commit Message:</label>
              <textarea
                value={amendDialog.commitMessage}
                onChange={(e) => setAmendDialog({ ...amendDialog, commitMessage: e.target.value })}
                className="w-full bg-black/50 border border-white/20 rounded p-3 text-sm text-gray-200 resize-none focus:outline-none focus:border-gk-purple"
                rows={5}
                autoFocus
              />
            </div>
            <p className="text-yellow-400 text-sm">
              ⚠️ Amending rewrites history. Avoid amending pushed commits.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setAmendDialog({ isOpen: false, commitMessage: '' })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeAmend}
                className="px-4 py-2 bg-gk-purple hover:bg-purple-600 text-white font-bold rounded transition-colors"
              >
                Amend Commit
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Undo Commit Dialog */}
      {undoCommitDialog.isOpen && (
        <AlertDialog
          isOpen={undoCommitDialog.isOpen}
          title="Undo Last Commit"
          type="warning"
          onClose={() => setUndoCommitDialog({ isOpen: false })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              Undo the last commit. Choose what to do with the changes:
            </p>
            <div className="space-y-3">
              <button
                onClick={() => executeUndoCommit(true)}
                className="w-full px-4 py-3 bg-gk-blue/20 border border-gk-blue/30 text-gk-blue rounded hover:bg-gk-blue/30 transition-colors text-left"
              >
                <div className="font-bold">Keep Changes Staged</div>
                <div className="text-sm mt-1 opacity-80">Remove commit but keep all changes staged</div>
              </button>
              <button
                onClick={() => executeUndoCommit(false)}
                className="w-full px-4 py-3 bg-gk-red/20 border border-gk-red/30 text-gk-red rounded hover:bg-gk-red/30 transition-colors text-left"
              >
                <div className="font-bold">Discard All Changes</div>
                <div className="text-sm mt-1 opacity-80">⚠️ Remove commit AND discard all changes permanently</div>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setUndoCommitDialog({ isOpen: false })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Revert Commit Dialog */}
      {revertDialog.isOpen && (
        <AlertDialog
          isOpen={revertDialog.isOpen}
          title="Revert Commit"
          type="info"
          onClose={() => setRevertDialog({ isOpen: false, commit: null })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              Revert commit <span className="font-bold text-gk-accent">{revertDialog.commit?.shortId}</span>?
            </p>
            <p className="text-sm text-gray-400">
              This will create a new commit that undoes the changes from:
            </p>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-sm text-gray-300">
                {revertDialog.commit?.message.split('\n')[0]}
              </p>
            </div>
            <p className="text-yellow-400 text-sm">
              ⚠️ If conflicts occur, you'll need to resolve them in the Merge Tool.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setRevertDialog({ isOpen: false, commit: null })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeRevert}
                className="px-4 py-2 bg-gk-blue hover:bg-blue-600 text-white font-bold rounded transition-colors"
              >
                Revert
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Gitflow Initialization Dialog */}
      {gitflowDialog.isOpen && (
        <AlertDialog
          isOpen={gitflowDialog.isOpen}
          title="Initialize Gitflow"
          type="info"
          onClose={() => setGitflowDialog({ isOpen: false })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              This will initialize Gitflow branching model by creating a <span className="font-bold text-gk-accent">develop</span> branch.
            </p>
            <div className="bg-gk-accent/10 border border-gk-accent/30 rounded-lg p-3">
              <p className="text-sm text-gray-300">
                Gitflow uses two main branches:
              </p>
              <ul className="text-sm text-gray-300 mt-2 space-y-1">
                <li>• <span className="font-bold text-gk-accent">main</span> - Production releases</li>
                <li>• <span className="font-bold text-gk-accent">develop</span> - Integration branch for features</li>
              </ul>
            </div>
            <p className="text-sm text-gray-400">
              The develop branch will be created from your current branch.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setGitflowDialog({ isOpen: false })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeGitflow}
                className="px-4 py-2 bg-gk-accent hover:bg-green-600 text-white font-bold rounded transition-colors"
              >
                Initialize
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Discard All Changes Dialog */}
      {discardAllDialog.isOpen && (
        <AlertDialog
          isOpen={discardAllDialog.isOpen}
          title="⚠️ Discard All Changes"
          type="warning"
          onClose={() => setDiscardAllDialog({ isOpen: false })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              Are you sure you want to discard <span className="font-bold text-gk-red">ALL</span> uncommitted changes?
            </p>
            <div className="bg-gk-red/10 border border-gk-red/30 rounded-lg p-3">
              <p className="text-sm font-bold text-gk-red mb-2">⚠️ WARNING: This action cannot be undone!</p>
              <p className="text-sm text-gray-300">
                All uncommitted changes in your working directory will be permanently deleted.
              </p>
            </div>
            <p className="text-sm text-gray-400">
              This includes staged and unstaged changes to all files.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setDiscardAllDialog({ isOpen: false })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeDiscardAll}
                className="px-4 py-2 bg-gk-red hover:bg-red-600 text-white font-bold rounded transition-colors"
              >
                Discard All
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Checkout Commit Dialog */}
      {checkoutDialog.isOpen && (
        <AlertDialog
          isOpen={checkoutDialog.isOpen}
          title="Checkout Commit"
          type="info"
          onClose={() => setCheckoutDialog({ isOpen: false, commit: null, currentBranch: '' })}
          hideDefaultButton={true}
        >
          <div className="space-y-4">
            <p className="text-gray-200">
              Checkout commit <span className="font-bold text-gk-accent">{checkoutDialog.commit?.shortId}</span>?
            </p>
            <div className="bg-gk-yellow/10 border border-gk-yellow/30 rounded-lg p-3">
              <p className="text-sm font-bold text-gk-yellow mb-2">⚠️ Detached HEAD State</p>
              <p className="text-sm text-gray-300">
                You will enter detached HEAD state:
              </p>
              <ul className="text-sm text-gray-300 mt-2 space-y-1 list-disc list-inside">
                <li>You will no longer be on "<span className="font-bold text-white">{checkoutDialog.currentBranch}</span>"</li>
                <li>Any new commits will be disconnected</li>
                <li>You can return to "{checkoutDialog.currentBranch}" by clicking it in the sidebar</li>
              </ul>
            </div>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setCheckoutDialog({ isOpen: false, commit: null, currentBranch: '' })}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeCheckout}
                className="px-4 py-2 bg-gk-accent hover:bg-green-600 text-white font-bold rounded transition-colors"
              >
                Checkout
              </button>
            </div>
          </div>
        </AlertDialog>
      )}

      {/* Squash Dialog */}
      {showSquashDialog && (
        <SquashDialog
          isOpen={showSquashDialog}
          commits={selectedForSquash}
          onConfirm={handleSquashCommits}
          onClose={() => {
            setShowSquashDialog(false);
            setSelectedForSquash([]);
          }}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={paletteCommands}
      />

      {/* Search Panel */}
      <SearchPanel
        isOpen={showSearchPanel}
        onClose={() => setShowSearchPanel(false)}
        commits={commits}
        branches={branches}
        tags={tags}
        files={repoFiles}
        onSelectCommit={navigateToCommit}
        onSelectBranch={handleSwitchBranch}
        onSelectFile={(filepath) => setFileHistoryView({ filepath })}
      />

      {/* Blame View */}
      {blameView && currentRepo && (
        <BlameView
          filepath={blameView.filepath}
          repository={currentRepo}
          commitRef={blameView.ref}
          onClose={() => setBlameView(null)}
          onNavigateToCommit={(id) => { setBlameView(null); navigateToCommit(id); }}
        />
      )}

      {/* File History View */}
      {fileHistoryView && currentRepo && (
        <FileHistory
          filepath={fileHistoryView.filepath}
          repository={currentRepo}
          onClose={() => setFileHistoryView(null)}
          onNavigateToCommit={(id) => { setFileHistoryView(null); navigateToCommit(id); }}
        />
      )}

      {/* File Editor */}
      {fileEditorView && currentRepo && (
        <FileEditor
          isOpen={true}
          filePath={fileEditorView.filepath}
          repo={currentRepo}
          onClose={() => setFileEditorView(null)}
          onSave={() => refreshRepoData()}
        />
      )}

      {/* Reflog Viewer */}
      {showReflogViewer && currentRepo && (
        <ReflogViewer
          isOpen={showReflogViewer}
          onClose={() => setShowReflogViewer(false)}
          repo={currentRepo}
          onCheckout={(commitId) => {
            setSelectedCommit(commits.find(c => c.id === commitId || c.shortId === commitId) || null);
          }}
          onRefresh={refreshRepoData}
        />
      )}

      {/* Gitflow Panel */}
      {showGitflowPanel && currentRepo && (
        <GitflowPanel
          isOpen={showGitflowPanel}
          onClose={() => setShowGitflowPanel(false)}
          repo={currentRepo}
          branches={branches}
          onRefresh={refreshRepoData}
        />
      )}

      {/* Snapshots Panel */}
      {showSnapshotsPanel && currentRepo && (
        <SnapshotsPanel
          isOpen={showSnapshotsPanel}
          onClose={() => setShowSnapshotsPanel(false)}
          repo={currentRepo}
          onRefresh={refreshRepoData}
          onStashesChanged={loadStashes}
        />
      )}

      {/* Submodules Panel */}
      {showSubmodulesPanel && currentRepo && (
        <SubmodulesPanel
          isOpen={showSubmodulesPanel}
          onClose={() => setShowSubmodulesPanel(false)}
          repo={currentRepo}
          onOpenSubmodule={(path) => {
            // Open submodule as a new repo, track parent for back navigation
            if (currentRepo) {
              setParentRepo(currentRepo);
              const submodulePath = `${currentRepo.path}/${path}`;
              setShowSubmodulesPanel(false);
              handleSelectRepo({ ...currentRepo, path: submodulePath, name: `[Submodule] ${path}` });
            }
          }}
        />
      )}

      {/* Worktrees Panel */}
      {showWorktreesPanel && currentRepo && (
        <WorktreesPanel
          isOpen={showWorktreesPanel}
          onClose={() => setShowWorktreesPanel(false)}
          repo={currentRepo}
          onOpenWorktree={(path) => {
            // Open worktree as a new repo, track parent for back navigation
            if (currentRepo) {
              setParentRepo(currentRepo);
              const worktreeName = path.split(/[\\/]/).pop() || path;
              setShowWorktreesPanel(false);
              handleSelectRepo({
                ...currentRepo,
                id: `worktree-${Date.now()}`,
                path: path,
                handle: path,
                name: `[Worktree] ${worktreeName}`,
                full_name: path,
              });
            }
          }}
        />
      )}

      {/* Graph Filters */}
      {showGraphFilters && (
        <GraphFilters
          isOpen={showGraphFilters}
          onClose={() => setShowGraphFilters(false)}
          commits={commits}
          branches={branches}
          filters={graphFilters}
          onFiltersChange={(filters) => {
            setGraphFilters(filters);
          }}
        />
      )}

      {/* Interactive Rebase Panel */}
      {showInteractiveRebase && selectedCommits.length >= 2 && (
        <InteractiveRebasePanel
          isOpen={showInteractiveRebase}
          onClose={() => setShowInteractiveRebase(false)}
          commits={selectedCommits}
          targetBranch={currentRepo?.default_branch || 'main'}
          onRebase={handleInteractiveRebase}
        />
      )}

      {/* Debug Panel */}
      {showDebugPanel && (
        <DebugPanel
          isOpen={showDebugPanel}
          onClose={() => setShowDebugPanel(false)}
        />
      )}

      {/* Merge Preview Modal */}
      {showMergePreview && mergePreviewData && (
        <MergePreviewModal
          isOpen={showMergePreview}
          onClose={() => { setShowMergePreview(false); setMergePreviewData(null); }}
          preview={mergePreviewData}
          onProceed={() => {
            setShowMergePreview(false);
            setMergePreviewData(null);
            // Trigger the actual merge
            if (mergePreviewData?.sourceBranch && currentRepo?.isLocal) {
              const author = activeProfile?.gitName && activeProfile?.gitEmail
                ? { name: activeProfile.gitName, email: activeProfile.gitEmail }
                : undefined;
              gitMerge(currentRepo, mergePreviewData.sourceBranch, author)
                .then(() => {
                  showAlert('Merge Successful', `Merged "${mergePreviewData.sourceBranch}" into current branch.`, 'success');
                  refreshRepoData();
                })
                .catch((err: any) => {
                  showAlert('Merge Failed', err.message || 'Unknown error.', 'error');
                });
            }
          }}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Update Dialog */}
      {updateDialogOpen && updateInfo && (
        <UpdateDialog
          isOpen={updateDialogOpen}
          onClose={() => setUpdateDialogOpen(false)}
          releaseInfo={updateInfo.releaseInfo}
          currentVersion={updateInfo.currentVersion}
        />
      )}
    </div>
  );
};

export default App;