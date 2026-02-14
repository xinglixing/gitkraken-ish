import React, { useState, useEffect, useCallback } from 'react';
import { X, FolderTree, RefreshCw, Plus, Trash2, Lock, Unlock, ExternalLink, GitBranch, Home, AlertCircle } from 'lucide-react';
import { Repository } from '../types';
import { gitWorktreeList, gitWorktreeAdd, gitWorktreeRemove, gitWorktreeLock, gitWorktreeUnlock, gitWorktreePrune, Worktree, fetchLocalBranches } from '../services/localGitService';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import ConfirmDialog from './ConfirmDialog';

interface WorktreesPanelProps {
    isOpen: boolean;
    onClose: () => void;
    repo: Repository | null;
    onOpenWorktree?: (path: string) => void;
}

export const WorktreesPanel: React.FC<WorktreesPanelProps> = ({ isOpen, onClose, repo, onOpenWorktree }) => {
    const [worktrees, setWorktrees] = useState<Worktree[]>([]);
    const [loading, setLoading] = useState(false);
    const [branches, setBranches] = useState<string[]>([]);
    const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();
    const { showAlert } = useAlert();

    // Add worktree modal state
    const [addModal, setAddModal] = useState<{
        isOpen: boolean;
        path: string;
        branch: string;
        createNewBranch: boolean;
        newBranchName: string;
    }>({
        isOpen: false,
        path: '',
        branch: '',
        createNewBranch: false,
        newBranchName: '',
    });

    const loadWorktrees = useCallback(async () => {
        if (!repo || !isOpen) return;
        setLoading(true);
        try {
            const data = await gitWorktreeList(repo);
            setWorktrees(data);

            // Also load branches for the add modal
            const branchData = await fetchLocalBranches(repo);
            const localBranches = branchData
                .filter(b => !b.isRemote)
                .map(b => b.name);
            setBranches(localBranches);
        } catch (error) {
            console.error('Error loading worktrees:', error);
        } finally {
            setLoading(false);
        }
    }, [repo, isOpen]);

    useEffect(() => {
        if (isOpen) {
            loadWorktrees();
        }
    }, [isOpen, loadWorktrees]);

    const handleAddWorktree = async () => {
        if (!repo) return;

        const path = addModal.path.trim();
        const branch = addModal.createNewBranch ? addModal.newBranchName.trim() : addModal.branch;

        if (!path) {
            showAlert('Error', 'Please enter a path for the worktree', 'error');
            return;
        }

        if (!branch) {
            showAlert('Error', 'Please select or enter a branch name', 'error');
            return;
        }

        setLoading(true);
        setAddModal(prev => ({ ...prev, isOpen: false }));

        try {
            await gitWorktreeAdd(repo, path, branch, {
                createBranch: addModal.createNewBranch,
            });
            await loadWorktrees();
            showAlert('Success', `Worktree created at ${path}`, 'success');
        } catch (error) {
            showAlert('Error', `Failed to add worktree: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveWorktree = async (worktree: Worktree, force: boolean = false) => {
        if (!repo) return;

        if (worktree.isMain) {
            showAlert('Error', 'Cannot remove the main worktree', 'error');
            return;
        }

        if (worktree.isLocked) {
            showAlert('Error', 'Cannot remove a locked worktree. Unlock it first.', 'error');
            return;
        }

        const confirmed = await confirm({
            title: force ? 'Force Remove Worktree' : 'Remove Worktree',
            message: `Are you sure you want to ${force ? 'force ' : ''}remove the worktree at "${worktree.path}"?`,
            details: force
                ? 'WARNING: This will delete the worktree and any uncommitted changes will be lost!'
                : (worktree.branch ? `Branch: ${worktree.branch}` : undefined),
            type: 'danger',
            confirmText: force ? 'Force Remove' : 'Remove',
        });

        if (confirmed) {
            setLoading(true);
            try {
                await gitWorktreeRemove(repo, worktree.path, force);
                await loadWorktrees();
                showAlert('Success', `Worktree ${force ? 'force ' : ''}removed`, 'success');
            } catch (error: any) {
                const errorMsg = error.message || '';
                // If permission denied or has modifications, offer force option
                if (!force && (
                    errorMsg.includes('permission denied') ||
                    errorMsg.includes('Permission denied') ||
                    errorMsg.includes('modifications') ||
                    errorMsg.includes('uncommitted') ||
                    errorMsg.includes('is locked')
                )) {
                    const shouldForce = await confirm({
                        title: 'Remove Failed',
                        message: 'The worktree could not be removed. It may have uncommitted changes or locked files.',
                        details: 'Would you like to force remove it? This will DELETE any uncommitted changes.',
                        type: 'danger',
                        confirmText: 'Force Remove',
                    });
                    if (shouldForce) {
                        handleRemoveWorktree(worktree, true);
                        return;
                    }
                } else {
                    showAlert('Error', `Failed to remove worktree: ${error.message}`, 'error');
                }
            } finally {
                setLoading(false);
            }
        }
    };

    const handleLockWorktree = async (worktree: Worktree) => {
        if (!repo) return;

        if (worktree.isMain) {
            showAlert('Info', 'Main worktree cannot be locked', 'info');
            return;
        }

        setLoading(true);
        try {
            await gitWorktreeLock(repo, worktree.path);
            await loadWorktrees();
        } catch (error) {
            showAlert('Error', `Failed to lock worktree: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUnlockWorktree = async (worktree: Worktree) => {
        if (!repo) return;

        setLoading(true);
        try {
            await gitWorktreeUnlock(repo, worktree.path);
            await loadWorktrees();
        } catch (error) {
            showAlert('Error', `Failed to unlock worktree: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePrune = async () => {
        if (!repo) return;

        const confirmed = await confirm({
            title: 'Prune Worktrees',
            message: 'This will remove worktree information for worktrees that no longer exist. Continue?',
            type: 'warning',
            confirmText: 'Prune',
        });

        if (confirmed) {
            setLoading(true);
            try {
                await gitWorktreePrune(repo);
                await loadWorktrees();
                showAlert('Success', 'Worktrees pruned', 'success');
            } catch (error) {
                showAlert('Error', `Failed to prune worktrees: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleOpenWorktree = (worktree: Worktree) => {
        if (onOpenWorktree) {
            onOpenWorktree(worktree.path);
        }
    };

    const openAddModal = () => {
        // Set default path based on repo path
        const basePath = repo?.path || repo?.handle || '';
        const defaultPath = basePath ? `${basePath}-worktree` : '';

        setAddModal({
            isOpen: true,
            path: defaultPath,
            branch: branches[0] || '',
            createNewBranch: false,
            newBranchName: '',
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[420px] bg-gk-panel border-l border-gk-header shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-header">
                <div className="flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-gk-purple" />
                    <h2 className="text-lg font-semibold text-white">Git Worktrees</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-gk-purple hover:bg-purple-600 text-white rounded transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        Add
                    </button>
                    <button
                        onClick={handlePrune}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-gk-panel hover:bg-gray-700 text-gray-300 rounded transition-colors"
                        title="Prune stale worktree entries"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Prune
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Worktrees List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gk-purple border-t-transparent"></div>
                    </div>
                ) : worktrees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                        <FolderTree className="w-12 h-12 mb-3 opacity-50" />
                        <p className="text-sm">No worktrees found</p>
                        <p className="text-xs mt-1">Click "Add" to create a new worktree</p>
                    </div>
                ) : (
                    <div className="p-2 space-y-2">
                        {worktrees.map((worktree) => (
                            <div
                                key={worktree.path}
                                className={`p-3 rounded-lg bg-gk-bg border transition-colors ${
                                    worktree.isMain
                                        ? 'border-gk-purple/50'
                                        : worktree.isLocked
                                        ? 'border-gk-yellow/50'
                                        : 'border-gk-header hover:border-gray-600'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {worktree.isMain ? (
                                            <Home className="w-4 h-4 text-gk-purple" />
                                        ) : worktree.isLocked ? (
                                            <Lock className="w-4 h-4 text-gk-yellow" />
                                        ) : worktree.prunable ? (
                                            <AlertCircle className="w-4 h-4 text-gk-red" />
                                        ) : (
                                            <FolderTree className="w-4 h-4 text-gray-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-medium text-white truncate max-w-[240px]">
                                                {worktree.path.split(/[\\/]/).pop() || worktree.path}
                                            </p>
                                            {worktree.isMain && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gk-purple/20 text-gk-purple">
                                                    MAIN
                                                </span>
                                            )}
                                            {worktree.isLocked && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gk-yellow/20 text-gk-yellow">
                                                    LOCKED
                                                </span>
                                            )}
                                            {worktree.prunable && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gk-red/20 text-gk-red">
                                                    PRUNABLE
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-xs text-gray-500 truncate mt-1" title={worktree.path}>
                                            {worktree.path}
                                        </p>

                                        {worktree.branch && (
                                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                                                <GitBranch className="w-3 h-3" />
                                                {worktree.branch}
                                            </div>
                                        )}

                                        {worktree.head && (
                                            <p className="text-xs font-mono text-gray-500 mt-1">
                                                {worktree.head.substring(0, 7)}
                                            </p>
                                        )}

                                        {!worktree.isMain && (
                                            <div className="flex gap-2 mt-3">
                                                {worktree.isLocked ? (
                                                    <button
                                                        onClick={() => handleUnlockWorktree(worktree)}
                                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-panel hover:bg-gray-700 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        <Unlock className="w-3 h-3" />
                                                        Unlock
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleLockWorktree(worktree)}
                                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-panel hover:bg-gray-700 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        <Lock className="w-3 h-3" />
                                                        Lock
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleRemoveWorktree(worktree)}
                                                    disabled={worktree.isLocked}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-red/20 hover:bg-gk-red/40 disabled:opacity-50 disabled:cursor-not-allowed text-gk-red text-xs font-medium rounded transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    Remove
                                                </button>
                                                {onOpenWorktree && (
                                                    <button
                                                        onClick={() => handleOpenWorktree(worktree)}
                                                        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-blue hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gk-header bg-gk-header text-xs text-gray-500">
                <p>
                    {worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}
                    {worktrees.filter(w => w.isLocked).length > 0 && ` · ${worktrees.filter(w => w.isLocked).length} locked`}
                </p>
            </div>

            {/* Add Worktree Modal */}
            {addModal.isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-gk-panel border border-gk-header rounded-xl shadow-2xl w-[420px] max-w-[90vw]">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gk-header">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gk-purple/20 flex items-center justify-center">
                                    <Plus className="w-5 h-5 text-gk-purple" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Add Worktree</h3>
                                    <p className="text-xs text-gray-500">Create a new worktree for parallel development</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setAddModal(prev => ({ ...prev, isOpen: false }))}
                                className="p-1 text-gray-500 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            {/* Path */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Worktree Path
                                </label>
                                <input
                                    type="text"
                                    value={addModal.path}
                                    onChange={(e) => setAddModal(prev => ({ ...prev, path: e.target.value }))}
                                    placeholder="/path/to/worktree"
                                    className="w-full bg-gk-bg border border-gk-header rounded-lg px-3 py-2 text-white text-sm focus:border-gk-purple focus:outline-none placeholder-gray-600"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Full path where the worktree will be created
                                </p>
                            </div>

                            {/* Branch Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Branch
                                </label>

                                {/* Toggle between existing and new branch */}
                                <div className="flex items-center gap-4 mb-2">
                                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="branchType"
                                            checked={!addModal.createNewBranch}
                                            onChange={() => setAddModal(prev => ({ ...prev, createNewBranch: false }))}
                                            className="text-gk-purple focus:ring-gk-purple"
                                        />
                                        Existing branch
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="branchType"
                                            checked={addModal.createNewBranch}
                                            onChange={() => setAddModal(prev => ({ ...prev, createNewBranch: true }))}
                                            className="text-gk-purple focus:ring-gk-purple"
                                        />
                                        New branch
                                    </label>
                                </div>

                                {addModal.createNewBranch ? (
                                    <input
                                        type="text"
                                        value={addModal.newBranchName}
                                        onChange={(e) => setAddModal(prev => ({ ...prev, newBranchName: e.target.value }))}
                                        placeholder="new-branch-name"
                                        className="w-full bg-gk-bg border border-gk-header rounded-lg px-3 py-2 text-white text-sm focus:border-gk-purple focus:outline-none placeholder-gray-600"
                                    />
                                ) : (
                                    <select
                                        value={addModal.branch}
                                        onChange={(e) => setAddModal(prev => ({ ...prev, branch: e.target.value }))}
                                        className="w-full bg-gk-bg border border-gk-header rounded-lg px-3 py-2 text-white text-sm focus:border-gk-purple focus:outline-none"
                                    >
                                        {branches.map(branch => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 p-4 border-t border-gk-header">
                            <button
                                onClick={() => setAddModal(prev => ({ ...prev, isOpen: false }))}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddWorktree}
                                className="px-4 py-2 bg-gk-purple text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Worktree
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
        </div>
    );
};

export default WorktreesPanel;
