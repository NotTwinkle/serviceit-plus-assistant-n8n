/**
 * User Identity Service
 * 
 * Identifies the currently logged-in Ivanti user.
 * Uses multiple strategies with fallback mechanisms.
 * 
 * Based on original implementation with cookie parsing and OData queries.
 */

import { IVANTI_CONFIG } from '../config';
import { IvantiUser } from './sessionManager';

/**
 * Strategy 1: Get user via Standard REST API endpoints
 * Primary method - most reliable
 */
async function getCurrentUserFromAPI(tabId: number): Promise<IvantiUser | null> {
  try {
    console.log('[UserIdentity] Attempting to get current user from API...');
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string) => {
        try {
          const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          };

          // List of endpoints to try (Ivanti Neurons 2025.3)
          const endpoints = [
            '/HEAT/api/v1/User/current',        // Standard Ivanti API v1 (OFFICIAL)
            '/HEAT/api/v1/user/current',        // Lowercase variant
            '/HEAT/api/rest/Session/User',      // Legacy HEAT endpoint
            '/HEAT/api/user/me',                // Alternative endpoint
            '/HEAT/api/core/users/current',     // Core API endpoint
            '/HEAT/api/v1/session/user',        // Session endpoint
          ];

          for (const ep of endpoints) {
            try {
              const url = `${baseUrl}${ep}`;
              console.log(`[UserIdentity] Trying: ${url}`);
              
              const res = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers,
              });
              
              console.log(`[UserIdentity] ${ep} → Status: ${res.status}`);
              
              if (res.ok) {
                const data = await res.json();
                console.log(`[UserIdentity] ✅ SUCCESS! Data:`, data);
                return { success: true, user: data, source: ep };
              } else if (res.status === 401 || res.status === 403) {
                console.log(`[UserIdentity] ${ep} → Authentication failed (${res.status})`);
              }
            } catch (e) {
              console.log(`[UserIdentity] ${ep} → Error:`, e);
              continue;
            }
          }
          
          return { success: false, error: 'All endpoints failed' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl],
    });

    if (result && result[0]?.result?.success) {
      const userData = result[0].result.user;
      console.log(`[UserIdentity] ✅ Found user via ${result[0].result.source}:`, userData);
      return normalizeUser(userData);
    }

    console.log('[UserIdentity] ❌ API strategy failed');
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error calling API:', error);
    return null;
  }
}

/**
 * Strategy 2: Parse UserSettings Cookie (MOST RELIABLE for Ivanti Neurons)
 * Ivanti stores user data in the UserSettings cookie in Base64 format
 * Format: User=<base64>&Role=<base64>&ReSA=<base64>&SID=<value>...
 */
async function getCurrentUserFromCookie(tabId: number): Promise<IvantiUser | null> {
  try {
    console.log('[UserIdentity] 🍪 Attempting to parse UserSettings cookie...');
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          let loginId = null;
          let roleFromCookie = null;
          
          // Get all cookies
          const cookies = document.cookie.split(';');
          console.log('[UserIdentity] Found cookies:', cookies.length);
          
          // Find UserSettings cookie
          for (const cookie of cookies) {
            const trimmed = cookie.trim();
            if (trimmed.startsWith('UserSettings=')) {
              const value = trimmed.substring('UserSettings='.length);
              console.log('[UserIdentity] 🎯 Found UserSettings cookie');
              
              // Parse the cookie value
              // Format: User=<base64>&Role=<base64>&ReSA=<base64>&SID=<value>...
              const params = new URLSearchParams(value);
              
              // Decode User parameter (Base64 encoded)
              const userEncoded = params.get('User');
              if (userEncoded) {
                try {
                  loginId = atob(userEncoded);
                  console.log('[UserIdentity] ✅ Decoded User data:', loginId);
                } catch (e) {
                  console.error('[UserIdentity] Failed to decode User parameter:', e);
                }
              }
              
              // Decode Role parameter (Base64 encoded)
              const roleEncoded = params.get('Role');
              if (roleEncoded) {
                try {
                  roleFromCookie = atob(roleEncoded);
                  console.log('[UserIdentity] ✅ Decoded Role data:', roleFromCookie);
                } catch (e) {
                  console.error('[UserIdentity] Failed to decode Role parameter:', e);
                }
              }
              
              break;
            }
          }
          
          // Get role from sessionStorage (more reliable in Ivanti Neurons)
          let roleFromStorage = null;
          let roleFromUI = null;
          try {
            // Check for role from UI scraping (most reliable)
            roleFromUI = sessionStorage.getItem('currentActiveRoleFromUI');
            // Check for currentActiveRole (set by inject.js from window.Session.CurrentRole)
            roleFromStorage = sessionStorage.getItem('currentActiveRole') || 
                             sessionStorage.getItem('currentTabRole') ||
                             sessionStorage.getItem('userRole');
          } catch (e) {
            console.log('[UserIdentity] Could not access sessionStorage');
          }
          
          // Priority: UI scrape > Cookie > SessionStorage
          const finalRole = roleFromUI || roleFromCookie || roleFromStorage;
          
          if (loginId) {
            return {
              success: true,
              loginId: loginId,
              role: finalRole,
              source: roleFromUI ? 'UI scrape' : (roleFromCookie ? 'cookie' : 'sessionStorage'),
            };
          }
          
          return { success: false, error: 'Could not extract user data' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
      args: [],
    });

    if (result && result[0]?.result?.success) {
      const data = result[0].result;
      console.log('[UserIdentity] ✅ Cookie data extracted:', data);
      
      // If we have loginId, use it to search for the full user record via OData
      if (data.loginId) {
        console.log('[UserIdentity] 🔍 Searching for user by loginId:', data.loginId);
        const userFromSearch = await findUserByLoginId(data.loginId, tabId);
        
        if (userFromSearch) {
          // Add role from cookie if available
          if (data.role) {
            userFromSearch.roles = [data.role, ...(userFromSearch.roles || [])];
          }
          return userFromSearch;
        }
        
        // If OData search fails, extract name from email and return basic user info
        let displayName = data.loginId;
        if (data.loginId.includes('@')) {
          // Extract the part before @
          const username = data.loginId.split('@')[0];
          // Convert "michael.monteza" → "Michael Monteza"
          displayName = username
            .split('.')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
        }
        
        console.log('[UserIdentity] ✅ Using cookie data with formatted name:', displayName);
        
        return {
          recId: '', // Will be populated later if found
          loginId: data.loginId,
          fullName: displayName,
          email: data.loginId,
          roles: data.role ? [data.role] : [],
        };
      }
    }
    
    console.log('[UserIdentity] ❌ Cookie parsing failed');
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error parsing cookie:', error);
    return null;
  }
}

/**
 * Search for user by LoginId (email/username) using OData
 * This is the most reliable way to get full user info
 */
async function findUserByLoginId(loginId: string, tabId: number): Promise<IvantiUser | null> {
  try {
    console.log(`[UserIdentity] Searching for user by loginId: "${loginId}"`);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, loginId: string) => {
        try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          
          // Search using OData filter on employees by LoginID
          // Note: Field name is LoginID (capital ID) in Ivanti
          const filter = encodeURIComponent(`LoginID eq '${loginId}'`);
          const url = `${baseUrl}/HEAT/api/odata/businessobject/employees?$filter=${filter}&$select=RecId,LoginID,DisplayName,FirstName,LastName,PrimaryEmail,Status,Team,Department,OrganizationalUnit`;
          
          console.log(`[UserIdentity] OData LoginID query: ${url}`);
          
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers,
          });

          console.log(`[UserIdentity] OData LoginID response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            const users = data.value || [];
            console.log(`[UserIdentity] OData found ${users.length} users`);
            
            if (users.length > 0) {
              // Filter for Active users first
              const activeUser = users.find((u: any) => u.Status === 'Active') || users[0];
              return { success: true, user: activeUser };
            }
          }
          
          return { success: false, error: `HTTP ${response.status}` };
        } catch (e: any) {
          console.error('[UserIdentity] OData LoginID error:', e);
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl, loginId],
    });

    if (result && result[0]?.result?.success) {
      const userData = result[0].result.user;
      console.log('[UserIdentity] ✅ Found user by LoginID:', userData);
      return normalizeUser(userData);
    }
    
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error in findUserByLoginId:', error);
    return null;
  }
}

/**
 * Search for user by display name (fallback)
 */
async function findUserByName(displayName: string, tabId: number): Promise<IvantiUser | null> {
  try {
    console.log(`[UserIdentity] Searching for user by name: "${displayName}"`);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, name: string) => {
        try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          
          // Search using OData filter on Employee
          const filter = encodeURIComponent(`DisplayName eq '${name}' or FullName eq '${name}'`);
          const url = `${baseUrl}/HEAT/api/odata/businessobject/employees?$filter=${filter}&$select=RecId,LoginID,DisplayName,FirstName,LastName,PrimaryEmail,Status,Team,Department,OrganizationalUnit`;
          
          console.log(`[UserIdentity] OData name query: ${url}`);
          
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers,
          });

          console.log(`[UserIdentity] OData name response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            const users = data.value || [];
            console.log(`[UserIdentity] OData found ${users.length} users`);
            
            if (users.length > 0) {
              // Filter for Active users first
              const activeUser = users.find((u: any) => u.Status === 'Active') || users[0];
              return { success: true, user: activeUser };
            }
          }
          
          return { success: false, error: `HTTP ${response.status}` };
        } catch (e: any) {
          console.error('[UserIdentity] OData name error:', e);
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl, displayName],
    });

    if (result && result[0]?.result?.success) {
      const userData = result[0].result.user;
      console.log('[UserIdentity] ✅ Found user by name:', userData);
      return normalizeUser(userData);
    }
    
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error in findUserByName:', error);
    return null;
  }
}

/**
 * Normalize user data from API response to IvantiUser format
 * Handles different response formats from different endpoints
 */
function normalizeUser(raw: any): IvantiUser {
  // Extract roles - handle both array and object formats
  let roles: string[] = [];
  
  if (Array.isArray(raw.Roles)) {
    roles = raw.Roles.map((r: any) =>
      typeof r === 'string' ? r : (r.DisplayName || r.Name || r.Role || '')
    ).filter(Boolean);
  } else if (raw.Roles) {
    roles = [raw.Roles.DisplayName || raw.Roles.Name || raw.Roles.Role || ''].filter(Boolean);
  } else if (raw.roles) {
    roles = Array.isArray(raw.roles) ? raw.roles : [raw.roles];
  } else if (raw.Role) {
    roles = [raw.Role];
  }
  
  // Remove duplicates
  roles = [...new Set(roles.map(r => r.trim()).filter(Boolean))];
  
  const user: IvantiUser = {
    recId: raw.RecId || raw.recId || raw.id || raw.UserId || '',
    loginId: raw.LoginID || raw.LoginId || raw.loginId || raw.username || raw.UserName || raw.email || '',
    fullName: raw.DisplayName || raw.FullName || raw.fullName || raw.displayName || raw.name || '',
    email: raw.PrimaryEmail || raw.Email || raw.email || raw.mail || '',
    team: raw.Team || raw.team || '',
    department: raw.Department || raw.department || '',
    roles: roles,
    teams: raw.Teams || raw.teams || [],
  };
  
  // Validate required fields
  if (!user.recId || !user.loginId) {
    console.warn('[UserIdentity] ⚠️ User data missing required fields:', user);
  }
  
  return user;
}

/**
 * Main function: Get the current Ivanti user
 * Tries multiple strategies in order of reliability
 * 
 * @param tabId - Tab ID for context (needed for chrome.scripting.executeScript)
 * @param fallbackDisplayName - Optional display name from DOM as hint
 * @returns User object or null if not found
 */
export async function getCurrentUser(
  tabId: number,
  fallbackDisplayName?: string
): Promise<IvantiUser | null> {
  console.log('[UserIdentity] Starting user identification...');
  console.log('[UserIdentity] Tab ID:', tabId);
  if (fallbackDisplayName) {
    console.log('[UserIdentity] Fallback display name:', fallbackDisplayName);
  }

  // Strategy 1: Parse UserSettings Cookie (MOST RELIABLE for Ivanti Neurons 2025.3)
  // This works because Ivanti stores user info in cookies, and we can parse it
  console.log('[UserIdentity] 🍪 Strategy 1: Trying cookie parsing...');
  const userFromCookie = await getCurrentUserFromCookie(tabId);
  if (userFromCookie && userFromCookie.recId) {
    console.log('[UserIdentity] ✅ SUCCESS via cookie parsing!');
    return userFromCookie;
  }

  // Strategy 2: Try Standard API endpoints
  console.log('[UserIdentity] Strategy 2: Trying API endpoints...');
  const userFromAPI = await getCurrentUserFromAPI(tabId);
  if (userFromAPI && userFromAPI.recId) {
    return userFromAPI;
  }

  // Strategy 3: Try Name Search (if provided)
  if (fallbackDisplayName) {
    console.log('[UserIdentity] Strategy 3: Trying name search...');
    const userFromName = await findUserByName(fallbackDisplayName, tabId);
    if (userFromName && userFromName.recId) {
      return userFromName;
    }
  }

  // Strategy 4: Use fallback display name if provided (minimal info)
  if (fallbackDisplayName) {
    console.log('[UserIdentity] Strategy 4: Using fallback display name as last resort');
    return {
      recId: '', // Unknown
      loginId: fallbackDisplayName,
      fullName: fallbackDisplayName,
    };
  }

  console.error('[UserIdentity] ❌ Failed to identify user via all methods');
  return null;
}
