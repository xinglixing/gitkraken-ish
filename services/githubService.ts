import { Repository, Branch, Commit, User, Issue, PullRequest, WorkflowRun, WorkflowJob, FileChange } from '../types';

const BASE_URL = 'https://api.github.com';

const getHeaders = (token: string) => ({
  'Authorization': `token ${token}`,
  'Accept': 'application/vnd.github.v3+json',
});

// Simple request cache to prevent rapid duplicate API calls.
// Caches GET responses for CACHE_TTL_MS, keyed by URL.
const CACHE_TTL_MS = 2000;
const MAX_CACHE_SIZE = 50;
const requestCache = new Map<string, { data: any; timestamp: number }>();

// Clean expired entries from the cache
const cleanExpiredCache = (now: number) => {
  for (const [key, entry] of requestCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      requestCache.delete(key);
    }
  }
};

const cachedFetch = async (url: string, headers: Record<string, string>): Promise<any> => {
  const now = Date.now();

  // Clean expired entries before checking cache
  if (requestCache.size > MAX_CACHE_SIZE / 2) {
    cleanExpiredCache(now);
  }

  const cached = requestCache.get(url);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  requestCache.set(url, { data, timestamp: now });

  // Hard limit: if cache is too large, remove oldest entries
  if (requestCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(requestCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE / 2);
    for (const [key] of toRemove) {
      requestCache.delete(key);
    }
  }

  return data;
};

export const validateToken = async (token: string): Promise<User> => {
  const response = await fetch(`${BASE_URL}/user`, { headers: getHeaders(token) });
  if (!response.ok) throw new Error('Invalid Token');
  const data = await response.json();
  return {
    ...data,
    name: data.name || data.login
  };
};

export const fetchRepositories = async (token: string): Promise<Repository[]> => {
  const response = await fetch(`${BASE_URL}/user/repos?sort=pushed&per_page=100&direction=desc`, { 
    headers: getHeaders(token) 
  });
  if (!response.ok) throw new Error('Failed to fetch repositories');
  return response.json();
};

export const fetchBranches = async (token: string, owner: string, repo: string): Promise<Branch[]> => {
  const data = await cachedFetch(`${BASE_URL}/repos/${owner}/${repo}/branches`, getHeaders(token));
  
  return data.map((b: any) => ({
    name: b.name,
    commitId: b.commit?.sha || '',
    isRemote: false,
  }));
};

export const fetchCommits = async (
  token: string,
  owner: string,
  repo: string,
  branch: string = 'main',
  page: number = 1,
  perPage: number = 20
): Promise<Commit[]> => {
  const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}&page=${page}`, {
    headers: getHeaders(token)
  });
  if (!response.ok) throw new Error('Failed to fetch commits');
  const data = await response.json();

  return Promise.all(data.map(async (c: any) => {
    const message = c.commit?.message || '';
    return {
      id: c.sha,
      shortId: c.sha.substring(0, 7),
      message: message.split('\n')[0],
      author: c.commit?.author?.name || 'Unknown',
      avatarUrl: c.author?.avatar_url || c.committer?.avatar_url,
      date: new Date(c.commit?.author?.date || Date.now()).toISOString(),
      parents: (c.parents || []).map((p: any) => p.sha),
      lane: 0, // Placeholder, calculated in App.tsx
      color: '#888', // Placeholder
      url: c.html_url
    };
  }));
};

export const fetchCommitDetails = async (token: string, owner: string, repo: string, sha: string): Promise<Commit> => {
  const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/commits/${sha}`, {
    headers: getHeaders(token)
  });
  if (!response.ok) throw new Error('Failed to fetch commit details');
  const data = await response.json();

  return {
    id: data.sha,
    shortId: data.sha.substring(0, 7),
    message: data.commit?.message || '',
    author: data.commit?.author?.name || 'Unknown',
    avatarUrl: data.author?.avatar_url,
    date: new Date(data.commit?.author?.date || Date.now()).toLocaleString(),
    parents: (data.parents || []).map((p: any) => p.sha),
    lane: 0,
    color: '#60a5fa',
    changes: (data.files || []).map((f: any) => ({
      filename: f.filename || '',
      status: f.status || 'modified',
      additions: f.additions || 0,
      deletions: f.deletions || 0,
      patch: f.patch || '',
      staged: false
    }))
  };
};

export const fetchPullRequests = async (token: string, owner: string, repo: string): Promise<PullRequest[]> => {
  let data: any;
  try {
    data = await cachedFetch(`${BASE_URL}/repos/${owner}/${repo}/pulls?state=all&per_page=10`, getHeaders(token));
  } catch {
    return [];
  }
  return data.map((pr: any) => ({
    id: pr.id,
    title: pr.title,
    number: pr.number,
    author: pr.user.login,
    status: pr.state === 'closed' && pr.merged_at ? 'merged' : pr.state,
    checks: 'pending',
    head: pr.head,
    base: pr.base
  }));
};

/**
 * Fetch PR details with mergeable status
 * Note: mergeable is computed async by GitHub and may be null on first request
 */
export const fetchPullRequestDetails = async (token: string, owner: string, repo: string, number: number, retryCount = 0): Promise<PullRequest> => {
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/pulls/${number}`, {
        headers: getHeaders(token)
    });
    if (!response.ok) throw new Error('Failed to fetch PR');
    const pr = await response.json();

    const result: PullRequest = {
        id: pr.id,
        title: pr.title,
        number: pr.number,
        author: pr.user.login,
        status: pr.state === 'closed' && pr.merged_at ? 'merged' : pr.state,
        checks: 'pending',
        body: pr.body,
        created_at: pr.created_at,
        head: pr.head,
        base: pr.base,
        html_url: pr.html_url,
        mergeable: pr.mergeable,
        mergeable_state: pr.mergeable_state
    };

    // If mergeable is still computing (null) and we haven't retried too many times, retry after delay
    if (result.mergeable === null && result.status === 'open' && retryCount < 3) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchPullRequestDetails(token, owner, repo, number, retryCount + 1);
    }

    return result;
};

export const fetchPullRequestFiles = async (token: string, owner: string, repo: string, number: number): Promise<FileChange[]> => {
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/pulls/${number}/files`, {
        headers: getHeaders(token)
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        staged: false
    }));
};

export const mergePullRequest = async (token: string, owner: string, repo: string, number: number): Promise<void> => {
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/pulls/${number}/merge`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({ 
            commit_title: `Merge pull request #${number}`, 
            merge_method: 'merge' 
        })
    });
    
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to merge pull request');
    }
};

export const fetchIssues = async (token: string, owner: string, repo: string): Promise<Issue[]> => {
  let data: any;
  try {
    data = await cachedFetch(`${BASE_URL}/repos/${owner}/${repo}/issues?state=open&per_page=10`, getHeaders(token));
  } catch {
    return [];
  }
  return data.filter((i: any) => !i.pull_request).map((i: any) => ({
    id: i.id,
    title: i.title,
    number: i.number,
    status: i.state,
    author: i.user.login
  }));
};

export const fetchIssueDetails = async (token: string, owner: string, repo: string, number: number): Promise<Issue> => {
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/issues/${number}`, {
        headers: getHeaders(token)
    });
    if (!response.ok) throw new Error('Failed to fetch Issue');
    const i = await response.json();
    return {
        id: i.id,
        title: i.title,
        number: i.number,
        status: i.state,
        author: i.user.login,
        body: i.body,
        created_at: i.created_at,
        html_url: i.html_url
    };
};

export const fetchWorkflowRuns = async (token: string, owner: string, repo: string): Promise<WorkflowRun[]> => {
    let data: any;
    try {
        data = await cachedFetch(`${BASE_URL}/repos/${owner}/${repo}/actions/runs?per_page=15`, getHeaders(token));
    } catch {
        return [];
    }
    return data.workflow_runs.map((run: any) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch,
        created_at: run.created_at,
        actor: run.actor.login,
        display_title: run.display_title
    }));
};

export const fetchWorkflowRun = async (token: string, owner: string, repo: string, runId: number): Promise<WorkflowRun> => {
    const data = await cachedFetch(`${BASE_URL}/repos/${owner}/${repo}/actions/runs/${runId}`, getHeaders(token));
    return {
        id: data.id,
        name: data.name,
        status: data.status,
        conclusion: data.conclusion,
        branch: data.head_branch,
        created_at: data.created_at,
        actor: data.actor.login,
        display_title: data.display_title
    };
};

export const fetchWorkflowJobs = async (token: string, owner: string, repo: string, runId: number): Promise<WorkflowJob[]> => {
    let data: any;
    try {
        data = await cachedFetch(`${BASE_URL}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, getHeaders(token));
    } catch {
        return [];
    }
    return data.jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
        steps: job.steps.map((s: any) => ({
            name: s.name,
            status: s.status,
            conclusion: s.conclusion,
            number: s.number,
            started_at: s.started_at,
            completed_at: s.completed_at
        }))
    }));
}

export const createPullRequest = async (
    token: string, owner: string, repo: string,
    title: string, body: string, head: string, base: string
): Promise<{ number: number; html_url: string }> => {
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: {
            ...getHeaders(token),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, head, base }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Failed to create pull request (${response.status})`);
    }
    const data = await response.json();
    return { number: data.number, html_url: data.html_url };
};

export const fetchJobLogs = async (token: string, owner: string, repo: string, jobId: number): Promise<string> => {
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
        },
        redirect: 'follow'
    });
    if (!response.ok) throw new Error('Failed to fetch job logs');
    return await response.text();
};