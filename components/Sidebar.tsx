import React, { useState, useEffect, useRef, useDeferredValue, useCallback, useMemo } from 'react';
import {
  GitBranch, Globe, Folder, Search,
  ChevronRight, GitPullRequest,
  AlertCircle, Tag, Layers, Cloud,
  PlayCircle, CheckCircle, XCircle, Loader2, RefreshCw, Plus, Trash2, GitMerge, Download,
  Edit3, Eye, Sparkles, RotateCcw, ArrowUpCircle, Copy, GitCommit
} from 'lucide-react';
import { Branch, ViewMode, WorkflowRun, Repository, PullRequest, Issue, Commit } from '../types';
import { fetchWorkflowRuns, fetchPullRequests, fetchIssues } from '../services/githubService';
import { gitCheckout, gitCherryPickMultiple, gitDeleteBranch, gitMerge, getGitHubInfoFromLocal } from '../services/localGitService';
import { detectPotentialConflicts } from '../services/conflictDetectionService';
import AlertDialog from './AlertDialog';
import ConfirmDialog from './ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';

interface SidebarProps {
  branches: Branch[];
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  repo: Repository | null;
  token?: string;
  activeProfile?: any;
  onSelectBranch?: (branch: string) => void;
  onCreateBranch?: () => void;
  onSelectRun?: (run: WorkflowRun) => void;
  onSelectPR?: (pr: PullRequest) => void;
  onSelectIssue?: (issue: Issue) => void;
  refreshTrigger?: number;
  onRefresh?: () => void;
  onOpenMergeTool?: () => void;
  tags?: string[];
  onDeleteTag?: (tag: string) => void;
  onCloneRepo?: (repo: Repository) => void;
  // New branch actions
  onRenameBranch?: (branch: string) => void;
  onSetUpstream?: (branch: string) => void;
  onResetBranch?: (branch: string) => void;
  onCompareBranch?: (branch: string) => void;
  onRebaseBranch?: (branch: string) => void;
  onAIExplainBranch?: (branch: string) => void;
  onAIGeneratePR?: (branch: string) => void;
  // New tag actions
  onCheckoutTag?: (tag: string) => void;
  onPushTag?: (tag: string) => void;
  onCopyTagName?: (tag: string) => void;
  // Context menu coordination
  contextMenuCloseTrigger?: number;
  onContextMenuOpen?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    branches, currentView, onViewChange, repo, token, activeProfile,
    onSelectBranch, onCreateBranch, onSelectRun, onSelectPR, onSelectIssue,
    refreshTrigger = 0, onRefresh, onOpenMergeTool, tags = [], onDeleteTag, onCloneRepo,
    onRenameBranch, onSetUpstream, onResetBranch, onCompareBranch, onRebaseBranch, onAIExplainBranch, onAIGeneratePR,
    onCheckoutTag, onPushTag, onCopyTagName,
    contextMenuCloseTrigger = 0, onContextMenuOpen
}) => {
  const localBranches = branches.filter(b => !b.isRemote);
  const remoteBranches = branches.filter(b => b.isRemote);
  
  // Identify if we are in "Web/Cloud Mode" (GitHub API) vs "Local Mode" (File System)
  const isWebMode = repo && !repo.isLocal;

  // GitHub info extracted from local repo's remote (for showing Actions, PRs, Issues)
  const [githubInfo, setGithubInfo] = useState<{ owner: string; repo: string } | null>(null);

  // Check if we can show GitHub features (either web mode or local with GitHub remote)
  const canShowGitHub = isWebMode || (repo?.isLocal && githubInfo !== null);
  // Get effective owner/repo for GitHub API calls
  const effectiveOwner = isWebMode ? repo?.owner?.login : githubInfo?.owner;
  const effectiveRepoName = isWebMode ? repo?.name : githubInfo?.repo;

  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [fetchError, setFetchError] = useState<{ runs?: string; prs?: string; issues?: string }>({});
  
  const [expanded, setExpanded] = useState({
    branches: true,
    prs: true,
    issues: true,
    actions: true,
    tags: false
  });

  const [dragOverBranch, setDragOverBranch] = useState<string | null>(null);
  const { dialogState: confirmState, confirm: triggerConfirm, handleConfirm: onConfirmYes, handleCancel: onConfirmNo } = useConfirmDialog();
  const { showAlert } = useAlert();

  // Filter state
  const [filterText, setFilterText] = useState('');
  const deferredFilter = useDeferredValue(filterText);

  // Context menu state for branch right-click
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    branch: Branch;
  } | null>(null);

  // Tag context menu state
  const [tagContextMenu, setTagContextMenu] = useState<{
    x: number;
    y: number;
    tag: string;
  } | null>(null);

  // Delete confirmation dialog state
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    isOpen: boolean;
    branchName: string;
  }>({
    isOpen: false,
    branchName: ''
  });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  // Fetch GitHub info from local repo's remote and reset data when repo changes
  useEffect(() => {
      // Reset GitHub data when repo changes
      setRuns([]);
      setPrs([]);
      setIssues([]);
      setFetchError({});

      if (repo?.isLocal) {
          getGitHubInfoFromLocal(repo)
              .then(info => setGithubInfo(info))
              .catch(() => setGithubInfo(null));
      } else {
          setGithubInfo(null);
      }
  }, [repo]);

  const refreshActions = () => {
      if (effectiveOwner && effectiveRepoName && token) {
        setLoadingRuns(true);
        setFetchError(prev => ({ ...prev, runs: undefined }));
        fetchWorkflowRuns(token, effectiveOwner, effectiveRepoName)
            .then(setRuns)
            .catch(err => {
              console.error('Failed to fetch workflow runs:', err);
              setFetchError(prev => ({ ...prev, runs: 'Failed to load actions' }));
            })
            .finally(() => setLoadingRuns(false));
      }
  };

  const refreshPrs = () => {
      if (effectiveOwner && effectiveRepoName && token) {
        setLoadingPrs(true);
        setFetchError(prev => ({ ...prev, prs: undefined }));
        fetchPullRequests(token, effectiveOwner, effectiveRepoName)
            .then(setPrs)
            .catch(err => {
              console.error('Failed to fetch pull requests:', err);
              setFetchError(prev => ({ ...prev, prs: 'Failed to load PRs' }));
            })
            .finally(() => setLoadingPrs(false));
      }
  };

  const refreshIssues = () => {
      if (effectiveOwner && effectiveRepoName && token) {
        setLoadingIssues(true);
        setFetchError(prev => ({ ...prev, issues: undefined }));
        fetchIssues(token, effectiveOwner, effectiveRepoName)
            .then(setIssues)
            .catch(err => {
              console.error('Failed to fetch issues:', err);
              setFetchError(prev => ({ ...prev, issues: 'Failed to load issues' }));
            })
            .finally(() => setLoadingIssues(false));
      }
  };

  // Initial Fetch based on expanded state
  useEffect(() => { if (expanded.actions && canShowGitHub) refreshActions(); }, [repo, token, expanded.actions, githubInfo]);
  useEffect(() => { if (expanded.prs && canShowGitHub) refreshPrs(); }, [repo, token, expanded.prs, githubInfo]);
  useEffect(() => { if (expanded.issues && canShowGitHub) refreshIssues(); }, [repo, token, expanded.issues, githubInfo]);

  // Auto Refresh Trigger (throttled to at most once per 5 seconds)
  const lastRefreshRef = useRef(0);
  useEffect(() => {
      if (refreshTrigger > 0) {
          const now = Date.now();
          if (now - lastRefreshRef.current < 5000) return;
          lastRefreshRef.current = now;
          if (expanded.actions) refreshActions();
          if (expanded.prs) refreshPrs();
          if (expanded.issues) refreshIssues();
      }
  }, [refreshTrigger]);

  // Combine branches (both local and remote), filtered by deferred filter text - memoized for performance
  const allBranches = useMemo(() => {
    const allBranchesRaw = [...localBranches, ...remoteBranches];
    if (!deferredFilter) return allBranchesRaw;
    const filterLower = deferredFilter.toLowerCase();
    return allBranchesRaw.filter(b => b.name.toLowerCase().includes(filterLower));
  }, [localBranches, remoteBranches, deferredFilter]);

  const filteredTags = useMemo(() => {
    if (!deferredFilter) return tags;
    const filterLower = deferredFilter.toLowerCase();
    return tags.filter(t => t.toLowerCase().includes(filterLower));
  }, [tags, deferredFilter]);

  const toggle = (section: keyof typeof expanded) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleDragOver = (e: React.DragEvent, branchName: string) => {
      e.preventDefault();
      setDragOverBranch(branchName);
  };

  const handleDragLeave = () => {
      setDragOverBranch(null);
  };

  const handleDrop = async (e: React.DragEvent, branchName: string) => {
      e.preventDefault();
      setDragOverBranch(null);
      if (!repo || !repo.isLocal) return;

      const data = e.dataTransfer.getData('commits');
      if (!data) return;

      try {
          const commits: Commit[] = JSON.parse(data);
          const ok = await triggerConfirm({
              title: 'Cherry-Pick Commits',
              message: `Checkout '${branchName}' and cherry-pick ${commits.length} commit(s)?`,
              details: `This will switch to the '${branchName}' branch and apply the selected commits.`,
              type: 'warning',
              confirmText: 'Cherry-Pick',
          });
          if (ok) {
              await gitCheckout(repo, branchName);
              if(onSelectBranch) onSelectBranch(branchName);
              await gitCherryPickMultiple(repo, commits);
              showAlert('Cherry-Pick', 'Cherry-pick successful!', 'success');
          }
      } catch (err) {
          showAlert('Cherry-Pick Error', `Failed to cherry-pick: ${err.message}`, 'error');
      }
  };

  // Ref callback to clamp context menus within viewport
  const clampMenuRef = useCallback((el: HTMLDivElement | null) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const padding = 8;
      if (rect.right > window.innerWidth - padding) {
          el.style.left = `${window.innerWidth - rect.width - padding}px`;
      }
      if (rect.bottom > window.innerHeight - padding) {
          el.style.top = `${window.innerHeight - rect.height - padding}px`;
      }
  }, []);

  const handleBranchContextMenu = (e: React.MouseEvent, branch: Branch) => {
      e.preventDefault();
      e.stopPropagation();
      // Show context menu for all local branches (including active for non-destructive actions)
      if (repo?.isLocal && !branch.isRemote) {
          // Close any other context menus (e.g., commit context menu in App.tsx)
          onContextMenuOpen?.();
          setTagContextMenu(null);
          setContextMenu({
              x: e.clientX,
              y: e.clientY,
              branch
          });
      }
  };

  const handleTagContextMenu = (e: React.MouseEvent, tag: string) => {
      e.preventDefault();
      e.stopPropagation();
      // Close any other context menus
      onContextMenuOpen?.();
      setContextMenu(null);
      setTagContextMenu({
          x: e.clientX,
          y: e.clientY,
          tag
      });
  };

  const handleDeleteBranch = () => {
      if (!contextMenu || !repo) return;

      const branchName = contextMenu.branch.name;
      const isDefaultBranch = branchName === repo.default_branch;
      // Also protect common primary branch names
      const isProtectedBranch = branchName === 'main' || branchName === 'master';

      if (isDefaultBranch || isProtectedBranch) {
          setAlertDialog({
              isOpen: true,
              title: 'Cannot Delete Protected Branch',
              message: `The branch "${branchName}" is a protected branch and cannot be deleted.\n\nProtected branches: main, master, and the default branch.`,
              type: 'error'
          });
          setContextMenu(null);
          return;
      }

      // Show confirmation dialog
      setDeleteConfirmDialog({
          isOpen: true,
          branchName: branchName
      });
      setContextMenu(null);
  };

  const handleMergeBranch = async () => {
      if (!contextMenu || !repo) return;

      const branchName = contextMenu.branch.name;
      const currentBranch = branches.find(b => b.active)?.name || 'HEAD';

      // Don't allow merging into itself
      if (branchName === currentBranch) {
          setAlertDialog({
              isOpen: true,
              title: 'Cannot Merge Branch Into Itself',
              message: `You are currently on "${branchName}". Switch to a different branch first.`,
              type: 'error'
          });
          setContextMenu(null);
          return;
      }

      setContextMenu(null);
      setLoadingRuns(true); // Reuse loading state

      try {
          // Check for potential conflicts before merging
          try {
              const warning = await detectPotentialConflicts(repo, [], branchName);
              if (warning.hasConflicts && warning.conflictingFiles.length > 0) {
                  const riskColor = warning.severity === 'high' ? 'red' : warning.severity === 'medium' ? 'yellow' : 'green';
                  const proceed = await triggerConfirm({
                      title: `Merge Risk: ${warning.severity.toUpperCase()}`,
                      message: `${warning.message}\n\n${warning.conflictingFiles.length} file(s) may have conflicts.`,
                      details: `Affected: ${warning.conflictingFiles.slice(0, 10).join(', ')}${warning.conflictingFiles.length > 10 ? ` (+${warning.conflictingFiles.length - 10} more)` : ''}`,
                      type: 'warning',
                      confirmText: 'Merge Anyway',
                  });
                  if (!proceed) {
                      setLoadingRuns(false);
                      return;
                  }
              }
          } catch {
              // If conflict detection fails, proceed with merge anyway
          }

          // Prepare author info
          const author = activeProfile?.gitName && activeProfile?.gitEmail
              ? { name: activeProfile.gitName, email: activeProfile.gitEmail }
              : undefined;

          await gitMerge(repo, branchName, author);
          setAlertDialog({
              isOpen: true,
              title: 'Merge Successful',
              message: `Merged "${branchName}" into "${currentBranch}".`,
              type: 'success'
          });
          if (onRefresh) onRefresh();
      } catch (error) {
          // Check if error is due to merge conflicts
          const errorMessage = error.message || '';

          // Multiple indicators of merge conflicts:
          const hasConflictKeyword = errorMessage.includes('conflict') || errorMessage.includes('CONFLICT');
          const hasMergeHead = errorMessage.includes('MERGE_HEAD exists');
          const hasConflictMarkers = errorMessage.includes('Automatic merge failed');

          if (hasConflictKeyword || hasMergeHead || hasConflictMarkers) {
              // Open merge tool for conflict resolution
              if (onOpenMergeTool) {
                  onOpenMergeTool();
                  setAlertDialog({
                      isOpen: true,
                      title: 'Merge Conflicts Detected',
                      message: `Merge conflicts detected when merging "${branchName}" into "${currentBranch}".\n\nThe Merge Tool has been opened to help you resolve these conflicts.`,
                      type: 'info'
                  });
              } else {
                  setAlertDialog({
                      isOpen: true,
                      title: 'Merge Conflicts',
                      message: `Merge conflicts detected when merging "${branchName}" into "${currentBranch}".\n\nPlease resolve conflicts manually using git command line.`,
                      type: 'error'
                  });
              }
          } else {
              setAlertDialog({
                  isOpen: true,
                  title: 'Merge Failed',
                  message: error.message || `Failed to merge branch "${branchName}".`,
                  type: 'error'
              });
          }
      } finally {
          setLoadingRuns(false);
      }
  };

  const confirmDeleteBranch = async () => {
      const branchName = deleteConfirmDialog.branchName;

      try {
          await gitDeleteBranch(repo, branchName);
          setDeleteConfirmDialog({ isOpen: false, branchName: '' });
          // Trigger refresh instead of reload
          if (onRefresh) onRefresh();

          // Show success alert
          setAlertDialog({
              isOpen: true,
              title: 'Branch Deleted',
              message: `Successfully deleted branch "${branchName}".`,
              type: 'success'
          });
      } catch (err) {
          setDeleteConfirmDialog({ isOpen: false, branchName: '' });
          setAlertDialog({
              isOpen: true,
              title: 'Delete Failed',
              message: `Failed to delete branch: ${err.message}`,
              type: 'error'
          });
      }
  };

  // Close context menus on click outside or Escape
  useEffect(() => {
      const handleClick = () => { setContextMenu(null); setTagContextMenu(null); };
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') { setContextMenu(null); setTagContextMenu(null); }
      };
      if (contextMenu || tagContextMenu) {
          document.addEventListener('click', handleClick);
          document.addEventListener('keydown', handleKeyDown);
          return () => {
              document.removeEventListener('click', handleClick);
              document.removeEventListener('keydown', handleKeyDown);
          };
      }
  }, [contextMenu, tagContextMenu]);

  // Close context menus when triggered by parent (e.g., when commit context menu opens)
  useEffect(() => {
      if (contextMenuCloseTrigger > 0) {
          setContextMenu(null);
          setTagContextMenu(null);
      }
  }, [contextMenuCloseTrigger]);

  // Keyboard navigation for context menus
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      const menu = e.currentTarget;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const current = document.activeElement as HTMLElement;
      const idx = items.indexOf(current);
      if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[idx < items.length - 1 ? idx + 1 : 0].focus();
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[idx > 0 ? idx - 1 : items.length - 1].focus();
      } else if (e.key === 'Enter' && idx >= 0) {
          e.preventDefault();
          items[idx].click();
      }
  }, []);

  // Auto-focus first menu item when context menu opens
  const menuAutoFocusRef = useCallback((el: HTMLDivElement | null) => {
      if (!el) return;
      clampMenuRef(el);
      requestAnimationFrame(() => {
          const first = el.querySelector<HTMLElement>('[role="menuitem"]');
          first?.focus();
      });
  }, [clampMenuRef]);

  const SectionHeader = ({ 
    label, 
    count, 
    isOpen, 
    onClick, 
    onRefresh,
    onAdd,
    isLoading,
    icon: Icon 
  }: { label: string, count?: number, isOpen: boolean, onClick: () => void, onRefresh?: () => void, onAdd?: () => void, isLoading?: boolean, icon?: any }) => (
    <div 
      onClick={onClick}
      className="flex items-center px-4 py-1.5 cursor-pointer text-gray-500 hover:text-gray-200 group select-none relative"
    >
      <div className="mr-2 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
      {Icon && <Icon className="w-3.5 h-3.5 mr-2 opacity-70 group-hover:opacity-100" />}
      <span className="text-xs font-bold uppercase tracking-wide flex-1">{label}</span>
      
      {count !== undefined && (
        <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-gray-500 group-hover:text-gray-300">
          {count}
        </span>
      )}

      {onAdd && (
          <div 
            onClick={(e) => { e.stopPropagation(); onAdd(); }} 
            className="ml-2 p-0.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white"
            title="Create New"
          >
              <Plus className="w-3.5 h-3.5" />
          </div>
      )}

      {onRefresh && (
          <div 
            onClick={(e) => { e.stopPropagation(); onRefresh(); }} 
            className={`ml-2 p-1 rounded hover:bg-white/10 ${isLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
            title="Refresh"
          >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-gk-blue' : 'text-gray-500'}`} />
          </div>
      )}
    </div>
  );

  return (
    <div className="w-64 bg-gk-panel flex-shrink-0 flex flex-col border-r border-gk-header select-none h-full">
      {/* Repo Header */}
      <div className="h-12 flex items-center px-4 bg-gk-header border-b border-black/20 shrink-0">
        <div className="flex-1 min-w-0">
            <div className="flex items-center text-gray-200">
                <Folder className="w-3.5 h-3.5 mr-2 text-gray-500" />
                <span className="font-bold truncate text-sm">{repo?.name || 'No Repo'}</span>
            </div>
            {repo && (
                <div className="text-[10px] text-gray-600 truncate flex items-center mt-0.5 ml-5">
                    <GitBranch className="w-3 h-3 mr-1" />
                    {repo.default_branch}
                </div>
            )}
        </div>
        {repo && !repo.isLocal && onCloneRepo && (
            <button
                onClick={() => onCloneRepo(repo)}
                className="ml-2 px-2 py-1 bg-gk-purple text-white text-xs rounded hover:bg-gk-purple/80 transition-colors flex items-center"
                title="Clone this repository locally"
            >
                <Download className="w-3 h-3 mr-1" />
                Clone
            </button>
        )}
      </div>

      {/* Filter Input */}
      <div className="p-3">
        <div className="relative group">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-600 group-focus-within:text-gk-blue" />
            <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter (Cmd+P)"
                className="w-full bg-gk-bg/50 border border-transparent focus:border-gk-blue/50 rounded-md py-1.5 pl-8 pr-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none transition-all"
                aria-label="Filter branches, tags, and remotes"
            />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* BRANCHES - Combines LOCAL and REMOTE */}
        <SectionHeader
            label="Branches"
            count={allBranches.length}
            isOpen={expanded.branches}
            onClick={() => toggle('branches')}
            onAdd={onCreateBranch}
            icon={Layers}
        />
        {expanded.branches && (
          <div className="mb-2">
            {allBranches.map(branch => (
              <div
                key={branch.name}
                onClick={() => !branch.isRemote && !branch.active && onSelectBranch && onSelectBranch(branch.name)}
                onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                onDragOver={(e) => !branch.isRemote && handleDragOver(e, branch.name)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => !branch.isRemote && handleDrop(e, branch.name)}
                className={`group flex items-center px-8 py-1 cursor-pointer text-sm border-l-2 transition-colors ${
                    branch.name === repo?.default_branch
                    ? 'border-gk-accent bg-gk-accent/5 text-gray-200'
                    : dragOverBranch === branch.name
                        ? 'border-gk-blue bg-gk-blue/20 text-white'
                        : branch.isRemote
                          ? 'border-transparent text-gray-600 hover:text-gray-400'
                          : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                {branch.isRemote ? (
                  <Globe className="w-3.5 h-3.5 mr-2 opacity-50" />
                ) : (
                  <GitBranch className={`w-3.5 h-3.5 mr-2 ${branch.name === repo?.default_branch ? 'text-gk-accent' : 'opacity-50'}`} />
                )}
                <span className="truncate">{branch.isRemote ? branch.name.replace('origin/', '') : branch.name}</span>
                {branch.name === repo?.default_branch && !branch.isRemote && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-gk-accent"></div>}
              </div>
            ))}
          </div>
        )}

        {/* GITHUB ACTIONS - For remote repos or local repos with GitHub remote */}
        {canShowGitHub && token && (
          <>
            <SectionHeader
                label="Actions"
                isOpen={expanded.actions}
                onClick={() => toggle('actions')}
                onRefresh={refreshActions}
                isLoading={loadingRuns}
                icon={PlayCircle}
            />
            {expanded.actions && (
                <div className="mb-2">
                    {loadingRuns && runs.length === 0 && <div className="px-8 py-1 text-xs text-gray-500 italic flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Loading...</div>}
                    {fetchError.runs && (
                      <div className="px-8 py-1 text-xs text-gk-red flex items-center justify-between">
                        <span className="italic">{fetchError.runs}</span>
                        <button onClick={refreshActions} className="text-gk-blue hover:text-white text-[10px] flex items-center">
                          <RefreshCw className="w-3 h-3 mr-1" /> Retry
                        </button>
                      </div>
                    )}
                    {!loadingRuns && !fetchError.runs && runs.length === 0 && <div className="px-8 py-1 text-xs text-gray-600 italic">No recent workflows</div>}
                    {runs.map(run => (
                        <div
                            key={run.id}
                            onClick={() => onSelectRun && onSelectRun(run)}
                            className="flex items-center px-8 py-1.5 cursor-pointer text-sm hover:bg-white/5 group"
                        >
                             <div className="mr-2">
                                {run.conclusion === 'success' && <CheckCircle className="w-3.5 h-3.5 text-gk-accent" />}
                                {run.conclusion === 'failure' && <XCircle className="w-3.5 h-3.5 text-gk-red" />}
                                {(run.status === 'in_progress' || run.status === 'queued') && <Loader2 className="w-3.5 h-3.5 text-gk-yellow animate-spin" />}
                                {run.conclusion === 'cancelled' && <XCircle className="w-3.5 h-3.5 text-gray-500" />}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="truncate text-gray-300 group-hover:text-white text-xs font-medium">{run.display_title || run.name}</div>
                                 <div className="truncate text-[10px] text-gray-500">{run.branch} • {run.actor}</div>
                             </div>
                        </div>
                    ))}
                </div>
            )}
          </>
        )}

        {/* PULL REQUESTS - For remote repos or local repos with GitHub remote */}
        {canShowGitHub && token && (
          <>
            <SectionHeader
                label="Pull Requests"
                isOpen={expanded.prs}
                onClick={() => toggle('prs')}
                onRefresh={refreshPrs}
                isLoading={loadingPrs}
                icon={GitPullRequest}
            />
            {expanded.prs && (
                <div className="mb-2">
                    {loadingPrs && prs.length === 0 && <div className="px-8 py-1 text-xs text-gray-500 italic flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Loading...</div>}
                    {fetchError.prs && (
                      <div className="px-8 py-1 text-xs text-gk-red flex items-center justify-between">
                        <span className="italic">{fetchError.prs}</span>
                        <button onClick={refreshPrs} className="text-gk-blue hover:text-white text-[10px] flex items-center">
                          <RefreshCw className="w-3 h-3 mr-1" /> Retry
                        </button>
                      </div>
                    )}
                    {!loadingPrs && !fetchError.prs && prs.length === 0 && <div className="px-8 py-1 text-xs text-gray-600 italic">No open pull requests</div>}
                    {(() => {
                      // Filter PRs to show only those relevant to current branch
                      const currentBranch = repo?.default_branch;
                      const relevantPrs = prs.filter(pr =>
                        // Show PRs where current branch is the head (source) or base (target)
                        pr.head?.ref === currentBranch || pr.base?.ref === currentBranch
                      );

                      if (!loadingPrs && relevantPrs.length === 0 && prs.length > 0) {
                        return <div className="px-8 py-1 text-xs text-gray-600 italic">No PRs for current branch</div>;
                      }

                      return relevantPrs.map(pr => (
                        <div
                            key={pr.id}
                            className="flex items-center px-8 py-1.5 cursor-pointer text-sm hover:bg-white/5 group"
                            onClick={() => onSelectPR && onSelectPR(pr)}
                        >
                             <div className="mr-2">
                                 <GitPullRequest className={`w-3.5 h-3.5 ${pr.status === 'open' ? 'text-gk-accent' : 'text-gk-purple'}`} />
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="truncate text-gray-300 group-hover:text-white text-xs font-medium">{pr.title}</div>
                                 <div className="truncate text-[10px] text-gray-500">
                                   #{pr.number} • {pr.author}
                                   {pr.base?.ref && pr.head?.ref && (
                                     <span className="ml-1 text-gk-blue">{pr.head.ref}→{pr.base.ref}</span>
                                   )}
                                 </div>
                             </div>
                        </div>
                      ));
                    })()}
                </div>
            )}
          </>
        )}

        {/* ISSUES - For remote repos or local repos with GitHub remote */}
        {canShowGitHub && token && (
          <>
            <SectionHeader
                label="Issues"
                isOpen={expanded.issues}
                onClick={() => toggle('issues')}
                onRefresh={refreshIssues}
                isLoading={loadingIssues}
                icon={AlertCircle}
            />
            {expanded.issues && (
                <div className="mb-2">
                    {loadingIssues && issues.length === 0 && <div className="px-8 py-1 text-xs text-gray-500 italic flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Loading...</div>}
                    {fetchError.issues && (
                      <div className="px-8 py-1 text-xs text-gk-red flex items-center justify-between">
                        <span className="italic">{fetchError.issues}</span>
                        <button onClick={refreshIssues} className="text-gk-blue hover:text-white text-[10px] flex items-center">
                          <RefreshCw className="w-3 h-3 mr-1" /> Retry
                        </button>
                      </div>
                    )}
                    {!loadingIssues && !fetchError.issues && issues.length === 0 && <div className="px-8 py-1 text-xs text-gray-600 italic">No open issues</div>}
                    {issues.map(issue => (
                        <div
                            key={issue.id}
                            className="flex items-center px-8 py-1.5 cursor-pointer text-sm hover:bg-white/5 group"
                            onClick={() => onSelectIssue && onSelectIssue(issue)}
                        >
                             <div className="mr-2">
                                <AlertCircle className="w-3.5 h-3.5 text-gk-red" />
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="truncate text-gray-300 group-hover:text-white text-xs font-medium">{issue.title}</div>
                                 <div className="truncate text-[10px] text-gray-500">#{issue.number} • {issue.author}</div>
                             </div>
                        </div>
                    ))}
                </div>
            )}
          </>
        )}
        
        {/* TAGS */}
        <SectionHeader
            label={`Tags${filteredTags.length > 0 ? ` (${filteredTags.length})` : ''}`}
            isOpen={expanded.tags}
            onClick={() => toggle('tags')}
            icon={Tag}
        />
        {expanded.tags && (
            <div className="px-2 py-1">
                {filteredTags.length === 0 && (
                    <div className="text-xs text-gray-600 italic px-2 py-1">No tags</div>
                )}
                {filteredTags.map(tag => (
                    <div
                        key={tag}
                        className="flex items-center px-2 py-1.5 hover:bg-white/5 rounded group text-sm"
                        onContextMenu={(e) => handleTagContextMenu(e, tag)}
                    >
                        <Tag className="w-3 h-3 mr-2 text-gk-yellow flex-shrink-0" />
                        <span className="flex-1 truncate text-gray-300 text-xs">{tag}</span>
                        {onDeleteTag && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteTag(tag); }}
                                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gk-red transition-opacity"
                                title="Delete tag"
                            >
                                <span className="text-xs">✕</span>
                            </button>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Branch Context Menu */}
      {contextMenu && (
        <div
          ref={menuAutoFocusRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="fixed bg-gk-panel border border-gk-header rounded-lg shadow-2xl py-1 z-50 min-w-[220px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Checkout - only for non-active branches */}
          {!contextMenu.branch.active && onSelectBranch && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onSelectBranch(contextMenu.branch.name); setContextMenu(null); }}
            >
              <GitBranch className="w-4 h-4 mr-2 text-gk-accent" />
              <span>Checkout</span>
            </div>
          )}

          {/* Merge option - only for non-active branches */}
          {repo?.isLocal && !contextMenu.branch.active && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={handleMergeBranch}
            >
              <GitMerge className="w-4 h-4 mr-2 text-gk-blue" />
              <span>Merge into Current</span>
            </div>
          )}

          {/* Rebase onto current */}
          {onRebaseBranch && !contextMenu.branch.active && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onRebaseBranch(contextMenu.branch.name); setContextMenu(null); }}
            >
              <GitCommit className="w-4 h-4 mr-2 text-gk-purple" />
              <span>Rebase onto Current</span>
            </div>
          )}

          {/* Compare branch */}
          {onCompareBranch && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onCompareBranch(contextMenu.branch.name); setContextMenu(null); }}
            >
              <Eye className="w-4 h-4 mr-2 text-gk-blue" />
              <span>Compare Branch</span>
            </div>
          )}

          <div className="h-[1px] bg-white/10 my-1" />

          {/* Rename branch */}
          {onRenameBranch && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onRenameBranch(contextMenu.branch.name); setContextMenu(null); }}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              <span>Rename Branch</span>
            </div>
          )}

          {/* Set upstream */}
          {onSetUpstream && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onSetUpstream(contextMenu.branch.name); setContextMenu(null); }}
            >
              <ArrowUpCircle className="w-4 h-4 mr-2 text-gk-accent" />
              <span>Set Upstream</span>
            </div>
          )}

          {/* Reset branch */}
          {onResetBranch && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onResetBranch(contextMenu.branch.name); setContextMenu(null); }}
            >
              <RotateCcw className="w-4 h-4 mr-2 text-gk-yellow" />
              <span>Reset Branch</span>
            </div>
          )}

          <div className="h-[1px] bg-white/10 my-1" />

          {/* AI Explain */}
          {onAIExplainBranch && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onAIExplainBranch(contextMenu.branch.name); setContextMenu(null); }}
            >
              <Sparkles className="w-4 h-4 mr-2 text-gk-purple" />
              <span>AI Explain Branch</span>
            </div>
          )}

          {/* AI Generate PR */}
          {onAIGeneratePR && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onAIGeneratePR(contextMenu.branch.name); setContextMenu(null); }}
            >
              <Sparkles className="w-4 h-4 mr-2 text-gk-purple" />
              <span>AI Generate PR Description</span>
            </div>
          )}

          {/* Delete option - only show if NOT a protected branch and not active */}
          {(() => {
            const branchName = contextMenu.branch.name;
            const isDefaultBranch = branchName === repo?.default_branch;
            const isProtectedBranch = branchName === 'main' || branchName === 'master';
            const canDelete = !isDefaultBranch && !isProtectedBranch && !contextMenu.branch.active;

            return canDelete && (
              <>
                <div className="h-[1px] bg-white/10 my-1" />
                <div
                  role="menuitem" tabIndex={-1}
                  className="flex items-center px-4 py-2 text-sm text-gk-red hover:bg-gk-red/10 cursor-pointer focus:bg-gk-red/10 outline-none"
                  onClick={handleDeleteBranch}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  <span>Delete Branch</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Tag Context Menu */}
      {tagContextMenu && (
        <div
          ref={menuAutoFocusRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="fixed bg-gk-panel border border-gk-header rounded-lg shadow-2xl py-1 z-50 min-w-[200px]"
          style={{
            left: `${tagContextMenu.x}px`,
            top: `${tagContextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {onCheckoutTag && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onCheckoutTag(tagContextMenu.tag); setTagContextMenu(null); }}
            >
              <Tag className="w-4 h-4 mr-2 text-gk-yellow" />
              <span>Checkout Tag</span>
            </div>
          )}
          {onPushTag && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onPushTag(tagContextMenu.tag); setTagContextMenu(null); }}
            >
              <ArrowUpCircle className="w-4 h-4 mr-2 text-gk-accent" />
              <span>Push Tag to Remote</span>
            </div>
          )}
          <div className="h-[1px] bg-white/10 my-1" />
          {onCopyTagName && (
            <div
              role="menuitem" tabIndex={-1}
              className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer focus:bg-white/5 focus:text-white outline-none"
              onClick={() => { onCopyTagName(tagContextMenu.tag); setTagContextMenu(null); }}
            >
              <Copy className="w-4 h-4 mr-2" />
              <span>Copy Tag Name</span>
            </div>
          )}
          {onDeleteTag && (
            <>
              <div className="h-[1px] bg-white/10 my-1" />
              <div
                role="menuitem" tabIndex={-1}
                className="flex items-center px-4 py-2 text-sm text-gk-red hover:bg-gk-red/10 cursor-pointer focus:bg-gk-red/10 outline-none"
                onClick={() => { onDeleteTag(tagContextMenu.tag); setTagContextMenu(null); }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                <span>Delete Tag</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        isOpen={deleteConfirmDialog.isOpen}
        onClose={() => setDeleteConfirmDialog({ isOpen: false, branchName: '' })}
        title="Confirm Delete Branch"
        type="info"
        onConfirm={confirmDeleteBranch}
      >
        <div className="space-y-3">
          <p className="text-gray-200">
            Are you sure you want to delete the branch <span className="font-bold text-gk-accent">{deleteConfirmDialog.branchName}</span>?
          </p>
          <p className="text-yellow-400 text-sm">
            ⚠️ This action cannot be undone. All commits unique to this branch will be lost.
          </p>
        </div>
      </AlertDialog>

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
        title={alertDialog.title}
        type={alertDialog.type}
        onConfirm={() => setAlertDialog({ ...alertDialog, isOpen: false })}
      >
        <p className="text-gray-200">{alertDialog.message}</p>
      </AlertDialog>

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
      />
    </div>
  );
};

export default React.memo(Sidebar);