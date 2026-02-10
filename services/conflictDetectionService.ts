import { Repository, Commit, MergePreview } from '../types';
import git from 'isomorphic-git';

export interface ConflictRegion {
  startLine: number;       // <<<<<<< marker line (0-indexed)
  separatorLine: number;   // ======= marker line
  endLine: number;         // >>>>>>> marker line
  currentContent: string;
  incomingContent: string;
  currentLabel: string;    // e.g. "HEAD"
  incomingLabel: string;   // e.g. "abc1234"
}

export interface ConflictFile {
  path: string;
  currentContent: string;
  incomingContent: string;
  rawContent: string;                    // full file with conflict markers
  conflictRegions: ConflictRegion[];     // all parsed regions
  conflictMarkers?: {
    current: string;
    base: string;
    incoming: string;
  };
}

export interface ConflictWarning {
  hasConflicts: boolean;
  conflictingFiles: string[];
  severity: 'low' | 'medium' | 'high';
  message: string;
}

// Reuse the same context pattern as localGitService
const getGitContext = (repo: Repository) => {
    if (typeof repo.handle === 'string') {
        if (!(window as any).require) {
            throw new Error("This feature requires the Electron desktop app.");
        }
        const fs = (window as any).require('fs');
        return { fs, dir: repo.handle };
    } else {
        throw new Error("Conflict detection requires the Electron desktop app.");
    }
};

/**
 * Detect potential conflicts before cherry-picking or merging
 */
export const detectPotentialConflicts = async (
  repo: Repository,
  sourceCommits: Commit[],
  targetRef: string
): Promise<ConflictWarning> => {
  try {
    const { fs, dir } = getGitContext(repo);

    // Get files changed in source commits by walking their trees
    const sourceFiles = new Set<string>();
    for (const commit of sourceCommits) {
      try {
        const commitData = await git.readCommit({ fs, dir, oid: commit.id });
        const parentOid = commitData.commit.parent[0];
        if (!parentOid) continue;

        // Walk the trees to find changed files
        await git.walk({
          fs, dir,
          trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: commit.id })],
          map: async (filepath, [A, B]) => {
            if (filepath === '.') return;
            const typeA = await A?.type();
            const typeB = await B?.type();
            if (typeA === 'tree' || typeB === 'tree') return;
            const oidA = await A?.oid();
            const oidB = await B?.oid();
            if (oidA !== oidB) {
              sourceFiles.add(filepath);
            }
          }
        });
      } catch (e) {
        // Skip commits we can't analyze
      }
    }

    // Get current working directory modified files
    const status = await git.statusMatrix({ fs, dir });
    const modifiedFiles = status
      .filter(row => row[1] !== row[2] || row[1] !== row[3])
      .map(row => row[0]);

    // Find overlapping files
    const conflicts: string[] = [];
    for (const file of sourceFiles) {
      if (modifiedFiles.includes(file)) {
        conflicts.push(file);
      }
    }

    if (conflicts.length === 0) {
      return {
        hasConflicts: false,
        conflictingFiles: [],
        severity: 'low',
        message: 'No conflicts detected'
      };
    }

    return {
      hasConflicts: true,
      conflictingFiles: conflicts,
      severity: conflicts.length > 5 ? 'high' : conflicts.length > 2 ? 'medium' : 'low',
      message: `Potential conflicts detected in ${conflicts.length} file(s)`
    };

  } catch (error) {
    console.error('Conflict detection failed:', error);
    return {
      hasConflicts: false,
      conflictingFiles: [],
      severity: 'low',
      message: 'Unable to detect conflicts'
    };
  }
};

/**
 * Parse all conflict regions from file content.
 * Returns an array of every <<<<<<< ... ======= ... >>>>>>> block found.
 */
export const parseAllConflictRegions = (content: string): ConflictRegion[] => {
  const lines = content.split('\n');
  const regions: ConflictRegion[] = [];

  let inConflict = false;
  let section: 'current' | 'incoming' = 'current';
  let startLine = 0;
  let separatorLine = 0;
  let currentLines: string[] = [];
  let incomingLines: string[] = [];
  let currentLabel = '';
  let incomingLabel = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      section = 'current';
      startLine = i;
      currentLines = [];
      incomingLines = [];
      currentLabel = line.replace(/^<<<<<<<\s*/, '').trim();
      incomingLabel = '';
    } else if (line.startsWith('=======') && inConflict) {
      section = 'incoming';
      separatorLine = i;
    } else if (line.startsWith('>>>>>>>') && inConflict) {
      incomingLabel = line.replace(/^>>>>>>>\s*/, '').trim();
      regions.push({
        startLine,
        separatorLine,
        endLine: i,
        currentContent: currentLines.join('\n'),
        incomingContent: incomingLines.join('\n'),
        currentLabel,
        incomingLabel
      });
      inConflict = false;
    } else if (inConflict) {
      if (section === 'current') {
        currentLines.push(line);
      } else {
        incomingLines.push(line);
      }
    }
  }

  return regions;
};

/**
 * Parse Git conflict markers from file content (first conflict only - kept for backward compat)
 */
export const parseConflictMarkers = (content: string): ConflictFile['conflictMarkers'] | null => {
  const regions = parseAllConflictRegions(content);
  if (regions.length === 0) return null;

  return {
    current: regions[0].currentContent,
    base: '',
    incoming: regions[0].incomingContent
  };
};

/**
 * Find all conflicted files in repository
 */
export const findConflictedFiles = async (repo: Repository): Promise<ConflictFile[]> => {
  try {
    const { fs, dir } = getGitContext(repo);

    if (typeof dir !== 'string') return [];

    // Check if we're in a Node environment
    let isNodeEnv = false;
    try {
        require('child_process');
        isNodeEnv = true;
    } catch (e) {
        isNodeEnv = false;
    }

    if (!isNodeEnv) return [];

    const { execFileSync } = require('child_process');
    const nodefs = require('fs');
    const nodePath = require('path');

    /**
     * SECURITY: Safe git command execution using execFileSync.
     * Prevents command injection by passing arguments as an array.
     */
    const safeGit = (args: string[]): string => {
        return execFileSync('git', args, {
            cwd: dir,
            encoding: 'utf-8',
            stdio: 'pipe',
        });
    };

    /**
     * SECURITY: Validate and normalize file path to prevent path traversal.
     * Returns null if the path would escape the repository directory.
     */
    const safePath = (filepath: string): string | null => {
        const fullPath = nodePath.resolve(dir, filepath);
        const resolvedDir = nodePath.resolve(dir);
        if (!fullPath.startsWith(resolvedDir + nodePath.sep) && fullPath !== resolvedDir) {
            console.warn(`[ConflictDetection] Path traversal attempt blocked: ${filepath}`);
            return null;
        }
        return fullPath;
    };

    // Check for MERGE_HEAD, CHERRY_PICK_HEAD, or REBASE_HEAD which indicate conflicts in progress
    let conflictInProgress = false;
    const conflictHeads = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REBASE_HEAD'];
    for (const head of conflictHeads) {
      try {
        safeGit(['rev-parse', '--verify', head]);
        conflictInProgress = true;
        break;
      } catch (e) {
        // This head doesn't exist, try next
      }
    }

    if (!conflictInProgress) {
      // Also check for unmerged entries as a fallback
      try {
        const output = safeGit(['diff', '--name-only', '--diff-filter=U']);
        if (output.trim().length > 0) {
          conflictInProgress = true;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!conflictInProgress) {
      return [];
    }

    // Use git diff --name-only --diff-filter=U to find unmerged files
    let unmergedFiles: string[] = [];
    try {
      const output = safeGit(['diff', '--name-only', '--diff-filter=U']);
      unmergedFiles = output.split('\n').filter(f => f.trim());
    } catch (e) {
      // Fallback: list all tracked files
      try {
        const output = safeGit(['ls-files', '-u']);
        const lines = output.split('\n').filter(l => l.trim());
        const paths = new Set(lines.map(l => l.split('\t').pop() || '').filter(p => p));
        unmergedFiles = [...paths] as string[];
      } catch (e2) {
        console.warn('[ConflictDetection] Could not list unmerged files:', e2);
        return [];
      }
    }

    // Check each unmerged file for conflict markers
    const conflictedFiles: ConflictFile[] = [];
    const conflictPattern = /^<<<<<<<\s/m;

    for (const filepath of unmergedFiles) {
      if (!filepath) continue;

      try {
        // SECURITY: Validate path to prevent directory traversal
        const fullPath = safePath(filepath);
        if (!fullPath) continue;

        const content = nodefs.readFileSync(fullPath, 'utf8');

        if (conflictPattern.test(content)) {
          const conflictRegions = parseAllConflictRegions(content);
          const conflictMarkers = conflictRegions.length > 0 ? {
            current: conflictRegions[0].currentContent,
            base: '',
            incoming: conflictRegions[0].incomingContent
          } : null;

          if (conflictRegions.length > 0 && conflictMarkers) {
            conflictedFiles.push({
              path: filepath,
              currentContent: conflictMarkers.current,
              incomingContent: conflictMarkers.incoming,
              rawContent: content,
              conflictRegions,
              conflictMarkers
            });
          }
        }
      } catch (readError) {
        console.warn(`[ConflictDetection] Could not read file: ${filepath}`);
      }
    }

    return conflictedFiles;

  } catch (error) {
    console.error('[ConflictDetection] Error finding conflicted files:', error);
    return [];
  }
};

/**
 * Check if repository is in conflict state
 */
export const hasConflicts = async (repo: Repository): Promise<boolean> => {
  try {
    const { fs, dir } = getGitContext(repo);
    const status = await git.statusMatrix({ fs, dir });

    // Check for any unmerged entries (stage = 0 means absent from stage, could indicate conflict)
    return status.some(row => row[3] === 0 && row[2] !== 0);
  } catch (error) {
    console.error('Failed to check for conflicts:', error);
    return false;
  }
};

/**
 * Get conflict-free content (accept current or incoming for all conflicts)
 */
export const resolveConflictAccept = (
  content: string,
  side: 'current' | 'incoming' | 'base'
): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  let inConflict = false;
  let section: 'current' | 'incoming' | null = null;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      section = 'current';
      continue;
    }

    if (line.startsWith('=======') && inConflict) {
      section = 'incoming';
      continue;
    }

    if (line.startsWith('>>>>>>>') && inConflict) {
      inConflict = false;
      section = null;
      continue;
    }

    if (!inConflict) {
      // Outside conflict - always include
      result.push(line);
    } else if (section === side) {
      // Inside conflict - include only the chosen side
      result.push(line);
    }
    // 'base' side: for standard conflict markers (without diff3), base is empty
    // so accepting 'base' effectively removes the conflicted section
  }

  return result.join('\n');
};

/**
 * Accept both current and incoming changes for all conflicts (strip markers, keep both sides)
 */
export const resolveConflictAcceptBoth = (content: string): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  let inConflict = false;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      continue;
    }

    if (line.startsWith('=======') && inConflict) {
      // Just skip the separator - keep collecting lines from both sides
      continue;
    }

    if (line.startsWith('>>>>>>>') && inConflict) {
      inConflict = false;
      continue;
    }

    // Include all lines (both sides of conflict + non-conflict lines)
    result.push(line);
  }

  return result.join('\n');
};

/**
 * Resolve only the Nth conflict region in the file, leave others untouched.
 */
export const resolveConflictRegion = (
  content: string,
  regionIndex: number,
  side: 'current' | 'incoming' | 'both'
): string => {
  const lines = content.split('\n');
  const result: string[] = [];
  let inConflict = false;
  let section: 'current' | 'incoming' = 'current';
  let currentRegionIndex = -1;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      section = 'current';
      currentRegionIndex++;

      // If this is NOT the target region, keep the marker as-is
      if (currentRegionIndex !== regionIndex) {
        result.push(line);
      }
      continue;
    }

    if (line.startsWith('=======') && inConflict) {
      section = 'incoming';
      if (currentRegionIndex !== regionIndex) {
        result.push(line);
      }
      continue;
    }

    if (line.startsWith('>>>>>>>') && inConflict) {
      inConflict = false;
      if (currentRegionIndex !== regionIndex) {
        result.push(line);
      }
      continue;
    }

    if (!inConflict) {
      result.push(line);
    } else if (currentRegionIndex === regionIndex) {
      // Target region: include based on chosen side
      if (side === 'both') {
        result.push(line);
      } else if (section === side) {
        result.push(line);
      }
    } else {
      // Non-target region: keep all lines (including markers handled above)
      result.push(line);
    }
  }

  return result.join('\n');
};

/**
 * Generate a merge preview showing commits to merge, risk level, and file overlap
 */
export const generateMergePreview = async (
  repo: Repository,
  sourceBranch: string,
  targetBranch: string,
  commits: Commit[]
): Promise<MergePreview> => {
  try {
    const { fs, dir } = getGitContext(repo);

    // Find files changed in source commits
    const sourceFiles = new Set<string>();
    for (const commit of commits.slice(0, 50)) {
      try {
        const commitData = await git.readCommit({ fs, dir, oid: commit.id });
        const parentOid = commitData.commit.parent[0];
        if (!parentOid) continue;

        await git.walk({
          fs, dir,
          trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: commit.id })],
          map: async (filepath, [A, B]) => {
            if (filepath === '.') return;
            const typeA = await A?.type();
            const typeB = await B?.type();
            if (typeA === 'tree' || typeB === 'tree') return;
            const oidA = await A?.oid();
            const oidB = await B?.oid();
            if (oidA !== oidB) {
              sourceFiles.add(filepath);
            }
          }
        });
      } catch {
        // Skip commits we can't analyze
      }
    }

    // Get files modified on target branch (working dir)
    const status = await git.statusMatrix({ fs, dir });
    const targetFiles = new Set(
      status
        .filter(row => row[1] !== row[2] || row[1] !== row[3])
        .map(row => row[0])
    );

    // Find overlap
    const overlappingFiles: string[] = [];
    for (const file of sourceFiles) {
      if (targetFiles.has(file)) {
        overlappingFiles.push(file);
      }
    }

    // Determine risk
    let conflictRisk: 'low' | 'medium' | 'high' = 'low';
    if (overlappingFiles.length > 5) conflictRisk = 'high';
    else if (overlappingFiles.length > 0) conflictRisk = 'medium';

    return {
      sourceBranch,
      targetBranch,
      commits,
      conflictRisk,
      overlappingFiles,
      totalFiles: sourceFiles.size,
    };
  } catch (error) {
    console.error('Failed to generate merge preview:', error);
    return {
      sourceBranch,
      targetBranch,
      commits,
      conflictRisk: 'low',
      overlappingFiles: [],
      totalFiles: 0,
    };
  }
};
