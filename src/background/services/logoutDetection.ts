/**
 * Logout Detection Service
 * 
 * Detects when user logs out of Ivanti using multiple strategies:
 * 1. Cookie monitoring (primary - event-driven)
 * 2. Periodic cookie check (backup)
 * 3. Auth probe (401/403 detection)
 */

import { clearGlobalUserSession, hasUserSession } from './sessionManager';
import { IVANTI_CONFIG } from '../config';

// Track if logout is already in progress to avoid double cleanup
let logoutInProgress = false;

// Interval IDs
let periodicCheckInterval: number | null = null;
let authProbeInterval: number | null = null;

/**
 * Check if user is logged out by verifying UserSettings cookie exists
 * BEST PRACTICE: Use this as a backup validation, not primary detection
 * Primary detection should be cookie.onChanged listener (event-driven)
 */
export async function checkUserLoggedOut(): Promise<boolean> {
  try {
    // Try multiple domain formats (cookies can be stored with different domain formats)
    const domains = [
      'serviceitplus.com',
      '.serviceitplus.com',
      'success.serviceitplus.com',
      '.success.serviceitplus.com',
    ];

    for (const domain of domains) {
      try {
        const cookies = await chrome.cookies.getAll({ domain });
        const userSettingsCookie = cookies.find(c => c.name === 'UserSettings');

        if (userSettingsCookie) {
          // Found the cookie - user is logged in
          return false;
        }
      } catch (domainError) {
        // Some domains might not be accessible, continue to next
        continue;
      }
    }

    // If no cookie found, also verify we don't have an active session
    // This prevents false positives during initial load
    if (hasUserSession()) {
      // We have an active session in memory - verify it's still valid
      const result = await chrome.storage.local.get(['currentUser']);
      if (result.currentUser) {
        // Session exists in storage - assume still logged in
        // Cookie might be temporarily unavailable but session is valid
        return false;
      }
    }

    // No cookie AND no active session = logged out
    return true;
  } catch (error) {
    console.error('[LogoutDetection] Error checking logout status:', error);
    // On error, assume still logged in (fail-safe)
    return false;
  }
}

/**
 * Handle logout cleanup
 * Clears all user data, conversation history, and cache
 */
export async function handleLogout(): Promise<void> {
  if (logoutInProgress) {
    console.log('[LogoutDetection] 🚪 Logout already in progress, skipping duplicate call');
    return;
  }
  
  logoutInProgress = true;
  console.log('[LogoutDetection] 🚪 ========================================');
  console.log('[LogoutDetection] 🚪 LOGOUT DETECTED - Starting cleanup');
  console.log('[LogoutDetection] 🚪 ========================================');

  // Stop monitoring
  stopPeriodicLogoutCheck();
  stopAuthProbe();

  // Clear global session
  clearGlobalUserSession();

  // Clear all conversation histories from storage
  const allData = await new Promise<Record<string, any>>((resolve) => {
    chrome.storage.local.get(null, resolve);
  });

  const keysToRemove: string[] = [];
  Object.keys(allData).forEach((key) => {
    if (key.startsWith('conversationHistory_')) {
      keysToRemove.push(key);
    }
    if (key === 'currentUser' || key === 'lastSessionId') {
      keysToRemove.push(key);
    }
  });

  if (keysToRemove.length > 0) {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove(keysToRemove, () => {
        console.log('[LogoutDetection] ✅ Cleared stored user data and histories:', keysToRemove);
        resolve();
      });
    });
  }

  // Notify all Ivanti tabs that user logged out
  chrome.tabs.query({ url: `${IVANTI_CONFIG.baseUrl}/*` }, (tabs) => {
    console.log(`[LogoutDetection] 📤 Sending USER_LOGGED_OUT to ${tabs.length} tabs`);
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'USER_LOGGED_OUT',
        }).then(() => {
          console.log(`[LogoutDetection] ✅ Sent USER_LOGGED_OUT to tab ${tab.id}`);
        }).catch((error) => {
          // This is expected if the content script isn't running on the tab
          console.log(`[LogoutDetection] Note: Could not send logout to tab ${tab.id}:`, error.message);
        });
      }
    });
  });

  console.log('[LogoutDetection] 🚪 ========================================');
  console.log('[LogoutDetection] 🚪 LOGOUT CLEANUP COMPLETE');
  console.log('[LogoutDetection] 🚪 ========================================');
  logoutInProgress = false;
}

/**
 * Start periodic logout check (backup detection)
 * Checks every 30 seconds if user is still logged in
 */
export function startPeriodicLogoutCheck(): void {
  // Clear any existing interval
  if (periodicCheckInterval !== null) {
    clearInterval(periodicCheckInterval);
  }

  // Only start periodic check if we have an active session
  if (hasUserSession()) {
    periodicCheckInterval = setInterval(async () => {
      // Only check if we still have an active session
      if (!hasUserSession()) {
        // Session cleared, stop checking
        if (periodicCheckInterval !== null) {
          clearInterval(periodicCheckInterval);
          periodicCheckInterval = null;
        }
        return;
      }

      const isLoggedOut = await checkUserLoggedOut();
      if (isLoggedOut) {
        console.log('[LogoutDetection] 🚪 Periodic backup check detected logout');
        await handleLogout();
      }
    }, 30000) as unknown as number; // Check every 30 seconds

    console.log('[LogoutDetection] ✅ Started periodic logout check (backup, every 30s)');
  }
}

/**
 * Stop periodic logout check
 */
export function stopPeriodicLogoutCheck(): void {
  if (periodicCheckInterval !== null) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
    console.log('[LogoutDetection] ✅ Stopped periodic logout check');
  }
}

/**
 * Start auth probe (401/403 detection)
 * Makes API call every 15 seconds to detect authentication failures
 */
export function startAuthProbe(): void {
  if (authProbeInterval) return;

  authProbeInterval = setInterval(async () => {
    if (!hasUserSession()) return;

    try {
      const res = await fetch(
        `${IVANTI_CONFIG.baseUrl}/HEAT/api/odata/businessobject/employees?$top=1&$select=RecId`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        }
      );

      if (res.status === 401 || res.status === 403) {
        console.warn('[LogoutDetection] 🔒 Auth probe received', res.status, '- treating as logout');
        await handleLogout();
      }
    } catch (err) {
      // Ignore network errors; they can be transient
    }
  }, 15000) as unknown as number;

  console.log('[LogoutDetection] ✅ Started auth probe (15s interval)');
}

/**
 * Stop auth probe
 */
export function stopAuthProbe(): void {
  if (authProbeInterval) {
    clearInterval(authProbeInterval);
    authProbeInterval = null;
    console.log('[LogoutDetection] ✅ Stopped auth probe');
  }
}

/**
 * Initialize logout detection
 * Sets up cookie monitoring and starts periodic checks
 */
export function initializeLogoutDetection(): void {
  console.log('[LogoutDetection] 🔍 Initializing logout detection...');

  // Monitor UserSettings cookie to detect logout AND re-login
  chrome.cookies.onChanged.addListener((changeInfo) => {
    // Only monitor Ivanti domain
    if (!changeInfo.cookie.domain.includes('serviceitplus.com')) {
      return;
    }

    // Check if UserSettings cookie was removed (LOGOUT)
    if (changeInfo.cookie.name === 'UserSettings' && changeInfo.removed) {
      console.log('[LogoutDetection] 🚪 LOGOUT DETECTED: UserSettings cookie removed');
      handleLogout();
    }

    // Check if UserSettings cookie was added (RE-LOGIN after logout)
    if (changeInfo.cookie.name === 'UserSettings' && !changeInfo.removed) {
      if (!hasUserSession()) {
        console.log('[LogoutDetection] 🔓 LOGIN DETECTED: UserSettings cookie added');
        // Notify all Ivanti tabs that user logged in
        chrome.tabs.query({ url: `${IVANTI_CONFIG.baseUrl}/*` }, (tabs) => {
          console.log(`[LogoutDetection] 📤 Sending USER_LOGGED_IN to ${tabs.length} tabs`);
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'USER_LOGGED_IN',
              }).catch((error) => {
                console.log(`[LogoutDetection] Note: Could not send login to tab ${tab.id}:`, error.message);
              });
            }
          });
        });
      }
    }

    // Also check for session ID or other auth cookies being removed
    if (
      (changeInfo.cookie.name.includes('Session') ||
        changeInfo.cookie.name.includes('Auth') ||
        changeInfo.cookie.name.includes('SID')) &&
      changeInfo.removed
    ) {
      console.log('[LogoutDetection] 🚪 Session cookie removed:', changeInfo.cookie.name);
      if (hasUserSession()) {
        console.log('[LogoutDetection] 🚪 Triggering logout cleanup due to session cookie removal');
        handleLogout();
      }
    }
  });

  console.log('[LogoutDetection] ✅ Logout detection initialized');
}

