import git from 'isomorphic-git';
import { Repository, Branch, Commit, FileChange, Stash } from '../types';
import { getGitConfig } from '../utils/platform';
import { logGitCommand } from './debugService';

// Platform-specific Git configuration
const platformGitConfig = getGitConfig();

// --- Performance Cache ---
// Cache for branch list to avoid re-fetching on every refresh
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    repoPath: string;
}

const branchCache: Map<string, CacheEntry<Branch[]>> = new Map();
const workingDirCache: Map<string, CacheEntry<FileChange[]>> = new Map();
const BRANCH_CACHE_TTL = 15000; // 15 seconds - increased for large repos
const WORKING_DIR_CACHE_TTL = 3000; // 3 seconds
const STATUS_MATRIX_CACHE_TTL = 2000; // 2 seconds - cache expensive statusMatrix calls

// Cache for statusMatrix results
const statusMatrixCache: Map<string, CacheEntry<[string, number, number, number][]>> = new Map();

export const clearRepoCache = (repoPath?: string) => {
    if (repoPath) {
        branchCache.delete(repoPath);
        workingDirCache.delete(repoPath);
        statusMatrixCache.delete(repoPath);
    } else {
        branchCache.clear();
        workingDirCache.clear();
        statusMatrixCache.clear();
    }
};

/**
 * Cached statusMatrix call - expensive operation that scans entire working directory
 * Caching this reduces CPU usage significantly for large repos
 */
const getCachedStatusMatrix = async (repo: Repository): Promise<[string, number, number, number][]> => {
    const { fs, dir } = getGitContext(repo);

    const cached = getCachedData(statusMatrixCache, dir, STATUS_MATRIX_CACHE_TTL);
    if (cached) return cached;

    const matrix = await git.statusMatrix({ fs, dir });
    setCachedData(statusMatrixCache, dir, matrix);
    return matrix;
};

const getCachedData = <T>(cache: Map<string, CacheEntry<T>>, repoPath: string, ttl: number): T | null => {
    const entry = cache.get(repoPath);
    if (entry && Date.now() - entry.timestamp < ttl && entry.repoPath === repoPath) {
        return entry.data;
    }
    return null;
};

const setCachedData = <T>(cache: Map<string, CacheEntry<T>>, repoPath: string, data: T): void => {
    cache.set(repoPath, { data, timestamp: Date.now(), repoPath });
};

// Detect Node/Electron environment once at module level
const isNodeEnv: boolean = (() => { try { require('child_process'); return true; } catch { return false; } })();

// Sanitize error messages to strip embedded tokens from URLs (e.g., https://token@github.com/...)
const sanitizeErrorMessage = (msg: string): string => {
    return msg.replace(/https:\/\/[^@\s]+@/g, 'https://***@');
};

/**
 * Safe git command execution using execFileSync (no shell injection).
 * All arguments are passed as an array, never interpolated into a shell string.
 */
const gitExec = (args: string[], cwd: string, options?: { stdio?: any }): string => {
    const { execFileSync } = require('child_process');
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: options?.stdio || 'pipe',
    });
};

/**
 * Run a git command with token-based authentication via GIT_ASKPASS env var.
 * This avoids embedding the token in the remote URL or .git/config.
 */
const gitExecWithToken = (args: string[], cwd: string, token: string): string => {
    const { execFileSync } = require('child_process');
    const path = require('path');
    const os = require('os');
    const fs2 = require('fs');

    // Create a temporary GIT_ASKPASS script that echoes the token
    const isWindows = process.platform === 'win32';
    const scriptExt = isWindows ? '.bat' : '.sh';
    const scriptPath = path.join(os.tmpdir(), `git-askpass-${Date.now()}${scriptExt}`);
    const scriptContent = isWindows
        ? `@echo off\necho ${token}\n`
        : `#!/bin/sh\necho "${token}"\n`;

    fs2.writeFileSync(scriptPath, scriptContent, { mode: 0o700 });

    try {
        return execFileSync('git', args, {
            cwd,
            encoding: 'utf-8',
            stdio: 'pipe',
            env: {
                ...process.env,
                GIT_ASKPASS: scriptPath,
                GIT_TERMINAL_PROMPT: '0',
            },
        });
    } finally {
        try { fs2.unlinkSync(scriptPath); } catch (e) { /* ignore cleanup errors */ }
    }
};

/**
 * Check if HEAD is a symbolic ref pointing to a branch.
 * Returns the branch name if symbolic, null if detached.
 */
const getSymbolicRef = async (fs: any, dir: string): Promise<string | null> => {
    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            const result = gitExec(['symbolic-ref', '--short', 'HEAD'], dir).trim();
            return result || null;
        } catch {
            return null;
        }
    }

    try {
        const branch = await git.currentBranch({ fs, dir, fullname: false });
        return branch || null;
    } catch {
        return null;
    }
};

/**
 * Git reset implementation using native git command.
 * isomorphic-git doesn't have a reset API, so we fall back to native git.
 */
const nativeGitReset = (dir: string, ref: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): void => {
    if (!isNodeEnv) {
        throw new Error('Git reset requires Electron environment');
    }
    const modeFlag = mode === 'soft' ? '--soft' : mode === 'hard' ? '--hard' : '--mixed';
    gitExec(['reset', modeFlag, ref], dir);
};

/**
 * Get git user configuration from the repository (local then global).
 * Returns the user.name and user.email from git config.
 */
export const getGitUserConfig = (repo: Repository): { name: string; email: string } | null => {
    const dir = repo.handle || repo.path || repo.localPath;
    if (!isNodeEnv || !dir) return null;

    try {
        const name = gitExec(['config', '--get', 'user.name'], dir).trim();
        const email = gitExec(['config', '--get', 'user.email'], dir).trim();

        if (name && email) {
            return { name, email };
        }
    } catch (e) {
        // Git config not set, try global
        try {
            const name = gitExec(['config', '--global', '--get', 'user.name'], dir).trim();
            const email = gitExec(['config', '--global', '--get', 'user.email'], dir).trim();

            if (name && email) {
                return { name, email };
            }
        } catch {
            // No global config either
        }
    }

    return null;
};

// Helper to get repository directory path
const getRepoPath = (repo: Repository | null): string | null => {
    if (!repo) return null;
    return repo.path || (typeof repo.handle === 'string' ? repo.handle : null);
};

const getGitContext = (repo: Repository) => {
    // Desktop app: handle must be a file path string
    if (typeof repo.handle !== 'string') {
        throw new Error("Invalid repository. Please open a repository from your file system.");
    }
    if (!(window as any).require) {
        throw new Error("This feature requires the Electron desktop app.");
    }
    const fs = (window as any).require('fs');
    const http = (window as any).require('isomorphic-git/http/node');
    return { fs, dir: repo.handle, http };
};

export const gitIsDirty = async (repo: Repository): Promise<boolean> => {
    try {
        const dir = getRepoPath(repo);

        // Use native git for submodules (where .git is a file, not a directory)
        if (isNodeEnv && dir) {
            try {
                const output = gitExec(['status', '--porcelain'], dir);
                return output.trim().length > 0;
            } catch (e) {
                return false;
            }
        }

        // Use cached statusMatrix for better performance on repeated checks
        const matrix = await getCachedStatusMatrix(repo);
        // row: [filepath, head, workdir, stage]
        return matrix.some(row => {
             // Ignore '.' directory entry if present
             if(row[0] === '.') return false;
             // Unstaged: workdir != stage
             // Staged: stage != head
             return row[2] !== row[3] || row[3] !== row[1];
        });
    } catch (e) {
        // console.error("Error checking git status:", e);
        return false;
    }
}

/**
 * Check if a specific submodule path is modified in the repo
 * Returns true if the submodule has uncommitted changes (new commit pointer)
 */
export const isSubmoduleModified = async (repo: Repository, submodulePath: string): Promise<boolean> => {
    if (!repo?.handle || !submodulePath) return false;

    try {
        if (isNodeEnv && typeof repo.handle === 'string') {
            // Use native git status to check submodule
            const status = gitExec(['status', '--porcelain', submodulePath], repo.handle);
            // If there's any output, the submodule is modified
            return status.trim().length > 0;
        }
        return false;
    } catch (e) {
        console.warn('Error checking submodule status:', e);
        return false;
    }
}

/**
 * Get submodule status details for display
 */
export const getSubmoduleStatus = async (repo: Repository, submodulePath: string): Promise<{
    modified: boolean;
    newCommits: number;
    currentSha?: string;
    trackedSha?: string;
}> => {
    if (!repo?.handle || !submodulePath) {
        return { modified: false, newCommits: 0 };
    }

    try {
        if (isNodeEnv && typeof repo.handle === 'string') {
            const path = require('path');
            const submoduleFullPath = path.join(repo.handle, submodulePath);

            // Get current commit in submodule
            let currentSha: string | undefined;
            try {
                currentSha = gitExec(['rev-parse', 'HEAD'], submoduleFullPath).trim();
            } catch {
                currentSha = undefined;
            }

            // Get tracked commit in parent
            let trackedSha: string | undefined;
            try {
                trackedSha = gitExec(['ls-tree', 'HEAD', submodulePath], repo.handle)
                    .split(/\s+/)[2]; // Format: mode type sha path
            } catch {
                trackedSha = undefined;
            }

            const modified = currentSha !== trackedSha;

            // Count new commits if modified
            let newCommits = 0;
            if (modified && currentSha && trackedSha) {
                try {
                    const count = gitExec(['rev-list', '--count', `${trackedSha}..${currentSha}`], submoduleFullPath);
                    newCommits = parseInt(count.trim(), 10) || 0;
                } catch {
                    newCommits = modified ? 1 : 0;
                }
            }

            return { modified, newCommits, currentSha, trackedSha };
        }
        return { modified: false, newCommits: 0 };
    } catch (e) {
        console.warn('Error getting submodule status:', e);
        return { modified: false, newCommits: 0 };
    }
}


/**
 * Pull changes from remote - uses native git in Electron for much better performance
 */
export const gitPull = async (
    repo: Repository,
    token: string | null,
    author?: { name: string, email: string },
    onProgress?: (message: string) => void,
    options?: { prune?: boolean }
): Promise<void> => {
    const { fs, dir } = getGitContext(repo);

    // Check if we're in a Node/Electron environment


    if (isNodeEnv && typeof dir === 'string') {
        // Check if repo has remotes configured
        try {
            const remotes = gitExec(['remote'], dir);
            if (!remotes.trim()) {
                throw new Error('NO_REMOTES_CONFIGURED: This repository has no remotes configured. Add a remote to pull from.');
            }
        } catch (e) {
            if (e.message && e.message.includes('NO_REMOTES_CONFIGURED')) throw e;
            throw new Error(`Failed to check remotes: ${e.message}`);
        }

        // Get current branch
        let branch = repo.default_branch;
        if (branch === 'HEAD') {
            try {
                branch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
            } catch {
                branch = 'main';
            }
        }

        try {
            onProgress?.('Fetching from remote...');
            const pullArgs = ['pull', '--no-rebase'];
            if (options?.prune) {
                // Fetch with prune first to clean up deleted remote branches
                onProgress?.('Pruning deleted remote branches...');
                if (token) {
                    gitExecWithToken(['fetch', '--prune', 'origin'], dir, token);
                } else {
                    gitExec(['fetch', '--prune', 'origin'], dir);
                }
            }
            pullArgs.push('origin', branch);
            if (token) {
                gitExecWithToken(pullArgs, dir, token);
            } else {
                gitExec(pullArgs, dir);
            }
            onProgress?.('Pull complete');
        } catch (error) {
            throw new Error(`Pull failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        // Fallback to isomorphic-git (browser mode)
        const remotes = await git.listRemotes({ fs, dir });
        if (!remotes || remotes.length === 0) {
            throw new Error('NO_REMOTES_CONFIGURED: This repository has no remotes configured. Add a remote to pull from.');
        }

        let branch = repo.default_branch;
        if (branch === 'HEAD') {
            try {
                branch = await getCurrentBranch(repo);
            } catch {
                branch = 'main';
            }
        }

        onProgress?.('Pulling...');
        try {
            await git.pull({
                fs,
                dir,
                http: (await import('isomorphic-git/http/web')).default,
                remote: 'origin',
                ref: branch,
                singleBranch: false,
                onAuth: () => token ? { username: token } : undefined,
                author: author || { name: 'GitKraken User', email: 'user@example.com' }
            });
        } catch (e) {
            if (e.message && e.message.includes('origin')) {
                throw new Error(`Pull failed: Could not find remote 'origin'.\n\nThis repository may not have a remote configured, or the remote name is not 'origin'.`);
            }
            throw e;
        }
    }
};

/**
 * Push changes to remote - uses native git in Electron for much better performance
 */
export const gitPush = async (
    repo: Repository,
    token: string | null,
    author?: { name: string, email: string },
    onProgress?: (message: string) => void
): Promise<void> => {
    const { dir } = getGitContext(repo);

    // Check if we're in a Node/Electron environment


    if (isNodeEnv && typeof dir === 'string') {
        // Check if repo has remotes configured
        try {
            const remotes = gitExec(['remote'], dir);
            if (!remotes.trim()) {
                throw new Error('NO_REMOTES_CONFIGURED: This repository has no remotes configured. Add a remote to push to.');
            }
        } catch (e) {
            if (e.message && e.message.includes('NO_REMOTES_CONFIGURED')) throw e;
            throw new Error(`Failed to check remotes: ${e.message}`);
        }

        // Get current branch
        let branch = repo.default_branch;
        if (branch === 'HEAD') {
            try {
                branch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
            } catch {
                branch = 'main';
            }
        }

        try {
            onProgress?.('Pushing to remote...');
            if (token) {
                gitExecWithToken(['push', 'origin', branch], dir, token);
            } else {
                gitExec(['push', 'origin', branch], dir);
            }
            onProgress?.('Push complete');
        } catch (error) {
            throw new Error(`Push failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        // Fallback to isomorphic-git (browser mode)
        const { fs, dir, http } = getGitContext(repo);
        const remotes = await git.listRemotes({ fs, dir });
        if (!remotes || remotes.length === 0) {
            throw new Error('NO_REMOTES_CONFIGURED: This repository has no remotes configured. Add a remote to push to.');
        }

        let branch = repo.default_branch;
        if (branch === 'HEAD') {
            try {
                branch = await getCurrentBranch(repo);
            } catch {
                branch = 'main';
            }
        }

        onProgress?.('Pushing...');
        try {
            await git.push({
                fs,
                http,
                dir,
                remote: 'origin',
                ref: branch,
                onAuth: () => token ? { username: token } : undefined
            });
        } catch (e) {
            if (e.message && e.message.includes('origin')) {
                throw new Error(`Push failed: Could not find remote 'origin'.\n\nThis repository may not have a remote configured, or the remote name is not 'origin'.`);
            }
            throw e;
        }
    }
};

export const createBranch = async (repo: Repository, branchName: string, oid?: string) => {
    const { fs, dir } = getGitContext(repo);

    // Validate branch name
    if (!branchName || branchName.trim() === '') {
        throw new Error('Branch name cannot be empty');
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9\-_\/]+$/.test(branchName)) {
        throw new Error('Branch name contains invalid characters');
    }

    // Check if branch name starts with a dot or contains consecutive dots
    if (branchName.startsWith('.') || /\.\./.test(branchName)) {
        throw new Error('Branch name cannot start with a dot or contain consecutive dots');
    }

    try {
        // Use native git in Node environment for better submodule support
        if (isNodeEnv && typeof dir === 'string') {
            const args = oid
                ? ['branch', branchName, oid]
                : ['branch', branchName];
            gitExec(args, dir);
        } else {
            // Fallback to isomorphic-git (browser mode)
            await git.branch({ fs, dir, ref: branchName, object: oid || undefined });
        }
        // Clear cache after branch creation
        clearRepoCache(dir);
    } catch (error) {
        // Provide more helpful error messages
        const errorMsg = error.stderr || error.message || '';
        if (errorMsg.includes('not allowed') || errorMsg.includes('user agent')) {
            throw new Error(
                'Branch creation requires full filesystem access. ' +
                'This operation may not be available in browser mode. ' +
                'Please use Electron desktop version or command line: git branch ' + branchName
            );
        }
        if (errorMsg.includes('already exists')) {
            throw new Error('Branch "' + branchName + '" already exists');
        }
        throw new Error(`Failed to create branch: ${sanitizeErrorMessage(errorMsg)}`);
    }
};

export const gitCheckout = async (repo: Repository, ref: string, force = false) => {
    const { fs, dir } = getGitContext(repo);

    // Check if we're in a Node/Electron environment


    if (isNodeEnv && typeof dir === 'string') {
        // Use native git for much faster checkout
        try {
            const args = force ? ['checkout', '-f', ref] : ['checkout', ref];
            gitExec(args, dir);
        } catch (error) {
            throw new Error(`Checkout failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        // Fallback to isomorphic-git (browser mode)
        await git.checkout({ fs, dir, ref, force });
    }

    // Clear cache after checkout (working dir will change)
    clearRepoCache(typeof dir === 'string' ? dir : undefined);
};

/**
 * Fast refresh that only updates what's necessary after branch switch
 * Returns only the new commits without expensive layout processing
 */
export const fastBranchRefresh = async (repo: Repository, branch: string = 'HEAD'): Promise<{ commits: Commit[]; branches: Branch[] }> => {
    const startTime = performance.now();

    // Run these in parallel
    const [commits, branches] = await Promise.all([
        fetchLocalCommits(repo, branch),
        fetchLocalBranches(repo)
    ]);

    return { commits, branches };
};

// Basic diff implementation (returns full content for side-by-side view)
export const gitGetFileContent = async (repo: Repository, ref: string, filepath: string): Promise<string> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Check if file is inside a submodule
            const { submodulePath, relativePath } = await getSubmodulePathForFile(repo, filepath);

            let fileDir = dir;
            let fileFilepath = filepath;

            if (submodulePath) {
                // File is in a submodule, run show from submodule directory
                const path = require('path');
                fileDir = path.join(dir, submodulePath);
                fileFilepath = relativePath;
            }

            const output = gitExec(['show', `${ref}:${fileFilepath}`], fileDir);
            return output;
        } catch (error: any) {
            return "";
        }
    }

    try {
        // Resolve symbolic refs (e.g. 'HEAD', branch names) to an OID
        let oid = ref;
        if (!/^[0-9a-f]{40}$/i.test(ref)) {
            oid = await git.resolveRef({ fs, dir, ref });
        }
        const { blob } = await git.readBlob({ fs, dir, oid, filepath });
        return new TextDecoder().decode(blob);
    } catch {
        return "";
    }
}

/**
 * SECURITY: Validate and normalize file path to prevent path traversal attacks.
 * Returns the safe absolute path, or throws an error if the path would escape the directory.
 */
const validateFilePath = (baseDir: string, filepath: string): string => {
    const path = require('path');
    const fullPath = path.resolve(baseDir, filepath);
    const resolvedBase = path.resolve(baseDir);

    // Ensure the resolved path is within the base directory
    if (!fullPath.startsWith(resolvedBase + path.sep) && fullPath !== resolvedBase) {
        throw new Error(`Path traversal attempt blocked: ${filepath}`);
    }
    return fullPath;
};

// Read a file from the working directory (on disk, not from git)
export const gitGetWorkingFileContent = async (repo: Repository, filepath: string): Promise<string> => {
    const { dir } = getGitContext(repo);
    try {
        const nodeFs = require('fs');
        if (typeof dir !== 'string') return "";

        // SECURITY: Validate path to prevent directory traversal
        const fullPath = validateFilePath(dir, filepath);
        return nodeFs.readFileSync(fullPath, 'utf8');
    } catch {
        return "";
    }
}

// Stage a file
export const gitStage = async (repo: Repository, filepath: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['add', filepath], dir);
        } catch (error: any) {
            throw new Error(`Failed to stage file: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        await git.add({ fs, dir, filepath });
    }

    // Clear working dir cache (staging changes status)
    workingDirCache.delete(typeof dir === 'string' ? dir : '');
}

// Write content to a file in the working directory
export const gitWriteFile = async (repo: Repository, filepath: string, content: string) => {
    const { fs, dir } = getGitContext(repo);
    if (typeof dir !== 'string') {
        throw new Error('Repository path not found');
    }

    // SECURITY: Validate path to prevent directory traversal
    const fullPath = validateFilePath(dir, filepath);
    await fs.promises.writeFile(fullPath, content, { encoding: 'utf8' });
    // Clear working dir cache (file content changed)
    workingDirCache.delete(dir);
}

// Unstage a file (Reset index to HEAD)
export const gitUnstage = async (repo: Repository, filepath: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Try to reset to HEAD first
            gitExec(['reset', 'HEAD', '--', filepath], dir);
        } catch {
            // If HEAD doesn't exist (empty repo), try to remove from index
            try {
                gitExec(['rm', '--cached', filepath], dir);
            } catch (e) {
                // Ignore errors
            }
        }
    } else {
        // If HEAD exists (repo has commits), reset index to HEAD
        // If empty repo, remove from index?
        try {
            await git.resetIndex({ fs, dir, filepath, ref: 'HEAD' });
        } catch {
            // Fallback for initial commit scenario where HEAD might not exist
            await git.remove({ fs, dir, filepath });
        }
    }

    // Clear working dir cache (staging changes status)
    workingDirCache.delete(typeof dir === 'string' ? dir : '');
}

// Commit staged changes
export const gitCommit = async (repo: Repository, message: string, user: { name: string, email: string }) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git in Node environment for better submodule support
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Set author info via environment variables for this command
            const env = {
                ...process.env,
                GIT_AUTHOR_NAME: user.name,
                GIT_AUTHOR_EMAIL: user.email,
                GIT_COMMITTER_NAME: user.name,
                GIT_COMMITTER_EMAIL: user.email,
            };
            const { execFileSync } = require('child_process');
            execFileSync('git', ['commit', '-m', message], {
                cwd: dir,
                encoding: 'utf-8',
                stdio: 'pipe',
                env,
            });
        } catch (error: any) {
            throw new Error(`Commit failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        // Fallback to isomorphic-git (browser mode)
        await git.commit({ fs, dir, message, author: user });
    }
    // Clear caches after commit (working dir and branches may change)
    clearRepoCache(typeof dir === 'string' ? dir : undefined);
}

export const gitInitGitflow = async (repo: Repository) => {
    const { fs, dir } = getGitContext(repo);
    // Create 'develop' from 'main' and checkout
    if (isNodeEnv && typeof dir === 'string') {
        gitExec(['checkout', '-b', 'develop'], dir);
    } else {
        await git.branch({ fs, dir, ref: 'develop', checkout: true });
    }
    clearRepoCache(typeof dir === 'string' ? dir : undefined);
}

/**
 * Stash uncommitted changes
 * Creates a stash branch with a commit containing current changes
 */
export const gitStash = async (repo: Repository, message: string, author?: { name: string, email: string }) => {
    const { fs, dir } = getGitContext(repo);

    // Check if we're in a Node environment (Electron)


    if (isNodeEnv && typeof dir === 'string') {
        // Use native git for better stashing support
        try {
            // First check if there are any changes to stash
            const status = gitExec(['status', '--porcelain'], dir);

            if (!status.trim()) {
                throw new Error('No changes to stash');
            }

            // Check if there are only untracked files
            const hasTrackedChanges = status.split('\n').some(line => line && !line.startsWith('??'));
            if (!hasTrackedChanges) {
                throw new Error('Cannot stash untracked files. Please stage them first with git add, or commit them directly.');
            }

            const stashMessage = message || `WIP on ${await getCurrentBranch(repo)}`;
            gitExec(['stash', 'push', '-m', stashMessage], dir);

            return;
        } catch (error) {
            throw new Error(`Stash failed: ${error.stderr || error.stdout || error.message}`);
        }
    }

    // Fallback for browser/isomorphic-git: Create stash branch
    const timestamp = Date.now();
    const stashBranch = `stash-${timestamp}`;
    const stashMessage = message || `WIP on ${await getCurrentBranch(repo)}`;

    // Get current HEAD
    const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });

    // Create stash branch
    await git.branch({ fs, dir, ref: stashBranch });

    // Stage and commit changes
    try {
        await git.commit({
            fs,
            dir,
            message: `STASH: ${stashMessage}\n\nStashed at: ${new Date().toISOString()}`,
            author: author || { name: 'Stash', email: 'stash@local' }
        });
    } catch (e) {
        // No changes to stash
        await git.deleteBranch({ fs, dir, ref: stashBranch });
        throw new Error('No changes to stash');
    }

    // Reset working directory to HEAD
    await git.checkout({ fs, dir, ref: headOid, force: true });
}

/**
 * List all stashes
 */
export const fetchStashes = async (repo: Repository): Promise<Stash[]> => {
    const { fs, dir } = getGitContext(repo);

    // Get current branch once to reuse
    const currentBranch = await getCurrentBranch(repo);

    // Check if we're in a Node environment


    if (isNodeEnv && typeof dir === 'string') {
        // Use native git stash list
        try {
            const output = gitExec(['stash', 'list'], dir);
            const lines = output.trim().split('\n').filter(l => l);

            const stashes = lines.map((line, index) => {
                // Format: stash@{n}: message
                const match = line.match(/^stash@\{(\d+)\}:\s+(.+)$/);
                if (!match) return null;

                const [, indexStr, message] = match;
                const stashRef = `stash@{${indexStr}}`;

                try {
                    // Get commit info
                    const commitOutput = gitExec(['log', '-1', '--format=%H,%ai', stashRef], dir);
                    const [commitId, date] = commitOutput.trim().split(',');

                    return {
                        id: stashRef,
                        message: message.trim(),
                        branch: currentBranch,
                        commitId: commitId,
                        date: date
                    };
                } catch (e) {
                    return {
                        id: stashRef,
                        message: message.trim(),
                        branch: currentBranch,
                        commitId: '',
                        date: new Date().toISOString()
                    };
                }
            }).filter((s): s is Stash => s !== null)
              .filter(s => !s.message.includes('gk-snapshot:'));

            return stashes;
        } catch (e) {
            console.error('Failed to fetch stashes:', e);
            return [];
        }
    }

    // Fallback for browser/isomorphic-git: List stash branches
    const branches = await fetchLocalBranches(repo);
    const stashBranches = branches.filter(b => b.name.startsWith('stash-'));

    return stashBranches.map(b => ({
        id: b.name,
        message: b.name.replace('stash-', ''),
        branch: currentBranch,
        commitId: b.commitId,
        date: new Date().toISOString()
    }));
}

/**
 * Stash a single file's unstaged changes
 */
export const gitStashFile = async (repo: Repository, filepath: string, message?: string) => {
    const { dir } = getGitContext(repo);
    if (isNodeEnv && typeof dir === 'string') {
        const stashMessage = message || `WIP: ${filepath}`;
        gitExec(['stash', 'push', '-m', stashMessage, '--', filepath], dir);
    } else {
        throw new Error('Per-file stash is only supported in desktop mode.');
    }
}

/**
 * Apply a stash (keep stash in list)
 */
export const gitStashApply = async (repo: Repository, stashId: string) => {
    const { fs, dir } = getGitContext(repo);



    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['stash', 'apply', stashId], dir);
            return;
        } catch (error) {
            throw new Error(`Stash apply failed: ${error.stderr || error.stdout || error.message}`);
        }
    }

    // Fallback for isomorphic-git
    if (stashId.startsWith('stash-')) {
        // Merge the stash branch into current HEAD
        const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
        await git.merge({ fs, dir, theirs: stashId, ours: 'HEAD' });
    }
}

/**
 * Pop a stash (apply and remove from list)
 */
export const gitStashPop = async (repo: Repository, stashId: string) => {
    const { fs, dir } = getGitContext(repo);



    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['stash', 'pop', stashId], dir);
            return;
        } catch (error) {
            throw new Error(`Stash pop failed: ${error.stderr || error.stdout || error.message}`);
        }
    }

    // Fallback for isomorphic-git
    await gitStashApply(repo, stashId);
    await gitStashDrop(repo, stashId);
}

/**
 * Drop a stash (remove without applying)
 */
export const gitStashDrop = async (repo: Repository, stashId: string) => {
    const { fs, dir } = getGitContext(repo);



    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['stash', 'drop', stashId], dir);
            return;
        } catch (error) {
            throw new Error(`Stash drop failed: ${error.stderr || error.stdout || error.message}`);
        }
    }

    // Fallback for isomorphic-git
    if (stashId.startsWith('stash-')) {
        await git.deleteBranch({ fs, dir, ref: stashId });
    }
}

/**
 * Helper: Get current branch name
 */
export async function getCurrentBranch(repo: Repository): Promise<string> {
    try {
        const { fs, dir } = getGitContext(repo);



        if (isNodeEnv && typeof dir === 'string') {
            try {
                return gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
            } catch (e) {
                return 'HEAD';
            }
        }

        // Try to get current branch name
        try {
            const branch = await getSymbolicRef(fs, dir);
            return branch || 'HEAD';
        } catch (e) {
            return 'HEAD';
        }
    } catch (e) {
        return 'HEAD';
    }
}

/**
 * Squash multiple commits into one
 * Takes an array of commit IDs to squash (must be consecutive)
 * Creates a new commit with combined message
 */
export const gitSquashCommits = async (
    repo: Repository,
    commitIds: string[],
    newMessage: string,
    author?: { name: string, email: string }
) => {
    const { fs, dir } = getGitContext(repo);

    if (commitIds.length < 2) {
        throw new Error('Need at least 2 commits to squash');
    }

    // Check if we're in a Node environment


    if (isNodeEnv && typeof dir === 'string') {
        // Use native git for better squash support
        try {
            // Get the parent of the oldest commit to squash
            const oldestCommit = commitIds[commitIds.length - 1];
            const parentOutput = gitExec(['rev-parse', `${oldestCommit}^@`], dir);
            const parentCommit = parentOutput.trim();

            // Soft reset to the parent (keeps all changes staged)
            gitExec(['reset', '--soft', parentCommit], dir);

            // Create new commit with combined message
            if (author) {
                gitExec(['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-m', newMessage], dir);
            } else {
                gitExec(['commit', '-m', newMessage], dir);
            }

            return;
        } catch (error) {
            throw new Error(`Squash failed: ${error.stderr || error.stdout || error.message}`);
        }
    }

    // Fallback for isomorphic-git
    try {
        // Get the parent of the oldest commit
        const oldestCommit = commitIds[commitIds.length - 1];
        const oldestCommitObj = await git.readCommit({ fs, dir, oid: oldestCommit });
        const parentCommit = oldestCommitObj.commit.parent[0];

        if (!parentCommit) {
            throw new Error('Cannot squash root commit');
        }

        // Reset to parent (soft reset keeps changes)
        nativeGitReset(dir, parentCommit, 'soft');

        // Create new squashed commit
        await git.commit({
            fs,
            dir,
            message: newMessage,
            author: author || {
                name: 'User',
                email: 'user@example.com',
                timestamp: Date.now() / 1000
            }
        });
    } catch (error) {
        throw new Error(`Squash failed: ${error.message}`);
    }
}

export const gitStatus = async (repo: Repository): Promise<string> => {
    const dir = getRepoPath(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && dir) {
        try {
            const output = gitExec(['status', '--porcelain'], dir);
            if (!output.trim()) return "Working tree clean";
            return output.trim();
        } catch (e) {
            return "Failed to get status";
        }
    }

    // Use cached statusMatrix for better performance (fallback for browser)
    const status = await getCachedStatusMatrix(repo);
    const changed = status.filter(row => row[1] !== row[2] || row[1] !== row[3]);
    if (changed.length === 0) return "Working tree clean";
    return changed.map(row => `${row[0]}: [${row[1]}, ${row[2]}, ${row[3]}]`).join('\n');
};

export const gitListFiles = async (repo: Repository, path: string = '.'): Promise<string[]> => {
    const dir = getRepoPath(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && dir) {
        try {
            const targetPath = path === '.' ? dir : require('path').join(dir, path);
            const nodeFs = require('fs');
            const files = nodeFs.readdirSync(targetPath);
            return files as string[];
        } catch (e: any) {
            throw new Error(e.message || "Failed to list files");
        }
    }

    const { fs, dir: gitDir } = getGitContext(repo);
    try {
        const files = await fs.readdir(path === '.' ? gitDir : path);
        return files as string[];
    } catch (e: any) {
        throw new Error(e.message || "Failed to list files");
    }
};

// Returns split of staged vs unstaged files
/**
 * Native git implementation for fetching working dir status - needed for submodules
 * where .git is a file pointing to the parent's .git/modules/ directory.
 */
const fetchWorkingDirNative = (dir: string): FileChange[] => {
    try {
        // Use git status --porcelain to get working dir status
        // --ignore-submodules=none ensures submodule changes are shown
        const output = gitExec(['status', '--porcelain', '-uall', '--ignore-submodules=none'], dir);
        const lines = output.trim().split('\n').filter(Boolean);

        const results: FileChange[] = [];

        for (const line of lines) {
            if (line.length < 3) continue;

            // Porcelain format: XY PATH or XY ORIG_PATH -> PATH (for renames)
            // X = staged status, Y = unstaged status, then a space, then the path
            const staged = line[0];
            const unstaged = line[1];
            // Find the path starting after XY and the separator space
            // Some git versions may have different spacing, so find first non-space after position 2
            let pathStart = 2;
            while (pathStart < line.length && line[pathStart] === ' ') {
                pathStart++;
            }
            const path = line.substring(pathStart).trim();

            // Handle rename case: XY ORIG_PATH -> PATH
            let filename = path;
            if (path.includes(' -> ')) {
                const parts = path.split(' -> ');
                filename = parts[parts.length - 1].trim();
            }

            // Map status codes
            const mapStatus = (code: string): FileChange['status'] => {
                switch (code) {
                    case 'A': return 'added';
                    case 'D': return 'deleted';
                    case 'R': return 'renamed';
                    case 'M': return 'modified';
                    case 'S': return 'modified'; // Submodule change (commit modified)
                    case 'U': return 'conflicted'; // Submodule conflict
                    case '?': return 'added'; // Untracked
                    default: return 'modified';
                }
            };

            // Staged changes (first column)
            if (staged !== ' ' && staged !== '?') {
                results.push({
                    filename,
                    status: mapStatus(staged),
                    staged: true,
                    additions: 0,
                    deletions: 0
                });
            }

            // Unstaged changes (second column)
            if (unstaged !== ' ') {
                results.push({
                    filename,
                    status: mapStatus(unstaged),
                    staged: false,
                    additions: 0,
                    deletions: 0
                });
            }
        }

        return results;
    } catch (e) {
        console.error('Error in native working dir fetch:', e);
        return [];
    }
};

export const fetchWorkingDir = async (repo: Repository, bypassCache = false): Promise<FileChange[]> => {
    try {
        const { fs, dir } = getGitContext(repo);

        // Check cache first (unless bypassed)
        if (!bypassCache) {
            const cached = getCachedData(workingDirCache, dir, WORKING_DIR_CACHE_TTL);
            if (cached) return cached;
        }

        // Use native git for submodules (where .git is a file, not a directory)
        if (isNodeEnv && typeof dir === 'string') {
            const results = fetchWorkingDirNative(dir);
            setCachedData(workingDirCache, dir, results);
            return results;
        }

        // Use fresh statusMatrix but also update the statusMatrix cache
        const matrix = await git.statusMatrix({ fs, dir });
        setCachedData(statusMatrixCache, dir, matrix); // Update statusMatrix cache

        // Matrix: [filepath, head, workdir, stage]
        // 0: absent, 1: unchanged, 2: modified

        const results: FileChange[] = [];

        for (const [filepath, head, workdir, stage] of matrix) {
            if (filepath === '.') continue;

            // Unstaged changes (Workdir != Stage)
            if (workdir !== stage) {
                results.push({
                    filename: filepath,
                    status: head === 0 && stage === 0 ? 'added' : workdir === 0 ? 'deleted' : 'modified',
                    staged: false,
                    additions: 0,
                    deletions: 0
                });
            }

            // Staged changes (Stage != Head)
            if (stage !== head) {
                results.push({
                    filename: filepath,
                    status: head === 0 ? 'added' : stage === 0 ? 'deleted' : 'modified',
                    staged: true,
                    additions: 0,
                    deletions: 0
                });
            }
        }

        // Cache the results
        setCachedData(workingDirCache, dir, results);

        return results;
    } catch (e) {
        return [];
    }
}


export const gitCherryPick = async (repo: Repository, commit: Commit) => {
    const { fs, dir } = getGitContext(repo);

    // Check if we're in a Node/Electron environment
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Check if there's already a cherry-pick in progress
            try {
                gitExec(['rev-parse', '--verify', 'CHERRY_PICK_HEAD'], dir);
                // CHERRY_PICK_HEAD exists - there's already a cherry-pick in progress
                throw new Error(`CHERRY_PICK_IN_PROGRESS: A cherry-pick is already in progress. Please resolve or abort it before starting a new one.`);
            } catch (e: any) {
                // If the error is our own error, re-throw it
                if (e.message && e.message.includes('CHERRY_PICK_IN_PROGRESS')) {
                    throw e;
                }
                // Otherwise, no cherry-pick in progress - good to proceed
            }

            gitExec(['cherry-pick', commit.id], dir);
        } catch (error: any) {
            const errorMsg = error.stderr || error.stdout || error.message || '';

            // Check for empty cherry-pick (changes already applied)
            if (errorMsg.includes('empty') || errorMsg.includes('The previous cherry-pick is now empty')) {
                // Abort the empty cherry-pick
                try {
                    gitExec(['cherry-pick', '--abort'], dir);
                } catch (abortError) {
                    // Ignore abort errors
                }
                throw new Error(`The changes from commit ${commit.id.substring(0, 7)} are already present in the current branch. Nothing to cherry-pick.`);
            }

            // Check for merge conflicts
            if (errorMsg.includes('could not apply') ||
                errorMsg.includes('conflict') ||
                errorMsg.includes('CONFLICT')) {
                throw new Error(
                    `Merge conflict when cherry-picking commit ${commit.id.substring(0, 7)}.\n\n` +
                    `The commit conflicts with changes in your current branch.\n\n` +
                    `Options:\n` +
                    `1. Resolve conflicts manually, then run "git cherry-pick --continue"\n` +
                    `2. Abort with "git cherry-pick --abort" to cancel\n` +
                    `3. Skip this commit with "git cherry-pick --skip"`
                );
            }

            // Check if there's already a cherry-pick/rebase/merge in progress
            if (errorMsg.includes('.git/index.lock') || errorMsg.includes('Unable to create')) {
                throw new Error(`Another git operation is in progress. Please wait for it to complete or check for stale lock files.`);
            }

            // Show clean error without full git output
            const shortError = errorMsg.split('\n')[0] || 'Unknown error';
            throw new Error(`Cherry-pick failed: ${shortError}`);
        }
    } else {
        throw new Error('Cherry-pick is only supported in Electron/desktop mode. Please use the command line: git cherry-pick ' + commit.id);
    }
};

export const gitCherryPickMultiple = async (repo: Repository, commits: Commit[]) => {
    const { fs, dir } = getGitContext(repo);

    if (isNodeEnv && typeof dir === 'string') {
        const ids = commits.map(c => c.id);

        try {
            // Check if there's already a cherry-pick in progress
            try {
                gitExec(['rev-parse', '--verify', 'CHERRY_PICK_HEAD'], dir);
                throw new Error(`CHERRY_PICK_IN_PROGRESS: A cherry-pick is already in progress. Please resolve or abort it before starting a new one.`);
            } catch (e: any) {
                if (e.message && e.message.includes('CHERRY_PICK_IN_PROGRESS')) {
                    throw e;
                }
            }

            gitExec(['cherry-pick', ...ids], dir);
        } catch (error: any) {
            const errorMsg = error.stderr || error.stdout || error.message || '';

            // Check for empty cherry-pick
            if (errorMsg.includes('empty') || errorMsg.includes('The previous cherry-pick is now empty')) {
                try {
                    gitExec(['cherry-pick', '--abort'], dir);
                } catch (abortError) {
                    // Ignore
                }
                throw new Error(`One or more commits have changes that are already present in the current branch.`);
            }

            // Check for merge conflicts
            if (errorMsg.includes('could not apply') ||
                errorMsg.includes('conflict') ||
                errorMsg.includes('CONFLICT')) {
                throw new Error(
                    `Merge conflict during cherry-pick.\n\n` +
                    `One or more commits conflict with changes in your current branch.\n\n` +
                    `Options:\n` +
                    `1. Resolve conflicts manually, then run "git cherry-pick --continue"\n` +
                    `2. Abort with "git cherry-pick --abort" to cancel\n` +
                    `3. Skip the conflicting commit with "git cherry-pick --skip"`
                );
            }

            // Show clean error without full git output
            const shortError = errorMsg.split('\n')[0] || 'Unknown error';
            throw new Error(`Cherry-pick failed: ${shortError}`);
        }
    } else {
        throw new Error('Cherry-pick is only supported in Electron/desktop mode.');
    }
};

/**
 * Native git implementation for fetching branches - needed for submodules
 * where .git is a file pointing to the parent's .git/modules/ directory.
 * isomorphic-git doesn't handle this case correctly.
 */
const fetchLocalBranchesNative = (dir: string, repo: Repository): Branch[] => {
    const branchObjects: Branch[] = [];

    try {
        // Get current branch
        let currentHeadBranch: string | null = null;
        try {
            currentHeadBranch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
            if (currentHeadBranch === 'HEAD') {
                currentHeadBranch = null;
            }
        } catch (e) {
            // Couldn't determine current branch
        }

        // Check if HEAD is detached
        let isDetached = false;
        try {
            const symbolicRef = gitExec(['symbolic-ref', '--short', 'HEAD'], dir).trim();
            if (!symbolicRef) {
                isDetached = true;
            }
        } catch {
            isDetached = true;
        }

        // Add detached HEAD if needed
        if (isDetached) {
            try {
                const headSha = gitExec(['rev-parse', 'HEAD'], dir).trim();
                branchObjects.push({
                    name: 'HEAD',
                    commitId: headSha,
                    isRemote: false,
                    active: true
                });
            } catch (e2) {
                // Can't resolve HEAD, skip it
            }
        }

        // List all local branches
        let branchOutput: string;
        try {
            branchOutput = gitExec(['branch', '--list', '--format=%(refname:short)'], dir);
        } catch (e) {
            branchOutput = '';
        }

        const branches = branchOutput
            .trim()
            .split('\n')
            .filter(b => b.trim() && !b.startsWith('remotes/') && !b.startsWith('origin/'));

        // Resolve each branch's SHA
        for (const branchName of branches) {
            try {
                const sha = gitExec(['rev-parse', branchName], dir).trim();
                branchObjects.push({
                    name: branchName,
                    commitId: sha,
                    isRemote: false,
                    active: branchName === currentHeadBranch
                });
            } catch (e) {
                console.warn(`Could not resolve branch "${branchName}":`, e);
            }
        }

        // Cache the results
        setCachedData(branchCache, dir, branchObjects);

        return branchObjects;
    } catch (e) {
        console.error('Error in native branch fetch:', e);
        return [];
    }
};

export const fetchLocalBranches = async (repo: Repository, bypassCache = false): Promise<Branch[]> => {
    const { fs, dir } = getGitContext(repo);
    try {
        // Check cache first (unless bypassed) - but always check for active branch changes
        if (!bypassCache) {
            const cached = getCachedData(branchCache, dir, BRANCH_CACHE_TTL);
            if (cached) {
                // Update active branch status in cached data
                try {
                    const currentHeadBranch = await getCurrentBranch(repo);
                    return cached.map(b => ({
                        ...b,
                        active: b.name === currentHeadBranch || (b.name === 'HEAD' && currentHeadBranch === 'HEAD')
                    }));
                } catch {
                    return cached;
                }
            }
        }

        // Use native git for submodules (where .git is a file, not a directory)
        if (isNodeEnv && typeof dir === 'string') {
            return fetchLocalBranchesNative(dir, repo);
        }

        const branches = await git.listBranches({ fs, dir });
        const branchObjects: Branch[] = [];

        // Get current HEAD to mark active branch
        let currentHeadBranch: string | null = null;
        try {
            currentHeadBranch = await getCurrentBranch(repo);
        } catch (e) {
            // Couldn't determine current branch
        }

        // Add HEAD at the beginning if it's not a symbolic ref to a branch
        const headBranch = await getSymbolicRef(fs, dir);
        if (!headBranch) {
            // HEAD is detached, add it to the list
            try {
                const headSha = await git.resolveRef({ fs, dir, ref: 'HEAD' });
                branchObjects.push({
                    name: 'HEAD',
                    commitId: headSha,
                    isRemote: false,
                    active: true
                });
            } catch (e2) {
                // Can't resolve HEAD, skip it
            }
        }

        // Filter local branches (exclude remote tracking branches like remotes/origin/xxx)
        // but allow Gitflow branches like feature/*, release/*, hotfix/*
        const localBranches = branches.filter(b =>
            !b.startsWith('remotes/') && !b.startsWith('origin/')
        );

        // Resolve all branches in parallel for better performance
        const resolvedBranches = await Promise.all(
            localBranches.map(async (b) => {
                try {
                    const sha = await git.resolveRef({ fs, dir, ref: b });
                    return {
                        name: b,
                        commitId: sha,
                        isRemote: false,
                        active: b === currentHeadBranch
                    };
                } catch (e) {
                    // Branch doesn't exist or can't be resolved, skip it
                    console.warn(`Could not resolve branch "${b}":`, e);
                    return null;
                }
            })
        );

        // Filter out null results and add to branchObjects
        const validBranches = resolvedBranches.filter((b): b is NonNullable<typeof b> => b !== null);
        branchObjects.push(...validBranches as Branch[]);

        // Cache the results
        setCachedData(branchCache, dir, branchObjects);

        return branchObjects;
    } catch (e) {
        console.error('Error fetching local branches:', e);
        return [];
    }
};

/**
 * Native git implementation for fetching commits - needed for submodules
 * where .git is a file pointing to the parent's .git/modules/ directory.
 */
const fetchLocalCommitsNative = (
    dir: string,
    branch: string = 'HEAD',
    skip: number = 0,
    limit: number = 20,
    lastOid?: string
): Commit[] => {
    try {
        let output: string;

        if (skip > 0 && lastOid) {
            // Pagination: skip commits until after lastOid, then get limit commits
            // First, get all commits up to skip + limit from lastOid
            const fetchDepth = skip + limit + 1;
            output = gitExec(
                ['log', lastOid, '--format=%H|%s|%an|%ai|%P', '--max-count=' + fetchDepth],
                dir
            );
            const lines = output.trim().split('\n').filter(Boolean);
            // Skip the first commit (lastOid itself) and then take 'limit' commits from position 'skip'
            const skipLines = lines.slice(1); // Remove lastOid itself
            const pageLines = skipLines.slice(skip, skip + limit);
            output = pageLines.join('\n');
        } else {
            const format = '%H|%s|%an|%ai|%P';
            const maxCount = skip + limit;
            output = gitExec(
                ['log', branch, '--format=' + format, '--max-count=' + maxCount, '--skip=' + skip],
                dir
            );
        }

        const lines = output.trim().split('\n').filter(Boolean);

        return lines.map((line) => {
            const parts = line.split('|');
            const [sha, message, author, dateStr, parentsStr] = parts;
            const parents = parentsStr ? parentsStr.split(' ').filter(Boolean) : [];

            return {
                id: sha,
                shortId: sha.substring(0, 7),
                message: message || '',
                author: author || '',
                date: new Date(dateStr).toISOString(),
                parents: parents,
                lane: 0,
                color: '#888',
                changes: [],
                treeId: ''
            };
        });
    } catch (e) {
        console.error('Error in native commit fetch:', e);
        return [];
    }
};

export const fetchLocalCommits = async (
    repo: Repository,
    branch: string = 'HEAD',
    skip: number = 0,
    limit: number = 20,
    lastOid?: string
): Promise<Commit[]> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        return fetchLocalCommitsNative(dir, branch, skip, limit, lastOid);
    }

    try {
        // For local repos, first try to resolve HEAD to get the actual branch
        let ref = branch;
        if (branch === 'HEAD') {
            try {
                const currentBranch = await getCurrentBranch(repo);
                ref = currentBranch === 'HEAD' ? 'HEAD' : currentBranch;
            } catch (e) {
                console.warn('Could not resolve current branch, using HEAD:', e);
                ref = 'HEAD';
            }
        }

        let pageCommits;
        if (skip > 0 && lastOid) {
            // Efficient pagination: start from the last known OID instead of re-fetching everything
            // Fetch limit + 1 because the first result is the lastOid commit itself (already shown)
            const commits = await git.log({ fs, dir, ref: lastOid, depth: limit + 1 });
            pageCommits = commits.slice(1); // Skip the lastOid commit itself
        } else {
            const fetchDepth = skip + limit + 5;
            const commits = await git.log({ fs, dir, ref, depth: fetchDepth });
            pageCommits = commits.slice(skip, skip + limit);
        }

        // Synchronous mapping - no async operations needed here
        return pageCommits.map((c) => {
            const { commit } = c;
            return {
                id: c.oid,
                shortId: c.oid.substring(0, 7),
                message: commit.message.split('\n')[0],
                author: commit.author.name,
                date: new Date(commit.author.timestamp * 1000).toISOString(), // Store as ISO string for proper parsing
                parents: commit.parent,
                lane: 0,
                color: '#888',
                changes: [],
                treeId: commit.tree  // Include tree SHA for detecting identical commits
            };
        });
    } catch (e) {
        console.error('Error fetching local commits:', e);

        // Handle empty repos (just initialized, no commits yet)
        // Return empty array instead of throwing
        if (e.message && (
            e.message.includes('Could not find') ||
            e.message.includes('NotFoundError') ||
            e.message.includes('resolve ref') ||
            e.message.includes('refs/heads/')
        )) {
            console.debug('Repository appears to be empty (no commits yet)');
            return [];
        }

        // Provide better error message for common issues
        if (e.message && e.message.includes('not found')) {
            throw new Error(`Could not find branch or commit "${branch}". This might not be a valid Git repository.`);
        }
        if (e.message && e.message.includes('permission') || e.message && e.message.includes('EACCES')) {
            throw new Error(`Permission denied accessing ${dir}. Please check file permissions.`);
        }
        if (e.message && e.message.includes('origin')) {
            throw new Error(`Git operation failed: ${e.message}\n\nNote: This appears to be a local repository without remotes. Try using 'HEAD' or the actual branch name instead of 'origin/master'.`);
        }
        throw e;
    }
};

/**
 * Check if there are more commits available
 */
export const hasMoreCommits = async (
    repo: Repository,
    branch: string = 'HEAD',
    currentCount: number
): Promise<boolean> => {
    const { fs, dir } = getGitContext(repo);
    try {
        let ref = branch;
        if (branch === 'HEAD') {
            try {
                const currentBranch = await getCurrentBranch(repo);
                ref = currentBranch === 'HEAD' ? 'HEAD' : currentBranch;
            } catch (e) {
                ref = 'HEAD';
            }
        }

        // Use native git for submodules (where .git is a file, not a directory)
        if (isNodeEnv && typeof dir === 'string') {
            try {
                const output = gitExec(
                    ['log', ref, '--format=%H', '--max-count=' + (currentCount + 1)],
                    dir
                );
                const commits = output.trim().split('\n').filter(Boolean);
                return commits.length > currentCount;
            } catch (e) {
                return false;
            }
        }

        // Fetch one more than current count to check if there's more
        const commits = await git.log({ fs, dir, ref, depth: currentCount + 1 });
        return commits.length > currentCount;
    } catch (e) {
        return false;
    }
};

export const fetchLocalCommitDetails = async (repo: Repository, commit: Commit): Promise<Commit> => {
    const { fs, dir } = getGitContext(repo);
    const oid = commit.id;
    const parentOid = commit.parents[0];
    if (!parentOid) return commit;

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        return fetchLocalCommitDetailsNative(dir, commit);
    }

    const files: FileChange[] = [];
    try {
        await git.walk({
            fs,
            dir,
            trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: oid })],
            map: async (filepath, [A, B]) => {
                if (filepath === '.') return;
                const typeA = await A?.type();
                const typeB = await B?.type();
                if (typeA === 'tree' || typeB === 'tree') return;
                const oidA = await A?.oid();
                const oidB = await B?.oid();

                if (oidA !== oidB) {
                    let status: FileChange['status'] = 'modified';
                    let patch = '';
                    if (!oidA) status = 'added';
                    else if (!oidB) status = 'deleted';

                    try {
                        if (status !== 'deleted' && oidB) {
                            const { blob } = await git.readBlob({ fs, dir, oid: oidB });
                            const text = new TextDecoder().decode(blob);
                            const snippet = text.substring(0, 2000);
                            patch = `[NEW CONTENT START]\n${snippet}\n[NEW CONTENT END]`;
                        } else if (status === 'deleted' && oidA) {
                            patch = `[FILE DELETED]`;
                        }
                    } catch (e) {
                        patch = `[BINARY OR UNREADABLE]`;
                    }

                    files.push({
                        filename: filepath,
                        status,
                        staged: false,
                        additions: 0,
                        deletions: 0,
                        patch: patch
                    });
                }
            }
        });
    } catch(e) {
        // Handle NotFoundError gracefully - this is expected for shallow clones,
        // garbage collected objects, or partial fetches from remote
        const error = e as Error;
        if (error.name === 'NotFoundError' || error.message?.includes('Could not find')) {
            console.debug("Commit details unavailable (shallow clone or missing objects):", oid);
            return { ...commit, changes: [], detailsUnavailable: true } as Commit;
        }
        console.error("Failed to walk details", e);
    }

    return { ...commit, changes: files };
};

/**
 * Native git implementation for fetching commit details - needed for submodules
 * where .git is a file pointing to the parent's .git/modules/ directory.
 */
const fetchLocalCommitDetailsNative = (dir: string, commit: Commit): Commit => {
    const oid = commit.id;
    const parentOid = commit.parents[0];
    if (!parentOid) return commit;

    const files: FileChange[] = [];

    try {
        // First check if the commit object exists
        try {
            gitExec(['cat-file', '-e', oid], dir);
        } catch {
            // Commit object doesn't exist - could be shallow clone, garbage collected, or during rebase
            console.debug("Commit object not available (shallow clone, GC, or rebase state):", oid);
            return { ...commit, changes: [], detailsUnavailable: true } as Commit;
        }

        // Use git diff-tree to get changed files
        const output = gitExec(['diff-tree', '--no-commit-id', '--name-status', '-r', oid], dir);
        const lines = output.trim().split('\n').filter(Boolean);

        for (const line of lines) {
            const parts = line.split('\t');
            const statusCode = parts[0];
            const filepath = parts[1];

            let status: FileChange['status'] = 'modified';
            if (statusCode === 'A') status = 'added';
            else if (statusCode === 'D') status = 'deleted';
            else if (statusCode === 'R') status = 'renamed';
            else if (statusCode === 'M') status = 'modified';

            let patch = '';
            try {
                if (status !== 'deleted') {
                    const content = gitExec(['show', `${oid}:${filepath}`], dir);
                    const snippet = content.substring(0, 2000);
                    patch = `[NEW CONTENT START]\n${snippet}\n[NEW CONTENT END]`;
                } else {
                    patch = `[FILE DELETED]`;
                }
            } catch (e) {
                patch = `[BINARY OR UNREADABLE]`;
            }

            files.push({
                filename: filepath,
                status,
                staged: false,
                additions: 0,
                deletions: 0,
                patch
            });
        }
    } catch (e: any) {
        // Handle specific error cases gracefully
        const errorMsg = e?.stderr?.toString() || e?.message || '';

        if (errorMsg.includes('bad object') ||
            errorMsg.includes('does not exist') ||
            errorMsg.includes('Not a valid object name') ||
            errorMsg.includes('unknown revision')) {
            console.debug("Commit details unavailable (object not found):", oid);
            return { ...commit, changes: [], detailsUnavailable: true } as Commit;
        }

        console.error("Failed to get commit details:", errorMsg || e);
        return { ...commit, changes: [], detailsUnavailable: true } as Commit;
    }

    return { ...commit, changes: files };
};

export const isGitRepo = async (repo: Repository): Promise<boolean> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['rev-parse', '--git-dir'], dir);
            return true;
        } catch (e) {
            return false;
        }
    }

    try {
        await git.resolveRef({ fs, dir, ref: 'HEAD' });
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Check if a path is a valid git repository (by path string)
 */
export const isGitRepoPath = async (path: string): Promise<boolean> => {
    if (!isNodeEnv) return false;

    // Use native git for submodules (where .git is a file, not a directory)
    try {
        gitExec(['rev-parse', '--git-dir'], path);
        return true;
    } catch (e) {
        return false;
    }
};

export const initGitRepo = async (repo: Repository, defaultBranch: string = 'main') => {
    const { fs, dir } = getGitContext(repo);
    await git.init({ fs, dir, defaultBranch });

    // Configure Git with platform-specific settings
    try {
        // Configure line endings
        await git.setConfig({
            fs,
            dir,
            path: 'core.autocrlf',
            value: platformGitConfig.autocrlf.toString(),
        });

        // Configure symlink support
        await git.setConfig({
            fs,
            dir,
            path: 'core.symlinks',
            value: platformGitConfig.symlinks.toString(),
        });

        // Configure file mode
        await git.setConfig({
            fs,
            dir,
            path: 'core.fileMode',
            value: platformGitConfig.fileMode.toString(),
        });
    } catch (e) {
        console.warn('Failed to configure git settings:', e);
        // Non-fatal, continue anyway
    }
};

// --- NEW BULK OPERATIONS ---

export const gitStageAll = async (repo: Repository) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['add', '-A'], dir);
        } catch (error: any) {
            throw new Error(`Failed to stage all: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        const status = await git.statusMatrix({ fs, dir });
        const toAdd = status.filter(row => row[2] !== row[3]).map(row => row[0]);
        await Promise.all(toAdd.map(filepath => git.add({ fs, dir, filepath })));
    }

    // Clear working dir cache
    workingDirCache.delete(typeof dir === 'string' ? dir : '');
}

export const gitUnstageAll = async (repo: Repository) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['reset', 'HEAD', '--', '.'], dir);
        } catch (error: any) {
            // Ignore errors (e.g., empty repo)
        }
    } else {
        const status = await git.statusMatrix({ fs, dir });
        const toReset = status.filter(row => row[3] !== row[1]).map(row => row[0]);
        await Promise.all(toReset.map(filepath => git.resetIndex({ fs, dir, filepath, ref: 'HEAD' })));
    }

    // Clear working dir cache
    workingDirCache.delete(typeof dir === 'string' ? dir : '');
}

export const gitDiscardFile = async (repo: Repository, filepath: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Check if file is tracked
            const result = gitExec(['ls-files', filepath], dir).trim();
            if (result) {
                // Tracked file - restore from HEAD
                gitExec(['checkout', 'HEAD', '--', filepath], dir);
            } else {
                // Untracked file - delete it
                const path = require('path');
                const filePath = path.join(dir, filepath);
                const nodeFs = require('fs');
                nodeFs.unlinkSync(filePath);
            }
        } catch (error: any) {
            throw new Error(`Failed to discard file: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        const status = await git.statusMatrix({ fs, dir, filepaths: [filepath] });

        if (status.length === 0) return;

        const [, headStatus, workdirStatus] = status[0];

        if (headStatus === 0) {
            // Untracked file — delete it
            const filePath = typeof dir === 'string' ? require('path').join(dir, filepath) : `${dir}/${filepath}`;
            await fs.unlink(filePath);
        } else {
            // Tracked file — restore from HEAD
            await git.checkout({ fs, dir, ref: 'HEAD', filepaths: [filepath], force: true });
        }
    }

    // Clear working dir cache
    workingDirCache.delete(typeof dir === 'string' ? dir : '');
}

export const gitDiscardAll = async (repo: Repository) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Restore all tracked files
            gitExec(['checkout', '--', '.'], dir);
            // Remove untracked files and directories
            gitExec(['clean', '-fd'], dir);
        } catch (error: any) {
            throw new Error(`Failed to discard all: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        const status = await git.statusMatrix({ fs, dir });

        // Restore modified/deleted tracked files
        const toCheckout = status.filter(row => row[1] !== 0 && row[2] !== row[1]).map(row => row[0]);
        if (toCheckout.length > 0) {
            await git.checkout({ fs, dir, ref: 'HEAD', filepaths: toCheckout, force: true });
        }

        // Remove new untracked files
        const toDelete = status.filter(row => row[1] === 0 && row[2] !== 0).map(row => row[0]);
        for (const f of toDelete) {
            try {
                const filePath = typeof dir === 'string' ? require('path').join(dir, f) : `${dir}/${f}`;
                await fs.unlink(filePath);
            } catch(e) { console.error("Failed to delete", f); }
        }
    }

    // Clear working dir cache
    workingDirCache.delete(typeof dir === 'string' ? dir : '');
}

// --- INTERACTIVE REBASE / REORDER ---
export const gitReorderCommits = async (
    repo: Repository,
    commitsToMove: Commit[],
    targetCommit: Commit,
    position: 'before' | 'after',
    allCommits: Commit[]
) => {
    const { dir } = getGitContext(repo);

    // Require native git (Electron mode)
    if (!isNodeEnv) {
        throw new Error('Commit reordering requires Electron/desktop mode with native git.');
    }

    if (typeof dir !== 'string') {
        throw new Error('Commit reordering requires a filesystem-based repository.');
    }

    if (commitsToMove.length === 0) {
        throw new Error('No commits to reorder');
    }

    // allCommits is newest-first; build new order
    const moveIds = new Set(commitsToMove.map(c => c.id));
    const cleanList = allCommits.filter(c => !moveIds.has(c.id));

    const targetIndex = cleanList.findIndex(c => c.id === targetCommit.id);
    if (targetIndex === -1) throw new Error("Target commit not found in history");

    // In newest-first order: 'before' means insert at a lower index (closer to HEAD),
    // 'after' means insert at a higher index (further from HEAD)
    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;

    const newOrder = [...cleanList];
    newOrder.splice(insertIndex, 0, ...commitsToMove);

    // Reverse to get chronological order (oldest first) for cherry-picking
    const chronological = [...newOrder].reverse();

    // Find the oldest commit that will be in the new order
    const oldestInNewOrder = chronological[0];

    // Get the parent of the oldest commit as the base
    // Use git rev-parse to handle cases where parents array might not be complete
    let baseSha: string;
    try {
        baseSha = gitExec(['rev-parse', `${oldestInNewOrder.id}^`], dir).trim();
    } catch {
        throw new Error("Cannot reorder: unable to find parent commit of oldest commit");
    }

    if (!baseSha) {
        throw new Error("Cannot reorder: root commit has no parent");
    }

    // Get current branch name
    let currentBranch: string;
    try {
        currentBranch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
    } catch {
        throw new Error('Could not determine current branch. Are you in detached HEAD state?');
    }
    if (currentBranch === 'HEAD') {
        throw new Error('Cannot reorder commits in detached HEAD state. Checkout a branch first.');
    }

    // Detach HEAD at the base commit
    try {
        gitExec(['checkout', '--detach', baseSha], dir);
    } catch (e) {
        throw new Error(`Failed to checkout base commit: ${e.stderr?.toString() || e.message}`);
    }

    // Cherry-pick each commit in chronological order
    for (const commit of chronological) {
        try {
            gitExec(['cherry-pick', commit.id], dir);
        } catch (e: any) {
            const stderr = e.stderr?.toString() || e.message || '';

            // Check for empty cherry-pick (changes already applied) - skip these
            if (stderr.includes('empty') || stderr.includes('The previous cherry-pick is now empty')) {
                // This commit's changes are already present, skip it and continue
                try { gitExec(['cherry-pick', '--skip'], dir); } catch (skipError) {
                    // If skip fails, just continue - the commit may have been applied anyway
                }
                continue;
            }

            // Check for merge conflicts
            if (stderr.includes('could not apply') ||
                stderr.includes('conflict') ||
                stderr.includes('CONFLICT') ||
                stderr.includes('Merge conflict')) {
                // Abort the cherry-pick and restore original branch
                try { gitExec(['cherry-pick', '--abort'], dir); } catch (e2) { console.warn('cherry-pick abort failed:', e2); }
                try { gitExec(['checkout', currentBranch], dir); } catch (e2) { console.warn('branch restore failed:', e2); }

                // Extract conflicting files if possible
                const conflictFiles = stderr.match(/(?:CONFLICT|error: could not apply)[^]*?(?=hint:|$)/i)?.[0] || '';

                throw new Error(
                    `Merge conflict when applying commit ${commit.id.substring(0, 7)}.\n\n` +
                    `The commit "${commit.message?.split('\n')[0] || 'Unknown'}" conflicts with changes in your branch.\n\n` +
                    `Options:\n` +
                    `1. Resolve the conflicts manually and try again\n` +
                    `2. Skip this commit if its changes are not needed\n` +
                    `3. Abort and try a different approach\n\n` +
                    `The repository has been restored to its original state.`
                );
            }

            // For other errors, abort and restore original branch
            try { gitExec(['cherry-pick', '--abort'], dir); } catch (e2) { console.warn('cherry-pick abort failed:', e2); }
            try { gitExec(['checkout', currentBranch], dir); } catch (e2) { console.warn('branch restore failed:', e2); }

            // Show user-friendly error without full git output
            const shortError = stderr.split('\n')[0] || 'Unknown error';
            throw new Error(
                `Failed to apply commit ${commit.id.substring(0, 7)}: ${shortError}\n\n` +
                `The repository has been restored to its original state.`
            );
        }
    }

    // Move the branch ref to the new HEAD and checkout
    try {
        gitExec(['checkout', '-B', currentBranch], dir);
    } catch (e) {
        throw new Error(`Failed to update branch "${currentBranch}": ${e.stderr?.toString() || e.message}`);
    }
}

/**
 * Get current HEAD SHA
 */
export const gitResolveRef = async (repo: Repository, ref: string = 'HEAD'): Promise<string> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            return gitExec(['rev-parse', ref], dir).trim();
        } catch (error: any) {
            throw new Error(`Failed to resolve ref '${ref}': ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    }

    try {
        return await git.resolveRef({ fs, dir, ref });
    } catch (e: any) {
        throw new Error(`Failed to resolve ref '${ref}': ${e.message}`);
    }
};

/**
 * Reset HEAD to a specific state
 * @param repo Repository object
 * @param ref Target commit SHA or ref to reset to
 * @param mode Reset mode: 'soft' | 'mixed' | 'hard'
 */
export const gitReset = async (repo: Repository, ref: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed') => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            const modeFlag = mode === 'soft' ? '--soft' : mode === 'hard' ? '--hard' : '--mixed';
            gitExec(['reset', modeFlag, ref], dir);
        } catch (error: any) {
            throw new Error(`Reset failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
        return;
    }

    // First, checkout the target ref to move HEAD
    await git.checkout({ fs, dir, ref, force: true });

    // For hard reset, we also need to reset the index and working directory
    if (mode === 'hard') {
        // Get all files in the index
        const status = await git.statusMatrix({ fs, dir });
        // Reset all files to the target ref
        await Promise.all(status.map(row => git.resetIndex({ fs, dir, filepath: row[0], ref })));
    }
};

/**
 * Delete a branch
 */
export const gitDeleteBranch = async (repo: Repository, branchName: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['branch', '-D', branchName], dir);
        } catch (error: any) {
            throw new Error(`Failed to delete branch: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        await git.deleteBranch({
            fs,
            dir,
            ref: branchName,
        });
    }

    // Clear cache after branch deletion
    clearRepoCache(typeof dir === 'string' ? dir : undefined);
};

/**
 * Create a branch at a specific commit
 */
export const gitCreateBranchAt = async (repo: Repository, branchName: string, ref: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['branch', branchName, ref], dir);
        } catch (error: any) {
            throw new Error(`Failed to create branch: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        await git.branch({
            fs,
            dir,
            ref: branchName,
            object: ref,
        });
    }

    // Clear cache after branch creation
    clearRepoCache(typeof dir === 'string' ? dir : undefined);
};

/**
 * Amend the last commit with new message and/or staged changes
 */
export const gitAmend = async (repo: Repository, message: string, author?: { name: string, email: string }) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            const args = ['commit', '--amend', '-m', message];
            if (author) {
                args.push('--author', `${author.name} <${author.email}>`);
            }
            gitExec(args, dir);
        } catch (error: any) {
            throw new Error(`Amend failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
        return;
    }

    const commitArgs: any = {
        fs,
        dir,
        message,
        amend: true,
    };

    if (author) {
        commitArgs.author = author;
    }

    await git.commit(commitArgs);
};

/**
 * Undo the last commit (reset to HEAD~1)
 * WARNING: This removes the last commit but keeps changes staged
 */
export const gitUndoCommit = async (repo: Repository, keepChanges: boolean = true) => {
    const { dir } = getGitContext(repo);

    if (keepChanges) {
        // Soft reset: keeps changes staged
        nativeGitReset(dir, 'HEAD~1', 'soft');
    } else {
        // Hard reset: discards changes
        nativeGitReset(dir, 'HEAD~1', 'hard');
    }
};

/**
 * Revert a commit by creating a new commit that undoes the changes
 */
export const gitRevert = async (repo: Repository, commitRef: string, author: { name: string, email: string }) => {
    const { fs, dir } = getGitContext(repo);

    // Check if we're in a Node/Electron environment by checking if we can require child_process


    if (isNodeEnv && typeof dir === 'string') {
        // Use git revert command in Node/Electron environment
        const path = require('path');
        try {
            // Get the original commit message
            const commit = await git.readCommit({ fs, dir, oid: commitRef });
            const originalMessage = commit.commit.message.split('\n')[0];

            // Perform revert
            gitExec(['revert', '--no-commit', commitRef], dir);

            // Write commit message to a temp file (cross-platform, avoids printf/echo issues)
            const revertMessage = `Revert: ${originalMessage}\n\nThis reverts commit ${commitRef}.`;
            const tmpFile = path.join(dir, '.git', 'REVERT_MSG_TMP');
            fs.writeFileSync(tmpFile, revertMessage, { encoding: 'utf8' });

            try {
                gitExec(['commit', '-F', '.git/REVERT_MSG_TMP'], dir);
            } finally {
                // Clean up temp file
                try { fs.unlinkSync(tmpFile); } catch (e) { console.warn('cleanup temp file failed:', e); }
            }
            return;
        } catch (error) {
            const errorMsg = error.stderr || error.stdout || error.message || error;
            const errorStr = String(errorMsg).toLowerCase();
            const isConflict = errorStr.includes('conflict') || errorStr.includes('unmerged') || errorStr.includes('merge_head');

            if (isConflict) {
                // Leave conflicts in place so the merge tool can resolve them
                throw new Error('REVERT_CONFLICTS');
            }

            // Non-conflict error — abort the revert and report
            try {
                gitExec(['revert', '--abort'], dir);
            } catch (e) {
                // Ignore abort errors
            }
            throw new Error(`Revert failed: ${errorMsg}`);
        }
    } else {
        // Browser/isomorphic-git environment - not supported
        throw new Error('Revert is only supported in Electron/desktop mode. Please use the desktop app or command line: git revert ' + commitRef);
    }
};

/**
 * Check if repository has any commits (is not empty)
 */
export const gitHasCommits = async (repo: Repository): Promise<boolean> => {
    try {
        const { fs, dir } = getGitContext(repo);

        // Use native git for submodules (where .git is a file, not a directory)
        if (isNodeEnv && typeof dir === 'string') {
            try {
                gitExec(['rev-parse', 'HEAD'], dir);
                return true;
            } catch {
                return false;
            }
        }

        await git.resolveRef({ fs, dir, ref: 'HEAD' });
        return true;
    } catch {
        return false;
    }
};

/**
 * Merge a branch into the current branch
 * @param repo Repository object
 * @param branchName Name of the branch to merge into current branch
 * @param author Optional author information for merge commit
 */
// --- Hunk/Line Staging ---

/**
 * Stage a specific hunk from a file by applying only that hunk's changes
 * Works by reading the HEAD version, applying the hunk, and writing to index
 */
export const gitStageHunk = async (
    repo: Repository,
    filepath: string,
    oldContent: string,
    newContent: string,
    hunkIndex: number
) => {
    const { fs, dir } = getGitContext(repo);

    // Parse the diff to get hunks
    const Diff = await import('diff');
    const patch = Diff.structuredPatch('old', 'new', oldContent, newContent, '', '', { context: 3 });

    if (hunkIndex >= patch.hunks.length) return;

    // Read current index content (what's currently staged)
    let indexContent: string;
    try {
        indexContent = oldContent; // Start from HEAD version
    } catch {
        indexContent = '';
    }

    // Apply only the selected hunk
    const hunk = patch.hunks[hunkIndex];
    const indexLines = indexContent.split('\n');
    const resultLines: string[] = [];
    let lineIdx = 0;

    // Copy lines before hunk
    while (lineIdx < hunk.oldStart - 1 && lineIdx < indexLines.length) {
        resultLines.push(indexLines[lineIdx]);
        lineIdx++;
    }

    // Apply hunk
    for (const line of hunk.lines) {
        if (line.startsWith('+')) {
            resultLines.push(line.slice(1));
        } else if (line.startsWith('-')) {
            lineIdx++; // Skip removed line
        } else {
            resultLines.push(indexLines[lineIdx] || line.slice(1));
            lineIdx++;
        }
    }

    // Copy lines after hunk
    while (lineIdx < indexLines.length) {
        resultLines.push(indexLines[lineIdx]);
        lineIdx++;
    }

    const patchedContent = resultLines.join('\n');

    // Write the patched content to the file and stage it
    const fullPath = typeof dir === 'string' ? `${dir}/${filepath}` : `/${filepath}`;
    // Save original working dir content
    const workdirContent = newContent;

    // Write patched version, stage it, then restore working dir
    await fs.promises.writeFile(fullPath, patchedContent, { encoding: 'utf8' });

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['add', filepath], dir);
        } catch (error: any) {
            throw new Error(`Failed to stage hunk: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        await git.add({ fs, dir, filepath });
    }

    // Restore working directory to original new content
    await fs.promises.writeFile(fullPath, workdirContent, { encoding: 'utf8' });
};

/**
 * Stage a specific line from a diff
 */
export const gitStageLine = async (
    repo: Repository,
    filepath: string,
    oldContent: string,
    newContent: string,
    hunkIndex: number,
    lineIndex: number
) => {
    // For single-line staging, create a modified hunk with only that line changed
    const Diff = await import('diff');
    const patch = Diff.structuredPatch('old', 'new', oldContent, newContent, '', '', { context: 3 });

    if (hunkIndex >= patch.hunks.length) return;

    const hunk = patch.hunks[hunkIndex];
    const targetLine = hunk.lines[lineIndex];
    if (!targetLine) return;

    // Reconstruct content with only this single line change applied
    const oldLines = oldContent.split('\n');
    const resultLines = [...oldLines];

    // Calculate the actual line in the file
    let oldLineNo = hunk.oldStart - 1;
    let offset = 0;
    for (let i = 0; i < lineIndex; i++) {
        const l = hunk.lines[i];
        if (l.startsWith('+')) offset++;
        else if (l.startsWith('-')) { oldLineNo++; offset--; }
        else oldLineNo++;
    }

    if (targetLine.startsWith('+')) {
        resultLines.splice(oldLineNo + offset, 0, targetLine.slice(1));
    } else if (targetLine.startsWith('-')) {
        resultLines.splice(oldLineNo, 1);
    }

    const { fs, dir } = getGitContext(repo);
    const fullPath = typeof dir === 'string' ? `${dir}/${filepath}` : `/${filepath}`;
    const workdirContent = newContent;

    await fs.promises.writeFile(fullPath, resultLines.join('\n'), { encoding: 'utf8' });

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['add', filepath], dir);
        } catch (error: any) {
            throw new Error(`Failed to stage line: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        await git.add({ fs, dir, filepath });
    }

    await fs.promises.writeFile(fullPath, workdirContent, { encoding: 'utf8' });
};

// --- Tag Operations ---

/**
 * Create a lightweight tag at a specific commit
 */
export const gitCreateTag = async (repo: Repository, tagName: string, ref: string = 'HEAD') => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['tag', tagName, ref], dir);
        } catch (error: any) {
            throw new Error(`Failed to create tag: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
        return;
    }

    await git.tag({ fs, dir, ref: tagName, object: ref });
};

/**
 * List all tags
 */
export const gitListTags = async (repo: Repository): Promise<string[]> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            const output = gitExec(['tag', '-l'], dir);
            return output.trim().split('\n').filter(Boolean);
        } catch {
            return [];
        }
    }

    try {
        return await git.listTags({ fs, dir });
    } catch {
        return [];
    }
};

/**
 * Resolve all tags to their commit OIDs
 */
export const gitResolveTagRefs = async (repo: Repository): Promise<Map<string, string[]>> => {
    const { fs, dir } = getGitContext(repo);
    const result = new Map<string, string[]>(); // commitOid -> tagName[]

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Get all tags with their commits
            const output = gitExec(['tag', '-l', '--format=%(refname:short)|%(objectname:short)'], dir);
            const lines = output.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                const [tagName, commitOid] = line.split('|');
                if (tagName && commitOid) {
                    const existing = result.get(commitOid) || [];
                    existing.push(tagName);
                    result.set(commitOid, existing);
                }
            }
            return result;
        } catch {
            return result;
        }
    }

    try {
        const tagNames = await git.listTags({ fs, dir });
        for (const tag of tagNames) {
            try {
                const oid = await git.resolveRef({ fs, dir, ref: `refs/tags/${tag}` });
                // oid might be an annotated tag object, resolve to commit
                let commitOid = oid;
                try {
                    const tagObj = await git.readTag({ fs, dir, oid });
                    commitOid = tagObj.tag.object;
                } catch {
                    // Not an annotated tag, oid is the commit directly
                }
                if (!result.has(commitOid)) result.set(commitOid, []);
                result.get(commitOid)!.push(tag);
            } catch {
                // Skip unresolvable tags
            }
        }
    } catch {
        // No tags
    }
    return result;
};

/**
 * Delete a tag
 */
export const gitDeleteTag = async (repo: Repository, tagName: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['tag', '-d', tagName], dir);
        } catch (error: any) {
            throw new Error(`Failed to delete tag: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
        return;
    }

    await git.deleteTag({ fs, dir, ref: tagName });
};

// --- Branch Rename ---

/**
 * Rename a branch
 */
export const gitRenameBranch = async (repo: Repository, oldName: string, newName: string) => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Use git branch -m to rename
            gitExec(['branch', '-m', oldName, newName], dir);

            // If currently on the old branch, we need to update HEAD
            const currentBranch = await getCurrentBranch(repo);
            if (currentBranch === newName) {
                // Already on the renamed branch, nothing to do
            }
        } catch (error: any) {
            throw new Error(`Failed to rename branch: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        // Get the commit the old branch points to
        const oid = await git.resolveRef({ fs, dir, ref: `refs/heads/${oldName}` });

        // Create new branch at same commit
        await git.branch({ fs, dir, ref: newName, object: oid });

        // If currently on the old branch, checkout new one
        const currentBranch = await getCurrentBranch(repo);
        if (currentBranch === oldName) {
            await git.checkout({ fs, dir, ref: newName });
        }

        // Delete old branch
        await git.deleteBranch({ fs, dir, ref: oldName });
    }

    // Clear cache after branch rename
    clearRepoCache(typeof dir === 'string' ? dir : undefined);
};

// --- Ahead/Behind ---

/**
 * Get ahead/behind count relative to remote tracking branch
 */
export const getAheadBehind = async (repo: Repository, branch?: string): Promise<{ ahead: number; behind: number }> => {
    const { fs, dir } = getGitContext(repo);

    try {
        const currentBranch = branch || await getCurrentBranch(repo);
        if (currentBranch === 'HEAD') return { ahead: 0, behind: 0 };

        // Use native git for submodules (where .git is a file, not a directory)
        if (isNodeEnv && typeof dir === 'string') {
            try {
                // Check if remote tracking branch exists
                try {
                    gitExec(['rev-parse', `refs/remotes/origin/${currentBranch}`], dir);
                } catch {
                    // No remote tracking branch - count local commits
                    try {
                        const count = gitExec(['rev-list', '--count', currentBranch], dir).trim();
                        return { ahead: parseInt(count, 10) || 0, behind: 0 };
                    } catch {
                        return { ahead: 0, behind: 0 };
                    }
                }

                // Get ahead/behind counts using rev-list
                const aheadOutput = gitExec(['rev-list', '--count', `${currentBranch}..origin/${currentBranch}`], dir).trim();
                const behindOutput = gitExec(['rev-list', '--count', `origin/${currentBranch}..${currentBranch}`], dir).trim();

                return {
                    ahead: parseInt(behindOutput, 10) || 0,
                    behind: parseInt(aheadOutput, 10) || 0
                };
            } catch {
                return { ahead: 0, behind: 0 };
            }
        }

        // Resolve local and remote refs
        let localOid: string;
        let remoteOid: string;

        try {
            localOid = await git.resolveRef({ fs, dir, ref: `refs/heads/${currentBranch}` });
        } catch {
            return { ahead: 0, behind: 0 };
        }

        try {
            remoteOid = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${currentBranch}` });
        } catch {
            // No remote tracking branch
            // Count all local commits as ahead
            try {
                const localLog = await git.log({ fs, dir, ref: localOid, depth: 100 });
                return { ahead: localLog.length, behind: 0 };
            } catch {
                return { ahead: 0, behind: 0 };
            }
        }

        if (localOid === remoteOid) return { ahead: 0, behind: 0 };

        // Walk commits to find ahead/behind - fetch both logs in parallel
        const [localLog, remoteLog] = await Promise.all([
            git.log({ fs, dir, ref: localOid, depth: 200 }),
            git.log({ fs, dir, ref: remoteOid, depth: 200 })
        ]);

        const localOids = new Set(localLog.map(c => c.oid));
        const remoteOids = new Set(remoteLog.map(c => c.oid));

        let ahead = 0;
        for (const c of localLog) {
            if (remoteOids.has(c.oid)) break;
            ahead++;
        }

        let behind = 0;
        for (const c of remoteLog) {
            if (localOids.has(c.oid)) break;
            behind++;
        }

        return { ahead, behind };
    } catch {
        return { ahead: 0, behind: 0 };
    }
};

// --- File History ---

/**
 * Fetch commit history for a specific file
 */
export const fetchFileHistory = async (repo: Repository, filepath: string): Promise<Commit[]> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Use git log --follow to get file history
            const output = gitExec(
                ['log', '--follow', '--format=%H|%s|%an|%ai|%P', '--max-count=100', '--', filepath],
                dir
            );
            const lines = output.trim().split('\n').filter(Boolean);

            return lines.map((line) => {
                const parts = line.split('|');
                const [sha, message, author, dateStr, parentsStr] = parts;
                const parents = parentsStr ? parentsStr.split(' ').filter(Boolean) : [];

                return {
                    id: sha,
                    shortId: sha.substring(0, 7),
                    message: message || '',
                    author: author || '',
                    date: new Date(dateStr).toISOString(),
                    parents: parents,
                    lane: 0,
                    color: '#888',
                };
            });
        } catch {
            return [];
        }
    }

    try {
        const commits = await git.log({ fs, dir, ref: 'HEAD', depth: 100 });

        // Collect all unique OIDs we need to read (commit OIDs + parent OIDs)
        const oidsToRead = new Set<string>();
        for (const c of commits) {
            oidsToRead.add(c.oid);
            if (c.commit.parent[0]) {
                oidsToRead.add(c.commit.parent[0]);
            }
        }

        // Read all blobs in parallel for better performance
        const blobCache = new Map<string, string | null>();
        await Promise.all(
            Array.from(oidsToRead).map(async (oid) => {
                try {
                    const r = await git.readBlob({ fs, dir, oid, filepath });
                    blobCache.set(oid, new TextDecoder().decode(r.blob));
                } catch {
                    blobCache.set(oid, null);
                }
            })
        );

        // Now process commits using cached blobs
        const fileCommits: Commit[] = [];
        for (const c of commits) {
            const { commit } = c;
            const parentOid = commit.parent[0];
            const currentBlob = blobCache.get(c.oid);

            if (!parentOid) {
                // Root commit - check if file exists
                if (currentBlob !== null) {
                    fileCommits.push({
                        id: c.oid,
                        shortId: c.oid.substring(0, 7),
                        message: commit.message.split('\n')[0],
                        author: commit.author.name,
                        date: new Date(commit.author.timestamp * 1000).toISOString(),
                        parents: commit.parent,
                        lane: 0,
                        color: '#888',
                    });
                }
                continue;
            }

            // Compare file between parent and this commit
            const parentBlob = blobCache.get(parentOid);

            // If file changed (including added or deleted)
            if (parentBlob !== currentBlob) {
                fileCommits.push({
                    id: c.oid,
                    shortId: c.oid.substring(0, 7),
                    message: commit.message.split('\n')[0],
                    author: commit.author.name,
                    date: new Date(commit.author.timestamp * 1000).toISOString(),
                    parents: commit.parent,
                    lane: 0,
                    color: '#888',
                });
            }
        }

        return fileCommits;
    } catch {
        return [];
    }
};

// --- Blame ---

/**
 * Check if a filepath is inside a submodule and return the submodule path
 * Returns { submodulePath: string | null, relativePath: string }
 * where relativePath is the path within the submodule
 */
const getSubmodulePathForFile = async (
    repo: Repository,
    filepath: string
): Promise<{ submodulePath: string | null; relativePath: string }> => {
    try {
        const submodules = await listSubmodules(repo);
        if (!submodules || submodules.length === 0) {
            return { submodulePath: null, relativePath: filepath };
        }

        // Normalize filepath to use forward slashes
        const normalizedPath = filepath.replace(/\\/g, '/');

        // Check if filepath starts with any submodule path
        for (const sub of submodules) {
            const subPath = sub.path.replace(/\\/g, '/');
            // Ensure submodule path doesn't have trailing slash for comparison
            const subPathNormalized = subPath.endsWith('/') ? subPath.slice(0, -1) : subPath;

            if (normalizedPath === subPathNormalized ||
                normalizedPath.startsWith(subPathNormalized + '/')) {
                // File is inside this submodule
                const relativePath = normalizedPath.substring(subPathNormalized.length + 1);
                return { submodulePath: sub.path, relativePath };
            }
        }

        return { submodulePath: null, relativePath: filepath };
    } catch {
        return { submodulePath: null, relativePath: filepath };
    }
};

/**
 * Get blame information for a file (simplified line attribution)
 */
export const gitBlame = async (repo: Repository, filepath: string, ref: string = 'HEAD'): Promise<{
    lines: { content: string; commitId: string; author: string; date: string; message: string }[];
}> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Check if file is inside a submodule
            const { submodulePath, relativePath } = await getSubmodulePathForFile(repo, filepath);

            let blameDir = dir;
            let blameFilepath = filepath;

            if (submodulePath) {
                // File is in a submodule, run blame from submodule directory
                const path = require('path');
                blameDir = path.join(dir, submodulePath);
                blameFilepath = relativePath;
            }

            // Use native git blame
            // Format: SHA AUTHOR DATE LINE_CONTENT
            const output = gitExec(['blame', ref, '--porcelain', blameFilepath], blameDir);
            const lines = output.trim().split('\n');

            const blameInfo: { content: string; commitId: string; author: string; date: string; message: string }[] = [];

            // Parse porcelain format
            // Each line starts with: <sha> <original-line> <final-line> <num-lines>
            // Followed by header lines for that commit
            let currentCommit: any = {};
            let lineContent = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check if this is a line info line (starts with SHA)
                if (line.match(/^[0-9a-f]{40}/)) {
                    // Previous commit info is complete, save it if we have content
                    if (lineContent && currentCommit.sha) {
                        blameInfo.push({
                            content: lineContent,
                            commitId: currentCommit.sha.substring(0, 7),
                            author: currentCommit.author || 'Unknown',
                            date: currentCommit.date || '',
                            message: currentCommit.message || '',
                        });
                    }

                    // Parse new line info
                    const parts = line.split(' ');
                    const sha = parts[0];
                    lineContent = line.substring(line.indexOf('\t') + 1); // Content after tab

                    // Look ahead for commit info
                    currentCommit = { sha };
                    let j = i + 1;
                    while (j < lines.length && !lines[j].match(/^[0-9a-f]{40}/)) {
                        if (lines[j].startsWith('author ')) {
                            currentCommit.author = lines[j].substring(7);
                        } else if (lines[j].startsWith('author-time ')) {
                            const timestamp = parseInt(lines[j].substring(12));
                            currentCommit.date = new Date(timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        } else if (lines[j].startsWith('summary ')) {
                            currentCommit.message = lines[j].substring(8);
                        }
                        j++;
                    }
                }
            }

            // Add the last line
            if (lineContent && currentCommit.sha) {
                blameInfo.push({
                    content: lineContent,
                    commitId: currentCommit.sha.substring(0, 7),
                    author: currentCommit.author || 'Unknown',
                    date: currentCommit.date || '',
                    message: currentCommit.message || '',
                });
            }

            return { lines: blameInfo };
        } catch (error: any) {
            console.error('Blame failed:', error);
            return { lines: [] };
        }
    }

    // Fallback to isomorphic-git (browser mode)
    try {
        // Resolve symbolic refs (e.g. 'HEAD') to an actual OID
        const oid = await git.resolveRef({ fs, dir, ref });

        // Read file content
        const { blob } = await git.readBlob({ fs, dir, oid, filepath });
        const content = new TextDecoder().decode(blob);
        const fileLines = content.split('\n');

        // Get commit history for this file
        const commits = await git.log({ fs, dir, ref: oid, depth: 50 });

        // Pre-fetch all blobs in parallel for better performance
        const blobCache = new Map<string, string | null>();
        await Promise.all(
            commits.map(async (c) => {
                try {
                    const r = await git.readBlob({ fs, dir, oid: c.oid, filepath });
                    blobCache.set(c.oid, new TextDecoder().decode(r.blob));
                } catch {
                    blobCache.set(c.oid, null);
                }
            })
        );

        // Simple blame: walk backwards through commits to find who last changed each line
        const blameInfo: { content: string; commitId: string; author: string; date: string; message: string }[] = [];

        // For performance, we do a simplified blame:
        // Walk through commits and track when each line was last modified
        const lineCommits: (typeof commits[0] | null)[] = new Array(fileLines.length).fill(null);

        let prevContent = content;
        for (const c of commits) {
            const commitContent = blobCache.get(c.oid);
            if (commitContent === null) {
                // File didn't exist at this commit - all remaining unattributed lines belong to next commit
                break;
            }

            if (commitContent !== prevContent) {
                // Lines changed between this commit and the previous version
                const oldLines = commitContent.split('\n');
                const newLines = prevContent.split('\n');

                // Find lines that are new in prevContent compared to commitContent
                const oldSet = new Set(oldLines);
                for (let i = 0; i < newLines.length; i++) {
                    if (lineCommits[i] === null && !oldSet.has(newLines[i])) {
                        // Find the commit that introduced this line (previous commit in our walk)
                        const prevCommit = commits[commits.indexOf(c) - 1] || c;
                        lineCommits[i] = prevCommit;
                    }
                }
                prevContent = commitContent;
            }
        }

        // Fill remaining unattributed lines with the oldest commit
        const lastCommit = commits[commits.length - 1] || commits[0];
        for (let i = 0; i < fileLines.length; i++) {
            const c = lineCommits[i] || lastCommit;
            blameInfo.push({
                content: fileLines[i],
                commitId: c ? c.oid : 'unknown',
                author: c ? c.commit.author.name : 'Unknown',
                date: c ? new Date(c.commit.author.timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
                message: c ? c.commit.message.split('\n')[0] : '',
            });
        }

        return { lines: blameInfo };
    } catch (e) {
        console.error('Blame failed:', e);
        return { lines: [] };
    }
};

// --- Fetch (for auto-fetch) ---

/**
 * Fetch from remote without merging
 */
export const gitFetch = async (repo: Repository, token: string | null) => {
    const { fs, dir, http } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Check if there are remotes first
            const remotesOutput = gitExec(['remote'], dir).trim();
            if (!remotesOutput) return;

            // Fetch using native git
            if (token) {
                gitExecWithToken(['fetch', 'origin'], dir, token);
            } else {
                gitExec(['fetch', 'origin'], dir);
            }
        } catch (error: any) {
            console.warn('Auto-fetch failed:', sanitizeErrorMessage(error.stderr || error.message));
        }
        return;
    }

    try {
        const remotes = await git.listRemotes({ fs, dir });
        if (!remotes || remotes.length === 0) return;

        await git.fetch({
            fs,
            http,
            dir,
            remote: 'origin',
            onAuth: () => token ? { username: token } : undefined,
        });
    } catch (e) {
        console.warn('Auto-fetch failed:', e);
    }
};

// --- Remote Management ---

/**
 * List all remotes configured for the repository
 */
export const gitListRemotes = async (repo: Repository): Promise<{ remote: string; url: string }[]> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            const output = gitExec(['remote', '-v'], dir);
            const lines = output.trim().split('\n').filter(Boolean);
            const remotes: { remote: string; url: string }[] = [];
            const seen = new Set<string>();

            for (const line of lines) {
                // Format: origin  https://github.com/user/repo.git (fetch)
                const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
                if (match && !seen.has(match[1])) {
                    seen.add(match[1]);
                    remotes.push({ remote: match[1], url: match[2] });
                }
            }
            return remotes;
        } catch (error: any) {
            throw new Error(`Failed to list remotes: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    }

    return await git.listRemotes({ fs, dir });
};

/**
 * Parse GitHub owner and repo name from a remote URL
 * Supports both HTTPS and SSH URL formats
 */
export const parseGitHubRemote = (url: string): { owner: string; repo: string } | null => {
    // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    // SSH: git@github.com:owner/repo.git or git@github.com:owner/repo
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/.]+)/);
    if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
    }
    return null;
};

/**
 * Get GitHub owner/repo info from a local repository's origin remote
 */
export const getGitHubInfoFromLocal = async (repo: Repository): Promise<{ owner: string; repo: string } | null> => {
    try {
        const remotes = await gitListRemotes(repo);
        const origin = remotes.find(r => r.remote === 'origin');
        if (origin && origin.url) {
            return parseGitHubRemote(origin.url);
        }
        // Try any remote that points to GitHub
        for (const remote of remotes) {
            const info = parseGitHubRemote(remote.url);
            if (info) return info;
        }
        return null;
    } catch (e) {
        console.warn('Failed to get GitHub info from local repo:', e);
        return null;
    }
};

/**
 * Add a new remote to the repository
 */
export const gitAddRemote = async (repo: Repository, remoteName: string, url: string): Promise<void> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['remote', 'add', remoteName, url], dir);
        } catch (error: any) {
            throw new Error(`Failed to add remote: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
        return;
    }

    await git.addRemote({ fs, dir, remote: remoteName, url });
};

/**
 * Delete a remote from the repository
 */
export const gitDeleteRemote = async (repo: Repository, remoteName: string): Promise<void> => {
    const { fs, dir } = getGitContext(repo);

    // Use native git for submodules (where .git is a file, not a directory)
    if (isNodeEnv && typeof dir === 'string') {
        try {
            gitExec(['remote', 'remove', remoteName], dir);
        } catch (error: any) {
            throw new Error(`Failed to delete remote: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
        return;
    }

    await git.deleteRemote({ fs, dir, remote: remoteName });
};

/**
 * Clone a remote repository to a local directory
 */
export const gitClone = async (
    repo: Repository,
    token: string | null,
    targetDir: string
): Promise<void> => {
    // Check if Node environment (Electron)


    if (isNodeEnv) {
        // Use native git clone for better performance
        const { execFileSync } = require('child_process');
        const remoteUrl = repo.clone_url || `https://github.com/${repo.full_name}.git`;

        try {
            if (token) {
                // Use GIT_ASKPASS pattern to avoid embedding token in URL
                const path = require('path');
                const os = require('os');
                const fs2 = require('fs');
                const isWindows = process.platform === 'win32';
                const scriptExt = isWindows ? '.bat' : '.sh';
                const scriptPath = path.join(os.tmpdir(), `git-askpass-${Date.now()}${scriptExt}`);
                const scriptContent = isWindows
                    ? `@echo off\necho ${token}\n`
                    : `#!/bin/sh\necho "${token}"\n`;
                fs2.writeFileSync(scriptPath, scriptContent, { mode: 0o700 });
                try {
                    execFileSync('git', ['clone', remoteUrl, targetDir], {
                        encoding: 'utf-8',
                        stdio: 'pipe',
                        env: {
                            ...process.env,
                            GIT_ASKPASS: scriptPath,
                            GIT_TERMINAL_PROMPT: '0',
                        },
                    });
                } finally {
                    try { fs2.unlinkSync(scriptPath); } catch (e) { /* ignore cleanup errors */ }
                }
            } else {
                execFileSync('git', ['clone', remoteUrl, targetDir], { encoding: 'utf-8', stdio: 'pipe' });
            }
        } catch (error) {
            throw new Error(`Clone failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
        }
    } else {
        // Browser mode - use isomorphic-git
        // Note: This requires a writable fs adapter
        throw new Error('Clone is only supported in Electron/desktop mode. Please use command line: git clone');
    }
};

export const gitMerge = async (repo: Repository, branchName: string, author?: { name: string, email: string }) => {
    const { fs, dir } = getGitContext(repo);

    // Check if we're in a Node environment


    if (isNodeEnv && typeof dir === 'string') {
        // Use native git for better merge support
        try {
            // Check if there's already a merge in progress
            try {
                gitExec(['rev-parse', '--verify', 'MERGE_HEAD'], dir);
                // MERGE_HEAD exists - there's already a merge in progress with conflicts
                throw new Error(`CONFLICT: Merge already in progress. Please resolve existing conflicts before starting a new merge.\n\nUse the Merge Tool to resolve the current conflicts, or abort with: git merge --abort`);
            } catch (e) {
                // If the error is our CONFLICT error, re-throw it
                if (e.message && e.message.startsWith('CONFLICT:')) throw e;
                // No MERGE_HEAD - good, we can proceed with merge
            }

            // Check if branch exists (exit code non-zero throws)
            try {
                gitExec(['show-ref', '--verify', `refs/heads/${branchName}`], dir);
            } catch {
                throw new Error(`Branch "${branchName}" does not exist`);
            }

            // Get current branch
            const currentBranch = await getCurrentBranch(repo);

            // Check if branch is already merged
            try {
                gitExec(['merge-base', '--is-ancestor', branchName, 'HEAD'], dir);
                throw new Error(`Branch "${branchName}" is already merged into "${currentBranch}"`);
            } catch (e) {
                // If the error is our "already merged" error, re-throw it
                if (e.message && e.message.includes('is already merged')) throw e;
                // If error, it means branch is not an ancestor, so we can merge
            }

            // Perform merge with --no-ff to create a merge commit
            if (author) {
                gitExec(['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'merge', '--no-ff', branchName], dir);
            } else {
                gitExec(['merge', '--no-ff', branchName], dir);
            }

            return;
        } catch (error) {
            // Check for merge conflicts
            const errorMsg = error.stderr || error.stdout || error.message || error;
            if (errorMsg.includes('CONFLICT') || errorMsg.includes('Automatic merge failed') || errorMsg.includes('Merge conflict detected')) {
                throw new Error(`CONFLICT: Merge conflict detected. Please resolve conflicts before completing the merge.\n\nBranch "${branchName}" has conflicts with your current branch.`);
            }
            if (errorMsg.includes('is already merged')) {
                throw new Error(errorMsg);
            }
            throw new Error(`Merge failed: ${errorMsg}`);
        }
    } else {
        // Fallback for isomorphic-git - limited merge support
        try {
            // Get the branch ref to merge
            const branchRef = await git.resolveRef({ fs, dir, ref: `refs/heads/${branchName}` });

            // Get current HEAD
            const headRef = await git.resolveRef({ fs, dir, ref: 'HEAD' });

            // Perform merge
            await git.merge({
                fs,
                dir,
                theirs: branchRef,
                ours: headRef,
                fastForward: false, // Create merge commit
                author: author || { name: 'GitKraken User', email: 'user@example.com' }
            });
        } catch (error) {
            if (error.message && error.message.includes('conflicts')) {
                throw new Error(`CONFLICT: Merge conflict detected. Please resolve conflicts before completing the merge.\n\nBranch "${branchName}" has conflicts with your current branch.`);
            }
            throw new Error(`Merge failed: ${error.message}`);
        }
    }
};

// --- Reflog Operations ---

export interface ReflogEntry {
    sha: string;
    ref: string;
    index: number;
    action: string;
    message: string;
    timestamp: number;
}

export const gitReflog = async (repo: Repository | null): Promise<ReflogEntry[]> => {
    if (!repo) return [];
    const dir = getRepoPath(repo);
    if (!dir) {
        console.error('No repository path available');
        return [];
    }

    try {
        const output = gitExec(['reflog', '--all', '--date=unix', '--format=%H|%gd|%gs|%ct'], dir);

        const entries: ReflogEntry[] = [];
        const lines = output.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split('|');
            if (parts.length >= 4) {
                const [sha, refAndIndex, message, timestampStr] = parts;
                const timestamp = parseInt(timestampStr, 10) * 1000; // Convert to milliseconds

                // Parse ref and index from format like "HEAD@{0}" or "main@{5}"
                const refMatch = refAndIndex.match(/^(.+?)@\{(\d+)\}$/);
                const ref = refMatch ? refMatch[1] : refAndIndex;
                const index = refMatch ? parseInt(refMatch[2], 10) : 0;

                // Extract action from message (e.g., "commit:", "checkout:", "merge:", etc.)
                const actionMatch = message.match(/^([\w-]+):/);
                const action = actionMatch ? actionMatch[1] : 'unknown';

                entries.push({
                    sha: sha.substring(0, 7),
                    ref,
                    index,
                    action,
                    message: message.trim(),
                    timestamp
                });
            }
        }

        // Sort by timestamp descending (most recent first)
        return entries.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('Error reading reflog:', error);
        return [];
    }
};

export const gitCheckoutReflogEntry = async (repo: Repository | null, sha: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['checkout', sha], dir);
    } catch (error) {
        throw new Error(`Failed to checkout reflog entry: ${error.message}`);
    }
};

export const gitRestoreBranchToReflog = async (repo: Repository | null, branchName: string, sha: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        // Check if branch exists (--quiet means we care about exit code)
        try {
            gitExec(['show-ref', '--verify', `refs/heads/${branchName}`], dir);
            // Branch exists, reset it
            gitExec(['branch', '-f', branchName, sha], dir);
        } catch {
            // Branch doesn't exist, create it
            gitExec(['branch', branchName, sha], dir);
        }
    } catch (error) {
        throw new Error(`Failed to restore branch: ${error.message}`);
    }
};

// --- Snapshot Operations (using git stash) ---

const SNAPSHOT_PREFIX = 'gk-snapshot:';

export interface Snapshot {
    id: string;
    index: number;
    message: string;
    timestamp: number;
    files: string[];
}

export const createSnapshot = async (repo: Repository | null, message?: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        const timestamp = Date.now();
        const defaultMessage = `Snapshot ${new Date().toLocaleString()}`;
        const snapshotMessage = `${SNAPSHOT_PREFIX}${message || defaultMessage}|${timestamp}`;

        gitExec(['stash', 'push', '-m', snapshotMessage, '--include-untracked'], dir);
    } catch (error) {
        throw new Error(`Failed to create snapshot: ${error.message}`);
    }
};

export const listSnapshots = async (repo: Repository | null): Promise<Snapshot[]> => {
    if (!repo) return [];
    const dir = getRepoPath(repo);
    if (!dir) {
        console.error('No repository path available');
        return [];
    }

    try {
        const DELIM = '‡';
        const output = gitExec(['stash', 'list', `--format=%H${DELIM}%gd${DELIM}%s`], dir);

        const snapshots: Snapshot[] = [];
        const lines = output.trim().split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split(DELIM);
            if (parts.length >= 3) {
                const [, ref, subject] = parts;
                if (subject.includes(SNAPSHOT_PREFIX)) {
                    const afterPrefix = subject.substring(subject.indexOf(SNAPSHOT_PREFIX) + SNAPSHOT_PREFIX.length);
                    const lastPipe = afterPrefix.lastIndexOf('|');
                    const actualMessage = lastPipe >= 0 ? afterPrefix.substring(0, lastPipe) : afterPrefix;
                    const timestampStr = lastPipe >= 0 ? afterPrefix.substring(lastPipe + 1) : '';
                    const timestamp = timestampStr ? parseInt(timestampStr, 10) : Date.now();

                    // Get files in this stash
                    let files: string[] = [];
                    try {
                        const filesOutput = gitExec(['stash', 'show', '--name-only', `stash@{${i}}`], dir);
                        files = filesOutput.trim().split('\n').filter(f => f.trim());
                    } catch {
                        // Ignore errors getting files
                    }

                    snapshots.push({
                        id: `stash@{${i}}`,
                        index: i,
                        message: actualMessage,
                        timestamp,
                        files
                    });
                }
            }
        }

        return snapshots.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('Error listing snapshots:', error);
        return [];
    }
};

export const restoreSnapshot = async (repo: Repository | null, stashRef: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        // Apply the stash but keep it in the stash list
        gitExec(['stash', 'apply', stashRef], dir);
    } catch (error) {
        throw new Error(`Failed to restore snapshot: ${error.message}`);
    }
};

export const deleteSnapshot = async (repo: Repository | null, stashRef: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['stash', 'drop', stashRef], dir);
    } catch (error) {
        throw new Error(`Failed to delete snapshot: ${error.message}`);
    }
};

// --- Git LFS Operations ---

export interface LfsFile {
    path: string;
    size: string;
    isPointer: boolean;
}

export const checkLfsStatus = async (repo: Repository | null): Promise<{ installed: boolean; tracked: string[] }> => {
    if (!repo) return { installed: false, tracked: [] };
    const dir = getRepoPath(repo);
    if (!dir) return { installed: false, tracked: [] };

    try {
        const { execFileSync } = require('child_process');
        // Check if LFS is installed
        let installed = false;
        try {
            execFileSync('git', ['lfs', 'version'], { encoding: 'utf-8', stdio: 'pipe' });
            installed = true;
        } catch {
            installed = false;
        }

        // Get tracked patterns
        let tracked: string[] = [];
        if (installed) {
            try {
                const output = gitExec(['lfs', 'track'], dir);
                tracked = output.trim().split('\n').filter(line => line.trim()).map(line => line.trim());
            } catch {
                // Ignore errors
            }
        }

        return { installed, tracked };
    } catch (error) {
        return { installed: false, tracked: [] };
    }
};

export const gitLfsTrack = async (repo: Repository | null, pattern: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['lfs', 'track', pattern], dir);
    } catch (error) {
        throw new Error(`Failed to track LFS pattern: ${error.message}`);
    }
};

export const gitLfsUntrack = async (repo: Repository | null, pattern: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['lfs', 'untrack', pattern], dir);
    } catch (error) {
        throw new Error(`Failed to untrack LFS pattern: ${error.message}`);
    }
};

export const gitLfsListFiles = async (repo: Repository | null): Promise<LfsFile[]> => {
    if (!repo) return [];
    const dir = getRepoPath(repo);
    if (!dir) return [];

    try {
        const output = gitExec(['lfs', 'ls-files'], dir);

        const files: LfsFile[] = [];
        const lines = output.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
            // Format: <sha> * <size> <path> or <sha> - <size> <path>
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
                const sha = parts[0];
                const indicator = parts[1]; // * = full file, - = pointer
                const size = parts[2];
                const path = parts.slice(3).join(' ');

                files.push({
                    path,
                    size,
                    isPointer: indicator === '-'
                });
            }
        }

        return files;
    } catch (error) {
        return [];
    }
};

// --- Submodule Operations ---

export interface Submodule {
    path: string;
    url: string;
    branch?: string;
    sha?: string;
    initialized: boolean;
}

export const listSubmodules = async (repo: Repository | null): Promise<Submodule[]> => {
    if (!repo) return [];
    const dir = getRepoPath(repo);
    if (!dir) {
        console.error('No repository path available');
        return [];
    }

    try {
        const fs = require('fs');
        const path = require('path');

        // Parse .gitmodules file
        let submodules: Submodule[] = [];
        try {
            const output = gitExec(['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.(path|url|branch)$'], dir);

            const lines = output.trim().split('\n').filter(line => line.trim());
            const submoduleMap = new Map<string, Partial<Submodule>>();

            for (const line of lines) {
                const match = line.match(/^submodule\.(.+)\.(path|url|branch)\s+(.+)$/);
                if (match) {
                    const [, name, key, value] = match;
                    if (!submoduleMap.has(name)) {
                        submoduleMap.set(name, {});
                    }
                    const sub = submoduleMap.get(name)!;
                    if (key === 'path') sub.path = value;
                    else if (key === 'url') sub.url = value;
                    else if (key === 'branch') sub.branch = value;
                }
            }

            // Check initialization status
            for (const [name, sub] of submoduleMap) {
                let initialized = false;
                let sha: string | undefined;

                if (sub.path) {
                    try {
                        // Check if submodule directory exists and has .git
                        const submoduleGitPath = path.join(dir, sub.path, '.git');
                        fs.accessSync(submoduleGitPath);
                        initialized = true;

                        // Get current SHA
                        const shaOutput = gitExec(['-C', sub.path!, 'rev-parse', 'HEAD'], dir);
                        sha = shaOutput.trim();
                    } catch {
                        initialized = false;
                    }
                }

                submodules.push({
                    path: sub.path || name,
                    url: sub.url || '',
                    branch: sub.branch,
                    sha,
                    initialized
                });
            }
        } catch {
            // No .gitmodules or error parsing
        }

        return submodules;
    } catch (error) {
        console.error('Error listing submodules:', error);
        return [];
    }
};

export const initSubmodule = async (repo: Repository | null, submodulePath: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['submodule', 'init', '--', submodulePath], dir);
    } catch (error) {
        throw new Error(`Failed to init submodule: ${error.message}`);
    }
};

export const updateSubmodule = async (repo: Repository | null, submodulePath: string): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['submodule', 'update', '--', submodulePath], dir);
    } catch (error) {
        throw new Error(`Failed to update submodule: ${error.message}`);
    }
};

export const updateAllSubmodules = async (repo: Repository | null): Promise<void> => {
    if (!repo) throw new Error('No repository selected');
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        gitExec(['submodule', 'update', '--init', '--recursive'], dir);
    } catch (error) {
        throw new Error(`Failed to update submodules: ${error.message}`);
    }
};

// --- New functions for gap closure ---

/**
 * Push a tag to remote
 */
export const gitPushTag = async (repo: Repository, tagName: string, remote: string = 'origin'): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    const startTime = Date.now();
    try {
        gitExec(['push', remote, tagName], dir);
        logGitCommand('git push', [remote, tagName], true, Date.now() - startTime);
    } catch (error) {
        logGitCommand('git push', [remote, tagName], false, Date.now() - startTime, error.message);
        throw new Error(`Failed to push tag "${tagName}": ${sanitizeErrorMessage(error.stderr || error.message)}`);
    }
};

/**
 * Set upstream tracking branch
 */
export const gitSetUpstream = async (repo: Repository, branchName: string, remote: string = 'origin', remoteBranch?: string): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    const targetRemoteBranch = remoteBranch || branchName;
    const startTime = Date.now();
    try {
        gitExec(['branch', `--set-upstream-to=${remote}/${targetRemoteBranch}`, branchName], dir);
        logGitCommand('git branch', ['--set-upstream-to', `${remote}/${targetRemoteBranch}`, branchName], true, Date.now() - startTime);
    } catch (error) {
        logGitCommand('git branch', ['--set-upstream-to', `${remote}/${targetRemoteBranch}`, branchName], false, Date.now() - startTime, error.message);
        throw new Error(`Failed to set upstream: ${sanitizeErrorMessage(error.stderr || error.message)}`);
    }
};

/**
 * Find large files in the repository
 */
export const findLargeFiles = async (repo: Repository, thresholdMB: number = 10): Promise<{ path: string; sizeMB: number }[]> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        const nodefs = require('fs');
        const path = require('path');

        const output = gitExec(['ls-files'], dir);
        const files = output.trim().split('\n').filter(Boolean);
        const largeFiles: { path: string; sizeMB: number }[] = [];

        for (const file of files) {
            try {
                const fullPath = path.join(dir, file);
                const stat = nodefs.statSync(fullPath);
                const sizeMB = stat.size / (1024 * 1024);
                if (sizeMB >= thresholdMB) {
                    largeFiles.push({ path: file, sizeMB: Math.round(sizeMB * 100) / 100 });
                }
            } catch {
                // Skip files that can't be stat'd
            }
        }

        return largeFiles;
    } catch {
        return [];
    }
};

/**
 * Git rebase one branch onto another
 */
export const gitRebase = async (repo: Repository, ontoBranch: string): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    const startTime = Date.now();
    try {
        gitExec(['rebase', ontoBranch], dir);
        logGitCommand('git rebase', [ontoBranch], true, Date.now() - startTime);
    } catch (error) {
        logGitCommand('git rebase', [ontoBranch], false, Date.now() - startTime, error.message);
        throw new Error(`Rebase failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
    }
};

/**
 * Compare two branches - returns commits unique to each
 */
export const gitCompareBranches = async (repo: Repository, branch1: string, branch2: string): Promise<{ ahead: Commit[]; behind: Commit[] }> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    try {
        // Commits in branch1 not in branch2
        const aheadOutput = gitExec(['log', '--oneline', `${branch2}..${branch1}`], dir);
        const aheadLines = aheadOutput.trim().split('\n').filter(Boolean);

        // Commits in branch2 not in branch1
        const behindOutput = gitExec(['log', '--oneline', `${branch1}..${branch2}`], dir);
        const behindLines = behindOutput.trim().split('\n').filter(Boolean);

        const parseLogLine = (line: string): Commit => {
            const [shortId, ...msgParts] = line.split(' ');
            return {
                id: shortId,
                shortId,
                message: msgParts.join(' '),
                author: '',
                date: '',
                parents: [],
                lane: 0,
                color: '#999',
            };
        };

        return {
            ahead: aheadLines.map(parseLogLine),
            behind: behindLines.map(parseLogLine),
        };
    } catch (error) {
        throw new Error(`Branch comparison failed: ${error.message}`);
    }
};

/**
 * Drop a commit (interactive rebase to remove it)
 */
export const gitDropCommit = async (repo: Repository, commitId: string): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    const startTime = Date.now();
    try {
        gitExec(['rebase', '--onto', `${commitId}^`, commitId], dir);
        logGitCommand('git rebase', ['--onto', `${commitId}^`, commitId], true, Date.now() - startTime);
    } catch (error) {
        logGitCommand('git rebase', ['--onto', `${commitId}^`, commitId], false, Date.now() - startTime, error.message);
        throw new Error(`Drop commit failed: ${error.stderr || error.message}`);
    }
};

/**
 * Reset a branch to a specific ref
 */
export const gitResetBranch = async (repo: Repository, branchName: string, targetRef: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    const startTime = Date.now();
    try {
        gitExec(['checkout', branchName], dir);
        gitExec(['reset', `--${mode}`, targetRef], dir);
        logGitCommand('git reset', [`--${mode}`, targetRef], true, Date.now() - startTime);
    } catch (error) {
        logGitCommand('git reset', [`--${mode}`, targetRef], false, Date.now() - startTime, error.message);
        throw new Error(`Reset branch failed: ${error.stderr || error.message}`);
    }
};

// ============================================================
// NEW FEATURES - Phase 1: File Operations
// ============================================================

/**
 * Create a new file in the repository
 * @param repo Repository object
 * @param filepath Relative path for the new file (e.g., "src/utils/newFile.js")
 * @param content Initial content for the file (defaults to empty)
 */
export const gitCreateFile = async (repo: Repository, filepath: string, content: string = ''): Promise<void> => {
    const { fs, dir } = getGitContext(repo);

    // Sanitize filepath - remove leading slashes
    const cleanPath = filepath.replace(/^\/+/, '');

    // Create parent directories if needed
    const pathParts = cleanPath.split('/');
    if (pathParts.length > 1) {
        const parentDir = pathParts.slice(0, -1).join('/');
        const fullDirPath = typeof dir === 'string' ? `${dir}/${parentDir}` : `/${parentDir}`;
        try {
            await fs.promises.mkdir(fullDirPath, { recursive: true });
        } catch (e) {
            // Directory might already exist, ignore EEXIST errors
            if (e.code !== 'EEXIST') {
                throw new Error(`Failed to create directory ${fullDirPath}: ${e.message}`);
            }
        }
    }

    const fullPath = typeof dir === 'string' ? `${dir}/${cleanPath}` : `/${cleanPath}`;
    await fs.promises.writeFile(fullPath, content, { encoding: 'utf8' });
};

/**
 * Delete a file from the repository (uses git rm for tracked files)
 * @param repo Repository object
 * @param filepath Relative path of the file to delete
 * @param force Force deletion even if file has local modifications
 */
export const gitDeleteFile = async (repo: Repository, filepath: string, force: boolean = false): Promise<void> => {
    const { fs, dir } = getGitContext(repo);
    const cleanPath = filepath.replace(/^\/+/, '');

    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Check if file is tracked
            const status = await git.statusMatrix({ fs, dir, filepaths: [cleanPath] });
            const isTracked = status.length > 0 && status[0][1] !== 0; // HEAD status != absent

            if (isTracked) {
                // Use git rm for tracked files
                const args = force ? ['rm', '-f', '--', cleanPath] : ['rm', '--', cleanPath];
                gitExec(args, dir);
            } else {
                // Just delete untracked file
                const nodefs = require('fs');
                const path = require('path');
                nodefs.unlinkSync(path.join(dir, cleanPath));
            }
        } catch (error) {
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    } else {
        // Browser mode - just unlink
        const fullPath = typeof dir === 'string' ? `${dir}/${cleanPath}` : `/${cleanPath}`;
        await fs.promises.unlink(fullPath);
    }
};

/**
 * Delete multiple files from the repository
 */
export const gitDeleteFiles = async (repo: Repository, filepaths: string[], force: boolean = false): Promise<void> => {
    // Parallelize file deletions for better performance
    await Promise.all(filepaths.map(filepath => gitDeleteFile(repo, filepath, force)));
};

/**
 * List all files in the repository (not just changed files)
 * @param repo Repository object
 * @param includeGitIgnored Whether to include gitignored files (default: false)
 */
export const gitListAllFiles = async (repo: Repository, includeGitIgnored: boolean = false): Promise<string[]> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (isNodeEnv && typeof dir === 'string') {
        try {
            // Use git ls-files to get tracked files
            const tracked = gitExec(['ls-files'], dir).trim().split('\n').filter(Boolean);

            // Get untracked files
            const args = includeGitIgnored
                ? ['ls-files', '--others']
                : ['ls-files', '--others', '--exclude-standard'];
            const untracked = gitExec(args, dir).trim().split('\n').filter(Boolean);

            return [...tracked, ...untracked].sort();
        } catch (error) {
            throw new Error(`Failed to list files: ${error.message}`);
        }
    } else {
        // Browser mode - walk the directory
        const { fs } = getGitContext(repo);
        const files: string[] = [];

        const walk = async (currentPath: string): Promise<void> => {
            const entries = await fs.promises.readdir(currentPath);
            for (const entry of entries) {
                if (entry === '.git') continue;
                const fullPath = currentPath === '/' ? `/${entry}` : `${currentPath}/${entry}`;
                try {
                    const stat = await fs.promises.stat(fullPath);
                    if (stat.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        files.push(fullPath.replace(/^\//, ''));
                    }
                } catch {
                    // Skip inaccessible files
                }
            }
        };

        await walk('/');
        return files.sort();
    }
};

/**
 * Commit and push in a single operation
 * @param repo Repository object
 * @param message Commit message
 * @param author Author information
 * @param token GitHub token for push authentication
 * @param options Additional options
 */
export const gitCommitAndPush = async (
    repo: Repository,
    message: string,
    author: { name: string; email: string },
    token: string | null,
    options?: {
        noVerify?: boolean;
        coAuthors?: Array<{ name: string; email: string }>;
    }
): Promise<{ commitSha: string }> => {
    const { fs, dir } = getGitContext(repo);

    // Build the full commit message with co-authors
    let fullMessage = message;
    if (options?.coAuthors && options.coAuthors.length > 0) {
        fullMessage += '\n\n';
        for (const coAuthor of options.coAuthors) {
            fullMessage += `Co-Authored-By: ${coAuthor.name} <${coAuthor.email}>\n`;
        }
    }

    // Commit
    let commitSha: string;
    if (isNodeEnv && typeof dir === 'string') {
        try {
            const commitArgs = [
                '-c', `user.name=${author.name}`,
                '-c', `user.email=${author.email}`,
                'commit',
                '-m', fullMessage
            ];
            if (options?.noVerify) {
                commitArgs.push('--no-verify');
            }
            gitExec(commitArgs, dir);
            commitSha = gitExec(['rev-parse', 'HEAD'], dir).trim();
        } catch (error) {
            throw new Error(`Commit failed: ${error.stderr || error.message}`);
        }
    } else {
        // isomorphic-git
        commitSha = await git.commit({ fs, dir, message: fullMessage, author });
    }

    // Push
    try {
        await gitPush(repo, token, author);
    } catch (error) {
        // Commit succeeded but push failed
        throw new Error(`Commit succeeded (${commitSha.substring(0, 7)}) but push failed: ${error.message}`);
    }

    return { commitSha };
};

/**
 * Create a commit with options
 */
export const gitCommitWithOptions = async (
    repo: Repository,
    message: string,
    author: { name: string; email: string },
    options?: {
        noVerify?: boolean;
        coAuthors?: Array<{ name: string; email: string }>;
        amend?: boolean;
    }
): Promise<string> => {
    const { fs, dir } = getGitContext(repo);

    // Build the full commit message with co-authors
    let fullMessage = message;
    if (options?.coAuthors && options.coAuthors.length > 0) {
        fullMessage += '\n\n';
        for (const coAuthor of options.coAuthors) {
            fullMessage += `Co-Authored-By: ${coAuthor.name} <${coAuthor.email}>\n`;
        }
    }

    if (isNodeEnv && typeof dir === 'string') {
        try {
            const commitArgs = [
                '-c', `user.name=${author.name}`,
                '-c', `user.email=${author.email}`,
                'commit',
                '-m', fullMessage
            ];
            if (options?.noVerify) {
                commitArgs.push('--no-verify');
            }
            if (options?.amend) {
                commitArgs.push('--amend');
            }
            gitExec(commitArgs, dir);
            return gitExec(['rev-parse', 'HEAD'], dir).trim();
        } catch (error) {
            throw new Error(`Commit failed: ${error.stderr || error.message}`);
        }
    } else {
        // isomorphic-git
        const commitOptions: any = { fs, dir, message: fullMessage, author };
        if (options?.amend) {
            commitOptions.amend = true;
        }
        return await git.commit(commitOptions);
    }
};

// ============================================================
// NEW FEATURES - Phase 2: Git Worktrees
// ============================================================

export interface Worktree {
    path: string;
    branch: string;
    head: string;
    isMain: boolean;
    isLocked: boolean;
    prunable?: boolean;
}

/**
 * List all git worktrees
 */
export const gitWorktreeList = async (repo: Repository): Promise<Worktree[]> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (!isNodeEnv) {
        throw new Error('Worktrees are only supported in Electron/desktop mode');
    }

    try {
        const output = gitExec(['worktree', 'list', '--porcelain'], dir);
        const worktrees: Worktree[] = [];
        let current: Partial<Worktree> = {};

        for (const line of output.split('\n')) {
            if (line.startsWith('worktree ')) {
                if (current.path) {
                    worktrees.push(current as Worktree);
                }
                current = {
                    path: line.substring(9),
                    isMain: false,
                    isLocked: false
                };
            } else if (line.startsWith('HEAD ')) {
                current.head = line.substring(5);
            } else if (line.startsWith('branch ')) {
                current.branch = line.substring(7).replace('refs/heads/', '');
            } else if (line === 'bare') {
                current.isMain = true;
            } else if (line === 'locked') {
                current.isLocked = true;
            } else if (line === 'prunable') {
                current.prunable = true;
            }
        }

        if (current.path) {
            worktrees.push(current as Worktree);
        }

        // Mark the first worktree as main
        if (worktrees.length > 0) {
            worktrees[0].isMain = true;
        }

        return worktrees;
    } catch (error) {
        throw new Error(`Failed to list worktrees: ${error.message}`);
    }
};

/**
 * Add a new worktree
 */
export const gitWorktreeAdd = async (
    repo: Repository,
    path: string,
    branch: string,
    options?: { createBranch?: boolean; force?: boolean }
): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (!isNodeEnv) {
        throw new Error('Worktrees are only supported in Electron/desktop mode');
    }

    try {
        const args = ['worktree', 'add'];
        if (options?.force) {
            args.push('-f');
        }
        if (options?.createBranch) {
            args.push('-b', branch, path);
        } else {
            args.push(path, branch);
        }
        gitExec(args, dir);
    } catch (error) {
        throw new Error(`Failed to add worktree: ${error.message}`);
    }
};

/**
 * Remove a worktree
 */
export const gitWorktreeRemove = async (repo: Repository, worktreePath: string, force: boolean = false): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (!isNodeEnv) {
        throw new Error('Worktrees are only supported in Electron/desktop mode');
    }

    try {
        const args = ['worktree', 'remove'];
        if (force) {
            args.push('--force');
        }
        args.push(worktreePath);
        gitExec(args, dir);
    } catch (error) {
        throw new Error(`Failed to remove worktree: ${error.message}`);
    }
};

/**
 * Lock a worktree (prevent pruning)
 */
export const gitWorktreeLock = async (repo: Repository, worktreePath: string, reason?: string): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (!isNodeEnv) {
        throw new Error('Worktrees are only supported in Electron/desktop mode');
    }

    try {
        const args = ['worktree', 'lock'];
        if (reason) {
            args.push('--reason', reason);
        }
        args.push(worktreePath);
        gitExec(args, dir);
    } catch (error) {
        throw new Error(`Failed to lock worktree: ${error.message}`);
    }
};

/**
 * Unlock a worktree
 */
export const gitWorktreeUnlock = async (repo: Repository, worktreePath: string): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (!isNodeEnv) {
        throw new Error('Worktrees are only supported in Electron/desktop mode');
    }

    try {
        gitExec(['worktree', 'unlock', worktreePath], dir);
    } catch (error) {
        throw new Error(`Failed to unlock worktree: ${error.message}`);
    }
};

/**
 * Prune worktree administrative files for deleted worktrees
 */
export const gitWorktreePrune = async (repo: Repository): Promise<void> => {
    const dir = getRepoPath(repo);
    if (!dir) throw new Error('No repository path available');

    if (!isNodeEnv) {
        throw new Error('Worktrees are only supported in Electron/desktop mode');
    }

    try {
        gitExec(['worktree', 'prune'], dir);
    } catch (error) {
        throw new Error(`Failed to prune worktrees: ${error.message}`);
    }
};

// ============================================================
// NEW FEATURES - Git Config Template Support
// ============================================================

/**
 * Get commit template from git config
 */
export const gitGetConfigTemplate = async (repo: Repository): Promise<string | null> => {
    const dir = getRepoPath(repo);
    if (!dir) return null;

    if (!isNodeEnv) return null;

    try {
        // Try local config first
        try {
            const template = gitExec(['config', '--local', 'commit.template'], dir).trim();
            if (template) {
                const nodefs = require('fs');
                const path = require('path');
                const templatePath = path.isAbsolute(template)
                    ? template
                    : path.join(dir, template);
                return nodefs.readFileSync(templatePath, 'utf8');
            }
        } catch {
            // No local template
        }

        // Try global config
        try {
            const template = gitExec(['config', '--global', 'commit.template'], dir).trim();
            if (template) {
                const nodefs = require('fs');
                const os = require('os');
                const path = require('path');
                // Expand ~ to home directory
                const expandedPath = template.startsWith('~')
                    ? path.join(os.homedir(), template.substring(1))
                    : template;
                return nodefs.readFileSync(expandedPath, 'utf8');
            }
        } catch {
            // No global template
        }

        // Try default locations
        const os = require('os');
        const path = require('path');
        const nodefs = require('fs');
        const defaultPaths = [
            path.join(os.homedir(), '.gitmessage'),
            path.join(os.homedir(), '.gitmessage.txt'),
            path.join(dir, '.gitmessage'),
            path.join(dir, '.gitmessage.txt'),
        ];

        for (const templatePath of defaultPaths) {
            try {
                return nodefs.readFileSync(templatePath, 'utf8');
            } catch {
                // Not found, try next
            }
        }

        return null;
    } catch {
        return null;
    }
};

// ============================================================
// NEW FEATURES - Clone with Options
// ============================================================

/**
 * Clone a repository with advanced options
 */
export const gitCloneWithOptions = async (
    repo: Repository,
    token: string | null,
    targetDir: string,
    options?: {
        depth?: number;           // Shallow clone depth
        branch?: string;          // Specific branch to clone
        singleBranch?: boolean;   // Only clone the specified branch
    }
): Promise<void> => {
    if (!isNodeEnv) {
        throw new Error('Clone is only supported in Electron/desktop mode');
    }

    const { execFileSync } = require('child_process');
    const remoteUrl = repo.clone_url || `https://github.com/${repo.full_name}.git`;

    try {
        const args = ['clone'];

        if (options?.depth) {
            args.push('--depth', String(options.depth));
        }

        if (options?.branch) {
            args.push('-b', options.branch);
        }

        if (options?.singleBranch) {
            args.push('--single-branch');
        }

        args.push(remoteUrl, targetDir);

        if (token) {
            // Use GIT_ASKPASS pattern
            const path = require('path');
            const os = require('os');
            const fs2 = require('fs');
            const isWindows = process.platform === 'win32';
            const scriptExt = isWindows ? '.bat' : '.sh';
            const scriptPath = path.join(os.tmpdir(), `git-askpass-${Date.now()}${scriptExt}`);
            const scriptContent = isWindows
                ? `@echo off\necho ${token}\n`
                : `#!/bin/sh\necho "${token}"\n`;
            fs2.writeFileSync(scriptPath, scriptContent, { mode: 0o700 });
            try {
                execFileSync('git', args, {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    env: {
                        ...process.env,
                        GIT_ASKPASS: scriptPath,
                        GIT_TERMINAL_PROMPT: '0',
                    },
                });
            } finally {
                try { fs2.unlinkSync(scriptPath); } catch (e) { /* ignore */ }
            }
        } else {
            execFileSync('git', args, { encoding: 'utf-8', stdio: 'pipe' });
        }
    } catch (error) {
        throw new Error(`Clone failed: ${sanitizeErrorMessage(error.stderr || error.message)}`);
    }
};

/**
 * Detect file encoding (simplified - checks for UTF-8 BOM and binary content)
 */
export const detectFileEncoding = async (repo: Repository, filepath: string): Promise<{ encoding: string; hasBom: boolean; isBinary: boolean }> => {
    const { fs, dir } = getGitContext(repo);
    const fullPath = typeof dir === 'string' ? `${dir}/${filepath}` : `/${filepath}`;

    try {
        // Read first chunk of file as buffer
        if (isNodeEnv && typeof dir === 'string') {
            const nodefs = require('fs');
            const buffer = nodefs.readFileSync(fullPath);
            const first4Bytes = buffer.slice(0, 4);

            // Check for BOM
            let hasBom = false;
            let encoding = 'UTF-8';

            if (first4Bytes[0] === 0xEF && first4Bytes[1] === 0xBB && first4Bytes[2] === 0xBF) {
                hasBom = true;
                encoding = 'UTF-8';
            } else if (first4Bytes[0] === 0xFF && first4Bytes[1] === 0xFE) {
                hasBom = true;
                encoding = 'UTF-16 LE';
            } else if (first4Bytes[0] === 0xFE && first4Bytes[1] === 0xFF) {
                hasBom = true;
                encoding = 'UTF-16 BE';
            }

            // Check for binary content (null bytes in first 8KB)
            const checkSize = Math.min(buffer.length, 8192);
            let isBinary = false;
            for (let i = 0; i < checkSize; i++) {
                if (buffer[i] === 0) {
                    isBinary = true;
                    break;
                }
            }

            return { encoding, hasBom, isBinary };
        } else {
            // Browser mode - limited detection
            const content = await fs.promises.readFile(fullPath);
            const bytes = new Uint8Array(content instanceof ArrayBuffer ? content : content.buffer);

            let hasBom = false;
            let encoding = 'UTF-8';

            if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                hasBom = true;
            }

            // Simple binary check
            const checkSize = Math.min(bytes.length, 8192);
            let isBinary = false;
            for (let i = 0; i < checkSize; i++) {
                if (bytes[i] === 0) {
                    isBinary = true;
                    break;
                }
            }

            return { encoding, hasBom, isBinary };
        }
    } catch {
        return { encoding: 'UTF-8', hasBom: false, isBinary: false };
    }
};
