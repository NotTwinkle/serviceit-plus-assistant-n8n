/**
 * Session Manager Service
 * 
 * Handles:
 * - Session ID generation and management
 * - User session storage and retrieval
 * - Session persistence across browser restarts
 * - Session isolation between logins
 */

export interface IvantiUser {
  recId: string;
  loginId: string;
  fullName: string;
  email?: string;
  team?: string;
  department?: string;
  location?: string;
  site?: string;
  roles?: string[];
  teams?: string[];
}

// Global session state
let globalUserSession: IvantiUser | null = null;
let globalSessionId: string | null = null;

/**
 * Generate a unique session identifier for login sessions
 * Used by content scripts to isolate chat history between logins
 * Format: session_{timestamp}_{random}
 */
export function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get current global user session
 */
export function getGlobalUserSession(): IvantiUser | null {
  return globalUserSession;
}

/**
 * Get current global session ID
 */
export function getGlobalSessionId(): string | null {
  return globalSessionId;
}

/**
 * Set global user session
 * Also persists to chrome.storage.local for persistence across browser restarts
 */
export function setGlobalUserSession(user: IvantiUser, sessionId?: string): void {
  globalUserSession = user;
  
  if (sessionId) {
    globalSessionId = sessionId;
  } else if (!globalSessionId) {
    // Generate new session ID if not provided
    globalSessionId = createSessionId();
  }

  // Persist to local storage (survives browser restarts)
  chrome.storage.local.set({ 
    currentUser: user,
    lastSessionId: globalSessionId 
  }, () => {
    console.log('[SessionManager] ✅ Saved user session to persistent storage:', user.fullName);
  });

  // Also save to session storage for backward compatibility
  chrome.storage.session.set({ currentUser: user });
}

/**
 * Clear global user session
 * Removes from memory and storage
 */
export function clearGlobalUserSession(): void {
  globalUserSession = null;
  globalSessionId = null;

  // Clear from storage
  chrome.storage.local.remove(['currentUser', 'lastSessionId'], () => {
    console.log('[SessionManager] ✅ Cleared user session from persistent storage');
  });
  
  chrome.storage.session.remove('currentUser', () => {
    console.log('[SessionManager] ✅ Cleared user session from session storage');
  });
}

/**
 * Load user session from storage on startup
 * This ensures user session survives browser restarts
 */
export function loadUserSessionFromStorage(): Promise<void> {
  return new Promise((resolve) => {
    // Try local storage first (persistent)
    chrome.storage.local.get(['currentUser', 'lastSessionId'], (result) => {
      if (result.currentUser) {
        globalUserSession = result.currentUser;
        globalSessionId = result.lastSessionId || null;
        console.log('[SessionManager] ✅ Restored user session from persistent storage:', globalUserSession?.fullName);
        if (globalSessionId) {
          console.log('[SessionManager] ✅ Restored session ID:', globalSessionId);
        }
        resolve();
        return;
      }

      // Fallback to session storage (for backward compatibility)
      chrome.storage.session.get(['currentUser'], (sessionResult) => {
        if (sessionResult.currentUser) {
          globalUserSession = sessionResult.currentUser;
          // Migrate to local storage for persistence
          chrome.storage.local.set({ currentUser: globalUserSession });
          console.log('[SessionManager] ✅ Migrated user session to persistent storage:', globalUserSession?.fullName);
        }
        resolve();
      });
    });
  });
}

/**
 * Check if user session exists
 */
export function hasUserSession(): boolean {
  return globalUserSession !== null;
}

/**
 * Get user session info for n8n payload
 */
export function getUserSessionForPayload(): {
  userId: string | null;
  userLoginId: string | null;
  userFullName: string | null;
  userRoles: string[];
  userTeams: string[];
  sessionId: string | null;
} {
  if (!globalUserSession) {
    return {
      userId: null,
      userLoginId: null,
      userFullName: null,
      userRoles: [],
      userTeams: [],
      sessionId: null,
    };
  }

  return {
    userId: globalUserSession.recId,
    userLoginId: globalUserSession.loginId,
    userFullName: globalUserSession.fullName,
    userRoles: globalUserSession.roles || [],
    userTeams: globalUserSession.teams || [],
    sessionId: globalSessionId,
  };
}

