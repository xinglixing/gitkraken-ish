import { GoogleGenAI } from "@google/genai";
import { Commit, AIConfig, AIProvider, FileChange } from '../types';
import { logAIInteraction } from './debugService';

// --- Constants for AI prompts ---
const MAX_PATCH_LENGTH = 1000;        // Max characters per file patch in prompts
const MAX_PATCH_LENGTH_SHORT = 800;   // Shorter limit for dense prompts
const MAX_FILES_FOR_EXPLAIN = 3;      // Max files to include when explaining commits
const MAX_FILES_FOR_GENERATE = 5;     // Max files to include when generating messages

// --- Helper to parse AI JSON responses (removes markdown code blocks) ---
const parseAIJsonResponse = <T>(raw: string, fallback: T): T => {
  try {
    const jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
};

// --- Helper to get configured model or default ---
const getModel = (config: AIConfig): string => {
  const override = config.modelOverrides?.[config.provider];
  if (override && override.trim() !== '') return override;

  switch (config.provider) {
    case 'gemini': return 'gemini-2.0-flash';
    case 'openai': return 'gpt-4o';
    case 'claude': return 'claude-3-5-sonnet-20240620';
    case 'deepseek': return 'deepseek-chat';
    case 'zai': return 'zai-1';
    default: return '';
  }
};

// --- Commit Helpers ---

export const explainCommit = async (commit: Commit, config: AIConfig): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);

  const prompt = `
    You are a helpful coding assistant in a Git GUI tool.
    Explain the following git commit to a developer in a concise, easy-to-understand way.
    
    Message: ${commit.message}
    Changes:
    ${commit.changes?.map(c => `- ${c.filename} (${c.status})`).join('\n') || 'No details'}
    
    Patches:
    ${commit.changes?.slice(0, MAX_FILES_FOR_EXPLAIN).map(c => c.patch ? `--- ${c.filename}\n${c.patch.substring(0, MAX_PATCH_LENGTH)}` : '').join('\n') || ''}
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

export const generateCommitMessage = async (commit: Pick<Commit, 'changes'>, config: AIConfig): Promise<string> => {
  const { provider, keys, commitStyle = 'conventional' } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);

  const prompt = `
    Generate a git commit message for these changes.
    Style: ${commitStyle}
    
    Files:
    ${commit.changes?.map(c => `- ${c.filename} (${c.status})`).join('\n')}
    
    Diffs:
    ${commit.changes?.slice(0, MAX_FILES_FOR_GENERATE).map(c => c.patch ? `--- ${c.filename}\n${c.patch.substring(0, MAX_PATCH_LENGTH)}` : '').join('\n') || ''}
    
    Return ONLY the message.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

// --- Advanced AI Features ---

export const resolveMergeConflict = async (filename: string, current: string, incoming: string, config: AIConfig): Promise<{resolution: string, explanation: string}> => {
    const { provider, keys } = config;
    const apiKey = keys[provider];
    if (!apiKey) throw new Error("No API Key");

    const model = getModel(config);

    // Detect if the input is a full file with conflict markers
    const hasConflictMarkers = current.includes('<<<<<<<');

    const prompt = hasConflictMarkers
      ? `
        You are an expert software engineer resolving git merge conflicts in '${filename}'.

        The following is the complete file content with conflict markers. Resolve ALL conflict blocks
        (delimited by <<<<<<< ... ======= ... >>>>>>>) by choosing the best resolution for each,
        and return the complete resolved file.

        File content:
        ${current}

        Return a JSON object with two fields:
        1. "resolution": The complete resolved file content as a string (no conflict markers remaining).
        2. "explanation": A brief explanation of the resolution strategy used (string).

        Do not include markdown code blocks in the JSON output. Return raw JSON.
      `
      : `
        You are an expert software engineer resolving a git merge conflict in '${filename}'.

        <<<<<<< Current Change
        ${current}
        =======
        ${incoming}
        >>>>>>> Incoming Change

        Analyze the code logic. Return a JSON object with two fields:
        1. "resolution": The strictly merged code block (string).
        2. "explanation": A brief explanation of why you chose this resolution (string).

        Do not include markdown code blocks in the JSON output. Return raw JSON.
      `;

    const raw = await executeAIRequest(provider, apiKey, model, prompt, true); // Force JSON if possible
    return parseAIJsonResponse(raw, { resolution: current, explanation: "Failed to parse AI response. Using current change." });
};

export const generateStashMessage = async (changes: string[], config: AIConfig): Promise<string> => {
    const { provider, keys } = config;
    const apiKey = keys[provider];
    if (!apiKey) return "WIP: Stashed changes";

    const model = getModel(config);

    const prompt = `Generate a short, descriptive git stash message for changes in these files: ${changes.join(', ')}. Keep it under 50 chars.`;
    return executeAIRequest(provider, apiKey, model, prompt);
};

export const generatePRDescription = async (branch: string, commits: Commit[], config: AIConfig): Promise<{title: string, body: string}> => {
    const { provider, keys } = config;
    const apiKey = keys[provider];
    if (!apiKey) return { title: branch, body: "No API Key configured." };

    const model = getModel(config);

    const commitLog = commits.map(c => `${c.shortId} ${c.message}`).join('\n');
    const prompt = `
        Generate a Pull Request Title and Description for branch '${branch}'.
        Commits:
        ${commitLog}
        
        Return JSON format: { "title": "string", "body": "markdown string" }
    `;

    const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
    return parseAIJsonResponse(raw, { title: `Merge ${branch}`, body: commitLog });
};

// --- Core Executor ---

const AI_REQUEST_TIMEOUT_MS = 30000;

/** Fetch with timeout via AbortController */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = AI_REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
        }
        return res;
    } finally {
        clearTimeout(timer);
    }
}

async function executeAIRequest(provider: AIProvider, apiKey: string, model: string, prompt: string, jsonMode = false): Promise<string> {
    const startTime = Date.now();
    try {
        let result = "";
        switch (provider) {
          case 'gemini':
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: jsonMode ? { responseMimeType: 'application/json' } : undefined
            });
            result = response.text || "";
            break;
          case 'openai':
          case 'deepseek': {
            const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    response_format: jsonMode ? { type: "json_object" } : undefined
                })
            });
            const data = await res.json();
            result = data.choices?.[0]?.message?.content || "";
            break;
          }
          case 'claude': {
             const resClaude = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                  'content-type': 'application/json',
                },
                body: JSON.stringify({
                  model: model,
                  max_tokens: 1024,
                  messages: [{ role: "user", content: prompt }]
                })
              });
              const dataClaude = await resClaude.json();
              result = dataClaude.content?.[0]?.text || "";
              break;
          }
          case 'zai': {
            const resZai = await fetchWithTimeout('https://api.zai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    response_format: jsonMode ? { type: "json_object" } : undefined
                })
            });
            const dataZai = await resZai.json();
            result = dataZai.choices?.[0]?.message?.content || "";
            break;
          }
          default:
            result = "";
        }
        const duration = Date.now() - startTime;
        logAIInteraction(provider, model, prompt, result, true, duration);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error.name === 'AbortError' ? 'Request timed out after 30 seconds' : (error.message || 'Unknown error');
        logAIInteraction(provider, model, prompt, '', false, duration, message);
        console.error("AI Error:", error);
        throw new Error(`AI request failed: ${message}. Please check your API key and try again.`);
      }
}

// --- New AI Functions ---

export const generateCommitSummary = async (commits: Commit[], config: AIConfig): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);
  const commitLog = commits.map(c => `${c.shortId} - ${c.message} (${c.author})`).join('\n');

  const prompt = `
    Summarize the following git commits in a concise paragraph. Focus on the overall changes and their purpose.

    Commits:
    ${commitLog}

    Return a concise 2-4 sentence summary.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

export const generateChangelogEntry = async (commits: Commit[], config: AIConfig): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);
  const commitLog = commits.map(c => `${c.shortId} - ${c.message}`).join('\n');

  const prompt = `
    Generate a changelog entry from these commits. Use markdown format with categories like Added, Changed, Fixed, Removed.

    Commits:
    ${commitLog}

    Return only the changelog entry in markdown format.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

export const explainBranchChanges = async (branchName: string, commits: Commit[], config: AIConfig): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);
  const commitLog = commits.slice(0, 20).map(c => `${c.shortId} - ${c.message} (${c.author})`).join('\n');

  const prompt = `
    Explain what the branch "${branchName}" is about based on its commits. What feature or fix is being developed?

    Recent commits on this branch:
    ${commitLog}

    Return a concise explanation (2-4 sentences).
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

export const explainFileChanges = async (filename: string, changes: FileChange[], config: AIConfig): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);
  const patchInfo = changes.slice(0, MAX_FILES_FOR_EXPLAIN).map(c =>
    c.patch ? `--- ${c.filename} (${c.status})\n${c.patch.substring(0, MAX_PATCH_LENGTH_SHORT)}` : `${c.filename} (${c.status})`
  ).join('\n\n');

  const prompt = `
    Explain the changes to the file "${filename}" in a concise, developer-friendly way.

    Changes:
    ${patchInfo}

    Return a concise explanation.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

export const summarizeFileHistory = async (filename: string, commits: Commit[], config: AIConfig): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return `Please configure an API key for ${provider.toUpperCase()}.`;

  const model = getModel(config);
  const history = commits.slice(0, 15).map(c => `${c.shortId} - ${c.message} (${c.author}, ${c.date})`).join('\n');

  const prompt = `
    Summarize the history of changes to the file "${filename}" based on these commits.

    Commit history:
    ${history}

    Return a brief timeline summary.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

// --- NEW AI FEATURES ---

/**
 * AI Git Error Diagnosis - Explains git errors and suggests fixes
 */
export const diagnoseGitError = async (
  errorMessage: string,
  operation: string,
  context: { branch?: string; files?: string[]; repoPath?: string },
  config: AIConfig
): Promise<{ explanation: string; suggestions: string[]; command?: string }> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return { explanation: 'No API key configured.', suggestions: [] };

  const model = getModel(config);

  const prompt = `
    You are a Git expert helping diagnose and fix git errors.

    Operation attempted: ${operation}
    Error message: ${errorMessage}
    Current branch: ${context.branch || 'unknown'}
    ${context.files?.length ? `Files involved: ${context.files.slice(0, 5).join(', ')}` : ''}

    Analyze this error and return a JSON object with:
    1. "explanation": A clear explanation of why this error occurred (1-2 sentences)
    2. "suggestions": An array of 2-4 actionable suggestions to fix this issue
    3. "command": (optional) A specific git command that would likely fix this issue

    Return raw JSON without markdown code blocks.
  `;

  const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
  return parseAIJsonResponse(raw, {
    explanation: 'Unable to diagnose this error.',
    suggestions: ['Try running the operation again', 'Check your git configuration']
  });
};

/**
 * AI Branch Name Suggestion - Suggests branch names based on changes
 */
export const suggestBranchName = async (
  changes: FileChange[],
  description: string,
  config: AIConfig
): Promise<string[]> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return ['feature/new-feature'];

  const model = getModel(config);

  const fileList = changes.slice(0, 10).map(c => c.filename).join(', ');
  const prompt = `
    Suggest 3 git branch names based on these changes.

    Files being modified: ${fileList}
    ${description ? `Description: ${description}` : ''}

    Follow these conventions:
    - Use prefixes like feature/, bugfix/, hotfix/, refactor/, docs/
    - Use kebab-case (lowercase with hyphens)
    - Keep names concise but descriptive

    Return a JSON array of 3 branch name strings. No markdown code blocks.
  `;

  const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
  return parseAIJsonResponse(raw, ['feature/new-feature', 'feature/update', 'fix/bug-fix']);
};

/**
 * AI Code Review - Quick review of staged changes
 */
export const reviewChanges = async (
  changes: FileChange[],
  config: AIConfig
): Promise<{ summary: string; issues: { file: string; line?: number; severity: 'warning' | 'error' | 'info'; message: string }[]; score: number }> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return { summary: 'No API key configured.', issues: [], score: 0 };

  const model = getModel(config);

  const patchInfo = changes.slice(0, 5).map(c =>
    c.patch ? `--- ${c.filename} (${c.status})\n${c.patch.substring(0, MAX_PATCH_LENGTH)}` : `${c.filename} (${c.status})`
  ).join('\n\n');

  const prompt = `
    You are a code reviewer. Review these git changes for potential issues.

    Changes:
    ${patchInfo}

    Return a JSON object with:
    1. "summary": A brief 1-2 sentence summary of the overall changes
    2. "issues": An array of potential issues found, each with:
       - "file": filename
       - "severity": "warning", "error", or "info"
       - "message": description of the issue
    3. "score": A quality score from 1-10 (10 being excellent)

    Focus on: potential bugs, security issues, code smells, missing error handling.
    If the code looks good, return an empty issues array and high score.

    Return raw JSON without markdown code blocks.
  `;

  const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
  return parseAIJsonResponse(raw, { summary: 'Unable to review changes.', issues: [], score: 5 });
};

/**
 * AI Commit Message Improvement - Takes an existing message and improves it
 */
export const improveCommitMessage = async (
  currentMessage: string,
  changes: FileChange[],
  config: AIConfig
): Promise<string> => {
  const { provider, keys, commitStyle = 'conventional' } = config;
  const apiKey = keys[provider];
  if (!apiKey) return currentMessage;

  const model = getModel(config);

  const fileList = changes.slice(0, 10).map(c => `${c.filename} (${c.status})`).join('\n');

  const prompt = `
    Improve this git commit message while keeping its intent.

    Current message: "${currentMessage}"

    Files changed:
    ${fileList}

    Style: ${commitStyle}

    Return ONLY the improved commit message. Make it:
    - More descriptive if too vague
    - More concise if too long
    - Follow ${commitStyle} conventions
    - Keep the original intent

    Return only the improved message text.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

/**
 * AI Squash Message Generation - Generate a single message for squashed commits
 */
export const generateSquashMessage = async (
  commits: Commit[],
  config: AIConfig
): Promise<string> => {
  const { provider, keys, commitStyle = 'conventional' } = config;
  const apiKey = keys[provider];
  if (!apiKey) return commits.map(c => c.message).join('\n');

  const model = getModel(config);

  const commitLog = commits.map(c => `- ${c.message}`).join('\n');

  const prompt = `
    Generate a single commit message that summarizes these commits being squashed.

    Commits being squashed:
    ${commitLog}

    Style: ${commitStyle}

    Return ONLY the combined commit message. It should:
    - Capture the overall purpose of all commits
    - Be concise but complete
    - Follow ${commitStyle} conventions

    Return only the message text.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

/**
 * AI Diff Summary - Quick summary of what changed
 */
export const summarizeDiff = async (
  oldContent: string,
  newContent: string,
  filename: string,
  config: AIConfig
): Promise<string> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return 'No API key configured.';

  const model = getModel(config);

  // Truncate content for prompt
  const oldTrunc = oldContent.substring(0, 1500);
  const newTrunc = newContent.substring(0, 1500);

  const prompt = `
    Summarize the changes between these two versions of "${filename}" in 2-3 sentences.

    BEFORE:
    ${oldTrunc}${oldContent.length > 1500 ? '\n...(truncated)' : ''}

    AFTER:
    ${newTrunc}${newContent.length > 1500 ? '\n...(truncated)' : ''}

    Focus on what was added, removed, or modified. Be concise.
  `;

  return executeAIRequest(provider, apiKey, model, prompt);
};

/**
 * AI Semantic Version Suggestion - Suggest version bump based on changes
 */
export const suggestVersionBump = async (
  commits: Commit[],
  currentVersion: string,
  config: AIConfig
): Promise<{ bump: 'major' | 'minor' | 'patch'; newVersion: string; reason: string }> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return { bump: 'patch', newVersion: currentVersion, reason: 'No API key configured.' };

  const model = getModel(config);

  const commitLog = commits.map(c => `- ${c.message}`).join('\n');

  const prompt = `
    Based on these commits, suggest a semantic version bump.

    Current version: ${currentVersion}

    Commits since last release:
    ${commitLog}

    Semantic versioning rules:
    - MAJOR: Breaking changes (incompatible API changes)
    - MINOR: New features (backwards compatible)
    - PATCH: Bug fixes (backwards compatible)

    Return a JSON object with:
    1. "bump": "major", "minor", or "patch"
    2. "newVersion": The new version string (e.g., "2.1.0")
    3. "reason": Brief explanation of why this bump type

    Return raw JSON without markdown code blocks.
  `;

  const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
  return parseAIJsonResponse(raw, { bump: 'patch', newVersion: currentVersion, reason: 'Unable to analyze commits.' });
};

/**
 * AI .gitignore Suggestions - Suggest files/patterns to ignore
 */
export const suggestGitignore = async (
  files: string[],
  existingGitignore: string,
  config: AIConfig
): Promise<string[]> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return [];

  const model = getModel(config);

  const fileList = files.slice(0, 50).join('\n');

  const prompt = `
    Suggest .gitignore patterns for this project.

    Files in repository:
    ${fileList}

    Current .gitignore:
    ${existingGitignore || '(empty)'}

    Return a JSON array of gitignore patterns that should be added.
    Focus on:
    - Build artifacts
    - Dependencies (node_modules, vendor, etc.)
    - IDE/editor files
    - OS-specific files
    - Sensitive files (.env, credentials)
    - Cache files

    Only suggest patterns NOT already in the gitignore.
    Return raw JSON array without markdown code blocks.
  `;

  const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
  return parseAIJsonResponse(raw, []);
};

/**
 * AI Undo Suggestion - Suggest how to fix a mistake
 */
export const suggestUndo = async (
  action: string,
  currentState: { hasUncommittedChanges: boolean; lastCommit?: string; branch?: string },
  config: AIConfig
): Promise<{ suggestion: string; command?: string; warning?: string }> => {
  const { provider, keys } = config;
  const apiKey = keys[provider];
  if (!apiKey) return { suggestion: 'No API key configured.' };

  const model = getModel(config);

  const prompt = `
    A user wants to undo this git action: "${action}"

    Current state:
    - Branch: ${currentState.branch || 'unknown'}
    - Has uncommitted changes: ${currentState.hasUncommittedChanges}
    - Last commit: ${currentState.lastCommit || 'unknown'}

    Return a JSON object with:
    1. "suggestion": A clear explanation of how to undo this action
    2. "command": (optional) The git command to run
    3. "warning": (optional) Any warnings about data loss or side effects

    Return raw JSON without markdown code blocks.
  `;

  const raw = await executeAIRequest(provider, apiKey, model, prompt, true);
  return parseAIJsonResponse(raw, { suggestion: 'Unable to suggest an undo action.' });
}