import React, { useState } from 'react';
import { X, Sparkles, GitPullRequest, Loader2, ExternalLink } from 'lucide-react';
import { AIConfig, Repository, GitOperationError } from '../types';
import { generatePRDescription } from '../services/aiService';
import { createPullRequest } from '../services/githubService';
import { gitCompareBranches } from '../services/localGitService';

interface CreatePRModalProps {
  repo: Repository;
  currentBranch: string;
  baseBranch?: string;
  token?: string;
  config: AIConfig;
  onClose: () => void;
  onCreated?: () => void;
}

const CreatePRModal: React.FC<CreatePRModalProps> = ({ repo, currentBranch, baseBranch = 'main', token, config, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const handleCreate = async () => {
      if (!title.trim()) {
          setError('Title is required.');
          return;
      }
      if (!token || !repo.owner) {
          setError('GitHub token and repository owner are required.');
          return;
      }
      setCreating(true);
      setError(null);
      try {
          const result = await createPullRequest(token, repo.owner.login, repo.name, title.trim(), desc.trim(), currentBranch, baseBranch);
          setCreatedUrl(result.html_url);
          onCreated?.();
      } catch (e) {
          const error = e as GitOperationError;
          setError(error.message || 'Failed to create pull request.');
      } finally {
          setCreating(false);
      }
  };

  const handleGenerate = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get commits that are ahead on the current branch compared to base branch
        const comparison = await gitCompareBranches(repo, currentBranch, baseBranch);
        const branchCommits = comparison.ahead;
        const result = await generatePRDescription(currentBranch, branchCommits, config);
        setTitle(result.title);
        setDesc(result.body);
      } catch (e) {
        const error = e as GitOperationError;
        setError(error.message || 'Failed to generate PR description.');
      } finally {
        setLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[600px] bg-gk-panel border border-gk-header shadow-2xl rounded-lg flex flex-col max-h-[90vh]">
        <div className="h-14 flex items-center justify-between px-6 border-b border-black/20">
          <div className="flex items-center text-gray-200">
             <GitPullRequest className="w-5 h-5 mr-2 text-gk-blue" />
             <span className="font-bold">Create Pull Request</span>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-white" /></button>
        </div>

        <div className="p-6 space-y-4">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Source Branch</label>
                <div className="p-2 bg-white/5 rounded border border-white/10 text-sm font-mono text-gk-accent">{currentBranch}</div>
            </div>

            <div>
                 <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase">Title</label>
                    <button 
                        onClick={handleGenerate}
                        disabled={loading}
                        className="text-xs text-gk-purple hover:text-white flex items-center"
                    >
                        <Sparkles className="w-3 h-3 mr-1" /> Auto-Generate
                    </button>
                 </div>
                 <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-gk-blue focus:outline-none"
                    placeholder="Brief summary..."
                 />
            </div>

            <div>
                 <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                 <textarea 
                    value={desc} 
                    onChange={e => setDesc(e.target.value)}
                    className="w-full h-40 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-gk-blue focus:outline-none resize-none"
                    placeholder="Describe your changes..."
                 />
            </div>
            
            {loading && (
                <div className="flex items-center justify-center text-xs text-gk-purple animate-pulse">
                    <Sparkles className="w-4 h-4 mr-2" /> Generating content from branch history...
                </div>
            )}
        </div>

        <div className="p-4 border-t border-black/20">
            {error && (
                <div className="mb-3 p-2 bg-gk-red/10 border border-gk-red/30 rounded text-sm text-gk-red">
                    {error}
                </div>
            )}
            {createdUrl ? (
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gk-accent font-medium">Pull request created successfully!</span>
                    <div className="flex items-center space-x-2">
                        <a href={createdUrl} target="_blank" rel="noreferrer" className="flex items-center px-4 py-2 bg-gk-blue text-white font-bold rounded hover:opacity-90 text-sm">
                            <ExternalLink className="w-3.5 h-3.5 mr-2" /> View on GitHub
                        </a>
                        <button onClick={onClose} className="px-4 py-2 rounded text-gray-400 hover:bg-white/5">Close</button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded text-gray-400 hover:bg-white/5">Cancel</button>
                    <button
                        onClick={handleCreate}
                        disabled={creating || !title.trim() || !token}
                        className="px-6 py-2 bg-gk-accent text-gk-bg font-bold rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                        {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {creating ? 'Creating...' : 'Create PR on GitHub'}
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default CreatePRModal;