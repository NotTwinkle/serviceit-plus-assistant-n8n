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
    
    // Get API key and configured API path prefix from storage
    const configResult = await chrome.storage.local.get('ivanti_config');
    const apiKeyForScript = configResult.ivanti_config?.apiKey || null;
    const configuredApiPrefix = configResult.ivanti_config?.apiPathPrefix || null;
    
    console.log(`[UserIdentity] Configured API path prefix: ${configuredApiPrefix || 'not set (will discover)'}`);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, apiKeyParam: string | null, configuredPrefix: string | null) => {
        try {
          // Import discovery functions (they'll be available in content script context)
          // Since we're in injected script context, we'll implement discovery inline
          const API_PATH_PREFIXES = [
            '/HEAT/api',           // Most common
            '/api',                // Some instances use direct /api
            '/ServiceManager/api', // Service Manager instances
            '/ISM/api',            // Ivanti Service Manager
            '/Ivanti/api',         // Generic Ivanti
            '/HEAT/rest',          // Legacy REST endpoints
            '/rest',               // Direct REST
          ];
          
          const endpointPaths = [
            'v1/User/current',
            'v1/user/current',
            'rest/Session/User',
            'user/me',
            'core/users/current',
            'v1/session/user',
          ];
          
          // PRIORITY 1: Use configured prefix from SetupWizard (user's input)
          let apiPrefix: string | null = configuredPrefix;
          if (apiPrefix) {
            console.log(`[UserIdentity] ✅ Using configured API path prefix from SetupWizard: ${apiPrefix}`);
          }
          
          // PRIORITY 2: Try to get cached prefix from sessionStorage
          if (!apiPrefix) {
            try {
              const cached = sessionStorage.getItem('serviceit_api_path_prefix');
              if (cached) {
                const { prefix, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < 24 * 60 * 60 * 1000) { // 24 hours
                  apiPrefix = prefix;
                  console.log(`[UserIdentity] Using cached API prefix: ${apiPrefix}`);
                }
              }
            } catch (e) {
              // Cache read failed, will discover
            }
          }
          
          // PRIORITY 3: If no configured or cached prefix, discover it dynamically
          if (!apiPrefix) {
            console.log('[UserIdentity] Discovering API path prefix...');
            // Try OData endpoints first (more reliable)
            const discoveryEndpoints = [
              'odata/businessobject/employees?$top=1',
              'odata/businessobject/categorys?$top=1',
              'odata/businessobject/incidents?$top=1',
              'v1/User/current',
              'v1/user/current',
            ];
            
            for (const prefix of API_PATH_PREFIXES) {
              for (const endpointPath of discoveryEndpoints) {
                try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (apiKeyParam) {
            headers['Authorization'] = `rest_api_key=${apiKeyParam}`;
          }
          
          const testUrl = `${baseUrl}${prefix}/${endpointPath}`;
          const res = await fetch(testUrl, {
            method: 'GET',
            credentials: 'include',
            headers,
          });
                  
                  console.log(`[UserIdentity] Testing ${prefix}/${endpointPath} → ${res.status}`);
                  
                  // Accept success or auth errors (means endpoint exists)
                  if (res.status === 200 || res.status === 204 || res.status === 401 || res.status === 403) {
                    apiPrefix = prefix;
                    // Cache it
                    try {
                      sessionStorage.setItem('serviceit_api_path_prefix', JSON.stringify({
                        prefix,
                        timestamp: Date.now(),
                      }));
                      // Also cache in chrome.storage.local for background script
                      if (typeof chrome !== 'undefined' && chrome.storage) {
                        chrome.storage.local.set({
                          'serviceit_api_path_prefix': {
                            prefix,
                            timestamp: Date.now(),
                          }
                        });
                      }
                    } catch (e) {}
                    console.log(`[UserIdentity] ✅ Discovered API prefix: ${apiPrefix} (via ${endpointPath})`);
                    break;
                  }
                  
                  // If 404, this prefix doesn't work, try next prefix
                  if (res.status === 404) {
                    break; // Try next prefix
                  }
                } catch (e) {
                  // Network error, try next endpoint
                  continue;
                }
              }
              if (apiPrefix) break;
            }
          }
          
          // Fallback to default if discovery failed
          if (!apiPrefix) {
            apiPrefix = '/HEAT/api';
            console.log('[UserIdentity] Using fallback API prefix: /HEAT/api');
          }
          
          const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          };

          // Build endpoints with discovered prefix
          const endpoints = endpointPaths.map(ep => `${apiPrefix}/${ep}`);

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
      args: [IVANTI_CONFIG.baseUrl, apiKeyForScript, configuredApiPrefix],
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
 * Strategy 1.5: Get user from window.Session (MOST RELIABLE - direct from Ivanti)
 * This is the primary source as it reflects the actual current session
 */
async function getCurrentUserFromSession(tabId: number): Promise<IvantiUser | null> {
  try {
    console.log('[UserIdentity] 🎯 Attempting to get user from window.Session...');
    console.log('[UserIdentity] Tab ID:', tabId);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          console.log('[UserIdentity] 🔍 Checking for window.Session...');
          console.log('[UserIdentity] window.Session exists?', typeof window.Session !== 'undefined');
          console.log('[UserIdentity] window.Session value:', window.Session);
          
          // Check window.Session first (most reliable)
          if (window.Session) {
            const s = window.Session;
            console.log('[UserIdentity] ✅ Found window.Session:', s);
            console.log('[UserIdentity] Session keys:', Object.keys(s));
            console.log('[UserIdentity] Full Session object:', JSON.stringify(s, null, 2));
            
            const loginId = s.LoginId || s.loginId || s.UserName || s.username || s.Email || s.email;
            const recId = s.RecId || s.recId || s.UserId || s.userId || s.EmployeeRecId;
            const displayName = s.DisplayName || s.displayName || s.FullName || s.fullName || s.UserName;
            const email = s.Email || s.email || s.PrimaryEmail || s.primaryEmail;
            const role = s.CurrentRole || s.currentRole || s.ActiveRole || s.activeRole || s.Role || s.role;
            
            console.log('[UserIdentity] 🔍 Extracted values:', {
              loginId,
              recId,
              displayName,
              email,
              role,
              's.LoginId': s.LoginId,
              's.loginId': s.loginId,
              's.UserName': s.UserName,
              's.username': s.username,
              's.Email': s.Email,
              's.email': s.email,
            });
            
            if (loginId || recId) {
              console.log('[UserIdentity] ✅ Extracted from window.Session:', { loginId, recId, displayName, email, role });
              return {
                success: true,
                loginId,
                recId,
                displayName,
                email,
                role,
                source: 'window.Session'
              };
            } else {
              console.log('[UserIdentity] ⚠️ window.Session exists but no loginId or recId found');
              console.log('[UserIdentity] Available properties:', Object.keys(s));
            }
          } else {
            console.log('[UserIdentity] ❌ window.Session does not exist');
          }
          
          // Check HEAT.Session.CurrentUser (older Ivanti versions)
          if (window.HEAT && window.HEAT.Session && window.HEAT.Session.CurrentUser) {
            const u = window.HEAT.Session.CurrentUser;
            console.log('[UserIdentity] ✅ Found HEAT.Session.CurrentUser:', u);
            
            const loginId = u.LoginId || u.loginId || u.UserName || u.username;
            const recId = u.RecId || u.recId || u.EmployeeId || u.employeeId || u.UserId || u.userId;
            const displayName = u.DisplayName || u.displayName || u.FullName || u.fullName;
            const email = u.Email || u.email || u.PrimaryEmail || u.primaryEmail;
            
            if (loginId || recId) {
              console.log('[UserIdentity] ✅ Extracted from HEAT.Session.CurrentUser:', { loginId, recId, displayName, email });
              return {
                success: true,
                loginId,
                recId,
                displayName,
                email,
                source: 'HEAT.Session.CurrentUser'
              };
            }
          }
          
          return { success: false, error: 'window.Session not found or incomplete' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
      args: [],
    });

    if (result && result[0]?.result?.success) {
      const data = result[0].result;
      console.log('[UserIdentity] ✅ Session data extracted:', data);
      
      // If we have loginId or recId, try to get full user record via OData
      if (data.loginId || data.recId) {
        let fullUser: IvantiUser | null = null;
        
        // Try to find full user record
        if (data.loginId) {
          console.log('[UserIdentity] 🔍 Searching for full user by loginId:', data.loginId);
          fullUser = await findUserByLoginId(data.loginId, tabId);
        }
        
        // If we have recId but no full user, try to query by recId
        if (!fullUser && data.recId) {
          console.log('[UserIdentity] 🔍 Searching for full user by recId:', data.recId);
          fullUser = await findUserByRecId(data.recId, tabId);
        }
        
        if (fullUser) {
          // Merge session data with OData data
          return {
            ...fullUser,
            roles: data.role ? [data.role, ...(fullUser.roles || [])] : fullUser.roles,
          };
        }
        
        // Return session data even if OData lookup fails
        console.log('[UserIdentity] ✅ Using session data (OData lookup failed or not needed)');
        return {
          recId: data.recId || '',
          loginId: data.loginId || '',
          fullName: data.displayName || '',
          email: data.email || data.loginId || '',
          roles: data.role ? [data.role] : [],
        };
      }
    }
    
    console.log('[UserIdentity] ❌ Session strategy failed');
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error getting user from session:', error);
    return null;
  }
}

/**
 * Strategy 2: Parse UserSettings Cookie (FALLBACK - may contain stale data)
 * Ivanti stores user data in the UserSettings cookie in Base64 format
 * Format: User=<base64>&Role=<base64>&ReSA=<base64>&SID=<value>...
 * 
 * IMPORTANT: This cookie may contain stale data from previous sessions.
 * Always validate against window.Session or API before using.
 */
async function getCurrentUserFromCookie(tabId: number): Promise<IvantiUser | null> {
  try {
    console.log('[UserIdentity] 🍪 Attempting to parse UserSettings cookie...');
    
    // BEST PRACTICE: Use chrome.cookies API from background script (more reliable than document.cookie)
    // This can access HttpOnly cookies and is more reliable
    let loginId: string | null = null;
    let roleFromCookie: string | null = null;
    
    try {
      // Get the tab URL to determine the domain
      const tab = await chrome.tabs.get(tabId);
      const tabUrl = tab.url;
      if (!tabUrl) {
        console.log('[UserIdentity] ⚠️ Could not get tab URL');
        return null;
      }
      
      const urlObj = new URL(tabUrl);
      const domain = urlObj.hostname;
      
      console.log(`[UserIdentity] Looking for UserSettings cookie on domain: ${domain}`);
      
      // Try multiple domain formats (cookies can be stored with different domain formats)
      const domains = [
        domain,
        `.${domain}`,
        domain.split('.').slice(-2).join('.'), // e.g., trysaasiteu.com
        `.${domain.split('.').slice(-2).join('.')}`,
      ];
      
      let userSettingsCookie = null;
      for (const cookieDomain of domains) {
        try {
          const cookies = await chrome.cookies.getAll({ domain: cookieDomain });
          userSettingsCookie = cookies.find(c => 
            c.name === 'UserSettings' || 
            c.name === 'userSettings' || 
            c.name === 'USER_SETTINGS'
          );
          if (userSettingsCookie) {
            console.log(`[UserIdentity] 🎯 Found UserSettings cookie on domain: ${cookieDomain}`);
            break;
          }
        } catch (e) {
          // Domain not accessible, try next
          continue;
        }
      }
      
      // If chrome.cookies API didn't find it, try document.cookie as fallback
      if (!userSettingsCookie) {
        console.log('[UserIdentity] UserSettings cookie not found via chrome.cookies API, trying document.cookie...');
        
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            try {
              const cookies = document.cookie.split(';');
              for (const cookie of cookies) {
                const trimmed = cookie.trim();
                if (trimmed.startsWith('UserSettings=')) {
                  return trimmed.substring('UserSettings='.length);
                }
              }
              return null;
            } catch (e) {
              return null;
            }
          },
        });
        
        if (result && result[0]?.result) {
          userSettingsCookie = { value: result[0].result } as chrome.cookies.Cookie;
        }
      }
      
      if (userSettingsCookie && userSettingsCookie.value) {
        const userSettingsValue = userSettingsCookie.value;
        console.log('[UserIdentity] 🎯 Found UserSettings cookie value:', userSettingsValue.substring(0, 100) + '...');
        
        // Parse the cookie value
        // Format: User=<base64>&Role=<base64>&ReSA=<base64>&SID=<value>...
        const params = new URLSearchParams(userSettingsValue);
        
        // Decode User parameter (Base64 encoded) - THIS IS THE LOGINID
        const userEncoded = params.get('User');
        if (userEncoded) {
          try {
            // BEST PRACTICE: Decode base64 and trim any whitespace
            loginId = atob(userEncoded).trim();
            console.log('[UserIdentity] ✅ Decoded User parameter (loginId) from UserSettings cookie:', loginId);
            console.log('[UserIdentity] 🔍 Raw base64 User parameter:', userEncoded);
          } catch (e) {
            console.error('[UserIdentity] ❌ Failed to decode User parameter (base64):', e);
            console.error('[UserIdentity] Raw User parameter:', userEncoded);
          }
        } else {
          console.log('[UserIdentity] ⚠️ UserSettings cookie found but "User" parameter is missing');
          console.log('[UserIdentity] Available parameters:', Array.from(params.keys()));
        }
        
        // Decode Role parameter (Base64 encoded)
        const roleEncoded = params.get('Role');
        if (roleEncoded) {
          try {
            roleFromCookie = atob(roleEncoded).trim();
            console.log('[UserIdentity] ✅ Decoded Role parameter from UserSettings cookie:', roleFromCookie);
          } catch (e) {
            console.error('[UserIdentity] Failed to decode Role parameter:', e);
          }
        }
      } else {
        console.log('[UserIdentity] ⚠️ UserSettings cookie not found via chrome.cookies API or document.cookie');
      }
    } catch (e) {
      console.error('[UserIdentity] Error accessing cookies:', e);
    }
    
    // If we got loginId from cookie, use it to search for user
    // Otherwise, try fallback methods (sessionStorage, window.Session, etc.)
    if (!loginId) {
      console.log('[UserIdentity] No loginId from UserSettings cookie, trying fallback methods...');
      
      // Fallback: Try document.cookie and other methods
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            let fallbackLoginId = null;
            
            // Get all cookies via document.cookie
            const cookies = document.cookie.split(';');
            const cookieNames = cookies.map(c => c.trim().split('=')[0]);
            console.log('[UserIdentity] Available cookies via document.cookie:', cookieNames);
            
            // STRATEGY 1: Check sessionStorage and localStorage for loginId
            const sessionStorageKeys = ['loginId', 'loginID', 'LoginID', 'userId', 'userID', 'username', 'userName', 'email', 'userEmail'];
            for (const key of sessionStorageKeys) {
              const value = sessionStorage.getItem(key);
              if (value && (value.includes('@') || value.match(/^[a-zA-Z0-9._-]+$/))) {
                fallbackLoginId = value;
                console.log(`[UserIdentity] ✅ Found loginId in sessionStorage.${key}:`, fallbackLoginId);
                break;
              }
            }
            
            // Check localStorage if sessionStorage didn't have it
            if (!fallbackLoginId) {
              for (const key of sessionStorageKeys) {
                const value = localStorage.getItem(key);
                if (value && (value.includes('@') || value.match(/^[a-zA-Z0-9._-]+$/))) {
                  fallbackLoginId = value;
                  console.log(`[UserIdentity] ✅ Found loginId in localStorage.${key}:`, fallbackLoginId);
                  break;
                }
              }
            }
            
            // STRATEGY 2: Check window.Session and window.HEAT
            if (!fallbackLoginId && window.Session) {
              const sessionLoginId = window.Session.LoginId || window.Session.loginId || 
                                    window.Session.UserName || window.Session.username ||
                                    window.Session.Email || window.Session.email;
              if (sessionLoginId) {
                fallbackLoginId = sessionLoginId;
                console.log('[UserIdentity] ✅ Found loginId in window.Session:', fallbackLoginId);
              }
            }
            
            if (!fallbackLoginId && window.HEAT && window.HEAT.Session && window.HEAT.Session.CurrentUser) {
              const heatLoginId = window.HEAT.Session.CurrentUser.LoginId || 
                                 window.HEAT.Session.CurrentUser.loginId ||
                                 window.HEAT.Session.CurrentUser.UserName ||
                                 window.HEAT.Session.CurrentUser.username ||
                                 window.HEAT.Session.CurrentUser.Email ||
                                 window.HEAT.Session.CurrentUser.email;
              if (heatLoginId) {
                fallbackLoginId = heatLoginId;
                console.log('[UserIdentity] ✅ Found loginId in window.HEAT.Session.CurrentUser:', fallbackLoginId);
              }
            }
            
            return { success: !!fallbackLoginId, loginId: fallbackLoginId };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        },
        args: [],
      });
      
      if (result && result[0]?.result?.success && result[0].result.loginId) {
        loginId = result[0].result.loginId;
        console.log('[UserIdentity] ✅ Got loginId from fallback methods:', loginId);
      }
    }
    
    // CRITICAL: If we have loginId (from UserSettings cookie or fallback), use it to find the full user record
    if (loginId) {
      console.log('[UserIdentity] 🔍 Searching for user by loginId:', loginId);
      console.log('[UserIdentity] Using Ivanti REST API getuserbyloginid endpoint...');
      
      // Use findUserByLoginId to get the full user record with recId
      const userFromSearch = await findUserByLoginId(loginId, tabId);
      
      if (userFromSearch && userFromSearch.recId) {
        console.log('[UserIdentity] ✅ Found full user record via loginId:', userFromSearch.fullName);
        // Merge role from cookie if available
        if (roleFromCookie) {
          userFromSearch.roles = [...(userFromSearch.roles || []), roleFromCookie];
        }
        return userFromSearch;
      } else {
        console.log('[UserIdentity] ⚠️ Could not find full user record via loginId, but we have loginId');
        // Return minimal user info with loginId
        return {
          recId: '', // Will be populated later if found
          loginId: loginId,
          fullName: loginId, // Use loginId as display name temporarily
          email: loginId.includes('@') ? loginId : '',
          roles: roleFromCookie ? [roleFromCookie] : [],
        } as IvantiUser;
      }
    }
    
    console.log('[UserIdentity] ❌ No loginId found from UserSettings cookie or fallback methods');
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error parsing cookie:', error);
    return null;
  }
}

/**
 * Search for user by RecId using OData
 */
async function findUserByRecId(recId: string, tabId: number): Promise<IvantiUser | null> {
  try {
    console.log(`[UserIdentity] Searching for user by recId: "${recId}"`);
    
    // Get API key and configured API path prefix from storage
    const configResult = await chrome.storage.local.get('ivanti_config');
    const apiKeyForScript = configResult.ivanti_config?.apiKey || null;
    const configuredApiPrefix = configResult.ivanti_config?.apiPathPrefix || null;
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, recId: string, apiKeyParam: string | null, configuredPrefix: string | null) => {
        try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (apiKeyParam) {
            headers['Authorization'] = `rest_api_key=${apiKeyParam}`;
          }
          
          // PRIORITY: Use configured prefix from SetupWizard (user's input)
          let apiPrefix = configuredPrefix;
          if (!apiPrefix) {
            // Fallback: Get API prefix from cache
            try {
              const cached = sessionStorage.getItem('serviceit_api_path_prefix');
              if (cached) {
                const { prefix, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < 24 * 60 * 60 * 1000) {
                  apiPrefix = prefix;
                }
              }
            } catch (e) {}
          }
          
          // Last resort fallback
          if (!apiPrefix) {
            apiPrefix = '/HEAT/api';
          }
          
          console.log(`[UserIdentity] Using API prefix: ${apiPrefix} (${configuredPrefix ? 'configured' : 'cached/fallback'})`);
          
          // Search using OData filter on employees by RecId
          const filter = encodeURIComponent(`RecId eq '${recId}'`);
          const url = `${baseUrl}${apiPrefix}/odata/businessobject/employees?$filter=${filter}&$select=RecId,LoginID,DisplayName,FirstName,LastName,PrimaryEmail,Status,Team,Department,OrganizationalUnit`;
          
          console.log(`[UserIdentity] OData RecId query: ${url}`);
          
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers,
          });

          console.log(`[UserIdentity] OData RecId response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            const users = data.value || [];
            console.log(`[UserIdentity] OData found ${users.length} users`);
            
            if (users.length > 0) {
              const user = users[0];
              return { success: true, user };
            }
          }
          
          return { success: false, error: `HTTP ${response.status}` };
        } catch (e: any) {
          console.error('[UserIdentity] OData RecId error:', e);
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl, recId, apiKeyForScript, configuredApiPrefix],
    });

    if (result && result[0]?.result?.success) {
      const userData = result[0].result.user;
      console.log('[UserIdentity] ✅ Found user by RecId:', userData);
      return normalizeUser(userData);
    }
    
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error in findUserByRecId:', error);
    return null;
  }
}

/**
 * Search for user by LoginId (email/username) using Ivanti REST API
 * Tries REST API endpoint first, then falls back to OData
 * This is the most reliable way to get full user info
 */
async function findUserByLoginId(loginId: string, tabId: number): Promise<IvantiUser | null> {
  try {
    console.log(`[UserIdentity] Searching for user by loginId: "${loginId}"`);
    
    // Get API key and configured API path prefix from storage
    const configResult = await chrome.storage.local.get('ivanti_config');
    const apiKeyForScript = configResult.ivanti_config?.apiKey || null;
    const configuredApiPrefix = configResult.ivanti_config?.apiPathPrefix || null;
    
    console.log(`[UserIdentity] Configured API path prefix: ${configuredApiPrefix || 'not set (will use cached/fallback)'}`);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, loginId: string, apiKeyParam: string | null, configuredPrefix: string | null) => {
        try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (apiKeyParam) {
            headers['Authorization'] = `rest_api_key=${apiKeyParam}`;
          }
          
          // PRIORITY: Use configured prefix from SetupWizard (user's input)
          let apiPrefix = configuredPrefix;
          if (!apiPrefix) {
            // Fallback: Get API prefix from cache
            try {
              const cached = sessionStorage.getItem('serviceit_api_path_prefix');
              if (cached) {
                const { prefix, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < 24 * 60 * 60 * 1000) {
                  apiPrefix = prefix;
                }
              }
            } catch (e) {}
          }
          
          // Last resort fallback
          if (!apiPrefix) {
            apiPrefix = '/HEAT/api';
          }
          
          console.log(`[UserIdentity] Using API prefix: ${apiPrefix} (${configuredPrefix ? 'configured from SetupWizard' : 'cached/fallback'})`);
          
          // Strategy 1: Try Ivanti REST API endpoint (MOST RELIABLE)
          // GET /api/V1/getuserbyloginid/loginid/{loginid}
          const restApiEndpoints = [
            `${apiPrefix}/V1/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            `${apiPrefix}/v1/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            `${apiPrefix}/V2/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            `${apiPrefix}/v2/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            `${apiPrefix}/V3/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            `${apiPrefix}/v3/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            // Also try without version prefix (fallback)
            `/api/V1/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
            `/api/v1/getuserbyloginid/loginid/${encodeURIComponent(loginId)}`,
          ];
          
          for (const endpoint of restApiEndpoints) {
            try {
              const url = `${baseUrl}${endpoint}`;
              console.log(`[UserIdentity] Trying REST API: ${url}`);
              
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers,
              });

              console.log(`[UserIdentity] REST API response status: ${response.status}`);

              if (response.ok) {
                const userData = await response.json();
                console.log(`[UserIdentity] ✅ REST API found user:`, userData);
                return { success: true, user: userData, source: 'REST API' };
              } else if (response.status === 404) {
                // Endpoint doesn't exist, try next
                continue;
              } else if (response.status === 401 || response.status === 403) {
                // Auth failed, but endpoint exists - might work with different auth
                console.log(`[UserIdentity] REST API auth failed (${response.status}), will try OData fallback`);
                break; // Try OData instead
              }
            } catch (e) {
              console.log(`[UserIdentity] REST API endpoint error:`, e);
              continue; // Try next endpoint
            }
          }
          
          // Strategy 2: Fallback to OData (if REST API didn't work)
          // This is the KEY method from old implementation - uses LoginID filter
          console.log(`[UserIdentity] REST API failed, trying OData fallback with LoginID filter...`);
          
          // Search using OData filter on employees by LoginID
          // CRITICAL: Field name is LoginID (capital ID) in Ivanti - this is what worked in old code
          const filter = encodeURIComponent(`LoginID eq '${loginId}'`);
          // Use the configured API prefix (from SetupWizard) - this is dynamic, not hardcoded
          const odataUrl = `${baseUrl}${apiPrefix}/odata/businessobject/employees?$filter=${filter}&$select=RecId,LoginID,DisplayName,FirstName,LastName,PrimaryEmail,Status,Team,Department,OrganizationalUnit`;
          
          console.log(`[UserIdentity] OData LoginID query (using configured prefix): ${odataUrl}`);
          
          const response = await fetch(odataUrl, {
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
              return { success: true, user: activeUser, source: 'OData' };
            }
          }
          
          return { success: false, error: `All methods failed` };
        } catch (e: any) {
          console.error('[UserIdentity] findUserByLoginId error:', e);
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl, loginId, apiKeyForScript, configuredApiPrefix],
    });

    if (result && result[0]?.result?.success) {
      const userData = result[0].result.user;
      const source = result[0].result.source || 'unknown';
      console.log(`[UserIdentity] ✅ Found user by LoginID via ${source}:`, userData);
      return normalizeUser(userData);
    }
    
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error in findUserByLoginId:', error);
    return null;
  }
}

/**
 * Strategy: Try to get current user from OData endpoints
 * Some instances expose a "current user" endpoint or we can query with session context
 * This queries the API with the current session cookies to get the logged-in user
 */
async function getCurrentUserFromOData(tabId: number): Promise<IvantiUser | null> {
  try {
    console.log('[UserIdentity] Attempting to get current user from OData (using session context)...');
    
    // Get API key and configured API path prefix from storage
    const configResult = await chrome.storage.local.get('ivanti_config');
    const apiKeyForScript = configResult.ivanti_config?.apiKey || null;
    const configuredApiPrefix = configResult.ivanti_config?.apiPathPrefix || null;
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, apiKeyParam: string | null, configuredPrefix: string | null) => {
        try {
          // Build headers with API key
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (apiKeyParam) {
            headers['Authorization'] = `rest_api_key=${apiKeyParam}`;
          }
          
          // PRIORITY: Use configured prefix from SetupWizard (user's input)
          let apiPrefix = configuredPrefix;
          if (!apiPrefix) {
            // Fallback: Get API prefix from cache
            try {
              const cached = sessionStorage.getItem('serviceit_api_path_prefix');
              if (cached) {
                const { prefix, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < 24 * 60 * 60 * 1000) {
                  apiPrefix = prefix;
                }
              }
            } catch (e) {}
          }
          
          // Last resort fallback
          if (!apiPrefix) {
            apiPrefix = '/HEAT/api';
          }
          
          console.log(`[UserIdentity] Using API prefix: ${apiPrefix} (${configuredPrefix ? 'configured from SetupWizard' : 'cached/fallback'})`);
          
          // Try to get current user via OData - some instances support this
          // The session cookies will identify which user is logged in
          // IMPORTANT: We CANNOT use $top=1 on employees - that returns ANY user, not the current user!
          // We need endpoints that return the CURRENT logged-in user based on session context
          const endpoints = [
            // Try current user endpoints first (these should return the user from session context)
            `${apiPrefix}/odata/currentuser`,
            `${apiPrefix}/odata/user/current`,
            `${apiPrefix}/odata/me`,
            // Try session-based endpoints
            `${apiPrefix}/odata/Session/User`,
            `${apiPrefix}/odata/session/user`,
            // DO NOT use employees?$top=1 - that returns ANY user, not the current one!
            // The session cookies should identify the current user, but we need proper endpoints
          ];
          
          for (const endpoint of endpoints) {
            try {
              const url = `${baseUrl}${endpoint}`;
              console.log(`[UserIdentity] Trying OData endpoint: ${url}`);
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include', // This sends session cookies
                headers,
              });
              
              console.log(`[UserIdentity] OData endpoint ${endpoint} → Status: ${response.status}`);
              
              if (response.ok) {
                const data = await response.json();
                console.log(`[UserIdentity] OData response:`, data);
                // OData returns { value: [...] } format
                const users = data.value || (Array.isArray(data) ? data : [data]);
                if (users.length > 0) {
                  const user = users[0];
                  console.log(`[UserIdentity] ✅ Found user via OData:`, user);
                  return { success: true, user, source: endpoint };
                }
              }
            } catch (e) {
              console.log(`[UserIdentity] OData endpoint ${endpoint} error:`, e);
              continue;
            }
          }
          
          return { success: false, error: 'OData endpoints failed' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl, apiKeyForScript, configuredApiPrefix],
    });
    
    if (result && result[0]?.result?.success) {
      const userData = result[0].result.user;
      const source = result[0].result.source || 'OData';
      console.log(`[UserIdentity] ✅ Found user via ${source}:`, userData);
      return normalizeUser(userData);
    }
    
    return null;
  } catch (error) {
    console.error('[UserIdentity] Error in getCurrentUserFromOData:', error);
    return null;
  }
}

/**
 * Search for user by display name (fallback)
 */
async function findUserByName(displayName: string, tabId: number): Promise<IvantiUser | null> {
  try {
    console.log(`[UserIdentity] Searching for user by name: "${displayName}"`);
    
    // Get API key and configured API path prefix from storage
    const configResult = await chrome.storage.local.get('ivanti_config');
    const apiKeyForScript = configResult.ivanti_config?.apiKey || null;
    const configuredApiPrefix = configResult.ivanti_config?.apiPathPrefix || null;
    
    console.log(`[UserIdentity] Configured API path prefix: ${configuredApiPrefix || 'not set (will use cached/fallback)'}`);
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (baseUrl: string, name: string, apiKeyParam: string | null, configuredPrefix: string | null) => {
        try {
          const headers: Record<string, string> = { 'Accept': 'application/json' };
          if (apiKeyParam) {
            headers['Authorization'] = `rest_api_key=${apiKeyParam}`;
          }
          
          // PRIORITY: Use configured prefix from SetupWizard (user's input)
          let apiPrefix = configuredPrefix;
          if (!apiPrefix) {
            // Fallback: Get API prefix from cache
            try {
              const cached = sessionStorage.getItem('serviceit_api_path_prefix');
              if (cached) {
                const { prefix, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                if (age < 24 * 60 * 60 * 1000) {
                  apiPrefix = prefix;
                }
              }
            } catch (e) {}
          }
          
          // Last resort fallback
          if (!apiPrefix) {
            apiPrefix = '/HEAT/api';
          }
          
          console.log(`[UserIdentity] Using API prefix: ${apiPrefix} (${configuredPrefix ? 'configured from SetupWizard' : 'cached/fallback'})`);
          
          // STRATEGY 0: Try REST API getuserbyloginid first (if name looks like a loginId)
          // Some names might actually be loginIds (e.g., "Lance.Nunez" or "lnunez")
          if (name.includes('.') || name.length < 20) {
            console.log(`[UserIdentity] Trying REST API getuserbyloginid with name as potential loginId...`);
            const restApiEndpoints = [
              `${apiPrefix}/V1/getuserbyloginid/loginid/${encodeURIComponent(name)}`,
              `${apiPrefix}/v1/getuserbyloginid/loginid/${encodeURIComponent(name)}`,
              `${apiPrefix}/V2/getuserbyloginid/loginid/${encodeURIComponent(name)}`,
              `${apiPrefix}/v2/getuserbyloginid/loginid/${encodeURIComponent(name)}`,
            ];
            
            for (const endpoint of restApiEndpoints) {
              try {
                const url = `${baseUrl}${endpoint}`;
                console.log(`[UserIdentity] Trying REST API: ${url}`);
                const response = await fetch(url, {
                  method: 'GET',
                  credentials: 'include',
                  headers,
                });
                
                if (response.ok) {
                  const data = await response.json();
                  console.log(`[UserIdentity] ✅ Found user via REST API getuserbyloginid:`, data);
                  return { success: true, user: data };
                }
              } catch (e) {
                // Continue to next endpoint
              }
            }
          }
          
          // STRATEGY 1: Try fetching without filter first (most reliable - works even if filter syntax is wrong)
          console.log(`[UserIdentity] Strategy 1: Fetching employees without filter, will filter client-side...`);
          try {
            const url = `${baseUrl}${apiPrefix}/odata/businessobject/employees?$top=200&$select=RecId,LoginID,DisplayName,FirstName,LastName,PrimaryEmail,Status,Team,Department,OrganizationalUnit`;
            const response = await fetch(url, {
              method: 'GET',
              credentials: 'include',
              headers,
            });
            
            if (response.ok) {
              const data = await response.json();
              const users = data.value || [];
              console.log(`[UserIdentity] Fetched ${users.length} employees, filtering client-side for "${name}"...`);
              
              // Client-side filter: try exact match first, then contains
              const nameLower = name.toLowerCase().trim();
              const nameParts = nameLower.split(/\s+/);
              const firstName = nameParts[0];
              const lastName = nameParts.slice(1).join(' ');
              
              const matchedUser = users.find((u: any) => {
                const displayName = (u.DisplayName || '').toLowerCase().trim();
                const fullName = (u.FullName || '').toLowerCase().trim();
                const uFirstName = (u.FirstName || '').toLowerCase().trim();
                const uLastName = (u.LastName || '').toLowerCase().trim();
                
                // Exact matches
                if (displayName === nameLower || fullName === nameLower) return true;
                
                // FirstName + LastName match
                if (lastName && uFirstName === firstName && uLastName === lastName) return true;
                
                // Contains matches
                if (displayName.includes(nameLower) || fullName.includes(nameLower)) return true;
                
                // Partial match on first and last name
                if (lastName && uFirstName.includes(firstName) && uLastName.includes(lastName)) return true;
                
                return false;
              });
              
              if (matchedUser) {
                console.log(`[UserIdentity] ✅ Found user via client-side filter:`, matchedUser.DisplayName || matchedUser.FullName);
                return { success: true, user: matchedUser };
              } else {
                console.log(`[UserIdentity] No match found in ${users.length} employees. Trying OData filters...`);
              }
            } else {
              console.log(`[UserIdentity] Could not fetch employees list (${response.status}), trying OData filters...`);
            }
          } catch (e) {
            console.log(`[UserIdentity] Client-side fetch failed, trying OData filters...`);
          }
          
          // STRATEGY 2: Try OData filters (if client-side didn't work)
          // Escape single quotes in the name for OData filter
          const escapedName = name.replace(/'/g, "''");
          
          // Try multiple OData filter strategies
          const filterStrategies = [
            // Strategy 1: Exact match on DisplayName or FullName
            `DisplayName eq '${escapedName}' or FullName eq '${escapedName}'`,
            // Strategy 2: Contains match (more flexible)
            `contains(DisplayName, '${escapedName}') or contains(FullName, '${escapedName}')`,
            // Strategy 3: Split name and match FirstName + LastName
            name.split(' ').length === 2 ? 
              `FirstName eq '${name.split(' ')[0]}' and LastName eq '${name.split(' ')[1]}'` : null,
            // Strategy 4: Contains on FirstName and LastName separately
            name.split(' ').length === 2 ?
              `contains(FirstName, '${name.split(' ')[0]}') and contains(LastName, '${name.split(' ')[1]}')` : null,
            // Strategy 5: Just DisplayName
            `DisplayName eq '${escapedName}'`,
            // Strategy 6: Just FullName
            `FullName eq '${escapedName}'`,
          ].filter(f => f !== null);
          
          // Try each filter strategy
          for (const filterStr of filterStrategies) {
            try {
              const filter = encodeURIComponent(filterStr);
              const url = `${baseUrl}${apiPrefix}/odata/businessobject/employees?$filter=${filter}&$select=RecId,LoginID,DisplayName,FirstName,LastName,PrimaryEmail,Status,Team,Department,OrganizationalUnit`;
              
              console.log(`[UserIdentity] Trying OData filter: ${filterStr}`);
              console.log(`[UserIdentity] OData name query URL: ${url}`);
              
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers,
              });

              console.log(`[UserIdentity] OData name response status: ${response.status}`);

              if (response.ok) {
                const data = await response.json();
                const users = data.value || [];
                console.log(`[UserIdentity] OData found ${users.length} users matching filter "${filterStr}"`);
                
                if (users.length > 0) {
                  // CRITICAL: Filter results to match the EXACT name we're looking for
                  // The OData filter might be too broad (e.g., contains() matches partial names)
                  const nameLower = name.toLowerCase().trim();
                  const nameParts = nameLower.split(/\s+/);
                  const firstName = nameParts[0];
                  const lastName = nameParts.slice(1).join(' ');
                  
                  // Try to find exact match first
                  let matchedUser = users.find((u: any) => {
                    const displayName = (u.DisplayName || '').toLowerCase().trim();
                    const fullName = (u.FullName || '').toLowerCase().trim();
                    const uFirstName = (u.FirstName || '').toLowerCase().trim();
                    const uLastName = (u.LastName || '').toLowerCase().trim();
                    
                    // Exact matches (highest priority)
                    if (displayName === nameLower || fullName === nameLower) return true;
                    
                    // FirstName + LastName exact match
                    if (lastName && uFirstName === firstName && uLastName === lastName) return true;
                    
                    return false;
                  });
                  
                  // If no exact match, try contains match
                  if (!matchedUser) {
                    matchedUser = users.find((u: any) => {
                      const displayName = (u.DisplayName || '').toLowerCase().trim();
                      const fullName = (u.FullName || '').toLowerCase().trim();
                      
                      return displayName.includes(nameLower) || fullName.includes(nameLower);
                    });
                  }
                  
                  // If still no match, prefer Active users, then just take first
                  if (!matchedUser) {
                    matchedUser = users.find((u: any) => u.Status === 'Active') || users[0];
                    console.log(`[UserIdentity] ⚠️ No exact name match found, using first result:`, matchedUser.DisplayName || matchedUser.FullName);
                  } else {
                    console.log(`[UserIdentity] ✅ Found exact name match:`, matchedUser.DisplayName || matchedUser.FullName);
                  }
                  
                  // Final validation: make sure the matched user actually matches our search name
                  const matchedDisplayName = (matchedUser.DisplayName || '').toLowerCase().trim();
                  const matchedFullName = (matchedUser.FullName || '').toLowerCase().trim();
                  
                  if (matchedDisplayName === nameLower || matchedFullName === nameLower || 
                      (lastName && (matchedUser.FirstName || '').toLowerCase().trim() === firstName && 
                                   (matchedUser.LastName || '').toLowerCase().trim() === lastName)) {
                    console.log(`[UserIdentity] ✅ Verified match: "${matchedUser.DisplayName || matchedUser.FullName}" matches "${name}"`);
                    return { success: true, user: matchedUser };
                  } else {
                    console.log(`[UserIdentity] ⚠️ Matched user "${matchedUser.DisplayName || matchedUser.FullName}" does not exactly match "${name}", continuing search...`);
                    continue; // Try next filter strategy
                  }
                }
              } else if (response.status === 204) {
                // 204 No Content - might mean no results or success with no body
                console.log(`[UserIdentity] Filter returned 204 (No Content) for: ${filterStr}`);
                continue; // Try next filter strategy
              } else if (response.status === 400) {
                // Bad request - try next strategy
                try {
                  const errorText = await response.text();
                  let errorMessage = errorText.substring(0, 200);
                  try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.message || errorJson.error || errorText.substring(0, 200);
                  } catch (e) {
                    // Not JSON, use text as-is
                  }
                  console.log(`[UserIdentity] Filter failed with 400: ${filterStr}`);
                  console.log(`[UserIdentity] Error details:`, errorMessage);
                } catch (e) {
                  console.log(`[UserIdentity] Filter failed with 400: ${filterStr} (could not read error)`);
                }
                continue; // Try next filter strategy
              } else {
                // Other error (404, 401, etc.) - might be endpoint issue, but try next strategy anyway
                console.log(`[UserIdentity] Filter returned ${response.status}, trying next strategy...`);
                continue;
              }
            } catch (e: any) {
              console.log(`[UserIdentity] Filter strategy error:`, e.message);
              continue; // Try next strategy
            }
          }
          
          // If all strategies failed
          console.log(`[UserIdentity] ❌ All search strategies failed for name: "${name}"`);
          return { success: false, error: 'Could not find user by name - all search strategies failed' };
        } catch (e: any) {
          console.error('[UserIdentity] OData name error:', e);
          return { success: false, error: e.message };
        }
      },
      args: [IVANTI_CONFIG.baseUrl, displayName, apiKeyForScript, configuredApiPrefix],
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

  // STRATEGY 1: Parse UserSettings Cookie FIRST (MOST RELIABLE - from old working implementation)
  // This was the PRIMARY method in the old code that worked
  // Ivanti stores user data in the UserSettings cookie in Base64 format
  console.log('[UserIdentity] 🍪 STRATEGY 1: Trying cookie parsing (PRIMARY METHOD from old implementation)...');
  const userFromCookie = await getCurrentUserFromCookie(tabId);
  if (userFromCookie && userFromCookie.loginId) {
    // If we have loginId but no recId, search for full user record via OData using LoginID filter
    if (!userFromCookie.recId && userFromCookie.loginId) {
      console.log('[UserIdentity] 🔍 Cookie gave us loginId, searching OData by LoginID filter...');
      const fullUser = await findUserByLoginId(userFromCookie.loginId, tabId);
      if (fullUser && fullUser.recId) {
        console.log('[UserIdentity] ✅ Found full user record via LoginID filter:', fullUser.fullName);
        // Merge cookie data with OData data
        return {
          ...fullUser,
          roles: [...(fullUser.roles || []), ...(userFromCookie.roles || [])],
        };
      }
    }
    // Accept user even without recId if we have loginId (cookie-based identification)
    console.log('[UserIdentity] ✅ SUCCESS via cookie parsing!', userFromCookie.recId ? 'Full user data' : 'Minimal user data (no recId)');
    return userFromCookie;
  }

  // STRATEGY 2: Try window.Session (if available)
  console.log('[UserIdentity] 🎯 STRATEGY 2: Trying window.Session...');
  const userFromSession = await getCurrentUserFromSession(tabId);
  if (userFromSession && (userFromSession.loginId || userFromSession.recId)) {
    console.log('[UserIdentity] ✅ SUCCESS via window.Session!', userFromSession.recId ? 'Full user data' : 'Minimal user data');
    return userFromSession;
  }

  // STRATEGY 3: Try Standard API endpoints
  console.log('[UserIdentity] STRATEGY 3: Trying API endpoints...');
  const userFromAPI = await getCurrentUserFromAPI(tabId);
  if (userFromAPI && userFromAPI.recId) {
    return userFromAPI;
  }

  // Strategy 4: Try Name Search (if provided)
  // This is CRITICAL - if we can get the user's name from DOM, search for that user
  if (fallbackDisplayName) {
    console.log('[UserIdentity] Strategy 4: Trying name search with DOM-scraped name:', fallbackDisplayName);
    const userFromName = await findUserByName(fallbackDisplayName, tabId);
    if (userFromName && userFromName.recId) {
      console.log('[UserIdentity] ✅ Found user by name:', userFromName.fullName);
      return userFromName;
    } else {
      console.log('[UserIdentity] ⚠️ Name search failed for:', fallbackDisplayName);
    }
  }

  // Strategy 5: Try to get current user from OData endpoints
  // IMPORTANT: We do NOT use employees?$top=1 - that returns ANY user, not the current one!
  // Only use endpoints that return the current logged-in user based on session context
  console.log('[UserIdentity] Strategy 5: Trying OData current user endpoints (NOT employees?$top=1)...');
  try {
    const odataUser = await getCurrentUserFromOData(tabId);
    if (odataUser && odataUser.recId) {
      console.log('[UserIdentity] ✅ Found user via OData current user endpoint');
      return odataUser;
    } else {
      console.log('[UserIdentity] ⚠️ OData current user endpoints failed - no current user endpoint available');
    }
  } catch (e) {
    console.log('[UserIdentity] OData current user query failed:', e);
  }

  // Strategy 6: Use fallback display name if provided (minimal info)
  if (fallbackDisplayName) {
    console.log('[UserIdentity] Strategy 5: Using fallback display name as last resort');
    return {
      recId: '', // Unknown
      loginId: fallbackDisplayName,
      fullName: fallbackDisplayName,
    };
  }

  console.error('[UserIdentity] ❌ Failed to identify user via all methods');
  return null;
}
