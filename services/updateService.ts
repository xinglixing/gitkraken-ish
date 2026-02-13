// Update Service - Checks for new releases from GitHub

export interface ReleaseInfo {
  version: string;
  tag_name: string;
  name: string;
  body: string; // Release notes markdown
  html_url: string;
  published_at: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseInfo?: ReleaseInfo;
}

// Current app version - update this when releasing new versions
export const CURRENT_VERSION = '1.0.18';

// GitHub repository info - update these to match your repo
const GITHUB_OWNER = 'xinglixing';
const GITHUB_REPO = 'gitkraken-ish';

// Local storage keys
const LAST_CHECK_KEY = 'gk_last_update_check';
const SKIPPED_VERSION_KEY = 'gk_skipped_version';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Parse version string to comparable numbers
 */
function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map(n => parseInt(n, 10) || 0);
}

/**
 * Compare two version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = parseVersion(v1);
  const parts2 = parseVersion(v2);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Check if we should check for updates (rate limiting)
 */
function shouldCheckForUpdates(): boolean {
  try {
    const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
    if (!lastCheck) return true;

    const lastCheckTime = parseInt(lastCheck, 10);
    const now = Date.now();

    return now - lastCheckTime > CHECK_INTERVAL;
  } catch {
    return true;
  }
}

/**
 * Get the version that the user chose to skip
 */
function getSkippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Skip a specific version
 */
export function skipVersion(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch (e) {
    console.warn('Failed to save skipped version:', e);
  }
}

/**
 * Clear skipped version
 */
export function clearSkippedVersion(): void {
  try {
    localStorage.removeItem(SKIPPED_VERSION_KEY);
  } catch (e) {
    console.warn('Failed to clear skipped version:', e);
  }
}

/**
 * Fetch the latest release from GitHub
 */
async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      console.warn('Failed to fetch latest release:', response.status);
      return null;
    }

    const data = await response.json();

    return {
      version: data.tag_name.replace(/^v/, ''),
      tag_name: data.tag_name,
      name: data.name || data.tag_name,
      body: data.body || '',
      html_url: data.html_url,
      published_at: data.published_at,
      assets: (data.assets || []).map((asset: any) => ({
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: asset.size,
      })),
    };
  } catch (error) {
    console.warn('Error fetching latest release:', error);
    return null;
  }
}

/**
 * Check for updates
 */
export async function checkForUpdates(force = false): Promise<UpdateCheckResult> {
  // Check rate limiting unless forced
  if (!force && !shouldCheckForUpdates()) {
    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
    };
  }

  // Update last check time
  try {
    localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
  } catch {
    // Ignore storage errors
  }

  const releaseInfo = await fetchLatestRelease();

  if (!releaseInfo) {
    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
    };
  }

  const hasUpdate = compareVersions(releaseInfo.version, CURRENT_VERSION) > 0;

  // Check if user skipped this version
  const skippedVersion = getSkippedVersion();
  if (skippedVersion && skippedVersion === releaseInfo.version) {
    return {
      hasUpdate: false,
      currentVersion: CURRENT_VERSION,
      latestVersion: releaseInfo.version,
      releaseInfo,
    };
  }

  return {
    hasUpdate,
    currentVersion: CURRENT_VERSION,
    latestVersion: releaseInfo.version,
    releaseInfo,
  };
}

/**
 * Format release notes for display
 */
export function formatReleaseNotes(body: string): string {
  // Basic markdown to text conversion for display
  return body
    .replace(/#{1,6}\s/g, '') // Remove headers
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/`/g, '') // Remove code ticks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
    .trim();
}

/**
 * Get platform-specific download URL from release assets
 */
export function getDownloadUrl(releaseInfo: ReleaseInfo): string | null {
  const platform = navigator.platform.toLowerCase();

  for (const asset of releaseInfo.assets) {
    const name = asset.name.toLowerCase();

    if (platform.includes('win') && (name.includes('win') || name.endsWith('.exe') || name.endsWith('.msi'))) {
      return asset.browser_download_url;
    }
    if (platform.includes('mac') && (name.includes('mac') || name.includes('darwin') || name.endsWith('.dmg'))) {
      return asset.browser_download_url;
    }
    if (platform.includes('linux') && (name.includes('linux') || name.endsWith('.AppImage') || name.endsWith('.deb'))) {
      return asset.browser_download_url;
    }
  }

  // Fallback to release page
  return releaseInfo.html_url;
}
