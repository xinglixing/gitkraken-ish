import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, GitBranch, GitCommit, Archive, Settings, Sparkles, ArrowDown, ArrowUp, Plus, RotateCcw, Tag, FileText, Clock, Eye, History, Filter, FolderTree, Camera, GitFork, FilePlus, Send, Users, GitPullRequest, Download, Bug } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.group.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(q))
    );
  }, [query, commands]);

  // Group the filtered commands
  const grouped = useMemo(() => {
    const groups: { [key: string]: Command[] } = {};
    for (const cmd of filtered) {
      if (!groups[cmd.group]) groups[cmd.group] = [];
      groups[cmd.group].push(cmd);
    }
    return groups;
  }, [filtered]);

  // Flatten for keyboard navigation
  const flatList = useMemo(() => {
    const result: Command[] = [];
    for (const group of Object.values(grouped)) {
      result.push(...group);
    }
    return result;
  }, [grouped]);

  // Precompute flat index for each command (avoids mutable counter in render)
  const flatIndexMap = useMemo(() => {
    const map = new Map<Command, number>();
    flatList.forEach((cmd, i) => map.set(cmd, i));
    return map;
  }, [flatList]);

  useEffect(() => {
    if (selectedIndex >= flatList.length) {
      setSelectedIndex(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[selectedIndex]) {
        flatList[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[560px] max-h-[60vh] bg-gk-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-white/10">
          <Search className="w-5 h-5 text-gray-500 mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
            placeholder="Type a command..."
          />
          <kbd className="text-[10px] text-gray-600 bg-black/30 px-1.5 py-0.5 rounded border border-white/10">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1 custom-scrollbar">
          {Object.entries(grouped).map(([groupName, cmds]) => (
            <div key={groupName}>
              <div className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                {groupName}
              </div>
              {cmds.map((cmd) => {
                const idx = flatIndexMap.get(cmd) ?? 0;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    data-index={idx}
                    className={`flex items-center px-4 py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-gk-accent/20 text-white' : 'text-gray-300 hover:bg-white/5'
                    }`}
                    onClick={() => { cmd.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="w-6 flex-shrink-0 text-gray-400">
                      {cmd.icon}
                    </div>
                    <span className="flex-1 text-sm">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] text-gray-600 bg-black/30 px-1.5 py-0.5 rounded border border-white/10 ml-2">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {flatList.length === 0 && (
            <div className="text-center text-gray-500 py-8 text-sm">
              No commands found for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <kbd className="bg-black/30 px-1 rounded">Up/Down</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="bg-black/30 px-1 rounded">Enter</kbd>
              <span>select</span>
            </span>
          </div>
          <span>{flatList.length} command{flatList.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

// Helper to create standard commands for the app
export function createAppCommands({
  onPull, onPush, onBranch, onStash, onSettings, onCheckout,
  onCommitAmend, onRevert, onSquash, onCreateTag,
  onBlame, onFileHistory, onSearch, onRefresh,
  onOpenReflogViewer, onOpenGraphFilters, onOpenGitflowPanel,
  onOpenSnapshotsPanel, onCreateSnapshot, onOpenSubmodulesPanel,
  onInteractiveRebase, onCherryPickCommit, onGenerateAICommitMessage,
  onCreateFile, onCommitAndPush, onOpenWorktrees, onCheckForUpdates,
  onReportIssue,
  isLocal, branches
}: {
  onPull?: () => void;
  onPush?: () => void;
  onBranch?: () => void;
  onStash?: () => void;
  onSettings?: () => void;
  onCheckout?: (branch: string) => void;
  onCommitAmend?: () => void;
  onRevert?: () => void;
  onSquash?: () => void;
  onCreateTag?: () => void;
  onBlame?: () => void;
  onFileHistory?: () => void;
  onSearch?: () => void;
  onRefresh?: () => void;
  onOpenReflogViewer?: () => void;
  onOpenGraphFilters?: () => void;
  onOpenGitflowPanel?: () => void;
  onOpenSnapshotsPanel?: () => void;
  onCreateSnapshot?: () => void;
  onOpenSubmodulesPanel?: () => void;
  onInteractiveRebase?: () => void;
  onCherryPickCommit?: () => void;
  onGenerateAICommitMessage?: () => void;
  onCreateFile?: () => void;
  onCommitAndPush?: () => void;
  onOpenWorktrees?: () => void;
  onCheckForUpdates?: () => void;
  onReportIssue?: () => void;
  isLocal: boolean;
  branches?: { name: string; isRemote: boolean; active?: boolean }[];
}): Command[] {
  const cmds: Command[] = [];

  if (isLocal) {
    if (onPull) cmds.push({ id: 'pull', label: 'Pull from Remote', group: 'Repository', icon: <ArrowDown className="w-4 h-4" />, action: onPull, keywords: ['fetch', 'download'] });
    if (onPush) cmds.push({ id: 'push', label: 'Push to Remote', group: 'Repository', icon: <ArrowUp className="w-4 h-4" />, action: onPush, keywords: ['upload', 'publish'] });
    if (onRefresh) cmds.push({ id: 'refresh', label: 'Refresh Repository', group: 'Repository', icon: <RotateCcw className="w-4 h-4" />, action: onRefresh, keywords: ['reload'] });
    if (onBranch) cmds.push({ id: 'new-branch', label: 'Create New Branch', group: 'Branch', icon: <Plus className="w-4 h-4" />, action: onBranch, keywords: ['branch', 'new'] });
    if (onStash) cmds.push({ id: 'stash', label: 'Stash Changes', group: 'Stash', icon: <Archive className="w-4 h-4" />, shortcut: 'Ctrl+S', action: onStash, keywords: ['save', 'shelve'] });
    if (onCommitAmend) cmds.push({ id: 'amend', label: 'Amend Last Commit', group: 'Commit', icon: <GitCommit className="w-4 h-4" />, action: onCommitAmend, keywords: ['edit', 'fix'] });
    if (onSquash) cmds.push({ id: 'squash', label: 'Squash Commits', group: 'Commit', icon: <GitCommit className="w-4 h-4" />, shortcut: 'Ctrl+Shift+S', action: onSquash, keywords: ['combine', 'merge'] });
    if (onCreateTag) cmds.push({ id: 'tag', label: 'Create Tag at HEAD', group: 'Repository', icon: <Tag className="w-4 h-4" />, action: onCreateTag, keywords: ['release', 'version'] });
    if (onBlame) cmds.push({ id: 'blame', label: 'Blame File', group: 'Investigation', icon: <Eye className="w-4 h-4" />, action: onBlame, keywords: ['annotate', 'who'] });
    if (onFileHistory) cmds.push({ id: 'file-history', label: 'Show File History', group: 'Investigation', icon: <Clock className="w-4 h-4" />, action: onFileHistory, keywords: ['log', 'changes'] });
  }

  if (onSettings) cmds.push({ id: 'settings', label: 'Open Settings', group: 'Navigation', icon: <Settings className="w-4 h-4" />, action: onSettings, keywords: ['preferences', 'config'] });
  if (onSearch) cmds.push({ id: 'search', label: 'Search Everywhere', group: 'Navigation', icon: <Search className="w-4 h-4" />, shortcut: 'Ctrl+F', action: onSearch, keywords: ['find'] });

  // Add branch checkout commands
  if (onCheckout && branches) {
    for (const b of branches.filter(b => !b.isRemote)) {
      cmds.push({
        id: `checkout-${b.name}`,
        label: `Checkout: ${b.name}`,
        group: 'Branch',
        icon: <GitBranch className="w-4 h-4" />,
        action: () => onCheckout(b.name),
        keywords: ['switch', 'branch'],
      });
    }
  }

  // --- View Commands ---
  if (onOpenReflogViewer) {
    cmds.push({
      id: 'open-reflog',
      label: 'Open Reflog Viewer',
      group: 'View',
      icon: <History className="w-4 h-4" />,
      action: onOpenReflogViewer,
      keywords: ['reflog', 'history', 'recover', 'undo', 'restore']
    });
  }

  if (onOpenGraphFilters) {
    cmds.push({
      id: 'open-graph-filters',
      label: 'Open Graph Filters',
      group: 'View',
      icon: <Filter className="w-4 h-4" />,
      action: onOpenGraphFilters,
      keywords: ['filter', 'search', 'graph', 'focus', 'commits']
    });
  }

  // --- Gitflow Commands ---
  if (onOpenGitflowPanel) {
    cmds.push({
      id: 'open-gitflow',
      label: 'Open Gitflow Panel',
      group: 'Gitflow',
      icon: <GitFork className="w-4 h-4" />,
      action: onOpenGitflowPanel,
      keywords: ['gitflow', 'feature', 'release', 'hotfix', 'workflow']
    });
  }

  // --- Snapshots Commands ---
  if (onOpenSnapshotsPanel) {
    cmds.push({
      id: 'open-snapshots',
      label: 'Open Snapshots Panel',
      group: 'Snapshots',
      icon: <Camera className="w-4 h-4" />,
      action: onOpenSnapshotsPanel,
      keywords: ['snapshot', 'checkpoint', 'save', 'backup', 'stash']
    });
  }

  if (onCreateSnapshot) {
    cmds.push({
      id: 'create-snapshot',
      label: 'Create Snapshot',
      group: 'Snapshots',
      icon: <Plus className="w-4 h-4" />,
      action: onCreateSnapshot,
      keywords: ['snapshot', 'create', 'save', 'checkpoint']
    });
  }

  // --- Submodules Commands ---
  if (onOpenSubmodulesPanel) {
    cmds.push({
      id: 'open-submodules',
      label: 'Open Submodules Panel',
      group: 'Submodules',
      icon: <FolderTree className="w-4 h-4" />,
      action: onOpenSubmodulesPanel,
      keywords: ['submodule', 'nested', 'repo', 'module']
    });
  }

  // --- New Commands ---
  if (isLocal && onInteractiveRebase) {
    cmds.push({
      id: 'interactive-rebase',
      label: 'Interactive Rebase',
      group: 'Commit',
      icon: <GitCommit className="w-4 h-4" />,
      action: onInteractiveRebase,
      keywords: ['rebase', 'interactive', 'reorder', 'squash']
    });
  }

  if (isLocal && onCherryPickCommit) {
    cmds.push({
      id: 'cherry-pick',
      label: 'Cherry-pick Commit',
      group: 'Commit',
      icon: <ArrowUp className="w-4 h-4" />,
      action: onCherryPickCommit,
      keywords: ['cherry', 'pick', 'apply']
    });
  }

  if (onGenerateAICommitMessage) {
    cmds.push({
      id: 'ai-commit-message',
      label: 'Generate AI Commit Message',
      group: 'AI',
      icon: <Sparkles className="w-4 h-4" />,
      action: onGenerateAICommitMessage,
      keywords: ['ai', 'generate', 'commit', 'message', 'smart']
    });
  }

  // --- File Operations ---
  if (isLocal && onCreateFile) {
    cmds.push({
      id: 'create-file',
      label: 'Create New File',
      group: 'Files',
      icon: <FilePlus className="w-4 h-4" />,
      action: onCreateFile,
      keywords: ['new', 'file', 'create', 'add']
    });
  }

  // --- Commit & Push ---
  if (isLocal && onCommitAndPush) {
    cmds.push({
      id: 'commit-and-push',
      label: 'Commit & Push',
      group: 'Commit',
      icon: <Send className="w-4 h-4" />,
      action: onCommitAndPush,
      keywords: ['commit', 'push', 'upload', 'publish']
    });
  }

  // --- Worktrees ---
  if (isLocal && onOpenWorktrees) {
    cmds.push({
      id: 'open-worktrees',
      label: 'Open Worktrees Panel',
      group: 'Repository',
      icon: <FolderTree className="w-4 h-4" />,
      action: onOpenWorktrees,
      keywords: ['worktree', 'workspace', 'parallel']
    });
  }

  // --- System Commands ---
  if (onCheckForUpdates) {
    cmds.push({
      id: 'check-updates',
      label: 'Check for Updates',
      group: 'System',
      icon: <Download className="w-4 h-4" />,
      action: onCheckForUpdates,
      keywords: ['update', 'upgrade', 'version', 'release']
    });
  }

  if (onReportIssue) {
    cmds.push({
      id: 'report-issue',
      label: 'Report Issue / Feature Request',
      group: 'Help',
      icon: <Bug className="w-4 h-4" />,
      action: onReportIssue,
      keywords: ['bug', 'issue', 'report', 'feature', 'request', 'feedback', 'github']
    });
  }

  return cmds;
}
