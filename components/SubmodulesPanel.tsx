import React, { useState, useEffect, useCallback } from 'react';
import { X, FolderTree, RefreshCw, Download, ExternalLink, CheckCircle, AlertCircle, GitBranch } from 'lucide-react';
import { Repository, Submodule } from '../types';
import { listSubmodules, initSubmodule, updateSubmodule, updateAllSubmodules } from '../services/localGitService';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import ConfirmDialog from './ConfirmDialog';

interface SubmodulesPanelProps {
    isOpen: boolean;
    onClose: () => void;
    repo: Repository | null;
    onOpenSubmodule: (path: string) => void;
}

export const SubmodulesPanel: React.FC<SubmodulesPanelProps> = ({ isOpen, onClose, repo, onOpenSubmodule }) => {
    const [submodules, setSubmodules] = useState<Submodule[]>([]);
    const [loading, setLoading] = useState(false);
    const [updatingAll, setUpdatingAll] = useState(false);
    const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();
    const { showAlert } = useAlert();

    const loadSubmodules = useCallback(async () => {
        if (!repo || !isOpen) return;
        setLoading(true);
        try {
            const data = await listSubmodules(repo);
            setSubmodules(data);
        } catch (error) {
            console.error('Error loading submodules:', error);
        } finally {
            setLoading(false);
        }
    }, [repo, isOpen]);

    useEffect(() => {
        if (isOpen) {
            loadSubmodules();
        }
    }, [isOpen, loadSubmodules]);

    const handleInit = async (submodule: Submodule) => {
        if (!repo) return;
        setLoading(true);
        try {
            await initSubmodule(repo, submodule.path);
            await loadSubmodules();
        } catch (error) {
            showAlert('Submodule Error', `Failed to init submodule: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (submodule: Submodule) => {
        if (!repo) return;
        setLoading(true);
        try {
            await updateSubmodule(repo, submodule.path);
            await loadSubmodules();
        } catch (error) {
            showAlert('Submodule Error', `Failed to update submodule: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAll = async () => {
        if (!repo) return;

        const confirmed = await confirm({
            title: 'Update All Submodules',
            message: 'This will initialize and update all submodules recursively. Continue?',
            type: 'warning',
            confirmText: 'Update All'
        });

        if (confirmed) {
            setUpdatingAll(true);
            try {
                await updateAllSubmodules(repo);
                await loadSubmodules();
            } catch (error) {
                showAlert('Submodule Error', `Failed to update submodules: ${error.message}`, 'error');
            } finally {
                setUpdatingAll(false);
            }
        }
    };

    const handleOpenSubmodule = (submodule: Submodule) => {
        if (!submodule.initialized) {
            showAlert('Submodule', 'Please initialize the submodule first', 'warning');
            return;
        }
        onOpenSubmodule(submodule.path);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-gk-panel border-l border-gk-header shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-header">
                <div className="flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-gk-accent" />
                    <h2 className="text-lg font-semibold text-white">Submodules</h2>
                </div>
                <div className="flex items-center gap-2">
                    {submodules.length > 0 && (
                        <button
                            onClick={handleUpdateAll}
                            disabled={updatingAll}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-gk-blue hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
                        >
                            {updatingAll ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                                <Download className="w-3 h-3" />
                            )}
                            Update All
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Submodules List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gk-accent border-t-transparent"></div>
                    </div>
                ) : submodules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                        <FolderTree className="w-12 h-12 mb-3 opacity-50" />
                        <p className="text-sm">No submodules found</p>
                        <p className="text-xs mt-1">This repository has no submodules configured</p>
                    </div>
                ) : (
                    <div className="p-2 space-y-2">
                        {submodules.map((submodule) => (
                            <div
                                key={submodule.path}
                                className="p-3 rounded-lg bg-gk-bg border border-gk-header hover:border-gray-600 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {submodule.initialized ? (
                                            <CheckCircle className="w-4 h-4 text-gk-accent" />
                                        ) : (
                                            <AlertCircle className="w-4 h-4 text-gk-yellow" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-white truncate">
                                                {submodule.path}
                                            </p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                submodule.initialized
                                                    ? 'bg-gk-accent/20 text-gk-accent'
                                                    : 'bg-gk-yellow/20 text-gk-yellow'
                                            }`}>
                                                {submodule.initialized ? 'initialized' : 'not initialized'}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-500 truncate mt-1">
                                            {submodule.url}
                                        </p>

                                        {submodule.branch && (
                                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                                                <GitBranch className="w-3 h-3" />
                                                {submodule.branch}
                                            </div>
                                        )}

                                        {submodule.sha && (
                                            <p className="text-xs font-mono text-gray-500 mt-1">
                                                {submodule.sha.substring(0, 7)}
                                            </p>
                                        )}

                                        <div className="flex gap-2 mt-3">
                                            {!submodule.initialized ? (
                                                <button
                                                    onClick={() => handleInit(submodule)}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-blue hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
                                                >
                                                    <Download className="w-3 h-3" />
                                                    Initialize
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleUpdate(submodule)}
                                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-accent hover:bg-green-600 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        <RefreshCw className="w-3 h-3" />
                                                        Update
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenSubmodule(submodule)}
                                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-panel hover:bg-gray-700 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Open
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gk-header bg-gk-header text-xs text-gray-500">
                <p>{submodules.length} submodule{submodules.length !== 1 ? 's' : ''} · {submodules.filter(s => s.initialized).length} initialized</p>
            </div>

            <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
        </div>
    );
};
