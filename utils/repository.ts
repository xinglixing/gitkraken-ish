/**
 * Repository Type Utilities
 * Helper functions to determine repository capabilities
 */

import { Repository } from '../types';

/**
 * Check if a repository is remote (GitHub, not local)
 */
export function isRemoteRepo(repo: Repository | undefined | null): boolean {
    if (!repo) return false;
    return !repo.isLocal;
}

/**
 * Check if a repository is local (has full Git access)
 */
export function isLocalRepo(repo: Repository | undefined | null): boolean {
    if (!repo) return false;
    return repo.isLocal === true;
}

/**
 * Check if Git operations are available for this repo
 */
export function supportsGitOperations(repo: Repository | undefined | null): boolean {
    return isLocalRepo(repo);
}

/**
 * Check if repository can be modified (commits, branches, etc.)
 */
export function canModifyRepo(repo: Repository | undefined | null): boolean {
    return isLocalRepo(repo);
}

/**
 * Check if repository is read-only (remote/viewing only)
 */
export function isReadOnlyRepo(repo: Repository | undefined | null): boolean {
    return isRemoteRepo(repo);
}

/**
 * Get repository type description for UI
 */
export function getRepoTypeDescription(repo: Repository | undefined | null): string {
    if (!repo) return 'Unknown';

    if (isLocalRepo(repo)) {
        return 'Local Repository';
    }

    if (repo.owner && repo.name) {
        return `GitHub: ${repo.owner}/${repo.name}`;
    }

    return 'Remote Repository';
}

/**
 * Check if stash operations are available
 */
export function supportsStashOperations(repo: Repository | undefined | null): boolean {
    return isLocalRepo(repo);
}

/**
 * Check if tag creation is available
 */
export function supportsTagCreation(repo: Repository | undefined | null): boolean {
    return isLocalRepo(repo);
}

/**
 * Check if push/pull operations are available
 */
export function supportsRemoteOperations(repo: Repository | undefined | null): boolean {
    return isLocalRepo(repo);
}

/**
 * Get appropriate message when feature is not available
 */
export function getFeatureDisabledMessage(feature: string): string {
    return `⚠️ ${feature} is only available for local repositories.

Remote repositories (GitHub) are view-only.

To enable ${feature.toLowerCase()}:
1. Open a local repository, or
2. Clone this repository locally`;
}
