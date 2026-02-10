import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Key, MessageSquare, User as UserIcon, Plus, Trash2, LogOut, Github, Shield, Cpu, Settings, Keyboard, Bug } from 'lucide-react';
import { AIConfig, AIProvider, Profile, User, ShellPreference } from '../types';
import { getProfiles, saveProfile, deleteProfile, setActiveProfileId, createProfile, isDuplicateProfile, clearAllProfileData, clearProfileSpecificData } from '../services/profileService';
import { validateToken } from '../services/githubService';
import { isDebugMode, setDebugMode } from '../services/debugService';
import ConfirmDialog from './ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import ShortcutEditor from './ShortcutEditor';
import { getPlatform, Platform } from '../utils/platform';

interface SettingsModalProps {
  config: AIConfig;
  activeProfile: Profile | null;
  onSaveConfig: (config: AIConfig) => void;
  onUpdateProfile: (profile: Profile) => void;
  onSwitchProfile: (profileId: string) => void;
  onClose: () => void;
}

type Tab = 'profiles' | 'ai' | 'general' | 'shortcuts' | 'debug';

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  config, activeProfile, onSaveConfig, onUpdateProfile, onSwitchProfile, onClose 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('profiles');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { dialogState: confirmState, confirm: triggerConfirm, handleConfirm: onConfirmYes, handleCancel: onConfirmNo } = useConfirmDialog();
  const [localConfig, setLocalConfig] = useState<AIConfig>({ ...config });
  const [debugEnabled, setDebugEnabled] = useState(isDebugMode());
  
  // New Profile Form State
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [newName, setNewName] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    setProfiles(getProfiles());
  }, [activeProfile]);

  const updateKey = (provider: AIProvider, value: string) => {
    setLocalConfig(prev => ({
      ...prev,
      keys: { ...prev.keys, [provider]: value }
    }));
  };

  const updateModel = (provider: AIProvider, value: string) => {
    setLocalConfig(prev => ({
      ...prev,
      modelOverrides: { ...prev.modelOverrides, [provider]: value }
    }));
  };

  const handleSaveAI = () => {
      onSaveConfig(localConfig);
      onClose();
  };

  const handleAddProfile = async () => {
      if (!newToken) return;
      setVerifyLoading(true);
      setVerifyError('');
      try {
          const user = await validateToken(newToken);

          // Check for duplicate account
          if (isDuplicateProfile(user.login)) {
              setVerifyError(`Account "${user.login}" already exists`);
              setVerifyLoading(false);
              return;
          }

          const p = createProfile(newName || user.login, user, newToken);
          saveProfile(p);
          setProfiles(getProfiles());
          setIsAddingProfile(false);
          setNewToken('');
          setNewName('');
          // Optional: switch to new profile immediately
          onSwitchProfile(p.id);
      } catch (e) {
          const msg = e?.message || '';
          if (msg.includes('401') || msg.includes('Unauthorized')) {
              setVerifyError('Invalid or expired token. Please generate a new token with correct scopes.');
          } else if (msg.includes('network') || msg.includes('fetch')) {
              setVerifyError('Network error. Please check your internet connection.');
          } else {
              setVerifyError('Could not verify token. Please check the token and try again.');
          }
      } finally {
          setVerifyLoading(false);
      }
  };

  const handleDeleteProfile = async (id: string) => {
      const ok = await triggerConfirm({
          title: 'Delete Profile',
          message: 'Are you sure you want to delete this profile? This will remove the account and all associated cached data. This action cannot be undone.',
          type: 'danger',
          confirmText: 'Delete',
      });
      if (ok) {
          // Clear profile-specific cached data first
          clearProfileSpecificData(id);

          // Delete the profile
          deleteProfile(id);
          const remaining = getProfiles();
          setProfiles(remaining);

          if (remaining.length === 0) {
              // Last profile deleted - clear all account-related data
              clearAllProfileData();
              onSwitchProfile('');
          } else if (activeProfile?.id === id) {
              // Switch to another profile
              onSwitchProfile(remaining[0].id);
          }
      }
  };

  const handleUpdateProfileGitInfo = (field: 'gitName' | 'gitEmail', value: string) => {
      if (!activeProfile) return;
      const updated = { ...activeProfile, [field]: value };
      saveProfile(updated);
      onUpdateProfile(updated);
      setProfiles(getProfiles()); // Refresh list
  };

  const providers: { id: AIProvider; label: string; defaultModel: string; options: string[] }[] = [
    { 
        id: 'gemini', 
        label: 'Google Gemini', 
        defaultModel: 'gemini-3-flash-preview',
        options: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash-preview']
    },
    { 
        id: 'openai', 
        label: 'OpenAI (GPT-4)', 
        defaultModel: 'gpt-4o',
        options: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    { 
        id: 'claude', 
        label: 'Anthropic Claude', 
        defaultModel: 'claude-3-5-sonnet-20240620',
        options: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229']
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        defaultModel: 'deepseek-chat',
        options: ['deepseek-chat', 'deepseek-coder']
    },
    {
        id: 'zai',
        label: 'ZAI',
        defaultModel: 'zai-1',
        options: ['zai-1']
    },
  ];

  const activeProviderDef = providers.find(p => p.id === localConfig.provider);
  const currentModel = localConfig.modelOverrides?.[localConfig.provider] || activeProviderDef?.defaultModel || '';

  // Get platform-appropriate shell options
  const shellOptions = useMemo(() => {
    const platform = getPlatform();
    const options: { value: ShellPreference; label: string }[] = [
      { value: 'auto', label: 'Auto-detect' }
    ];

    if (platform === Platform.WINDOWS) {
      options.push(
        { value: 'powershell', label: 'PowerShell' },
        { value: 'cmd', label: 'Command Prompt (CMD)' },
        { value: 'bash', label: 'Bash (Git Bash / WSL)' }
      );
    } else if (platform === Platform.MACOS) {
      options.push(
        { value: 'zsh', label: 'Zsh (default)' },
        { value: 'bash', label: 'Bash' }
      );
    } else {
      // Linux
      options.push(
        { value: 'bash', label: 'Bash (default)' },
        { value: 'zsh', label: 'Zsh' }
      );
    }

    return options;
  }, []);

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[800px] bg-gk-panel border border-gk-header shadow-2xl rounded-lg flex h-[600px] overflow-hidden">

        {/* Sidebar */}
        <div className="w-48 bg-black/20 border-r border-black/20 flex flex-col p-2">
            <div className="p-4 font-bold text-gray-200 text-lg mb-4">Settings</div>
            
            <button 
                onClick={() => setActiveTab('general')}
                className={`flex items-center px-4 py-2 rounded text-sm mb-1 ${activeTab === 'general' ? 'bg-gk-blue/10 text-gk-blue font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
                <Settings className="w-4 h-4 mr-2" /> General
            </button>
            <button 
                onClick={() => setActiveTab('profiles')}
                className={`flex items-center px-4 py-2 rounded text-sm mb-1 ${activeTab === 'profiles' ? 'bg-gk-accent/10 text-gk-accent font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
                <UserIcon className="w-4 h-4 mr-2" /> Profiles
            </button>
             <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center px-4 py-2 rounded text-sm mb-1 ${activeTab === 'ai' ? 'bg-gk-purple/10 text-gk-purple font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
                <MessageSquare className="w-4 h-4 mr-2" /> AI Integration
            </button>
            <button
                onClick={() => setActiveTab('shortcuts')}
                className={`flex items-center px-4 py-2 rounded text-sm mb-1 ${activeTab === 'shortcuts' ? 'bg-gk-yellow/10 text-gk-yellow font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
                <Keyboard className="w-4 h-4 mr-2" /> Shortcuts
            </button>
            <button
                onClick={() => setActiveTab('debug')}
                className={`flex items-center px-4 py-2 rounded text-sm mb-1 ${activeTab === 'debug' ? 'bg-gk-red/10 text-gk-red font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
                <Bug className="w-4 h-4 mr-2" /> Debug
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
            <div className="h-14 flex items-center justify-between px-6 border-b border-black/20">
                <h2 className="text-lg font-bold text-gray-200 capitalize">{activeTab}</h2>
                <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-white" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                
                 {/* --- GENERAL TAB --- */}
                 {activeTab === 'general' && (
                    <div className="space-y-6">
                        {/* Display Settings */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Display</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                    <div>
                                        <div className="text-sm font-medium text-gray-200">Default Diff View</div>
                                        <div className="text-xs text-gray-500">How to display file differences</div>
                                    </div>
                                    <select
                                        className="bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                        value={localConfig.defaultDiffView || 'split'}
                                        onChange={(e) => setLocalConfig({...localConfig, defaultDiffView: e.target.value as any})}
                                    >
                                        <option value="split">Split View</option>
                                        <option value="unified">Unified View</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                    <div>
                                        <div className="text-sm font-medium text-gray-200">Date Format</div>
                                        <div className="text-xs text-gray-500">How to display commit dates</div>
                                    </div>
                                    <select
                                        className="bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                        value={localConfig.dateFormat || 'relative'}
                                        onChange={(e) => setLocalConfig({...localConfig, dateFormat: e.target.value as any})}
                                    >
                                        <option value="relative">Relative (2 hours ago)</option>
                                        <option value="absolute">Absolute (Jan 15, 2024)</option>
                                        <option value="both">Both</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                    <div>
                                        <div className="text-sm font-medium text-gray-200">Show Avatars</div>
                                        <div className="text-xs text-gray-500">Display author avatars in commit graph</div>
                                    </div>
                                    <button
                                        onClick={() => setLocalConfig({...localConfig, showAvatars: !(localConfig.showAvatars ?? true)})}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${(localConfig.showAvatars ?? true) ? 'bg-gk-accent' : 'bg-gray-600'}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${(localConfig.showAvatars ?? true) ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Git Settings */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Git</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                    <div>
                                        <div className="text-sm font-medium text-gray-200">Default Branch Name</div>
                                        <div className="text-xs text-gray-500">Branch name when initializing new repositories</div>
                                    </div>
                                    <input
                                        type="text"
                                        className="bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none w-24 text-center"
                                        value={localConfig.defaultBranch || 'main'}
                                        onChange={(e) => setLocalConfig({...localConfig, defaultBranch: e.target.value})}
                                        placeholder="main"
                                    />
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                    <div>
                                        <div className="text-sm font-medium text-gray-200">Prune on Fetch</div>
                                        <div className="text-xs text-gray-500">Remove deleted remote branches when fetching</div>
                                    </div>
                                    <button
                                        onClick={() => setLocalConfig({...localConfig, pruneOnFetch: !localConfig.pruneOnFetch})}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.pruneOnFetch ? 'bg-gk-accent' : 'bg-gray-600'}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${localConfig.pruneOnFetch ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                    <div>
                                        <div className="text-sm font-medium text-gray-200">Confirm Before Push</div>
                                        <div className="text-xs text-gray-500">Show confirmation dialog before pushing</div>
                                    </div>
                                    <button
                                        onClick={() => setLocalConfig({...localConfig, confirmBeforePush: !localConfig.confirmBeforePush})}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${localConfig.confirmBeforePush ? 'bg-gk-accent' : 'bg-gray-600'}`}
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${localConfig.confirmBeforePush ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Terminal Settings */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Terminal</h3>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                 <div>
                                    <div className="text-sm font-medium text-gray-200">Default Shell</div>
                                    <div className="text-xs text-gray-500">Shell used in the embedded terminal</div>
                                </div>
                                <select
                                    className="bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                    value={localConfig.shellPreference || 'auto'}
                                    onChange={(e) => setLocalConfig({...localConfig, shellPreference: e.target.value as ShellPreference})}
                                >
                                    {shellOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Sync Settings */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Sync</h3>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                 <div>
                                    <div className="text-sm font-medium text-gray-200">Auto-Fetch Interval</div>
                                    <div className="text-xs text-gray-500">How often to fetch from remotes</div>
                                </div>
                                <select
                                    className="bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                    value={localConfig.fetchInterval || 0}
                                    onChange={(e) => setLocalConfig({...localConfig, fetchInterval: parseInt(e.target.value)})}
                                >
                                    <option value={0}>Manual Only</option>
                                    <option value={1}>Every 1 min</option>
                                    <option value={5}>Every 5 mins</option>
                                    <option value={15}>Every 15 mins</option>
                                    <option value={60}>Every hour</option>
                                </select>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/10 flex justify-end">
                             <button
                                onClick={handleSaveAI}
                                className="px-6 py-2 bg-gk-accent hover:bg-opacity-90 text-gk-bg font-bold rounded transition-colors"
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* --- PROFILES TAB --- */}
                {activeTab === 'profiles' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-400 uppercase">My Profiles</h3>
                            <button 
                                onClick={() => setIsAddingProfile(true)} 
                                className="flex items-center px-3 py-1.5 bg-gk-accent/10 text-gk-accent rounded border border-gk-accent/20 hover:bg-gk-accent/20 text-xs font-bold"
                            >
                                <Plus className="w-3 h-3 mr-1" /> Add Account
                            </button>
                        </div>

                        {/* Add Profile Form */}
                        {isAddingProfile && (
                            <div className="bg-white/5 p-4 rounded-lg border border-white/10 animate-fade-in">
                                <h4 className="font-bold text-white mb-3">Connect New GitHub Account</h4>
                                <input 
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Profile Name (e.g. Work)"
                                    className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white mb-2 focus:border-gk-blue outline-none"
                                />
                                <input 
                                    type="password"
                                    value={newToken}
                                    onChange={e => setNewToken(e.target.value)}
                                    placeholder="GitHub Personal Access Token"
                                    className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white mb-2 focus:border-gk-blue outline-none"
                                />
                                {verifyError && <div className="text-xs text-gk-red mb-2">{verifyError}</div>}
                                <div className="flex justify-end space-x-2">
                                    <button onClick={() => setIsAddingProfile(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs">Cancel</button>
                                    <button 
                                        onClick={handleAddProfile}
                                        disabled={verifyLoading}
                                        className="px-3 py-1.5 bg-gk-blue text-white rounded text-xs font-bold"
                                    >
                                        {verifyLoading ? 'Verifying...' : 'Connect'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Profiles List */}
                        <div className="space-y-2">
                            {profiles.map(p => {
                                const isActive = activeProfile?.id === p.id;
                                return (
                                    <div key={p.id} className={`p-4 rounded-lg border flex items-center justify-between ${isActive ? 'bg-gk-blue/10 border-gk-blue' : 'bg-white/5 border-white/5'}`}>
                                        <div className="flex items-center">
                                            {p.githubUser?.avatar_url ? (
                                                <img src={p.githubUser.avatar_url} className="w-10 h-10 rounded-full mr-3 border border-white/10" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gray-700 mr-3 flex items-center justify-center text-gray-400">
                                                    <UserIcon className="w-5 h-5" />
                                                </div>
                                            )}
                                            <div>
                                                <div className="flex items-center">
                                                    <span className="font-bold text-gray-200 mr-2">{p.name}</span>
                                                    {isActive && <span className="text-[10px] bg-gk-blue text-white px-1.5 rounded font-bold">ACTIVE</span>}
                                                </div>
                                                <div className="text-xs text-gray-500">{p.githubUser?.login || 'Local'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            {!isActive && (
                                                <button onClick={() => onSwitchProfile(p.id)} className="px-3 py-1.5 text-xs border border-white/10 rounded hover:bg-white/10 text-gray-300">
                                                    Switch
                                                </button>
                                            )}
                                            <button onClick={() => handleDeleteProfile(p.id)} className="p-2 text-gray-500 hover:text-gk-red transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Git Author Settings for Active Profile */}
                        {activeProfile && (
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Git Commit Author</h3>
                                <p className="text-xs text-gray-500 mb-4">These values will be used as the author for commits made with this profile.</p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Author Name</label>
                                        <input
                                            type="text"
                                            value={activeProfile.gitName || ''}
                                            onChange={(e) => handleUpdateProfileGitInfo('gitName', e.target.value)}
                                            placeholder="Your Name"
                                            className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-gk-blue outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Author Email</label>
                                        <input
                                            type="email"
                                            value={activeProfile.gitEmail || ''}
                                            onChange={(e) => handleUpdateProfileGitInfo('gitEmail', e.target.value)}
                                            placeholder="your.email@example.com"
                                            className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-gk-blue outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- AI TAB --- */}
                {activeTab === 'ai' && (
                    <div className="space-y-6">
                         {/* Provider Section */}
                        <div>
                            <h3 className="text-sm font-bold text-gk-accent uppercase mb-4">Active AI Provider</h3>
                            <div className="grid grid-cols-2 gap-3">
                            {providers.map(p => (
                                <button
                                key={p.id}
                                onClick={() => setLocalConfig({ ...localConfig, provider: p.id })}
                                className={`flex items-center justify-between px-4 py-3 rounded border text-sm font-medium transition-all ${
                                    localConfig.provider === p.id
                                    ? 'bg-gk-accent/10 border-gk-accent text-gk-accent'
                                    : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                }`}
                                >
                                <span>{p.label}</span>
                                {localConfig.provider === p.id && <Check className="w-4 h-4" />}
                                </button>
                            ))}
                            </div>
                        </div>

                        {/* API Key Section */}
                        <div className="flex gap-4">
                             <div className="flex-1">
                                <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center mb-3">
                                <Key className="w-4 h-4 mr-2" />
                                API Key
                                </h3>
                                
                                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                                    <label className="block text-xs text-gray-500 mb-1">{activeProviderDef?.label} Key</label>
                                    <input 
                                    type="password"
                                    value={localConfig.keys[localConfig.provider] || ''}
                                    onChange={(e) => updateKey(localConfig.provider, e.target.value)}
                                    placeholder={`Enter your ${activeProviderDef?.label} API Key...`}
                                    className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-gk-blue focus:outline-none placeholder-gray-700"
                                    />
                                </div>
                             </div>

                             {/* Model Selection */}
                             <div className="flex-1">
                                <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center mb-3">
                                <Cpu className="w-4 h-4 mr-2" />
                                Model
                                </h3>
                                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                                    <label className="block text-xs text-gray-500 mb-1">Selected Model</label>
                                    <div className="relative">
                                        <input 
                                            list="model-options"
                                            type="text" 
                                            value={currentModel}
                                            onChange={(e) => updateModel(localConfig.provider, e.target.value)}
                                            placeholder="Select or type model..."
                                            className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-gk-blue focus:outline-none placeholder-gray-700"
                                        />
                                        <datalist id="model-options">
                                            {activeProviderDef?.options.map(opt => (
                                                <option key={opt} value={opt} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        Default: {activeProviderDef?.defaultModel}
                                    </p>
                                </div>
                             </div>
                        </div>

                         {/* AI Commit Message Config */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center mb-3">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Commit Message Generation
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-2">Message Style</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['conventional', 'emoji', 'concise', 'detailed'].map((style) => (
                                            <button
                                                key={style}
                                                onClick={() => setLocalConfig({...localConfig, commitStyle: style as any})}
                                                className={`px-2 py-2 rounded text-xs capitalize border ${
                                                    localConfig.commitStyle === style 
                                                    ? 'bg-gk-blue/20 border-gk-blue text-gk-blue' 
                                                    : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                                }`}
                                            >
                                                {style}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-white/10 flex justify-end">
                             <button
                                onClick={handleSaveAI}
                                className="px-6 py-2 bg-gk-purple hover:bg-opacity-90 text-white font-bold rounded transition-colors"
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* --- SHORTCUTS TAB --- */}
                {activeTab === 'shortcuts' && (
                    <div className="space-y-6">
                        <ShortcutEditor />
                    </div>
                )}

                {/* --- DEBUG TAB --- */}
                {activeTab === 'debug' && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Debug Mode</h3>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                                <div>
                                    <div className="text-sm font-medium text-gray-200">Enable Debug Mode</div>
                                    <div className="text-xs text-gray-500">Log all Git commands and AI interactions for troubleshooting</div>
                                </div>
                                <button
                                    onClick={() => {
                                        const newValue = !debugEnabled;
                                        setDebugEnabled(newValue);
                                        setDebugMode(newValue);
                                    }}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${debugEnabled ? 'bg-gk-accent' : 'bg-gray-600'}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${debugEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Information</h3>
                            <div className="p-4 bg-white/5 rounded-lg border border-white/5 space-y-2">
                                <p className="text-sm text-gray-300">When debug mode is enabled, all Git operations and AI requests are logged to the Debug Panel.</p>
                                <p className="text-sm text-gray-400">Open the Debug Panel from the toolbar to view logged commands, AI prompts, and errors.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      isOpen={confirmState.isOpen}
      onClose={onConfirmNo}
      onConfirm={onConfirmYes}
      title={confirmState.title}
      message={confirmState.message}
      details={confirmState.details}
      type={confirmState.type}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
    />
    </>
  );
};

export default SettingsModal;