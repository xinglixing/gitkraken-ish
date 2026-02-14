import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Commit, AIConfig, Repository, FileChange, Profile, GitOperationError } from '../types';
import { X, FileText, Hash, User, Calendar, Sparkles, Wand2, ArrowUpCircle, Archive, PlusCircle, MinusCircle, Eye, Copy, Check, Clock, ChevronDown, Trash2, Search, Send, Users, Filter, FilePlus, ToggleLeft, ToggleRight, Loader2, CheckCircle, FolderOpen, Pencil, Minimize2, Maximize2 } from 'lucide-react';
import { explainCommit, generateCommitMessage, generateStashMessage, reviewChanges, improveCommitMessage } from '../services/aiService';
import { fetchCommitDetails } from '../services/githubService';
import { fetchLocalCommitDetails, fetchWorkingDir, gitStage, gitUnstage, gitStageAll, gitUnstageAll, gitCommit, gitStash, gitStashFile, gitGetFileContent, gitGetWorkingFileContent, gitStageHunk, gitStageLine, gitDiscardFile, gitCommitAndPush, gitCommitWithOptions, gitListAllFiles, gitCreateFile, listSubmodules } from '../services/localGitService';
import DiffView from './DiffView';
import AlertDialog from './AlertDialog';
import ConfirmDialog from './ConfirmDialog';
import CommitTemplatePanel from './CommitTemplatePanel';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

// Constants
const MAX_DISPLAYED_FILES = 100;
const MAX_COMMAND_HISTORY = 100;

interface CoAuthor {
  name: string;
  email: string;
}

interface CommitPanelProps {
  commit: Commit | null;
  onClose: () => void;
  aiConfig: AIConfig;
  githubToken: string;
  repository: Repository;
  refreshGraph: () => void;
  activeProfile: Profile | null;
  onBlame?: (filepath: string) => void;
  onFileHistory?: (filepath: string) => void;
  onEditFile?: (filepath: string) => void;
  recentMessages?: string[];
  isCommitSectionMinimized?: boolean;
  onToggleCommitSectionMinimize?: () => void;
}

const CommitPanel: React.FC<CommitPanelProps> = ({ commit, onClose, aiConfig, githubToken, repository, refreshGraph, activeProfile, onBlame, onFileHistory, onEditFile, recentMessages = [], isCommitSectionMinimized = false, onToggleCommitSectionMinimize }) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [suggestedMessage, setSuggestedMessage] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [fullCommit, setFullCommit] = useState<Commit | null>(commit);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [isHeadCommit, setIsHeadCommit] = useState(false);

  // WIP State
  const [wipFiles, setWipFiles] = useState<FileChange[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [viewingDiff, setViewingDiff] = useState<FileChange | null>(null);
  const [oldFileContent, setOldFileContent] = useState<string>('Loading...');
  const [newFileContent, setNewFileContent] = useState<string>('Loading...');
  const [loadingFileContent, setLoadingFileContent] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  // New state for enhanced features
  const [fileFilter, setFileFilter] = useState('');
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [allRepoFiles, setAllRepoFiles] = useState<string[]>([]);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);
  const [showCoAuthorInput, setShowCoAuthorInput] = useState(false);
  const [newCoAuthorName, setNewCoAuthorName] = useState('');
  const [newCoAuthorEmail, setNewCoAuthorEmail] = useState('');
  const [skipHooks, setSkipHooks] = useState(false);
  const [isCommitAndPush, setIsCommitAndPush] = useState(false);
  const [showCreateFileModal, setShowCreateFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [operatingFiles, setOperatingFiles] = useState<Set<string>>(new Set()); // Track files being staged/unstaged
  const [isCommitting, setIsCommitting] = useState(false); // Track commit operation
  const [submodulePaths, setSubmodulePaths] = useState<Set<string>>(new Set()); // Track submodule paths

  // AI Code Review state
  const [codeReview, setCodeReview] = useState<{
    summary: string;
    issues: { file: string; line?: number; severity: 'warning' | 'error' | 'info'; message: string }[];
    score: number;
  } | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  const [alert, setAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    details?: string;
    type: 'success' | 'error' | 'info';
  }>({ isOpen: false, title: '', message: '', type: 'info' });
  const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();

  // Load submodule paths when repository changes
  useEffect(() => {
      if (repository?.isLocal) {
          listSubmodules(repository)
              .then(submodules => {
                  setSubmodulePaths(new Set(submodules.map(s => s.path.replace(/\\/g, '/'))));
              })
              .catch(() => setSubmodulePaths(new Set()));
      } else {
          setSubmodulePaths(new Set());
      }
  }, [repository]);

  // Helper function to check if a path is a submodule directory
  const isSubmodulePath = (filepath: string): boolean => {
      const normalizedPath = filepath.replace(/\\/g, '/');
      return submodulePaths.has(normalizedPath);
  };

  // Load WIP files if no commit selected
  useEffect(() => {
      if (!commit && repository.isLocal) {
          let cancelled = false;
          fetchWorkingDir(repository)
              .then(files => { if (!cancelled) setWipFiles(files); })
              .catch(err => {
                  if (cancelled) return;
                  console.error('Failed to load working directory:', err);
                  setAlert({ isOpen: true, title: 'Load Failed', message: 'Failed to load working directory files.', type: 'error' });
              });
          return () => { cancelled = true; };
      }
  }, [commit, repository]);

  // Load all repo files when toggle is enabled
  useEffect(() => {
      if (showAllFiles && repository.isLocal) {
          let cancelled = false;
          gitListAllFiles(repository)
              .then(files => { if (!cancelled) setAllRepoFiles(files); })
              .catch(err => {
                  if (!cancelled) console.error('Failed to load all files:', err);
              });
          return () => { cancelled = true; };
      }
  }, [showAllFiles, repository]);

  // Filter files based on search
  const filteredWipFiles = useMemo(() => {
      if (!fileFilter) return wipFiles;
      const lower = fileFilter.toLowerCase();
      return wipFiles.filter(f => f.filename.toLowerCase().includes(lower));
  }, [wipFiles, fileFilter]);

  const filteredAllFiles = useMemo(() => {
      if (!fileFilter) return allRepoFiles;
      const lower = fileFilter.toLowerCase();
      return allRepoFiles.filter(f => f.toLowerCase().includes(lower));
  }, [allRepoFiles, fileFilter]);

  React.useEffect(() => {
    setFullCommit(commit);
    setExplanation(null);
    setSuggestedMessage(null);
    setDetailsError(null);

    // Check if commit is HEAD
    const checkIfHead = async () => {
      if (commit && repository.isLocal) {
        try {
          const { gitResolveRef } = await import('../services/localGitService');
          const headOid = await gitResolveRef(repository, 'HEAD');
          setIsHeadCommit(commit.id === headOid);
        } catch (e) {
          setIsHeadCommit(false);
        }
      } else {
        setIsHeadCommit(false);
      }
    };
    checkIfHead();

    if (commit && !commit.isHead && (!commit.changes || commit.changes.length === 0)) {
        setLoadingDetails(true);
        const fetchPromise = repository.isLocal
            ? fetchLocalCommitDetails(repository, commit)
            : fetchCommitDetails(githubToken, repository.owner?.login || '', repository.name, commit.id);

        fetchPromise
            .then(details => setFullCommit(prev => prev?.id === details.id ? { ...prev, ...details } : prev))
            .catch(err => {
              console.error('Failed to load commit details:', err);
              setDetailsError('Failed to load commit details.');
            })
            .finally(() => setLoadingDetails(false));
    }
  }, [commit, githubToken, repository]);

  const handleStage = async (file: FileChange) => {
      if (!repository.isLocal || operatingFiles.has(file.filename)) return;
      setOperatingFiles(prev => new Set(prev).add(file.filename));
      try {
          await gitStage(repository, file.filename);
          setWipFiles(await fetchWorkingDir(repository));
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Stage Failed', message: error.message || `Failed to stage ${file.filename}`, type: 'error' });
      } finally {
          setOperatingFiles(prev => { const next = new Set(prev); next.delete(file.filename); return next; });
      }
  };

  const handleUnstage = async (file: FileChange) => {
      if (!repository.isLocal || operatingFiles.has(file.filename)) return;
      setOperatingFiles(prev => new Set(prev).add(file.filename));
      try {
          await gitUnstage(repository, file.filename);
          setWipFiles(await fetchWorkingDir(repository));
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Unstage Failed', message: error.message || `Failed to unstage ${file.filename}`, type: 'error' });
      } finally {
          setOperatingFiles(prev => { const next = new Set(prev); next.delete(file.filename); return next; });
      }
  };

  const handleStageAll = async () => {
      if (!repository.isLocal) return;
      try {
          await gitStageAll(repository);
          setWipFiles(await fetchWorkingDir(repository));
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Stage All Failed', message: error.message || 'Failed to stage all files.', type: 'error' });
      }
  };

  const handleUnstageAll = async () => {
      if (!repository.isLocal) return;
      try {
          await gitUnstageAll(repository);
          setWipFiles(await fetchWorkingDir(repository));
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Unstage All Failed', message: error.message || 'Failed to unstage all files.', type: 'error' });
      }
  };

  const handleDiscardFile = async (file: FileChange) => {
      if (!repository.isLocal) return;
      const confirmed = await confirm({
          title: 'Discard Changes',
          message: `Discard changes to "${file.filename}"?`,
          details: 'This cannot be undone. Any uncommitted modifications to this file will be permanently lost.',
          type: 'danger',
          confirmText: 'Discard',
      });
      if (!confirmed) return;
      try {
          await gitDiscardFile(repository, file.filename);
          setWipFiles(await fetchWorkingDir(repository));
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Discard Failed', message: error.message || `Failed to discard ${file.filename}`, type: 'error' });
      }
  };

  const handleStashFile = async (file: FileChange) => {
      if (!repository.isLocal) return;
      try {
          await gitStashFile(repository, file.filename);
          setWipFiles(await fetchWorkingDir(repository));
          refreshGraph();
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Stash Failed', message: error.message || `Failed to stash ${file.filename}`, type: 'error' });
      }
  };

  const handleCommit = async (pushAfter: boolean = false) => {
      if (!commitMsg) {
        setAlert({
          isOpen: true,
          title: 'Commit Message Required',
          message: 'Please enter a commit message before committing.',
          type: 'error'
        });
        return;
      }

      // Confirm before push if setting is enabled
      if (pushAfter && aiConfig.confirmBeforePush) {
        const stagedCount = wipFiles.filter(f => f.staged).length;
        const confirmed = await confirm({
          title: 'Confirm Commit & Push',
          message: `Commit ${stagedCount} file${stagedCount !== 1 ? 's' : ''} and push to remote?`,
          type: 'info',
          confirmText: 'Commit & Push',
        });
        if (!confirmed) return;
      }

      const author = {
          name: activeProfile?.gitName || activeProfile?.name || "User",
          email: activeProfile?.gitEmail || "user@local"
      };

      setIsCommitting(true);
      try {
          if (pushAfter) {
              // Use combined commit and push
              await gitCommitAndPush(repository, commitMsg, author, githubToken, {
                  noVerify: skipHooks,
                  coAuthors: coAuthors.length > 0 ? coAuthors : undefined
              });
              setAlert({
                isOpen: true,
                title: 'Commit & Push Successful',
                message: 'Changes committed and pushed to remote.',
                type: 'success'
              });
          } else {
              // Use gitCommitWithOptions if we have coAuthors or skipHooks
              if (coAuthors.length > 0 || skipHooks) {
                  await gitCommitWithOptions(repository, commitMsg, author, {
                      noVerify: skipHooks,
                      coAuthors: coAuthors.length > 0 ? coAuthors : undefined
                  });
              } else {
                  await gitCommit(repository, commitMsg, author);
              }
          }
          setCommitMsg('');
          setCoAuthors([]);
          refreshGraph();
          onClose();
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({
            isOpen: true,
            title: pushAfter ? 'Commit & Push Failed' : 'Commit Failed',
            message: error.message || 'Failed to create commit. Check that you have staged changes.',
            type: 'error'
          });
      } finally {
          setIsCommitting(false);
          setIsCommitAndPush(false);
      }
  };

  const handleAddCoAuthor = () => {
      if (newCoAuthorName && newCoAuthorEmail) {
          setCoAuthors([...coAuthors, { name: newCoAuthorName, email: newCoAuthorEmail }]);
          setNewCoAuthorName('');
          setNewCoAuthorEmail('');
          setShowCoAuthorInput(false);
      }
  };

  const handleRemoveCoAuthor = (index: number) => {
      setCoAuthors(coAuthors.filter((_, i) => i !== index));
  };

  const handleCreateFile = async () => {
      if (!newFilePath.trim()) {
          setAlert({ isOpen: true, title: 'Error', message: 'Please enter a file path.', type: 'error' });
          return;
      }
      try {
          await gitCreateFile(repository, newFilePath.trim());
          setNewFilePath('');
          setShowCreateFileModal(false);
          setWipFiles(await fetchWorkingDir(repository));
          setAlert({ isOpen: true, title: 'File Created', message: `Created ${newFilePath}`, type: 'success' });
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({ isOpen: true, title: 'Create Failed', message: error.message || 'Failed to create file', type: 'error' });
      }
  };

  const handleStash = async () => {
      try {
          const msg = await generateStashMessage(wipFiles.map(f => f.filename), aiConfig);
          await gitStash(repository, msg);
          setWipFiles(await fetchWorkingDir(repository));
          refreshGraph();
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({
            isOpen: true,
            title: 'Stash Failed',
            message: error.message || 'Failed to stash changes.',
            type: 'error'
          });
      }
  };

  const handleGenerateWipMessage = async () => {
      const staged = wipFiles.filter(f => f.staged);
      if (staged.length === 0) {
          setAlert({
            isOpen: true,
            title: 'No Staged Files',
            message: 'Please stage files first to generate a commit message.',
            details: 'Click the + button next to each file in the "Unstaged Files" section to stage them.',
            type: 'info'
          });
          return;
      }
      setLoadingAI(true);
      try {
          const mockC = { changes: staged };
          const msg = await generateCommitMessage(mockC, aiConfig);
          setCommitMsg(msg);
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({
            isOpen: true,
            title: 'AI Generation Failed',
            message: error.message || 'Failed to generate commit message. Check your AI configuration.',
            type: 'error'
          });
      } finally {
          setLoadingAI(false);
      }
  }

  const handleReviewChanges = async () => {
      const staged = wipFiles.filter(f => f.staged);
      if (staged.length === 0) {
          setAlert({
            isOpen: true,
            title: 'No Staged Files',
            message: 'Please stage files first to review changes.',
            details: 'Click the + button next to each file in the "Unstaged Files" section to stage them.',
            type: 'info'
          });
          return;
      }
      setLoadingReview(true);
      setCodeReview(null);
      try {
          const result = await reviewChanges(staged, aiConfig);
          setCodeReview(result);
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({
            isOpen: true,
            title: 'AI Review Failed',
            message: error.message || 'Failed to review changes. Check your AI configuration.',
            type: 'error'
          });
      } finally {
          setLoadingReview(false);
      }
  };

  const handleImproveMessage = async () => {
      if (!commitMsg.trim()) {
          setAlert({
            isOpen: true,
            title: 'No Message',
            message: 'Please enter a commit message first to improve it.',
            type: 'info'
          });
          return;
      }
      const staged = wipFiles.filter(f => f.staged);
      setLoadingAI(true);
      try {
          const improved = await improveCommitMessage(commitMsg, staged, aiConfig);
          setCommitMsg(improved);
      } catch (e) {
          const error = e as GitOperationError;
          setAlert({
            isOpen: true,
            title: 'AI Improvement Failed',
            message: error.message || 'Failed to improve commit message.',
            type: 'error'
          });
      } finally {
          setLoadingAI(false);
      }
  };

  // Fetch file content when viewingDiff changes (with cancellation to prevent race conditions)
  const fetchIdRef = useRef(0);
  useEffect(() => {
    const fetchId = ++fetchIdRef.current;

    const fetchFileContent = async () => {
      if (!viewingDiff) {
        setOldFileContent('Loading...');
        setNewFileContent('Loading...');
        return;
      }

      setLoadingFileContent(true);
      setOldFileContent('Loading...');
      setNewFileContent('Loading...');

      try {
        let oldResult = '';
        let newResult = '';

        // For WIP (uncommitted changes)
        if (!fullCommit) {
          oldResult = viewingDiff.status === 'added' ? '' : await gitGetFileContent(repository, 'HEAD', viewingDiff.filename) || '';
          newResult = viewingDiff.status === 'deleted' ? '' : await gitGetWorkingFileContent(repository, viewingDiff.filename) || '';
        }
        // For committed changes
        else if (fullCommit && fullCommit.parents && fullCommit.parents.length > 0) {
          const parentCommit = fullCommit.parents[0];
          oldResult = await gitGetFileContent(repository, parentCommit, viewingDiff.filename) || '';
          if (fetchId !== fetchIdRef.current) return; // Cancelled — newer request in flight
          newResult = await gitGetFileContent(repository, fullCommit.id, viewingDiff.filename) || '';
        }
        // For root commit (no parent) or added files
        else {
          oldResult = '';
          if (viewingDiff.patch) {
            newResult = viewingDiff.patch?.replace(/\[NEW CONTENT START\]\n?/, '').replace(/\n?\[NEW CONTENT END\]/, '') || '';
          } else if (fullCommit) {
            newResult = await gitGetFileContent(repository, fullCommit.id, viewingDiff.filename) || '';
          }
        }

        // Only apply results if this is still the latest request
        if (fetchId !== fetchIdRef.current) return;
        setOldFileContent(oldResult);
        setNewFileContent(newResult);
      } catch (error) {
        if (fetchId !== fetchIdRef.current) return;
        console.error('Error fetching file content:', error);
        setOldFileContent('Error loading file content');
        setNewFileContent('Error loading file content');
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoadingFileContent(false);
        }
      }
    };

    fetchFileContent();
  }, [viewingDiff, fullCommit, repository]);

  // Hunk staging handlers
  const handleStageHunk = async (hunkIndex: number) => {
    if (!viewingDiff || !repository?.isLocal) return;
    try {
      await gitStageHunk(repository, viewingDiff.filename, oldFileContent, newFileContent, hunkIndex);
      refreshGraph();
    } catch (e) {
      console.error('Stage hunk failed:', e);
    }
  };

  const handleStageLine = async (hunkIndex: number, lineIndex: number) => {
    if (!viewingDiff || !repository?.isLocal) return;
    try {
      await gitStageLine(repository, viewingDiff.filename, oldFileContent, newFileContent, hunkIndex, lineIndex);
      refreshGraph();
    } catch (e) {
      console.error('Stage line failed:', e);
    }
  };

  // Render Diff View Overlay
  if (viewingDiff) {
      const isWipView = !fullCommit; // WIP mode = no commit selected
      return <DiffView
        file={viewingDiff}
        onClose={() => setViewingDiff(null)}
        oldContent={oldFileContent}
        newContent={newFileContent}
        enableHunkStaging={isWipView && repository?.isLocal}
        onStageHunk={isWipView ? handleStageHunk : undefined}
        onStageLine={isWipView ? handleStageLine : undefined}
        isStaged={viewingDiff.staged}
      />;
  }

  // --- WIP / Staging Panel ---
  if (!fullCommit) {
    const stagedFiles = filteredWipFiles.filter(f => f.staged);
    const unstagedFiles = filteredWipFiles.filter(f => !f.staged);

    return (
       <div className="w-96 bg-gk-panel border-l border-gk-header flex flex-col h-full flex-shrink-0 animate-slide-in-right">
          <div className="h-12 bg-gk-header flex items-center justify-between px-4 border-b border-black/20">
            <span className="font-bold text-white">Uncommitted Changes</span>
            <div className="flex items-center space-x-2">
                <button onClick={() => setShowCreateFileModal(true)} className="text-gray-500 hover:text-gk-accent" title="Create New File">
                    <FilePlus className="w-4 h-4" />
                </button>
                <button onClick={handleStash} className="text-gray-500 hover:text-gk-yellow" title="Stash Changes">
                    <Archive className="w-4 h-4" />
                </button>
                <button onClick={onClose}><X className="w-4 h-4 text-gray-500" /></button>
            </div>
          </div>

          {/* File Filter & All Files Toggle */}
          <div className="p-2 border-b border-white/5 bg-black/10">
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2 top-2 w-3 h-3 text-gray-500" />
                <input
                  type="text"
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full bg-gk-bg border border-white/10 rounded pl-7 pr-2 py-1.5 text-xs text-white placeholder-gray-500 focus:border-gk-blue outline-none"
                />
              </div>
              <button
                onClick={() => setShowAllFiles(!showAllFiles)}
                className={`flex items-center text-[10px] px-2 py-1.5 rounded ${showAllFiles ? 'bg-gk-blue text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                title="Show all repository files"
              >
                <Filter className="w-3 h-3 mr-1" />
                All
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
             {/* All Files View */}
             {showAllFiles && (
               <div className="p-2 border-b border-white/5">
                 <div className="text-xs font-bold text-gk-blue uppercase mb-2 px-2">All Repository Files ({filteredAllFiles.length})</div>
                 <div className="max-h-48 overflow-y-auto">
                   {filteredAllFiles.slice(0, MAX_DISPLAYED_FILES).map(f => (
                     <div key={f} className="flex items-center p-1.5 hover:bg-white/5 rounded text-xs text-gray-400">
                       <FileText className="w-3 h-3 mr-2 opacity-50" />
                       <span className="truncate">{f}</span>
                     </div>
                   ))}
                   {filteredAllFiles.length > MAX_DISPLAYED_FILES && (
                     <div className="text-xs text-gray-500 px-2 italic">+ {filteredAllFiles.length - MAX_DISPLAYED_FILES} more files...</div>
                   )}
                 </div>
               </div>
             )}

             {/* Staged */}
             <div className="p-2 bg-black/20 border-b border-white/5">
                 <div className="text-xs font-bold text-gk-accent uppercase mb-2 px-2 flex justify-between items-center">
                     <span>Staged Files ({stagedFiles.length})</span>
                     {stagedFiles.length > 0 && (
                         <button
                             onClick={handleUnstageAll}
                             className="text-[10px] text-gray-400 hover:text-white underline"
                         >
                             Unstage All
                         </button>
                     )}
                 </div>
                 {stagedFiles.map(f => (
                     <div key={f.filename} className="flex items-center p-2 hover:bg-white/5 rounded group text-sm cursor-pointer" onClick={() => setViewingDiff(f)}>
                         <button
                           onClick={(e) => { e.stopPropagation(); handleUnstage(f); }}
                           disabled={operatingFiles.has(f.filename)}
                           className="mr-2 text-gk-red hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                           title="Unstage file"
                           aria-label={`Unstage ${f.filename}`}
                         >
                           {operatingFiles.has(f.filename) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MinusCircle className="w-3.5 h-3.5" />}
                         </button>
                         <span className="flex-1 truncate text-gray-300">{f.filename}</span>
                         <span className="text-[10px] text-gray-500 uppercase">{f.status}</span>
                     </div>
                 ))}
                 {stagedFiles.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-4 text-gray-600">
                    <PlusCircle className="w-6 h-6 mb-2 opacity-40" />
                    <p className="text-xs">No staged files</p>
                    <p className="text-[10px] text-gray-700">Click + on files below to stage</p>
                  </div>
                )}
             </div>

             {/* Unstaged */}
             <div className="p-2">
                 <div className="text-xs font-bold text-gk-yellow uppercase mb-2 px-2 flex justify-between items-center">
                     <span>Unstaged Files ({unstagedFiles.length})</span>
                     {unstagedFiles.length > 0 && (
                         <button
                             onClick={handleStageAll}
                             className="text-[10px] text-gray-400 hover:text-white underline"
                         >
                             Stage All
                         </button>
                     )}
                 </div>
                 {unstagedFiles.map(f => (
                     <div key={f.filename} className="flex items-center p-2 hover:bg-white/5 rounded group text-sm">
                         <button
                           onClick={() => handleStage(f)}
                           disabled={operatingFiles.has(f.filename)}
                           className="mr-2 text-gk-accent hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                           title="Stage file"
                           aria-label={`Stage ${f.filename}`}
                         >
                           {operatingFiles.has(f.filename) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                         </button>
                         <span className="flex-1 truncate text-gray-300">{f.filename}</span>
                         <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           {onEditFile && !isSubmodulePath(f.filename) && <button onClick={() => onEditFile(f.filename)} className="text-gray-500 hover:text-gk-accent" title="Edit file"><Pencil className="w-3 h-3" /></button>}
                           {onBlame && !isSubmodulePath(f.filename) && <button onClick={() => onBlame(f.filename)} className="text-gray-500 hover:text-gk-purple" title="View blame annotations"><Eye className="w-3 h-3" /></button>}
                           {onFileHistory && !isSubmodulePath(f.filename) && <button onClick={() => onFileHistory(f.filename)} className="text-gray-500 hover:text-gk-blue" title="View file history"><Clock className="w-3 h-3" /></button>}
                           {!isSubmodulePath(f.filename) && <button onClick={() => setViewingDiff(f)} className="text-gray-500 hover:text-white" title="View changes"><Eye className="w-3.5 h-3.5" /></button>}
                           {!isSubmodulePath(f.filename) && <button onClick={() => handleStashFile(f)} className="text-gray-500 hover:text-gk-accent" title="Stash this file"><Archive className="w-3 h-3" /></button>}
                           <button onClick={() => handleDiscardFile(f)} className="text-gray-500 hover:text-red-400" title="Discard changes (cannot be undone)"><Trash2 className="w-3 h-3" /></button>
                         </div>
                     </div>
                 ))}
                 {unstagedFiles.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-4 text-gray-600">
                    <CheckCircle className="w-6 h-6 mb-2 opacity-40 text-gk-green" />
                    <p className="text-xs">Working directory clean</p>
                    <p className="text-[10px] text-gray-700">No unstaged changes</p>
                  </div>
                )}
             </div>
          </div>

          {/* Commit Area - Only show when there are staged files */}
          {stagedFiles.length > 0 && (
          <div className="p-4 border-t border-white/10 bg-gk-panel">
             <div className="bg-white/5 p-4 rounded-lg border border-white/5">
                 <div className="flex items-center justify-between mb-2">
                   <h3 className="text-xs font-bold text-gray-500 uppercase">Commit Message</h3>
                   <div className="flex items-center space-x-1">
                     {commitMsg.trim() && (
                       <button
                         onClick={handleImproveMessage}
                         disabled={loadingAI}
                         className="text-[10px] text-gk-purple hover:text-white flex items-center px-1.5 py-0.5 rounded hover:bg-white/10 disabled:opacity-50"
                         title="Improve message with AI"
                       >
                         <Wand2 className="w-3 h-3 mr-1" />
                         Improve
                       </button>
                     )}
                     <button
                       onClick={() => setShowTemplatePanel(!showTemplatePanel)}
                       className="text-[10px] text-gray-400 hover:text-white flex items-center px-1.5 py-0.5 rounded hover:bg-white/10"
                     >
                       <ChevronDown className="w-3 h-3 mr-1" />
                       Template
                     </button>
                     <button
                       onClick={onToggleCommitSectionMinimize}
                       className="text-[10px] text-gray-400 hover:text-white flex items-center px-1.5 py-0.5 rounded hover:bg-white/10"
                       title={isCommitSectionMinimized ? "Expand commit section" : "Minimize commit section"}
                     >
                       {isCommitSectionMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                     </button>
                   </div>
                 </div>
                 {!isCommitSectionMinimized && (
                 <>
                 {showTemplatePanel && (
                   <div className="mb-2">
                     <CommitTemplatePanel
                       onApplyTemplate={(msg) => { setCommitMsg(msg); setShowTemplatePanel(false); }}
                       recentMessages={recentMessages}
                     />
                   </div>
                 )}
                 <textarea
                    className="w-full bg-gk-bg border border-white/10 rounded p-2 text-sm text-white h-24 mb-2 focus:border-gk-blue outline-none"
                    placeholder="Summary of changes..."
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    aria-label="Commit message"
                    aria-required="true"
                 />

                 {/* Co-Authors Section */}
                 <div className="mb-2">
                   <div className="flex items-center justify-between mb-1">
                     <span className="text-[10px] text-gray-500 uppercase font-bold">Co-Authors</span>
                     <button
                       onClick={() => setShowCoAuthorInput(!showCoAuthorInput)}
                       className="text-[10px] text-gray-400 hover:text-white flex items-center"
                     >
                       <Users className="w-3 h-3 mr-1" />
                       Add
                     </button>
                   </div>
                   {coAuthors.length > 0 && (
                     <div className="space-y-1 mb-2">
                       {coAuthors.map((ca, i) => (
                         <div key={i} className="flex items-center text-xs bg-gk-bg/50 rounded px-2 py-1">
                           <span className="flex-1 text-gray-300">{ca.name} &lt;{ca.email}&gt;</span>
                           <button onClick={() => handleRemoveCoAuthor(i)} className="text-gray-500 hover:text-gk-red ml-2">
                             <X className="w-3 h-3" />
                           </button>
                         </div>
                       ))}
                     </div>
                   )}
                   {showCoAuthorInput && (
                     <div className="space-y-1 mb-2 p-2 bg-gk-bg/30 rounded">
                       <input
                         type="text"
                         value={newCoAuthorName}
                         onChange={(e) => setNewCoAuthorName(e.target.value)}
                         placeholder="Name"
                         className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:border-gk-blue outline-none"
                       />
                       <input
                         type="email"
                         value={newCoAuthorEmail}
                         onChange={(e) => setNewCoAuthorEmail(e.target.value)}
                         placeholder="email@example.com"
                         className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:border-gk-blue outline-none"
                       />
                       <button
                         onClick={handleAddCoAuthor}
                         disabled={!newCoAuthorName || !newCoAuthorEmail}
                         className="w-full py-1 bg-gk-blue text-white text-xs rounded disabled:opacity-50"
                       >
                         Add Co-Author
                       </button>
                     </div>
                   )}
                 </div>

                 {/* Skip Hooks Option */}
                 <div className="flex items-center justify-between mb-2 text-xs">
                   <span className="text-gray-400">Skip pre-commit hooks</span>
                   <button
                     onClick={() => setSkipHooks(!skipHooks)}
                     className={`p-1 rounded ${skipHooks ? 'text-gk-yellow' : 'text-gray-500'}`}
                   >
                     {skipHooks ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                   </button>
                 </div>

                 <div className="flex space-x-2 mb-2">
                  <button
                    onClick={handleGenerateWipMessage}
                    disabled={loadingAI || loadingReview}
                    className="flex-1 py-2 bg-gradient-to-r from-gk-purple to-indigo-600 rounded text-white text-xs font-bold flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {loadingAI ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    Generate Message
                  </button>
                  <button
                    onClick={handleReviewChanges}
                    disabled={loadingReview || loadingAI}
                    className="py-2 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 rounded text-white text-xs font-bold flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                    title="AI Code Review"
                  >
                    {loadingReview ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>

                {/* AI Code Review Results */}
                {codeReview && (
                  <div className="mb-3 bg-cyan-900/20 border border-cyan-600/30 rounded p-3 text-xs animate-fade-in">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-cyan-400 font-bold uppercase flex items-center">
                        <Eye className="w-3 h-3 mr-1" /> Code Review
                      </h4>
                      <div className="flex items-center space-x-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          codeReview.score >= 8 ? 'bg-gk-green/20 text-gk-green' :
                          codeReview.score >= 5 ? 'bg-gk-yellow/20 text-gk-yellow' :
                          'bg-gk-red/20 text-gk-red'
                        }`}>
                          {codeReview.score}/10
                        </span>
                        <button
                          onClick={() => setCodeReview(null)}
                          className="text-gray-500 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {codeReview.summary && (
                      <p className="text-gray-300 mb-2">{codeReview.summary}</p>
                    )}

                    {codeReview.issues.length > 0 && (
                      <div className="space-y-1.5">
                        {codeReview.issues.map((issue, i) => (
                          <div key={i} className={`pl-2 border-l-2 ${
                            issue.severity === 'error' ? 'border-gk-red/70' :
                            issue.severity === 'warning' ? 'border-gk-yellow/70' :
                            'border-gk-blue/70'
                          }`}>
                            <div className="flex items-center space-x-1">
                              <span className={`text-[10px] font-bold uppercase ${
                                issue.severity === 'error' ? 'text-gk-red' :
                                issue.severity === 'warning' ? 'text-gk-yellow' :
                                'text-gk-blue'
                              }`}>
                                {issue.severity}
                              </span>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-400 font-mono">{issue.file}</span>
                              {issue.line && <span className="text-gray-600">:{issue.line}</span>}
                            </div>
                            <p className="text-gray-300 mt-0.5">{issue.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {codeReview.issues.length === 0 && (
                      <div className="flex items-center text-gk-green">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        <span>No issues found! Code looks good.</span>
                      </div>
                    )}
                  </div>
                )}

                 {/* Commit Buttons */}
                 <div className="flex space-x-2">
                   <button
                      onClick={() => handleCommit(false)}
                      disabled={stagedFiles.length === 0 || isCommitting}
                      className={`flex-1 py-3 font-bold rounded shadow-lg transition-all flex items-center justify-center ${stagedFiles.length > 0 && !isCommitting ? 'bg-gk-accent text-gk-bg hover:brightness-110' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                   >
                       {isCommitting && !isCommitAndPush ? (
                         <>
                           <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                           Committing...
                         </>
                       ) : (
                         <>
                           <ArrowUpCircle className="w-4 h-4 mr-1" />
                           Commit
                         </>
                       )}
                   </button>
                   <button
                      onClick={() => { setIsCommitAndPush(true); handleCommit(true); }}
                      disabled={stagedFiles.length === 0 || isCommitting}
                      className={`py-3 px-4 font-bold rounded shadow-lg transition-all flex items-center justify-center ${stagedFiles.length > 0 && !isCommitting ? 'bg-gk-blue text-white hover:brightness-110' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                      title="Commit & Push"
                   >
                       {isCommitting && isCommitAndPush ? (
                         <Loader2 className="w-4 h-4 animate-spin" />
                       ) : (
                         <Send className="w-4 h-4" />
                       )}
                   </button>
                 </div>
                 </>
                 )}
                 {/* Show message when minimized */}
                 {isCommitSectionMinimized && commitMsg.trim() && (
                   <div className="mt-2 p-2 bg-gk-bg/50 rounded text-xs text-gray-400 truncate">
                     <span className="text-gray-500">Message:</span> {commitMsg}
                   </div>
                 )}
             </div>
          </div>
          )}

          {/* Create File Modal */}
          {showCreateFileModal && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-gk-panel border border-gk-header rounded-lg p-4 w-80">
                <h3 className="text-white font-bold mb-3">Create New File</h3>
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="path/to/file.js"
                  className="w-full bg-gk-bg border border-white/10 rounded p-2 text-sm text-white placeholder-gray-500 focus:border-gk-blue outline-none mb-3"
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => { setShowCreateFileModal(false); setNewFilePath(''); }}
                    className="flex-1 py-2 bg-gray-600 text-white rounded text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFile}
                    className="flex-1 py-2 bg-gk-accent text-gk-bg rounded text-sm font-bold"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
          <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
       </div>
    );
  }

  // --- Existing View Commit Details ---
  const handleExplain = async () => {
    setLoadingAI(true);
    setExplanation(null);
    setSuggestedMessage(null);
    const result = await explainCommit(fullCommit, aiConfig);
    setExplanation(result);
    setLoadingAI(false);
  };

  const handleSuggestMessage = async () => {
    setLoadingAI(true);
    setExplanation(null);
    setSuggestedMessage(null);
    setCopiedToClipboard(false);
    const result = await generateCommitMessage(fullCommit, aiConfig);
    setSuggestedMessage(result);
    setLoadingAI(false);
  };

  const handleCopySuggestedMessage = () => {
    if (suggestedMessage) {
      navigator.clipboard.writeText(suggestedMessage);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    }
  };

  const handleApplySuggestedMessage = async () => {
    if (!suggestedMessage || !fullCommit || !repository.isLocal) {
      setAlert({
        isOpen: true,
        title: 'Cannot Apply',
        message: 'Can only amend commits in local repositories.',
        type: 'error'
      });
      return;
    }

    try {
      // Check if this is the HEAD commit (most recent)
      const { gitResolveRef } = await import('../services/localGitService');
      const headOid = await gitResolveRef(repository, 'HEAD');

      if (fullCommit.id !== headOid) {
        setAlert({
          isOpen: true,
          title: 'Cannot Amend',
          message: 'Can only amend the most recent commit (HEAD). This commit is in history.',
          type: 'error'
        });
        return;
      }

      // Amend the commit with new message
      const { gitAmend } = await import('../services/localGitService');
      const author = {
        name: activeProfile?.gitName || activeProfile?.name || 'User',
        email: activeProfile?.gitEmail || 'user@local'
      };

      await gitAmend(repository, suggestedMessage, author);
      refreshGraph();

      // Update the full commit message locally
      setFullCommit(prev => prev ? { ...prev, message: suggestedMessage } : null);

      setAlert({
        isOpen: true,
        title: 'Commit Amended',
        message: 'Successfully updated the commit message with the AI suggestion.',
        type: 'success'
      });
    } catch (e) {
      const error = e as GitOperationError;
      setAlert({
        isOpen: true,
        title: 'Amend Failed',
        message: error.message || 'Failed to amend commit.',
        type: 'error'
      });
    }
  };


  return (
    <div className="w-96 bg-gk-panel border-l border-gk-header flex flex-col h-full flex-shrink-0 animate-slide-in-right">
      <div className="h-12 bg-gk-header flex items-center justify-between px-4 border-b border-black/20 flex-shrink-0">
        <span className="font-bold text-gray-300">Commit Details</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-2 leading-tight">{fullCommit.message}</h2>
            <div className="space-y-2 text-sm text-gray-400 mt-3">
                <div className="flex items-center">
                    <Hash className="w-3.5 h-3.5 mr-2 opacity-70" />
                    <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-gk-blue">{fullCommit.shortId}</span>
                </div>
                <div className="flex items-center">
                    <User className="w-3.5 h-3.5 mr-2 opacity-70" />
                    <span>{fullCommit.author}</span>
                </div>
                <div className="flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-2 opacity-70" />
                    <span>{fullCommit.date}</span>
                </div>
            </div>
        </div>

        <div className={`${repository.isLocal && isHeadCommit ? 'grid grid-cols-2 gap-2' : ''} mb-6`}>
            <button
                onClick={handleExplain}
                disabled={loadingAI}
                className="flex flex-col items-center justify-center p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded transition-all disabled:opacity-50"
            >
                <Sparkles className="w-5 h-5 text-gk-purple mb-1" />
                <span className="text-xs font-medium text-gray-300">Explain</span>
            </button>
            {repository.isLocal && isHeadCommit && (
                <button
                    onClick={handleSuggestMessage}
                    disabled={loadingAI}
                    className="flex flex-col items-center justify-center p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded transition-all disabled:opacity-50"
                >
                    <Wand2 className="w-5 h-5 text-gk-accent mb-1" />
                    <span className="text-xs font-medium text-gray-300">Pro Message</span>
                </button>
            )}
        </div>

        {loadingAI && (
            <div className="mb-6 flex items-center justify-center text-xs text-gray-500">
                <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                Thinking with {aiConfig.provider}...
            </div>
        )}

        {explanation && (
            <div className="mb-6 bg-gk-purple/10 border border-gk-purple/30 rounded p-3 text-sm text-gray-200 leading-relaxed animate-fade-in">
                <h4 className="text-gk-purple font-bold text-xs uppercase mb-2 flex items-center">
                    <Sparkles className="w-3 h-3 mr-1" /> Explanation
                </h4>
                <div className="whitespace-pre-wrap">{explanation}</div>
            </div>
        )}

        {suggestedMessage && (
            <div className="mb-6 bg-gk-accent/10 border border-gk-accent/30 rounded p-3 text-sm text-gray-200 leading-relaxed animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-gk-accent font-bold text-xs uppercase flex items-center">
                        <Wand2 className="w-3 h-3 mr-1" /> Professional Rewrite
                    </h4>
                    <div className="flex items-center space-x-2">
                        {repository.isLocal && isHeadCommit ? (
                            <button
                                onClick={handleApplySuggestedMessage}
                                className="text-xs flex items-center space-x-1 px-2 py-1 bg-gk-accent hover:bg-gk-accent/80 text-gk-bg rounded transition-colors font-bold"
                                title="Apply this message to the commit"
                            >
                                <ArrowUpCircle className="w-3 h-3" />
                                <span>Apply to HEAD</span>
                            </button>
                        ) : (
                            <div
                                className="text-xs flex items-center space-x-1 px-2 py-1 bg-gray-700 text-gray-500 rounded cursor-not-allowed"
                                title={!repository.isLocal ? "Apply only works for local repos" : "Apply only works for HEAD (most recent) commit"}
                            >
                                <ArrowUpCircle className="w-3 h-3" />
                                <span>{!repository.isLocal ? "Remote repo" : "Not HEAD"}</span>
                            </div>
                        )}
                        <button
                            onClick={handleCopySuggestedMessage}
                            className="text-xs flex items-center space-x-1 text-gk-accent hover:text-white transition-colors"
                        >
                            {copiedToClipboard ? (
                                <>
                                    <Check className="w-3 h-3" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className="font-mono text-xs bg-black/30 p-2 rounded whitespace-pre-wrap">{suggestedMessage}</div>
                <p className="text-xs text-gray-500 mt-2">
                    💡 <strong className="text-gk-accent">Apply</strong> works for HEAD only. <strong className="text-gk-accent">Copy</strong> works for any commit.
                    {!isHeadCommit && repository.isLocal && " ⚠️ This is not the most recent commit, so Apply is disabled."}
                </p>
            </div>
        )}

        <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Files Changed</h3>
                {loadingDetails && <span className="text-xs text-gray-600 animate-pulse">Loading files...</span>}
            </div>
            
            <div className="space-y-1">
                {fullCommit.changes?.map((file) => (
                    <div
                        key={file.filename}
                        className="flex items-center text-sm p-2 rounded hover:bg-white/5 cursor-pointer group"
                        onClick={() => setViewingDiff(file)}
                    >
                        <FileIcon status={file.status} />
                        <span className="flex-1 truncate text-gray-300 ml-2" title={file.filename}>{file.filename}</span>
                        <div className="flex items-center space-x-2 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                            {file.additions > 0 && <span className="text-gk-accent">+{file.additions}</span>}
                            {file.deletions > 0 && <span className="text-gk-red">-{file.deletions}</span>}
                        </div>
                    </div>
                ))}
                {detailsError && (
                     <div className="text-gk-red text-sm bg-gk-red/10 p-2 rounded">{detailsError}</div>
                )}
                {(!fullCommit.changes || fullCommit.changes.length === 0) && !loadingDetails && !detailsError && (
                     <div className="text-gray-600 text-sm italic">
                        {fullCommit.detailsUnavailable
                            ? "Commit details temporarily unavailable (shallow clone or during rebase)"
                            : "No file changes available."}
                     </div>
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
      >
        <div className="space-y-2">
          <p className="text-gray-200">{alert.message}</p>
          {alert.details && <p className="text-gray-400 text-sm">{alert.details}</p>}
        </div>
      </AlertDialog>
      <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
    </div>
  );
};

const FileIcon = ({ status }: { status: string }) => {
    switch (status) {
        case 'added': return <div className="w-4 h-4 flex items-center justify-center text-gk-accent font-bold" title="Added">A</div>;
        case 'deleted': return <div className="w-4 h-4 flex items-center justify-center text-gk-red font-bold" title="Deleted">D</div>;
        case 'modified': return <div className="w-4 h-4 flex items-center justify-center text-gk-yellow font-bold" title="Modified">M</div>;
        default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
}

export default React.memo(CommitPanel);