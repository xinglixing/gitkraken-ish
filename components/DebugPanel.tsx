import React, { useState, useEffect } from 'react';
import { X, Terminal, Sparkles, AlertTriangle, Trash2, Bug } from 'lucide-react';
import { GitCommandLogEntry, AIInteractionLogEntry } from '../types';
import { getGitCommandLog, getAIInteractionLog, getErrorLog, clearLogs, isDebugMode, toggleDebugMode } from '../services/debugService';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type DebugTab = 'git' | 'ai' | 'errors';

const DebugPanel: React.FC<DebugPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<DebugTab>('git');
  const [gitLog, setGitLog] = useState<GitCommandLogEntry[]>([]);
  const [aiLog, setAiLog] = useState<AIInteractionLogEntry[]>([]);
  const [errorLog, setErrorLog] = useState<(GitCommandLogEntry | AIInteractionLogEntry)[]>([]);
  const [debugEnabled, setDebugEnabled] = useState(isDebugMode());

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => {
      setGitLog(getGitCommandLog());
      setAiLog(getAIInteractionLog());
      setErrorLog(getErrorLog());
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const handleToggleDebug = () => {
    const newState = toggleDebugMode();
    setDebugEnabled(newState);
  };

  const handleClear = () => {
    clearLogs();
    setGitLog([]);
    setAiLog([]);
    setErrorLog([]);
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-gk-panel border-l border-gk-header flex flex-col z-50 animate-slide-in-right shadow-2xl">
      <div className="h-12 bg-gk-header flex items-center justify-between px-4 border-b border-black/20 flex-shrink-0">
        <div className="flex items-center">
          <Bug className="w-4 h-4 mr-2 text-gk-yellow" />
          <span className="font-bold text-gray-300">Debug Panel</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close debug panel">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <label className="flex items-center text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={debugEnabled}
            onChange={handleToggleDebug}
            className="mr-2"
          />
          Debug Mode
        </label>
        <button
          onClick={handleClear}
          className="flex items-center text-xs text-gray-500 hover:text-gk-red"
          aria-label="Clear all logs"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Clear Logs
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5" role="tablist" aria-label="Debug log tabs">
        {([
          { id: 'git' as DebugTab, label: 'Git Commands', icon: Terminal, count: gitLog.length },
          { id: 'ai' as DebugTab, label: 'AI Prompts', icon: Sparkles, count: aiLog.length },
          { id: 'errors' as DebugTab, label: 'Errors', icon: AlertTriangle, count: errorLog.length },
        ]).map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`debug-tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center px-2 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-gk-blue text-gk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-3 h-3 mr-1" />
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 bg-white/10 px-1.5 rounded text-[10px]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" role="tabpanel" id={`debug-tabpanel-${activeTab}`}>
        {activeTab === 'git' && (
          <div className="p-2 space-y-1">
            {gitLog.length === 0 && (
              <div className="text-xs text-gray-600 italic p-4 text-center">No git commands logged yet</div>
            )}
            {gitLog.map(entry => (
              <div key={entry.id} className={`p-2 rounded text-xs ${entry.success ? 'bg-white/5' : 'bg-gk-red/10'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-mono font-bold ${entry.success ? 'text-gk-accent' : 'text-gk-red'}`}>
                    {entry.command} {entry.args.join(' ')}
                  </span>
                  <span className="text-gray-600">{formatTime(entry.timestamp)}</span>
                </div>
                {entry.duration && (
                  <span className="text-gray-500">{entry.duration}ms</span>
                )}
                {entry.error && (
                  <div className="text-gk-red mt-1 break-all">{entry.error}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="p-2 space-y-1">
            {aiLog.length === 0 && (
              <div className="text-xs text-gray-600 italic p-4 text-center">No AI interactions logged yet</div>
            )}
            {aiLog.map(entry => (
              <div key={entry.id} className={`p-2 rounded text-xs ${entry.success ? 'bg-white/5' : 'bg-gk-red/10'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-gk-purple">{entry.provider}/{entry.model}</span>
                  <span className="text-gray-600">{formatTime(entry.timestamp)}</span>
                </div>
                <div className="text-gray-400 truncate mb-1" title={entry.prompt}>
                  Prompt: {entry.prompt.substring(0, 100)}...
                </div>
                {entry.duration && (
                  <span className="text-gray-500">{entry.duration}ms</span>
                )}
                {entry.error && (
                  <div className="text-gk-red mt-1">{entry.error}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="p-2 space-y-1">
            {errorLog.length === 0 && (
              <div className="text-xs text-gray-600 italic p-4 text-center">No errors logged</div>
            )}
            {errorLog.map((entry, i) => (
              <div key={`${entry.timestamp}-${i}`} className="p-2 rounded text-xs bg-gk-red/10">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-gk-red">
                    {'command' in entry ? `Git: ${entry.command}` : `AI: ${(entry as AIInteractionLogEntry).provider}`}
                  </span>
                  <span className="text-gray-600">{formatTime(entry.timestamp)}</span>
                </div>
                <div className="text-gk-red break-all">{entry.error}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugPanel;
