import React, { useEffect, useState } from 'react';
import { Archive, Play, Trash2, Eye, X, Calendar, GitBranch, AlertTriangle } from 'lucide-react';
import { Stash } from '../types';
import AlertDialog from './AlertDialog';

interface StashPanelProps {
  stashes: Stash[];
  onApply: (stashId: string) => void;
  onPop: (stashId: string) => void;
  onDrop: (stashId: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

const StashPanel: React.FC<StashPanelProps> = ({
  stashes,
  onApply,
  onPop,
  onDrop,
  onClose,
  isLoading = false
}) => {
  const [expandedStash, setExpandedStash] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<{ isOpen: boolean; stashId: string; message: string }>({
    isOpen: false,
    stashId: '',
    message: ''
  });

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch (e) {
      return 'Unknown';
    }
  };

  const handleApply = (e: React.MouseEvent, stashId: string) => {
    e.stopPropagation();
    onApply(stashId);
  };

  const handlePop = (e: React.MouseEvent, stashId: string) => {
    e.stopPropagation();
    onPop(stashId);
  };

  const handleDrop = (e: React.MouseEvent, stashId: string, message: string) => {
    e.stopPropagation();
    setConfirmDrop({
      isOpen: true,
      stashId,
      message
    });
  };

  const confirmDropStash = () => {
    if (confirmDrop.stashId) {
      onDrop(confirmDrop.stashId);
      setConfirmDrop({ isOpen: false, stashId: '', message: '' });
    }
  };

  const toggleExpanded = (stashId: string) => {
    setExpandedStash(expandedStash === stashId ? null : stashId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-gk-panel border border-gk-header rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gk-header bg-gk-bg">
          <div className="flex items-center space-x-2">
            <Archive className="w-5 h-5 text-gk-blue" />
            <h2 className="text-lg font-bold text-white">Stash List</h2>
            <span className="text-sm text-gray-400">({stashes.length} {stashes.length === 1 ? 'stash' : 'stashes'})</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stash List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-500">
              Loading stashes...
            </div>
          ) : stashes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500 border border-dashed border-white/10 rounded-lg">
              <Archive className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No stashes found</p>
              <p className="text-xs mt-1 text-center max-w-xs">
                Stash lets you temporarily save uncommitted changes.<br/>
                Right-click files or use the stash button to save work-in-progress.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {stashes.map((stash) => (
                <div
                  key={stash.id}
                  className={`bg-gk-bg border rounded-lg transition-all cursor-pointer hover:border-gk-blue/50 ${
                    expandedStash === stash.id ? 'border-gk-blue' : 'border-gk-header'
                  }`}
                  onClick={() => toggleExpanded(stash.id)}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <GitBranch className="w-3.5 h-3.5 text-gk-purple flex-shrink-0" />
                          <h3 className="font-medium text-gray-200 truncate">{stash.message}</h3>
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {formatDate(stash.date)}
                          </span>
                          <span>on {stash.branch}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-1 ml-2">
                        <button
                          onClick={(e) => handleApply(e, stash.id)}
                          className="p-1.5 hover:bg-gk-blue/20 rounded text-gk-blue hover:text-gk-blue transition-colors"
                          title="Apply: Restore these changes to your working directory, keeping the stash for later use"
                          aria-label={`Apply stash: ${stash.message}`}
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handlePop(e, stash.id)}
                          className="p-1.5 hover:bg-gk-green/20 rounded text-gk-green hover:text-gk-green transition-colors"
                          title="Pop: Restore these changes and remove the stash from the list"
                          aria-label={`Pop stash: ${stash.message}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDrop(e, stash.id, stash.message)}
                          className="p-1.5 hover:bg-gk-red/20 rounded text-gk-red hover:text-gk-red transition-colors"
                          title="Drop: Permanently delete this stash without applying the changes"
                          aria-label={`Drop stash: ${stash.message}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedStash === stash.id && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-500">ID:</span>
                            <span className="text-gray-400 font-mono">{stash.id}</span>
                          </div>
                          {stash.commitId && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Commit:</span>
                              <span className="text-gray-400 font-mono">{stash.commitId.substring(0, 8)}</span>
                            </div>
                          )}
                          {stash.files && stash.files.length > 0 && (
                            <div>
                              <span className="text-gray-500">Files:</span>
                              <div className="mt-1 max-h-20 overflow-y-auto">
                                {stash.files.map((file) => (
                                  <div key={file} className="text-gray-400 font-mono text-[10px] truncate">
                                    {file}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gk-bg border-t border-gk-header text-xs text-gray-500 flex justify-between">
          <span>Click to view details</span>
          <div className="flex items-center space-x-4">
            <span className="flex items-center"><Play className="w-3 h-3 mr-1 text-gk-blue" /> Apply</span>
            <span className="flex items-center"><Eye className="w-3 h-3 mr-1 text-gk-green" /> Pop</span>
            <span className="flex items-center"><Trash2 className="w-3 h-3 mr-1 text-gk-red" /> Drop</span>
          </div>
        </div>

        {/* Drop Confirmation Dialog */}
        {confirmDrop.isOpen && (
          <AlertDialog
            isOpen={confirmDrop.isOpen}
            title="⚠️ Drop Stash"
            type="warning"
            onClose={() => setConfirmDrop({ isOpen: false, stashId: '', message: '' })}
            onConfirm={confirmDropStash}
          >
            <div className="space-y-4">
              <p className="text-gray-200">
                Are you sure you want to drop this stash? This action cannot be undone.
              </p>
              <div className="bg-gk-red/10 border border-gk-red/30 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-5 h-5 text-gk-red flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-gk-red mb-1">Stash to be dropped:</p>
                    <p className="text-sm text-gray-300 font-mono">{confirmDrop.message}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                All changes in this stash will be permanently deleted.
              </p>
            </div>
          </AlertDialog>
        )}
      </div>
    </div>
  );
};

export default StashPanel;
