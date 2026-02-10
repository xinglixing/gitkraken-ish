import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, ChevronUp, ChevronDown, GripHorizontal, Loader2 } from 'lucide-react';
import { Repository } from '../types';
import { getPlatform, Platform } from '../utils/platform';
import { fetchLocalBranches } from '../services/localGitService';

const MAX_HISTORY_LINES = 5000;

// Check if we're in Electron with real shell access
const hasRealShell = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!(window as any).require;
  } catch {
    return false;
  }
};

// Execute a shell command using Node's child_process
const executeShellCommand = (command: string, cwd: string, shell: string): Promise<{ stdout: string; stderr: string; code: number }> => {
  return new Promise((resolve) => {
    try {
      const { spawn } = (window as any).require('child_process');
      const os = (window as any).require('os');

      let shellCmd: string;
      let shellArgs: string[];

      if (os.platform() === 'win32') {
        if (shell?.toLowerCase().includes('powershell')) {
          shellCmd = 'powershell.exe';
          shellArgs = ['-NoProfile', '-Command', command];
        } else if (shell?.toLowerCase().includes('bash')) {
          shellCmd = 'bash.exe';
          shellArgs = ['-c', command];
        } else {
          shellCmd = 'cmd.exe';
          shellArgs = ['/c', command];
        }
      } else {
        shellCmd = shell || process.env.SHELL || '/bin/bash';
        shellArgs = ['-c', command];
      }

      const child = spawn(shellCmd, shellArgs, {
        cwd: cwd || undefined,
        env: process.env,
        shell: false
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });

      child.on('error', (err: Error) => {
        resolve({ stdout: '', stderr: err.message, code: 1 });
      });
    } catch (err) {
      resolve({ stdout: '', stderr: err.message, code: 1 });
    }
  });
};

// Get default shell for the system
const getSystemDefaultShell = (): string => {
  if (!hasRealShell()) return '';
  try {
    const os = (window as any).require('os');
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  } catch {
    return getDefaultShellForPlatform();
  }
};

// Get the working directory for the terminal (only works for local repos)
const getWorkingDir = (repo: Repository | null): string => {
  if (!repo) return '';
  // Only return path for local repos with valid local path
  if (repo.isLocal && typeof repo.handle === 'string') return repo.handle;
  return ''; // Remote repos don't have local paths
};

// Check if repo is local and has valid path
const isLocalRepo = (repo: Repository | null): boolean => {
  return !!(repo?.isLocal && typeof repo.handle === 'string');
};

// Get platform-appropriate default shell
const getDefaultShellForPlatform = (): string => {
  const platform = getPlatform();
  switch (platform) {
    case Platform.WINDOWS:
      return 'powershell.exe';
    case Platform.MACOS:
      return '/bin/zsh'; // macOS default since Catalina
    case Platform.LINUX:
      return '/bin/bash';
    default:
      return '/bin/sh';
  }
};

interface TerminalProps {
  isOpen: boolean;
  toggle: () => void;
  repo: Repository | null;
  onRefresh?: () => void;
  onNavigateToCommit?: (sha: string) => void;
  gitAuthor?: { name: string; email: string };
  shellPreference?: string; // 'auto' | 'bash' | 'powershell' | 'zsh' | 'cmd'
}

const Terminal: React.FC<TerminalProps> = ({ isOpen, toggle, repo, onRefresh, onNavigateToCommit, gitAuthor, shellPreference = 'auto' }) => {
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentShell, setCurrentShell] = useState<string>('');
  const [shellDetected, setShellDetected] = useState(false);

  // Detect default shell on mount
  useEffect(() => {
    const detectShell = () => {
      try {
        if (shellPreference === 'auto' || !shellPreference) {
          // Get system default shell
          setCurrentShell(getSystemDefaultShell() || getDefaultShellForPlatform());
        } else {
          // Map preference to shell path based on platform
          const platform = getPlatform();
          const shellMap: Record<string, string> = {
            bash: platform === Platform.WINDOWS ? 'bash.exe' : '/bin/bash',
            zsh: '/bin/zsh',
            powershell: 'powershell.exe',
            cmd: 'cmd.exe',
          };
          setCurrentShell(shellMap[shellPreference] || getDefaultShellForPlatform());
        }
      } catch (e) {
        console.error('Failed to detect shell:', e);
        setCurrentShell(getDefaultShellForPlatform());
      }
      setShellDetected(true);
    };

    detectShell();
  }, [shellPreference]);

  const getWelcomeMessage = () => {
    const isLocal = isLocalRepo(repo);
    const workingDir = getWorkingDir(repo);

    if (!isLocal && repo) {
      return [
        'Welcome to Terminal',
        '',
        '⚠️  Remote Repository Detected',
        'Terminal commands only work with local repositories.',
        'Clone this repository to use terminal features.',
        ''
      ];
    }

    return [
      'Welcome to Terminal',
      `Shell: ${currentShell || 'Detecting...'}`,
      `Working directory: ${workingDir || 'No repository loaded'}`,
      'Type any command. Use "help" for tips.',
      ''
    ];
  };

  const [history, setHistoryRaw] = useState<string[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autocompleteSuggestion, setAutocompleteSuggestion] = useState('');
  const [height, setHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const welcomeShownRef = useRef(false);

  // Show welcome message once shell is detected (or immediately in browser mode)
  useEffect(() => {
    if (shellDetected && !welcomeShownRef.current) {
      welcomeShownRef.current = true;
      setHistoryRaw(getWelcomeMessage());
    }
  }, [shellDetected, currentShell, repo]);
  const isAtBottomRef = useRef(true);

  // Capped history setter — trims from the beginning when exceeding limit
  const setHistory: typeof setHistoryRaw = (update) => {
    setHistoryRaw(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      return next.length > MAX_HISTORY_LINES ? next.slice(next.length - MAX_HISTORY_LINES) : next;
    });
  };

  // Track whether user has scrolled away from the bottom
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 30;
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  // Auto-scroll to bottom on new output only if already at bottom
  useEffect(() => {
    if (terminalRef.current && isAtBottomRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history, isOpen]);

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 100 && newHeight < window.innerHeight - 100) {
            setHeight(newHeight);
        }
    };

    const handleMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }

    return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Git-aware autocomplete suggestions
  const getAutocompleteSuggestions = async (partial: string): Promise<string[]> => {
    const parts = partial.trim().split(/\s+/);
    if (parts[0] !== 'git' || !repo) return [];

    const subCommands = ['status', 'checkout', 'branch', 'log', 'merge', 'tag', 'stash', 'diff', 'remote', 'add', 'commit', 'push', 'pull'];

    if (parts.length === 2) {
      // Autocomplete git subcommand
      return subCommands.filter(c => c.startsWith(parts[1])).map(c => `git ${c}`);
    }

    if (parts.length === 3) {
      const subCmd = parts[1];
      if (['checkout', 'merge', 'rebase'].includes(subCmd)) {
        try {
          const branches = await fetchLocalBranches(repo);
          return branches.filter(b => !b.isRemote && b.name.startsWith(parts[2])).map(b => `git ${subCmd} ${b.name}`);
        } catch { return []; }
      }
    }

    return [];
  };

  const updateAutocomplete = async (value: string) => {
    if (!value.trim()) {
      setAutocompleteSuggestion('');
      return;
    }
    const suggestions = await getAutocompleteSuggestions(value);
    if (suggestions.length > 0 && suggestions[0].startsWith(value)) {
      setAutocompleteSuggestion(suggestions[0].slice(value.length));
    } else {
      setAutocompleteSuggestion('');
    }
  };

  const executeCommand = async (rawCmd: string) => {
    const parts = rawCmd.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    if (cmd === '') return;

    // Add to command history
    setCommandHistory(prev => {
      const newHistory = [rawCmd, ...prev.filter(h => h !== rawCmd)].slice(0, 100);
      return newHistory;
    });
    setHistoryIndex(-1);

    if (cmd === 'clear') {
        setHistory([]);
        return;
    }

    if (cmd === 'help') {
        setHistory(prev => [...prev,
            'This is a full system terminal. You can run any command.',
            '',
            'Tips:',
            '  - Use ArrowUp/Down for command history',
            '  - Use Tab for git autocomplete',
            '  - Click on commit SHAs in output to navigate',
            '  - Type "clear" to clear the terminal',
            '',
            `Current shell: ${currentShell}`,
            `Working directory: ${getWorkingDir(repo) || 'Not set'}`
        ]);
        return;
    }

    // Check if we have a local repo with valid path
    if (!isLocalRepo(repo)) {
        setHistory(prev => [...prev,
            'Error: Terminal only works with local repositories.',
            'This is a remote repository without a local clone.',
            'Clone the repository first to use the terminal.'
        ]);
        return;
    }

    // Execute command using system shell
    const workingDir = getWorkingDir(repo);
    if (!workingDir) {
        setHistory(prev => [...prev, 'Error: No valid working directory. Please open a local repository.']);
        return;
    }

    setIsExecuting(true);
    try {
        const result = await executeShellCommand(rawCmd, workingDir, currentShell);

            if (result.stdout) {
                setHistory(prev => [...prev, result.stdout.trimEnd()]);
            }
            if (result.stderr) {
                setHistory(prev => [...prev, result.stderr.trimEnd()]);
            }
            if (result.code !== 0 && !result.stdout && !result.stderr) {
                setHistory(prev => [...prev, `Command exited with code ${result.code}`]);
            }

            // Refresh graph if git command that modifies state
            if (rawCmd.match(/^git\s+(commit|checkout|merge|rebase|reset|stash|pull|push|fetch)/i)) {
                onRefresh?.();
            }
        } catch (e) {
            setHistory(prev => [...prev, `Error: ${e.message}`]);
        } finally {
            setIsExecuting(false);
        }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        const cmd = input;
        setHistory(prev => [...prev, `$ ${cmd}`]);
        setInput('');
        setAutocompleteSuggestion('');
        await executeCommand(cmd);
    }
    else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length > 0) {
            const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
            setHistoryIndex(newIndex);
            setInput(commandHistory[newIndex]);
            setAutocompleteSuggestion('');
        }
    }
    else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setInput(commandHistory[newIndex]);
        } else {
            setHistoryIndex(-1);
            setInput('');
        }
        setAutocompleteSuggestion('');
    }
    else if (e.key === 'Tab') {
        e.preventDefault();
        if (autocompleteSuggestion) {
            setInput(prev => prev + autocompleteSuggestion);
            setAutocompleteSuggestion('');
        }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    updateAutocomplete(value);
  };

  // Render clickable SHAs in output
  const renderLine = (line: string, key: number) => {
    // Match 7+ hex char SHAs
    const shaRegex = /\b([0-9a-f]{7,40})\b/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = shaRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      const sha = match[1];
      parts.push(
        <span
          key={`sha-${match.index}`}
          className="text-gk-blue cursor-pointer hover:underline"
          onClick={() => onNavigateToCommit?.(sha)}
          title={`Navigate to ${sha}`}
        >
          {sha}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return <div key={key} className="whitespace-pre-wrap leading-tight mb-1">{parts.length > 0 ? parts : line}</div>;
  };

  if (!isOpen) {
      return (
          <div
            className="h-8 bg-gk-panel border-t border-gk-header flex items-center px-4 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={toggle}
          >
              <TerminalIcon className="w-4 h-4 mr-2 text-gray-500" />
              <span className="text-xs font-bold text-gray-500">Terminal</span>
              <div className="flex-1"></div>
              <ChevronUp className="w-4 h-4 text-gray-500" />
          </div>
      );
  }

  return (
    <div style={{ height: height }} className="bg-black/90 border-t border-gk-header flex flex-col font-mono text-sm relative">
      {/* Resizer Handle */}
      <div
        className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-gk-blue z-10"
        onMouseDown={() => setIsResizing(true)}
      />

      <div
        className="h-8 bg-gk-panel flex items-center justify-between px-4 select-none cursor-default"
        onDoubleClick={toggle}
      >
          <div className="flex items-center text-gray-400">
             <TerminalIcon className="w-4 h-4 mr-2" />
             <span className="text-xs font-bold">Terminal</span>
             {currentShell && (
               <span className="ml-2 text-[10px] text-gray-600">
                 ({currentShell.split(/[/\\]/).pop()})
               </span>
             )}
          </div>

          <div
            className="flex-1 flex justify-center cursor-row-resize opacity-20 hover:opacity-100"
            onMouseDown={() => setIsResizing(true)}
          >
              <GripHorizontal className="w-4 h-4 text-gray-400" />
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={toggle} className="text-gray-500 hover:text-white">
                <ChevronDown className="w-4 h-4" />
            </button>
            <button onClick={toggle} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
            </button>
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar text-gray-300" ref={terminalRef} role="log" aria-label="Terminal output">
         {history.map((line, i) => renderLine(line, i))}
         <div className="flex items-center mt-2 relative">
             {isExecuting ? (
               <Loader2 className="w-4 h-4 mr-2 text-gk-accent animate-spin" />
             ) : (
               <span className="text-gk-accent mr-2 font-bold">$</span>
             )}
             <div className="relative flex-1">
               <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={isExecuting}
                  className="bg-transparent border-none outline-none w-full text-white font-mono relative z-10 disabled:opacity-50"
                  autoFocus
                  placeholder={isExecuting ? 'Running...' : ''}
                  spellCheck={false}
                  aria-label="Terminal input"
               />
               {autocompleteSuggestion && !isExecuting && (
                 <span className="absolute left-0 top-0 text-gray-600 pointer-events-none font-mono whitespace-pre">
                   {input}<span className="opacity-50">{autocompleteSuggestion}</span>
                 </span>
               )}
             </div>
         </div>
      </div>
    </div>
  );
};

export default React.memo(Terminal);
