/**
 * Undo/Redo Hook
 * Manages undo and redo state for Git operations
 */
import { useState, useCallback } from 'react';

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

export const useUndo = () => {
  const [undoStack, setUndoStack] = useState<OperationState[]>([]);
  const [redoStack, setRedoStack] = useState<OperationState[]>([]);

  // Derived state for backwards compatibility
  const undoState: UndoState = {
    canUndo: undoStack.length > 0,
    lastOperation: undoStack.length > 0 ? undoStack[undoStack.length - 1].operation : null,
    beforeState: undoStack.length > 0 ? undoStack[undoStack.length - 1].beforeState : null,
    afterState: undoStack.length > 0 ? undoStack[undoStack.length - 1].afterState : null,
    branchBefore: undoStack.length > 0 ? undoStack[undoStack.length - 1].branchBefore : null,
    details: undoStack.length > 0 ? undoStack[undoStack.length - 1].details : null,
  };

  const redoState: RedoState = {
    canRedo: redoStack.length > 0,
    lastOperation: redoStack.length > 0 ? redoStack[redoStack.length - 1].operation : null,
    beforeState: redoStack.length > 0 ? redoStack[redoStack.length - 1].beforeState : null,
    afterState: redoStack.length > 0 ? redoStack[redoStack.length - 1].afterState : null,
    branchBefore: redoStack.length > 0 ? redoStack[redoStack.length - 1].branchBefore : null,
    details: redoStack.length > 0 ? redoStack[redoStack.length - 1].details : null,
  };

  const recordOperation = useCallback((
    operation: GitOperation,
    beforeSha: string,
    afterSha: string,
    details: string,
    branchBefore?: string
  ) => {
    const newOp: OperationState = {
      operation,
      beforeState: beforeSha,
      afterState: afterSha,
      branchBefore: branchBefore || null,
      details,
    };

    setUndoStack(prev => [...prev, newOp]);
    // Clear redo stack when new operation is performed
    setRedoStack([]);
  }, []);

  const clearUndo = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const performUndo = useCallback(async (repo: any, gitReset: any, gitCheckout: any) => {
    if (undoStack.length === 0) {
      throw new Error('Nothing to undo');
    }

    const lastOp = undoStack[undoStack.length - 1];

    try {
      // Reset to before state
      await gitReset(repo, lastOp.beforeState, 'hard');

      // If we switched branches, switch back
      if (lastOp.branchBefore) {
        await gitCheckout(repo, lastOp.branchBefore);
      }

      // Move operation to redo stack
      setRedoStack(prev => [...prev, lastOp]);
      setUndoStack(prev => prev.slice(0, -1));

      return true;
    } catch (e) {
      throw new Error(`Undo failed: ${e.message}`);
    }
  }, [undoStack]);

  const performRedo = useCallback(async (repo: any, gitReset: any, gitCheckout: any) => {
    if (redoStack.length === 0) {
      throw new Error('Nothing to redo');
    }

    const lastOp = redoStack[redoStack.length - 1];

    try {
      // Reset to after state (redo the operation)
      await gitReset(repo, lastOp.afterState, 'hard');

      // Move operation back to undo stack
      setUndoStack(prev => [...prev, lastOp]);
      setRedoStack(prev => prev.slice(0, -1));

      return true;
    } catch (e) {
      throw new Error(`Redo failed: ${e.message}`);
    }
  }, [redoStack]);

  return {
    undoState,
    redoState,
    recordOperation,
    clearUndo,
    performUndo,
    performRedo,
    undoStack,
    redoStack,
  };
};
