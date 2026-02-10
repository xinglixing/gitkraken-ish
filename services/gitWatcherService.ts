/**
 * Git File Watcher Service
 *
 * Replaces polling with native file system watching for better performance.
 * Watches key git files/directories for changes:
 * - .git/HEAD - branch checkout, commit
 * - .git/index - staging changes
 * - .git/refs/ - branch/tag changes
 * - .git/packed-refs - packed references
 * - .git/FETCH_HEAD - fetch operations
 * - .git/ORIG_HEAD - rebase/reset operations
 * - .git/logs/HEAD - reflog changes
 */

import { Repository } from '../types';

type ChangeType = 'head' | 'index' | 'refs' | 'fetch' | 'rebase';
type ChangeCallback = (type: ChangeType) => void;

interface FSWatcher {
    close: () => void;
}

interface WatcherState {
    watchers: FSWatcher[];
    debounceTimers: Map<ChangeType, NodeJS.Timeout>;
    lastHeadContent: string | null;
    lastIndexMtime: number | null;
    gitDir: string;
    fs: any;
    path: any;
}

const activeWatchers = new Map<string, WatcherState>();

// Debounce delay to batch rapid changes
const DEBOUNCE_MS = 250;

// Throttle to prevent too many events in succession
const THROTTLE_MS = 500;
const lastEventTime = new Map<string, number>();

/**
 * Resolve the actual .git directory (handles worktrees where .git is a file)
 */
const resolveGitDir = (repoPath: string, fs: any, path: any): string | null => {
    const gitPath = path.join(repoPath, '.git');

    try {
        const stat = fs.statSync(gitPath);

        if (stat.isDirectory()) {
            return gitPath;
        }

        // .git is a file (worktree) - read the actual gitdir path
        if (stat.isFile()) {
            const content = fs.readFileSync(gitPath, 'utf8').trim();
            const match = content.match(/^gitdir:\s*(.+)$/);
            if (match) {
                const gitdir = match[1];
                // Handle relative paths
                return path.isAbsolute(gitdir) ? gitdir : path.join(repoPath, gitdir);
            }
        }
    } catch (e) {
        // .git doesn't exist
    }

    return null;
};

/**
 * Start watching a repository for git changes
 */
export const startWatching = (
    repo: Repository,
    onChange: ChangeCallback
): (() => void) => {
    if (!repo.isLocal || typeof repo.handle !== 'string') {
        return () => {}; // No-op cleanup for non-local repos
    }

    const repoPath = repo.handle;

    // Check if already watching
    if (activeWatchers.has(repoPath)) {
        stopWatching(repo);
    }

    // Check if we're in Electron environment
    if (typeof window === 'undefined' || !(window as any).require) {
        console.warn('Git watcher requires Electron environment');
        return () => {};
    }

    const fs = (window as any).require('fs');
    const path = (window as any).require('path');

    // Resolve actual git directory (handles worktrees)
    const gitDir = resolveGitDir(repoPath, fs, path);
    if (!gitDir) {
        console.warn('Could not find .git directory for:', repoPath);
        return () => {};
    }

    const state: WatcherState = {
        watchers: [],
        debounceTimers: new Map(),
        lastHeadContent: null,
        lastIndexMtime: null,
        gitDir,
        fs,
        path,
    };

    // Throttled + debounced change handler
    const notifyChange = (type: ChangeType) => {
        const now = Date.now();
        const key = `${repoPath}:${type}`;
        const lastTime = lastEventTime.get(key) || 0;

        // Throttle: skip if we just fired this event type
        if (now - lastTime < THROTTLE_MS) {
            return;
        }

        // Clear existing debounce timer for this type
        const existingTimer = state.debounceTimers.get(type);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new debounce timer
        const timer = setTimeout(() => {
            state.debounceTimers.delete(type);
            lastEventTime.set(key, Date.now());
            onChange(type);
        }, DEBOUNCE_MS);

        state.debounceTimers.set(type, timer);
    };

    // Safe watcher creation with error handling
    const createWatcher = (
        filePath: string,
        options: { recursive?: boolean },
        handler: (eventType: string, filename?: string) => void
    ): FSWatcher | null => {
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            const watcher = fs.watch(filePath, { persistent: false, ...options }, handler);

            // Handle watcher errors (file deleted, etc.)
            watcher.on('error', (err: Error) => {
                console.warn(`Watcher error for ${filePath}:`, err.message);
                // Try to recover by recreating watcher after delay
                setTimeout(() => {
                    try {
                        watcher.close();
                    } catch (e) { /* ignore */ }

                    const newWatcher = createWatcher(filePath, options, handler);
                    if (newWatcher) {
                        const idx = state.watchers.indexOf(watcher);
                        if (idx >= 0) {
                            state.watchers[idx] = newWatcher;
                        } else {
                            state.watchers.push(newWatcher);
                        }
                    }
                }, 1000);
            });

            return watcher;
        } catch (e) {
            return null;
        }
    };

    // Read initial HEAD content for comparison
    try {
        state.lastHeadContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8');
    } catch (e) {
        // Ignore
    }

    // Read initial index mtime for comparison
    try {
        const indexStat = fs.statSync(path.join(gitDir, 'index'));
        state.lastIndexMtime = indexStat.mtimeMs;
    } catch (e) {
        // Ignore
    }

    // Watch .git/HEAD for branch changes and commits
    const headWatcher = createWatcher(
        path.join(gitDir, 'HEAD'),
        {},
        (eventType: string) => {
            if (eventType === 'change') {
                try {
                    const newContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8');
                    if (newContent !== state.lastHeadContent) {
                        state.lastHeadContent = newContent;
                        notifyChange('head');
                    }
                } catch (e) {
                    notifyChange('head');
                }
            }
        }
    );
    if (headWatcher) state.watchers.push(headWatcher);

    // Watch .git/index for staging changes (use mtime comparison to reduce false positives)
    const indexWatcher = createWatcher(
        path.join(gitDir, 'index'),
        {},
        (eventType: string) => {
            if (eventType === 'change') {
                try {
                    const stat = fs.statSync(path.join(gitDir, 'index'));
                    if (stat.mtimeMs !== state.lastIndexMtime) {
                        state.lastIndexMtime = stat.mtimeMs;
                        notifyChange('index');
                    }
                } catch (e) {
                    notifyChange('index');
                }
            }
        }
    );
    if (indexWatcher) state.watchers.push(indexWatcher);

    // Watch .git/refs directory for branch/tag changes
    const refsWatcher = createWatcher(
        path.join(gitDir, 'refs'),
        { recursive: true },
        () => notifyChange('refs')
    );
    if (refsWatcher) state.watchers.push(refsWatcher);

    // Watch .git/packed-refs for packed reference changes
    const packedRefsWatcher = createWatcher(
        path.join(gitDir, 'packed-refs'),
        {},
        () => notifyChange('refs')
    );
    if (packedRefsWatcher) state.watchers.push(packedRefsWatcher);

    // Watch .git/FETCH_HEAD for fetch operations
    const fetchHeadWatcher = createWatcher(
        path.join(gitDir, 'FETCH_HEAD'),
        {},
        () => notifyChange('fetch')
    );
    if (fetchHeadWatcher) state.watchers.push(fetchHeadWatcher);

    // Watch .git/ORIG_HEAD for rebase/reset operations
    const origHeadWatcher = createWatcher(
        path.join(gitDir, 'ORIG_HEAD'),
        {},
        () => notifyChange('rebase')
    );
    if (origHeadWatcher) state.watchers.push(origHeadWatcher);

    // Watch .git/logs/HEAD for reflog changes (catches more operations)
    const logsHeadWatcher = createWatcher(
        path.join(gitDir, 'logs', 'HEAD'),
        {},
        () => notifyChange('head')
    );
    if (logsHeadWatcher) state.watchers.push(logsHeadWatcher);

    activeWatchers.set(repoPath, state);

    // Return cleanup function
    return () => stopWatching(repo);
};

/**
 * Stop watching a repository
 */
export const stopWatching = (repo: Repository): void => {
    if (!repo.isLocal || typeof repo.handle !== 'string') return;

    const repoPath = repo.handle;
    const state = activeWatchers.get(repoPath);

    if (state) {
        // Clear all debounce timers
        state.debounceTimers.forEach(timer => clearTimeout(timer));
        state.debounceTimers.clear();

        // Close all watchers
        state.watchers.forEach(watcher => {
            try {
                watcher.close();
            } catch (e) {
                // Ignore close errors
            }
        });

        activeWatchers.delete(repoPath);
    }

    // Clean up throttle state
    for (const key of lastEventTime.keys()) {
        if (key.startsWith(repoPath + ':')) {
            lastEventTime.delete(key);
        }
    }
};

/**
 * Check if a repository is being watched
 */
export const isWatching = (repo: Repository): boolean => {
    if (!repo.isLocal || typeof repo.handle !== 'string') return false;
    return activeWatchers.has(repo.handle);
};

/**
 * Get count of active watchers for a repo (for debugging)
 */
export const getWatcherCount = (repo: Repository): number => {
    if (!repo.isLocal || typeof repo.handle !== 'string') return 0;
    const state = activeWatchers.get(repo.handle);
    return state?.watchers.length ?? 0;
};

/**
 * Stop all watchers (for cleanup on app exit)
 */
export const stopAllWatchers = (): void => {
    activeWatchers.forEach((state) => {
        state.debounceTimers.forEach(timer => clearTimeout(timer));
        state.watchers.forEach(watcher => {
            try {
                watcher.close();
            } catch (e) {
                // Ignore
            }
        });
    });
    activeWatchers.clear();
    lastEventTime.clear();
};
