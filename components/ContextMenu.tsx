import React, { useEffect, useRef } from 'react';
import { GitCommit, Copy, GitBranch, ArrowUpCircle, PlusCircle, MinusCircle, Trash2, Archive, ExternalLink, Github, RotateCcw, Undo, Edit3, Tag, Eye, Clock, FileText, Sparkles, GitMerge, ArrowDownCircle, FilePlus, Send } from 'lucide-react';
import { isLocalRepo } from '../utils/repository';
import { Repository, Commit, Branch } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  type: 'commit' | 'wip' | 'branch' | 'file' | 'tag';
  repo?: Repository | null;
  commit?: Commit | null;
  branches?: Branch[];
  targetBranch?: string;
  targetFile?: string;
  targetTag?: string;
  onClose: () => void;
  // Commit Actions
  onCherryPick?: () => void;
  onCherryPickToBranch?: (branchName: string) => void;
  onCopyHash?: () => void;
  onCopyMessage?: () => void;
  onCreateBranch?: () => void;
  onCheckout?: () => void;
  onAmendCommit?: () => void;
  onRevertCommit?: () => void;
  onViewOnGitHub?: () => void;
  onSquash?: () => void;
  onCreateTag?: () => void;
  onResetToCommit?: (mode: 'soft' | 'mixed' | 'hard') => void;
  onAIExplain?: () => void;
  onReorderCommits?: () => void;
  selectedCommits?: Commit[];
  isMostRecent?: boolean;
  // New Commit Actions
  onInteractiveRebase?: () => void;
  onDropCommit?: () => void;
  onGenerateCommitSummary?: () => void;
  onGenerateChangelog?: () => void;
  onRevealInGraph?: () => void;
  // WIP Actions
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
  onStash?: () => void;
  onUnstash?: () => void;
  onUndoLastCommit?: () => void;
  // Branch Actions
  onRenameBranch?: () => void;
  onDeleteBranch?: () => void;
  onMergeBranch?: () => void;
  // New Branch Actions
  onSetUpstream?: () => void;
  onResetBranch?: () => void;
  onCompareBranch?: () => void;
  onRebaseBranch?: () => void;
  onAIExplainBranch?: () => void;
  onAIGeneratePR?: () => void;
  // Tag Actions
  onCheckoutTag?: () => void;
  onPushTag?: () => void;
  onCopyTagName?: () => void;
  onDeleteTag?: () => void;
  // File Actions
  onFileBlame?: () => void;
  onFileHistory?: () => void;
  onFileDiscard?: () => void;
  onFileStage?: () => void;
  onFileUnstage?: () => void;
  // New File Actions
  onFileOpen?: () => void;
  onFileResetToCommit?: () => void;
  onAIExplainFile?: () => void;
  onAISummarizeFile?: () => void;
  // Create/Delete File Actions
  onCreateFile?: () => void;
  onDeleteFile?: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x, y, type, repo, branches, commit, targetBranch, targetFile, targetTag, onClose,
  onCherryPick, onCherryPickToBranch, onCopyHash, onCopyMessage, onCreateBranch, onCheckout, onAmendCommit, onRevertCommit, onViewOnGitHub, onSquash,
  onCreateTag, onResetToCommit, onAIExplain, onReorderCommits, selectedCommits, isMostRecent,
  onInteractiveRebase, onDropCommit, onGenerateCommitSummary, onGenerateChangelog, onRevealInGraph,
  onStageAll, onUnstageAll, onDiscardAll, onStash, onUnstash, onUndoLastCommit,
  onRenameBranch, onDeleteBranch, onMergeBranch,
  onSetUpstream, onResetBranch, onCompareBranch, onRebaseBranch, onAIExplainBranch, onAIGeneratePR,
  onCheckoutTag, onPushTag, onCopyTagName, onDeleteTag,
  onFileBlame, onFileHistory, onFileDiscard, onFileStage, onFileUnstage,
  onFileOpen, onFileResetToCommit, onAIExplainFile, onAISummarizeFile,
  onCreateFile, onDeleteFile
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const isLocal = isLocalRepo(repo);
  const isMultiSelect = (selectedCommits?.length ?? 0) > 1;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Prevent menu from going off-screen
  const style: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 400),
    left: Math.min(x, window.innerWidth - 280),
  };

  const Separator = () => <div className="h-[1px] bg-white/10 my-1" />;

  const MenuItem = ({ icon, label, onClick, danger, disabled, className: extraClass }: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
  }) => (
    <div
      className={`px-4 py-2 cursor-pointer flex items-center transition-colors text-sm ${
        disabled ? 'opacity-40 cursor-not-allowed' :
        danger ? 'hover:bg-gk-red/10 hover:text-gk-red text-gk-red' :
        'hover:bg-white/5 hover:text-white'
      } ${extraClass || ''}`}
      onClick={() => { if (!disabled && onClick) { onClick(); onClose(); } }}
    >
      <span className="w-5 h-5 mr-2 flex items-center justify-center flex-shrink-0">{icon}</span>
      {label}
    </div>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-64 bg-gk-panel border border-gk-header rounded-lg shadow-2xl py-1 text-sm text-gray-300 select-none animate-fade-in"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'commit' && (
      <>
        {/* Local-only operations section */}
        {isLocal && (
          <>
            {/* Cherry-pick */}
            {onCherryPick && (
              <>
                <MenuItem
                  icon={<ArrowUpCircle className="w-4 h-4 text-gk-accent" />}
                  label="Cherry-pick to HEAD"
                  onClick={onCherryPick}
                />

                {/* Cherry-pick to branch submenu */}
                {onCherryPickToBranch && branches && branches.length > 0 && (
                  <div className="relative group">
                    <div className="px-4 py-2 hover:bg-white/5 hover:text-white cursor-pointer flex items-center justify-between transition-colors">
                      <div className="flex items-center">
                        <ArrowUpCircle className="w-4 h-4 mr-2 text-gk-accent" />
                        Cherry-pick to branch
                      </div>
                      <span className="text-gray-500">&rsaquo;</span>
                    </div>

                    <div className="absolute left-full top-0 ml-1 w-48 bg-gk-panel border border-gk-header rounded-lg shadow-2xl py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 max-h-60 overflow-y-auto">
                      {branches.filter(b => !b.isRemote).map(branch => (
                        <div
                          key={branch.name}
                          className="px-4 py-2 hover:bg-gk-accent/10 hover:text-white cursor-pointer flex items-center transition-colors text-xs"
                          onClick={() => { onCherryPickToBranch(branch.name); onClose(); }}
                        >
                          <GitBranch className="w-3 h-3 mr-2 opacity-70" />
                          {branch.name}
                          {branch.active && (
                            <span className="ml-auto text-[10px] text-gk-accent">current</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Create Branch */}
            {onCreateBranch && !isMultiSelect && (
              <MenuItem icon={<GitBranch className="w-4 h-4" />} label="Create branch here" onClick={onCreateBranch} />
            )}

            {/* Create Tag */}
            {onCreateTag && !isMultiSelect && (
              <MenuItem icon={<Tag className="w-4 h-4 text-gk-yellow" />} label="Create tag here" onClick={onCreateTag} />
            )}

            {/* Checkout */}
            {onCheckout && !isMultiSelect && (
              <MenuItem icon={<GitCommit className="w-4 h-4" />} label="Checkout this commit" onClick={onCheckout} />
            )}

            {/* Reset to commit - submenu */}
            {onResetToCommit && !isMultiSelect && (
              <div className="relative group">
                <div className="px-4 py-2 hover:bg-white/5 hover:text-white cursor-pointer flex items-center justify-between transition-colors">
                  <div className="flex items-center">
                    <RotateCcw className="w-4 h-4 mr-2 text-gk-yellow" />
                    Reset to this commit
                  </div>
                  <span className="text-gray-500">&rsaquo;</span>
                </div>
                <div className="absolute left-full top-0 ml-1 w-48 bg-gk-panel border border-gk-header rounded-lg shadow-2xl py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="px-4 py-2 hover:bg-white/5 hover:text-white cursor-pointer text-xs" onClick={() => { onResetToCommit('soft'); onClose(); }}>
                    <div className="font-bold text-gk-blue">Soft</div>
                    <div className="text-gray-500">Keep changes staged</div>
                  </div>
                  <div className="px-4 py-2 hover:bg-white/5 hover:text-white cursor-pointer text-xs" onClick={() => { onResetToCommit('mixed'); onClose(); }}>
                    <div className="font-bold text-gk-yellow">Mixed</div>
                    <div className="text-gray-500">Keep changes unstaged</div>
                  </div>
                  <div className="px-4 py-2 hover:bg-gk-red/10 hover:text-gk-red cursor-pointer text-xs" onClick={() => { onResetToCommit('hard'); onClose(); }}>
                    <div className="font-bold text-gk-red">Hard</div>
                    <div className="text-gray-500">Discard all changes</div>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Revert Commit */}
            {onRevertCommit && !isMultiSelect && (
              <MenuItem icon={<RotateCcw className="w-4 h-4 text-gk-blue" />} label="Revert commit" onClick={onRevertCommit} />
            )}

            {/* Squash Commits */}
            {onSquash && (
              <MenuItem icon={<GitCommit className="w-4 h-4 text-gk-purple" />} label="Squash commits..." onClick={onSquash} />
            )}

            {/* Reorder Commits - only when multiple commits selected */}
            {onReorderCommits && selectedCommits && selectedCommits.length > 1 && (
              <MenuItem
                icon={<GitCommit className="w-4 h-4 text-gk-blue" />}
                label={`Reorder ${selectedCommits.length} commits...`}
                onClick={onReorderCommits}
              />
            )}

            {/* Amend Commit - only for single most recent commit */}
            {onAmendCommit && commit && isMostRecent && !isMultiSelect && (
              <MenuItem
                icon={<Edit3 className="w-4 h-4 text-gk-accent" />}
                label="Amend commit"
                onClick={onAmendCommit}
              />
            )}

            <Separator />
          </>
        )}

        {/* AI Explain - Available for both local and remote */}
        {onAIExplain && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Explain Commit" onClick={onAIExplain} />
        )}

        {/* New AI actions */}
        {onGenerateCommitSummary && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Generate Summary" onClick={onGenerateCommitSummary} />
        )}
        {onGenerateChangelog && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Generate Changelog" onClick={onGenerateChangelog} />
        )}

        {/* Interactive Rebase & Drop */}
        {isLocal && onInteractiveRebase && !isMultiSelect && (
          <>
            <Separator />
            <MenuItem icon={<GitCommit className="w-4 h-4 text-gk-blue" />} label="Interactive rebase from here" onClick={onInteractiveRebase} />
          </>
        )}
        {isLocal && onDropCommit && !isMultiSelect && (
          <MenuItem icon={<Trash2 className="w-4 h-4 text-gk-red" />} label="Drop commit" onClick={onDropCommit} danger />
        )}

        {/* Reveal in Graph */}
        {onRevealInGraph && (
          <>
            <Separator />
            <MenuItem icon={<Eye className="w-4 h-4 text-gk-blue" />} label="Reveal in Graph" onClick={onRevealInGraph} />
          </>
        )}

        {/* View on GitHub - Only for remote repos */}
        {!isLocal && onViewOnGitHub && (
          <MenuItem icon={<Github className="w-4 h-4" />} label="View on GitHub" onClick={onViewOnGitHub} />
        )}

        {!isLocal && onViewOnGitHub && <Separator />}

        {/* Copy SHA - Always available */}
        <MenuItem icon={<Copy className="w-4 h-4" />} label="Copy SHA" onClick={onCopyHash} />

        {/* Copy commit message */}
        {onCopyMessage && (
          <MenuItem icon={<Copy className="w-4 h-4" />} label="Copy commit message" onClick={onCopyMessage} />
        )}
      </>
      )}

      {type === 'wip' && (
      <>
        <MenuItem icon={<PlusCircle className="w-4 h-4 text-gk-accent" />} label="Stage All Changes" onClick={onStageAll} />
        <MenuItem icon={<MinusCircle className="w-4 h-4 text-gk-yellow" />} label="Unstage All Changes" onClick={onUnstageAll} />

        <Separator />

        <MenuItem icon={<Archive className="w-4 h-4 text-gk-blue" />} label="Stash Changes" onClick={onStash} />
        <MenuItem icon={<Archive className="w-4 h-4 text-gk-green" />} label="Unstash (Apply Latest)" onClick={onUnstash} />

        <Separator />

        {/* Amend Last Commit */}
        {isLocal && onAmendCommit && (
          <MenuItem icon={<Edit3 className="w-4 h-4 text-gk-purple" />} label="Amend Last Commit" onClick={onAmendCommit} />
        )}

        {/* Undo Last Commit */}
        {isLocal && onUndoLastCommit && (
          <MenuItem icon={<Undo className="w-4 h-4 text-gk-red" />} label="Undo Last Commit" onClick={onUndoLastCommit} />
        )}

        <Separator />

        <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Discard All Changes" onClick={onDiscardAll} danger />
      </>
      )}

      {type === 'branch' && (
      <>
        {onCheckout && (
          <MenuItem icon={<GitBranch className="w-4 h-4 text-gk-accent" />} label="Checkout" onClick={onCheckout} />
        )}
        {onMergeBranch && (
          <MenuItem icon={<GitMerge className="w-4 h-4 text-gk-blue" />} label="Merge into current" onClick={onMergeBranch} />
        )}
        {onRebaseBranch && (
          <MenuItem icon={<GitCommit className="w-4 h-4 text-gk-purple" />} label="Rebase onto current" onClick={onRebaseBranch} />
        )}
        {onCompareBranch && (
          <MenuItem icon={<Eye className="w-4 h-4 text-gk-blue" />} label="Compare branch" onClick={onCompareBranch} />
        )}
        <Separator />
        {onRenameBranch && (
          <MenuItem icon={<Edit3 className="w-4 h-4" />} label="Rename branch" onClick={onRenameBranch} />
        )}
        {onSetUpstream && (
          <MenuItem icon={<ArrowUpCircle className="w-4 h-4 text-gk-accent" />} label="Set upstream" onClick={onSetUpstream} />
        )}
        {onResetBranch && (
          <MenuItem icon={<RotateCcw className="w-4 h-4 text-gk-yellow" />} label="Reset branch" onClick={onResetBranch} />
        )}
        <Separator />
        {onAIExplainBranch && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Explain branch" onClick={onAIExplainBranch} />
        )}
        {onAIGeneratePR && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Generate PR description" onClick={onAIGeneratePR} />
        )}
        <Separator />
        {onDeleteBranch && (
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Delete branch" onClick={onDeleteBranch} danger />
        )}
      </>
      )}

      {type === 'tag' && (
      <>
        {onCheckoutTag && (
          <MenuItem icon={<Tag className="w-4 h-4 text-gk-yellow" />} label="Checkout tag" onClick={onCheckoutTag} />
        )}
        {onPushTag && (
          <MenuItem icon={<ArrowUpCircle className="w-4 h-4 text-gk-accent" />} label="Push tag to remote" onClick={onPushTag} />
        )}
        <Separator />
        {onCopyTagName && (
          <MenuItem icon={<Copy className="w-4 h-4" />} label="Copy tag name" onClick={onCopyTagName} />
        )}
        <Separator />
        {onDeleteTag && (
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Delete tag" onClick={onDeleteTag} danger />
        )}
      </>
      )}

      {type === 'file' && (
      <>
        {onCreateFile && (
          <MenuItem icon={<FilePlus className="w-4 h-4 text-gk-accent" />} label="New File" onClick={onCreateFile} />
        )}
        {onFileOpen && (
          <MenuItem icon={<ExternalLink className="w-4 h-4 text-gk-accent" />} label="Open file" onClick={onFileOpen} />
        )}
        {onFileStage && (
          <MenuItem icon={<PlusCircle className="w-4 h-4 text-gk-accent" />} label="Stage file" onClick={onFileStage} />
        )}
        {onFileUnstage && (
          <MenuItem icon={<MinusCircle className="w-4 h-4 text-gk-yellow" />} label="Unstage file" onClick={onFileUnstage} />
        )}
        <Separator />
        {onFileBlame && (
          <MenuItem icon={<Eye className="w-4 h-4 text-gk-purple" />} label="Blame" onClick={onFileBlame} />
        )}
        {onFileHistory && (
          <MenuItem icon={<Clock className="w-4 h-4 text-gk-blue" />} label="Show file history" onClick={onFileHistory} />
        )}
        {onFileResetToCommit && (
          <MenuItem icon={<RotateCcw className="w-4 h-4 text-gk-yellow" />} label="Reset to commit" onClick={onFileResetToCommit} />
        )}
        <Separator />
        {onAIExplainFile && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Explain changes" onClick={onAIExplainFile} />
        )}
        {onAISummarizeFile && (
          <MenuItem icon={<Sparkles className="w-4 h-4 text-gk-purple" />} label="AI Summarize history" onClick={onAISummarizeFile} />
        )}
        <Separator />
        {onFileDiscard && (
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Discard changes" onClick={onFileDiscard} danger />
        )}
        {onDeleteFile && (
          <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Delete file" onClick={onDeleteFile} danger />
        )}
      </>
      )}
    </div>
  );
};

export default ContextMenu;
