import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GitBranch, Search, Check, Globe } from 'lucide-react';
import { Branch } from '../types';

interface BranchSwitcherProps {
  branches: Branch[];
  currentBranch: string;
  onSelect: (branchName: string) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ branches, currentBranch, onSelect, onClose, position }) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter branches
  const filteredBranches = useMemo(() => {
    return branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  }, [branches, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => (prev + 1) % filteredBranches.length);
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => (prev - 1 + filteredBranches.length) % filteredBranches.length);
    } else if (e.key === 'Enter') {
      if (filteredBranches[selectedIndex]) {
        onSelect(filteredBranches[selectedIndex].name);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.branch-switcher-container')) {
        onClose();
      }
    };
    // Small timeout to avoid immediate close if the trigger button click also fires
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      // Always try to remove - removeEventListener is a no-op if not added
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 branch-switcher-container animate-scale-in origin-top-left"
      style={{
        top: position?.top ?? 56,
        left: position?.left ?? 288,
      }}
    >
      <div className="w-80 bg-gk-panel border border-gk-header rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="p-2 border-b border-black/20 bg-gk-bg">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Filter branches..."
              className="w-full bg-black/20 border border-white/5 rounded pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-gk-blue/50"
              aria-label="Filter branches"
              role="combobox"
              aria-expanded="true"
              aria-controls="branch-list"
              aria-activedescendant={filteredBranches[selectedIndex] ? `branch-${filteredBranches[selectedIndex].name}` : undefined}
            />
          </div>
        </div>
        
        <div id="branch-list" role="listbox" aria-label="Branches" className="max-h-80 overflow-y-auto custom-scrollbar">
          {filteredBranches.length === 0 && (
             <div className="p-4 text-center text-xs text-gray-500">No branches match your filter</div>
          )}
          {filteredBranches.map((branch, idx) => {
             const isSelected = idx === selectedIndex;
             const isCurrent = branch.name === currentBranch;
             const isHEAD = branch.name === 'HEAD';

             return (
               <div
                 key={branch.name}
                 id={`branch-${branch.name}`}
                 role="option"
                 aria-selected={isSelected}
                 onClick={() => { onSelect(branch.name); onClose(); }}
                 onMouseEnter={() => setSelectedIndex(idx)}
                 className={`flex items-center px-4 py-2 cursor-pointer text-sm border-l-2 transition-colors ${
                    isSelected ? 'bg-white/5 border-gk-blue' : 'border-transparent'
                 }`}
               >
                 {branch.isRemote ? (
                    <Globe className={`w-3.5 h-3.5 mr-3 ${isCurrent ? 'text-gk-accent' : 'text-gray-500'}`} />
                 ) : (
                    <GitBranch className={`w-3.5 h-3.5 mr-3 ${
                      isHEAD ? 'text-gk-yellow' : (isCurrent ? 'text-gk-accent' : 'text-gray-500')
                    }`} />
                 )}

                 <div className="flex-1 truncate">
                    <div className={`font-medium ${
                      isHEAD ? 'text-gk-yellow' : (isCurrent ? 'text-gk-accent' : 'text-gray-300')
                    }`}>
                        {branch.name}
                        {isHEAD && <span className="ml-2 text-[10px] bg-gk-yellow/20 text-gk-yellow px-1.5 py-0.5 rounded">detached</span>}
                    </div>
                 </div>

                 {isCurrent && <Check className="w-3.5 h-3.5 text-gk-accent ml-2" />}
               </div>
             );
          })}
        </div>
        
        <div className="p-2 bg-black/20 border-t border-black/20 text-[10px] text-gray-500 flex justify-between px-4">
            <span>↑↓ Navigate • Enter Checkout • Esc Close</span>
            <span>{filteredBranches.length} branches</span>
        </div>
      </div>
    </div>
  );
};

export default BranchSwitcher;