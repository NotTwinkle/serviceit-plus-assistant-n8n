# Features to Extract from Original Project

## ✅ Already Extracted

1. **Session Management** (`src/background/services/sessionManager.ts`)
   - Session ID generation
   - User session storage/retrieval
   - Session persistence

2. **User Identity** (`src/background/services/userIdentity.ts`)
   - User identification from Ivanti API
   - Cookie parsing (UserSettings)
   - OData queries for user lookup

3. **Logout Detection** (`src/background/services/logoutDetection.ts`)
   - Cookie monitoring
   - Periodic checks
   - Auth probes

4. **Frontend Components** (Already copied)
   - ChatWidget
   - ThemeEditor
   - ThemeSettings
   - LoadingScreen

5. **Content Scripts** (Already copied)
   - index.tsx
   - inject.js
   - brute-force-scanner.js

---

## 🔄 Features to Extract

### 1. **Ticket Context Extraction** ⚠️ NEEDED
**Location:** `src/components/ChatWidget.tsx` (line 714-716)

**What it does:**
- Extracts ticket RecId from URL query parameters
- Used to provide context about current ticket to AI

**Code:**
```typescript
const params = new URLSearchParams(window.location.search);
const recId = params.get('RecId');
```

**Where to extract:**
- Create: `src/background/services/ticketContext.ts`
- Or: `src/content/utils/ticketContext.ts` (since it's URL-based)

**Usage:**
- Content script extracts RecId from URL
- Passes to background when sending messages
- Background includes in n8n payload

---

### 2. **Conversation History Management** ⚠️ NEEDED
**Location:** `src/background/services/conversationManager.ts`

**What it does:**
- Manages conversation history per tab
- Summarizes long conversations
- Extracts key information
- Cleans redundant messages

**Key Functions:**
- `manageConversation()` - Main function
- `extractConversationKeyInfo()` - Extract important facts
- `cleanConversation()` - Remove redundant messages
- `summarizeConversation()` - Summarize old messages

**Why needed:**
- Even with n8n, we need to manage history in extension
- Send last N messages to n8n for context
- Store history locally for persistence

**Extract to:**
- `src/background/services/conversationManager.ts`

---

### 3. **Typo Correction** ⚠️ OPTIONAL (can be done in n8n)
**Location:** `src/background/services/typoCorrection.ts`

**What it does:**
- Corrects common typos in user input
- IT/technical term corrections

**Decision:**
- Can be done in n8n (AI can handle typos)
- Or extract for client-side correction (faster)

**Extract to:**
- `src/background/services/typoCorrection.ts` (optional)

---

### 4. **Content Script Utilities** ⚠️ NEEDED
**Location:** `src/content/index.tsx`

**What it does:**
- DOM scraping for user name (fallback)
- Name validation
- Top-right corner scanning

**Key Functions:**
- `scrapeUserNameFromDOM()` - Scrape user name from page
- `isValidName()` - Validate if text is a name
- `scanTopRightCorner()` - Scan UI for user info

**Extract to:**
- `src/content/utils/domScraping.ts`

---

### 5. **URL/Context Utilities** ⚠️ NEEDED
**Location:** Various files

**What it does:**
- Extract RecId from URL
- Detect Ivanti domain
- Extract page context

**Extract to:**
- `src/content/utils/contextExtraction.ts`

---

### 6. **Storage Utilities** ⚠️ OPTIONAL
**Location:** Various files

**What it does:**
- Conversation history storage
- Session storage helpers
- Storage cleanup utilities

**Extract to:**
- `src/background/services/storageManager.ts` (optional, can use chrome.storage directly)

---

## 📋 Extraction Priority

### High Priority (Must Extract)
1. ✅ Session Management - DONE
2. ✅ User Identity - DONE  
3. ✅ Logout Detection - DONE
4. ⚠️ **Ticket Context Extraction** - NEEDED
5. ⚠️ **Conversation History Management** - NEEDED

### Medium Priority (Should Extract)
6. ⚠️ **Content Script Utilities** (DOM scraping) - NEEDED
7. ⚠️ **URL/Context Utilities** - NEEDED

### Low Priority (Optional)
8. Typo Correction - Can be done in n8n
9. Storage Utilities - Can use chrome.storage directly

---

## 🎯 Next Steps

1. Extract ticket context extraction
2. Extract conversation manager
3. Extract content script utilities
4. Update main background script to use all services
5. Test integration

---

**Last Updated:** January 2025
