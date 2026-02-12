import { ShortcutMapping } from '../types';

const STORAGE_KEY = 'gk_custom_shortcuts';

export const DEFAULT_SHORTCUTS: ShortcutMapping[] = [
  { id: 'commandPalette', action: 'Command Palette', keys: 'Ctrl+Shift+P', isCustom: false },
  { id: 'terminal', action: 'Toggle Terminal', keys: 'Ctrl+`', isCustom: false },
  { id: 'save', action: 'Save', keys: 'Ctrl+S', isCustom: false },
  { id: 'undo', action: 'Undo', keys: 'Ctrl+Z', isCustom: false },
  { id: 'redo', action: 'Redo', keys: 'Ctrl+Y', isCustom: false },
  { id: 'find', action: 'Find', keys: 'Ctrl+F', isCustom: false },
  { id: 'stash', action: 'Stash Changes', keys: 'Ctrl+Shift+H', isCustom: false },
  { id: 'stashList', action: 'Open Stash List', keys: 'Ctrl+K', isCustom: false },
  { id: 'squash', action: 'Squash Commits', keys: 'Ctrl+Shift+S', isCustom: false },
];

export const getCustomShortcuts = (): ShortcutMapping[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load custom shortcuts:', e);
  }
  return [];
};

export const saveCustomShortcut = (shortcut: ShortcutMapping): void => {
  const shortcuts = getCustomShortcuts();
  const existingIndex = shortcuts.findIndex(s => s.id === shortcut.id);
  if (existingIndex >= 0) {
    shortcuts[existingIndex] = { ...shortcut, isCustom: true };
  } else {
    shortcuts.push({ ...shortcut, isCustom: true });
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch (e) {
    console.warn('Failed to save shortcut (storage quota exceeded?):', e);
  }
};

export const deleteCustomShortcut = (id: string): void => {
  const shortcuts = getCustomShortcuts().filter(s => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch (e) {
    console.warn('Failed to save shortcuts:', e);
  }
};

export const resetShortcuts = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const getAllShortcuts = (): ShortcutMapping[] => {
  const custom = getCustomShortcuts();
  const merged = DEFAULT_SHORTCUTS.map(def => {
    const customOverride = custom.find(c => c.id === def.id);
    return customOverride || def;
  });
  // Add any custom shortcuts that aren't overrides of defaults
  const defaultIds = new Set(DEFAULT_SHORTCUTS.map(d => d.id));
  const extraCustom = custom.filter(c => !defaultIds.has(c.id));
  return [...merged, ...extraCustom];
};

export const getShortcutForAction = (actionId: string): string | null => {
  const custom = getCustomShortcuts();
  const customMapping = custom.find(s => s.id === actionId);
  if (customMapping) return customMapping.keys;
  const defaultMapping = DEFAULT_SHORTCUTS.find(s => s.id === actionId);
  return defaultMapping?.keys || null;
};

export const exportShortcutsJSON = (): string => {
  return JSON.stringify(getAllShortcuts(), null, 2);
};

export const importShortcutsJSON = (json: string): boolean => {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return false;
    // Validate structure
    for (const item of parsed) {
      if (!item.id || !item.action || !item.keys) return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.map((s: ShortcutMapping) => ({ ...s, isCustom: true }))));
    } catch (e) {
      console.warn('Failed to import shortcuts (storage quota exceeded?):', e);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};
