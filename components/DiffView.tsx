import React, { useState, useMemo, useCallback, useRef } from 'react';
import { X, Columns, AlignJustify, Check, Square, CheckSquare, Loader2 } from 'lucide-react';
import { FileChange } from '../types';
import * as Diff from 'diff';

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  header: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
  intraChanges?: { from: number; to: number }[];
}

interface DiffViewProps {
  file: FileChange;
  onClose: () => void;
  oldContent?: string;
  newContent?: string;
  // Hunk staging support
  enableHunkStaging?: boolean;
  onStageHunk?: (hunkIndex: number) => void;
  onUnstageHunk?: (hunkIndex: number) => void;
  onStageLine?: (hunkIndex: number, lineIndex: number) => void;
  onUnstageLine?: (hunkIndex: number, lineIndex: number) => void;
  isStaged?: boolean;
}

/**
 * Compute character-level differences within a single line.
 * Used to highlight exactly which characters changed (yellow highlighting).
 * Returns mark ranges for both old and new strings indicating changed regions.
 */
function computeIntraLineChanges(oldStr: string, newStr: string): { oldMarks: { from: number; to: number }[]; newMarks: { from: number; to: number }[] } {
  const charDiff = Diff.diffChars(oldStr, newStr);
  const oldMarks: { from: number; to: number }[] = [];
  const newMarks: { from: number; to: number }[] = [];
  let oldPos = 0;
  let newPos = 0;

  for (const part of charDiff) {
    if (part.removed) {
      oldMarks.push({ from: oldPos, to: oldPos + (part.value?.length || 0) });
      oldPos += part.value?.length || 0;
    } else if (part.added) {
      newMarks.push({ from: newPos, to: newPos + (part.value?.length || 0) });
      newPos += part.value?.length || 0;
    } else {
      oldPos += part.value?.length || 0;
      newPos += part.value?.length || 0;
    }
  }

  return { oldMarks, newMarks };
}

function buildHunks(oldText: string, newText: string): DiffHunk[] {
  const changes = Diff.structuredPatch('old', 'new', oldText, newText, '', '', { context: 3 });
  const hunks: DiffHunk[] = [];

  for (const h of changes.hunks) {
    const lines: DiffLine[] = [];
    let oldLineNo = h.oldStart;
    let newLineNo = h.newStart;

    for (const rawLine of h.lines) {
      const content = rawLine.slice(1);
      if (rawLine.startsWith('+')) {
        lines.push({ type: 'add', content, oldLineNo: null, newLineNo: newLineNo++ });
      } else if (rawLine.startsWith('-')) {
        lines.push({ type: 'remove', content, oldLineNo: oldLineNo++, newLineNo: null });
      } else {
        lines.push({ type: 'context', content, oldLineNo: oldLineNo++, newLineNo: newLineNo++ });
      }
    }

    // Compute intra-line changes for adjacent remove/add pairs
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].type === 'remove' && lines[i + 1].type === 'add') {
        const { oldMarks, newMarks } = computeIntraLineChanges(lines[i].content, lines[i + 1].content);
        lines[i].intraChanges = oldMarks;
        lines[i + 1].intraChanges = newMarks;
      }
    }

    hunks.push({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines,
      header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`
    });
  }

  return hunks;
}

function renderHighlightedContent(content: string, marks?: { from: number; to: number }[], highlightClass = 'bg-yellow-500/40') {
  if (!marks || marks.length === 0) return <span>{content || ' '}</span>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const mark of marks) {
    if (mark.from > lastEnd) {
      parts.push(<span key={`t-${lastEnd}`}>{content.slice(lastEnd, mark.from)}</span>);
    }
    parts.push(
      <span key={`h-${mark.from}`} className={highlightClass}>
        {content.slice(mark.from, mark.to)}
      </span>
    );
    lastEnd = mark.to;
  }

  if (lastEnd < content.length) {
    parts.push(<span key={`t-${lastEnd}`}>{content.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}

const DiffView: React.FC<DiffViewProps> = ({
  file, onClose, oldContent = '', newContent = '',
  enableHunkStaging, onStageHunk, onUnstageHunk, onStageLine, onUnstageLine, isStaged
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(new Set());
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set()); // "hunkIdx-lineIdx"
  const isLoading = oldContent === 'Loading...' || newContent === 'Loading...';

  // Split-view scroll sync
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);
  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    const src = source === 'left' ? leftPanelRef.current : rightPanelRef.current;
    const dst = source === 'left' ? rightPanelRef.current : leftPanelRef.current;
    if (src && dst) {
      dst.scrollTop = src.scrollTop;
    }
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  const hunks = useMemo(() => {
    if (isLoading) return [];
    return buildHunks(oldContent, newContent);
  }, [oldContent, newContent, isLoading]);

  const stats = useMemo(() => {
    let additions = 0, deletions = 0;
    for (const h of hunks) {
      for (const l of h.lines) {
        if (l.type === 'add') additions++;
        if (l.type === 'remove') deletions++;
      }
    }
    return { additions, deletions };
  }, [hunks]);

  const toggleHunk = useCallback((hunkIdx: number) => {
    setSelectedHunks(prev => {
      const next = new Set(prev);
      if (next.has(hunkIdx)) next.delete(hunkIdx);
      else next.add(hunkIdx);
      return next;
    });
  }, []);

  const toggleLine = useCallback((hunkIdx: number, lineIdx: number) => {
    const key = `${hunkIdx}-${lineIdx}`;
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleStageSelected = useCallback(() => {
    if (selectedHunks.size > 0 && onStageHunk) {
      selectedHunks.forEach(idx => onStageHunk(idx));
    }
    if (selectedLines.size > 0 && onStageLine) {
      selectedLines.forEach(key => {
        const [h, l] = key.split('-').map(Number);
        onStageLine(h, l);
      });
    }
    setSelectedHunks(new Set());
    setSelectedLines(new Set());
  }, [selectedHunks, selectedLines, onStageHunk, onStageLine]);

  const handleUnstageSelected = useCallback(() => {
    if (selectedHunks.size > 0 && onUnstageHunk) {
      selectedHunks.forEach(idx => onUnstageHunk(idx));
    }
    if (selectedLines.size > 0 && onUnstageLine) {
      selectedLines.forEach(key => {
        const [h, l] = key.split('-').map(Number);
        onUnstageLine(h, l);
      });
    }
    setSelectedHunks(new Set());
    setSelectedLines(new Set());
  }, [selectedHunks, selectedLines, onUnstageHunk, onUnstageLine]);

  const lineClasses = {
    add: 'bg-green-900/30',
    remove: 'bg-red-900/30',
    context: '',
  };

  const gutterClasses = {
    add: 'text-green-400',
    remove: 'text-red-400',
    context: 'text-gray-500',
  };

  const gutterSymbol = {
    add: '+',
    remove: '-',
    context: ' ',
  };

  // Render unified view
  const renderUnified = () => (
    <div className="p-0 font-mono text-xs">
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          {/* Hunk header */}
          <div className="flex items-center bg-blue-900/20 border-y border-blue-500/20 text-blue-400 px-2 py-1 sticky top-0 z-10">
            {enableHunkStaging && (
              <button
                className="mr-2 text-gray-400 hover:text-white"
                onClick={() => toggleHunk(hunkIdx)}
                title={selectedHunks.has(hunkIdx) ? 'Deselect hunk' : 'Select hunk'}
              >
                {selectedHunks.has(hunkIdx)
                  ? <CheckSquare className="w-3.5 h-3.5 text-gk-accent" />
                  : <Square className="w-3.5 h-3.5" />
                }
              </button>
            )}
            <span className="font-bold">{hunk.header}</span>
          </div>

          {/* Lines */}
          {hunk.lines.map((line, lineIdx) => {
            const lineKey = `${hunkIdx}-${lineIdx}`;
            const isLineSelected = selectedLines.has(lineKey);

            return (
              <div key={lineIdx} className={`flex hover:bg-white/5 ${lineClasses[line.type]} ${isLineSelected ? 'ring-1 ring-gk-accent/50' : ''}`}>
                {enableHunkStaging && line.type !== 'context' && (
                  <button
                    className="w-5 flex items-center justify-center flex-shrink-0 hover:bg-white/10"
                    onClick={() => toggleLine(hunkIdx, lineIdx)}
                    title={isLineSelected ? 'Deselect line' : 'Select line'}
                  >
                    {isLineSelected
                      ? <CheckSquare className="w-2.5 h-2.5 text-gk-accent" />
                      : <Square className="w-2.5 h-2.5 text-gray-600" />
                    }
                  </button>
                )}
                {enableHunkStaging && line.type === 'context' && <div className="w-5 flex-shrink-0" />}
                <div className={`w-12 text-right pr-1 select-none flex-shrink-0 border-r border-white/5 ${gutterClasses[line.type]}`}>
                  {line.oldLineNo ?? ''}
                </div>
                <div className={`w-12 text-right pr-1 select-none flex-shrink-0 border-r border-white/5 ${gutterClasses[line.type]}`}>
                  {line.newLineNo ?? ''}
                </div>
                <div className={`w-5 text-center select-none flex-shrink-0 font-bold ${gutterClasses[line.type]}`}>
                  {gutterSymbol[line.type]}
                </div>
                <div className={`flex-1 px-2 whitespace-pre-wrap break-words ${line.type === 'add' ? 'text-green-300' : line.type === 'remove' ? 'text-red-300' : 'text-gray-300'}`}>
                  {renderHighlightedContent(
                    line.content,
                    line.intraChanges,
                    line.type === 'add' ? 'bg-green-500/40 rounded-sm' : 'bg-red-500/40 rounded-sm'
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {hunks.length === 0 && !isLoading && (
        <div className="text-center text-gray-500 py-12">No changes detected</div>
      )}
    </div>
  );

  /**
   * Build paired rows for split diff view.
   *
   * Algorithm:
   * 1. Context lines appear on both sides (left and right)
   * 2. Consecutive 'remove' lines are collected, then consecutive 'add' lines that follow
   * 3. Removes and adds are paired together side-by-side
   * 4. If more removes than adds (or vice versa), null fills the shorter side
   * 5. Standalone adds (not following removes) get null on left side
   *
   * This ensures old content (left) and new content (right) align properly,
   * rather than showing all removes first then all adds (which creates visual gaps).
   */
  const buildSplitRows = (lines: DiffLine[]): { left: DiffLine | null; right: DiffLine | null }[] => {
    const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.type === 'context') {
        // Context lines appear on both sides
        rows.push({ left: line, right: line });
        i++;
      } else if (line.type === 'remove') {
        // Collect consecutive removes
        const removes: DiffLine[] = [];
        while (i < lines.length && lines[i].type === 'remove') {
          removes.push(lines[i]);
          i++;
        }
        // Collect consecutive adds that follow
        const adds: DiffLine[] = [];
        while (i < lines.length && lines[i].type === 'add') {
          adds.push(lines[i]);
          i++;
        }
        // Pair them up
        const maxLen = Math.max(removes.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          rows.push({
            left: j < removes.length ? removes[j] : null,
            right: j < adds.length ? adds[j] : null
          });
        }
      } else if (line.type === 'add') {
        // Standalone adds (no preceding removes)
        rows.push({ left: null, right: line });
        i++;
      }
    }

    return rows;
  };

  // Render split view
  const renderSplit = () => (
    <div className="flex text-xs font-mono">
      {/* Left (Old) */}
      <div className="flex-1 border-r border-gk-header overflow-y-auto" ref={leftPanelRef} onScroll={() => syncScroll('left')}>
        <div className="sticky top-0 bg-gk-panel border-b border-gk-header px-4 py-1 text-gray-500 font-bold uppercase text-[10px]">
          Previous
        </div>
        {hunks.map((hunk, hunkIdx) => {
          const splitRows = buildSplitRows(hunk.lines);
          return (
            <div key={hunkIdx}>
              <div className="flex items-center bg-blue-900/20 border-y border-blue-500/20 text-blue-400 px-2 py-1">
                {enableHunkStaging && (
                  <button
                    className="mr-2 text-gray-400 hover:text-white"
                    onClick={() => toggleHunk(hunkIdx)}
                  >
                    {selectedHunks.has(hunkIdx)
                      ? <CheckSquare className="w-3.5 h-3.5 text-gk-accent" />
                      : <Square className="w-3.5 h-3.5" />
                    }
                  </button>
                )}
                <span className="text-[10px]">{hunk.header}</span>
              </div>
              {splitRows.map((row, rowIdx) => {
                const line = row.left;
                if (!line) {
                  // Empty placeholder for add-only row
                  return (
                    <div key={rowIdx} className="flex bg-green-900/10" style={{ minHeight: 20 }}>
                      <div className="w-10 text-right pr-2 text-gray-700 border-r border-white/5 select-none flex-shrink-0" />
                      <div className="w-5 flex-shrink-0" />
                      <div className="flex-1 px-2" />
                    </div>
                  );
                }
                return (
                  <div key={rowIdx} className={`flex hover:bg-white/5 ${line.type === 'remove' ? 'bg-red-900/30' : ''}`}>
                    <div className={`w-10 text-right pr-2 border-r border-white/5 select-none flex-shrink-0 ${gutterClasses[line.type]}`}>
                      {line.oldLineNo}
                    </div>
                    <div className={`w-5 text-center select-none flex-shrink-0 font-bold ${gutterClasses[line.type]}`}>
                      {line.type === 'remove' ? '-' : ' '}
                    </div>
                    <div className={`flex-1 px-2 whitespace-pre-wrap break-words ${line.type === 'remove' ? 'text-red-300' : 'text-gray-300'}`}>
                      {renderHighlightedContent(line.content, line.intraChanges, 'bg-red-500/40 rounded-sm')}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Right (New) */}
      <div className="flex-1 overflow-y-auto" ref={rightPanelRef} onScroll={() => syncScroll('right')}>
        <div className="sticky top-0 bg-gk-panel border-b border-gk-header px-4 py-1 text-gray-500 font-bold uppercase text-[10px]">
          Current
        </div>
        {hunks.map((hunk, hunkIdx) => {
          const splitRows = buildSplitRows(hunk.lines);
          return (
            <div key={hunkIdx}>
              <div className="bg-blue-900/20 border-y border-blue-500/20 text-blue-400 px-2 py-1">
                <span className="text-[10px]">{hunk.header}</span>
              </div>
              {splitRows.map((row, rowIdx) => {
                const line = row.right;
                if (!line) {
                  // Empty placeholder for remove-only row
                  return (
                    <div key={rowIdx} className="flex bg-red-900/10" style={{ minHeight: 20 }}>
                      <div className="w-10 text-right pr-2 text-gray-700 border-r border-white/5 select-none flex-shrink-0" />
                      <div className="w-5 flex-shrink-0" />
                      <div className="flex-1 px-2" />
                    </div>
                  );
                }
                return (
                  <div key={rowIdx} className={`flex hover:bg-white/5 ${line.type === 'add' ? 'bg-green-900/30' : ''}`}>
                    <div className={`w-10 text-right pr-2 border-r border-white/5 select-none flex-shrink-0 ${gutterClasses[line.type]}`}>
                      {line.newLineNo}
                    </div>
                    <div className={`w-5 text-center select-none flex-shrink-0 font-bold ${gutterClasses[line.type]}`}>
                      {line.type === 'add' ? '+' : ' '}
                    </div>
                    <div className={`flex-1 px-2 whitespace-pre-wrap break-words ${line.type === 'add' ? 'text-green-300' : 'text-gray-300'}`}>
                      {renderHighlightedContent(line.content, line.intraChanges, 'bg-green-500/40 rounded-sm')}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-gk-bg flex flex-col animate-fade-in">
      {/* Header */}
      <div className="h-14 bg-gk-panel border-b border-gk-header flex items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-lg text-white">{file.filename}</span>
          <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold ${
            file.status === 'added' ? 'bg-gk-accent/20 text-gk-accent' :
            file.status === 'deleted' ? 'bg-gk-red/20 text-gk-red' :
            'bg-gk-yellow/20 text-gk-yellow'
          }`}>
            {file.status}
          </span>
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-green-400 font-mono">+{stats.additions}</span>
            <span className="text-red-400 font-mono">-{stats.deletions}</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* View mode toggle */}
          <div className="flex bg-black/30 rounded overflow-hidden border border-white/10">
            <button
              className={`px-3 py-1.5 text-xs flex items-center space-x-1 transition-colors ${viewMode === 'split' ? 'bg-gk-accent/20 text-gk-accent' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setViewMode('split')}
              title="Split view"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split</span>
            </button>
            <button
              className={`px-3 py-1.5 text-xs flex items-center space-x-1 transition-colors ${viewMode === 'unified' ? 'bg-gk-accent/20 text-gk-accent' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setViewMode('unified')}
              title="Unified view"
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span>Unified</span>
            </button>
          </div>

          {/* Stage/Unstage selected button */}
          {enableHunkStaging && (selectedHunks.size > 0 || selectedLines.size > 0) && (
            <div className="flex space-x-1 ml-2">
              {!isStaged && (
                <button
                  onClick={handleStageSelected}
                  className="px-3 py-1.5 bg-gk-accent/20 text-gk-accent text-xs rounded hover:bg-gk-accent/30 transition-colors flex items-center space-x-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Stage Selected</span>
                </button>
              )}
              {isStaged && (
                <button
                  onClick={handleUnstageSelected}
                  className="px-3 py-1.5 bg-gk-red/20 text-gk-red text-xs rounded hover:bg-gk-red/30 transition-colors flex items-center space-x-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Unstage Selected</span>
                </button>
              )}
            </div>
          )}

          <button className="p-2 hover:bg-white/10 rounded text-gray-400 hover:text-white" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Diff Container */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gk-bg/80 z-10">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="w-8 h-8 text-gk-accent animate-spin" />
              <p className="text-gray-400 text-sm">Loading file content...</p>
            </div>
          </div>
        )}
        {viewMode === 'unified' ? renderUnified() : renderSplit()}
      </div>
    </div>
  );
};

export default React.memo(DiffView);
