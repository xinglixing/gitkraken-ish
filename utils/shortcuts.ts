/**
 * Keyboard Shortcuts Utility
 * Platform-specific keyboard shortcut handling
 */

import { SHORTCUTS, getModKey, isMacOS } from './platform';
import { getShortcutForAction } from '../services/shortcutService';

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Parse a shortcut string (e.g., "Cmd+P", "Ctrl+S") into key combo
 */
export function parseShortcut(shortcut: string): {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
} {
  const parts = shortcut.toLowerCase().split('+');
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('ctrl'),
    meta: parts.includes('cmd') || parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
  };
}

/**
 * Check if an event matches a shortcut
 */
export function matchesShortcut(event: ShortcutEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const modKey = isMacOS() ? event.metaKey : event.ctrlKey;

  return (
    event.key.toLowerCase() === parsed.key &&
    !!event.ctrlKey === parsed.ctrl &&
    !!event.metaKey === parsed.meta &&
    !!event.shiftKey === parsed.shift &&
    !!event.altKey === parsed.alt &&
    modKey // At least one modifier (Ctrl or Cmd) must be pressed for main shortcuts
  );
}

/**
 * Format a shortcut for display in UI
 */
export function formatShortcut(shortcut: string): string {
  const modKey = getModKey();
  return shortcut
    .replace('Cmd', modKey)
    .replace('Ctrl', modKey)
    .replace('Shift', '⇧')
    .replace('Alt', isMacOS() ? '⌥' : 'Alt')
    .replace('Option', '⌥')
    .replace('Meta', '⌘');
}

/**
 * Get all shortcuts formatted for display
 */
export const DISPLAY_SHORTCUTS = {
  commandPalette: formatShortcut(SHORTCUTS.commandPalette),
  save: formatShortcut(SHORTCUTS.save),
  undo: formatShortcut(SHORTCUTS.undo),
  redo: formatShortcut(SHORTCUTS.redo),
  selectAll: formatShortcut(SHORTCUTS.selectAll),
  copy: formatShortcut(SHORTCUTS.copy),
  paste: formatShortcut(SHORTCUTS.paste),
  cut: formatShortcut(SHORTCUTS.cut),
  find: formatShortcut(SHORTCUTS.find),
} as const;

/**
 * Keyboard event handler hook
 */
export type ShortcutHandler = (event: KeyboardEvent) => void;

export interface ShortcutMap {
  [shortcut: string]: ShortcutHandler;
}

/**
 * Create a global keyboard shortcut handler
 */
export function createShortcutHandler(shortcuts: ShortcutMap): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    // Check if typing in an input field
    const target = event.target as HTMLElement;
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true';

    // Skip shortcuts when typing in inputs (except for specific ones like Ctrl+C)
    if (isInput && !['copy', 'paste', 'cut', 'selectAll', 'undo', 'redo'].includes(event.key.toLowerCase())) {
      return;
    }

    // Check each shortcut
    for (const [shortcut, handler] of Object.entries(shortcuts)) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
        return;
      }
    }
  };
}

/**
 * React hook for keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  React.useEffect(() => {
    if (!enabled) return;

    const handler = createShortcutHandler(shortcuts);
    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [shortcuts, enabled]);
}

// Import React for the hook
import React from 'react';

/**
 * Common keyboard shortcuts for the app
 */
export const APP_SHORTCUTS = {
  // Command Palette
  [SHORTCUTS.commandPalette]: 'commandPalette',

  // File operations
  [SHORTCUTS.save]: 'save',
  [SHORTCUTS.undo]: 'undo',
  [SHORTCUTS.redo]: 'redo',

  // Edit operations
  [SHORTCUTS.selectAll]: 'selectAll',
  [SHORTCUTS.copy]: 'copy',
  [SHORTCUTS.paste]: 'paste',
  [SHORTCUTS.cut]: 'cut',
  [SHORTCUTS.find]: 'find',
} as const;

export type AppShortcutAction = typeof APP_SHORTCUTS[keyof typeof APP_SHORTCUTS];

/**
 * Resolve a shortcut for an action, checking custom shortcuts first then defaults
 */
export function resolveShortcut(actionId: string): string {
  const custom = getShortcutForAction(actionId);
  if (custom) return custom;
  return (SHORTCUTS as any)[actionId] || '';
}
