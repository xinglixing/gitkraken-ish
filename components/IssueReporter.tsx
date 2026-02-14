import React, { useState, useEffect, useRef } from 'react';
import { X, Bug, Sparkles, CheckSquare, Send, Loader2, ImagePlus, X as XIcon, User, AlertCircle } from 'lucide-react';
import { createIssueWithAttachments, uploadImageToGitHub, IssueTemplate, UploadedImage, getCurrentUser } from '../services/githubService';

interface IssueReporterProps {
    isOpen: boolean;
    onClose: () => void;
    githubToken: string;
    appVersion?: string;
}

type IssueType = 'bug' | 'feature' | 'task';

interface IssueFormData {
    title: string;
    // Bug fields
    severity: string;
    summary: string;
    steps: string;
    expected: string;
    actual: string;
    evidence: string;
    environment: string;
    system: string;
    workaround: string;
    // Feature fields
    problem: string;
    proposal: string;
    alternatives: string;
    acceptance: string;
    nonGoals: string;
    uxNotes: string;
    // Task fields
    goal: string;
    context: string;
    done: string;
    priority: string;
    // Common
    confirmSearch: boolean;
    confirmInfo: boolean;
}

interface SelectedFile {
    file: File;
    id: string;
    preview?: string;
}

const REPO_OWNER = 'xinglixing';
const REPO_NAME = 'gitkraken-ish';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const IssueReporter: React.FC<IssueReporterProps> = ({
    isOpen,
    onClose,
    githubToken,
    appVersion = 'unknown'
}) => {
    const [issueType, setIssueType] = useState<IssueType>('bug');
    const [loading, setLoading] = useState(false);
    const [uploadingImages, setUploadingImages] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<{ url: string; number: number } | null>(null);
    const [githubUser, setGithubUser] = useState<{ login: string; avatar_url: string } | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<IssueFormData>({
        title: '',
        severity: 'S3 - Medium (partial breakage, workaround exists)',
        summary: '',
        steps: '',
        expected: '',
        actual: '',
        evidence: '',
        environment: 'Windows 11',
        system: '',
        workaround: '',
        problem: '',
        proposal: '',
        alternatives: '',
        acceptance: '',
        nonGoals: '',
        uxNotes: '',
        goal: '',
        context: '',
        done: '',
        priority: 'P2 - Medium',
        confirmSearch: false,
        confirmInfo: false,
    });

    // Load GitHub user info when token changes
    useEffect(() => {
        if (githubToken && isOpen) {
            getCurrentUser(githubToken)
                .then(setGithubUser)
                .catch(() => setGithubUser(null));
        }
    }, [githubToken, isOpen]);

    const updateField = (field: keyof IssueFormData, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newFiles: SelectedFile[] = [];
        Array.from(files).forEach(file => {
            if (file.size > MAX_FILE_SIZE) {
                setError(`File "${file.name}" is too large. Max size is 5MB.`);
                return;
            }

            if (!file.type.startsWith('image/')) {
                setError(`File "${file.name}" is not an image.`);
                return;
            }

            const id = Math.random().toString(36).substring(7);
            const reader = new FileReader();
            reader.onload = () => {
                setSelectedFiles(prev => prev.map(f =>
                    f.id === id ? { ...f, preview: reader.result as string } : f
                ));
            };
            reader.readAsDataURL(file);

            newFiles.push({ file, id });
        });

        setSelectedFiles(prev => [...prev, ...newFiles]);
        setError('');
    };

    const removeFile = (id: string) => {
        setSelectedFiles(prev => prev.filter(f => f.id !== id));
    };

    const buildIssueBody = (): string => {
        const platform = navigator.platform;
        const userAgent = navigator.userAgent;

        switch (issueType) {
            case 'bug':
                return `## Severity\n${formData.severity}\n\n## Summary\n${formData.summary}\n\n## Steps to reproduce\n${formData.steps}\n\n## Expected behavior\n${formData.expected}\n\n## Actual behavior\n${formData.actual}\n\n## Evidence\n${formData.evidence || 'N/A'}\n\n## Version\n${appVersion}\n\n## Operating System\n${formData.environment}\n\n## System details\n${formData.system || 'N/A'}\n\n## Workaround\n${formData.workaround || 'N/A'}\n\n---\n*Submitted from GitKraken-ish app by @${githubUser?.login || 'unknown'}*\nPlatform: ${platform}\nUser Agent: ${userAgent}`;

            case 'feature':
                return `## Problem / motivation\n${formData.problem}\n\n## Proposed solution\n${formData.proposal}\n\n## Alternatives considered\n${formData.alternatives || 'N/A'}\n\n## Acceptance criteria\n${formData.acceptance}\n\n## Non-goals / out of scope\n${formData.nonGoals || 'N/A'}\n\n## UX / API notes\n${formData.uxNotes || 'N/A'}\n\n---\n*Submitted from GitKraken-ish app by @${githubUser?.login || 'unknown'}*\nVersion: ${appVersion}`;

            case 'task':
                return `## Goal\n${formData.goal}\n\n## Context\n${formData.context || 'N/A'}\n\n## Definition of done\n${formData.done}\n\n## Priority\n${formData.priority}\n\n---\n*Submitted from GitKraken-ish app by @${githubUser?.login || 'unknown'}*\nVersion: ${appVersion}`;

            default:
                return '';
        }
    };

    const getLabels = (): string[] => {
        switch (issueType) {
            case 'bug': return ['type/bug', 'needs-triage'];
            case 'feature': return ['type/feature', 'needs-triage'];
            case 'task': return ['type/task', 'needs-triage'];
            default: return [];
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (!githubToken) {
                throw new Error('GitHub token is required to submit issues. Please add your token in Settings > Profiles.');
            }

            if (!formData.title.trim()) {
                throw new Error('Title is required');
            }

            if (!formData.confirmSearch || !formData.confirmInfo) {
                throw new Error('Please confirm the checkboxes before submitting');
            }

            // Upload images first
            let uploadedImages: UploadedImage[] = [];
            if (selectedFiles.length > 0) {
                setUploadingImages(true);
                try {
                    for (const selectedFile of selectedFiles) {
                        const uploaded = await uploadImageToGitHub(
                            githubToken,
                            REPO_OWNER,
                            REPO_NAME,
                            selectedFile.file
                        );
                        uploadedImages.push(uploaded);
                    }
                } finally {
                    setUploadingImages(false);
                }
            }

            const issue: IssueTemplate = {
                type: issueType,
                title: issueType === 'bug' ? `Bug: ${formData.title}` :
                       issueType === 'feature' ? `Feature: ${formData.title}` :
                       `Task: ${formData.title}`,
                body: buildIssueBody(),
                labels: getLabels(),
            };

            const result = await createIssueWithAttachments(
                githubToken,
                REPO_OWNER,
                REPO_NAME,
                issue,
                uploadedImages
            );

            setSuccess({ url: result.html_url, number: result.number });
        } catch (err: any) {
            setError(err.message || 'Failed to submit issue');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setSuccess(null);
        setError('');
        setSelectedFiles([]);
        setFormData({
            title: '',
            severity: 'S3 - Medium (partial breakage, workaround exists)',
            summary: '',
            steps: '',
            expected: '',
            actual: '',
            evidence: '',
            environment: 'Windows 11',
            system: '',
            workaround: '',
            problem: '',
            proposal: '',
            alternatives: '',
            acceptance: '',
            nonGoals: '',
            uxNotes: '',
            goal: '',
            context: '',
            done: '',
            priority: 'P2 - Medium',
            confirmSearch: false,
            confirmInfo: false,
        });
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[700px] max-h-[85vh] bg-gk-panel border border-gk-header shadow-2xl rounded-lg flex flex-col overflow-hidden">
                {/* Header */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-black/20 bg-black/20">
                    <h2 className="text-lg font-bold text-gray-200 flex items-center">
                        <Send className="w-5 h-5 mr-2 text-gk-accent" />
                        Report Issue / Feature Request
                    </h2>
                    <div className="flex items-center space-x-3">
                        {githubUser && (
                            <div className="flex items-center text-sm text-gray-400">
                                <User className="w-4 h-4 mr-1" />
                                <span>@{githubUser.login}</span>
                            </div>
                        )}
                        <button onClick={handleClose} className="text-gray-500 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {!githubToken ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-gk-red/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-8 h-8 text-gk-red" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-200 mb-2">GitHub Token Required</h3>
                            <p className="text-gray-400 mb-4">
                                To create issues and receive notifications, you need to add a GitHub token.
                            </p>
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-gk-accent text-gk-bg font-bold rounded hover:bg-opacity-90"
                            >
                                Go to Settings
                            </button>
                        </div>
                    ) : success ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-gk-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckSquare className="w-8 h-8 text-gk-green" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-200 mb-2">Issue Created!</h3>
                            <p className="text-gray-400 mb-4">
                                Your issue #{success.number} has been successfully created.
                            </p>
                            <p className="text-gray-500 text-sm mb-4">
                                You will receive notifications when the issue is updated.
                            </p>
                            <a
                                href={success.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gk-accent hover:underline"
                            >
                                View on GitHub →
                            </a>
                            <div className="mt-6">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 bg-gk-accent text-gk-bg font-bold rounded hover:bg-opacity-90"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Issue Type Selector */}
                            <div>
                                <label className="text-sm font-medium text-gray-300 mb-2 block">Issue Type</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIssueType('bug')}
                                        className={`flex items-center justify-center p-3 rounded-lg border transition-colors ${
                                            issueType === 'bug'
                                                ? 'bg-gk-red/20 border-gk-red text-gk-red'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        <Bug className="w-4 h-4 mr-2" />
                                        Bug Report
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIssueType('feature')}
                                        className={`flex items-center justify-center p-3 rounded-lg border transition-colors ${
                                            issueType === 'feature'
                                                ? 'bg-gk-accent/20 border-gk-accent text-gk-accent'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Feature Request
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIssueType('task')}
                                        className={`flex items-center justify-center p-3 rounded-lg border transition-colors ${
                                            issueType === 'task'
                                                ? 'bg-gk-blue/20 border-gk-blue text-gk-blue'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        <CheckSquare className="w-4 h-4 mr-2" />
                                        Task
                                    </button>
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="text-sm font-medium text-gray-300 mb-2 block">Title *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => updateField('title', e.target.value)}
                                    placeholder="Short description of the issue"
                                    className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent"
                                    required
                                />
                            </div>

                            {/* Bug-specific fields */}
                            {issueType === 'bug' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Severity *</label>
                                        <select
                                            value={formData.severity}
                                            onChange={(e) => updateField('severity', e.target.value)}
                                            className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent"
                                        >
                                            <option>S1 - Critical (outage/data loss/security)</option>
                                            <option>S2 - High (major feature broken, no workaround)</option>
                                            <option>S3 - Medium (partial breakage, workaround exists)</option>
                                            <option>S4 - Low (minor issue/cosmetic)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Summary *</label>
                                        <textarea
                                            value={formData.summary}
                                            onChange={(e) => updateField('summary', e.target.value)}
                                            placeholder="What happened? What did you expect?"
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Steps to Reproduce *</label>
                                        <textarea
                                            value={formData.steps}
                                            onChange={(e) => updateField('steps', e.target.value)}
                                            placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                                            className="w-full h-24 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-gray-300 mb-2 block">Expected *</label>
                                            <textarea
                                                value={formData.expected}
                                                onChange={(e) => updateField('expected', e.target.value)}
                                                placeholder="It should..."
                                                className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-300 mb-2 block">Actual *</label>
                                            <textarea
                                                value={formData.actual}
                                                onChange={(e) => updateField('actual', e.target.value)}
                                                placeholder="It does..."
                                                className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Evidence (logs, screenshots)</label>
                                        <textarea
                                            value={formData.evidence}
                                            onChange={(e) => updateField('evidence', e.target.value)}
                                            placeholder="Paste logs, error messages, or describe what you see..."
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none font-mono text-xs"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Operating System *</label>
                                        <select
                                            value={formData.environment}
                                            onChange={(e) => updateField('environment', e.target.value)}
                                            className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent"
                                        >
                                            <option>Windows 11</option>
                                            <option>Windows 10</option>
                                            <option>macOS (Apple Silicon)</option>
                                            <option>macOS (Intel)</option>
                                            <option>Linux (Ubuntu/Debian)</option>
                                            <option>Linux (Fedora/RHEL)</option>
                                            <option>Linux (Other)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Workaround</label>
                                        <textarea
                                            value={formData.workaround}
                                            onChange={(e) => updateField('workaround', e.target.value)}
                                            placeholder="Any workaround you found..."
                                            className="w-full h-16 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Feature-specific fields */}
                            {issueType === 'feature' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Problem / Motivation *</label>
                                        <textarea
                                            value={formData.problem}
                                            onChange={(e) => updateField('problem', e.target.value)}
                                            placeholder="What user pain or business goal does this solve?&#10;As a ..., I want ..., so that ..."
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Proposed Solution *</label>
                                        <textarea
                                            value={formData.proposal}
                                            onChange={(e) => updateField('proposal', e.target.value)}
                                            placeholder="What do you want to happen?"
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Acceptance Criteria *</label>
                                        <textarea
                                            value={formData.acceptance}
                                            onChange={(e) => updateField('acceptance', e.target.value)}
                                            placeholder="- [ ] ...&#10;- [ ] ..."
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Alternatives Considered</label>
                                        <textarea
                                            value={formData.alternatives}
                                            onChange={(e) => updateField('alternatives', e.target.value)}
                                            placeholder="Any other approaches you considered?"
                                            className="w-full h-16 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Task-specific fields */}
                            {issueType === 'task' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Goal *</label>
                                        <textarea
                                            value={formData.goal}
                                            onChange={(e) => updateField('goal', e.target.value)}
                                            placeholder="What is the outcome we want?"
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Context</label>
                                        <textarea
                                            value={formData.context}
                                            onChange={(e) => updateField('context', e.target.value)}
                                            placeholder="Background, links, related issues/PRs..."
                                            className="w-full h-16 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Definition of Done *</label>
                                        <textarea
                                            value={formData.done}
                                            onChange={(e) => updateField('done', e.target.value)}
                                            placeholder="- [ ] ...&#10;- [ ] ..."
                                            className="w-full h-20 bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-300 mb-2 block">Priority</label>
                                        <select
                                            value={formData.priority}
                                            onChange={(e) => updateField('priority', e.target.value)}
                                            className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white outline-none focus:border-gk-accent"
                                        >
                                            <option>P0 - Urgent</option>
                                            <option>P1 - High</option>
                                            <option>P2 - Medium</option>
                                            <option>P3 - Low</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Image Upload */}
                            <div>
                                <label className="text-sm font-medium text-gray-300 mb-2 block">Screenshots / Images</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center px-4 py-2 bg-white/5 border border-white/10 rounded hover:bg-white/10 transition-colors text-sm"
                                >
                                    <ImagePlus className="w-4 h-4 mr-2" />
                                    Add Images (max 5MB each)
                                </button>

                                {/* Image Previews */}
                                {selectedFiles.length > 0 && (
                                    <div className="grid grid-cols-4 gap-2 mt-3">
                                        {selectedFiles.map((file) => (
                                            <div key={file.id} className="relative group">
                                                {file.preview && (
                                                    <img
                                                        src={file.preview}
                                                        alt={file.file.name}
                                                        className="w-full h-20 object-cover rounded"
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(file.id)}
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-gk-red rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <XIcon className="w-3 h-3 text-white" />
                                                </button>
                                                <div className="text-xs text-gray-500 truncate mt-1">
                                                    {file.file.name}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Checkboxes */}
                            <div className="space-y-2 pt-4 border-t border-white/10">
                                <label className="flex items-start cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.confirmSearch}
                                        onChange={(e) => updateField('confirmSearch', e.target.checked)}
                                        className="mt-1 mr-3"
                                    />
                                    <span className="text-sm text-gray-400">
                                        I searched existing issues and didn't find a duplicate.
                                    </span>
                                </label>
                                <label className="flex items-start cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.confirmInfo}
                                        onChange={(e) => updateField('confirmInfo', e.target.checked)}
                                        className="mt-1 mr-3"
                                    />
                                    <span className="text-sm text-gray-400">
                                        {issueType === 'bug'
                                            ? 'I included all information needed to reproduce the issue.'
                                            : 'I provided enough detail for this request to be actionable.'}
                                    </span>
                                </label>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center text-gk-red bg-gk-red/10 p-3 rounded">
                                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                    <span className="text-sm">{error}</span>
                                </div>
                            )}

                            {/* Submit */}
                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || uploadingImages}
                                    className="px-4 py-2 bg-gk-accent hover:bg-opacity-90 text-gk-bg font-bold rounded transition-colors flex items-center disabled:opacity-50"
                                >
                                    {loading || uploadingImages ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            {uploadingImages ? 'Uploading images...' : 'Submitting...'}
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4 mr-2" />
                                            Submit to GitHub
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IssueReporter;
