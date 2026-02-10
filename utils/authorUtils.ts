/**
 * Author Initials and Color Utilities
 * Generate initials and themed colors for commit authors
 */

/**
 * Color palette for author initials
 * Indigo/Purple theme to fit GitKraken-ish dark theme
 */
const AUTHOR_COLORS = [
  { bg: '#673AB7', text: '#FFFFFF' }, // Deep Purple
  { bg: '#7E57C2', text: '#FFFFFF' }, // Purple 400
  { bg: '#9575CD', text: '#FFFFFF' }, // Purple 300
  { bg: '#5E35B1', text: '#FFFFFF' }, // Deep Purple 600
  { bg: '#512DA8', text: '#FFFFFF' }, // Deep Purple 700
  { bg: '#4527A0', text: '#FFFFFF' }, // Deep Purple 800
  { bg: '#3F51B5', text: '#FFFFFF' }, // Indigo 500
  { bg: '#5C6BC0', text: '#FFFFFF' }, // Indigo 400
  { bg: '#7986CB', text: '#FFFFFF' }, // Indigo 300
  { bg: '#3949AB', text: '#FFFFFF' }, // Indigo 600
  { bg: '#303F9F', text: '#FFFFFF' }, // Indigo 700
  { bg: '#283593', text: '#FFFFFF' }, // Indigo 800
  { bg: '#1A237E', text: '#FFFFFF' }, // Indigo 900
  { bg: '#6200EA', text: '#FFFFFF' }, // Purple A700
  { bg: '#AA00FF', text: '#FFFFFF' }, // Purple A400
  { bg: '#D500F9', text: '#FFFFFF' }, // Purple A200
  { bg: '#E040FB', text: '#FFFFFF' }, // Purple A100
  { bg: '#7C4DFF', text: '#FFFFFF' }, // Deep Purple A200
  { bg: '#651FFF', text: '#FFFFFF' }, // Deep Purple A400
  { bg: '#6200EA', text: '#FFFFFF' }, // Deep Purple A700
];

/**
 * Get initials from author name
 */
export const getAuthorInitials = (authorName: string): string => {
  if (!authorName) return '?';

  // Remove common prefixes
  const name = authorName
    .replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '')
    .trim();

  // Split by spaces and hyphens
  const parts = name.split(/[\s-]+/);

  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    // Single name: use first letter
    return parts[0].charAt(0).toUpperCase();
  }

  // Multiple names: use first letter of first two parts
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

/**
 * Get consistent color for an author based on their name
 * Uses a hash function to always return the same color for the same name
 */
export const getAuthorColor = (authorName: string): { bg: string; text: string } => {
  if (!authorName) return AUTHOR_COLORS[0];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < authorName.length; i++) {
    const char = authorName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use absolute value and modulo to get index
  const index = Math.abs(hash) % AUTHOR_COLORS.length;
  return AUTHOR_COLORS[index];
};

/**
 * Get author initials component data
 * Returns initials, colors, and accessibility info
 */
export const getAuthorData = (authorName: string, authorEmail?: string) => {
  const initials = getAuthorInitials(authorName);
  const colors = getAuthorColor(authorName || authorEmail || 'Unknown');

  return {
    initials,
    backgroundColor: colors.bg,
    textColor: colors.text,
    fullName: authorName || 'Unknown Author',
    email: authorEmail,
    ariaLabel: `Commit by ${authorName || 'Unknown'}${authorEmail ? ` (${authorEmail})` : ''}`
  };
};

/**
 * Common author name patterns to extract first name for initials
 */
export const extractFirstName = (authorName: string): string => {
  if (!authorName) return '';

  // Remove titles
  const name = authorName.replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '');

  // Get first word
  const firstWord = name.split(/\s+/)[0];
  return firstWord || '';
};

/**
 * Format author name for display
 * Handles various formats like "John Doe <john@example.com>"
 */
export const formatAuthorName = (authorString: string): string => {
  if (!authorString) return 'Unknown';

  // Remove email from "Name <email>" format
  const match = authorString.match(/^([^<]+)<[^>]+>$/);
  if (match) {
    return match[1].trim();
  }

  return authorString;
};

/**
 * Get author initials from various formats
 */
export const getInitialsFromAnyFormat = (authorString: string): string => {
  const name = formatAuthorName(authorString);
  return getAuthorInitials(name);
};

/**
 * Predefined colors for special authors
 */
const SPECIAL_AUTHORS: Record<string, { bg: string; text: string }> = {
  'GitHub': { bg: '#24292e', text: '#FFFFFF' },
  'GitKraken': { bg: '#7c4dff', text: '#FFFFFF' },
  'Bot': { bg: '#607D8B', text: '#FFFFFF' },
  'Dependabot': { bg: '#025E0C', text: '#FFFFFF' },
  'Greenkeeper': { bg: '#00C853', text: '#FFFFFF' },
  'Renovate': { bg: '#A6C307', text: '#FFFFFF' },
};

/**
 * Get author color with special cases for known bots/services
 */
export const getAuthorColorSpecial = (authorName: string): { bg: string; text: string } => {
  if (!authorName) return AUTHOR_COLORS[0];

  // Check for special authors
  const lowerName = authorName.toLowerCase();

  for (const [special, color] of Object.entries(SPECIAL_AUTHORS)) {
    if (lowerName.includes(special.toLowerCase())) {
      return color;
    }
  }

  // Use regular color generation
  return getAuthorColor(authorName);
};
