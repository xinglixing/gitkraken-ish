import React, { useEffect, useState } from 'react';
import { 
    AlertCircle, CheckCircle, ExternalLink, MessageSquare, Tag, User 
} from 'lucide-react';
import { Issue, Repository } from '../types';
import { fetchIssueDetails } from '../services/githubService';

interface IssueDetailsProps {
  issue: Issue;
  repo: Repository;
  token?: string;
  onClose: () => void;
}

const IssueDetails: React.FC<IssueDetailsProps> = ({ issue: initialIssue, repo, token, onClose }) => {
  const [issue, setIssue] = useState<Issue>(initialIssue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
      if (token && repo.owner) {
          setLoading(true);
          setError(null);
          fetchIssueDetails(token, repo.owner.login, repo.name, initialIssue.number)
            .then(setIssue)
            .catch(err => {
              console.error('Failed to fetch issue details:', err);
              setError('Failed to load issue details');
            })
            .finally(() => setLoading(false));
      }
  }, [initialIssue.number, repo, token]);

  return (
    <div className="flex-1 bg-gk-bg flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="h-16 bg-gk-panel border-b border-black/20 px-6 flex items-center justify-between flex-shrink-0">
             <div className="flex items-center min-w-0">
                 <div className="mr-4">
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center ${issue.status === 'closed' ? 'bg-gk-purple/20 text-gk-purple' : 'bg-gk-red/20 text-gk-red'}`}>
                        <AlertCircle className="w-5 h-5" />
                     </div>
                 </div>
                 <div>
                     <div className="flex items-center space-x-3 mb-1">
                        <h2 className="text-lg font-bold text-gray-200 truncate leading-tight">
                            {issue.title} <span className="text-gray-500 font-normal">#{issue.number}</span>
                        </h2>
                        <div className={`px-2 py-0.5 rounded flex items-center text-xs font-bold uppercase ${issue.status === 'open' ? 'bg-gk-accent/20 text-gk-accent border border-gk-accent/30' : 'bg-gk-purple/20 text-gk-purple border border-gk-purple/30'}`}>
                            {issue.status}
                        </div>
                     </div>
                     <div className="flex items-center text-xs text-gray-500 space-x-2">
                         <span className="flex items-center">
                             <User className="w-3 h-3 mr-1" /> {issue.author}
                         </span>
                         <span>opened on {issue.created_at ? new Date(issue.created_at).toLocaleDateString() : '...'}</span>
                     </div>
                 </div>
             </div>
             <div className="flex items-center space-x-3">
                 {issue.html_url && (
                    <a href={issue.html_url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-white">
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-4xl">
                 <div className="bg-gk-panel border border-white/10 rounded-lg p-6 mb-6">
                     {loading ? (
                         <div className="text-gray-500">Loading description...</div>
                     ) : error ? (
                         <div className="text-gk-red text-sm">{error}</div>
                     ) : (
                        <div className="prose prose-invert prose-sm max-w-none text-gray-400 whitespace-pre-wrap">
                            {issue.body || <i>No description provided.</i>}
                        </div>
                     )}
                 </div>
            </div>
        </div>
    </div>
  );
};

export default IssueDetails;
