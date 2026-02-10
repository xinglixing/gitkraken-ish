import React, { useEffect, useState } from 'react';
import { GitPullRequest, AlertCircle, CheckCircle, Clock, Plus, Zap, Loader2 } from 'lucide-react';
import { PullRequest, Issue, Repository } from '../types';
import { fetchPullRequests, fetchIssues } from '../services/githubService';

interface LaunchpadProps {
  repo: Repository;
  onSelectPR: (pr: PullRequest) => void;
  token?: string;
}

const Launchpad: React.FC<LaunchpadProps> = ({ repo, onSelectPR, token }) => {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
        if (!token || repo.isLocal || !repo.owner) return;
        setLoading(true);
        try {
            const [fetchedPrs, fetchedIssues] = await Promise.all([
                fetchPullRequests(token, repo.owner.login, repo.name),
                fetchIssues(token, repo.owner.login, repo.name)
            ]);
            setPrs(fetchedPrs);
            setIssues(fetchedIssues);
        } catch (e) {
            console.error(e);
            setError('Failed to fetch data from GitHub. Ensure you are connected.');
        } finally {
            setLoading(false);
        }
    };
    loadData();
  }, [repo, token]);

  if (repo.isLocal) {
      return (
          <div className="flex-1 bg-gk-bg p-8 flex items-center justify-center flex-col text-center">
              <Zap className="w-16 h-16 text-gray-600 mb-4" />
              <h2 className="text-xl font-bold text-gray-300">Local Repository Mode</h2>
              <p className="text-gray-500 max-w-md mt-2">
                  Launchpad features like Pull Requests and Issues require a connection to a remote GitHub repository.
              </p>
          </div>
      );
  }

  return (
    <div className="flex-1 bg-gk-bg overflow-y-auto p-8 animate-fade-in">
        <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-200 mb-2">Launchpad</h1>
            <p className="text-gray-500 mb-8">Central hub for {repo.full_name}</p>

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-gk-accent animate-spin" />
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-gk-red/10 border border-gk-red/30 rounded-lg flex items-center">
                    <AlertCircle className="w-5 h-5 text-gk-red mr-3 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{error}</span>
                </div>
            )}

            {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pull Requests */}
                <div className="bg-gk-panel border border-gk-header rounded-xl overflow-hidden shadow-lg">
                    <div className="h-12 bg-white/5 flex items-center justify-between px-4 border-b border-white/5">
                        <div className="flex items-center text-gray-200 font-bold">
                            <GitPullRequest className="w-5 h-5 mr-2 text-gk-blue" />
                            Pull Requests
                        </div>
                        <button className="p-1.5 hover:bg-white/10 rounded text-gk-accent">
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                        {prs.length === 0 && <div className="p-4 text-gray-500 text-sm">No open pull requests.</div>}
                        {prs.map(pr => (
                            <div key={pr.id} className="p-4 hover:bg-white/5 cursor-pointer flex items-center group">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${pr.status === 'merged' ? 'bg-gk-purple/20 text-gk-purple' : 'bg-gk-blue/20 text-gk-blue'}`}>
                                    <GitPullRequest className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-medium text-gray-300 group-hover:text-white truncate">{pr.title}</h4>
                                    <div className="text-xs text-gray-500 mt-1 flex items-center">
                                        #{pr.number} opened by {pr.author}
                                        {pr.checks === 'passing' && <CheckCircle className="w-3 h-3 ml-2 text-gk-accent" />}
                                        {pr.checks === 'pending' && <Clock className="w-3 h-3 ml-2 text-gk-yellow" />}
                                    </div>
                                </div>
                                <div className="text-xs px-2 py-1 rounded bg-black/20 text-gray-400 border border-white/5">
                                    {pr.status}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Issues */}
                <div className="bg-gk-panel border border-gk-header rounded-xl overflow-hidden shadow-lg">
                    <div className="h-12 bg-white/5 flex items-center justify-between px-4 border-b border-white/5">
                         <div className="flex items-center text-gray-200 font-bold">
                            <AlertCircle className="w-5 h-5 mr-2 text-gk-red" />
                            Issues
                        </div>
                        <button className="p-1.5 hover:bg-white/10 rounded text-gk-accent">
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                     <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                        {issues.length === 0 && <div className="p-4 text-gray-500 text-sm">No open issues.</div>}
                        {issues.map(issue => (
                            <div key={issue.id} className="p-4 hover:bg-white/5 cursor-pointer flex items-center group">
                                <div className="w-8 h-8 rounded-full bg-gk-red/20 flex items-center justify-center mr-3 text-gk-red">
                                    <AlertCircle className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-medium text-gray-300 group-hover:text-white truncate">{issue.title}</h4>
                                    <div className="text-xs text-gray-500 mt-1">
                                        #{issue.number} opened by {issue.author}
                                    </div>
                                </div>
                                 <div className="text-xs px-2 py-1 rounded bg-black/20 text-gray-400 border border-white/5 capitalize">
                                    {issue.status}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            )}
        </div>
    </div>
  );
};

export default Launchpad;