import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, Eye, FileText, AlertTriangle, Code, Type, Loader2 } from 'lucide-react';
import { Repository } from '../types';
import { gitGetWorkingFileContent, gitWriteFile, detectFileEncoding } from '../services/localGitService';
import { useAlert } from '../hooks/useAlert';

interface FileEditorProps {
    isOpen: boolean;
    onClose: () => void;
    repo: Repository | null;
    filePath: string;
    onSave?: (filePath: string) => void;
}

const getLanguageFromExtension = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const extMap: { [key: string]: string } = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        css: 'css',
        scss: 'css',
        less: 'css',
        json: 'json',
        md: 'markdown',
        markdown: 'markdown',
        txt: 'text',
        html: 'html',
        htm: 'html',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml',
    };
    return extMap[ext] || 'text';
};

// Escape HTML entities to prevent XSS attacks
const escapeHtml = (text: string): string => {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// Simple markdown renderer - escapes HTML first for security
const renderMarkdown = (content: string): string => {
    // IMPORTANT: Escape HTML entities FIRST to prevent XSS
    let html = escapeHtml(content)
        // Headers
        .replace(/^### (.*$)/gm, '<h3 class="text-lg font-bold text-white mt-4 mb-2">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>')
        .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
        .replace(/__(.*?)__/g, '<strong class="font-bold">$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        .replace(/_(.*?)_/g, '<em class="italic">$1</em>')
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gk-bg p-3 rounded-lg my-3 overflow-x-auto font-mono text-sm"><code>$2</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code class="bg-gk-bg px-1.5 py-0.5 rounded text-gk-accent font-mono text-sm">$1</code>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-gk-blue hover:underline" target="_blank" rel="noopener">$1</a>')
        // Lists (unordered)
        .replace(/^\s*[-*+]\s+(.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
        // Lists (ordered)
        .replace(/^\s*\d+\.\s+(.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
        // Blockquotes
        .replace(/^>\s+(.*$)/gm, '<blockquote class="border-l-4 border-gk-blue pl-4 my-2 text-gray-400 italic">$1</blockquote>')
        // Horizontal rule
        .replace(/^---$/gm, '<hr class="border-gk-header my-4" />')
        // Paragraphs (double newlines)
        .replace(/\n\n/g, '</p><p class="my-2 text-gray-300">')
        // Single newlines to <br>
        .replace(/\n/g, '<br />');

    return `<div class="prose prose-invert max-w-none"><p class="my-2 text-gray-300">${html}</p></div>`;
};

export const FileEditor: React.FC<FileEditorProps> = ({ isOpen, onClose, repo, filePath, onSave }) => {
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [encoding, setEncoding] = useState<{ encoding: string; hasBom: boolean; isBinary: boolean } | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [lineNumbers, setLineNumbers] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { showAlert } = useAlert();

    const language = getLanguageFromExtension(filePath);
    const isMarkdown = language === 'markdown';
    const isDirty = content !== originalContent;

    // Load file content
    useEffect(() => {
        const loadFile = async () => {
            if (!repo || !filePath || !isOpen) return;

            setLoading(true);
            try {
                // Get file content
                const fileContent = await gitGetWorkingFileContent(repo, filePath);
                setContent(fileContent);
                setOriginalContent(fileContent);

                // Detect encoding
                try {
                    const enc = await detectFileEncoding(repo, filePath);
                    setEncoding(enc);
                } catch {
                    setEncoding({ encoding: 'UTF-8', hasBom: false, isBinary: false });
                }
            } catch (error) {
                showAlert('Error', `Failed to load file: ${error.message}`, 'error');
                onClose();
            } finally {
                setLoading(false);
            }
        };

        loadFile();
    }, [repo, filePath, isOpen]);

    // Handle save
    const handleSave = useCallback(async () => {
        if (!repo || !filePath || !isDirty) return;

        setSaving(true);
        try {
            await gitWriteFile(repo, filePath, content);
            setOriginalContent(content);
            showAlert('Saved', `File saved: ${filePath}`, 'success');
            if (onSave) onSave(filePath);
        } catch (error) {
            showAlert('Save Error', error.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [repo, filePath, content, isDirty, onSave]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isDirty) handleSave();
            }
            if (e.key === 'Escape') {
                if (isDirty) {
                    // Confirm before closing if dirty
                    if (confirm('You have unsaved changes. Discard them?')) {
                        onClose();
                    }
                } else {
                    onClose();
                }
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, isDirty, handleSave, onClose]);

    // Handle tab key in textarea
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = textareaRef.current;
            if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const newContent = content.substring(0, start) + '  ' + content.substring(end);
                setContent(newContent);
                // Set cursor position after the tab
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 2;
                }, 0);
            }
        }
    };

    const getLineCount = () => content.split('\n').length;
    const fileName = filePath.split(/[\\/]/).pop() || filePath;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gk-bg">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-gk-header border-b border-gk-header">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gk-accent" />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{fileName}</span>
                            {isDirty && (
                                <span className="text-gk-yellow text-xs flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Unsaved
                                </span>
                            )}
                        </div>
                        <span className="text-xs text-gray-500">{filePath}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Encoding indicator */}
                    {encoding && (
                        <span className="text-xs text-gray-500 px-2 py-1 bg-gk-bg rounded">
                            {encoding.encoding}
                            {encoding.hasBom && ' (BOM)'}
                        </span>
                    )}

                    {/* Language indicator */}
                    <span className="text-xs text-gray-500 px-2 py-1 bg-gk-bg rounded capitalize">
                        {language}
                    </span>

                    {/* Line numbers toggle */}
                    <button
                        onClick={() => setLineNumbers(!lineNumbers)}
                        className={`p-1.5 rounded transition-colors ${lineNumbers ? 'text-gk-accent bg-gk-accent/10' : 'text-gray-500 hover:text-white'}`}
                        title="Toggle line numbers"
                    >
                        <Type className="w-4 h-4" />
                    </button>

                    {/* Preview toggle for markdown */}
                    {isMarkdown && (
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className={`p-1.5 rounded transition-colors ${showPreview ? 'text-gk-accent bg-gk-accent/10' : 'text-gray-500 hover:text-white'}`}
                            title="Toggle preview"
                        >
                            {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    )}

                    {/* Save button */}
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            isDirty
                                ? 'bg-gk-accent text-white hover:bg-gk-accent/90'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                    </button>

                    {/* Close button */}
                    <button
                        onClick={() => {
                            if (isDirty) {
                                if (confirm('You have unsaved changes. Discard them?')) {
                                    onClose();
                                }
                            } else {
                                onClose();
                            }
                        }}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-gk-accent animate-spin" />
                </div>
            ) : encoding?.isBinary ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Binary file cannot be edited</p>
                        <p className="text-sm mt-2">{filePath}</p>
                    </div>
                </div>
            ) : isMarkdown && showPreview ? (
                // Markdown preview
                <div
                    className="flex-1 overflow-y-auto p-6 bg-gk-panel"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
            ) : (
                // Code editor
                <div className="flex-1 flex overflow-hidden">
                    {/* Line numbers */}
                    {lineNumbers && (
                        <div className="flex-shrink-0 bg-gk-header border-r border-gk-header px-3 py-2 text-right select-none">
                            {Array.from({ length: getLineCount() }, (_, i) => (
                                <div key={i} className="text-gray-600 text-xs font-mono h-5 leading-5">
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Text editor */}
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-gk-panel p-2 text-gray-200 font-mono text-sm resize-none outline-none leading-5"
                        spellCheck={false}
                        wrap="off"
                        style={{
                            tabSize: 2,
                            fontFamily: 'JetBrains Mono, Fira Code, Consolas, Monaco, monospace',
                        }}
                    />
                </div>
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-1 bg-gk-header border-t border-gk-header text-xs text-gray-500">
                <div className="flex items-center gap-4">
                    <span>Lines: {getLineCount()}</span>
                    <span>Characters: {content.length}</span>
                </div>
                <div className="flex items-center gap-4">
                    <span>Ctrl+S to save</span>
                    <span>Esc to close</span>
                </div>
            </div>
        </div>
    );
};

export default FileEditor;
