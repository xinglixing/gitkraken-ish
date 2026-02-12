import React, { useEffect, useState } from 'react';
import {
    AlertCircle, ExternalLink, User, Sparkles, Loader2,
    CheckCircle, XCircle, FileCode, ChevronDown, ChevronRight,
    AlertTriangle, Copy, Check
} from 'lucide-react';
import { Issue, Repository, AIConfig } from '../types';
import { fetchIssueDetails } from '../services/githubService';
import { generateIssueFix, IssueFix } from '../services/aiService';
import { gitListAllFiles, gitGetWorkingFileContent, gitWriteFile, gitCreateFile } from '../services/localGitService';

interface IssueDetailsProps {
  issue: Issue;
  repo: Repository;
  token?: string;
  aiConfig?: AIConfig;
  onClose: () => void;
  onRefresh?: () => void;
}

const IssueDetails: React.FC<IssueDetailsProps> = ({
  issue: initialIssue,
  repo,
  token,
  aiConfig,
  onClose,
  onRefresh
}) => {
  const [issue, setIssue] = useState<Issue>(initialIssue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Fix state
  const [aiFixing, setAiFixing] = useState(false);
  const [aiFix, setAiFix] = useState<IssueFix | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [appliedFiles, setAppliedFiles] = useState<Set<string>>(new Set());
  const [applyingFile, setApplyingFile] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  const handleAIFix = async () => {
    if (!aiConfig || !repo.isLocal) return;

    setAiFixing(true);
    setAiError(null);
    setAiFix(null);
    setAppliedFiles(new Set());

    try {
      // Get list of files in repo
      const fileList = await gitListAllFiles(repo);

      // Get content of relevant files (try to find files mentioned in issue or key files)
      const relevantFiles: { path: string; content: string }[] = [];
      const issueText = `${issue.title} ${issue.body || ''}`.toLowerCase();

      // Find files that might be relevant based on issue text
      const potentialFiles = fileList.filter(f => {
        const fname = f.toLowerCase();
        // Include if file name appears in issue text
        if (issueText.includes(fname.split('/').pop()?.replace(/\.[^.]+$/, '') || '')) return true;
        // Include key source files
        if (fname.endsWith('.ts') || fname.endsWith('.tsx') || fname.endsWith('.js') || fname.endsWith('.jsx')) {
          if (!fname.includes('node_modules') && !fname.includes('.d.ts')) return true;
        }
        return false;
      }).slice(0, 10);

      // Read content of potential files
      for (const filePath of potentialFiles) {
        try {
          const content = await gitGetWorkingFileContent(repo, filePath);
          if (content.length < 50000) { // Skip very large files
            relevantFiles.push({ path: filePath, content });
          }
        } catch (e) {
          console.warn('Could not read file:', filePath);
        }
      }

      // Call AI to generate fix
      const fix = await generateIssueFix(
        { title: issue.title, body: issue.body || '', number: issue.number },
        fileList,
        relevantFiles,
        aiConfig
      );

      setAiFix(fix);

      // Auto-expand first file if there are fixes
      if (fix.files.length > 0) {
        setExpandedFiles(new Set([fix.files[0].path]));
      }
    } catch (e) {
      console.error('AI Fix error:', e);
      setAiError(e.message || 'Failed to generate fix');
    } finally {
      setAiFixing(false);
    }
  };

  const handleApplyFile = async (fileFix: IssueFix['files'][0]) => {
    if (!repo.isLocal || !fileFix.content) return;

    setApplyingFile(fileFix.path);
    try {
      if (fileFix.action === 'create') {
        await gitCreateFile(repo, fileFix.path, fileFix.content);
      } else if (fileFix.action === 'modify') {
        await gitWriteFile(repo, fileFix.path, fileFix.content);
      }
      // For delete, we'd need gitDeleteFile but let's skip for safety

      setAppliedFiles(prev => new Set([...prev, fileFix.path]));
      onRefresh?.();
    } catch (e) {
      console.error('Failed to apply fix:', e);
      setAiError(`Failed to apply changes to ${fileFix.path}: ${e.message}`);
    } finally {
      setApplyingFile(null);
    }
  };

  const handleApplyAll = async () => {
    if (!aiFix) return;

    for (const fileFix of aiFix.files) {
      if (fileFix.content && !appliedFiles.has(fileFix.path)) {
        await handleApplyFile(fileFix);
      }
    }
  };

  const toggleFileExpand = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCopyCode = (path: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-gk-accent';
      case 'medium': return 'text-gk-yellow';
      case 'low': return 'text-gk-red';
      default: return 'text-gray-400';
    }
  };

  const canUseAIFix = repo.isLocal && aiConfig && aiConfig.keys[aiConfig.provider];

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
                 {canUseAIFix && (
                   <button
                     onClick={handleAIFix}
                     disabled={aiFixing}
                     className="flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm font-medium rounded transition-all disabled:opacity-50"
                   >
                     {aiFixing ? (
                       <Loader2 className="w-4 h-4 animate-spin" />
                     ) : (
                       <Sparkles className="w-4 h-4" />
                     )}
                     <span>{aiFixing ? 'Analyzing...' : 'AI Fix'}</span>
                   </button>
                 )}
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
                 {/* Issue Description */}
                 <div className="bg-gk-panel border border-white/10 rounded-lg p-6 mb-6">
                     <h3 className="text-sm font-bold text-gray-300 mb-3">Description</h3>
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

                 {/* AI Fix Results */}
                 {aiError && (
                   <div className="bg-gk-red/10 border border-gk-red/30 rounded-lg p-4 mb-6">
                     <div className="flex items-center text-gk-red">
                       <XCircle className="w-5 h-5 mr-2" />
                       <span className="font-medium">AI Fix Error</span>
                     </div>
                     <p className="text-gray-400 text-sm mt-2">{aiError}</p>
                   </div>
                 )}

                 {aiFix && (
                   <div className="bg-gk-panel border border-white/10 rounded-lg overflow-hidden mb-6">
                     {/* AI Analysis Header */}
                     <div className="p-4 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
                       <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center">
                           <Sparkles className="w-5 h-5 text-purple-400 mr-2" />
                           <span className="font-bold text-gray-200">AI Fix Suggestion</span>
                         </div>
                         <div className="flex items-center space-x-2">
                           <span className="text-xs text-gray-500">Confidence:</span>
                           <span className={`text-xs font-bold uppercase ${getConfidenceColor(aiFix.confidence)}`}>
                             {aiFix.confidence}
                           </span>
                         </div>
                       </div>
                       <p className="text-sm text-gray-400">{aiFix.analysis}</p>
                     </div>

                     {/* File Changes */}
                     {aiFix.files.length > 0 ? (
                       <div>
                         <div className="p-3 border-b border-white/10 flex items-center justify-between">
                           <span className="text-xs font-bold text-gray-500 uppercase">
                             {aiFix.files.length} file{aiFix.files.length !== 1 ? 's' : ''} to change
                           </span>
                           {aiFix.files.some(f => f.content && !appliedFiles.has(f.path)) && (
                             <button
                               onClick={handleApplyAll}
                               className="text-xs bg-gk-accent hover:bg-gk-accent/80 text-black font-bold px-3 py-1 rounded"
                             >
                               Apply All Changes
                             </button>
                           )}
                         </div>

                         {aiFix.files.map((fileFix, idx) => (
                           <div key={idx} className="border-b border-white/5 last:border-0">
                             {/* File Header */}
                             <div
                               className="p-3 flex items-center cursor-pointer hover:bg-white/5"
                               onClick={() => toggleFileExpand(fileFix.path)}
                             >
                               {expandedFiles.has(fileFix.path) ? (
                                 <ChevronDown className="w-4 h-4 text-gray-500 mr-2" />
                               ) : (
                                 <ChevronRight className="w-4 h-4 text-gray-500 mr-2" />
                               )}
                               <FileCode className="w-4 h-4 text-gray-400 mr-2" />
                               <span className="text-sm text-gray-300 flex-1 font-mono">{fileFix.path}</span>
                               <span className={`text-xs px-2 py-0.5 rounded mr-2 ${
                                 fileFix.action === 'create' ? 'bg-gk-accent/20 text-gk-accent' :
                                 fileFix.action === 'delete' ? 'bg-gk-red/20 text-gk-red' :
                                 'bg-gk-yellow/20 text-gk-yellow'
                               }`}>
                                 {fileFix.action}
                               </span>
                               {appliedFiles.has(fileFix.path) ? (
                                 <CheckCircle className="w-4 h-4 text-gk-accent" />
                               ) : fileFix.content && (
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     handleApplyFile(fileFix);
                                   }}
                                   disabled={applyingFile === fileFix.path}
                                   className="text-xs bg-gk-blue hover:bg-gk-blue/80 text-white px-2 py-1 rounded disabled:opacity-50"
                                 >
                                   {applyingFile === fileFix.path ? (
                                     <Loader2 className="w-3 h-3 animate-spin" />
                                   ) : (
                                     'Apply'
                                   )}
                                 </button>
                               )}
                             </div>

                             {/* Expanded Content */}
                             {expandedFiles.has(fileFix.path) && (
                               <div className="px-3 pb-3">
                                 <p className="text-xs text-gray-500 mb-2 pl-6">{fileFix.explanation}</p>
                                 {fileFix.content && (
                                   <div className="relative">
                                     <button
                                       onClick={() => handleCopyCode(fileFix.path, fileFix.content!)}
                                       className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-gray-400"
                                       title="Copy code"
                                     >
                                       {copied === fileFix.path ? (
                                         <Check className="w-4 h-4 text-gk-accent" />
                                       ) : (
                                         <Copy className="w-4 h-4" />
                                       )}
                                     </button>
                                     <pre className="bg-black/40 rounded p-3 text-xs text-gray-300 overflow-x-auto max-h-80 overflow-y-auto font-mono">
                                       {fileFix.content}
                                     </pre>
                                   </div>
                                 )}
                               </div>
                             )}
                           </div>
                         ))}
                       </div>
                     ) : (
                       <div className="p-4 text-center text-gray-500">
                         <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                         <p className="text-sm">No specific file changes suggested.</p>
                         <p className="text-xs mt-1">The AI couldn't determine exact code changes for this issue.</p>
                       </div>
                     )}

                     {/* Test Suggestions */}
                     {aiFix.testSuggestions && aiFix.testSuggestions.length > 0 && (
                       <div className="p-4 border-t border-white/10 bg-white/5">
                         <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Test Suggestions</h4>
                         <ul className="text-sm text-gray-400 space-y-1">
                           {aiFix.testSuggestions.map((test, idx) => (
                             <li key={idx} className="flex items-start">
                               <span className="text-gk-accent mr-2">•</span>
                               {test}
                             </li>
                           ))}
                         </ul>
                       </div>
                     )}
                   </div>
                 )}

                 {/* No AI Config Warning */}
                 {!canUseAIFix && repo.isLocal && (
                   <div className="bg-gk-yellow/10 border border-gk-yellow/30 rounded-lg p-4 mb-6">
                     <div className="flex items-center text-gk-yellow">
                       <AlertTriangle className="w-5 h-5 mr-2" />
                       <span className="font-medium">AI Fix Unavailable</span>
                     </div>
                     <p className="text-gray-400 text-sm mt-2">
                       Configure an AI provider API key in Settings to use the AI Fix feature.
                     </p>
                   </div>
                 )}

                 {!repo.isLocal && (
                   <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
                     <div className="flex items-center text-gray-400">
                       <AlertTriangle className="w-5 h-5 mr-2" />
                       <span className="font-medium">Local Repository Required</span>
                     </div>
                     <p className="text-gray-500 text-sm mt-2">
                       Clone this repository locally to use the AI Fix feature.
                     </p>
                   </div>
                 )}
            </div>
        </div>
    </div>
  );
};

export default IssueDetails;
