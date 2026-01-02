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
import { buildApiUrl } from '../utils/apiPathHelper';

// Track if logout is already in progress to avoid double cleanup
let logoutInProgress = false;

// Interval IDs
let periodicCheckInterval: number | null = null;
let authProbeInterval: number | null = null;

// Debounce timers for logout detection (prevents false positives)
let logoutDebounceTimer: number | null = null;
let lastCookieCheckTime = 0;
const LOGOUT_DEBOUNCE_MS = 3000; // Wait 3 seconds before confirming logout
const MIN_COOKIE_CHECK_INTERVAL = 2000; // Don't check cookies more than once every 2 seconds

/**
 * Check if user is logged out by verifying UserSettings cookie exists
 * BEST PRACTICE: Use this as a backup validation, not primary detection
 * Primary detection should be cookie.onChanged listener (event-driven)
 * 
 * INDUSTRY BEST PRACTICE: Multiple verification checks to prevent false positives
 */
export async function checkUserLoggedOut(): Promise<boolean> {
  try {
    // Rate limiting: Don't check too frequently
    const now = Date.now();
    if (now - lastCookieCheckTime < MIN_COOKIE_CHECK_INTERVAL) {
      // Too soon since last check - return cached result (assume still logged in)
      return false;
    }
    lastCookieCheckTime = now;

    // Try multiple domain formats (cookies can be stored with different domain formats)
    const domains = [
      'swhealthdemo-try.trysaasiteu.com',
      '.swhealthdemo-try.trysaasiteu.com',
      'trysaasiteu.com',
      '.trysaasiteu.com',
    ];

    let userSettingsCookieFound = false;
    for (const domain of domains) {
      try {
        const cookies = await chrome.cookies.getAll({ domain });
        const userSettingsCookie = cookies.find(c => c.name === 'UserSettings');

        if (userSettingsCookie && userSettingsCookie.value && userSettingsCookie.value.length > 10) {
          // Found valid cookie - user is logged in
          userSettingsCookieFound = true;
          break;
        }
      } catch (domainError) {
        // Some domains might not be accessible, continue to next
        continue;
      }
    }

    if (userSettingsCookieFound) {
      // Cookie exists - user is definitely logged in
      return false;
    }

    // If no cookie found, verify with multiple checks before declaring logout
    // This prevents false positives during:
    // - Cookie updates/refreshes
    // - Page navigation
    // - Temporary cookie unavailability
    
    // Check 1: Do we have an active session in memory?
    if (hasUserSession()) {
      // We have an active session - verify it's still valid with API check
      const result = await chrome.storage.local.get(['currentUser']);
      if (result.currentUser) {
        // Session exists in storage - verify with lightweight API call
        try {
          const apiUrl = await buildApiUrl(
            IVANTI_CONFIG.baseUrl,
            'odata/businessobject/employees?$top=1&$select=RecId'
          );
          
          const res = await fetch(apiUrl, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
          });

          // If API call succeeds (200/204), user is still logged in
          // Only treat as logout if we get definitive auth errors (401/403)
          if (res.status === 200 || res.status === 204) {
            console.log('[LogoutDetection] ✅ API verification: User is still logged in (cookie temporarily unavailable)');
            return false;
          }
          
          // If we get 401/403, user is definitely logged out
          if (res.status === 401 || res.status === 403) {
            console.log('[LogoutDetection] 🔒 API verification: User is logged out (401/403)');
            return true;
          }
          
          // For other status codes (404, 500, etc.), assume still logged in
          // These don't necessarily mean logout
          console.log('[LogoutDetection] ⚠️ API verification: Ambiguous status', res.status, '- assuming still logged in');
          return false;
        } catch (error) {
          // Network error - don't assume logout, might be temporary
          console.log('[LogoutDetection] ⚠️ API verification failed (network error) - assuming still logged in');
          return false;
        }
      }
    }

    // No cookie AND no active session = likely logged out
    // But we'll let the debounced handler verify this
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
      const apiUrl = await buildApiUrl(
        IVANTI_CONFIG.baseUrl,
        'odata/businessobject/employees?$top=1&$select=RecId'
      );
      
      const res = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });

      if (res.status === 401 || res.status === 403) {
        console.warn('[LogoutDetection] 🔒 Auth probe received', res.status, '- verifying logout...');
        
        // Verify with cookie check before triggering logout
        // Auth errors can happen for other reasons (API key issues, endpoint changes, etc.)
        const isLoggedOut = await checkUserLoggedOut();
        if (isLoggedOut) {
          console.warn('[LogoutDetection] 🔒 Auth probe confirmed logout');
          await handleLogout();
        } else {
          console.log('[LogoutDetection] ⚠️ Auth probe got', res.status, 'but UserSettings cookie still exists - likely API issue, not logout');
        }
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
  // INDUSTRY BEST PRACTICE: Debounce logout detection to prevent false positives
  chrome.cookies.onChanged.addListener((changeInfo) => {
    // Only monitor Ivanti domain
    if (!changeInfo.cookie.domain.includes('trysaasiteu.com') && !changeInfo.cookie.domain.includes('swhealthdemo-try')) {
      return;
    }

    // Check if UserSettings cookie was removed (LOGOUT)
    // BEST PRACTICE: Debounce and verify before triggering logout
    if (changeInfo.cookie.name === 'UserSettings' && changeInfo.removed) {
      console.log('[LogoutDetection] 🚪 UserSettings cookie removal detected - debouncing logout check...');
      
      // Clear any existing debounce timer
      if (logoutDebounceTimer) {
        clearTimeout(logoutDebounceTimer);
      }
      
      // Debounce: Wait before confirming logout (prevents false positives from temporary cookie changes)
      logoutDebounceTimer = window.setTimeout(async () => {
        // Verify logout with multiple checks before triggering
        console.log('[LogoutDetection] 🔍 Verifying logout after debounce period...');
        
        const isLoggedOut = await checkUserLoggedOut();
        if (isLoggedOut) {
          console.log('[LogoutDetection] 🚪 LOGOUT CONFIRMED: UserSettings cookie removed and verified');
          await handleLogout();
        } else {
          console.log('[LogoutDetection] ✅ False alarm: UserSettings cookie was temporarily unavailable, but user is still logged in');
        }
        
        logoutDebounceTimer = null;
      }, LOGOUT_DEBOUNCE_MS);
    }

    // Check if UserSettings cookie was added (RE-LOGIN after logout)
    if (changeInfo.cookie.name === 'UserSettings' && !changeInfo.removed) {
      // BEST PRACTICE: Only send login event if we don't have an active session
      // This prevents unnecessary re-initialization when user is already logged in
      if (!hasUserSession()) {
        console.log('[LogoutDetection] 🔓 LOGIN DETECTED: UserSettings cookie added');
        
        // BEST PRACTICE: Quick validation before notifying tabs
        // Verify the cookie actually contains valid data (not just empty cookie)
        try {
          const cookieValue = changeInfo.cookie.value;
          if (cookieValue && cookieValue.length > 10) {
            // Cookie has meaningful data - this is a real login
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
          } else {
            console.log('[LogoutDetection] ⚠️ UserSettings cookie added but appears empty - skipping login event');
          }
        } catch (error) {
          console.error('[LogoutDetection] Error validating login cookie:', error);
        }
      } else {
        console.log('[LogoutDetection] ℹ️ UserSettings cookie added but session already exists - skipping login event');
      }
    }

    // Also check for session ID or other auth cookies being removed
    // BEST PRACTICE: Only trigger logout if UserSettings is ALSO missing
    // Session cookies can be refreshed/changed without actual logout
    if (
      (changeInfo.cookie.name.includes('Session') ||
        changeInfo.cookie.name.includes('Auth') ||
        changeInfo.cookie.name.includes('SID')) &&
      changeInfo.removed &&
      hasUserSession()
    ) {
      console.log('[LogoutDetection] ⚠️ Session cookie removed:', changeInfo.cookie.name);
      
      // Don't immediately logout - verify UserSettings is also missing
      // Session cookies can be refreshed during normal operations
      window.setTimeout(async () => {
        const isLoggedOut = await checkUserLoggedOut();
        if (isLoggedOut) {
          console.log('[LogoutDetection] 🚪 Session cookie removed AND UserSettings missing - confirmed logout');
          await handleLogout();
        } else {
          console.log('[LogoutDetection] ℹ️ Session cookie removed but UserSettings still exists - likely cookie refresh, not logout');
        }
      }, LOGOUT_DEBOUNCE_MS);
    }
  });

  console.log('[LogoutDetection] ✅ Logout detection initialized');
}

