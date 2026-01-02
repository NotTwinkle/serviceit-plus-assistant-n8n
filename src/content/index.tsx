import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatWidget from '../components/ChatWidget';
import LoadingScreen from '../components/LoadingScreen';
import ErrorDialog from '../components/ErrorDialog';
import SetupWizard from '../components/SetupWizard';
import { scrapeUserNameFromDOM, detectLoginInterface } from './utils/domScraping';
import { getEndpointsWithPrefix } from './utils/apiPathDiscovery';
import { hasConfig, getStoredConfig, saveConfig } from './configStorage';
import '../styles.css';

export interface UserInfo {
  recId?: string;
  loginId: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  team?: string;
  department?: string;
  role?: string;
  roles?: string[];
  teams?: string[];
}

/**
 * Get user info from Background Script (which calls Ivanti API)
 * Falls back to DOM scraping if API fails
 */
const getUserInfo = async (): Promise<UserInfo | null> => {
  console.log("ServiceIT: Requesting user identification from background script...");

  // Strategy 1: Try to get user from injected script (window.HEAT)
  const userFromInjection = await waitForInjectedUser();
  
  if (userFromInjection && userFromInjection.recId) {
    console.log("✅ ServiceIT: Got complete user data from window.HEAT:", userFromInjection);
    return userFromInjection;
  }

  // Strategy 2: Try to get display name from DOM as a fallback hint (using extracted utility)
  const fallbackDisplayName = await scrapeUserNameFromDOM();
  
  try {
    // Ask background script to identify user (it will try API first)
    // Force refresh on every page load to avoid stale cached data
    const response = await chrome.runtime.sendMessage({
      type: 'IDENTIFY_USER',
      fallbackDisplayName: fallbackDisplayName,
      forceRefresh: true // Don't use cached user data
    });

    if (response && response.success && response.user) {
      console.log("✅ ServiceIT: User identified:", response.user);
      return response.user;
    } else {
      const errorMessage = response?.error || 'Unknown error';
      console.warn("ServiceIT: Background script could not identify user:", errorMessage);
      
      // Store error for potential error dialog display
      (window as any).__serviceit_last_error = {
        type: 'user_identification',
        message: errorMessage,
        fallbackDisplayName,
      };
      
      // Last resort: use DOM-scraped name
      if (fallbackDisplayName) {
        console.log("ServiceIT: Using fallback display name:", fallbackDisplayName);
        return {
          loginId: fallbackDisplayName,
          fullName: fallbackDisplayName
        };
      }
      
      return null;
    }

  } catch (error) {
    console.error("ServiceIT: Error communicating with background script:", error);
    
    // Last resort: use DOM-scraped name
    if (fallbackDisplayName) {
      return {
        loginId: fallbackDisplayName,
        fullName: fallbackDisplayName
      };
    }
    
    return null;
  }
};

/**
 * Wait for the injected script to find user data from window.HEAT
 */
const waitForInjectedUser = (): Promise<UserInfo | null> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("⏱️ ServiceIT: Timeout waiting for injected script (this is normal if window.HEAT doesn't exist)");
      resolve(null);
    }, 10000); // Wait up to 10 seconds (increased from 5)

    const messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data.type === 'SERVICEIT_USER_DETECTED') {
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
        console.log("✅ ServiceIT: Received user from injected script:", event.data.user);
        resolve(event.data.user);
      }
    };

    window.addEventListener('message', messageHandler);
  });
};

/**
 * NOTE: isValidName and scanTopRightCorner are now in ./utils/domScraping.ts
 * These functions have been extracted to utilities and are no longer needed here.
 */

/**
 * Run brute-force scanner to find ALL possible user data locations
 */
const runBruteForceScan = () => {
  // Brute force scanner runs silently now (user identification is working)
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('brute-force-scanner.js');
  script.onload = () => {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  
  // No longer listening for scan results - scanner runs silently
};

/**
 * Global flag to track if user has logged out
 * This prevents re-showing UI until a new login is detected
 */
let hasLoggedOut = false;

/**
 * Global React root reference
 * INDUSTRY BEST PRACTICE: Store root globally to properly unmount on logout
 */
let globalReactRoot: ReactDOM.Root | null = null;

/**
 * Global session ID to track unique login sessions
 * ENTERPRISE BEST PRACTICE: Use timestamp-based session isolation
 */
let currentSessionId: string | null = null;

/**
 * Listen for logout events from background script
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'USER_LOGGED_OUT') {
    console.log('🚪 ========================================');
    console.log('🚪 ServiceIT: USER_LOGGED_OUT received in content script');
    console.log('🚪 ========================================');
    
    // Mark that user has logged out
    hasLoggedOut = true;
    
    // CRITICAL: Unmount React root BEFORE removing DOM element
    // This ensures complete cleanup of React's internal state and memory
    if (globalReactRoot) {
      try {
        console.log('🧹 ServiceIT: Unmounting React root...');
        globalReactRoot.unmount();
        globalReactRoot = null;
        console.log('✅ ServiceIT: React root unmounted successfully');
      } catch (error) {
        console.error('❌ ServiceIT: Error unmounting React root:', error);
      }
    }
    
    // Remove the DOM container
    const container = document.getElementById('serviceit-assistant-root');
    if (container) {
      container.remove();
      console.log('✅ ServiceIT: Chat widget DOM removed');
    }
    
    // Invalidate current session
    currentSessionId = null;
    console.log('✅ ServiceIT: Session invalidated');
    
    // ENTERPRISE BEST PRACTICE: Complete storage verification
    chrome.storage.local.get(null, (allData) => {
      const keysToRemove = Object.keys(allData).filter(key => 
        key.startsWith('conversationHistory_') || 
        key === 'currentUser' ||
        key === 'lastSessionId'
      );
      
      if (keysToRemove.length > 0) {
        console.log(`🧹 ServiceIT: Found ${keysToRemove.length} items to clear:`, keysToRemove);
        chrome.storage.local.remove(keysToRemove, () => {
          console.log(`✅ ServiceIT: Storage cleared`);
          
          // Verify complete cleanup
          chrome.storage.local.get(null, (verifyData) => {
            const remaining = Object.keys(verifyData).filter(key => 
              key.startsWith('conversationHistory_') || 
              key === 'currentUser' ||
              key === 'lastSessionId'
            );
            
            if (remaining.length > 0) {
              console.error('❌ ServiceIT: ERROR - Storage not fully cleared:', remaining);
            } else {
              console.log('✅ ServiceIT: VERIFIED - Storage completely cleared');
            }
          });
        });
      } else {
        console.log('✅ ServiceIT: No stored items to clear');
      }
    });
    
    console.log('🚪 ========================================');
    console.log('🚪 ServiceIT: Logout complete. Monitoring for re-login...');
    console.log('🚪 ========================================');
  }
  
  // Listen for RE-LOGIN events from background script
  // This is sent when UserSettings cookie is detected after it was previously removed
  if (message.type === 'USER_LOGGED_IN') {
    console.log('🚪 ========================================');
    console.log('🚪 ServiceIT: USER_LOGGED_IN received - checking if re-initialization needed...');
    console.log('🚪 ========================================');
    
    // Reset the logout flag
    hasLoggedOut = false;
    
    // BEST PRACTICE: Quick check if user is already identified before showing loading
    // This prevents loading screen on re-login if session is already valid
    (async () => {
      try {
        const cachedData = await chrome.storage.local.get(['currentUser', 'lastSessionId']);
        
        // Quick auth check to see if we can use cached user
        const apiPrefix = JSON.parse(sessionStorage.getItem('serviceit_api_path_prefix') || '{"prefix":"/api"}').prefix || '/api';
        const quickCheck = await fetch(`${window.location.origin}${apiPrefix}/odata/businessobject/employees?$top=1&$select=RecId`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        }).catch(() => null);
        
        if (quickCheck && (quickCheck.status === 200 || quickCheck.status === 204)) {
          if (cachedData.currentUser) {
            console.log('✅ ServiceIT: Session already valid - using cached user (no loading screen)');
            // User is already logged in and we have cached data - no need to re-init
            return; // Exit early - don't show loading screen
          }
        }
      } catch (error) {
        console.log('⚠️ ServiceIT: Quick check failed, will re-initialize:', error);
      }
      
      // Generate new session ID for complete isolation
      // ENTERPRISE BEST PRACTICE: Each login session gets unique ID
      currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      console.log(`✅ ServiceIT: New session created: ${currentSessionId}`);
      
      // Store session ID to verify against cached data
      chrome.storage.local.set({ lastSessionId: currentSessionId }, () => {
        console.log('✅ ServiceIT: Session ID stored');
      });
      
      // Re-run init() - but it will check for cached user first
      setTimeout(() => {
        console.log('🔄 ServiceIT: Initializing session...');
        init();
      }, 500); // Shorter delay since we're checking cache first
    })();
  }
});

// Main Init
const init = async () => {
  // ONLY run in the MAIN FRAME (not iframes) to prevent duplication
  if (window !== window.top) {
    console.log("ServiceIT: Skipping iframe, only running in main frame");
    return;
  }

  // Prevent duplicate initialization - check if widget already exists
  // EXCEPTION: Allow re-initialization after logout
  const existingWidget = document.getElementById('serviceit-assistant-root');
  if (existingWidget && !hasLoggedOut) {
    console.log("ServiceIT: Widget already initialized, skipping");
    return;
  } else if (existingWidget || globalReactRoot) {
    // CRITICAL: Clean up any existing React instance before re-init
    console.log("ServiceIT: Cleaning up previous session...");
    
    if (globalReactRoot) {
      try {
        globalReactRoot.unmount();
        globalReactRoot = null;
        console.log("✅ ServiceIT: Unmounted existing React root");
      } catch (error) {
        console.error("❌ ServiceIT: Error unmounting:", error);
      }
    }
    
    if (existingWidget) {
      existingWidget.remove();
      console.log("✅ ServiceIT: Removed stale widget DOM");
    }
  }

  // Check if configuration exists
  const configExists = await hasConfig();
  
  // If no configuration, show setup wizard
  if (!configExists) {
    console.log('[ServiceIT] No configuration found. Showing setup wizard...');
    
    // Create root container for setup wizard
    const rootContainer = document.createElement('div');
    rootContainer.id = 'serviceit-assistant-root';
    rootContainer.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
    document.body.appendChild(rootContainer);
    
    const root = ReactDOM.createRoot(rootContainer);
    globalReactRoot = root;
    
    root.render(
      <React.StrictMode>
        <SetupWizard
          open={true}
          onClose={() => {
            // User closed the wizard - use auto-discovery
            root.unmount();
            rootContainer.remove();
            setTimeout(() => {
              init();
            }, 500);
          }}
          onComplete={async (config) => {
            // Save configuration
            await saveConfig(config);
            
            // Update IVANTI_CONFIG in background script
            await chrome.runtime.sendMessage({
              type: 'UPDATE_CONFIG',
              config,
            });
            
            // Unmount wizard and continue with normal initialization
            root.unmount();
            rootContainer.remove();
            
            // Re-initialize with new config
            setTimeout(() => {
              init();
            }, 500);
          }}
          onSkip={() => {
            // User skipped setup - use auto-discovery
            root.unmount();
            rootContainer.remove();
            // Continue with normal initialization
            setTimeout(() => {
              init();
            }, 500);
          }}
        />
      </React.StrictMode>
    );
    
    return; // Exit early, setup wizard will handle continuation
  }
  
  // Get stored configuration and use it
  const storedConfig = await getStoredConfig();
  if (storedConfig) {
    console.log('[ServiceIT] Using stored configuration:', storedConfig);
    // Update sessionStorage with stored API path prefix
    sessionStorage.setItem('serviceit_api_path_prefix', JSON.stringify({
      prefix: storedConfig.apiPathPrefix,
      timestamp: storedConfig.configuredAt,
    }));
  }

  // Check if we're on an Ivanti domain first
  const isIvantiDomain = window.location.hostname.includes('serviceitplus.com') || 
                         window.location.hostname.includes('trysaasiteu.com') ||
                         window.location.hostname.includes('swhealthdemo-try') ||
                         window.location.hostname.includes('ivanti.com') ||
                         window.location.hostname.includes('heat');
  
  if (!isIvantiDomain) {
    console.log("ServiceIT: Not on an Ivanti domain. AI Assistant will not load.");
    return;
  }

  // CRITICAL: Check for login interface BEFORE doing anything else
  // If user is on login page, don't show loading screen or try to initialize
  const isLoginPage = detectLoginInterface();
  if (isLoginPage) {
    console.log("🚪 ServiceIT: Login page detected. AI Assistant will not load until user logs in.");
    return; // Exit early - don't show loading screen or try to initialize
  }

  // Validate session by making a lightweight API call to Ivanti
  // This is more reliable than just checking cookies (which can persist after logout)
  // Try multiple endpoints in case one fails
  // IMPORTANT: Only block on 401/403 (definitive "not logged in"). All other errors are treated as potentially valid.
  console.log('[ServiceIT] Validating Ivanti session with API call...');
  
  // Build validation endpoints with discovered prefix (or fallback to default)
  const baseUrl = window.location.origin;
  const endpointPaths = [
    'v1/User/current',
    'v1/user/current',
    'rest/Session/User',
    'odata/businessobject/employees?$top=1',
    'odata/businessobject/categorys?$top=1',
  ];
  
  const validationEndpoints = await getEndpointsWithPrefix(baseUrl, endpointPaths);
  
  let foundAuthError = false;
  let allEndpoints404 = true;
  let endpointResults: Array<{ endpoint: string; status: number; error?: string }> = [];
  
  // Get API key from stored config (already retrieved above)
  const apiKey = storedConfig?.apiKey;
  
  // Build headers with API key if available
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `rest_api_key=${apiKey}`;
  }

  for (const testUrl of validationEndpoints) {
    try {
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      
      const status = testResponse.status;
      const endpoint = testUrl.replace(baseUrl, '');
      console.log(`[ServiceIT] Session validation (${endpoint}):`, status);
      endpointResults.push({ endpoint, status });
      
      // ONLY block on 401 or 403 - these definitively mean user is not logged in
      if (status === 401 || status === 403) {
        console.log("ServiceIT: User is not logged in (401/403). AI Assistant will not load.");
        foundAuthError = true;
        allEndpoints404 = false;
        break;
      }
      
      // If we get 200 or 204, session is definitely valid - proceed
      if (status === 200 || status === 204) {
        console.log(`ServiceIT: ✅ Active session validated via ${endpoint}. Proceeding with AI Assistant initialization.`);
        allEndpoints404 = false;
        break; // Found valid endpoint, proceed
      }
      
      // Track if all endpoints are 404 (configuration issue)
      if (status !== 404) {
        allEndpoints404 = false;
      }
      
      // For 400, 404, 500, or any other error - these don't necessarily mean logged out
      // Continue trying other endpoints, but don't block initialization
      console.log(`[ServiceIT] Endpoint ${endpoint} returned ${status} (non-auth error), trying next endpoint...`);
    } catch (error: any) {
      // Network errors, CORS errors, etc. - don't block, just try next endpoint
      const endpoint = testUrl.replace(baseUrl, '');
      console.log(`[ServiceIT] Error validating with ${endpoint}:`, error.message);
      endpointResults.push({ endpoint, status: 0, error: error.message });
      allEndpoints404 = false; // Network errors mean endpoints exist but are unreachable
      continue; // Try next endpoint
    }
  }
  
  // ONLY block if we found a definitive auth error (401/403)
  if (foundAuthError) {
    console.log("ServiceIT: Authentication error detected. AI Assistant will not load.");
    return; // Exit early - don't show any UI
  }
  
  // Create the UI container FIRST (needed for error dialogs too)
  const rootContainer = document.createElement('div');
  rootContainer.id = 'serviceit-assistant-root';
  rootContainer.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(rootContainer);

  // Check if all endpoints returned 404 - this indicates wrong URL/API configuration
  if (allEndpoints404 && endpointResults.length === validationEndpoints.length) {
    console.error("ServiceIT: ⚠️ All API endpoints returned 404. This may indicate incorrect URL or API configuration.");
    
    // Show error dialog
    const errorRoot = ReactDOM.createRoot(rootContainer);
    const errors: Array<import('../components/ErrorDialog').ErrorInfo> = [
      {
        type: 'url',
        message: 'Unable to connect to Ivanti API endpoints. All endpoints returned 404 (Not Found).',
        details: `Current URL: ${window.location.origin}\n\nFailed Endpoints:\n${endpointResults.map(r => `  • ${r.endpoint} → ${r.status === 0 ? 'Network Error' : `HTTP ${r.status}`}`).join('\n')}`,
      },
    ];
    
    errorRoot.render(
      <React.StrictMode>
        <ErrorDialog
          open={true}
          errors={errors}
          onClose={() => {
            errorRoot.unmount();
            rootContainer.remove();
          }}
          onRetry={() => {
            errorRoot.unmount();
            // Retry initialization
            setTimeout(() => {
              init();
            }, 500);
          }}
        />
      </React.StrictMode>
    );
    return; // Exit early - error dialog is shown
  }

  // If we get here, either:
  // 1. We found a valid endpoint (200/204)
  // 2. Some endpoints returned non-auth errors (400, 404, 500, etc.) - assume session might still be valid
  // 3. Some endpoints failed with network errors - assume session might still be valid
  console.log("ServiceIT: ✅ No authentication errors detected. Proceeding with AI Assistant initialization.");

  // Diagnostic logging
  console.log("========================================");
  console.log("ServiceIT Extension: Initializing in MAIN FRAME");
  console.log("Current URL:", window.location.href);
  console.log("Document Ready State:", document.readyState);
  console.log("========================================");

  // RUN BRUTE FORCE SCAN to find ALL user data locations
  runBruteForceScan();

  // ENTERPRISE BEST PRACTICE: Store root globally for proper cleanup
  const root = ReactDOM.createRoot(rootContainer);
  globalReactRoot = root;
  
  // BEST PRACTICE: Quick authentication check BEFORE showing loading screen
  // Check if we have a valid cached session first
  console.log("ServiceIT: Performing quick authentication check...");
  
  let shouldShowLoading = true;
  let currentUser: UserInfo | null = null;
  
  try {
    // Strategy 1: Check chrome.storage for cached user (instant, no API call)
    const cachedData = await chrome.storage.local.get(['currentUser', 'lastSessionId']);
    if (cachedData.currentUser && cachedData.lastSessionId) {
      console.log("✅ ServiceIT: Found cached user session:", cachedData.currentUser.fullName);
      
      // Strategy 2: Verify session is still valid with lightweight API check
      // Use OData endpoint (most reliable) with timeout
      const apiPrefix = storedConfig?.apiPathPrefix || '/api';
      const quickAuthCheck = Promise.race([
        fetch(`${baseUrl}${apiPrefix}/odata/businessobject/employees?$top=1&$select=RecId`, {
          method: 'GET',
          credentials: 'include',
          headers: apiKey ? { 'Accept': 'application/json', 'Authorization': `rest_api_key=${apiKey}` } : { 'Accept': 'application/json' },
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)) // 2 second timeout
      ]);
      
      try {
        const authResponse = await quickAuthCheck;
        if (authResponse.status === 200 || authResponse.status === 204) {
          // Session is valid - use cached user immediately
          console.log("✅ ServiceIT: Session validated - using cached user (no loading screen)");
          currentUser = cachedData.currentUser;
          shouldShowLoading = false;
        } else if (authResponse.status === 401 || authResponse.status === 403) {
          // Session expired - clear cache and show loading
          console.log("⚠️ ServiceIT: Session expired - clearing cache");
          await chrome.storage.local.remove(['currentUser', 'lastSessionId']);
          shouldShowLoading = true;
        }
      } catch (error) {
        // Network error or timeout - assume session might be valid, use cache
        console.log("⚠️ ServiceIT: Auth check timeout/error - using cached user (optimistic)");
        currentUser = cachedData.currentUser;
        shouldShowLoading = false;
      }
    }
  } catch (error) {
    console.error("ServiceIT: Error checking cached session:", error);
  }
  
  // If we have a valid cached user, show UI immediately (skip loading screen)
  if (!shouldShowLoading && currentUser) {
    console.log("✅ ServiceIT: Showing UI immediately with cached user (no loading screen)");
    root.render(
      <React.StrictMode>
        <ChatWidget currentUser={currentUser} />
      </React.StrictMode>
    );
    
    // Refresh user data in background (silent, non-blocking)
    getUserInfo().then((freshUser) => {
      if (freshUser && freshUser.loginId === currentUser?.loginId) {
        // Same user - update silently if needed
        console.log("✅ ServiceIT: User data refreshed silently");
        root.render(
          <React.StrictMode>
            <ChatWidget currentUser={freshUser} />
          </React.StrictMode>
        );
      } else if (freshUser) {
        // Different user - update UI
        console.log("🔄 ServiceIT: Different user detected, updating UI");
        root.render(
          <React.StrictMode>
            <ChatWidget currentUser={freshUser} />
          </React.StrictMode>
        );
      }
    }).catch((error) => {
      console.error("ServiceIT: Error refreshing user:", error);
      // Keep showing cached user on error
    });
    
    return; // Exit early - UI is already shown, no loading screen
  }

  // No cached user found - show loading screen and fetch fresh data
  console.log("ServiceIT: No cached user - showing loading screen");
  let progressState = { stage: 'init', progress: 0, message: 'Identifying user...' };
  
  const updateProgress = (progress: { stage: string; progress: number; message: string }) => {
    progressState = progress;
    root.render(
      <React.StrictMode>
        <LoadingScreen message="Loading Service IT AI" progress={progressState} />
      </React.StrictMode>
    );
  };
  
  root.render(
    <React.StrictMode>
      <LoadingScreen message="Loading Service IT AI" progress={progressState} />
    </React.StrictMode>
  );
  
  console.log("ServiceIT: Loading screen displayed");

  // Get user info (Background script handles API calls - may take a few seconds)
  updateProgress({ stage: 'user_identification', progress: 10, message: 'Identifying user...' });
  currentUser = await getUserInfo();
  
  if (!currentUser) {
    // User identification completely failed - show error dialog
    console.error("ServiceIT: ❌ User identification failed completely. Showing error dialog.");
    
    const lastError = (window as any).__serviceit_last_error;
    const errors: Array<import('../components/ErrorDialog').ErrorInfo> = [
      {
        type: 'api',
        message: 'Unable to identify the current user. This may be due to incorrect API configuration, network issues, or the user not being logged in.',
        details: lastError 
          ? `Error from background script: ${lastError.message}\n\nCurrent URL: ${window.location.origin}`
          : `Current URL: ${window.location.origin}`,
      },
    ];
    
    root.render(
      <React.StrictMode>
        <ErrorDialog
          open={true}
          errors={errors}
          onClose={() => {
            rootContainer.remove();
          }}
          onRetry={() => {
            // Retry initialization
            rootContainer.remove();
            delete (window as any).__serviceit_last_error;
            setTimeout(() => {
              init();
            }, 500);
          }}
        />
      </React.StrictMode>
    );
    return; // Exit early - error dialog is shown
  }
  
  if (currentUser) {
    console.log("Service IT Plus: Identified User", currentUser);
    
    // SECURITY CHECK: Ensure user has role before proceeding
    // If no role is detected, this is a critical security issue - block access
    // BUT: Allow if we have at least loginId (cookie-based identification, API unavailable)
    if (!currentUser.role && (!currentUser.roles || currentUser.roles.length === 0) && !currentUser.loginId) {
      console.error('🚨 ServiceIT: SECURITY - No role or loginId detected for user!');
      console.error('🚨 ServiceIT: User data:', currentUser);
      console.error('🚨 ServiceIT: AI Assistant will be blocked for security.');
      
      // Remove UI and show error message
      rootContainer.remove();
      
      // Show security notice to user
      const securityNotice = document.createElement('div');
      securityNotice.id = 'serviceit-security-notice';
      securityNotice.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fee;
        border: 2px solid #c00;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 999999;
        max-width: 400px;
        font-family: system-ui, -apple-system, sans-serif;
      `;
      securityNotice.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #c00;">⚠️ AI Assistant Unavailable</h3>
        <p style="margin: 0 0 10px 0;">Your user role could not be verified. For security reasons, the AI Assistant is disabled.</p>
        <p style="margin: 0; font-size: 0.9em; color: #666;">Please contact your administrator if you believe this is an error.</p>
        <button onclick="this.parentElement.remove()" style="margin-top: 15px; padding: 8px 16px; background: #c00; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
      `;
      document.body.appendChild(securityNotice);
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        securityNotice.remove();
      }, 10000);
      
      return;
    }
    
    console.log('✅ ServiceIT: User role verified:', currentUser.role || currentUser.roles?.[0]);
    
    updateProgress({ stage: 'user_identified', progress: 30, message: 'User identified, pre-fetching data...' });
    
    // Pre-fetch common data while showing loading screen
    try {
      await chrome.runtime.sendMessage({
        type: 'PREFETCH_DATA',
        currentUser: currentUser
      });
      updateProgress({ stage: 'prefetch_complete', progress: 90, message: 'Almost ready...' });
    } catch (error) {
      console.warn("ServiceIT: Pre-fetch failed (non-critical):", error);
      // Continue anyway - pre-fetch is optional
    }
    
    // Small delay to show completion
    await new Promise(resolve => setTimeout(resolve, 300));
    updateProgress({ stage: 'complete', progress: 100, message: 'Ready!' });
    await new Promise(resolve => setTimeout(resolve, 200));

  // Replace loading screen with chat widget
  root.render(
    <React.StrictMode>
      <ChatWidget currentUser={currentUser} />
    </React.StrictMode>
  );
  
  console.log("ServiceIT: Chat widget rendered");
  } else {
    // User identification failed - remove the UI
    console.warn("Service IT Plus: Could not identify user. Removing AI Assistant.");
    rootContainer.remove();
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { getUserInfo };

