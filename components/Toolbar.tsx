import React, { useRef } from 'react';
import { ArrowDown, ArrowUp, Plus, Settings, GitMerge, GitPullRequest, GitBranch, ChevronDown, User as UserIcon, Folder, Archive, Search, Command, Loader2, Globe, History, Filter, Camera, FolderTree, AlertTriangle, Bug, GitFork, ArrowLeft } from 'lucide-react';
import { User, Repository, Profile, Branch } from '../types';
import { isLocalRepo } from '../utils/repository';
import { isDebugMode } from '../services/debugService';

interface ToolbarProps {
  activeProfile: Profile | null;
  repo?: Repository;
  branches?: Branch[];
  onOpenSettings: () => void;
  onSwitchRepo: () => void;
  onPull?: () => void;
  onPush?: () => void;
  onBranch?: () => void;
  onGitflow?: () => void;
  onCreatePR?: () => void;
  onOpenBranchSwitcher?: (position?: { top: number; left: number }) => void;
  onStash?: () => void;
  onUnstash?: () => void;
  onOpenStashList?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenSearch?: () => void;
  onManageRemotes?: () => void;
  onOpenReflog?: () => void;
  onOpenGraphFilters?: () => void;
  onOpenSnapshots?: () => void;
  onOpenSubmodules?: () => void;
  onOpenWorktrees?: () => void;
  parentRepo?: Repository | null;
  onBackToParent?: () => void;
  repoHistoryDepth?: number; // How many levels deep in submodules/worktrees
  hasUncommittedChanges?: boolean;
  remoteCount?: number;
  stashCount?: number;
  undoButton?: React.ReactNode;
  aheadCount?: number;
  behindCount?: number;
  isFetching?: boolean;
  lastFetchTime?: Date | null;
  dirtyFileCount?: number;
  largeFileWarnings?: { path: string; sizeMB: number }[];
  onOpenDebugPanel?: () => void;
  debugMode?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
    activeProfile, repo, branches, onOpenSettings, onSwitchRepo,
    onPull, onPush, onBranch, onGitflow, onCreatePR, onOpenBranchSwitcher,
    onStash, onUnstash, onOpenStashList, onOpenCommandPalette, onOpenSearch,
    onManageRemotes, onOpenReflog, onOpenGraphFilters, onOpenSnapshots, onOpenSubmodules, onOpenWorktrees,
    parentRepo, onBackToParent, repoHistoryDepth = 0,
    hasUncommittedChanges, stashCount, undoButton, remoteCount = -1,
    aheadCount = 0, behindCount = 0, isFetching = false, lastFetchTime, dirtyFileCount = 0,
    largeFileWarnings = [], onOpenDebugPanel, debugMode = false
}) => {
  const isLocal = isLocalRepo(repo);
  const branchButtonRef = useRef<HTMLButtonElement>(null);

  // Check if 'develop' branch exists
  const hasDevelopBranch = branches?.some(b =>
    b.name === 'develop' || b.name === 'origin/develop'
  );

  return (
    <div className="h-14 w-full bg-gk-panel border-b border-gk-header flex items-center justify-between px-4 flex-shrink-0 z-10">
      {/* Left Section - Navigation Controls */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        <button
            onClick={onSwitchRepo}
            className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
            title="Back to Workspaces"
        >
            <Folder className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">Repos</span>
        </button>

        {/* Back to Parent - Show when in submodule/worktree */}
        {parentRepo && onBackToParent && (
          <button
            onClick={onBackToParent}
            className="flex items-center gap-2 px-3 py-1.5 bg-gk-purple/20 hover:bg-gk-purple/30 border border-gk-purple/40 rounded-lg text-gk-purple transition-colors relative"
            title={`Back to ${parentRepo.name}${repoHistoryDepth > 1 ? ` (${repoHistoryDepth} levels deep)` : ''}`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-medium truncate max-w-[150px]">Back to {parentRepo.name}</span>
            {repoHistoryDepth > 1 && (
              <span className="ml-1 px-1.5 py-0.5 bg-gk-purple/30 rounded text-[10px] font-bold">
                {repoHistoryDepth}
              </span>
            )}
          </button>
        )}

        {/* Git Operations - Only show for local repos */}
        {isLocal && (
          <>
            <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
            <div className="flex space-x-1 mr-4">
               <button
                  onClick={onPull}
                  disabled={isFetching}
                  className={`flex flex-col items-center justify-center w-14 h-12 rounded transition-colors relative ${
                    isFetching ? 'text-gk-cyan cursor-wait' : 'hover:bg-white/5 text-gray-400 hover:text-white'
                  }`}
                  title={isFetching ? 'Syncing...' : `Pull from origin${behindCount > 0 ? ` (${behindCount} behind)` : ''}`}
               >
                  {isFetching ? (
                    <Loader2 className="w-5 h-5 mb-0.5 animate-spin" />
                  ) : (
                    <ArrowDown className="w-5 h-5 mb-0.5" />
                  )}
                  <span className="text-[10px] font-bold">{isFetching ? 'Syncing' : 'Pull'}</span>
                  {!isFetching && behindCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-gk-blue text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                      {behindCount}
                    </span>
                  )}
               </button>
               {(() => {
                  const canPush = aheadCount > 0 && remoteCount > 0;
                  return (
                    <button
                      onClick={onPush}
                      disabled={!canPush || isFetching}
                      className={`flex flex-col items-center justify-center w-14 h-12 rounded transition-colors relative
                        ${isFetching
                          ? 'text-gk-green cursor-wait'
                          : canPush
                            ? 'hover:bg-white/5 text-gray-400 hover:text-white cursor-pointer'
                            : 'text-gray-600 cursor-not-allowed'
                        }`}
                      title={isFetching
                        ? 'Syncing...'
                        : remoteCount === 0
                          ? 'No remotes configured'
                          : aheadCount === 0
                            ? 'Nothing to push'
                            : `Push ${aheadCount} commit${aheadCount > 1 ? 's' : ''} to origin`}
                    >
                      {isFetching ? (
                        <Loader2 className="w-5 h-5 mb-0.5 animate-spin" />
                      ) : (
                        <ArrowUp className="w-5 h-5 mb-0.5" />
                      )}
                      <span className="text-[10px] font-bold">{isFetching ? 'Syncing' : 'Push'}</span>
                      {!isFetching && aheadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-gk-accent text-gk-bg text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                          {aheadCount}
                        </span>
                      )}
                    </button>
                  );
                })()}
               {/* Remote indicator */}
               {onManageRemotes && remoteCount === 0 && (
                 <button
                   onClick={onManageRemotes}
                   className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gk-yellow hover:text-gk-yellow/80 transition-colors"
                   title="No remotes configured - click to add"
                 >
                   <Globe className="w-5 h-5 mb-0.5" />
                   <span className="text-[10px] font-bold">Remote</span>
                 </button>
               )}
               {onManageRemotes && remoteCount > 0 && (
                 <button
                   onClick={onManageRemotes}
                   className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                   title="Manage remotes"
                 >
                   <Globe className="w-5 h-5 mb-0.5" />
                   <span className="text-[10px] font-bold">Remote</span>
                 </button>
               )}
               <button
                  onClick={onBranch}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Create Branch"
               >
                  <Plus className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Branch</span>
               </button>
               {repo?.isLocal && !hasDevelopBranch && (
                  <button
                      onClick={onGitflow}
                      className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                      title="Initialize Gitflow"
                  >
                      <GitMerge className="w-5 h-5 mb-0.5" />
                      <span className="text-[10px] font-bold">Gitflow</span>
                  </button>
               )}
               {hasUncommittedChanges && (
               <button
                  onClick={onStash}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Stash changes (Ctrl+S)"
               >
                  <Archive className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Stash</span>
               </button>
               )}
               {Boolean(stashCount && stashCount > 0) && (
               <button
                  onClick={onUnstash}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Unstash (apply most recent)"
               >
                  <Archive className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold text-gk-green">Unstash</span>
               </button>
               )}
               {((stashCount || 0) > 0 || hasUncommittedChanges) && (
               <button
                  onClick={onOpenStashList}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="View stashes (Ctrl+K)"
                  style={{position: 'relative'}}
               >
                  <Archive className="w-5 h-5 mb-0.5" />
                  {(stashCount || 0) > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-gk-accent rounded-full"></span>
                  )}
                  <span className="text-[10px] font-bold">List</span>
               </button>
               )}
               {/* New Features Buttons */}
               {onOpenReflog && (
               <button
                  onClick={onOpenReflog}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="View Reflog"
               >
                  <History className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Reflog</span>
               </button>
               )}
               {onOpenGraphFilters && (
               <button
                  onClick={onOpenGraphFilters}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Graph Filters"
               >
                  <Filter className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Filter</span>
               </button>
               )}
               {onOpenSnapshots && (
               <button
                  onClick={onOpenSnapshots}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Snapshots"
               >
                  <Camera className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Snapshot</span>
               </button>
               )}
               {onOpenSubmodules && (
               <button
                  onClick={onOpenSubmodules}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Submodules"
               >
                  <FolderTree className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Modules</span>
               </button>
               )}
               {onOpenWorktrees && (
               <button
                  onClick={onOpenWorktrees}
                  className="flex flex-col items-center justify-center w-14 h-12 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                  title="Worktrees"
               >
                  <GitFork className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-bold">Worktree</span>
               </button>
               )}
            </div>
            <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
          </>
        )}

        {/* Branch Switcher Trigger */}
        <div className="flex items-center space-x-2 relative">
             <button
                ref={branchButtonRef}
                onClick={() => {
                  if (branchButtonRef.current) {
                    const rect = branchButtonRef.current.getBoundingClientRect();
                    onOpenBranchSwitcher?.({ top: rect.bottom + 8, left: rect.left });
                  } else {
                    onOpenBranchSwitcher?.();
                  }
                }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-gk-bg rounded-md border border-white/10 text-gray-300 text-sm hover:border-white/30 hover:bg-white/5 transition-colors group"
             >
                <GitBranch className="w-3.5 h-3.5 text-gk-accent" />
                <span className="font-medium max-w-[150px] truncate">{repo?.default_branch || '...'}</span>
                <ChevronDown className="w-3 h-3 text-gray-500 group-hover:text-white" />
            </button>

            {!isLocal && onCreatePR && (
                <button
                    onClick={onCreatePR}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-gk-bg rounded-md border border-white/10 text-gray-400 text-sm hover:border-white/30 hover:bg-white/5 transition-colors"
                    title="Create Pull Request"
                    aria-label="Create pull request"
                 >
                    <GitPullRequest className="w-3.5 h-3.5" />
                </button>
            )}
        </div>

        {/* Fetching indicator */}
        {isFetching && (
          <div className="flex items-center space-x-1 ml-2 text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px]">Fetching...</span>
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        {/* Search button */}
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="p-2 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors"
            title="Search (Ctrl+F)"
            aria-label="Search repository"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {/* Command Palette button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="p-2 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors"
            title="Command Palette (Ctrl+P)"
            aria-label="Open command palette"
          >
            <Command className="w-4 h-4" />
          </button>
        )}

        {/* Debug Panel button - only show when debug mode is enabled */}
        {debugMode && onOpenDebugPanel && (
          <button
            onClick={onOpenDebugPanel}
            className="p-2 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors"
            title="Debug Panel"
            aria-label="Open debug panel"
          >
            <Bug className="w-4 h-4" />
          </button>
        )}

        {/* Status bar info */}
        {isLocal && (
          <div className="flex items-center space-x-2 text-[10px] text-gray-500 border-l border-white/10 pl-3">
            {largeFileWarnings.length > 0 && (
              <span
                className="text-gk-yellow flex items-center cursor-help"
                title={`Large files detected:\n${largeFileWarnings.map(f => `${f.path} (${f.sizeMB.toFixed(1)}MB)`).join('\n')}`}
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                {largeFileWarnings.length} large file{largeFileWarnings.length !== 1 ? 's' : ''}
              </span>
            )}
            {dirtyFileCount > 0 && (
              <span className="text-gk-yellow" title={`${dirtyFileCount} modified file(s)`}>
                {dirtyFileCount} modified
              </span>
            )}
            {(aheadCount > 0 || behindCount > 0) && (
              <span title={`${aheadCount} ahead, ${behindCount} behind remote`}>
                {aheadCount > 0 && <span className="text-gk-accent">&uarr;{aheadCount}</span>}
                {aheadCount > 0 && behindCount > 0 && ' '}
                {behindCount > 0 && <span className="text-gk-blue">&darr;{behindCount}</span>}
              </span>
            )}
            {lastFetchTime && (
              <span className="text-gray-600" title={`Last fetch: ${lastFetchTime.toLocaleTimeString()}`}>
                {lastFetchTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}

        {/* Undo Button */}
        {undoButton}

        {/* Profile Dropdown Trigger */}
        <div
            onClick={onOpenSettings}
            className="flex items-center space-x-2 pl-3 pr-2 py-1 rounded-full hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/10 transition-all group"
        >
            {activeProfile?.githubUser?.avatar_url ? (
                <img src={activeProfile.githubUser.avatar_url} className="w-7 h-7 rounded-full border border-white/20" />
            ) : (
                <div className="w-7 h-7 rounded-full bg-gk-blue/20 flex items-center justify-center text-gk-blue border border-white/10">
                    <UserIcon className="w-4 h-4" />
                </div>
            )}
            <div className="flex flex-col items-start mr-1">
                <span className="text-[10px] font-bold text-gray-300 leading-tight">{activeProfile?.name || 'Local'}</span>
                <span className="text-[8px] text-gray-500 uppercase leading-none">{activeProfile?.githubUser?.login || 'Offline'}</span>
            </div>
            <ChevronDown className="w-3 h-3 text-gray-600 group-hover:text-gray-300" />
        </div>
      </div>
    </div>
  );
};

export default React.memo(Toolbar);
