/**
 * Service IT Plus Assistant - Background Service Worker (n8n Backend)
 * 
 * This is a simplified background script that routes all messages to n8n.
 * All AI processing and Ivanti API calls happen in n8n workflows.
 * 
 * Session Management:
 * - User identification via Ivanti API
 * - Session persistence across browser restarts
 * - Logout detection via cookie monitoring
 */

import { validateConfig, N8N_CONFIG, IVANTI_CONFIG } from './config';
import {
  loadUserSessionFromStorage,
  setGlobalUserSession,
  getGlobalUserSession,
  getGlobalSessionId,
  createSessionId,
  getUserSessionForPayload,
  hasUserSession,
} from './services/sessionManager';
import { getCurrentUser } from './services/userIdentity';
import {
  initializeLogoutDetection,
  startPeriodicLogoutCheck,
  startAuthProbe,
  handleLogout,
} from './services/logoutDetection';
import { saveConfig } from '../services/configStorage';
import {
  manageConversation,
  ChatMessage,
} from './services/conversationManager';
import {
  recordTokenUsage,
  getConversationStats,
  getContextWindowUsage,
  getGlobalTokenStats,
  updateGlobalTokenStats,
  clearConversationStats,
} from './services/tokenTracker';

// Store conversation history per tab (in memory)
const conversationHistory = new Map<number, ChatMessage[]>();

console.log('[Background] Service IT Plus Assistant (n8n) - Background script loaded');
console.log('[Background] 🔍 Initializing session management...');

// Initialize logout detection
initializeLogoutDetection();

// Load user session from storage on startup
loadUserSessionFromStorage().then(() => {
  if (hasUserSession()) {
    console.log('[Background] ✅ User session restored from storage');
    // Start monitoring if we have a restored session
    startPeriodicLogoutCheck();
    startAuthProbe();
  }
});

// Validate configuration
const configValidation = validateConfig();
if (!configValidation.valid) {
  console.warn('[Background] ⚠️  Configuration warnings:', configValidation.errors);
  console.warn('[Background] Extension will still work, but n8n webhook may not be configured');
}

/**
 * Get Ivanti session cookies for API authentication
 * These cookies allow n8n to authenticate with Ivanti APIs on behalf of the user
 */
async function getIvantiCookies(): Promise<string> {
  try {
    // Get all cookies for Ivanti domain
    const cookies = await chrome.cookies.getAll({
      domain: 'swhealthdemo-try.trysaasiteu.com',
    });

    // Filter to only session/auth cookies (exclude analytics, etc.)
    const sessionCookies = cookies.filter((cookie) => {
      const name = cookie.name.toLowerCase();
      return (
        name.includes('session') ||
        name.includes('auth') ||
        name.includes('usersettings') ||
        name.includes('token') ||
        name.includes('heat') ||
        name === 'asp.net_sessionid'
      );
    });

    // Format as Cookie header string (name=value; name2=value2)
    const cookieString = sessionCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    console.log(
      `[Background] 🍪 Extracted ${sessionCookies.length} session cookies for Ivanti`
    );
    return cookieString;
  } catch (error) {
    console.error('[Background] ❌ Error extracting cookies:', error);
    return ''; // Return empty string if cookies can't be extracted
  }
}

/**
 * Call n8n webhook with message and context
 */
async function callN8NWebhook(
  message: string,
  ticketId: string | null,
  history: any[],
  templateContext?: any
): Promise<any> {
  // Get user session info
  const userSession = getUserSessionForPayload();

  // Get Ivanti cookies for API authentication
  const cookies = await getIvantiCookies();

  const payload = {
    message,
    ...userSession, // userId, userLoginId, userFullName, userRoles, userTeams, sessionId
    ticketId,
    cookies, // Session cookies for Ivanti API authentication
    conversationHistory: history.slice(-10), // Last 10 messages for context
    timestamp: new Date().toISOString(),
    // Template context for AI to understand what button was clicked
    templateContext: templateContext || null,
    // Ivanti API configuration for n8n
    ivantiConfig: await (async () => {
      // Get stored config if available, otherwise use default
      const { getStoredConfig } = await import('../services/configStorage');
      const storedConfig = await getStoredConfig();
      return {
        baseUrl: storedConfig?.baseUrl || IVANTI_CONFIG.baseUrl,
        apiPathPrefix: storedConfig?.apiPathPrefix || '/HEAT/api', // Dynamic API path prefix
        apiKey: storedConfig?.apiKey || IVANTI_CONFIG.apiKey,
      };
    })(),
  };

  console.log('[Background] 📤 Sending to n8n webhook:', N8N_CONFIG.webhookUrl);
  console.log('[Background] Payload:', { ...payload, conversationHistory: '[...]' });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), N8N_CONFIG.timeout);

    const response = await fetch(N8N_CONFIG.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-secret': N8N_CONFIG.securitySecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Background] ✅ Received response from n8n');
    return data;
  } catch (error: any) {
    // Log technical details to console (for developers)
    console.error('[Background] ❌ Error calling n8n webhook:', {
      error: error,
      message: error.message,
      name: error.name,
      stack: error.stack,
      url: N8N_CONFIG.webhookUrl,
      timestamp: new Date().toISOString()
    });

    // Throw user-friendly error message (technical details logged above)
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      throw new Error('The request took too long. Please try again.');
    }

    if (error.message?.includes('JSON')) {
      throw new Error('There was a problem processing the response. Please try again.');
    }

    if (error.message?.includes('Failed to fetch') || error.message?.includes('network')) {
      throw new Error('Unable to connect to the service. Please check your internet connection.');
    }

    // Generic user-friendly error
    throw new Error('Something went wrong. Please try again in a moment.');
  }
}

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'IDENTIFY_USER') {
    handleIdentifyUser(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'SEND_MESSAGE') {
    handleSendMessage(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'CONFIRM_SERVICE_REQUEST') {
    handleConfirmServiceRequest(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'CLEAR_CONVERSATION') {
    handleClearConversation(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'GET_CACHED_USER') {
    handleGetCachedUser(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'GET_ACTIVE_TICKETS') {
    handleGetActiveTickets(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'GET_TOKEN_STATS') {
    handleGetTokenStats(request, sender, sendResponse);
    return true;
  }

  if (request.type === 'UPDATE_CONFIG') {
    handleUpdateConfig(request, sender, sendResponse);
    return true;
  }

  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

/**
 * Handle: IDENTIFY_USER
 * Identifies the currently logged-in Ivanti user
 */
async function handleIdentifyUser(request: any, sender: any, sendResponse: Function) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }

    console.log('[Background] Identifying user for tab:', tabId);

    // Check if we should refresh (force refresh or name mismatch)
    const shouldRefresh =
      request.forceRefresh ||
      (getGlobalUserSession() &&
        request.fallbackDisplayName &&
        getGlobalUserSession()!.fullName !== request.fallbackDisplayName);

    if (shouldRefresh) {
      console.log('[Background] 🔄 Refreshing user identification (forced or name mismatch)');
      console.log('[Background] Clearing cached session to force fresh identification');
      // Clear session to force refresh
      setGlobalUserSession({ recId: '', loginId: '', fullName: '' } as any);
    }

    // ALWAYS check window.Session first, even if we have cached user
    // This ensures we get the current logged-in user, not stale cache
    console.log('[Background] 🔍 Always checking window.Session first (bypassing cache to get current user)...');
    
    // Check global session cache (shared across ALL tabs) - but don't return early
    // We'll use it as fallback only if window.Session doesn't exist
    const cachedUser = getGlobalUserSession();
    if (cachedUser && !shouldRefresh && cachedUser.loginId) {
      console.log('[Background] ⚠️ Found cached user:', cachedUser.fullName || cachedUser.loginId);
      console.log('[Background] ⚠️ But will verify against window.Session first to ensure it matches current session');
    }

    // Get user from Ivanti API (this will check window.Session first)
    console.log('[Background] 🔍 Calling getCurrentUser() - this will check window.Session first...');
    const user = await getCurrentUser(tabId, request.fallbackDisplayName);
    
    // If getCurrentUser failed but we have cached user and not forcing refresh, use cache as fallback
    if (!user && cachedUser && !shouldRefresh && cachedUser.loginId) {
      console.log('[Background] ⚠️ window.Session check failed, using cached user as fallback:', cachedUser.fullName || cachedUser.loginId);
      sendResponse({
        success: true,
        user: cachedUser,
        sessionId: getGlobalSessionId(),
        warning: 'Using cached user - window.Session not available',
      });
      return;
    }

    // Accept user if we have at least loginId (even without recId)
    // This allows the widget to work even when API endpoints return 404
    if (user && user.loginId) {
      // Generate a new session ID for this identification
      const newSessionId = createSessionId();

      // Save to global session (persists across browser restarts)
      setGlobalUserSession(user, newSessionId);

      // Start monitoring
      startPeriodicLogoutCheck();
      startAuthProbe();

      console.log('[Background] ✅ User identified:', user.fullName);

      // Notify all Ivanti tabs that a login/session has been established
      chrome.tabs.query({ url: 'https://swhealthdemo-try.trysaasiteu.com/*' }, (tabs) => {
        console.log(
          `[Background] 📤 Broadcasting USER_LOGGED_IN to ${tabs.length} tabs with sessionId ${newSessionId}`
        );
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'USER_LOGGED_IN',
              sessionId: newSessionId,
            }).catch((error) => {
              console.log(
                `[Background] Note: Could not send USER_LOGGED_IN to tab ${tab.id}:`,
                error.message
              );
            });
          }
        });
      });

      sendResponse({ success: true, user, sessionId: newSessionId });
    } else if (user && user.loginId) {
      // User identified but without recId (cookie-based, API endpoints unavailable)
      // Still allow widget to work with minimal user info
      console.log('[Background] ⚠️ User identified with minimal info (no recId):', user.loginId);
      const newSessionId = createSessionId();
      setGlobalUserSession(user, newSessionId);
      startPeriodicLogoutCheck();
      startAuthProbe();
      
      sendResponse({ 
        success: true, 
        user, 
        sessionId: newSessionId,
        warning: 'User identified via cookie only. Some features may be limited.',
      });
    } else {
      console.log('[Background] ❌ Could not identify user');
      // If we previously had a session, treat this as logout and clean up
      if (hasUserSession()) {
        console.log('[Background] ⚠️ Identification failed after having a session. Treating as logout.');
        await handleLogout();
      }
      sendResponse({
        success: false,
        error: 'Could not identify user. Please ensure you are logged in to Ivanti.',
      });
    }
  } catch (error: any) {
    console.error('[Background] Error identifying user:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle: SEND_MESSAGE
 * Routes message to n8n webhook
 */
async function handleSendMessage(request: any, sender: any, sendResponse: Function) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }

    // Check if user is identified
    if (!hasUserSession()) {
      sendResponse({
        success: false,
        error: 'User not identified. Please refresh the page.',
      });
      return;
    }

    // Get conversation history
    let history = conversationHistory.get(tabId) || [];

    // Check if n8n is configured
    if (!configValidation.valid) {
      sendResponse({
        success: true,
        message:
          '⚠️ n8n webhook is not configured. Please set VITE_N8N_WEBHOOK_URL in .env.local or update config.ts',
        actions: [],
      });
      return;
    }

    // Manage conversation (clean, summarize if needed)
    const managedHistory = manageConversation(history, request.message);

    // Add user message to managed history
    const userMessage: ChatMessage = {
      role: 'user',
      content: request.message,
      timestamp: Date.now(),
    };
    managedHistory.push(userMessage);

    // Extract template context if present
    const templateContext = request.templateContext || null;

    // Call n8n webhook with managed history and template context
    const aiResponse = await callN8NWebhook(
      request.message,
      request.ticketId || null,
      managedHistory,
      templateContext
    );

    // Handle different response formats from n8n workflow
    // New workflow returns { text: "..." }, old workflow returns { message: "..." }
    const responseText = aiResponse.text || aiResponse.message || aiResponse.response || 'No response from n8n';
    
    // Track token usage (check if n8n provided actual usage, otherwise estimate)
    const tokenUsage = recordTokenUsage(
      tabId.toString(),
      request.message,
      responseText,
      aiResponse.usage ? {
        inputTokens: aiResponse.usage.prompt_tokens || aiResponse.usage.inputTokens,
        outputTokens: aiResponse.usage.completion_tokens || aiResponse.usage.outputTokens,
        totalTokens: aiResponse.usage.total_tokens || aiResponse.usage.totalTokens,
      } : undefined
    );
    
    // Update global stats
    await updateGlobalTokenStats(tokenUsage);
    
    // Add AI response to history
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: responseText,
      timestamp: Date.now(),
    };
    managedHistory.push(assistantMessage);
    
    // Save managed history back
    conversationHistory.set(tabId, managedHistory);

    // Get current conversation stats for response
    const conversationStats = getConversationStats(tabId.toString());
    const contextUsage = getContextWindowUsage(tabId.toString(), 'gemini-2.5-flash-lite');

    console.log('[Background] ✅ Message processed via n8n');
    console.log('[Background] 📊 Token usage:', {
      input: tokenUsage.inputTokens,
      output: tokenUsage.outputTokens,
      total: tokenUsage.totalTokens,
      contextUsage: `${contextUsage.toFixed(1)}%`,
    });
    
    sendResponse({
      success: true,
      message: responseText,
      actions: aiResponse.actions || [],
      suggestions: aiResponse.suggestions || [], // Add contextual suggestions
      thinkingSteps: aiResponse.thinkingSteps || [],
      tokenUsage: {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        contextUsagePercentage: contextUsage,
        conversationTotal: conversationStats?.totalTokens || 0,
      },
    });
  } catch (error: any) {
    // Log technical details to console (for developers/debugging)
    console.error('[Background] ❌ Error processing message:', {
      error: error,
      message: error.message,
      name: error.name,
      stack: error.stack,
      requestType: request.type,
      timestamp: new Date().toISOString()
    });

    // User-friendly error messages (no technical jargon)
    let errorMessage = 'Sorry, I encountered an issue while processing your request.';

    if (error.message?.includes('too long') || error.message?.includes('timeout')) {
      errorMessage = '⏱️ This is taking longer than expected. Please try again in a moment.';
    } else if (error.message?.includes('connect') || error.message?.includes('network')) {
      errorMessage = '🌐 I\'m having trouble connecting right now. Please check your internet connection and try again.';
    } else if (error.message?.includes('JSON') || error.message?.includes('processing')) {
      errorMessage = '⚠️ There was a problem processing your request. Please try again.';
    } else {
      // Generic friendly message - technical details already logged to console
      errorMessage = 'Sorry, something went wrong. Please try again in a moment.';
    }

    sendResponse({
      success: true, // Still "success" so UI doesn't break
      message: errorMessage,
      actions: [],
    });
  }
}

/**
 * Handle: CONFIRM_SERVICE_REQUEST
 * Routes SR creation to n8n
 */
async function handleConfirmServiceRequest(request: any, sender: any, sendResponse: Function) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }

    if (!hasUserSession()) {
      sendResponse({ success: false, error: 'User not identified. Please refresh the page.' });
      return;
    }

    // Route SR creation to n8n
    const payload = {
      action: 'CREATE_SERVICE_REQUEST',
      subscriptionId: request.subscriptionId,
      fieldValues: request.fieldValues,
      ...getUserSessionForPayload(),
    };

    const response = await callN8NWebhook(JSON.stringify(payload), null, []);

    if (response.success) {
      // Add to conversation history
      const history = conversationHistory.get(tabId) || [];
      history.push({
        role: 'system',
        content: `[SERVICE REQUEST CREATED]: ${response.requestNumber || 'Unknown'}`,
      });
      conversationHistory.set(tabId, history);
    }

    sendResponse(response);
  } catch (error: any) {
    // Log technical details to console (for developers/debugging)
    console.error('[Background] ❌ Error in CONFIRM_SERVICE_REQUEST:', {
      error: error,
      message: error.message,
      name: error.name,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Return user-friendly error message
    sendResponse({ 
      success: false, 
      error: 'Unable to process your request. Please try again.' 
    });
  }
}

/**
 * Handle: CLEAR_CONVERSATION
 */
function handleClearConversation(_request: any, sender: any, sendResponse: Function) {
  const tabId = sender.tab?.id;
  if (tabId) {
    conversationHistory.delete(tabId);
    clearConversationStats(tabId.toString());
    console.log('[Background] Cleared conversation for tab:', tabId);
  }
  sendResponse({ success: true });
}

/**
 * Handle: GET_CACHED_USER
 */
function handleGetCachedUser(_request: any, _sender: any, sendResponse: Function) {
  const user = getGlobalUserSession();
  const sessionId = getGlobalSessionId();

  if (user) {
    sendResponse({ success: true, user, sessionId });
  } else {
    // Also check storage as fallback
    chrome.storage.local.get(['currentUser', 'lastSessionId'], (result) => {
      if (result.currentUser) {
        setGlobalUserSession(result.currentUser, result.lastSessionId || null);
        sendResponse({
          success: true,
          user: result.currentUser,
          sessionId: result.lastSessionId || null,
        });
      } else {
        sendResponse({ success: false, error: 'No cached user' });
      }
    });
  }
}

/**
 * Handle: GET_ACTIVE_TICKETS
 * Fetches the count of active (non-closed) incidents and service requests for the current user
 */
async function handleGetActiveTickets(_request: any, sender: any, sendResponse: Function) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }

    // Check if user is identified
    const user = getGlobalUserSession();
    if (!user || !user.recId) {
      sendResponse({
        success: false,
        error: 'User not identified. Please refresh the page.',
      });
      return;
    }

    console.log('[Background] Fetching active tickets for user:', user.recId);

    // Get API path prefix from storage (from SetupWizard configuration)
    const configResult = await chrome.storage.local.get('ivanti_config');
    const apiPathPrefix = configResult.ivanti_config?.apiPathPrefix || '/HEAT/api'; // Default fallback

    // Build URLs in background script (buildApiUrl not available in page context)
    const baseUrl = IVANTI_CONFIG.baseUrl;
    const incidentsUrl = `${baseUrl}${apiPathPrefix}/odata/businessobject/incidents?$filter=ProfileLink_RecID eq '${user.recId}' and Status ne 'Closed'&$top=100&$count=true`;
    
    // Build service request URLs for different possible endpoint names
    const serviceRequestEndpoints = [
      'service_requests',
      'servicerequests',
      'serviceRequests',
      'sr',
    ];
    const serviceRequestUrls = serviceRequestEndpoints.map(endpoint => 
      `${baseUrl}${apiPathPrefix}/odata/businessobject/${endpoint}?$filter=ProfileLink_RecID eq '${user.recId}' and Status ne 'Closed'&$top=100&$count=true`
    );

    // Fetch active tickets using Ivanti OData API
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (incidentsUrl: string, serviceRequestUrls: string[]) => {
        try {
          const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          };

          // Fetch incidents first
          const incidentsResponse = await fetch(incidentsUrl, {
            method: 'GET',
            credentials: 'include',
            headers,
          }).catch(() => null);

          let incidentCount = 0;
          let serviceRequestCount = 0;

          if (incidentsResponse && incidentsResponse.ok) {
            const incidentsData = await incidentsResponse.json();
            // OData returns count in @odata.count or value.length
            incidentCount = incidentsData['@odata.count'] ?? incidentsData.value?.length ?? 0;
          }

          // Try to fetch service requests from different possible endpoints
          for (const serviceRequestsUrl of serviceRequestUrls) {
            try {
              const serviceRequestsResponse = await fetch(serviceRequestsUrl, {
                method: 'GET',
                credentials: 'include',
                headers,
              });

              if (serviceRequestsResponse && serviceRequestsResponse.ok) {
                const serviceRequestsData = await serviceRequestsResponse.json();
                serviceRequestCount = serviceRequestsData['@odata.count'] ?? serviceRequestsData.value?.length ?? 0;
                break; // Found working endpoint, stop trying others
              }
            } catch (e) {
              // Continue to next endpoint
              continue;
            }
          }

          const totalCount = incidentCount + serviceRequestCount;

          return {
            success: true,
            incidentCount,
            serviceRequestCount,
            totalCount,
          };
        } catch (e: any) {
          console.error('[Background] Error fetching tickets:', e);
          return {
            success: false,
            error: e.message || 'Failed to fetch tickets',
          };
        }
      },
      args: [incidentsUrl, serviceRequestUrls],
    });

    if (result && result[0]?.result?.success) {
      const ticketData = result[0].result;
      console.log('[Background] ✅ Active tickets fetched:', ticketData);
      sendResponse({
        ...ticketData, // ticketData already includes success: true
      });
    } else {
      const error = result?.[0]?.result?.error || 'Failed to fetch tickets';
      console.error('[Background] ❌ Error fetching tickets:', error);
      sendResponse({
        success: false,
        error,
      });
    }
  } catch (error: any) {
    // Log technical details to console (for developers/debugging)
    console.error('[Background] ❌ Error in GET_ACTIVE_TICKETS:', {
      error: error,
      message: error.message,
      name: error.name,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Return user-friendly error message (non-critical, so we can return empty data)
    sendResponse({
      success: true, // Still success so UI doesn't break
      incidentCount: 0,
      serviceRequestCount: 0,
    });
  }
}

/**
 * Handle: GET_TOKEN_STATS
 * Returns token usage statistics for current conversation and global stats
 */
async function handleGetTokenStats(_request: any, sender: any, sendResponse: Function) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }

    const conversationStats = getConversationStats(tabId.toString());
    const contextUsage = getContextWindowUsage(tabId.toString(), 'gemini-2.5-flash-lite');
    const globalStats = await getGlobalTokenStats();

    sendResponse({
      success: true,
      conversation: conversationStats ? {
        totalInputTokens: conversationStats.totalInputTokens,
        totalOutputTokens: conversationStats.totalOutputTokens,
        totalTokens: conversationStats.totalTokens,
        messageCount: conversationStats.messageCount,
        contextUsagePercentage: contextUsage,
      } : null,
      global: globalStats,
    });
  } catch (error: any) {
    console.error('[Background] ❌ Error getting token stats:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle: UPDATE_CONFIG
 * Updates Ivanti configuration from setup wizard
 */
async function handleUpdateConfig(request: any, _sender: any, sendResponse: Function) {
  try {
    const { config } = request;
    
    if (!config || !config.baseUrl || !config.apiPathPrefix) {
      sendResponse({ success: false, error: 'Invalid configuration' });
      return;
    }

    // Save configuration
    await saveConfig(config);
    
    // Also update sessionStorage for immediate use
    await chrome.storage.local.set({
      'serviceit_api_path_prefix': {
        prefix: config.apiPathPrefix,
        timestamp: Date.now(),
      }
    });

    console.log('[Background] Configuration updated:', config);
    sendResponse({ success: true });
  } catch (error: any) {
    console.error('[Background] Error updating config:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Clean up when tabs are closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  conversationHistory.delete(tabId);
  clearConversationStats(tabId.toString());
  console.log('[Background] Cleaned up conversation for tab:', tabId);
});
