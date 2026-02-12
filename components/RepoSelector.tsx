import React, { useEffect, useState, useMemo } from 'react';
import { Repository, User, Workspace } from '../types';
import { fetchRepositories, fetchBranches } from '../services/githubService';
import { isGitRepo, initGitRepo, getCurrentBranch, gitCloneWithOptions } from '../services/localGitService';
import { Search, Folder, Lock, LogOut, HardDrive, Laptop, Layers, Plus, Terminal, Keyboard, Trash2, Github, ArrowLeft, PlusCircle, ExternalLink, X, Download, FolderOpen, GitBranch, ChevronRight, Star, Settings2 } from 'lucide-react';
import { gitClone } from '../services/localGitService';
import PromptModal from './PromptModal';
import ConfirmDialog from './ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import { isElectron, getPlatform, Platform } from '../utils/platform';

interface CloneOptions {
  depth?: number;
  branch?: string;
  singleBranch?: boolean;
}

interface RepoSelectorProps {
  user: User | null;
  token: string;
  onSelect: (repo: Repository) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

const RepoSelector: React.FC<RepoSelectorProps> = ({ user, token, onSelect, onLogout, onOpenSettings }) => {
  const [repos, setRepos] = useState<Repository[]>([]);
  // Initialize workspaces from local storage or default
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
      try {
          const saved = localStorage.getItem('gk_workspaces');
          return saved ? JSON.parse(saved) : [{ id: 'default', name: 'My Repositories', repos: [] }];
      } catch (e) {
          return [{ id: 'default', name: 'My Repositories', repos: [] }];
      }
  });
  
  // Persist active workspace ID
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
      return localStorage.getItem('gk_active_workspace') || 'default';
  });
  
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showRemoteBrowser, setShowRemoteBrowser] = useState(false);

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

  // Confirmation Dialog
  const { dialogState: confirmState, confirm: triggerConfirm, handleConfirm: onConfirmYes, handleCancel: onConfirmNo } = useConfirmDialog();
  const { showAlert } = useAlert();

  // Clone Options Modal State
  const [cloneModal, setCloneModal] = useState<{
    isOpen: boolean;
    repo: Repository | null;
    branches: string[];
    loadingBranches: boolean;
    options: CloneOptions;
  }>({
    isOpen: false,
    repo: null,
    branches: [],
    loadingBranches: false,
    options: {
      depth: undefined,
      branch: undefined,
      singleBranch: false,
    },
  });

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  // Get platform for conditional rendering
  const platform = getPlatform();

  // App version
  const [appVersion, setAppVersion] = useState<string>('');

  // Fetch app version on mount
  useEffect(() => {
      try {
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.invoke('updater:getVersion').then((version: string) => setAppVersion(version));
      } catch {
          // Fallback for non-electron environment
      }
  }, []);

  // Helper to ensure state and storage are in sync immediately
  // Save to localStorage FIRST (synchronously) before updating state
  const updateWorkspaces = (updater: (prev: Workspace[]) => Workspace[]) => {
      // Get current workspaces from localStorage to ensure we have latest
      let currentWorkspaces = workspaces;
      try {
          const saved = localStorage.getItem('gk_workspaces');
          if (saved) currentWorkspaces = JSON.parse(saved);
      } catch {}

      // Compute new state
      const newState = updater(currentWorkspaces);

      // Save to localStorage FIRST (synchronous, guaranteed)
      try {
          localStorage.setItem('gk_workspaces', JSON.stringify(newState));
      } catch (e) {
          console.error("Failed to save workspaces", e);
      }

      // Then update React state
      setWorkspaces(newState);
  };

  const handleSetActiveWorkspace = (id: string) => {
      setActiveWorkspaceId(id);
      localStorage.setItem('gk_active_workspace', id);
      setShowRemoteBrowser(false);
  };

  // Reset remote repos if token is cleared
  useEffect(() => {
      if (!token) {
          setRepos([]);
          setShowRemoteBrowser(false);
      }
  }, [token]);

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

  const fetchRemoteRepos = async () => {
    if (repos.length === 0 && token) {
        setLoading(true);
        try {
          const data = await fetchRepositories(token);
          setRepos(data);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
    }
  };

  const handleToggleRemoteBrowser = async () => {
      if (showRemoteBrowser) {
          setShowRemoteBrowser(false);
      } else {
          setShowRemoteBrowser(true);
          await fetchRemoteRepos();
      }
  };

  const getLocalRepo = async (type: 'system' | 'manual'): Promise<Repository | null> => {
      try {
          if (type === 'system') {
              // Use Electron's dialog via ipcRenderer
              const { ipcRenderer } = (window as any).require('electron');
              const path = await ipcRenderer.invoke('dialog:openDirectory');
              if (path) {
                  const name = path.split(/[\\/]/).pop() || 'Repository';
                  return {
                      id: 'sys-' + Date.now(),
                      name: name,
                      full_name: path,
                      default_branch: 'HEAD',
                      private: true,
                      isLocal: true,
                      handle: path
                  };
              }
          } else if (type === 'manual') {
              // Detect platform for default path
              const platform = getPlatform();
              const defaultPath = platform === 'windows'
                  ? 'C:\\Projects\\MyRepo'
                  : '/home/user/projects/my-repo';

              const path = await triggerPrompt("Enter full system path:", defaultPath);
              if (path) {
                  const name = path.split(/[\\/]/).pop() || 'System Repo';
                  return {
                      id: 'sys-' + Date.now(),
                      name: name,
                      full_name: path,
                      default_branch: 'HEAD',
                      private: true,
                      isLocal: true,
                      handle: path
                  };
              }
          }
      } catch (err) {
          console.error("Failed to open local directory", err);
          showAlert('Error', "Failed to open directory: " + (err as Error).message, 'error');
      }
      return null;
  };

  // Check if a repo already exists in a workspace
  const isRepoDuplicate = (existingRepos: Repository[], newRepo: Repository): boolean => {
      return existingRepos.some(existing => {
          // For local repos: compare paths (handle or full_name)
          if (newRepo.isLocal && existing.isLocal) {
              const newPath = (newRepo.handle || newRepo.full_name || '').toLowerCase();
              const existingPath = (existing.handle || existing.full_name || '').toLowerCase();
              // Normalize path separators for comparison
              const normalizedNew = newPath.replace(/\\/g, '/');
              const normalizedExisting = existingPath.replace(/\\/g, '/');
              return normalizedNew === normalizedExisting;
          }
          // For remote repos: compare by full_name (owner/repo format)
          if (!newRepo.isLocal && !existing.isLocal) {
              return existing.full_name.toLowerCase() === newRepo.full_name.toLowerCase();
          }
          // Mixed local/remote - not duplicates
          return false;
      });
  };

  const saveRepoToWorkspace = (repo: Repository): boolean => {
      // Check for duplicates first
      const currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
      if (currentWorkspace && isRepoDuplicate(currentWorkspace.repos, repo)) {
          const repoType = repo.isLocal ? 'local' : 'remote';
          showAlert(
              'Duplicate Repository',
              `This ${repoType} repository is already in the workspace.`,
              'warning'
          );
          return false;
      }

      updateWorkspaces(prev => {
          const updated = prev.map(ws => {
              if (ws.id === activeWorkspaceId) {
                  return { ...ws, repos: [repo, ...ws.repos] }; // Add to top
              }
              return ws;
          });

          return updated;
      });
      return true;
  };

  const handleOpenLocal = async (type: 'system' | 'manual') => {
      const repo = await getLocalRepo(type);
      if (repo) {
          // Check if this repo already exists in the workspace using robust path comparison
          const existingRepo = activeWorkspace.repos.find(r => {
              if (repo.isLocal && r.isLocal) {
                  const newPath = (repo.handle || repo.full_name || '').toLowerCase().replace(/\\/g, '/');
                  const existingPath = (r.handle || r.full_name || '').toLowerCase().replace(/\\/g, '/');
                  return newPath === existingPath;
              }
              return false;
          });

          if (existingRepo) {
              // Resolve current branch before selecting
              try {
                  const branchName = await getCurrentBranch(existingRepo);
                  if (branchName && branchName !== 'HEAD') {
                      existingRepo.default_branch = branchName;
                  }
              } catch { /* keep existing */ }
              onSelect(existingRepo);
              return;
          }

          const isRepo = await isGitRepo(repo);
          if (!isRepo) {
              const initOk = await triggerConfirm({
                  title: 'Initialize Git Repository',
                  message: `The folder "${repo.name}" is not a Git repository. Initialize Git here?`,
                  type: 'info',
                  confirmText: 'Initialize',
              });
              if (!initOk) return;
              try {
                  await initGitRepo(repo);
              } catch (e) {
                  showAlert('Git Init Error', "Failed to initialize git: " + e.message, 'error');
                  return;
              }
          }

          // Resolve actual branch name instead of 'HEAD'
          try {
              const branchName = await getCurrentBranch(repo);
              if (branchName && branchName !== 'HEAD') {
                  repo.default_branch = branchName;
              }
          } catch {
              // Keep 'HEAD' if resolution fails
          }

          const added = saveRepoToWorkspace(repo);
          if (added) {
              onSelect(repo);
          }
          // If duplicate, alert was already shown by saveRepoToWorkspace
      }
  };

  // When adding a remote repo to workspace from the browser
  const handleAddRemoteToWorkspace = (repo: Repository) => {
      const added = saveRepoToWorkspace(repo);
      if (added) {
          setShowRemoteBrowser(false);
      }
      // If duplicate, keep the browser open so user can choose another
  };

  // Open clone options modal for a repo
  const openCloneModal = async (repo: Repository) => {
      if (!isElectron()) {
          showAlert('Not Available', 'Clone is only supported in Electron/desktop mode. Please use command line: git clone', 'warning');
          return;
      }

      setCloneModal({
        isOpen: true,
        repo,
        branches: [repo.default_branch],
        loadingBranches: true,
        options: {
          depth: undefined,
          branch: repo.default_branch,
          singleBranch: false,
        },
      });

      // Fetch branches in background
      try {
        const parts = repo.full_name.split('/');
        if (parts.length < 2) {
          throw new Error('Invalid repository name format');
        }
        const [owner, repoName] = parts;
        const branchData = await fetchBranches(token, owner, repoName);
        const branchNames = branchData.map((b: any) => b.name);
        setCloneModal(prev => ({
          ...prev,
          branches: branchNames.length > 0 ? branchNames : [repo.default_branch],
          loadingBranches: false,
        }));
      } catch (e) {
        console.error('Failed to fetch branches:', e);
        setCloneModal(prev => ({
          ...prev,
          loadingBranches: false,
        }));
      }
  };

  // Clone a remote repo to local filesystem with options
  const handleCloneRemoteRepo = async (repo: Repository, options?: CloneOptions) => {
      if (!isElectron()) {
          showAlert('Not Available', 'Clone is only supported in Electron/desktop mode. Please use command line: git clone', 'warning');
          return;
      }

      try {
          // Open directory picker
          const electronAPI = (window as any).electronAPI;
          let selectedPath: string | null = null;

          if (electronAPI && electronAPI.openDirectory) {
              selectedPath = await electronAPI.openDirectory();
          } else {
              const { ipcRenderer } = (window as any).require('electron');
              const result = await ipcRenderer.invoke('dialog:openDirectory');
              selectedPath = result;
          }

          if (!selectedPath) return;

          const targetDir = `${selectedPath}/${repo.name}`;

          // Check if this path already exists in the workspace before cloning
          const clonedRepoCheck: Repository = {
              ...repo,
              id: `local-${repo.id}`,
              isLocal: true,
              handle: targetDir,
              full_name: targetDir,
          };

          if (isRepoDuplicate(activeWorkspace.repos, clonedRepoCheck)) {
              showAlert(
                  'Duplicate Repository',
                  `A repository at this location is already in the workspace: ${targetDir}`,
                  'warning'
              );
              return;
          }

          // Perform clone with options
          if (options && (options.depth || options.branch || options.singleBranch)) {
              await gitCloneWithOptions(repo, token, targetDir, options);
          } else {
              await gitClone(repo, token, targetDir);
          }

          // Create new Repository object for the cloned repo
          const clonedRepo: Repository = {
              ...repo,
              id: `local-${repo.id}`,
              isLocal: true,
              handle: targetDir,
              default_branch: options?.branch || repo.default_branch,
          };

          // Add to workspace (should always succeed since we checked above)
          saveRepoToWorkspace(clonedRepo);

          // Close modal if open
          setCloneModal(prev => ({ ...prev, isOpen: false }));

          // Switch to cloned repo
          onSelect(clonedRepo);
      } catch (error) {
          showAlert('Clone Error', `Clone failed: ${error.message || 'Unknown error'}`, 'error');
      }
  };

  // Handle clone modal confirm
  const handleCloneModalConfirm = () => {
      if (cloneModal.repo) {
          handleCloneRemoteRepo(cloneModal.repo, cloneModal.options);
      }
  };

  const handleCreateWorkspace = async () => {
      const name = await triggerPrompt("Workspace Name:");
      if (name) {
          const newId = `ws-${Date.now()}`;
          const newWs = { id: newId, name, repos: [] };
          updateWorkspaces(prev => [...prev, newWs]);
          handleSetActiveWorkspace(newId);
      }
  };

  const handleDeleteWorkspace = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (id === 'default') return;
      const ok = await triggerConfirm({
          title: 'Delete Workspace',
          message: 'Are you sure you want to delete this workspace? All repositories will be removed.',
          type: 'danger',
          confirmText: 'Delete',
      });
      if (ok) {
          updateWorkspaces(prev => prev.filter(w => w.id !== id));
          if (activeWorkspaceId === id) handleSetActiveWorkspace('default');
      }
  }

  const removeRepoFromWorkspace = async (e: React.MouseEvent, repoId: string | number) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation(); // Ensure row click is not triggered
      const ok = await triggerConfirm({
          title: 'Remove Repository',
          message: 'Remove this repository from the list? (Does not delete files)',
          type: 'warning',
          confirmText: 'Remove',
      });
      if (ok) {
          const workspace = activeWorkspace;
          if (workspace) {
              const updatedWorkspace = { ...workspace, repos: workspace.repos.filter(r => r.id !== repoId) };
              updateWorkspaces(prev => prev.map(w => w.id === updatedWorkspace.id ? updatedWorkspace : w));
          }
      }
  }

  const handleRepoClick = async (repo: Repository) => {
      // Check for stale browser handle if not electron
      if (!isElectron() && repo.isLocal && !repo.handle) {
          const removeOk = await triggerConfirm({
              title: 'Browser Permission Lost',
              message: `"${repo.name}" — Browsers do not allow persisting file access across reloads. Remove from list?`,
              type: 'warning',
              confirmText: 'Remove',
          });
          if (removeOk) {
             removeRepoFromWorkspace({ stopPropagation: () => {}, nativeEvent: { stopImmediatePropagation: () => {} } } as any, repo.id);
          }
          return;
      }
      // Resolve the actual checked-out branch before entering the repo
      if (repo.isLocal) {
          try {
              const branchName = await getCurrentBranch(repo);
              if (branchName && branchName !== 'HEAD') {
                  repo.default_branch = branchName;
              }
          } catch { /* keep existing */ }
      }
      onSelect(repo);
  }

  const filteredRemoteRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  // Filter for workspace repos search
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [repoTypeFilter, setRepoTypeFilter] = useState<'all' | 'local' | 'remote'>(() => {
    const saved = localStorage.getItem('gk_repo_type_filter');
    return (saved as 'all' | 'local' | 'remote') || 'all';
  });

  // Persist repo type filter to localStorage
  useEffect(() => {
    localStorage.setItem('gk_repo_type_filter', repoTypeFilter);
  }, [repoTypeFilter]);

  const toggleFavorite = (e: React.MouseEvent, repoId: string | number) => {
    e.stopPropagation();
    updateWorkspaces(prev => prev.map(ws => {
      if (ws.id === activeWorkspaceId) {
        return {
          ...ws,
          repos: ws.repos.map(r =>
            r.id === repoId ? { ...r, isFavorite: !r.isFavorite } : r
          )
        };
      }
      return ws;
    }));
  };

  const filteredWorkspaceRepos = useMemo(() => {
    if (!activeWorkspace?.repos) return [];

    const filtered = activeWorkspace.repos.filter(r => {
      // Text search filter
      const matchesSearch = r.name.toLowerCase().includes(workspaceSearch.toLowerCase()) ||
        r.full_name.toLowerCase().includes(workspaceSearch.toLowerCase());

      // Type filter
      const matchesType = repoTypeFilter === 'all' ? true :
        repoTypeFilter === 'local' ? r.isLocal :
        !r.isLocal;

      return matchesSearch && matchesType;
    });

    // Sort: favorites first, then by name
    return filtered.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [activeWorkspace?.repos, workspaceSearch, repoTypeFilter]);

  return (
    <div className="fixed inset-0 z-40 bg-gk-bg flex flex-col">
      <div className="h-16 bg-gk-header border-b border-black/20 flex items-center justify-between px-6">
        <div className="flex items-center">
            <span className="font-bold text-xl text-gray-200">GitKraken-ish</span>
        </div>
        <div className="flex items-center space-x-4">
            <button 
                onClick={onOpenSettings}
                className="flex items-center text-sm text-gray-400 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded transition-colors group"
                title="Open Settings"
            >
                {user ? (
                    <>
                        <img src={user.avatar_url} className="w-6 h-6 rounded-full mr-2 border border-transparent group-hover:border-white/20" />
                        <span className="font-medium">{user.login}</span>
                    </>
                ) : (
                    <>
                        <Laptop className="w-5 h-5 mr-2" />
                        <span className="font-medium">Local Mode</span>
                    </>
                )}
            </button>
            <button onClick={onLogout} className="p-2 hover:bg-white/5 rounded text-gray-500 hover:text-white" title="Logout / Reset">
                <LogOut className="w-4 h-4" />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Workspaces Sidebar */}
        <div className="w-64 bg-gk-panel border-r border-gk-header flex flex-col">
            <div className="flex-1 p-4">
                <div className="flex items-center justify-between mb-4 text-gray-400 text-xs font-bold uppercase">
                    <span>Workspaces</span>
                    <button
                        onClick={handleCreateWorkspace}
                        className="hover:text-white transition-colors"
                        title="Create new workspace"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                {workspaces.map(ws => (
                    <div
                        key={ws.id}
                        onClick={() => handleSetActiveWorkspace(ws.id)}
                        className={`flex items-center p-2 rounded cursor-pointer mb-1 group text-sm transition-all ${
                            activeWorkspaceId === ws.id
                            ? 'bg-gk-blue/20 text-white border-l-2 border-gk-blue'
                            : 'hover:bg-white/5 text-gray-400 border-l-2 border-transparent'
                        }`}
                    >
                        <Layers className={`w-4 h-4 mr-2 ${activeWorkspaceId === ws.id ? 'text-gk-blue' : 'text-gray-500 group-hover:text-gray-300'}`} />
                        <span className="flex-1 truncate font-medium">{ws.name}</span>
                        <span className="text-[10px] bg-black/20 px-1.5 rounded text-gray-500 ml-2 group-hover:text-gray-400">
                            {ws.repos.length}
                        </span>
                        {ws.id !== 'default' && (
                            <button
                                onClick={(e) => handleDeleteWorkspace(e, ws.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-gk-red transition-opacity ml-1"
                                title="Delete Workspace"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Version Footer */}
            <div className="px-4 py-2 border-t border-gk-header bg-gk-header/50 shrink-0">
                <div className="text-[10px] text-gray-300 flex items-center justify-center">
                    <span>GitKraken-ish</span>
                    {appVersion && <span className="ml-1 text-gray-400">v{appVersion}</span>}
                </div>
            </div>
        </div>

        {/* Workspace Content */}
        <div className="flex-1 p-8 overflow-hidden flex flex-col items-center relative">
            
            {/* Overlay for Remote Browser */}
            {showRemoteBrowser && (
                <div className="absolute inset-0 bg-gk-bg z-20 flex flex-col p-8 animate-fade-in">
                    <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-white flex items-center">
                                <Github className="w-6 h-6 mr-3" />
                                Select Repository to Add
                            </h3>
                            <button onClick={() => setShowRemoteBrowser(false)} className="text-gray-500 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="mb-4 relative">
                            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                            <input 
                                type="text"
                                placeholder="Filter your GitHub repositories..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-gk-panel border border-gk-header rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:border-gk-blue focus:outline-none"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto bg-gk-panel border border-gk-header rounded-lg custom-scrollbar">
                            {loading ? (
                                <div className="flex items-center justify-center h-40 text-gray-500">Loading repositories...</div>
                            ) : (
                                <div className="divide-y divide-black/20">
                                    {filteredRemoteRepos.map(repo => (
                                        <div 
                                            key={repo.id}
                                            onClick={() => handleAddRemoteToWorkspace(repo)}
                                            className="p-4 hover:bg-white/5 cursor-pointer flex items-center group transition-colors"
                                        >
                                            <div className="w-10 h-10 bg-gk-blue/10 rounded flex items-center justify-center mr-4 text-gk-blue group-hover:bg-gk-blue group-hover:text-white transition-colors">
                                                <Folder className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-medium text-gray-200 group-hover:text-white">{repo.full_name}</h3>
                                                <p className="text-xs text-gray-500 mt-1">Default: {repo.default_branch}</p>
                                            </div>
                                            {repo.private && <Lock className="w-4 h-4 text-gray-600 mr-2" />}
                                            <div className="flex items-center space-x-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleAddRemoteToWorkspace(repo); }}
                                                    className="opacity-0 group-hover:opacity-100 bg-gk-accent text-gk-bg text-xs font-bold px-2 py-1 rounded transition-opacity"
                                                >
                                                    Add
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openCloneModal(repo); }}
                                                    className="opacity-0 group-hover:opacity-100 bg-gk-purple text-white text-xs font-bold px-2 py-1 rounded transition-opacity flex items-center"
                                                    title="Clone to local filesystem"
                                                >
                                                    <Download className="w-3 h-3 mr-1" />
                                                    Clone
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredRemoteRepos.length === 0 && (
                                        <div className="p-8 text-center text-gray-500">No repositories found matching filter</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-4xl flex flex-col h-full animate-fade-in">
                {/* Header with Search */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-200 flex items-center">
                            {activeWorkspace?.name}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            {activeWorkspace?.repos.length === 0
                                ? 'No repositories added yet'
                                : `${filteredWorkspaceRepos.length} of ${activeWorkspace?.repos.length} repositories`
                            }
                        </p>
                    </div>
                    {activeWorkspace?.repos.length > 0 && (
                        <div className="flex items-center gap-3">
                            {/* Type Filter */}
                            <div className="flex items-center bg-gk-panel border border-gk-header rounded-lg p-1">
                                <button
                                    onClick={() => setRepoTypeFilter('all')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                        repoTypeFilter === 'all'
                                            ? 'bg-gk-blue text-white'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setRepoTypeFilter('local')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                                        repoTypeFilter === 'local'
                                            ? 'bg-gk-purple text-white'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    <HardDrive className="w-3 h-3" />
                                    Local
                                </button>
                                <button
                                    onClick={() => setRepoTypeFilter('remote')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                                        repoTypeFilter === 'remote'
                                            ? 'bg-gk-blue text-white'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    <Github className="w-3 h-3" />
                                    Remote
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search repositories..."
                                    value={workspaceSearch}
                                    onChange={(e) => setWorkspaceSearch(e.target.value)}
                                    className="bg-gk-panel border border-gk-header rounded-lg py-2 pl-9 pr-4 text-sm text-white placeholder-gray-600 focus:border-gk-blue focus:outline-none w-64"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons - Clean Design */}
                <div className="flex items-center gap-3 mb-6">
                    {/* Open System - Primary Action */}
                    <button
                        onClick={() => handleOpenLocal('system')}
                        disabled={!isElectron()}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                            isElectron()
                                ? 'bg-gk-purple text-white hover:bg-gk-purple/90 shadow-lg shadow-gk-purple/20'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        }`}
                        title={isElectron() ? 'Open local repository with full Git support' : 'Only available in Electron mode'}
                    >
                        <FolderOpen className="w-4 h-4" />
                        {isElectron() ? 'Open Repository' : 'Open (Electron Only)'}
                    </button>

                    {/* Add Remote - Secondary Action */}
                    {token ? (
                        <button
                            onClick={handleToggleRemoteBrowser}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gk-panel border border-gk-header text-gray-300 rounded-lg font-medium text-sm hover:border-gk-blue hover:text-white transition-all"
                        >
                            <Github className="w-4 h-4" />
                            Add from GitHub
                        </button>
                    ) : (
                        <button
                            onClick={() => showAlert('Login Required', 'Please login with GitHub first', 'info')}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gk-panel border border-gk-header text-gray-500 rounded-lg font-medium text-sm cursor-not-allowed"
                        >
                            <Github className="w-4 h-4" />
                            Add from GitHub
                        </button>
                    )}

                    {/* Manual Path - Tertiary (Electron only) */}
                    {isElectron() && (
                        <button
                            onClick={() => handleOpenLocal('manual')}
                            className="flex items-center gap-2 px-3 py-2.5 text-gray-500 hover:text-gray-300 font-medium text-sm transition-colors"
                            title="Enter repository path manually"
                        >
                            <Keyboard className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Repository List - Redesigned */}
                <div className="flex-1 overflow-y-auto">
                    {activeWorkspace?.repos.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-gray-500 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                            <div className="w-16 h-16 rounded-full bg-gk-panel flex items-center justify-center mb-4">
                                <Layers className="w-8 h-8 opacity-40" />
                            </div>
                            <p className="text-lg font-medium text-gray-400">No repositories yet</p>
                            <p className="text-sm text-gray-600 mt-1">Add a repository to get started</p>
                        </div>
                    ) : filteredWorkspaceRepos.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                            <Search className="w-12 h-12 mb-4 opacity-30" />
                            <p className="text-lg font-medium text-gray-400">No repositories found</p>
                            <p className="text-sm text-gray-600 mt-1">
                                {repoTypeFilter !== 'all'
                                    ? `Try a different filter or search term (showing ${repoTypeFilter} only)`
                                    : 'Try a different search term'}
                            </p>
                            {repoTypeFilter !== 'all' && (
                                <button
                                    onClick={() => { setRepoTypeFilter('all'); setWorkspaceSearch(''); }}
                                    className="mt-3 text-xs text-gk-blue hover:text-gk-blue/80"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredWorkspaceRepos.map(repo => (
                                <div
                                    key={repo.id}
                                    onClick={() => handleRepoClick(repo)}
                                    className="group flex items-center p-4 bg-gk-panel border border-gk-header rounded-xl hover:border-gk-blue/50 hover:bg-white/[0.02] cursor-pointer transition-all"
                                >
                                    {/* Icon */}
                                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center mr-4 flex-shrink-0 ${
                                        repo.isLocal
                                            ? 'bg-gk-purple/10 text-gk-purple'
                                            : 'bg-gk-blue/10 text-gk-blue'
                                    }`}>
                                        {repo.isLocal ? <HardDrive className="w-5 h-5" /> : <Github className="w-5 h-5" />}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-200 group-hover:text-white truncate">
                                                {repo.name}
                                            </h3>
                                            {repo.isLocal && (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gk-purple/10 text-gk-purple border border-gk-purple/20">
                                                    LOCAL
                                                </span>
                                            )}
                                            {repo.private && (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 border border-gray-600">
                                                    PRIVATE
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">{repo.full_name}</p>
                                    </div>

                                    {/* Branch */}
                                    <div className="hidden sm:flex items-center gap-2 mr-4 text-xs text-gray-500">
                                        <GitBranch className="w-3.5 h-3.5" />
                                        <span className="font-mono">{repo.default_branch}</span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => toggleFavorite(e, repo.id)}
                                            className={`p-2 transition-all rounded-lg ${
                                                repo.isFavorite
                                                    ? 'text-gk-yellow opacity-100'
                                                    : 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gk-yellow'
                                            }`}
                                            title={repo.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                        >
                                            <Star className={`w-4 h-4 ${repo.isFavorite ? 'fill-current' : ''}`} />
                                        </button>
                                        <button
                                            onClick={(e) => removeRepoFromWorkspace(e, repo.id)}
                                            className="p-2 text-gray-600 hover:text-gk-red opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-gk-red/10"
                                            title="Remove from workspace"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gk-blue transition-colors" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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

      {/* Confirmation Dialog */}
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

      {/* Clone Options Modal */}
      {cloneModal.isOpen && cloneModal.repo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-gk-panel border border-gk-header rounded-xl shadow-2xl w-[480px] max-w-[90vw]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gk-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gk-purple/20 flex items-center justify-center">
                  <Download className="w-5 h-5 text-gk-purple" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Clone Repository</h3>
                  <p className="text-xs text-gray-500">{cloneModal.repo.full_name}</p>
                </div>
              </div>
              <button
                onClick={() => setCloneModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Branch Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Branch
                </label>
                <select
                  value={cloneModal.options.branch || cloneModal.repo.default_branch}
                  onChange={(e) => setCloneModal(prev => ({
                    ...prev,
                    options: { ...prev.options, branch: e.target.value }
                  }))}
                  disabled={cloneModal.loadingBranches}
                  className="w-full bg-gk-bg border border-gk-header rounded-lg px-3 py-2 text-white text-sm focus:border-gk-blue focus:outline-none disabled:opacity-50"
                >
                  {cloneModal.branches.map(branch => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
                {cloneModal.loadingBranches && (
                  <p className="text-xs text-gray-500 mt-1">Loading branches...</p>
                )}
              </div>

              {/* Clone Depth */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Clone Depth (Shallow Clone)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    placeholder="Full clone (all history)"
                    value={cloneModal.options.depth || ''}
                    onChange={(e) => setCloneModal(prev => ({
                      ...prev,
                      options: {
                        ...prev.options,
                        depth: e.target.value ? parseInt(e.target.value, 10) : undefined
                      }
                    }))}
                    className="flex-1 bg-gk-bg border border-gk-header rounded-lg px-3 py-2 text-white text-sm focus:border-gk-blue focus:outline-none placeholder-gray-600"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCloneModal(prev => ({
                        ...prev,
                        options: { ...prev.options, depth: 1 }
                      }))}
                      className={`px-2 py-1 text-xs rounded ${cloneModal.options.depth === 1 ? 'bg-gk-blue text-white' : 'bg-gk-bg text-gray-400 hover:text-white'}`}
                    >
                      1
                    </button>
                    <button
                      onClick={() => setCloneModal(prev => ({
                        ...prev,
                        options: { ...prev.options, depth: 10 }
                      }))}
                      className={`px-2 py-1 text-xs rounded ${cloneModal.options.depth === 10 ? 'bg-gk-blue text-white' : 'bg-gk-bg text-gray-400 hover:text-white'}`}
                    >
                      10
                    </button>
                    <button
                      onClick={() => setCloneModal(prev => ({
                        ...prev,
                        options: { ...prev.options, depth: 100 }
                      }))}
                      className={`px-2 py-1 text-xs rounded ${cloneModal.options.depth === 100 ? 'bg-gk-blue text-white' : 'bg-gk-bg text-gray-400 hover:text-white'}`}
                    >
                      100
                    </button>
                    <button
                      onClick={() => setCloneModal(prev => ({
                        ...prev,
                        options: { ...prev.options, depth: undefined }
                      }))}
                      className={`px-2 py-1 text-xs rounded ${cloneModal.options.depth === undefined ? 'bg-gk-blue text-white' : 'bg-gk-bg text-gray-400 hover:text-white'}`}
                    >
                      Full
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {cloneModal.options.depth
                    ? `Clone only the last ${cloneModal.options.depth} commit(s) - faster download`
                    : 'Clone full repository history'}
                </p>
              </div>

              {/* Single Branch Option */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="singleBranch"
                  checked={cloneModal.options.singleBranch || false}
                  onChange={(e) => setCloneModal(prev => ({
                    ...prev,
                    options: { ...prev.options, singleBranch: e.target.checked }
                  }))}
                  className="w-4 h-4 rounded border-gk-header bg-gk-bg text-gk-blue focus:ring-gk-blue"
                />
                <label htmlFor="singleBranch" className="text-sm text-gray-300">
                  Clone only selected branch (single-branch)
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gk-header">
              <button
                onClick={() => setCloneModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCloneModalConfirm}
                className="px-4 py-2 bg-gk-purple text-white text-sm font-medium rounded-lg hover:bg-gk-purple/90 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Clone Repository
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepoSelector;