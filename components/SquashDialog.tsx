import React, { useState, useEffect } from 'react';
import { Layers, X, Check, AlertTriangle, FileEdit } from 'lucide-react';
import { Commit } from '../types';

interface SquashDialogProps {
  isOpen: boolean;
  commits: Commit[];
  onConfirm: (message: string) => void;
  onClose: () => void;
}

const SquashDialog: React.FC<SquashDialogProps> = ({
  isOpen,
  commits,
  onConfirm,
  onClose
}) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate default combined message when dialog opens
  useEffect(() => {
    if (isOpen && commits.length > 0) {
      // Combine all commit messages
      const combined = commits
        .map(c => c.message)
        .join('\n\n');
      setMessage(combined);
    }
  }, [isOpen, commits]);

  const handleSubmit = () => {
    if (!message.trim()) {
      return;
    }
    setIsSubmitting(true);
    onConfirm(message.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter to submit
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-gk-panel border border-gk-header rounded-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-bg">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-gk-purple" />
            <h2 className="text-lg font-bold text-white">Squash Commits</h2>
            <span className="text-sm text-gray-400">({commits.length} commits)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* Warning */}
          <div className="bg-gk-yellow/10 border border-gk-yellow/30 rounded-lg p-3 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-gk-yellow flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p className="font-bold text-gk-yellow mb-1">⚠️ Irreversible Action</p>
              <p className="text-gray-400">
                Squashing will combine {commits.length} commits into a single new commit. This will change Git history and cannot be undone easily.
              </p>
            </div>
          </div>

          {/* Commits to squash */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-2 flex items-center">
              <FileEdit className="w-4 h-4 mr-1" />
              Commits to be squashed:
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {commits.map((commit, idx) => (
                <div
                  key={commit.id}
                  className="bg-gk-bg border border-gk-header rounded p-2 text-xs"
                >
                  <div className="flex items-start space-x-2">
                    <span className="flex-shrink-0 font-mono text-gk-purple bg-gk-purple/10 px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-200 truncate">{commit.message}</div>
                      <div className="text-gray-500 mt-0.5 flex items-center space-x-2">
                        <span>{commit.shortId}</span>
                        <span>•</span>
                        <span>{commit.author}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message editor */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-2">
              Squashed commit message:
            </h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a combined commit message..."
              className="w-full h-48 bg-black/30 border border-gk-header rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gk-purple resize-none font-mono"
              autoFocus
            />
            <div className="mt-2 text-xs text-gray-500 flex justify-between">
              <span>{message.split('\n').length} lines</span>
              <span>Ctrl+Enter to confirm</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gk-bg border-t border-gk-header flex justify-end space-x-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || isSubmitting}
            className="px-4 py-2 bg-gk-purple hover:bg-gk-purple/80 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Squashing...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Squash {commits.length} Commits</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SquashDialog;
