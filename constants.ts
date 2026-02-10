import { Commit, Branch, Repository } from './types';

export const MOCK_REPO: Repository = {
  id: 1,
  name: 'super-cool-app',
  full_name: 'DevUser/super-cool-app',
  default_branch: 'main',
  private: true,
  owner: {
    login: 'DevUser',
    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
  },
};

export const MOCK_BRANCHES: Branch[] = [
  { name: 'main', commitId: 'c101', isRemote: false },
  { name: 'develop', commitId: 'c102', isRemote: false },
  { name: 'feature/ai-integration', commitId: 'c100', isRemote: false },
  { name: 'origin/main', commitId: 'c104', isRemote: true },
  { name: 'origin/develop', commitId: 'c102', isRemote: true },
];

// Topologically sorted(ish) mock commits for visualization
// Lane 0: main, Lane 1: develop, Lane 2: feature
export const MOCK_COMMITS: Commit[] = [
  {
    id: 'c100',
    shortId: '7a8b9c',
    message: 'feat: Add Gemini API integration service',
    author: 'DevUser',
    date: '2 min ago',
    branch: 'feature/ai-integration',
    parents: ['c102'],
    lane: 2,
    color: '#af7bf0', // Purple
    changes: [
      { filename: 'src/services/gemini.ts', status: 'added', additions: 120, deletions: 0, staged: false },
      { filename: 'package.json', status: 'modified', additions: 1, deletions: 0, staged: false }
    ]
  },
  {
    id: 'c101',
    shortId: '1d2e3f',
    message: 'fix: Resolve layout shift on mobile',
    author: 'SeniorDev',
    date: '1 hour ago',
    branch: 'main',
    parents: ['c104'],
    lane: 0,
    color: '#4d95ec', // Blue
    changes: [
      { filename: 'src/App.css', status: 'modified', additions: 5, deletions: 2, staged: false }
    ]
  },
  {
    id: 'c102',
    shortId: '4g5h6i',
    message: 'chore: Update dependencies',
    author: 'Bot',
    date: '3 hours ago',
    branch: 'develop',
    parents: ['c103'],
    lane: 1,
    color: '#00cc74', // Green
    changes: [
      { filename: 'yarn.lock', status: 'modified', additions: 450, deletions: 320, staged: false }
    ]
  },
  {
    id: 'c103',
    shortId: '7j8k9l',
    message: 'refactor: Extract Button component',
    author: 'DevUser',
    date: 'Yesterday',
    parents: ['c104'],
    lane: 1,
    color: '#00cc74',
    changes: [
      { filename: 'src/components/Button.tsx', status: 'added', additions: 45, deletions: 0, staged: false },
      { filename: 'src/App.tsx', status: 'modified', additions: 2, deletions: 40, staged: false }
    ]
  },
  {
    id: 'c104',
    shortId: '0m1n2o',
    message: 'Merge pull request #42 from feature/login',
    author: 'Maintainer',
    date: '2 days ago',
    branch: 'origin/main',
    parents: ['c105', 'c106'],
    lane: 0,
    color: '#4d95ec',
    changes: []
  },
  {
    id: 'c106',
    shortId: '3p4q5r',
    message: 'feat: Implement login form validation',
    author: 'NewHire',
    date: '3 days ago',
    parents: ['c105'],
    lane: 1,
    color: '#fbc02d', // Yellow
    changes: [
       { filename: 'src/utils/validation.ts', status: 'added', additions: 30, deletions: 0, staged: false }
    ]
  },
  {
    id: 'c105',
    shortId: '6s7t8u',
    message: 'init: Project setup',
    author: 'Maintainer',
    date: '1 week ago',
    parents: [],
    lane: 0,
    color: '#4d95ec',
    changes: [
      { filename: 'README.md', status: 'added', additions: 10, deletions: 0, staged: false },
      { filename: '.gitignore', status: 'added', additions: 5, deletions: 0, staged: false }
    ]
  },
];