import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Check, X, Sparkles, RefreshCw, FileText, GitMerge } from 'lucide-react';
import { resolveMergeConflict } from '../services/aiService';
import { AIConfig, Repository } from '../types';
import {
  ConflictFile,
  resolveConflictAccept,
  resolveConflictAcceptBoth,
  resolveConflictRegion,
  parseAllConflictRegions
} from '../services/conflictDetectionService';
import { gitStage, gitWriteFile } from '../services/localGitService';
import AlertDialog from './AlertDialog';

interface MergeToolProps {
  onClose: () => void;
  config: AIConfig;
  repo?: Repository | null;
  onResolved?: () => void;
}

// Line type classification for rendering
type LineType = 'normal' | 'marker-start' | 'marker-separator' | 'marker-end' | 'current' | 'incoming';

interface AnnotatedLine {
  text: string;
  lineNumber: number;
  type: LineType;
  regionIndex: number | null; // which conflict region this line belongs to
}

const annotateLines = (content: string): AnnotatedLine[] => {
  const lines = content.split('\n');
  const result: AnnotatedLine[] = [];
  let inConflict = false;
  let section: 'current' | 'incoming' = 'current';
  let regionIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      section = 'current';
      regionIndex++;
      result.push({ text: line, lineNumber: i, type: 'marker-start', regionIndex });
    } else if (line.startsWith('=======') && inConflict) {
      section = 'incoming';
      result.push({ text: line, lineNumber: i, type: 'marker-separator', regionIndex });
    } else if (line.startsWith('>>>>>>>') && inConflict) {
      result.push({ text: line, lineNumber: i, type: 'marker-end', regionIndex });
      inConflict = false;
    } else if (inConflict) {
      result.push({ text: line, lineNumber: i, type: section, regionIndex });
    } else {
      result.push({ text: line, lineNumber: i, type: 'normal', regionIndex: null });
    }
  }

  return result;
};

const ConflictFileView: React.FC<{
  content: string;
  onResolveRegion: (regionIndex: number, side: 'current' | 'incoming' | 'both') => void;
}> = ({ content, onResolveRegion }) => {
  const annotatedLines = useMemo(() => annotateLines(content), [content]);

  // Pre-compute which line indices should show action bars (first marker-start of each region)
  const actionBarIndices = useMemo(() => {
    const indices = new Set<number>();
    const seenRegions = new Set<number>();
    annotatedLines.forEach((line, idx) => {
      if (line.type === 'marker-start' && line.regionIndex !== null && !seenRegions.has(line.regionIndex)) {
        seenRegions.add(line.regionIndex);
        indices.add(idx);
      }
    });
    return indices;
  }, [annotatedLines]);

  return (
    <div className="font-mono text-sm leading-relaxed">
      {annotatedLines.map((line, idx) => {
        const showActionBar = actionBarIndices.has(idx);

        return (
          <React.Fragment key={idx}>
            {/* Inline action bar above <<<<<<< markers */}
            {showActionBar && line.regionIndex !== null && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gk-panel/80 border-l-2 border-gk-yellow text-xs">
                <span className="text-gray-500 mr-1">Conflict #{(line.regionIndex ?? 0) + 1}:</span>
                <button
                  onClick={() => onResolveRegion(line.regionIndex!, 'current')}
                  className="text-gk-blue hover:text-white hover:bg-gk-blue/30 px-2 py-0.5 rounded transition-colors"
                >
                  Accept Current
                </button>
                <span className="text-gray-600">|</span>
                <button
                  onClick={() => onResolveRegion(line.regionIndex!, 'incoming')}
                  className="text-gk-accent hover:text-white hover:bg-gk-accent/30 px-2 py-0.5 rounded transition-colors"
                >
                  Accept Incoming
                </button>
                <span className="text-gray-600">|</span>
                <button
                  onClick={() => onResolveRegion(line.regionIndex!, 'both')}
                  className="text-gk-purple hover:text-white hover:bg-gk-purple/30 px-2 py-0.5 rounded transition-colors"
                >
                  Accept Both
                </button>
              </div>
            )}

            {/* The actual line */}
            <div
              className={`flex ${
                line.type === 'marker-start' || line.type === 'marker-separator' || line.type === 'marker-end'
                  ? 'bg-gk-yellow/15'
                  : line.type === 'current'
                  ? 'bg-blue-500/10 border-l-2 border-blue-400'
                  : line.type === 'incoming'
                  ? 'bg-green-500/10 border-l-2 border-green-400'
                  : ''
              }`}
            >
              <span className="w-12 flex-shrink-0 text-right pr-3 text-gray-600 select-none border-r border-white/5">
                {line.lineNumber + 1}
              </span>
              <span
                className={`flex-1 px-3 whitespace-pre-wrap break-all ${
                  line.type === 'marker-start' || line.type === 'marker-separator' || line.type === 'marker-end'
                    ? 'text-gk-yellow/70'
                    : line.type === 'current'
                    ? 'text-blue-300'
                    : line.type === 'incoming'
                    ? 'text-green-300'
                    : 'text-gray-300'
                }`}
              >
                {line.text || '\u00A0'}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const MergeTool: React.FC<MergeToolProps> = ({ onClose, config, repo, onResolved }) => {
  const [resolving, setResolving] = useState(false);
  const [aiResolution, setAiResolution] = useState<{code: string, reason: string} | null>(null);
  const [conflictedFiles, setConflictedFiles] = useState<ConflictFile[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [resolvedContent, setResolvedContent] = useState('');
  const [viewMode, setViewMode] = useState<'conflict' | 'edit'>('conflict');
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ isOpen: false, title: '', message: '', type: 'info' });

  const currentFile = conflictedFiles[currentFileIndex] || null;

  // Load conflicted files on mount
  useEffect(() => {
    loadConflictedFiles();
  }, [repo]);

  const loadConflictedFiles = async () => {
    if (!repo?.isLocal) return;

    try {
      const { findConflictedFiles } = await import('../services/conflictDetectionService');
      const files = await findConflictedFiles(repo);
      setConflictedFiles(files);

      if (files.length > 0) {
        setResolvedContent(files[0].rawContent);
      }
    } catch (error) {
      console.error('Failed to load conflicted files:', error);
      setAlert({
        isOpen: true,
        title: 'Error',
        message: 'Failed to load conflicted files',
        type: 'error'
      });
    }
  };

  const handleAIResolve = async () => {
    if (!currentFile) return;

    setResolving(true);
    try {
      const result = await resolveMergeConflict(
        currentFile.path,
        currentFile.rawContent,
        '',
        config
      );
      setAiResolution({ code: result.resolution, reason: result.explanation });
      setResolvedContent(result.resolution);
    } catch (e) {
      setAlert({
        isOpen: true,
        title: 'AI Resolution Failed',
        message: 'Failed to resolve conflict with AI. Please resolve manually.',
        type: 'error'
      });
    }
    setResolving(false);
  };

  const handleAcceptCurrent = () => {
    if (!currentFile) return;
    const resolved = resolveConflictAccept(resolvedContent, 'current');
    setResolvedContent(resolved);
    setAiResolution(null);
  };

  const handleAcceptIncoming = () => {
    if (!currentFile) return;
    const resolved = resolveConflictAccept(resolvedContent, 'incoming');
    setResolvedContent(resolved);
    setAiResolution(null);
  };

  const handleAcceptBoth = () => {
    if (!currentFile) return;
    const resolved = resolveConflictAcceptBoth(resolvedContent);
    setResolvedContent(resolved);
    setAiResolution(null);
  };

  const handleResolveRegion = (regionIndex: number, side: 'current' | 'incoming' | 'both') => {
    const resolved = resolveConflictRegion(resolvedContent, regionIndex, side);
    setResolvedContent(resolved);
    setAiResolution(null);
  };

  const handleSaveCurrent = async () => {
    if (!currentFile || !repo) return;

    setSaving(true);
    try {
      // Write resolved content
      await gitWriteFile(repo, currentFile.path, resolvedContent);

      // Stage the resolved file
      await gitStage(repo, currentFile.path);

      // Move to next file or close if done
      if (currentFileIndex < conflictedFiles.length - 1) {
        const nextIndex = currentFileIndex + 1;
        setCurrentFileIndex(nextIndex);
        setResolvedContent(conflictedFiles[nextIndex].rawContent);
        setAiResolution(null);
      } else {
        // All files resolved
        if (onResolved) onResolved();
        onClose();
      }

      setAlert({
        isOpen: true,
        title: 'File Resolved',
        message: `"${currentFile.path}" has been marked as resolved.`,
        type: 'success'
      });
    } catch (error) {
      setAlert({
        isOpen: true,
        title: 'Save Failed',
        message: error.message || 'Failed to save resolved file',
        type: 'error'
      });
    }
    setSaving(false);
  };

  const handleSaveAll = async () => {
    // Save current file first
    await handleSaveCurrent();

    // Then save remaining files with incoming version
    for (let i = currentFileIndex + 1; i < conflictedFiles.length; i++) {
      const file = conflictedFiles[i];
      if (repo) {
        const resolved = resolveConflictAccept(file.rawContent, 'incoming');
        await gitWriteFile(repo, file.path, resolved);
        await gitStage(repo, file.path);
      }
    }

    if (onResolved) onResolved();
    onClose();
  };

  // Check if current content still has conflicts
  const hasRemainingConflicts = useMemo(() => {
    return resolvedContent.includes('<<<<<<<');
  }, [resolvedContent]);

  const remainingConflictCount = useMemo(() => {
    return parseAllConflictRegions(resolvedContent).length;
  }, [resolvedContent]);

  if (!repo?.isLocal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-gk-panel border border-gk-header rounded-xl p-8 max-w-md">
          <p className="text-gray-300">Merge conflicts only available for local repositories.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gk-accent rounded">Close</button>
        </div>
      </div>
    );
  }

  if (conflictedFiles.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-gk-panel border border-gk-header rounded-xl p-8 max-w-md text-center">
          <Check className="w-12 h-12 text-gk-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No Conflicts Found</h2>
          <p className="text-gray-400 mb-4">There are no merge conflicts to resolve.</p>
          <button onClick={onClose} className="px-4 py-2 bg-gk-accent rounded">Close</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="w-[95vw] h-[90vh] bg-gk-bg border border-gk-header rounded-xl shadow-2xl flex flex-col overflow-hidden">
              {/* Header */}
              <div className="h-14 bg-gk-panel border-b border-gk-header flex items-center justify-between px-6">
                  <div className="flex items-center space-x-3">
                      <AlertTriangle className="w-5 h-5 text-gk-yellow" />
                      <div>
                          <span className="font-bold text-white">Merge Conflicts Detected</span>
                          <span className="ml-3 text-sm text-gray-400">
                              {currentFileIndex + 1} of {conflictedFiles.length} files
                          </span>
                          {hasRemainingConflicts && (
                            <span className="ml-2 text-xs text-gk-yellow">
                              ({remainingConflictCount} conflict{remainingConflictCount !== 1 ? 's' : ''} remaining)
                            </span>
                          )}
                          {!hasRemainingConflicts && resolvedContent && (
                            <span className="ml-2 text-xs text-green-400">
                              (all conflicts resolved)
                            </span>
                          )}
                      </div>
                  </div>
                  <div className="flex items-center space-x-4">
                      <div className="text-sm text-gray-400 font-mono truncate max-w-md">
                          {currentFile?.path}
                      </div>
                      <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-white" /></button>
                  </div>
              </div>

              {/* File List Tabs */}
              {conflictedFiles.length > 1 && (
                  <div className="h-10 bg-gk-panel border-b border-gk-header flex items-center px-4 space-x-2 overflow-x-auto">
                      {conflictedFiles.map((file, index) => (
                          <button
                              key={file.path}
                              onClick={() => {
                                  setCurrentFileIndex(index);
                                  setResolvedContent(file.rawContent);
                                  setAiResolution(null);
                              }}
                              className={`px-3 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                                  index === currentFileIndex
                                      ? 'bg-gk-accent text-gk-bg font-bold'
                                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                              }`}
                          >
                              <FileText className="w-3 h-3 inline mr-1" />
                              {file.path.split('/').pop()}
                              {index === currentFileIndex && ' \u2022'}
                          </button>
                      ))}
                  </div>
              )}

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                  {/* Editor View */}
                  <div className="flex-1 flex flex-col border-r border-gk-header">
                      {viewMode === 'conflict' ? (
                          <div className="flex-1 overflow-auto bg-gk-bg/50 p-0">
                              <ConflictFileView
                                content={resolvedContent}
                                onResolveRegion={handleResolveRegion}
                              />
                          </div>
                      ) : (
                          /* Edit Mode with Manual Edit */
                          <div className="flex-1 p-4 overflow-auto">
                              <div className="text-xs font-bold text-gk-purple mb-2 uppercase sticky top-0">
                                  Resolution Editor
                                  <span className="ml-2 text-gray-500 font-normal">Edit the final version below</span>
                              </div>
                              <textarea
                                  value={resolvedContent}
                                  onChange={(e) => setResolvedContent(e.target.value)}
                                  className="w-full h-full bg-black/30 border border-white/10 rounded p-4 font-mono text-sm text-gray-300 resize-none focus:outline-none focus:border-gk-purple"
                                  spellCheck={false}
                              />
                          </div>
                      )}

                  {/* AI Result Panel (when available) */}
                  {aiResolution && (
                      <div className="h-48 border-t border-gk-header bg-gk-panel p-4 overflow-auto">
                          <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-bold text-gk-purple uppercase">AI Resolution</div>
                              <button
                                  onClick={() => setAiResolution(null)}
                                  className="text-xs text-gray-500 hover:text-white"
                              >
                                  Clear
                              </button>
                          </div>
                          <div className="bg-gk-purple/10 border border-gk-purple/30 p-2 rounded mb-2 text-xs text-gray-300">
                              <span className="font-bold text-gk-purple">AI Reasoning:</span> {aiResolution.reason}
                          </div>
                      </div>
                  )}
              </div>
          </div>

              {/* Actions Sidebar */}
              <div className="w-72 bg-gk-panel p-4 flex flex-col space-y-3 overflow-y-auto">
                  {/* AI Resolution */}
                  <button
                      onClick={handleAIResolve}
                      disabled={resolving}
                      className="w-full py-3 bg-gradient-to-r from-gk-purple to-indigo-600 rounded text-white font-bold flex items-center justify-center shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
                  >
                      {resolving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Auto-Resolve with AI
                  </button>

                  <div className="h-[1px] bg-white/10"></div>

                  {/* View Toggle */}
                  <div className="flex space-x-2">
                      <button
                          onClick={() => setViewMode('conflict')}
                          className={`flex-1 py-2 text-xs rounded ${viewMode === 'conflict' ? 'bg-gk-accent text-gk-bg font-bold' : 'bg-white/5 text-gray-400'}`}
                      >
                          Conflict View
                      </button>
                      <button
                          onClick={() => setViewMode('edit')}
                          className={`flex-1 py-2 text-xs rounded ${viewMode === 'edit' ? 'bg-gk-accent text-gk-bg font-bold' : 'bg-white/5 text-gray-400'}`}
                      >
                          Edit Mode
                      </button>
                  </div>

                  <div className="h-[1px] bg-white/10"></div>

                  {/* Quick Actions - resolve all conflicts at once */}
                  <div className="text-xs text-gray-500 uppercase font-bold mb-1">Resolve All Conflicts</div>
                  <button
                      onClick={handleAcceptCurrent}
                      className="w-full py-2 bg-gk-blue/20 border border-gk-blue/30 text-gk-blue rounded text-sm hover:bg-gk-blue/30 transition-colors"
                  >
                      Accept Current (HEAD)
                  </button>
                  <button
                      onClick={handleAcceptBoth}
                      className="w-full py-2 bg-gk-purple/20 border border-gk-purple/30 text-gk-purple rounded text-sm hover:bg-gk-purple/30 transition-colors"
                  >
                      <GitMerge className="w-3.5 h-3.5 inline mr-1" />
                      Accept Both Changes
                  </button>
                  <button
                      onClick={handleAcceptIncoming}
                      className="w-full py-2 bg-gk-accent/20 border border-gk-accent/30 text-gk-accent rounded text-sm hover:bg-gk-accent/30 transition-colors"
                  >
                      Accept Incoming
                  </button>

                  <div className="h-[1px] bg-white/10"></div>

                  {/* Progress */}
                  <div className="text-center text-xs text-gray-500">
                      {currentFileIndex + 1} / {conflictedFiles.length} files
                  </div>

                  {/* Save Actions */}
                  <button
                      onClick={handleSaveCurrent}
                      disabled={saving}
                      className="w-full py-3 bg-gk-accent text-gk-bg font-bold rounded flex items-center justify-center hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                      Save & Next File
                  </button>

                  {conflictedFiles.length > 1 && (
                      <button
                          onClick={handleSaveAll}
                          disabled={saving}
                          className="w-full py-2 bg-white/5 border border-white/10 text-gray-300 rounded text-sm hover:bg-white/10 transition-colors"
                      >
                          Save All (Accept Incoming)
                      </button>
                  )}
              </div>
          </div>
      </div>

      {/* Alert Dialog */}
      <AlertDialog
        isOpen={alert.isOpen}
        onClose={() => setAlert({ ...alert, isOpen: false })}
        title={alert.title}
        type={alert.type}
        onConfirm={() => setAlert({ ...alert, isOpen: false })}
      >
        <p className="text-gray-200">{alert.message}</p>
      </AlertDialog>
    </>
  );
};

export default MergeTool;
