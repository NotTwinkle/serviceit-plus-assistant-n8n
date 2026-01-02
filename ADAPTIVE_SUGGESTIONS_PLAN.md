# Adaptive Chat Suggestions Implementation Plan

## Overview
Implement context-aware, AI-driven chat suggestions that adapt based on conversation history and user context. Suggestions will appear as quick action buttons (similar to existing quick actions) but will be dynamically generated based on the conversation flow.

## Current State Analysis

### Existing Quick Actions
- **Location**: `src/components/ChatWidget.tsx` (lines 185-222)
- **Display**: Only shown when `messages.length === 1` (just welcome message)
- **Type**: Static `PROMPT_TEMPLATES` array
- **Format**: Button with icon, label, and predefined prompt

### Available Context
1. **Conversation History**: Stored in `chrome.storage.local`, managed by `conversationManager.ts`
2. **User Context**: Current user info, ticket ID, session data
3. **Message History**: Full conversation with roles (user/assistant/system)
4. **AI Response Metadata**: Actions, token usage, thinking steps

## Implementation Strategy

### Phase 1: Backend (n8n Workflow) - Generate Suggestions

#### New n8n Node: "Generate Contextual Suggestions"
**Purpose**: Analyze conversation history and generate 3-5 relevant suggestions

**Input**:
- Conversation history (last 10-20 messages)
- Current AI response
- User context (ticket ID, user email, etc.)
- Recent actions taken

**Logic**:
1. Analyze conversation to extract:
   - Current topic/intent
   - Recent actions (e.g., "searched KB", "viewed tickets")
   - Unresolved questions or follow-ups needed
   - User's workflow stage (e.g., "just created ticket", "searching for solution")

2. Generate suggestions based on context:
   - **After KB search**: "Show more results", "Create ticket if not found", "Search for [related topic]"
   - **After viewing tickets**: "Update ticket", "Create new ticket", "Search KB for solution"
   - **After creating ticket**: "View all tickets", "Search for similar issues"
   - **General conversation**: "Show my tickets", "Search knowledge base", "I need help"
   - **Follow-up questions**: Context-specific next steps

**Output Format**:
```json
{
  "suggestions": [
    {
      "id": "suggest-1",
      "label": "Show more KB results",
      "prompt": "Show me more knowledge base articles about password reset",
      "icon": "🔍",
      "priority": 1,
      "reason": "User just searched KB, likely wants more results"
    },
    {
      "id": "suggest-2",
      "label": "Create ticket",
      "prompt": "I need to create a ticket for this issue",
      "icon": "➕",
      "priority": 2,
      "reason": "No solution found in KB"
    }
  ]
}
```

**Implementation in n8n**:
- Use **Code Node** or **AI Agent** to analyze conversation
- Can use existing "Smart Agent" node's context
- Add after "Format AI Response" node
- Return suggestions as part of webhook response

### Phase 2: Frontend - Display Dynamic Suggestions

#### 1. Update Message Interface
**File**: `src/components/ChatWidget.tsx`

Add to `Message` interface:
```typescript
interface Message {
  // ... existing fields
  suggestions?: Suggestion[]; // New field for contextual suggestions
}

interface Suggestion {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
  priority?: number;
}
```

#### 2. Update n8n Response Handler
**File**: `src/background/index.ts`

Modify `handleSendMessage` to extract suggestions from AI response:
```typescript
const aiResponse = await callN8NWebhook(...);

// Extract suggestions if present
const suggestions = aiResponse.suggestions || [];

sendResponse({
  success: true,
  message: aiResponse.message,
  suggestions: suggestions, // Pass to frontend
  actions: aiResponse.actions || [],
  // ... other fields
});
```

#### 3. Update ChatWidget to Display Suggestions
**File**: `src/components/ChatWidget.tsx`

**Changes**:
1. Store suggestions in message state
2. Display suggestions after AI responses (not just welcome)
3. Show suggestions below assistant messages
4. Limit to 3-5 suggestions (prioritize by `priority` field)
5. Style similar to existing quick actions

**Display Logic**:
```typescript
// Show suggestions after assistant messages
{messages.map((message) => (
  // ... existing message display
  {message.role === 'assistant' && message.suggestions && message.suggestions.length > 0 && (
    <div className="sit-flex sit-flex-wrap sit-gap-2 sit-mt-3">
      {message.suggestions
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .slice(0, 5)
        .map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => handleSuggestionClick(suggestion)}
            // ... existing button styling
          >
            {suggestion.icon && <span>{suggestion.icon}</span>}
            {suggestion.label}
          </button>
        ))}
    </div>
  )}
))}
```

#### 4. Handle Suggestion Clicks
**File**: `src/components/ChatWidget.tsx`

```typescript
const handleSuggestionClick = (suggestion: Suggestion) => {
  // Send suggestion prompt as user message
  handleSendMessage(suggestion.prompt, {
    templateContext: {
      suggestionId: suggestion.id,
      source: 'contextual_suggestion'
    }
  });
};
```

### Phase 3: Smart Suggestion Generation Logic

#### Context Analysis Patterns

1. **After KB Search**:
   - If results found: "Show more results", "View article details", "Create ticket if this doesn't help"
   - If no results: "Create ticket", "Try different search terms", "Contact support"

2. **After Viewing Tickets**:
   - If tickets exist: "Update ticket", "View ticket details", "Create new ticket"
   - If no tickets: "Create new ticket", "Search KB for common issues"

3. **After Creating Ticket**:
   - "View all tickets", "Search KB for solution while waiting", "Check ticket status"

4. **During Problem-Solving**:
   - "Try this solution", "Search for similar issues", "Create ticket if still stuck"

5. **General/Idle State**:
   - Show default quick actions (current PROMPT_TEMPLATES)

#### Implementation in n8n

**Option A: Code Node (Simple)**
- Analyze last 3-5 messages
- Pattern match for common scenarios
- Return predefined suggestions

**Option B: AI Agent (Advanced)**
- Use existing "Smart Agent" node
- Add tool: `generate_suggestions` that analyzes conversation
- More flexible, context-aware

**Option C: Hybrid (Recommended)**
- Code node for pattern matching (fast, deterministic)
- AI agent for complex scenarios (flexible, adaptive)
- Combine both approaches

### Phase 4: Fallback & Default Behavior

1. **If n8n doesn't return suggestions**: Show default quick actions
2. **If conversation is empty**: Show welcome quick actions
3. **If error generating suggestions**: Gracefully fall back to defaults
4. **Rate limiting**: Don't regenerate suggestions on every message (cache for 30 seconds)

## Technical Implementation Details

### n8n Workflow Changes

**Location**: After "Format AI Response" node

**New Node**: "Generate Contextual Suggestions"
- **Type**: Code Node or AI Agent
- **Input**: AI response, conversation history, user context
- **Output**: Suggestions array

**Example Code Node Logic**:
```javascript
const items = $input.all();
const aiResponse = items[0].json;
const conversationHistory = $('Security & Data Prep').first().json.conversationHistory || [];
const userContext = $('Security & Data Prep').first().json.userContext || {};

const suggestions = [];

// Analyze last few messages
const recentMessages = conversationHistory.slice(-5);
const lastUserMessage = recentMessages.filter(m => m.role === 'user').pop();
const lastAssistantMessage = recentMessages.filter(m => m.role === 'assistant').pop();

// Pattern: User searched KB
if (lastUserMessage?.content?.toLowerCase().includes('search') || 
    lastUserMessage?.content?.toLowerCase().includes('knowledge base')) {
  suggestions.push({
    id: 'suggest-more-kb',
    label: 'Show more results',
    prompt: 'Show me more knowledge base articles',
    icon: '🔍',
    priority: 1
  });
  suggestions.push({
    id: 'suggest-create-ticket',
    label: 'Create ticket',
    prompt: 'I need to create a ticket for this issue',
    icon: '➕',
    priority: 2
  });
}

// Pattern: User viewed tickets
if (lastUserMessage?.content?.toLowerCase().includes('ticket') ||
    lastUserMessage?.content?.toLowerCase().includes('show all')) {
  suggestions.push({
    id: 'suggest-update-ticket',
    label: 'Update a ticket',
    prompt: 'I want to update one of my tickets',
    icon: '✏️',
    priority: 1
  });
}

// Default suggestions if no patterns match
if (suggestions.length === 0) {
  suggestions.push(
    { id: 'default-tickets', label: 'Show my tickets', prompt: 'Show me all my open tickets', icon: '📋', priority: 1 },
    { id: 'default-kb', label: 'Search KB', prompt: 'Search the knowledge base', icon: '🔍', priority: 2 },
    { id: 'default-help', label: 'I need help', prompt: 'I need help with', icon: '❓', priority: 3 }
  );
}

return [{
  json: {
    ...aiResponse,
    suggestions: suggestions.slice(0, 5) // Limit to 5
  }
}];
```

### Frontend Changes Summary

1. **Update types** (`ChatWidget.tsx`):
   - Add `suggestions` to `Message` interface
   - Create `Suggestion` interface

2. **Update message handler** (`background/index.ts`):
   - Extract `suggestions` from n8n response
   - Pass to frontend

3. **Update UI** (`ChatWidget.tsx`):
   - Display suggestions after assistant messages
   - Style similar to existing quick actions
   - Handle suggestion clicks

4. **Update welcome message**:
   - Keep existing quick actions for welcome
   - Add contextual suggestions after AI responses

## Testing Plan

1. **Test Scenarios**:
   - KB search → suggestions appear
   - Ticket view → suggestions appear
   - Empty conversation → default suggestions
   - Error handling → fallback to defaults

2. **Edge Cases**:
   - No suggestions returned from n8n
   - Malformed suggestions
   - Very long conversation history
   - Rapid message sending

## Benefits

1. **Improved UX**: Users get relevant next steps without typing
2. **Context-Aware**: Suggestions adapt to conversation flow
3. **Efficiency**: Reduces typing and navigation
4. **Discovery**: Helps users discover features
5. **Consistency**: Uses existing button UI pattern

## Future Enhancements

1. **Learning**: Track which suggestions are clicked most
2. **Personalization**: Adapt to user's common workflows
3. **A/B Testing**: Test different suggestion strategies
4. **Analytics**: Measure suggestion effectiveness
5. **Multi-language**: Support for different languages

## Implementation Order

1. ✅ **Phase 1**: Backend (n8n) - Generate suggestions
2. ✅ **Phase 2**: Frontend - Display suggestions
3. ✅ **Phase 3**: Smart logic - Context analysis
4. ✅ **Phase 4**: Fallback & polish

## Estimated Effort

- **Backend (n8n)**: 2-3 hours
- **Frontend**: 2-3 hours
- **Testing & Polish**: 1-2 hours
- **Total**: 5-8 hours

