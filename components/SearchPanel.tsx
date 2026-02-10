import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, GitCommit, GitBranch, FileText, Hash, Tag } from 'lucide-react';
import { Commit, Branch } from '../types';

interface SearchResult {
  type: 'commit' | 'branch' | 'tag' | 'file';
  label: string;
  detail: string;
  id: string;
  icon: React.ReactNode;
}

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  commits: Commit[];
  branches: Branch[];
  tags?: string[];
  files?: string[];
  onSelectCommit?: (commitId: string) => void;
  onSelectBranch?: (branchName: string) => void;
  onSelectFile?: (filepath: string) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  isOpen, onClose, commits, branches, tags = [], files = [],
  onSelectCommit, onSelectBranch, onSelectFile
}) => {
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

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const res: SearchResult[] = [];

    // Search commits (message + SHA)
    for (const c of commits) {
      if (c.message.toLowerCase().includes(q) || c.id.toLowerCase().startsWith(q) || c.shortId.toLowerCase().startsWith(q)) {
        res.push({
          type: 'commit',
          label: c.message,
          detail: `${c.shortId} by ${c.author} - ${c.date}`,
          id: c.id,
          icon: <GitCommit className="w-4 h-4 text-gray-400" />,
        });
      }
      if (res.length > 50) break;
    }

    // Search branches
    for (const b of branches) {
      if (b.name.toLowerCase().includes(q)) {
        res.push({
          type: 'branch',
          label: b.name,
          detail: `Branch${b.isRemote ? ' (remote)' : ''}${b.active ? ' - active' : ''}`,
          id: b.name,
          icon: <GitBranch className="w-4 h-4 text-gk-accent" />,
        });
      }
    }

    // Search tags
    for (const t of tags) {
      if (t.toLowerCase().includes(q)) {
        res.push({
          type: 'tag',
          label: t,
          detail: 'Tag',
          id: t,
          icon: <Tag className="w-4 h-4 text-gk-yellow" />,
        });
      }
    }

    // Search files
    for (const f of files) {
      if (f.toLowerCase().includes(q)) {
        res.push({
          type: 'file',
          label: f,
          detail: 'File',
          id: f,
          icon: <FileText className="w-4 h-4 text-gk-blue" />,
        });
        if (res.length > 100) break;
      }
    }

    return res;
  }, [query, commits, branches, tags, files]);

  // Group results by type
  const grouped = useMemo(() => {
    const groups: { [key: string]: SearchResult[] } = {};
    for (const r of results) {
      const key = r.type === 'commit' ? 'Commits' : r.type === 'branch' ? 'Branches' : r.type === 'tag' ? 'Tags' : 'Files';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [results]);

  const flatResults = useMemo(() => {
    const flat: SearchResult[] = [];
    for (const group of Object.values(grouped)) {
      flat.push(...group);
    }
    return flat;
  }, [grouped]);

  // Precompute flat index for each result (avoids mutable counter in render)
  const flatIndexMap = useMemo(() => {
    const map = new Map<SearchResult, number>();
    flatResults.forEach((r, i) => map.set(r, i));
    return map;
  }, [flatResults]);

  useEffect(() => {
    if (selectedIndex >= flatResults.length) {
      setSelectedIndex(Math.max(0, flatResults.length - 1));
    }
  }, [flatResults.length, selectedIndex]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    switch (result.type) {
      case 'commit': onSelectCommit?.(result.id); break;
      case 'branch': onSelectBranch?.(result.id); break;
      case 'file': onSelectFile?.(result.id); break;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[selectedIndex]) handleSelect(flatResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[600px] max-h-[60vh] bg-gk-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
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
            placeholder="Search commits, branches, tags, files..."
            aria-label="Search commits, branches, tags, and files"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} id="search-results" role="listbox" className="flex-1 overflow-y-auto py-1 custom-scrollbar">
          {query && Object.entries(grouped).map(([groupName, items]) => (
            <div key={groupName}>
              <div className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                <span>{groupName}</span>
                <span className="text-gray-600">{items.length}</span>
              </div>
              {items.map((result) => {
                const idx = flatIndexMap.get(result) ?? 0;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={`${result.type}-${result.id}`}
                    data-index={idx}
                    className={`flex items-center px-4 py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-gk-accent/20 text-white' : 'text-gray-300 hover:bg-white/5'
                    }`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="w-6 flex-shrink-0">{result.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{result.label}</div>
                      <div className="text-[10px] text-gray-500 truncate">{result.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {query && flatResults.length === 0 && (
            <div className="text-center text-gray-500 py-8 text-sm">
              No results for "{query}"
            </div>
          )}
          {!query && (
            <div className="text-center text-gray-500 py-8 text-sm">
              Start typing to search across commits, branches, and files
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <kbd className="bg-black/30 px-1 rounded">↑↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="bg-black/30 px-1 rounded">Enter</kbd>
              <span>select</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="bg-black/30 px-1 rounded">Esc</kbd>
              <span>close</span>
            </span>
          </div>
          {flatResults.length > 0 && <span>{flatResults.length} result{flatResults.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>
    </div>
  );
};

export default SearchPanel;
