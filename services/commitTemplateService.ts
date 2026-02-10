import { CommitTemplate, Repository } from '../types';
import { gitGetConfigTemplate } from './localGitService';

const STORAGE_KEY = 'gk_commit_templates';

// Cache for git config templates to avoid repeated file reads
let gitConfigTemplateCache: { [repoPath: string]: { template: string | null; timestamp: number } } = {};
const CACHE_TTL = 30000; // 30 seconds

export const CONVENTIONAL_TYPES = [
  { type: 'feat', description: 'A new feature' },
  { type: 'fix', description: 'A bug fix' },
  { type: 'docs', description: 'Documentation only changes' },
  { type: 'style', description: 'Code style changes (formatting, etc.)' },
  { type: 'refactor', description: 'Code refactoring' },
  { type: 'perf', description: 'Performance improvements' },
  { type: 'test', description: 'Adding or fixing tests' },
  { type: 'build', description: 'Build system or dependencies' },
  { type: 'ci', description: 'CI configuration changes' },
  { type: 'chore', description: 'Other changes (maintenance)' },
  { type: 'revert', description: 'Reverts a previous commit' },
];

export const BUILT_IN_TEMPLATES: CommitTemplate[] = [
  {
    id: 'conventional',
    name: 'Conventional Commit',
    template: '{type}({scope}): {description}',
    isBuiltIn: true,
  },
  {
    id: 'simple',
    name: 'Simple',
    template: '{description}',
    isBuiltIn: true,
  },
  {
    id: 'detailed',
    name: 'Detailed',
    template: '{description}\n\n{body}\n\n{footer}',
    isBuiltIn: true,
  },
];

export const getUserTemplates = (): CommitTemplate[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load commit templates:', e);
  }
  return [];
};

export const saveUserTemplate = (template: CommitTemplate): void => {
  const templates = getUserTemplates();
  const existingIndex = templates.findIndex(t => t.id === template.id);
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    templates.push(template);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn('Failed to save commit template (storage quota exceeded?):', e);
  }
};

export const deleteUserTemplate = (id: string): void => {
  const templates = getUserTemplates().filter(t => t.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn('Failed to save commit templates:', e);
  }
};

export const getAllTemplates = (): CommitTemplate[] => {
  return [...BUILT_IN_TEMPLATES, ...getUserTemplates()];
};

export const getScopeSuggestions = (recentMessages: string[]): string[] => {
  const scopes = new Set<string>();
  const scopeRegex = /^[a-z]+\(([^)]+)\):/i;
  for (const msg of recentMessages) {
    const match = msg.match(scopeRegex);
    if (match && match[1]) {
      scopes.add(match[1]);
    }
  }
  return Array.from(scopes);
};

export const buildConventionalMessage = (
  type: string,
  scope: string,
  description: string,
  body?: string,
  breaking?: boolean
): string => {
  let msg = type;
  if (scope) msg += `(${scope})`;
  if (breaking) msg += '!';
  msg += `: ${description}`;
  if (body) msg += `\n\n${body}`;
  if (breaking) msg += `\n\nBREAKING CHANGE: ${description}`;
  return msg;
};

/**
 * Get commit template from git config
 * Checks in order:
 * 1. Local repo .gitmessage file
 * 2. Git config commit.template setting
 * 3. Global ~/.gitmessage file
 *
 * Uses caching to avoid repeated file reads
 */
export const getGitConfigTemplate = async (repo: Repository | null): Promise<string | null> => {
  if (!repo?.isLocal || !repo?.path) {
    return null;
  }

  const repoPath = repo.path;
  const now = Date.now();

  // Check cache
  const cached = gitConfigTemplateCache[repoPath];
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.template;
  }

  try {
    const template = await gitGetConfigTemplate(repo);

    // Update cache
    gitConfigTemplateCache[repoPath] = {
      template,
      timestamp: now,
    };

    return template;
  } catch (e) {
    console.error('Failed to load git config template:', e);
    return null;
  }
};

/**
 * Clear the git config template cache for a specific repo or all repos
 */
export const clearGitConfigTemplateCache = (repoPath?: string): void => {
  if (repoPath) {
    delete gitConfigTemplateCache[repoPath];
  } else {
    gitConfigTemplateCache = {};
  }
};

/**
 * Get the initial commit message based on git config template
 * Returns the template content if available, otherwise empty string
 */
export const getInitialCommitMessage = async (repo: Repository | null): Promise<string> => {
  const template = await getGitConfigTemplate(repo);
  return template || '';
};

/**
 * Parse a commit template and extract placeholder sections
 * Common placeholders in git commit templates:
 * - Lines starting with # are comments (ignored)
 * - Empty lines separate sections
 */
export const parseGitTemplate = (template: string): {
  message: string;
  comments: string[];
} => {
  const lines = template.split('\n');
  const messageLines: string[] = [];
  const comments: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith('#')) {
      // This is a comment line
      comments.push(line);
    } else {
      messageLines.push(line);
    }
  }

  return {
    message: messageLines.join('\n').trim(),
    comments,
  };
};

/**
 * Check if a repository has a git config template configured
 */
export const hasGitConfigTemplate = async (repo: Repository | null): Promise<boolean> => {
  const template = await getGitConfigTemplate(repo);
  return template !== null && template.trim().length > 0;
};

/**
 * Create a CommitTemplate object from git config template
 */
export const createTemplateFromGitConfig = async (repo: Repository | null): Promise<CommitTemplate | null> => {
  const template = await getGitConfigTemplate(repo);
  if (!template) return null;

  const parsed = parseGitTemplate(template);

  return {
    id: 'git-config',
    name: 'Git Config Template',
    template: parsed.message,
    isBuiltIn: true,
  };
};

/**
 * Get all templates including git config template if available
 */
export const getAllTemplatesWithGitConfig = async (repo: Repository | null): Promise<CommitTemplate[]> => {
  const templates = [...BUILT_IN_TEMPLATES, ...getUserTemplates()];

  const gitConfigTemplate = await createTemplateFromGitConfig(repo);
  if (gitConfigTemplate) {
    // Add git config template at the beginning as it's the user's preferred template
    return [gitConfigTemplate, ...templates];
  }

  return templates;
};
