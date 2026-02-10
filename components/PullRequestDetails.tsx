import React, { useEffect, useState, useCallback } from 'react';
import { 
    GitPullRequest, CheckCircle, Clock, XCircle, ArrowRight, 
    ExternalLink, GitBranch, MessageSquare, FileText, Download, Loader2 
} from 'lucide-react';
import { PullRequest, Repository, FileChange } from '../types';
import { fetchPullRequestDetails, fetchPullRequestFiles, mergePullRequest } from '../services/githubService';
import ConfirmDialog from './ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAlert } from '../hooks/useAlert';

interface PullRequestDetailsProps {
  pr: PullRequest;
  repo: Repository;
  token?: string;
  onClose: () => void;
  onCheckout: (branch: string) => void;
}

const PullRequestDetails: React.FC<PullRequestDetailsProps> = ({ pr: initialPr, repo, token, onClose, onCheckout }) => {
  const [pr, setPr] = useState<PullRequest>(initialPr);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const { dialogState: confirmState, confirm: triggerConfirm, handleConfirm: onConfirmYes, handleCancel: onConfirmNo } = useConfirmDialog();
  const { showAlert } = useAlert();
  const [merging, setMerging] = useState(false);
  const [activeTab, setActiveTab] = useState<'conversation' | 'files'>('conversation');

  // Fetch PR details
  const refreshPR = useCallback(async (showLoading = true) => {
      if (!token || !repo.owner) return;
      if (showLoading) setLoading(true);
      try {
          const details = await fetchPullRequestDetails(token, repo.owner.login, repo.name, initialPr.number);
          setPr(details);
      } catch (e) {
          console.error('Failed to refresh PR:', e);
      } finally {
          if (showLoading) setLoading(false);
      }
  }, [token, repo, initialPr.number]);

  useEffect(() => {
      refreshPR();
  }, [refreshPR]);

  // Auto-refresh when mergeable is null (computing) or false (has conflicts)
  // This polls GitHub to detect when conflicts are resolved
  useEffect(() => {
      if (!token || !repo.owner || pr.status !== 'open') return;

      // Only poll if mergeable is not yet true (null = computing, false = has conflicts)
      if (pr.mergeable === true) return;

      const interval = setInterval(() => {
          refreshPR(false); // Refresh without showing loading spinner
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
  }, [token, repo, pr.number, pr.status, pr.mergeable, refreshPR]);

  // Fetch files when tab changes to 'files'
  useEffect(() => {
      if (activeTab === 'files' && files.length === 0 && token && repo.owner) {
          setLoadingFiles(true);
          setFilesError(null);
          fetchPullRequestFiles(token, repo.owner.login, repo.name, initialPr.number)
            .then(setFiles)
            .catch(err => {
              console.error('Failed to fetch PR files:', err);
              setFilesError('Failed to load file changes');
            })
            .finally(() => setLoadingFiles(false));
      }
  }, [activeTab, files.length, token, repo, initialPr.number]);

  const StatusBadge = ({ status }: { status: string }) => {
      if (status === 'merged') return <div className="px-2 py-0.5 rounded bg-gk-purple/20 text-gk-purple border border-gk-purple/30 flex items-center text-xs font-bold uppercase"><GitPullRequest className="w-3 h-3 mr-1" /> Merged</div>;
      if (status === 'closed') return <div className="px-2 py-0.5 rounded bg-gk-red/20 text-gk-red border border-gk-red/30 flex items-center text-xs font-bold uppercase"><XCircle className="w-3 h-3 mr-1" /> Closed</div>;
      return <div className="px-2 py-0.5 rounded bg-gk-accent/20 text-gk-accent border border-gk-accent/30 flex items-center text-xs font-bold uppercase"><GitPullRequest className="w-3 h-3 mr-1" /> Open</div>;
  };

  const handleCheckout = () => {
      if (pr.head?.ref) {
          onCheckout(pr.head.ref);
      }
  };

  const handleMerge = async () => {
      if (!token || !repo.owner) return;
      const ok = await triggerConfirm({
          title: 'Merge Pull Request',
          message: `Are you sure you want to merge Pull Request #${pr.number}?`,
          details: `"${pr.title}" will be merged into the base branch.`,
          type: 'info',
          confirmText: 'Merge',
      });
      if (!ok) return;
      
      setMerging(true);
      try {
          await mergePullRequest(token, repo.owner.login, repo.name, pr.number);
          // Refresh PR details
          const updated = await fetchPullRequestDetails(token, repo.owner.login, repo.name, pr.number);
          setPr(updated);
      } catch (e) {
          showAlert('Merge Error', 'Merge failed: ' + e.message, 'error');
      } finally {
          setMerging(false);
      }
  };

  return (
    <>
    <div className="flex-1 bg-gk-bg flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="h-16 bg-gk-panel border-b border-black/20 px-6 flex items-center justify-between flex-shrink-0">
             <div className="flex items-center min-w-0">
                 <div className="mr-4">
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pr.status === 'merged' ? 'bg-gk-purple/20 text-gk-purple' : 'bg-gk-blue/20 text-gk-blue'}`}>
                        <GitPullRequest className="w-5 h-5" />
                     </div>
                 </div>
                 <div>
                     <div className="flex items-center space-x-3 mb-1">
                        <h2 className="text-lg font-bold text-gray-200 truncate leading-tight">
                            {pr.title} <span className="text-gray-500 font-normal">#{pr.number}</span>
                        </h2>
                        <StatusBadge status={pr.status} />
                     </div>
                     <div className="flex items-center text-xs text-gray-500 space-x-2 font-mono">
                         <span className="flex items-center bg-white/5 px-2 py-0.5 rounded text-gray-300">
                             {pr.base?.ref}
                             <ArrowRight className="w-3 h-3 mx-1 text-gray-500" />
                             {pr.head?.ref}
                         </span>
                         <span>opened by <strong>{pr.author}</strong> on {pr.created_at ? new Date(pr.created_at).toLocaleDateString() : '...'}</span>
                     </div>
                 </div>
             </div>
             <div className="flex items-center space-x-3">
                 <button onClick={handleCheckout} className="flex items-center px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded text-xs font-bold text-gray-300 transition-colors">
                     <Download className="w-3.5 h-3.5 mr-2" />
                     Checkout Branch
                 </button>
                 {pr.html_url && (
                    <a href={pr.html_url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white">
                        <ExternalLink className="w-5 h-5" />
                    </a>
                 )}
                 {onClose && (
                     <button onClick={onClose} className="text-sm text-gray-500 hover:text-white border border-white/10 px-3 py-1 rounded">
                         Close
                     </button>
                 )}
             </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex px-6 border-b border-white/5 bg-gk-bg">
            <button 
                onClick={() => setActiveTab('conversation')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center ${activeTab === 'conversation' ? 'border-gk-accent text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                <MessageSquare className="w-4 h-4 mr-2" /> Conversation
            </button>
            <button 
                onClick={() => setActiveTab('files')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center ${activeTab === 'files' ? 'border-gk-accent text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
                <FileText className="w-4 h-4 mr-2" /> Files Changed
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {loading ? (
                <div className="flex justify-center mt-10 text-gray-500">Loading details...</div>
            ) : activeTab === 'conversation' ? (
                <div className="max-w-4xl">
                     <div className="bg-gk-panel border border-white/10 rounded-lg p-4 mb-6">
                         <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                             <div className="text-sm font-bold text-gray-300">Description</div>
                         </div>
                         <div className="prose prose-invert prose-sm max-w-none text-gray-400 whitespace-pre-wrap">
                             {pr.body || <i>No description provided.</i>}
                         </div>
                     </div>

                     <div className="bg-gk-panel border border-white/10 rounded-lg p-6 flex flex-col items-center justify-center text-center">
                         <div className="mb-4">
                            {pr.status === 'open' ? (
                                pr.mergeable === false ? (
                                    // Has conflicts
                                    <>
                                        <XCircle className="w-12 h-12 text-gk-red mx-auto mb-2" />
                                        <h3 className="text-lg font-bold text-gray-200">
                                            This branch has conflicts that must be resolved
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            Conflicts are preventing automatic merge. Resolve conflicts on GitHub or locally.
                                        </p>
                                    </>
                                ) : pr.mergeable === null ? (
                                    // Still computing
                                    <>
                                        <Loader2 className="w-12 h-12 text-gk-yellow mx-auto mb-2 animate-spin" />
                                        <h3 className="text-lg font-bold text-gray-200">
                                            Checking for conflicts...
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            GitHub is computing merge status.
                                        </p>
                                    </>
                                ) : (
                                    // No conflicts
                                    <>
                                        <CheckCircle className="w-12 h-12 text-gk-accent mx-auto mb-2" />
                                        <h3 className="text-lg font-bold text-gray-200">
                                            This branch has no conflicts with the base branch
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            Merging can be performed automatically.
                                        </p>
                                    </>
                                )
                            ) : (
                                <>
                                    <GitPullRequest className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                                    <h3 className="text-lg font-bold text-gray-200">
                                        Pull request {pr.status}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        This pull request is {pr.status}.
                                    </p>
                                </>
                            )}
                         </div>
                         {pr.status === 'open' && pr.mergeable !== false && (
                             <button
                                onClick={handleMerge}
                                disabled={merging || pr.mergeable === null}
                                className={`px-6 py-2 font-bold rounded shadow-lg transition-all flex items-center ${
                                    merging || pr.mergeable === null
                                        ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                                        : 'bg-gk-accent text-gk-bg hover:brightness-110'
                                }`}
                             >
                                 {merging && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                 {merging ? 'Merging...' : pr.mergeable === null ? 'Checking...' : 'Merge Pull Request'}
                             </button>
                         )}
                         {pr.status === 'open' && pr.mergeable === false && (
                             <a
                                href={pr.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 font-bold rounded shadow-lg transition-all flex items-center bg-gk-blue text-white hover:brightness-110"
                             >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                View on GitHub to Resolve
                             </a>
                         )}
                     </div>
                </div>
            ) : (
                <div className="max-w-4xl">
                    {loadingFiles ? (
                         <div className="flex justify-center mt-10 text-gray-500 items-center">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading file changes...
                         </div>
                    ) : filesError ? (
                         <div className="text-center mt-10 text-gk-red text-sm">{filesError}</div>
                    ) : (
                        <div className="space-y-1">
                            {files.length === 0 && <div className="text-gray-500 italic">No files changed.</div>}
                            {files.map((file) => (
                                <div key={file.filename} className="flex items-center p-3 bg-gk-panel border border-white/5 rounded">
                                    <div className={`w-8 h-8 flex items-center justify-center rounded font-bold text-xs mr-3 
                                        ${file.status === 'added' ? 'bg-gk-accent/10 text-gk-accent' : 
                                          file.status === 'deleted' ? 'bg-gk-red/10 text-gk-red' : 
                                          'bg-gk-yellow/10 text-gk-yellow'}`}
                                    >
                                        {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-200 font-mono truncate">{file.filename}</div>
                                    </div>
                                    <div className="flex items-center space-x-3 text-xs font-mono">
                                        <span className="text-gk-accent">+{file.additions}</span>
                                        <span className="text-gk-red">-{file.deletions}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
    <ConfirmDialog
      isOpen={confirmState.isOpen}
      onClose={onConfirmNo}
      onConfirm={onConfirmYes}
      title={confirmState.title}
      message={confirmState.message}
      details={confirmState.details}
      type={confirmState.type}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
    />
    </>
  );
};

export default PullRequestDetails;
