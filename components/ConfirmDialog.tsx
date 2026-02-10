import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X, Loader2, AlertOctagon, GitBranch, GitCommit, ArrowUpCircle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  details?: string;
  icon?: React.ReactNode;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  details,
  icon
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset states when dialog opens
  useEffect(() => {
    if (isOpen) {
      setIsConfirming(false);
      setIsClosing(false);
      // Focus the dialog
      const timer = setTimeout(() => dialogRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || isConfirming) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isConfirming]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = 'unset'; };
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isConfirming) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 150);
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 150);
    } catch (error) {
      console.error('Confirm dialog error:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  // Theme configuration
  const themes = {
    danger: {
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-400',
      iconRing: 'ring-red-500/20',
      buttonBg: 'bg-red-500 hover:bg-red-600',
      buttonText: 'text-white',
      accentLine: 'bg-gradient-to-r from-red-500 to-red-600',
      Icon: AlertOctagon
    },
    warning: {
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      iconRing: 'ring-amber-500/20',
      buttonBg: 'bg-amber-500 hover:bg-amber-600',
      buttonText: 'text-gray-900',
      accentLine: 'bg-gradient-to-r from-amber-500 to-orange-500',
      Icon: AlertTriangle
    },
    info: {
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      iconRing: 'ring-blue-500/20',
      buttonBg: 'bg-blue-500 hover:bg-blue-600',
      buttonText: 'text-white',
      accentLine: 'bg-gradient-to-r from-blue-500 to-cyan-500',
      Icon: Info
    },
    success: {
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      iconRing: 'ring-emerald-500/20',
      buttonBg: 'bg-emerald-500 hover:bg-emerald-600',
      buttonText: 'text-white',
      accentLine: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      Icon: CheckCircle
    }
  };

  const theme = themes[type];
  const IconComponent = theme.Icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className={`relative w-full max-w-md transform transition-all duration-200 outline-none ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        {/* Card */}
        <div className="bg-[#1e2028] rounded-xl shadow-2xl shadow-black/50 overflow-hidden border border-white/[0.06]">
          {/* Accent line */}
          <div className={`h-1 ${theme.accentLine}`} />

          {/* Content */}
          <div className="p-6">
            {/* Header with icon */}
            <div className="flex items-start gap-4">
              {/* Icon container */}
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${theme.iconBg} ring-1 ${theme.iconRing} flex items-center justify-center`}>
                {icon || <IconComponent className={`w-6 h-6 ${theme.iconColor}`} />}
              </div>

              {/* Title and message */}
              <div className="flex-1 min-w-0 pt-1">
                <h3
                  id="confirm-title"
                  className="text-lg font-semibold text-white leading-tight"
                >
                  {title}
                </h3>
                <p
                  id="confirm-message"
                  className="mt-2 text-sm text-gray-400 leading-relaxed"
                >
                  {message}
                </p>
              </div>

              {/* Close button */}
              {!isConfirming && (
                <button
                  onClick={handleClose}
                  className="flex-shrink-0 p-1.5 -mr-1.5 -mt-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Details section */}
            {details && (
              <div className="mt-4 ml-16">
                <div className="p-3 rounded-lg bg-black/30 border border-white/5">
                  <p className="text-xs text-gray-500 font-mono leading-relaxed whitespace-pre-wrap">
                    {details}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-black/20 border-t border-white/5 flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={isConfirming}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 ${theme.buttonBg} ${theme.buttonText} shadow-lg shadow-black/20`}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{confirmText}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Specialized variants for common actions

export const CherryPickDialog: React.FC<Omit<ConfirmDialogProps, 'title' | 'icon' | 'type' | 'message' | 'details' | 'confirmText'> & {
  commitCount: number;
  targetCommit?: string;
}> = (props) => {
  const { commitCount, targetCommit, ...rest } = props;

  return (
    <ConfirmDialog
      title="Cherry-Pick Commits"
      icon={<ArrowUpCircle className="w-6 h-6 text-emerald-400" />}
      type="success"
      {...rest}
      message={
        targetCommit
          ? `Cherry-pick ${commitCount} commit${commitCount > 1 ? 's' : ''} onto ${targetCommit}?`
          : `Cherry-pick ${commitCount} commit${commitCount > 1 ? 's' : ''}?`
      }
      details={
        targetCommit
          ? `This will apply the selected commit(s) onto ${targetCommit}.\n\nThe branch will be in a detached HEAD state after this operation.`
          : `This will apply the selected commit(s) to the current branch.`
      }
      confirmText="Cherry-Pick"
    />
  );
};

export const ReorderCommitsDialog: React.FC<Omit<ConfirmDialogProps, 'title' | 'icon' | 'type' | 'message' | 'details' | 'confirmText'> & {
  commitCount: number;
}> = (props) => {
  const { commitCount, ...rest } = props;

  return (
    <ConfirmDialog
      title="Reorder Commits"
      icon={<GitCommit className="w-6 h-6 text-blue-400" />}
      type="info"
      {...rest}
      message={`Reorder ${commitCount} commit${commitCount > 1 ? 's' : ''} using interactive rebase?`}
      details={`This will rewrite Git history to change the order of commits.\n\nMake sure these commits haven't been pushed to a remote branch yet, or you may cause issues for collaborators.`}
      confirmText="Reorder"
    />
  );
};

export const CreateBranchDialog: React.FC<Omit<ConfirmDialogProps, 'title' | 'icon' | 'type'> & {
  branchName: string;
  startPoint?: string;
}> = (props) => {
  const { branchName, startPoint, ...rest } = props;

  return (
    <ConfirmDialog
      title="Create New Branch"
      icon={<GitBranch className="w-6 h-6 text-purple-400" />}
      type="info"
      {...rest}
      message={`Create new branch "${branchName}"${startPoint ? ` starting at ${startPoint}` : ''}?`}
      details={startPoint ? `The new branch will be created from ${startPoint}.` : 'The new branch will be created from the current commit (HEAD).'}
      confirmText="Create Branch"
    />
  );
};

export const DiscardChangesDialog: React.FC<Omit<ConfirmDialogProps, 'title' | 'icon' | 'type'> & {
  fileCount?: number;
}> = (props) => {
  const { fileCount, ...rest } = props;

  return (
    <ConfirmDialog
      title="Discard Changes"
      type="danger"
      {...rest}
      message={
        fileCount
          ? `Discard changes to ${fileCount} file${fileCount > 1 ? 's' : ''}?`
          : 'Discard all uncommitted changes?'
      }
      details={`This action cannot be undone. All uncommitted changes will be permanently deleted.`}
      confirmText="Discard"
    />
  );
};

export default ConfirmDialog;
