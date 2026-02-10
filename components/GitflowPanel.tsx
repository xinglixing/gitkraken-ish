import React, { useState, useEffect, useCallback } from 'react';
import { X, GitBranch, Tag, AlertCircle, Play, CheckCircle, Plus, RefreshCw } from 'lucide-react';
import { Repository, Branch } from '../types';
import { gitInitGitflow, createBranch, gitMerge, getCurrentBranch, fetchLocalBranches } from '../services/localGitService';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import ConfirmDialog from './ConfirmDialog';
import PromptModal from './PromptModal';

interface GitflowPanelProps {
    isOpen: boolean;
    onClose: () => void;
    repo: Repository | null;
    branches: Branch[];
    onRefresh: () => void;
}

type GitflowAction = 'startFeature' | 'finishFeature' | 'startRelease' | 'finishRelease' | 'startHotfix' | 'finishHotfix';

interface GitflowState {
    initialized: boolean;
    developExists: boolean;
    mainExists: boolean;
}

export const GitflowPanel: React.FC<GitflowPanelProps> = ({ isOpen, onClose, repo, branches, onRefresh }) => {
    const [state, setState] = useState<GitflowState>({ initialized: false, developExists: false, mainExists: false });
    const [loading, setLoading] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [promptConfig, setPromptConfig] = useState({ title: '', placeholder: '', onConfirm: (value: string) => {} });
    const [activeAction, setActiveAction] = useState<GitflowAction | null>(null);
    const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();
    const { showAlert } = useAlert();

    const checkGitflowState = useCallback(async () => {
        if (!repo || !isOpen) return;

        const developExists = branches.some(b => b.name === 'develop');
        const mainExists = branches.some(b => b.name === 'main' || b.name === 'master');

        setState({
            initialized: developExists && mainExists,
            developExists,
            mainExists
        });
    }, [repo, branches, isOpen]);

    useEffect(() => {
        checkGitflowState();
    }, [checkGitflowState]);

    const handleInitGitflow = async () => {
        if (!repo) return;
        setLoading(true);
        try {
            await gitInitGitflow(repo);
            onRefresh();
            checkGitflowState();
        } catch (error) {
            showAlert('Gitflow Error', `Failed to initialize Gitflow: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const showInputPrompt = (title: string, placeholder: string, onConfirm: (value: string) => void) => {
        setPromptConfig({ title, placeholder, onConfirm });
        setShowPrompt(true);
    };

    const handleStartFeature = async () => {
        showInputPrompt(
            'Start Feature',
            'Enter feature name (e.g., user-authentication)',
            async (name) => {
                if (!repo || !name.trim()) return;
                setLoading(true);
                try {
                    await createBranch(repo, `feature/${name.trim()}`, 'develop');
                    onRefresh();
                } catch (error) {
                    showAlert('Feature Error', `Failed to start feature: ${error.message}`, 'error');
                } finally {
                    setLoading(false);
                }
            }
        );
    };

    const handleFinishFeature = async () => {
        if (!repo) return;
        const currentBranch = await getCurrentBranch(repo);
        if (!currentBranch?.startsWith('feature/')) {
            showAlert('Feature Error', 'You must be on a feature branch to finish it', 'warning');
            return;
        }

        const confirmed = await confirm({
            title: 'Finish Feature',
            message: `Merge "${currentBranch}" into develop and delete the feature branch?`,
            type: 'warning',
            confirmText: 'Finish Feature'
        });

        if (confirmed) {
            setLoading(true);
            try {
                // Checkout develop
                const { gitCheckout } = await import('../services/localGitService');
                await gitCheckout(repo, 'develop');
                // Merge feature branch
                await gitMerge(repo, currentBranch);
                // Delete feature branch
                const { gitDeleteBranch } = await import('../services/localGitService');
                await gitDeleteBranch(repo, currentBranch);
                onRefresh();
            } catch (error) {
                showAlert('Feature Error', `Failed to finish feature: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleStartRelease = async () => {
        showInputPrompt(
            'Start Release',
            'Enter version (e.g., 1.0.0)',
            async (version) => {
                if (!repo || !version.trim()) return;
                setLoading(true);
                try {
                    await createBranch(repo, `release/${version.trim()}`, 'develop');
                    onRefresh();
                } catch (error) {
                    showAlert('Release Error', `Failed to start release: ${error.message}`, 'error');
                } finally {
                    setLoading(false);
                }
            }
        );
    };

    const handleFinishRelease = async () => {
        if (!repo) return;
        const currentBranch = await getCurrentBranch(repo);
        if (!currentBranch?.startsWith('release/')) {
            showAlert('Release Error', 'You must be on a release branch to finish it', 'warning');
            return;
        }

        const version = currentBranch.replace('release/', '');
        const confirmed = await confirm({
            title: 'Finish Release',
            message: `Merge "${currentBranch}" into main and develop, and create tag "v${version}"?`,
            type: 'warning',
            confirmText: 'Finish Release'
        });

        if (confirmed) {
            setLoading(true);
            try {
                const { gitCheckout, gitDeleteBranch, gitCreateTag } = await import('../services/localGitService');

                // Checkout main/master and merge
                const mainBranch = state.mainExists ? 'main' : 'master';
                await gitCheckout(repo, mainBranch);
                await gitMerge(repo, currentBranch);

                // Create tag
                await gitCreateTag(repo, `v${version}`, `Release ${version}`);

                // Checkout develop and merge
                await gitCheckout(repo, 'develop');
                await gitMerge(repo, currentBranch);

                // Delete release branch
                await gitDeleteBranch(repo, currentBranch);

                onRefresh();
            } catch (error) {
                showAlert('Release Error', `Failed to finish release: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleStartHotfix = async () => {
        showInputPrompt(
            'Start Hotfix',
            'Enter version (e.g., 1.0.1)',
            async (version) => {
                if (!repo || !version.trim()) return;
                setLoading(true);
                try {
                    const mainBranch = state.mainExists ? 'main' : 'master';
                    await createBranch(repo, `hotfix/${version.trim()}`, mainBranch);
                    onRefresh();
                } catch (error) {
                    showAlert('Hotfix Error', `Failed to start hotfix: ${error.message}`, 'error');
                } finally {
                    setLoading(false);
                }
            }
        );
    };

    const handleFinishHotfix = async () => {
        if (!repo) return;
        const currentBranch = await getCurrentBranch(repo);
        if (!currentBranch?.startsWith('hotfix/')) {
            showAlert('Hotfix Error', 'You must be on a hotfix branch to finish it', 'warning');
            return;
        }

        const version = currentBranch.replace('hotfix/', '');
        const confirmed = await confirm({
            title: 'Finish Hotfix',
            message: `Merge "${currentBranch}" into main and develop, and create tag "v${version}"?`,
            type: 'warning',
            confirmText: 'Finish Hotfix'
        });

        if (confirmed) {
            setLoading(true);
            try {
                const { gitCheckout, gitDeleteBranch, gitCreateTag } = await import('../services/localGitService');

                // Checkout main/master and merge
                const mainBranch = state.mainExists ? 'main' : 'master';
                await gitCheckout(repo, mainBranch);
                await gitMerge(repo, currentBranch);

                // Create tag
                await gitCreateTag(repo, `v${version}`, `Hotfix ${version}`);

                // Checkout develop and merge
                await gitCheckout(repo, 'develop');
                await gitMerge(repo, currentBranch);

                // Delete hotfix branch
                await gitDeleteBranch(repo, currentBranch);

                onRefresh();
            } catch (error) {
                showAlert('Hotfix Error', `Failed to finish hotfix: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const ActionButton: React.FC<{
        label: string;
        onClick: () => void;
        icon: React.ReactNode;
        variant?: 'primary' | 'secondary' | 'danger';
        disabled?: boolean;
    }> = ({ label, onClick, icon, variant = 'primary', disabled }) => {
        const baseClasses = "flex items-center gap-2 w-full px-4 py-3 rounded-lg font-medium transition-colors";
        const variantClasses = {
            primary: "bg-gk-accent hover:bg-green-600 text-white",
            secondary: "bg-gk-blue hover:bg-blue-600 text-white",
            danger: "bg-gk-red hover:bg-red-600 text-white"
        };

        return (
            <button
                onClick={onClick}
                disabled={disabled || loading}
                className={`${baseClasses} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {icon}
                <span>{label}</span>
                {loading && <RefreshCw className="w-4 h-4 animate-spin ml-auto" />}
            </button>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-gk-panel border-l border-gk-header shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-header">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-gk-accent" />
                    <h2 className="text-lg font-semibold text-white">Gitflow</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5 text-gray-400" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {!state.initialized ? (
                    <div className="text-center py-8">
                        <AlertCircle className="w-12 h-12 text-gk-yellow mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">Gitflow Not Initialized</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Gitflow requires "main" (or "master") and "develop" branches.
                        </p>
                        <ActionButton
                            label="Initialize Gitflow"
                            onClick={handleInitGitflow}
                            icon={<Plus className="w-4 h-4" />}
                        />
                    </div>
                ) : (
                    <>
                        {/* Features */}
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Features</h3>
                            <ActionButton
                                label="Start Feature"
                                onClick={handleStartFeature}
                                icon={<Play className="w-4 h-4" />}
                                variant="secondary"
                            />
                            <ActionButton
                                label="Finish Feature"
                                onClick={handleFinishFeature}
                                icon={<CheckCircle className="w-4 h-4" />}
                                variant="primary"
                            />
                        </div>

                        {/* Releases */}
                        <div className="space-y-2 pt-4 border-t border-gk-header">
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Releases</h3>
                            <ActionButton
                                label="Start Release"
                                onClick={handleStartRelease}
                                icon={<Tag className="w-4 h-4" />}
                                variant="secondary"
                            />
                            <ActionButton
                                label="Finish Release"
                                onClick={handleFinishRelease}
                                icon={<CheckCircle className="w-4 h-4" />}
                                variant="primary"
                            />
                        </div>

                        {/* Hotfixes */}
                        <div className="space-y-2 pt-4 border-t border-gk-header">
                            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Hotfixes</h3>
                            <ActionButton
                                label="Start Hotfix"
                                onClick={handleStartHotfix}
                                icon={<AlertCircle className="w-4 h-4" />}
                                variant="danger"
                            />
                            <ActionButton
                                label="Finish Hotfix"
                                onClick={handleFinishHotfix}
                                icon={<CheckCircle className="w-4 h-4" />}
                                variant="primary"
                            />
                        </div>

                        {/* Current Branch Info */}
                        <div className="mt-6 p-3 bg-gk-bg rounded-lg border border-gk-header">
                            <p className="text-xs text-gray-500 mb-1">Current Branch</p>
                            <p className="text-sm font-mono text-gk-accent">
                                {branches.find(b => b.isCurrent)?.name || 'Unknown'}
                            </p>
                        </div>
                    </>
                )}
            </div>

            <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />

            <PromptModal
                isOpen={showPrompt}
                onClose={() => setShowPrompt(false)}
                title={promptConfig.title}
                placeholder={promptConfig.placeholder}
                onConfirm={promptConfig.onConfirm}
            />
        </div>
    );
};
