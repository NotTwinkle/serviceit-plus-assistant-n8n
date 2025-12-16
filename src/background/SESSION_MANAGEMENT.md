# Session Management Documentation

## 📋 Overview

This document explains the session management system extracted from the original project. The session management handles user identification, session persistence, and logout detection.

## 🗂️ File Structure

```
src/background/
├── index.ts                    # Main background script (uses all services)
├── config.ts                   # Configuration
└── services/
    ├── sessionManager.ts      # Session ID, storage, persistence
    ├── userIdentity.ts        # User identification from Ivanti API
    └── logoutDetection.ts     # Logout detection via cookies & auth probes
```

---

## 🔧 Services Explained

### 1. `sessionManager.ts` - Session Storage & Management

**Purpose:** Manages user session state, session IDs, and persistence.

**Key Functions:**
- `createSessionId()` - Generates unique session IDs (`session_{timestamp}_{random}`)
- `setGlobalUserSession()` - Saves user session to memory and `chrome.storage.local`
- `getGlobalUserSession()` - Retrieves current user session
- `clearGlobalUserSession()` - Clears session from memory and storage
- `loadUserSessionFromStorage()` - Loads session on startup (survives browser restarts)
- `getUserSessionForPayload()` - Formats session data for n8n webhook payload

**Where It's Used:**
- `index.ts` - Main background script uses it for all session operations
- Called when user is identified
- Called when sending messages to n8n (includes session info)
- Called on extension startup to restore session

**Storage:**
- `chrome.storage.local` - Persistent storage (survives browser restarts)
- `chrome.storage.session` - Session storage (backward compatibility)

---

### 2. `userIdentity.ts` - User Identification

**Purpose:** Identifies the currently logged-in Ivanti user using multiple strategies.

**Key Functions:**
- `getCurrentUser()` - Main function that tries multiple strategies
- `getCurrentUserFromAPI()` - Strategy 1: Ivanti REST API endpoints
- `getCurrentUserFromCookies()` - Strategy 2: Cookie-based detection (fallback)

**Strategies (in order):**
1. **Primary:** Ivanti REST API (`/HEAT/api/v1/User/current`)
   - Tries multiple endpoint variations
   - Most reliable, gets full user info
2. **Fallback:** Cookie detection
   - Checks for user-related cookies
   - Limited info available
3. **Last Resort:** Display name from DOM
   - Minimal info (just name)

**Where It's Used:**
- `index.ts` - `handleIdentifyUser()` function
- Called when content script requests user identification
- Called on page load to identify current user

**API Endpoints Tried:**
- `/HEAT/api/v1/User/current` (primary)
- `/HEAT/api/v1/user/current` (lowercase variant)
- `/HEAT/api/rest/Session/User` (legacy)
- `/HEAT/api/user/me` (alternative)
- `/HEAT/api/core/users/current` (core API)

---

### 3. `logoutDetection.ts` - Logout Detection

**Purpose:** Detects when user logs out of Ivanti using multiple detection methods.

**Key Functions:**
- `initializeLogoutDetection()` - Sets up cookie monitoring
- `checkUserLoggedOut()` - Checks if user is logged out (backup method)
- `handleLogout()` - Cleans up session, history, cache on logout
- `startPeriodicLogoutCheck()` - Starts periodic cookie check (every 30s)
- `startAuthProbe()` - Starts auth probe (401/403 detection, every 15s)

**Detection Methods (3-layer approach):**

1. **Primary: Cookie Monitoring** (Event-driven, immediate)
   - `chrome.cookies.onChanged` listener
   - Detects when `UserSettings` cookie is removed
   - Detects when session/auth cookies are removed
   - Immediate detection

2. **Backup: Periodic Cookie Check** (Every 30 seconds)
   - Checks if `UserSettings` cookie exists
   - Catches edge cases (browser crashes, extension reloads)
   - Less aggressive to avoid false positives

3. **Auth Probe: API Call Check** (Every 15 seconds)
   - Makes API call to Ivanti
   - Detects 401/403 responses
   - Catches authentication failures

**Where It's Used:**
- `index.ts` - Initialized on startup
- Automatically monitors cookies
- Automatically cleans up on logout
- Notifies all tabs when logout/login detected

**Cleanup on Logout:**
- Clears global user session
- Clears conversation histories from storage
- Stops periodic checks and auth probes
- Notifies all Ivanti tabs (`USER_LOGGED_OUT` message)

---

## 🔄 Flow Diagram

### User Identification Flow

```
Content Script → IDENTIFY_USER message
    ↓
Background: handleIdentifyUser()
    ↓
Check cached session → If exists, return it
    ↓
userIdentity.getCurrentUser()
    ↓
Try API endpoints → If success, return user
    ↓
Try cookies → If success, return user
    ↓
Try DOM fallback → If success, return user
    ↓
sessionManager.setGlobalUserSession()
    ↓
Start logout detection
    ↓
Notify all tabs (USER_LOGGED_IN)
    ↓
Return user to content script
```

### Logout Detection Flow

```
Cookie Removed (UserSettings)
    ↓
logoutDetection.handleLogout()
    ↓
Stop monitoring (periodic check, auth probe)
    ↓
sessionManager.clearGlobalUserSession()
    ↓
Clear conversation histories from storage
    ↓
Notify all tabs (USER_LOGGED_OUT)
    ↓
Cleanup complete
```

### Message Flow (with Session)

```
Content Script → SEND_MESSAGE
    ↓
Background: handleSendMessage()
    ↓
Check if user session exists
    ↓
sessionManager.getUserSessionForPayload()
    ↓
Build payload with session info:
  - userId
  - userLoginId
  - userFullName
  - userRoles
  - userTeams
  - sessionId
    ↓
Call n8n webhook with payload
    ↓
Return response to content script
```

---

## 📝 Usage Examples

### Getting Current Session

```typescript
import { getGlobalUserSession, getGlobalSessionId } from './services/sessionManager';

const user = getGlobalUserSession();
const sessionId = getGlobalSessionId();

if (user) {
  console.log('User:', user.fullName);
  console.log('Session ID:', sessionId);
}
```

### Setting User Session

```typescript
import { setGlobalUserSession, createSessionId } from './services/sessionManager';

const user = {
  recId: '123...',
  loginId: 'user.login',
  fullName: 'User Name',
  roles: ['Role1', 'Role2'],
};

const sessionId = createSessionId();
setGlobalUserSession(user, sessionId);
```

### Identifying User

```typescript
import { getCurrentUser } from './services/userIdentity';

const user = await getCurrentUser(tabId, 'Fallback Name');
if (user) {
  console.log('User identified:', user.fullName);
}
```

### Checking Logout Status

```typescript
import { checkUserLoggedOut } from './services/logoutDetection';

const isLoggedOut = await checkUserLoggedOut();
if (isLoggedOut) {
  console.log('User is logged out');
}
```

---

## 🔐 Security Considerations

1. **Session Persistence:**
   - Sessions stored in `chrome.storage.local` (encrypted by Chrome)
   - Survives browser restarts
   - Cleared on logout

2. **Logout Detection:**
   - Multiple detection methods ensure reliability
   - Automatic cleanup prevents data leakage
   - Cookie monitoring is immediate

3. **User Identification:**
   - Uses user's browser session cookies
   - No credentials stored in extension
   - Falls back gracefully if API fails

---

## 🎯 Key Features

✅ **Session Persistence** - Survives browser restarts  
✅ **Multi-Strategy User ID** - API → Cookies → DOM fallback  
✅ **3-Layer Logout Detection** - Cookie monitoring + Periodic check + Auth probe  
✅ **Automatic Cleanup** - Clears all data on logout  
✅ **Tab Notifications** - Notifies all tabs on login/logout  
✅ **Session Isolation** - Each login gets unique session ID  

---

## 📚 Related Files

- `index.ts` - Uses all session management services
- `config.ts` - Configuration for Ivanti base URL
- Original implementation: `../ServiceIT_AI_Extension/src/background/index.ts`

---

**Last Updated:** January 2025  
**Status:** ✅ Extracted and Working

