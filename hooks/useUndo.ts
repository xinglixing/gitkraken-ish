/**
 * Undo/Redo Hook with Per-Repository Support
 * Manages undo and redo state for Git operations, with each repository having its own history
 */
import { useState, useCallback, useMemo } from 'react';
import { Repository } from '../types';

export type GitOperation =
  | 'cherry-pick'
  | 'commit'
  | 'create-branch'
  | 'delete-branch'
  | 'checkout'
  | 'merge'
  | 'stash'
  | 'squash'
  | 'interactive-rebase'
  | 'reset';

export interface OperationState {
  operation: GitOperation;
  beforeState: string;     // HEAD SHA before operation
  afterState: string;      // HEAD SHA after operation
  branchBefore: string | null; // Branch name before operation
  details: string;         // Human-readable description
}

export interface UndoState {
  canUndo: boolean;
  lastOperation: GitOperation | null;
  beforeState: string | null;
  afterState: string | null;
  branchBefore: string | null;
  details: string | null;
}

export interface RedoState {
  canRedo: boolean;
  lastOperation: GitOperation | null;
  beforeState: string | null;
  afterState: string | null;
  branchBefore: string | null;
  details: string | null;
}

// Key for storing undo/redo stacks - uses repo path as unique identifier
const getRepoKey = (repo: Repository | null): string => {
  if (!repo) return '';
  return repo.path || repo.full_name || String(repo.id);
};

export const useUndo = () => {
  // Store undo/redo stacks per repository (keyed by repo path)
  const [undoStacks, setUndoStacks] = useState<Map<string, OperationState[]>>(new Map());
  const [redoStacks, setRedoStacks] = useState<Map<string, OperationState[]>>(new Map());

  // Get current repo's undo/redo stacks
  const getRepoStacks = useCallback((repo: Repository | null) => {
    const key = getRepoKey(repo);
    return {
      undo: undoStacks.get(key) || [],
      redo: redoStacks.get(key) || [],
    };
  }, [undoStacks, redoStacks]);

  // Derived state for current repo
  const getUndoState = useCallback((repo: Repository | null): UndoState => {
    const { undo } = getRepoStacks(repo);
    return {
      canUndo: undo.length > 0,
      lastOperation: undo.length > 0 ? undo[undo.length - 1].operation : null,
      beforeState: undo.length > 0 ? undo[undo.length - 1].beforeState : null,
      afterState: undo.length > 0 ? undo[undo.length - 1].afterState : null,
      branchBefore: undo.length > 0 ? undo[undo.length - 1].branchBefore : null,
      details: undo.length > 0 ? undo[undo.length - 1].details : null,
    };
  }, [getRepoStacks]);

  const getRedoState = useCallback((repo: Repository | null): RedoState => {
    const { redo } = getRepoStacks(repo);
    return {
      canRedo: redo.length > 0,
      lastOperation: redo.length > 0 ? redo[redo.length - 1].operation : null,
      beforeState: redo.length > 0 ? redo[redo.length - 1].beforeState : null,
      afterState: redo.length > 0 ? redo[redo.length - 1].afterState : null,
      branchBefore: redo.length > 0 ? redo[redo.length - 1].branchBefore : null,
      details: redo.length > 0 ? redo[redo.length - 1].details : null,
    };
  }, [getRepoStacks]);

  const recordOperation = useCallback((
    repo: Repository | null,
    operation: GitOperation,
    beforeSha: string,
    afterSha: string,
    details: string,
    branchBefore?: string
  ) => {
    const key = getRepoKey(repo);
    if (!key) return;

    const newOp: OperationState = {
      operation,
      beforeState: beforeSha,
      afterState: afterSha,
      branchBefore: branchBefore || null,
      details,
    };

    setUndoStacks(prev => {
      const newStacks = new Map(prev);
      const currentStack = newStacks.get(key) || [];
      newStacks.set(key, [...currentStack, newOp]);
      return newStacks;
    });

    // Clear redo stack for this repo when new operation is performed
    setRedoStacks(prev => {
      const newStacks = new Map(prev);
      newStacks.delete(key);
      return newStacks;
    });
  }, []);

  const clearUndo = useCallback((repo?: Repository | null) => {
    if (repo) {
      // Clear only for specific repo
      const key = getRepoKey(repo);
      setUndoStacks(prev => {
        const newStacks = new Map(prev);
        newStacks.delete(key);
        return newStacks;
      });
      setRedoStacks(prev => {
        const newStacks = new Map(prev);
        newStacks.delete(key);
        return newStacks;
      });
    } else {
      // Clear all
      setUndoStacks(new Map());
      setRedoStacks(new Map());
    }
  }, []);

  const performUndo = useCallback(async (
    repo: Repository | null,
    gitReset: (repo: any, ref: string, mode: 'hard') => Promise<void>,
    gitCheckout: (repo: any, branch: string) => Promise<void>
  ) => {
    const key = getRepoKey(repo);
    if (!key) throw new Error('No repository selected');

    const { undo, redo } = getRepoStacks(repo);
    if (undo.length === 0) {
      throw new Error('Nothing to undo');
    }

    const lastOp = undo[undo.length - 1];

    try {
      // Reset to before state
      await gitReset(repo, lastOp.beforeState, 'hard');

      // If we switched branches, switch back
      if (lastOp.branchBefore) {
        await gitCheckout(repo, lastOp.branchBefore);
      }

      // Move operation to redo stack
      setUndoStacks(prev => {
        const newStacks = new Map(prev);
        newStacks.set(key, undo.slice(0, -1));
        return newStacks;
      });

      setRedoStacks(prev => {
        const newStacks = new Map(prev);
        newStacks.set(key, [...redo, lastOp]);
        return newStacks;
      });

      return true;
    } catch (e: any) {
      throw new Error(`Undo failed: ${e.message}`);
    }
  }, [getRepoStacks]);

  const performRedo = useCallback(async (
    repo: Repository | null,
    gitReset: (repo: any, ref: string, mode: 'hard') => Promise<void>,
    gitCheckout: (repo: any, branch: string) => Promise<void>
  ) => {
    const key = getRepoKey(repo);
    if (!key) throw new Error('No repository selected');

    const { undo, redo } = getRepoStacks(repo);
    if (redo.length === 0) {
      throw new Error('Nothing to redo');
    }

    const lastOp = redo[redo.length - 1];

    try {
      // Reset to after state (redo the operation)
      await gitReset(repo, lastOp.afterState, 'hard');

      // Move operation back to undo stack
      setRedoStacks(prev => {
        const newStacks = new Map(prev);
        newStacks.set(key, redo.slice(0, -1));
        return newStacks;
      });

      setUndoStacks(prev => {
        const newStacks = new Map(prev);
        newStacks.set(key, [...undo, lastOp]);
        return newStacks;
      });

      return true;
    } catch (e: any) {
      throw new Error(`Redo failed: ${e.message}`);
    }
  }, [getRepoStacks]);

  // Backwards compatibility - returns state for current repo
  const undoStateForRepo = useCallback((repo: Repository | null) => getUndoState(repo), [getUndoState]);
  const redoStateForRepo = useCallback((repo: Repository | null) => getRedoState(repo), [getRedoState]);

  return {
    undoState: undoStateForRepo,
    redoState: redoStateForRepo,
    getUndoState,
    getRedoState,
    recordOperation,
    clearUndo,
    performUndo,
    performRedo,
    undoStacks,
    redoStacks,
  };
};
