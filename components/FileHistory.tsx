import React, { useState, useEffect } from 'react';
import { X, Loader2, GitCommit, Hash, User, Calendar, Eye } from 'lucide-react';
import { Repository, Commit } from '../types';
import { fetchFileHistory, gitGetFileContent } from '../services/localGitService';
import { getAuthorColor } from '../utils/authorUtils';
import DiffView from './DiffView';

interface FileHistoryProps {
  filepath: string;
  repository: Repository;
  onClose: () => void;
  onNavigateToCommit?: (commitId: string) => void;
}

const FileHistory: React.FC<FileHistoryProps> = ({ filepath, repository, onClose, onNavigateToCommit }) => {
  const [loading, setLoading] = useState(true);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [viewingDiff, setViewingDiff] = useState<Commit | null>(null);
  const [oldContent, setOldContent] = useState('Loading...');
  const [newContent, setNewContent] = useState('Loading...');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const history = await fetchFileHistory(repository, filepath);
        setCommits(history);
      } catch (e) {
        console.error('Failed to load file history:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [repository, filepath]);

  // Load diff when viewing a commit - fetch both contents in parallel
  useEffect(() => {
    if (!viewingDiff) return;
    let cancelled = false;

    const loadDiff = async () => {
      setOldContent('Loading...');
      setNewContent('Loading...');
      try {
        const parentId = viewingDiff.parents[0];
        // Fetch both contents in parallel for better performance
        const [oldC, newC] = await Promise.all([
          parentId ? gitGetFileContent(repository, parentId, filepath) : Promise.resolve(''),
          gitGetFileContent(repository, viewingDiff.id, filepath)
        ]);
        if (!cancelled) {
          setOldContent(oldC);
          setNewContent(newC);
        }
      } catch (e) {
        if (!cancelled) {
          setOldContent('Error loading content');
          setNewContent('Error loading content');
        }
      }
    };
    loadDiff();

    return () => { cancelled = true; };
  }, [viewingDiff, repository, filepath]);

  if (viewingDiff) {
    return (
      <DiffView
        file={{ filename: filepath, status: 'modified', staged: false, additions: 0, deletions: 0 }}
        onClose={() => setViewingDiff(null)}
        oldContent={oldContent}
        newContent={newContent}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-gk-bg flex flex-col animate-fade-in">
      {/* Header */}
      <div className="h-14 bg-gk-panel border-b border-gk-header flex items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-lg text-white">{filepath}</span>
          <span className="px-2 py-0.5 rounded text-xs uppercase font-bold bg-gk-blue/20 text-gk-blue">
            History
          </span>
          {!loading && (
            <span className="text-xs text-gray-500">{commits.length} commit{commits.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button className="p-2 hover:bg-white/10 rounded text-gray-400 hover:text-white" onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="w-8 h-8 text-gk-accent animate-spin" />
              <p className="text-gray-400 text-sm">Loading file history...</p>
            </div>
          </div>
        )}

        {!loading && (
          <div className="max-w-3xl mx-auto py-4">
            {commits.map((commit, idx) => {
              const colorObj = getAuthorColor(commit.author);
              const color = colorObj.bg;
              const isSelected = selectedCommit?.id === commit.id;

              return (
                <div key={commit.id} className="flex">
                  {/* Timeline line */}
                  <div className="w-10 flex flex-col items-center flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full border-2 mt-4 flex-shrink-0`} style={{ borderColor: color as string, backgroundColor: (isSelected ? color : 'transparent') as string }} />
                    {idx < commits.length - 1 && <div className="w-0.5 flex-1 bg-white/10" />}
                  </div>

                  {/* Commit card */}
                  <div
                    className={`flex-1 mb-2 p-3 rounded-lg cursor-pointer transition-colors border ${
                      isSelected ? 'bg-white/10 border-gk-accent/30' : 'bg-white/5 border-transparent hover:bg-white/10'
                    }`}
                    onClick={() => setSelectedCommit(isSelected ? null : commit)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{commit.message}</p>
                        <div className="flex items-center space-x-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center">
                            <User className="w-3 h-3 mr-1" />
                            {commit.author}
                          </span>
                          <span className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {commit.date}
                          </span>
                          <span className="flex items-center font-mono">
                            <Hash className="w-3 h-3 mr-1" />
                            {commit.shortId}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewingDiff(commit); }}
                          className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                          title="View diff"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateToCommit?.(commit.id); }}
                          className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                          title="Navigate to commit in graph"
                        >
                          <GitCommit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {commits.length === 0 && (
              <div className="text-center text-gray-500 py-12">No history found for this file</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(FileHistory);
