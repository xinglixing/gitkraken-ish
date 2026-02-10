import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2, GitCommit } from 'lucide-react';
import { Repository, Commit } from '../types';
import { gitBlame } from '../services/localGitService';
import { getAuthorColor, getAuthorInitials } from '../utils/authorUtils';

interface BlameViewProps {
  filepath: string;
  repository: Repository;
  onClose: () => void;
  onNavigateToCommit?: (commitId: string) => void;
  commitRef?: string;
}

const BlameView: React.FC<BlameViewProps> = ({ filepath, repository, onClose, onNavigateToCommit, commitRef = 'HEAD' }) => {
  const [loading, setLoading] = useState(true);
  const [blameData, setBlameData] = useState<{
    lines: { content: string; commitId: string; author: string; date: string; message: string }[];
  }>({ lines: [] });
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null);

  useEffect(() => {
    const loadBlame = async () => {
      setLoading(true);
      try {
        const data = await gitBlame(repository, filepath, commitRef);
        setBlameData(data);
      } catch (e) {
        console.error('Failed to load blame:', e);
      } finally {
        setLoading(false);
      }
    };
    loadBlame();
  }, [repository, filepath, commitRef]);

  // Precompute which lines start a new commit block (pure, no mutation in render)
  const newBlockFlags = useMemo(() => {
    let prev = '';
    return blameData.lines.map(line => {
      const isNew = line.commitId !== prev;
      prev = line.commitId;
      return isNew;
    });
  }, [blameData.lines]);

  // Event delegation handlers for hover - more efficient than per-line handlers
  const handleMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-commit-id]');
    if (target) {
      const commitId = target.getAttribute('data-commit-id');
      if (commitId) setHoveredCommit(commitId);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCommit(null);
  }, []);

  // Handler for commit navigation
  const handleCommitClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-commit-id]');
    if (target && onNavigateToCommit) {
      const commitId = target.getAttribute('data-commit-id');
      if (commitId) onNavigateToCommit(commitId);
    }
  }, [onNavigateToCommit]);

  return (
    <div className="fixed inset-0 z-[60] bg-gk-bg flex flex-col animate-fade-in">
      {/* Header */}
      <div className="h-14 bg-gk-panel border-b border-gk-header flex items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-lg text-white">{filepath}</span>
          <span className="px-2 py-0.5 rounded text-xs uppercase font-bold bg-gk-purple/20 text-gk-purple">
            Blame
          </span>
        </div>
        <button className="p-2 hover:bg-white/10 rounded text-gray-400 hover:text-white" onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content - using event delegation for better performance */}
      <div
        className="flex-1 overflow-auto font-mono text-xs"
        onMouseOver={handleMouseOver}
        onMouseLeave={handleMouseLeave}
        onClick={handleCommitClick}
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="w-8 h-8 text-gk-accent animate-spin" />
              <p className="text-gray-400 text-sm">Loading blame data...</p>
            </div>
          </div>
        )}

        {!loading && blameData.lines.map((line, idx) => {
          const isNewBlock = newBlockFlags[idx];
          const colorObj = getAuthorColor(line.author);
          const color = colorObj.bg;
          const isHovered = hoveredCommit === line.commitId;

          return (
            <div
              key={`${line.commitId}-${idx}`}
              data-commit-id={line.commitId}
              className={`flex hover:bg-white/5 ${isHovered ? 'bg-white/5' : ''} ${isNewBlock ? 'border-t border-white/5' : ''}`}
            >
              {/* Blame annotation gutter */}
              <div
                className={`w-[280px] flex-shrink-0 flex items-center px-2 border-r border-white/10 cursor-pointer hover:bg-white/10 transition-colors ${isNewBlock ? 'py-0.5' : ''}`}
                title={`${line.message}\n\nClick to navigate to commit`}
              >
                {isNewBlock ? (
                  <>
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white mr-2 flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {getAuthorInitials(line.author)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-gray-300 text-[10px]">{line.author}</div>
                      <div className="truncate text-gray-500 text-[9px]">{line.message}</div>
                    </div>
                    <div className="text-gray-600 text-[9px] ml-2 flex-shrink-0">{line.date}</div>
                    <div className="text-gray-700 font-mono text-[9px] ml-2 flex-shrink-0">{line.commitId.substring(0, 7)}</div>
                  </>
                ) : (
                  <div className="w-full" />
                )}
              </div>

              {/* Line number */}
              <div className="w-12 text-right pr-2 text-gray-600 border-r border-white/5 select-none flex-shrink-0">
                {idx + 1}
              </div>

              {/* Content */}
              <div className="flex-1 px-3 text-gray-300 whitespace-pre-wrap break-words">
                {line.content || ' '}
              </div>
            </div>
          );
        })}

        {!loading && blameData.lines.length === 0 && (
          <div className="text-center text-gray-500 py-12">No blame data available</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(BlameView);
