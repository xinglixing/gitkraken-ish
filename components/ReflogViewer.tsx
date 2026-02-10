import React, { useState, useEffect, useCallback } from 'react';
import { X, History, GitCommit, GitBranch, RotateCcw, ArrowRight, Clock, User, Tag } from 'lucide-react';
import { Repository, ReflogEntry } from '../types';
import { gitReflog, gitCheckoutReflogEntry, gitRestoreBranchToReflog } from '../services/localGitService';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import ConfirmDialog from './ConfirmDialog';

interface ReflogViewerProps {
    isOpen: boolean;
    onClose: () => void;
    repo: Repository | null;
    onCheckout: (commitId: string) => void;
    onRefresh: () => void;
}

const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
        case 'commit':
            return <GitCommit className="w-4 h-4 text-gk-accent" />;
        case 'checkout':
            return <GitBranch className="w-4 h-4 text-gk-blue" />;
        case 'merge':
            return <Tag className="w-4 h-4 text-gk-purple" />;
        case 'rebase':
            return <RotateCcw className="w-4 h-4 text-gk-yellow" />;
        case 'reset':
            return <ArrowRight className="w-4 h-4 text-gk-red" />;
        default:
            return <History className="w-4 h-4 text-gray-400" />;
    }
};

const getActionColor = (action: string): string => {
    switch (action.toLowerCase()) {
        case 'commit':
            return 'text-gk-accent';
        case 'checkout':
            return 'text-gk-blue';
        case 'merge':
            return 'text-gk-purple';
        case 'rebase':
            return 'text-gk-yellow';
        case 'reset':
            return 'text-gk-red';
        default:
            return 'text-gray-400';
    }
};

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

export const ReflogViewer: React.FC<ReflogViewerProps> = ({ isOpen, onClose, repo, onCheckout, onRefresh }) => {
    const [entries, setEntries] = useState<ReflogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('');
    const [selectedEntry, setSelectedEntry] = useState<ReflogEntry | null>(null);
    const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();
    const { showAlert } = useAlert();

    const loadReflog = useCallback(async () => {
        if (!repo || !isOpen) return;
        setLoading(true);
        try {
            const data = await gitReflog(repo);
            setEntries(data);
        } catch (error) {
            console.error('Error loading reflog:', error);
        } finally {
            setLoading(false);
        }
    }, [repo, isOpen]);

    useEffect(() => {
        if (isOpen) {
            loadReflog();
        }
    }, [isOpen, loadReflog]);

    const handleJumpTo = async (entry: ReflogEntry) => {
        const confirmed = await confirm({
            title: 'Jump to Commit',
            message: `Checkout commit ${entry.sha}? This will detach HEAD.`,
            type: 'warning',
            confirmText: 'Checkout'
        });

        if (confirmed) {
            try {
                await gitCheckoutReflogEntry(repo, entry.sha);
                onCheckout(entry.sha);
                onRefresh();
                onClose();
            } catch (error) {
                showAlert('Checkout Error', error.message, 'error');
            }
        }
    };

    const handleRestoreBranch = async (entry: ReflogEntry) => {
        const branchName = entry.ref === 'HEAD' ? 'main' : entry.ref;
        const confirmed = await confirm({
            title: 'Restore Branch',
            message: `Reset branch "${branchName}" to ${entry.sha}?`,
            type: 'danger',
            confirmText: 'Restore'
        });

        if (confirmed) {
            try {
                await gitRestoreBranchToReflog(repo, branchName, entry.sha);
                onRefresh();
                onClose();
            } catch (error) {
                showAlert('Restore Error', error.message, 'error');
            }
        }
    };

    const filteredEntries = entries.filter(entry =>
        filter === '' ||
        entry.sha.toLowerCase().includes(filter.toLowerCase()) ||
        entry.message.toLowerCase().includes(filter.toLowerCase()) ||
        entry.ref.toLowerCase().includes(filter.toLowerCase()) ||
        entry.action.toLowerCase().includes(filter.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-[500px] bg-gk-panel border-l border-gk-header shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-header">
                <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-gk-accent" />
                    <h2 className="text-lg font-semibold text-white">Reflog Viewer</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            {/* Filter */}
            <div className="p-4 border-b border-gk-header">
                <input
                    type="text"
                    placeholder="Filter by SHA, action, message, or ref..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gk-bg border border-gk-header rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gk-accent"
                />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gk-accent border-t-transparent"></div>
                    </div>
                ) : filteredEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                        <History className="w-12 h-12 mb-2 opacity-50" />
                        <p>No reflog entries found</p>
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {filteredEntries.map((entry, index) => (
                            <div
                                key={`${entry.sha}-${index}`}
                                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                    selectedEntry?.sha === entry.sha
                                        ? 'bg-gk-accent/20 border border-gk-accent/50'
                                        : 'hover:bg-gray-800 border border-transparent'
                                }`}
                                onClick={() => setSelectedEntry(entry)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {getActionIcon(entry.action)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-sm text-gk-accent">
                                                {entry.sha}
                                            </span>
                                            <span className={`text-xs font-medium ${getActionColor(entry.action)}`}>
                                                {entry.action}
                                            </span>
                                            <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDate(entry.timestamp)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-300 truncate">
                                            {entry.message}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {entry.ref}@<span className="text-gray-400">{entry.index}</span>
                                        </p>
                                    </div>
                                </div>

                                {selectedEntry?.sha === entry.sha && (
                                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleJumpTo(entry);
                                            }}
                                            className="flex-1 px-3 py-1.5 bg-gk-blue hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
                                        >
                                            Jump to Commit
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRestoreBranch(entry);
                                            }}
                                            className="flex-1 px-3 py-1.5 bg-gk-accent hover:bg-green-600 text-white text-xs font-medium rounded transition-colors"
                                        >
                                            Restore Branch
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
                <p>Showing {filteredEntries.length} of {entries.length} entries</p>
            </div>

            <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
        </div>
    );
};
