import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Repository } from '../types';
import { gitListRemotes, gitAddRemote, gitDeleteRemote } from '../services/localGitService';
import { Trash2, Edit2, Plus, Globe, Check, X, Loader2 } from 'lucide-react';

interface RemoteManagerProps {
  isOpen: boolean;
  onClose: () => void;
  repo: Repository;
}

interface RemoteEntry {
  remote: string;
  url: string;
}

const isValidGitUrl = (url: string): boolean => {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(url.trim());
};

const RemoteManager: React.FC<RemoteManagerProps> = ({ isOpen, onClose, repo }) => {
  const [remotes, setRemotes] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState('origin');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const urlInputRef = useRef<HTMLInputElement>(null);

  const loadRemotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await gitListRemotes(repo);
      setRemotes(list);
      // Default name to 'origin' only if no origin exists
      if (!list.some(r => r.remote === 'origin')) {
        setNewName('origin');
      } else {
        setNewName('');
      }
    } catch (e) {
      setError(e.message || 'Failed to list remotes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRemotes();
      // Auto-focus URL input after a short delay
      const timer = setTimeout(() => urlInputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();

    if (!trimmedName) {
      setError('Remote name is required.');
      return;
    }
    if (!trimmedUrl) {
      setError('Remote URL is required.');
      return;
    }
    if (!isValidGitUrl(trimmedUrl)) {
      setError('Invalid URL format. Use https://, git@, or ssh:// prefix.');
      return;
    }
    if (remotes.some(r => r.remote === trimmedName)) {
      setError(`Remote "${trimmedName}" already exists.`);
      return;
    }

    setAdding(true);
    setError(null);
    try {
      await gitAddRemote(repo, trimmedName, trimmedUrl);
      setNewName('');
      setNewUrl('');
      await loadRemotes();
    } catch (e) {
      setError(e.message || 'Failed to add remote');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (remoteName: string) => {
    setError(null);
    try {
      await gitDeleteRemote(repo, remoteName);
      setConfirmDelete(null);
      await loadRemotes();
    } catch (e) {
      setError(e.message || 'Failed to delete remote');
    }
  };

  const handleEditSave = async (oldName: string) => {
    const trimmedUrl = editUrl.trim();
    if (!trimmedUrl) {
      setError('Remote URL is required.');
      return;
    }
    if (!isValidGitUrl(trimmedUrl)) {
      setError('Invalid URL format. Use https://, git@, or ssh:// prefix.');
      return;
    }

    setError(null);
    try {
      // Delete old and re-add with new URL
      await gitDeleteRemote(repo, oldName);
      await gitAddRemote(repo, oldName, trimmedUrl);
      setEditingRemote(null);
      await loadRemotes();
    } catch (e) {
      setError(e.message || 'Failed to update remote');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Remotes"
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-gk-red/10 border border-gk-red/30 rounded-lg text-sm text-gk-red">
            {error}
          </div>
        )}

        {/* Existing Remotes List */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Configured Remotes</h3>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : remotes.length === 0 ? (
            <div className="py-6 text-center text-gray-500 text-sm border border-dashed border-white/10 rounded-lg">
              No remotes configured. Add one below.
            </div>
          ) : (
            <div className="space-y-2">
              {remotes.map((r) => (
                <div
                  key={r.remote}
                  className="flex items-center justify-between p-3 bg-gk-bg rounded-lg border border-white/10 group"
                >
                  {editingRemote === r.remote ? (
                    <div className="flex-1 flex items-center space-x-2">
                      <span className="text-sm font-medium text-gk-accent whitespace-nowrap">{r.remote}</span>
                      <input
                        type="text"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="flex-1 bg-black/30 border border-white/20 rounded px-2 py-1 text-sm text-gray-200 focus:border-gk-blue focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(r.remote);
                          if (e.key === 'Escape') setEditingRemote(null);
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleEditSave(r.remote)}
                        className="p-1 hover:bg-gk-accent/20 rounded text-gk-accent"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingRemote(null)}
                        className="p-1 hover:bg-white/10 rounded text-gray-400"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : confirmDelete === r.remote ? (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm text-gk-red">Delete "{r.remote}"?</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleDelete(r.remote)}
                          className="px-3 py-1 bg-gk-red/20 hover:bg-gk-red/30 text-gk-red text-sm rounded transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-3 py-1 hover:bg-white/10 text-gray-400 text-sm rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center space-x-2 min-w-0">
                        <Globe className="w-4 h-4 text-gk-blue flex-shrink-0" />
                        <span className="text-sm font-medium text-gk-accent">{r.remote}</span>
                        <span className="text-sm text-gray-400 truncate">{r.url}</span>
                      </div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingRemote(r.remote);
                            setEditUrl(r.url);
                            setError(null);
                          }}
                          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                          title="Edit URL"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDelete(r.remote);
                            setError(null);
                          }}
                          className="p-1 hover:bg-gk-red/20 rounded text-gray-400 hover:text-gk-red"
                          title="Delete remote"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Remote Form */}
        <div className="border-t border-white/10 pt-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Add Remote</h3>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="name"
              className="w-24 bg-gk-bg border border-white/20 rounded px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-gk-blue focus:outline-none"
            />
            <input
              ref={urlInputRef}
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="flex-1 bg-gk-bg border border-white/20 rounded px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-gk-blue focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newUrl.trim()}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gk-blue hover:bg-gk-blue/80 disabled:bg-gk-blue/30 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Add</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default RemoteManager;
