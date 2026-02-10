import React, { useState, useMemo } from 'react';
import { X, Filter, GitBranch, User, Calendar, FileText, Focus, RotateCcw } from 'lucide-react';
import { Commit, Branch } from '../types';

export interface GraphFilterState {
    branch?: string;
    author?: string;
    dateRange?: { start: Date; end: Date };
    filePath?: string;
    focusMode: boolean;
    searchQuery: string;
}

interface GraphFiltersProps {
    isOpen: boolean;
    onClose: () => void;
    commits: Commit[];
    branches: Branch[];
    filters: GraphFilterState;
    onFiltersChange: (filters: GraphFilterState) => void;
}

export const GraphFilters: React.FC<GraphFiltersProps> = ({
    isOpen,
    onClose,
    commits,
    branches,
    filters,
    onFiltersChange
}) => {
    const [localFilters, setLocalFilters] = useState<GraphFilterState>(filters);

    // Get unique authors from commits
    const authors = useMemo(() => {
        const authorSet = new Set<string>();
        commits.forEach(c => {
            if (c.author) authorSet.add(c.author);
        });
        return Array.from(authorSet).sort();
    }, [commits]);

    // Get date range from commits
    const dateRange = useMemo(() => {
        if (commits.length === 0) return { min: new Date(), max: new Date() };
        const timestamps = commits.map(c => c.timestamp || 0).filter(t => t > 0 && !isNaN(t));
        if (timestamps.length === 0) return { min: new Date(), max: new Date() };
        const min = new Date(Math.min(...timestamps));
        const max = new Date(Math.max(...timestamps));
        // Validate dates
        if (isNaN(min.getTime()) || isNaN(max.getTime())) {
            return { min: new Date(), max: new Date() };
        }
        return { min, max };
    }, [commits]);

    const handleApply = () => {
        onFiltersChange(localFilters);
    };

    const handleClear = () => {
        const cleared: GraphFilterState = {
            focusMode: false,
            searchQuery: ''
        };
        setLocalFilters(cleared);
        onFiltersChange(cleared);
    };

    const handleFocusModeToggle = () => {
        const updated = { ...localFilters, focusMode: !localFilters.focusMode };
        setLocalFilters(updated);
        onFiltersChange(updated);
    };

    const updateFilter = <K extends keyof GraphFilterState>(key: K, value: GraphFilterState[K]) => {
        const updated = { ...localFilters, [key]: value };
        setLocalFilters(updated);
    };

    const hasActiveFilters =
        localFilters.branch ||
        localFilters.author ||
        localFilters.filePath ||
        localFilters.searchQuery ||
        localFilters.focusMode;

    if (!isOpen) return null;

    return (
        <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[600px] bg-gk-panel border border-gk-header rounded-lg shadow-2xl z-40">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gk-header bg-gk-header rounded-t-lg">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gk-accent" />
                    <h3 className="text-sm font-semibold text-white">Graph Filters</h3>
                </div>
                <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                        <button
                            onClick={handleClear}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Filter Controls */}
            <div className="p-4 space-y-4">
                {/* Search */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Search</label>
                    <input
                        type="text"
                        placeholder="Search commits by message, SHA, or author..."
                        value={localFilters.searchQuery || ''}
                        onChange={(e) => updateFilter('searchQuery', e.target.value)}
                        onBlur={handleApply}
                        className="w-full px-3 py-2 bg-gk-bg border border-gk-header rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gk-accent"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Branch Filter */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                            <GitBranch className="w-3 h-3" />
                            Branch
                        </label>
                        <select
                            value={localFilters.branch || ''}
                            onChange={(e) => {
                                updateFilter('branch', e.target.value || undefined);
                                handleApply();
                            }}
                            className="w-full px-3 py-2 bg-gk-bg border border-gk-header rounded text-sm text-white focus:outline-none focus:border-gk-accent"
                        >
                            <option value="">All branches</option>
                            {branches.map(b => (
                                <option key={b.name} value={b.name}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Author Filter */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                            <User className="w-3 h-3" />
                            Author
                        </label>
                        <select
                            value={localFilters.author || ''}
                            onChange={(e) => {
                                updateFilter('author', e.target.value || undefined);
                                handleApply();
                            }}
                            className="w-full px-3 py-2 bg-gk-bg border border-gk-header rounded text-sm text-white focus:outline-none focus:border-gk-accent"
                        >
                            <option value="">All authors</option>
                            {authors.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Date Range */}
                <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                        <Calendar className="w-3 h-3" />
                        Date Range
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="date"
                            value={localFilters.dateRange?.start && !isNaN(new Date(localFilters.dateRange.start).getTime())
                                ? (() => {
                                    const d = new Date(localFilters.dateRange.start);
                                    // Format as YYYY-MM-DD in local timezone to avoid UTC shift
                                    const year = d.getFullYear();
                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                    const day = String(d.getDate()).padStart(2, '0');
                                    return `${year}-${month}-${day}`;
                                  })()
                                : ''}
                            onChange={(e) => {
                                const startValue = e.target.value;
                                if (!startValue) {
                                    updateFilter('dateRange', undefined);
                                    handleApply();
                                    return;
                                }
                                try {
                                    // Parse date in local timezone to avoid UTC issues
                                    const [year, month, day] = startValue.split('-').map(Number);
                                    const start = new Date(year, month - 1, day, 0, 0, 0);
                                    if (isNaN(start.getTime())) throw new Error('Invalid date');
                                    const end = localFilters.dateRange?.end || dateRange.max;
                                    updateFilter('dateRange', { start, end });
                                    handleApply();
                                } catch (err) {
                                    console.error('Invalid start date:', startValue);
                                }
                            }}
                            className="px-3 py-2 bg-gk-bg border border-gk-header rounded text-sm text-white focus:outline-none focus:border-gk-accent"
                        />
                        <input
                            type="date"
                            value={localFilters.dateRange?.end && !isNaN(new Date(localFilters.dateRange.end).getTime())
                                ? (() => {
                                    const d = new Date(localFilters.dateRange.end);
                                    // Format as YYYY-MM-DD in local timezone to avoid UTC shift
                                    const year = d.getFullYear();
                                    const month = String(d.getMonth() + 1).padStart(2, '0');
                                    const day = String(d.getDate()).padStart(2, '0');
                                    return `${year}-${month}-${day}`;
                                  })()
                                : ''}
                            onChange={(e) => {
                                const endValue = e.target.value;
                                if (!endValue) {
                                    updateFilter('dateRange', undefined);
                                    handleApply();
                                    return;
                                }
                                try {
                                    // Parse date in local timezone to avoid UTC issues
                                    const [year, month, day] = endValue.split('-').map(Number);
                                    const end = new Date(year, month - 1, day, 23, 59, 59);
                                    if (isNaN(end.getTime())) throw new Error('Invalid date');
                                    const start = localFilters.dateRange?.start || dateRange.min;
                                    updateFilter('dateRange', { start, end });
                                    handleApply();
                                } catch (err) {
                                    console.error('Invalid end date:', endValue);
                                }
                            }}
                            className="px-3 py-2 bg-gk-bg border border-gk-header rounded text-sm text-white focus:outline-none focus:border-gk-accent"
                        />
                    </div>
                </div>

                {/* File Path */}
                <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                        <FileText className="w-3 h-3" />
                        File Path
                    </label>
                    <input
                        type="text"
                        placeholder="Filter by file path (e.g., src/components)"
                        value={localFilters.filePath || ''}
                        onChange={(e) => updateFilter('filePath', e.target.value || undefined)}
                        onBlur={handleApply}
                        className="w-full px-3 py-2 bg-gk-bg border border-gk-header rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gk-accent"
                    />
                </div>

                {/* Focus Mode */}
                <div className="pt-2 border-t border-gk-header">
                    <button
                        onClick={handleFocusModeToggle}
                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-colors ${
                            localFilters.focusMode
                                ? 'bg-gk-accent/20 border border-gk-accent text-gk-accent'
                                : 'bg-gk-bg border border-gk-header text-gray-400 hover:text-white'
                        }`}
                    >
                        <Focus className="w-4 h-4" />
                        <span className="text-sm font-medium">
                            {localFilters.focusMode ? 'Focus Mode: ON' : 'Focus Mode: OFF'}
                        </span>
                        <span className="text-xs ml-auto opacity-70">
                            {localFilters.focusMode ? 'Dim unrelated commits' : 'Show all commits'}
                        </span>
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-gk-header rounded-b-lg text-xs text-gray-500">
                <span>
                    {hasActiveFilters
                        ? 'Filters are active'
                        : 'No filters applied'}
                </span>
                <button
                    onClick={handleApply}
                    className="px-3 py-1.5 bg-gk-accent hover:bg-green-600 text-white text-xs font-medium rounded transition-colors"
                >
                    Apply Filters
                </button>
            </div>
        </div>
    );
};

// Helper function to filter commits based on filter state
export const filterCommits = (commits: Commit[], filters: GraphFilterState, selectedBranch?: string): Commit[] => {
    if (!filters.branch && !filters.author && !filters.dateRange && !filters.filePath && !filters.searchQuery) {
        return commits;
    }

    return commits.filter(commit => {
        // Search query filter
        if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase();
            const matchesSearch =
                commit.message?.toLowerCase().includes(query) ||
                commit.id?.toLowerCase().includes(query) ||
                commit.shortId?.toLowerCase().includes(query) ||
                commit.author?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
        }

        // Branch filter - show commits that are on the selected branch
        if (filters.branch && commit.branch !== filters.branch) {
            return false;
        }

        // Author filter
        if (filters.author && commit.author !== filters.author) {
            return false;
        }

        // Date range filter
        if (filters.dateRange && commit.timestamp) {
            const commitDate = new Date(commit.timestamp);
            if (commitDate < filters.dateRange.start || commitDate > filters.dateRange.end) {
                return false;
            }
        }

        // File path filter
        if (filters.filePath && commit.changes) {
            const hasMatchingFile = commit.changes.some(change =>
                change.filename?.includes(filters.filePath!)
            );
            if (!hasMatchingFile) return false;
        }

        return true;
    });
};

// Helper to determine if a commit should be dimmed in focus mode
export const shouldDimCommit = (commit: Commit, filters: GraphFilterState, selectedCommit?: Commit | null): boolean => {
    if (!filters.focusMode || !selectedCommit) return false;

    // In focus mode, dim commits that aren't ancestors or descendants of selected commit
    // This is a simplified implementation
    return commit.id !== selectedCommit.id;
};
