import React, { useState, useEffect, useCallback } from 'react';
import { X, Camera, Play, Trash2, Clock, FileText, Plus, RefreshCw } from 'lucide-react';
import { Repository, Snapshot } from '../types';
import { listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot } from '../services/localGitService';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import ConfirmDialog from './ConfirmDialog';
import PromptModal from './PromptModal';

interface SnapshotsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    repo: Repository | null;
    onRefresh: () => void;
    onStashesChanged?: () => void;
}

const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
};

const getDefaultSnapshotMessage = (): string => {
    const now = new Date();
    return `Snapshot ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export const SnapshotsPanel: React.FC<SnapshotsPanelProps> = ({ isOpen, onClose, repo, onRefresh, onStashesChanged }) => {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
    const [showMessagePrompt, setShowMessagePrompt] = useState(false);
    const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();
    const { showAlert } = useAlert();

    const loadSnapshots = useCallback(async () => {
        if (!repo || !isOpen) return;
        setLoading(true);
        try {
            const data = await listSnapshots(repo);
            setSnapshots(data);
        } catch (error) {
            console.error('Error loading snapshots:', error);
        } finally {
            setLoading(false);
        }
    }, [repo, isOpen]);

    useEffect(() => {
        if (isOpen) {
            loadSnapshots();
        }
    }, [isOpen, loadSnapshots]);

    const handleCreateSnapshot = async (message: string) => {
        if (!repo) return;
        setCreating(true);
        try {
            await createSnapshot(repo, message);
            await loadSnapshots();
            onRefresh();
            onStashesChanged?.();
        } catch (error) {
            showAlert('Snapshot Error', `Failed to create snapshot: ${error.message}`, 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleApply = async (snapshot: Snapshot) => {
        const confirmed = await confirm({
            title: 'Apply Snapshot',
            message: `Apply snapshot "${snapshot.message}"? This will merge the snapshot's changes into your current working directory.`,
            type: 'info',
            confirmText: 'Apply'
        });

        if (confirmed) {
            setLoading(true);
            try {
                await restoreSnapshot(repo, snapshot.id);
                await loadSnapshots();
                onRefresh();
                onStashesChanged?.();
            } catch (error) {
                showAlert('Snapshot Error', `Failed to apply snapshot: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleDelete = async (snapshot: Snapshot) => {
        const confirmed = await confirm({
            title: 'Delete Snapshot',
            message: `Delete snapshot "${snapshot.message}"? This cannot be undone.`,
            details: "This removes the snapshot from the stash list. If you haven't applied it, those changes will be lost forever.",
            type: 'danger',
            confirmText: 'Delete'
        });

        if (confirmed) {
            setLoading(true);
            try {
                await deleteSnapshot(repo, snapshot.id);
                await loadSnapshots();
                onStashesChanged?.();
            } catch (error) {
                showAlert('Snapshot Error', `Failed to delete snapshot: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-gk-panel border-l border-gk-header shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-header">
                <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-gk-accent" />
                    <h2 className="text-lg font-semibold text-white">Snapshots</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            {/* Create Button */}
            <div className="p-4 border-b border-gk-header">
                <button
                    onClick={() => setShowMessagePrompt(true)}
                    disabled={creating}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gk-accent hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                >
                    {creating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <Plus className="w-4 h-4" />
                    )}
                    Create Snapshot
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    Saves all uncommitted changes as a reusable checkpoint
                </p>
            </div>

            {/* Snapshots List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gk-accent border-t-transparent"></div>
                    </div>
                ) : snapshots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                        <Camera className="w-12 h-12 mb-3 opacity-50" />
                        <p className="text-sm">No snapshots yet</p>
                        <p className="text-xs mt-1">Take a snapshot before risky operations</p>
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {snapshots.map((snapshot) => (
                            <div
                                key={snapshot.id}
                                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                    selectedSnapshot?.id === snapshot.id
                                        ? 'bg-gk-accent/20 border border-gk-accent/50'
                                        : 'hover:bg-gray-800 border border-transparent'
                                }`}
                                onClick={() => setSelectedSnapshot(snapshot)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        <Camera className="w-4 h-4 text-gk-accent" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white truncate">
                                            {snapshot.message}
                                        </p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDate(snapshot.timestamp)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <FileText className="w-3 h-3" />
                                                {snapshot.files.length} files
                                            </span>
                                        </div>

                                        {snapshot.files.length > 0 && (
                                            <div className="mt-2 space-y-0.5">
                                                {snapshot.files.slice(0, 3).map((file) => (
                                                    <p key={file} className="text-xs text-gray-600 truncate">
                                                        {file}
                                                    </p>
                                                ))}
                                                {snapshot.files.length > 3 && (
                                                    <p className="text-xs text-gray-600">
                                                        +{snapshot.files.length - 3} more
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {selectedSnapshot?.id === snapshot.id && (
                                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleApply(snapshot);
                                            }}
                                            title="Merge snapshot changes into working directory"
                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-blue hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
                                        >
                                            <Play className="w-3 h-3" />
                                            Apply
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(snapshot);
                                            }}
                                            title="Permanently remove this snapshot"
                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gk-red hover:bg-red-600 text-white text-xs font-medium rounded transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gk-header bg-gk-header text-xs text-gray-500">
                <p>{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} · Apply merges changes, Delete removes permanently</p>
            </div>

            <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
            <PromptModal
                isOpen={showMessagePrompt}
                title="Snapshot Message"
                defaultValue={getDefaultSnapshotMessage()}
                onConfirm={(message) => {
                    setShowMessagePrompt(false);
                    handleCreateSnapshot(message);
                }}
                onCancel={() => setShowMessagePrompt(false)}
            />
        </div>
    );
};
