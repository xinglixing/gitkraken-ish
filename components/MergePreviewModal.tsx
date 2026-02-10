import React, { useEffect } from 'react';
import { X, GitMerge, AlertTriangle, CheckCircle, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { MergePreview } from '../types';

interface MergePreviewModalProps {
  isOpen: boolean;
  preview: MergePreview | null;
  onClose: () => void;
  onProceed: () => void;
  isLoading?: boolean;
}

const MergePreviewModal: React.FC<MergePreviewModalProps> = ({ isOpen, preview, onClose, onProceed, isLoading }) => {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Show loading spinner while preview is being computed
  if (isLoading || !preview) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
        <div className="bg-gk-panel border border-white/10 rounded-xl shadow-2xl p-8 flex flex-col items-center" role="dialog" aria-modal="true" aria-label="Merge preview loading" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-8 h-8 text-gk-blue animate-spin mb-3" />
          <span className="text-sm text-gray-300">Computing merge preview...</span>
        </div>
      </div>
    );
  }

  const riskColors = {
    low: { bg: 'bg-gk-accent/10', border: 'border-gk-accent/30', text: 'text-gk-accent', icon: CheckCircle },
    medium: { bg: 'bg-gk-yellow/10', border: 'border-gk-yellow/30', text: 'text-gk-yellow', icon: AlertCircle },
    high: { bg: 'bg-gk-red/10', border: 'border-gk-red/30', text: 'text-gk-red', icon: AlertTriangle },
  };

  const risk = riskColors[preview.conflictRisk];
  const RiskIcon = risk.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-[520px] max-h-[70vh] bg-gk-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label="Merge preview" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center">
            <GitMerge className="w-5 h-5 mr-2 text-gk-blue" />
            <h2 className="text-lg font-bold text-white">Merge Preview</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Branch info */}
          <div className="flex items-center justify-between bg-white/5 rounded-lg p-4 border border-white/5">
            <div className="text-sm">
              <span className="text-gray-500">From:</span>{' '}
              <span className="text-gk-blue font-bold">{preview.sourceBranch}</span>
            </div>
            <GitMerge className="w-4 h-4 text-gray-500" />
            <div className="text-sm">
              <span className="text-gray-500">Into:</span>{' '}
              <span className="text-gk-accent font-bold">{preview.targetBranch}</span>
            </div>
          </div>

          {/* Risk Badge */}
          <div className={`${risk.bg} ${risk.border} border rounded-lg p-4 flex items-center`}>
            <RiskIcon className={`w-5 h-5 ${risk.text} mr-3`} />
            <div>
              <div className={`font-bold text-sm ${risk.text} capitalize`}>
                {preview.conflictRisk} Risk
              </div>
              <div className="text-xs text-gray-400">
                {preview.conflictRisk === 'low' && 'No overlapping files detected. Merge should be clean.'}
                {preview.conflictRisk === 'medium' && `${preview.overlappingFiles.length} file(s) changed in both branches. Conflicts possible.`}
                {preview.conflictRisk === 'high' && `${preview.overlappingFiles.length} overlapping files detected. High chance of conflicts.`}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 rounded-lg p-3 text-center border border-white/5">
              <div className="text-2xl font-bold text-white">{preview.commits.length}</div>
              <div className="text-[10px] text-gray-500 uppercase">Commits</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center border border-white/5">
              <div className="text-2xl font-bold text-white">{preview.totalFiles}</div>
              <div className="text-[10px] text-gray-500 uppercase">Files Changed</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center border border-white/5">
              <div className={`text-2xl font-bold ${risk.text}`}>{preview.overlappingFiles.length}</div>
              <div className="text-[10px] text-gray-500 uppercase">Overlapping</div>
            </div>
          </div>

          {/* Commits list */}
          {preview.commits.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Commits to Merge</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                {preview.commits.slice(0, 20).map(c => (
                  <div key={c.id} className="flex items-center text-xs p-1.5 rounded hover:bg-white/5">
                    <span className="font-mono text-gk-blue mr-2">{c.shortId}</span>
                    <span className="text-gray-300 truncate flex-1">{c.message}</span>
                  </div>
                ))}
                {preview.commits.length > 20 && (
                  <div className="text-xs text-gray-600 italic pl-2">
                    ...and {preview.commits.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Overlapping files */}
          {preview.overlappingFiles.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gk-yellow uppercase mb-2">Overlapping Files</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                {preview.overlappingFiles.map(file => (
                  <div key={file} className="flex items-center text-xs p-1.5 rounded bg-gk-yellow/5">
                    <FileText className="w-3 h-3 mr-2 text-gk-yellow" />
                    <span className="text-gray-300 truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            className="px-6 py-2 bg-gk-blue text-white text-sm font-bold rounded hover:bg-gk-blue/80 transition-colors"
          >
            Proceed with Merge
          </button>
        </div>
      </div>
    </div>
  );
};

export default MergePreviewModal;
