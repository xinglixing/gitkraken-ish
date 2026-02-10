import React, { useState, useEffect } from 'react';
import { Keyboard, Download, Upload, RotateCcw, Edit3, Check, X } from 'lucide-react';
import { ShortcutMapping } from '../types';
import {
  getAllShortcuts, saveCustomShortcut, resetShortcuts,
  exportShortcutsJSON, importShortcutsJSON, DEFAULT_SHORTCUTS
} from '../services/shortcutService';

interface ShortcutEditorProps {
  onShortcutsChanged?: () => void;
}

const ShortcutEditor: React.FC<ShortcutEditorProps> = ({ onShortcutsChanged }) => {
  const [shortcuts, setShortcuts] = useState<ShortcutMapping[]>(getAllShortcuts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [conflictWarning, setConflictWarning] = useState<string>('');

  const refreshShortcuts = () => {
    setShortcuts(getAllShortcuts());
    onShortcutsChanged?.();
  };

  const handleStartEdit = (id: string) => {
    setEditingId(id);
    setRecordedKeys('');
    setConflictWarning('');
  };

  const handleKeyCapture = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    const key = e.key;
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    }

    if (parts.length > 0) {
      const combo = parts.join('+');
      setRecordedKeys(combo);
      // Check for conflicts
      const conflict = shortcuts.find(s => s.keys === combo && s.id !== editingId);
      if (conflict) {
        setConflictWarning(`Already used by "${conflict.action}"`);
      } else {
        setConflictWarning('');
      }
    }
  };

  const handleSaveEdit = (shortcut: ShortcutMapping) => {
    if (!recordedKeys) {
      setEditingId(null);
      return;
    }
    saveCustomShortcut({ ...shortcut, keys: recordedKeys, isCustom: true });
    setEditingId(null);
    setRecordedKeys('');
    refreshShortcuts();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setRecordedKeys('');
    setConflictWarning('');
  };

  const handleReset = () => {
    if (!window.confirm('Reset all shortcuts to defaults? Custom shortcuts will be lost.')) return;
    resetShortcuts();
    refreshShortcuts();
  };

  const handleExport = () => {
    const json = exportShortcutsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gitkraken-shortcuts.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const success = importShortcutsJSON(text);
        if (success) {
          setImportError('');
          refreshShortcuts();
        } else {
          setImportError('Invalid shortcuts file format');
        }
      } catch {
        setImportError('Failed to read file');
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center">
          <Keyboard className="w-4 h-4 mr-2" />
          Keyboard Shortcuts
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            className="flex items-center text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-white/5"
            title="Export shortcuts"
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </button>
          <button
            onClick={handleImport}
            className="flex items-center text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-white/5"
            title="Import shortcuts"
          >
            <Upload className="w-3 h-3 mr-1" />
            Import
          </button>
          <button
            onClick={handleReset}
            className="flex items-center text-xs text-gray-500 hover:text-gk-yellow px-2 py-1 rounded hover:bg-white/5"
            title="Reset to defaults"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </button>
        </div>
      </div>

      {importError && (
        <div className="text-xs text-gk-red bg-gk-red/10 px-3 py-2 rounded">{importError}</div>
      )}

      <div className="space-y-1">
        {shortcuts.map(shortcut => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="flex-1">
              <div className="text-sm text-gray-200">{shortcut.action}</div>
              {shortcut.isCustom && (
                <span className="text-[9px] text-gk-blue bg-gk-blue/10 px-1 rounded">custom</span>
              )}
            </div>

            {editingId === shortcut.id ? (
              <div className="flex flex-col items-end space-y-1">
                <div className="flex items-center space-x-2">
                  <input
                    autoFocus
                    readOnly
                    value={recordedKeys || 'Press keys...'}
                    onKeyDown={handleKeyCapture}
                    className="bg-gk-bg border border-gk-blue rounded px-2 py-1 text-xs text-white w-32 text-center outline-none"
                    placeholder="Press keys..."
                    aria-label="Record new shortcut key combination"
                  />
                  <button
                    onClick={() => handleSaveEdit(shortcut)}
                    className="text-gk-accent hover:text-white"
                    aria-label="Save shortcut"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="text-gray-500 hover:text-white"
                    aria-label="Cancel editing"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {conflictWarning && (
                  <span className="text-[10px] text-gk-yellow">{conflictWarning}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <kbd className="text-xs text-gray-400 bg-black/30 px-2 py-1 rounded border border-white/10 font-mono">
                  {shortcut.keys}
                </kbd>
                <button
                  onClick={() => handleStartEdit(shortcut.id)}
                  className="text-gray-600 hover:text-white transition-colors"
                  title="Record new shortcut"
                  aria-label={`Edit shortcut for ${shortcut.action}`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShortcutEditor;
