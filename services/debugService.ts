import { GitCommandLogEntry, AIInteractionLogEntry } from '../types';

let debugMode = false;
const gitCommandLog: GitCommandLogEntry[] = [];
const aiInteractionLog: AIInteractionLogEntry[] = [];
const MAX_LOG_SIZE = 500;

let idCounter = 0;
const nextId = () => `log_${++idCounter}_${Date.now()}`;

export const isDebugMode = (): boolean => debugMode;

export const setDebugMode = (enabled: boolean): void => {
  debugMode = enabled;
  if (enabled) {
    console.log('[Debug] Debug mode enabled');
  }
};

export const toggleDebugMode = (): boolean => {
  debugMode = !debugMode;
  return debugMode;
};

export const logGitCommand = (
  command: string,
  args: string[],
  success: boolean,
  duration?: number,
  error?: string
): void => {
  const entry: GitCommandLogEntry = {
    id: nextId(),
    command,
    args,
    timestamp: Date.now(),
    duration,
    success,
    error,
  };
  gitCommandLog.unshift(entry);
  if (gitCommandLog.length > MAX_LOG_SIZE) {
    gitCommandLog.pop();
  }
  if (debugMode) {
    const status = success ? 'OK' : 'FAIL';
    console.log(`[Git ${status}] ${command} ${args.join(' ')}${duration ? ` (${duration}ms)` : ''}${error ? ` - ${error}` : ''}`);
  }
};

export const logAIInteraction = (
  provider: string,
  model: string,
  prompt: string,
  response: string,
  success: boolean,
  duration?: number,
  error?: string
): void => {
  const entry: AIInteractionLogEntry = {
    id: nextId(),
    provider: provider as any,
    model,
    prompt: prompt.substring(0, 2000),
    response: response.substring(0, 2000),
    timestamp: Date.now(),
    duration,
    success,
    error,
  };
  aiInteractionLog.unshift(entry);
  if (aiInteractionLog.length > MAX_LOG_SIZE) {
    aiInteractionLog.pop();
  }
  if (debugMode) {
    const status = success ? 'OK' : 'FAIL';
    console.log(`[AI ${status}] ${provider}/${model}${duration ? ` (${duration}ms)` : ''}${error ? ` - ${error}` : ''}`);
  }
};

export const getGitCommandLog = (): GitCommandLogEntry[] => [...gitCommandLog];

export const getAIInteractionLog = (): AIInteractionLogEntry[] => [...aiInteractionLog];

export const getErrorLog = (): (GitCommandLogEntry | AIInteractionLogEntry)[] => {
  const gitErrors = gitCommandLog.filter(e => !e.success);
  const aiErrors = aiInteractionLog.filter(e => !e.success);
  return [...gitErrors, ...aiErrors].sort((a, b) => b.timestamp - a.timestamp);
};

export const clearLogs = (): void => {
  gitCommandLog.length = 0;
  aiInteractionLog.length = 0;
};
