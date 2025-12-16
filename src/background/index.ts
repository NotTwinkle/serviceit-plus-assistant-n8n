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

import { validateConfig, N8N_CONFIG } from './config';
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
import {
  manageConversation,
  ChatMessage,
} from './services/conversationManager';

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
      domain: 'success.serviceitplus.com',
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
  history: any[]
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
    console.error('[Background] ❌ Error calling n8n webhook:', error);

    if (error.name === 'AbortError') {
      throw new Error('Request timeout: n8n webhook took too long to respond');
    }

    throw new Error(`Failed to communicate with n8n: ${error.message}`);
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
      console.log('[Background] Refreshing user identification (forced or name mismatch)');
      // Clear session to force refresh
      setGlobalUserSession({ recId: '', loginId: '', fullName: '' } as any);
    }

    // Check global session cache (shared across ALL tabs)
    const cachedUser = getGlobalUserSession();
    if (cachedUser && !shouldRefresh && cachedUser.recId) {
      console.log('[Background] ✅ Returning global cached user:', cachedUser.fullName);
      sendResponse({
        success: true,
        user: cachedUser,
        sessionId: getGlobalSessionId(),
      });
      return;
    }

    // Get user from Ivanti API
    const user = await getCurrentUser(tabId, request.fallbackDisplayName);

    if (user && user.recId) {
      // Generate a new session ID for this identification
      const newSessionId = createSessionId();

      // Save to global session (persists across browser restarts)
      setGlobalUserSession(user, newSessionId);

      // Start monitoring
      startPeriodicLogoutCheck();
      startAuthProbe();

      console.log('[Background] ✅ User identified:', user.fullName);

      // Notify all Ivanti tabs that a login/session has been established
      chrome.tabs.query({ url: 'https://success.serviceitplus.com/*' }, (tabs) => {
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

    // Call n8n webhook with managed history
    const aiResponse = await callN8NWebhook(
      request.message,
      request.ticketId || null,
      managedHistory
    );

    // Add AI response to history
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: aiResponse.message || aiResponse.response || 'No response from n8n',
      timestamp: Date.now(),
    };
    managedHistory.push(assistantMessage);
    
    // Save managed history back
    conversationHistory.set(tabId, managedHistory);

    console.log('[Background] ✅ Message processed via n8n');
    sendResponse({
      success: true,
      message: aiResponse.message || aiResponse.response || 'No response from n8n',
      actions: aiResponse.actions || [],
      thinkingSteps: aiResponse.thinkingSteps || [],
    });
  } catch (error: any) {
    console.error('[Background] ❌ Error processing message:', error);

    let errorMessage = 'Sorry, I encountered an error processing your message.';

    if (error.message?.includes('timeout')) {
      errorMessage =
        '⏱️ Request timeout. The n8n webhook took too long to respond. Please try again.';
    } else if (error.message?.includes('n8n')) {
      errorMessage = `⚠️ n8n connection error: ${error.message}\n\nPlease check your n8n webhook configuration.`;
    } else {
      errorMessage = `Sorry, I encountered an error: ${error.message || 'Unknown error'}`;
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
    console.error('[Background] ❌ Error in CONFIRM_SERVICE_REQUEST:', error);
    sendResponse({ success: false, error: error.message || 'Unknown error' });
  }
}

/**
 * Handle: CLEAR_CONVERSATION
 */
function handleClearConversation(_request: any, sender: any, sendResponse: Function) {
  const tabId = sender.tab?.id;
  if (tabId) {
    conversationHistory.delete(tabId);
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
 * Clean up when tabs are closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  conversationHistory.delete(tabId);
  console.log('[Background] Cleaned up conversation for tab:', tabId);
});
