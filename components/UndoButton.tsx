import React, { useState, useEffect } from 'react';
import { Undo, Redo } from 'lucide-react';
import { Repository } from '../types';
import { getCurrentBranch } from '../services/localGitService';
import AlertDialog from './AlertDialog';

interface UndoState {
  canUndo: boolean;
  lastOperation: string | null;
  beforeState: string | null;
  afterState: string | null;
  branchBefore: string | null;
  details: string | null;
}

interface RedoState {
  canRedo: boolean;
  lastOperation: string | null;
  beforeState: string | null;
  afterState: string | null;
  branchBefore: string | null;
  details: string | null;
}

interface UndoButtonProps {
  repo: Repository | null;
  onRefresh: () => void;
  undoState: UndoState | ((repo: Repository | null) => UndoState);
  onUndo?: () => Promise<void>;
  redoState?: RedoState | ((repo: Repository | null) => RedoState);
  onRedo?: () => Promise<void>;
}

const UndoButton: React.FC<UndoButtonProps> = ({ repo, onRefresh, undoState: undoStateProp, onUndo, redoState: redoStateProp, onRedo }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [alert, setAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    details?: string;
    type: 'success' | 'error' | 'info';
  }>({ isOpen: false, title: '', message: '', type: 'info' });

  // Resolve undo/redo state (handle both function and object formats)
  const undoState = typeof undoStateProp === 'function' ? undoStateProp(repo) : undoStateProp;
  const redoState = typeof redoStateProp === 'function' ? redoStateProp(repo) : redoStateProp;

  // Check current branch to validate undo
  useEffect(() => {
    const checkBranch = async () => {
      if (repo?.isLocal && repo?.path) {
        try {
          const branch = await getCurrentBranch(repo);
          setCurrentBranch(branch);
        } catch {
          setCurrentBranch(null);
        }
      }
    };
    checkBranch();
  }, [repo, undoState]);

  // Check if undo is valid for current branch
  // For operations like rebase, we must be on the same branch
  const isValidForCurrentBranch = () => {
    if (!undoState.branchBefore) return true; // No branch constraint
    if (!currentBranch) return false;
    return currentBranch === undoState.branchBefore;
  };

  // If nothing to undo and nothing to redo, return null
  if (!undoState.canUndo && !redoState?.canRedo) {
    return null;
  }

  if (!repo) {
    return null;
  }

  // Check if undo is valid for current branch (only affects undo button)
  const undoDisabled = undoState.canUndo && !isValidForCurrentBranch();

  const handleUndoClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmUndo = async () => {
    setShowConfirm(false);

    if (!onUndo) {
      setAlert({
        isOpen: true,
        title: 'Undo Failed',
        message: 'Undo handler not provided',
        type: 'error',
      });
      return;
    }

    try {
      await onUndo();

      setAlert({
        isOpen: true,
        title: 'Undo Successful',
        message: `Successfully undid ${undoState.lastOperation}`,
        details: undoState.details || '',
        type: 'success',
      });

      onRefresh();
    } catch (e) {
      setAlert({
        isOpen: true,
        title: 'Undo Failed',
        message: e.message,
        type: 'error',
      });
    }
  };

  const handleRedoClick = async () => {
    if (onRedo) {
      try {
        await onRedo();
        onRefresh();
        setAlert({
          isOpen: true,
          title: 'Redo Successful',
          message: `Successfully redid ${redoState?.lastOperation}`,
          details: redoState?.details || '',
          type: 'success',
        });
      } catch (e) {
        setAlert({
          isOpen: true,
          title: 'Redo Failed',
          message: e.message,
          type: 'error',
        });
      }
    }
  };

  const getOperationLabel = (operation: string | null) => {
    if (!operation) return 'Last Operation';

    const labels: Record<string, string> = {
      'cherry-pick': 'Cherry-pick',
      'commit': 'Commit',
      'create-branch': 'Create Branch',
      'delete-branch': 'Delete Branch',
      'checkout': 'Checkout',
      'merge': 'Merge',
      'stash': 'Stash',
      'squash': 'Squash',
      'interactive-rebase': 'Interactive Rebase',
      'reset': 'Reset',
    };

    return labels[operation] || operation;
  };

  return (
    <>
      <div className="flex items-center space-x-1">
        {/* Undo Button */}
        {undoState.canUndo && (
          <button
            onClick={handleUndoClick}
            disabled={undoDisabled}
            className={`flex items-center space-x-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
              undoDisabled
                ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                : 'bg-purple-600/80 hover:bg-purple-600 text-white'
            }`}
            title={undoDisabled
              ? `Undo not available: switch to branch "${undoState.branchBefore}" to undo this operation`
              : `Undo: ${undoState.details}`
            }
          >
            <Undo className="w-3.5 h-3.5" />
            <span className="font-medium">Undo {getOperationLabel(undoState.lastOperation)}</span>
          </button>
        )}

        {/* Redo Button */}
        {redoState?.canRedo && onRedo && (
          <button
            onClick={handleRedoClick}
            className="flex items-center space-x-1.5 px-2 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-xs transition-colors"
            title={`Redo: ${redoState.details}`}
          >
            <Redo className="w-3.5 h-3.5" />
            <span className="font-medium">Redo</span>
          </button>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Undo"
        type="info"
        highZIndex={true}
        hideDefaultButton={true}
      >
        <div className="space-y-3">
          <p className="text-gray-200">
            Are you sure you want to undo the last operation?
          </p>
          <div className="bg-gk-bg rounded p-3 text-sm">
            <p className="font-bold text-gk-accent mb-1">{getOperationLabel(undoState.lastOperation)}</p>
            <p className="text-gray-400">{undoState.details}</p>
          </div>
          <p className="text-yellow-400 text-sm">
            ⚠️ This will reset your repository to the previous state. Any uncommitted changes may be lost.
          </p>
          <div className="flex justify-end space-x-2 mt-4">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmUndo}
              className="px-4 py-2 bg-gk-accent hover:bg-gk-accent/80 text-white rounded transition-colors"
            >
              Undo
            </button>
          </div>
        </div>
      </AlertDialog>

      {/* Result Alert */}
      <AlertDialog
        isOpen={alert.isOpen}
        onClose={() => setAlert({ ...alert, isOpen: false })}
        title={alert.title}
        type={alert.type}
        onConfirm={() => setAlert({ ...alert, isOpen: false })}
        confirmText="OK"
        highZIndex={true}
      >
        <div className="space-y-2">
          <p className="text-gray-200">{alert.message}</p>
          {alert.details && (
            <p className="text-gray-400 text-sm">{alert.details}</p>
          )}
        </div>
      </AlertDialog>
    </>
  );
};

export default UndoButton;
