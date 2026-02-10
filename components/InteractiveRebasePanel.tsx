import React, { useState, useEffect } from 'react';
import { X, GripVertical, Type, Trash2, GitCommit, RotateCcw, Check, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { Commit } from '../types';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';
import ConfirmDialog from './ConfirmDialog';

export interface RebaseCommit extends Commit {
  action: 'pick' | 'reword' | 'squash' | 'drop';
  newMessage?: string;
}

interface InteractiveRebasePanelProps {
  isOpen: boolean;
  onClose: () => void;
  commits: Commit[];
  targetBranch: string;
  onRebase: (commits: RebaseCommit[]) => Promise<void>;
}

const actionIcons = {
  pick: <GitCommit className="w-4 h-4 text-gk-accent" />,
  reword: <Type className="w-4 h-4 text-gk-blue" />,
  squash: <GitCommit className="w-4 h-4 text-gk-purple" />,
  drop: <Trash2 className="w-4 h-4 text-gk-red" />
};

const actionLabels = {
  pick: 'Pick',
  reword: 'Reword',
  squash: 'Squash',
  drop: 'Drop'
};

export const InteractiveRebasePanel: React.FC<InteractiveRebasePanelProps> = ({
  isOpen,
  onClose,
  commits,
  targetBranch,
  onRebase
}) => {
  const [rebaseCommits, setRebaseCommits] = useState<RebaseCommit[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [rewordingIndex, setRewordingIndex] = useState<number | null>(null);
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();

  useEffect(() => {
    if (isOpen) {
      setRebaseCommits(commits.map(c => ({ ...c, action: 'pick' })));
    }
  }, [isOpen, commits]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDropIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newCommits = [...rebaseCommits];
    const [removed] = newCommits.splice(draggedIndex, 1);
    newCommits.splice(targetIndex, 0, removed);
    setRebaseCommits(newCommits);
    setDraggedIndex(null);
    setDropIndex(null);
  };

  const handleActionChange = (index: number, action: RebaseCommit['action']) => {
    const newCommits = [...rebaseCommits];
    newCommits[index].action = action;
    if (action === 'reword' && !newCommits[index].newMessage) {
      newCommits[index].newMessage = newCommits[index].message;
    }
    setRebaseCommits(newCommits);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === rebaseCommits.length - 1) return;

    const newCommits = [...rebaseCommits];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newCommits[index], newCommits[targetIndex]] = [newCommits[targetIndex], newCommits[index]];
    setRebaseCommits(newCommits);
  };

  const handleReset = () => {
    setRebaseCommits(commits.map(c => ({ ...c, action: 'pick' })));
  };

  const handleExecute = async () => {
    const dropCount = rebaseCommits.filter(c => c.action === 'drop').length;
    const squashCount = rebaseCommits.filter(c => c.action === 'squash').length;
    const rewordCount = rebaseCommits.filter(c => c.action === 'reword').length;

    if (dropCount > 0 || squashCount > 0 || rewordCount > 0) {
      const confirmed = await confirm({
        title: 'Confirm Interactive Rebase',
        message: `This will ${dropCount > 0 ? `drop ${dropCount} commit${dropCount > 1 ? 's' : ''}` : ''}${dropCount > 0 && squashCount > 0 ? ' and ' : ''}${squashCount > 0 ? `squash ${squashCount} commit${squashCount > 1 ? 's' : ''}` : ''}${rewordCount > 0 ? ` and reword ${rewordCount} commit${rewordCount > 1 ? 's' : ''}` : ''}.`,
        type: 'warning',
        confirmText: 'Execute Rebase',
        details: 'This action rewrites Git history. Make sure these commits haven\'t been pushed to a shared remote.'
      });

      if (!confirmed) return;
    }

    setLoading(true);
    try {
      await onRebase(rebaseCommits);
      onClose();
    } catch (error) {
      showAlert('Rebase Error', `Rebase failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = rebaseCommits.some((c, i) =>
    c.action !== 'pick' ||
    rebaseCommits.findIndex(rc => rc.id === commits[i]?.id) !== i
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-gk-panel border-l border-gk-header shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-header">
        <div className="flex items-center gap-2">
          <GitCommit className="w-5 h-5 text-gk-purple" />
          <h2 className="text-lg font-semibold text-white">Interactive Rebase</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges || loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gk-header hover:bg-white/10 text-gray-400 rounded transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 bg-gk-bg border-b border-gk-header">
        <div className="flex items-start gap-2 text-xs text-gray-400">
          <AlertCircle className="w-4 h-4 text-gk-yellow flex-shrink-0 mt-0.5" />
          <div>
            <p className="mb-1">Drag commits to reorder, or use the action buttons to:</p>
            <ul className="space-y-0.5 ml-4">
              <li><span className="text-gk-accent">Pick</span> - Keep the commit as-is</li>
              <li><span className="text-gk-blue">Reword</span> - Edit the commit message</li>
              <li><span className="text-gk-purple">Squash</span> - Combine into previous commit</li>
              <li><span className="text-gk-red">Drop</span> - Remove the commit</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Commits List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {rebaseCommits.map((commit, index) => (
          <div
            key={commit.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            className={`group flex items-center gap-2 p-2 rounded-lg border transition-all ${
              draggedIndex === index
                ? 'opacity-50'
                : dropIndex === index
                ? 'border-gk-blue bg-gk-blue/10'
                : 'border-gk-header bg-gk-bg hover:border-gray-600'
            } ${commit.action === 'drop' ? 'opacity-50' : ''}`}
          >
            {/* Drag Handle */}
            <div className="cursor-grab active:cursor-grabbing text-gray-500">
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Move Buttons */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => handleMove(index, 'up')}
                disabled={index === 0}
                className="text-gray-500 hover:text-white disabled:opacity-30"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleMove(index, 'down')}
                disabled={index === rebaseCommits.length - 1}
                className="text-gray-500 hover:text-white disabled:opacity-30"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>

            {/* Action Selector */}
            <div className="relative">
              <select
                value={commit.action}
                onChange={(e) => handleActionChange(index, e.target.value as RebaseCommit['action'])}
                className={`appearance-none px-2 py-1 pr-6 text-xs font-medium rounded border bg-[#1a1c23] border-white/10 focus:outline-none focus:border-white/20 cursor-pointer ${
                  commit.action === 'drop'
                    ? 'text-gk-red'
                    : commit.action === 'squash'
                    ? 'text-gk-purple'
                    : commit.action === 'reword'
                    ? 'text-gk-blue'
                    : 'text-gk-accent'
                }`}
                style={{ colorScheme: 'dark' }}
              >
                <option value="pick" className="bg-[#1a1c23] text-gk-accent">Pick</option>
                <option value="reword" className="bg-[#1a1c23] text-gk-blue">Reword</option>
                <option value="squash" className="bg-[#1a1c23] text-gk-purple">Squash</option>
                <option value="drop" className="bg-[#1a1c23] text-gk-red">Drop</option>
              </select>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
                {actionIcons[commit.action]}
              </div>
            </div>

            {/* Commit Info */}
            <div className="flex-1 min-w-0">
              {commit.action === 'reword' ? (
                <input
                  type="text"
                  value={commit.newMessage || commit.message}
                  onChange={(e) => {
                    const newCommits = [...rebaseCommits];
                    newCommits[index].newMessage = e.target.value;
                    setRebaseCommits(newCommits);
                  }}
                  className="w-full px-2 py-1 bg-black/30 border border-gk-blue/50 rounded text-sm text-white focus:outline-none focus:border-gk-blue"
                  autoFocus
                />
              ) : (
                <p className={`text-sm truncate ${commit.action === 'drop' ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                  {commit.message}
                </p>
              )}
              <p className="text-xs text-gray-500 font-mono">{commit.shortId}</p>
            </div>

            {/* Status */}
            <div className="text-xs text-gray-500">
              {actionLabels[commit.action]}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gk-header bg-gk-header">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {rebaseCommits.filter(c => c.action !== 'drop').length} commits will be kept
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExecute}
              disabled={loading || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-gk-purple hover:bg-purple-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Rebasing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Execute Rebase
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
    </div>
  );
};
