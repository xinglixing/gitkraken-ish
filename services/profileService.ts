import { Profile, User } from '../types';

const STORAGE_KEY = 'gk_profiles';
const ACTIVE_PROFILE_KEY = 'gk_active_profile_id';

export const getProfiles = (): Profile[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('Failed to parse stored profiles, returning empty:', e);
    return [];
  }
};

export const saveProfile = (profile: Profile): void => {
  const profiles = getProfiles();
  const index = profiles.findIndex(p => p.id === profile.id);
  
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
};

export const deleteProfile = (id: string): void => {
  const profiles = getProfiles().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
};

export const getActiveProfileId = (): string | null => {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
};

export const setActiveProfileId = (id: string): void => {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
};

export const createProfile = (name: string, user: User, token: string): Profile => {
  return {
    id: crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)),
    name: name,
    gitName: user.name || user.login,
    gitEmail: `${user.login}@users.noreply.github.com`, // Default fallback
    githubToken: token,
    githubUser: user
  };
};

export const createLocalProfile = (): Profile => {
    return {
        id: 'local-default',
        name: 'Local User',
        gitName: 'Local User',
        gitEmail: 'local@device',
        githubToken: '',
        githubUser: { login: 'local', name: 'Local', avatar_url: '' }
    }
}

/**
 * Check if a profile with the same GitHub login already exists
 * @param login The GitHub username/login to check
 * @param excludeId Optional profile ID to exclude from the check (for updates)
 * @returns The existing profile if found, null otherwise
 */
export const findProfileByLogin = (login: string, excludeId?: string): Profile | null => {
    const profiles = getProfiles();
    const existing = profiles.find(p =>
        p.githubUser?.login === login &&
        p.id !== excludeId
    );
    return existing || null;
}

/**
 * Check if adding/updating a profile would create a duplicate
 * @param login The GitHub username/login to check
 * @param excludeId Optional profile ID to exclude from the check
 * @returns true if a duplicate exists
 */
export const isDuplicateProfile = (login: string, excludeId?: string): boolean => {
    return findProfileByLogin(login, excludeId) !== null;
}