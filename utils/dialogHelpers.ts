/**
 * Modal and Dialog Utilities
 * Helper functions for showing modals and dialogs
 */

import React from 'react';
import ConfirmDialog, { CherryPickDialog, ReorderCommitsDialog } from '../components/ConfirmDialog';

export interface DialogOptions {
  title?: string;
  message: string;
  details?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Helper for cherry-pick confirmation
 */
export const showCherryPickConfirm = (
  commitCount: number,
  onConfirm: () => void | Promise<void>,
  targetCommit?: string
) => ({
  isOpen: true,
  commitCount,
  targetCommit,
  onConfirm
});

/**
 * Helper for reorder confirmation
 */
export const showReorderConfirm = (
  commitCount: number,
  onConfirm: () => void | Promise<void>
) => ({
  isOpen: true,
  commitCount,
  onConfirm
});

/**
 * Helper for branch creation confirmation
 */
export const showCreateBranchConfirm = (
  branchName: string,
  onConfirm: () => void | Promise<void>,
  startPoint?: string
) => ({
  isOpen: true,
  title: `Create Branch "${branchName}"`,
  message: `Create new branch "${branchName}"${startPoint ? ` from ${startPoint}` : ''}?`,
  details: startPoint ? `Branch will start at ${startPoint}` : 'Branch will start at current commit',
  type: 'info' as const,
  confirmText: 'Create Branch',
  onConfirm
});

/**
 * Helper for discard changes confirmation
 */
export const showDiscardChangesConfirm = (
  onConfirm: () => void | Promise<void>,
  fileCount?: number
) => ({
  isOpen: true,
  title: 'Discard All Changes',
  message: fileCount
    ? `Discard changes to ${fileCount} file${fileCount > 1 ? 's' : ''}?`
    : 'Discard all uncommitted changes?',
  details: '⚠️ WARNING: This action cannot be undone!\n\nAll uncommitted changes will be permanently deleted.',
  type: 'danger' as const,
  confirmText: 'Discard Changes',
  onConfirm
});

/**
 * Helper for stash confirmation
 */
export const showStashConfirm = (
  message: string,
  onConfirm: () => void | Promise<void>
) => ({
  isOpen: true,
  title: 'Stash Changes',
  message: `Stash current changes${message ? ` with message: "${message}"` : ''}?`,
  details: 'Your changes will be saved to the stash list and can be reapplied later.',
  type: 'info' as const,
  confirmText: 'Stash',
  onConfirm
});

/**
 * Helper for checkout confirmation
 */
export const showCheckoutConfirm = (
  commitId: string,
  shortId: string,
  onConfirm: () => void | Promise<void>
) => ({
  isOpen: true,
  title: 'Checkout Commit',
  message: `Checkout commit ${shortId}?`,
  details: `You will be in a detached HEAD state after this operation.\n\nCommit: ${commitId}`,
  type: 'warning' as const,
  confirmText: 'Checkout',
  onConfirm
});

/**
 * Helper for rebase/cherry-pick error messages
 */
export const getGitErrorMessage = (error: any, operation: string): string => {
  const message = error?.message || error?.toString() || 'Unknown error';

  // Special error messages
  if (message.includes('cannot rebase root commit')) {
    return `Cannot ${operation}: Root commits cannot be moved or reordered.`;
  }

  if (message.includes('conflict')) {
    return `Cannot ${operation}: This would cause merge conflicts.\n\nResolve conflicts first or choose a different target.`;
  }

  if (message.includes('not allowed')) {
    return `Cannot ${operation}: Operation not allowed in current mode.\n\nUse Electron mode with local repository for full Git features.`;
  }

  return `Cannot ${operation}: ${message}`;
};

/**
 * Show error dialog helper
 */
export const showErrorDialog = (title: string, message: string, details?: string) => ({
  isOpen: true,
  title,
  message,
  details,
  type: 'danger' as const,
  confirmText: 'OK',
  cancelText: undefined
});

/**
 * Show warning dialog helper
 */
export const showWarningDialog = (title: string, message: string, details?: string) => ({
  isOpen: true,
  title,
  message,
  details,
  type: 'warning' as const,
  confirmText: 'Continue',
  cancelText: 'Cancel'
});

/**
 * Show info dialog helper
 */
export const showInfoDialog = (title: string, message: string, details?: string) => ({
  isOpen: true,
  title,
  message,
  details,
  type: 'info' as const,
  confirmText: 'OK',
  cancelText: undefined
});
