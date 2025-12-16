# n8n Workflow Setup Guide

This guide explains how to set up the n8n workflow that powers this extension.

## 📋 Workflow Overview

The n8n workflow receives messages from the extension, fetches Ivanti data, calls AI, and returns responses.

## 🔧 Workflow Structure

### 1. Webhook Trigger

**Node Type:** Webhook

**Settings:**
- HTTP Method: `POST`
- Path: `/webhook/ivanti-ai` (or your custom path)
- Response Mode: `Last Node`

**Expected Input:**
```json
{
  "message": "user message text",
  "userId": "user-rec-id",
  "userLoginId": "user.login",
  "userFullName": "User Name",
  "userRoles": ["Role1", "Role2"],
  "userTeams": ["Team1"],
  "ticketId": "ticket-rec-id or null",
  "sessionId": "session-id",
  "conversationHistory": [...],
  "timestamp": "2025-01-XX..."
}
```

---

### 2. Get User Info (Optional - if not provided)

**Node Type:** HTTP Request

**Settings:**
- Method: `GET`
- URL: `https://success.serviceitplus.com/HEAT/api/v1/User/current`
- Authentication: Use cookies from webhook request
- Send Cookies: `true`

**Note:** Extension may already provide user info, so this step might be skipped.

---

### 3. Get Ticket Data (If ticketId provided)

**Node Type:** HTTP Request

**Settings:**
- Method: `GET`
- URL: `https://success.serviceitplus.com/HEAT/api/odata/businessobject/incidents?$filter=RecId eq '{{$json.ticketId}}'&$select=RecId,IncidentNumber,Subject,Status,Priority,ProfileFullName`
- Authentication: Use cookies
- Send Cookies: `true`

**Condition:** Only run if `ticketId` is not null

---

### 4. Get User Permissions/Roles

**Node Type:** HTTP Request

**Settings:**
- Method: `GET`
- URL: `https://success.serviceitplus.com/HEAT/api/odata/businessobject/frs_def_roles?$filter=...`
- Authentication: Use cookies
- Send Cookies: `true`

---

### 5. Get Knowledge Base Articles (Optional)

**Node Type:** HTTP Request

**Settings:**
- Method: `GET`
- URL: `https://success.serviceitplus.com/HEAT/api/odata/businessobject/knowledgearticles?$filter=...`
- Authentication: Use cookies
- Send Cookies: `true`

**Condition:** Only if message contains keywords that suggest KB search

---

### 6. Build AI Context

**Node Type:** Code / Function

**Purpose:** Combine all fetched data into AI context

**Example Code:**
```javascript
const user = $input.item.json.user || $('Webhook').item.json;
const ticket = $('Get Ticket Data').item.json;
const roles = $('Get User Permissions').item.json;
const kb = $('Get Knowledge Base').item.json;

return {
  user: {
    name: user.userFullName,
    roles: user.userRoles,
    teams: user.userTeams
  },
  ticket: ticket?.value?.[0] || null,
  permissions: roles?.value || [],
  knowledgeBase: kb?.value || [],
  conversationHistory: $('Webhook').item.json.conversationHistory,
  message: $('Webhook').item.json.message
};
```

---

### 7. Call AI (OpenAI/Anthropic/Gemini)

**Option A: OpenAI Node**

**Settings:**
- Model: `gpt-4` or `gpt-3.5-turbo`
- System Prompt: 
```
You are an expert AI assistant for Ivanti Service Manager.

User Context:
- Name: {{$json.user.name}}
- Roles: {{$json.user.roles}}
- Current Ticket: {{$json.ticket}}

Ivanti Data:
{{$json.ticket}}
{{$json.knowledgeBase}}

Instructions:
- Help user with Ivanti-related questions
- Use provided data only (don't hallucinate)
- Be conversational and helpful
```
- Messages: Use conversation history + current message

**Option B: HTTP Request to Gemini**

**Settings:**
- Method: `POST`
- URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=YOUR_API_KEY`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "contents": [{
    "parts": [{
      "text": "System: [system prompt]\n\nUser: {{$json.message}}"
    }]
  }]
}
```

---

### 8. Parse AI Response

**Node Type:** Code / Function

**Purpose:** Extract message, actions, thinking steps from AI response

**Example Code:**
```javascript
const aiResponse = $input.item.json;

// Extract message
const message = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text 
  || aiResponse.choices?.[0]?.message?.content
  || aiResponse.message
  || 'No response';

// Extract actions (if AI returns structured data)
const actions = aiResponse.actions || [];

// Extract thinking steps (if provided)
const thinkingSteps = aiResponse.thinkingSteps || [];

return {
  message,
  actions,
  thinkingSteps
};
```

---

### 9. Execute Actions (If needed)

**Node Type:** Switch / IF

**Purpose:** If AI response contains actions, execute them

**Example Actions:**
- Create Incident → HTTP Request to Ivanti
- Update Ticket → HTTP Request to Ivanti
- Trigger Self-Healing → Call another n8n workflow

---

### 10. Return Response

**Node Type:** Respond to Webhook

**Settings:**
- Response Code: `200`
- Response Body:
```json
{
  "message": "{{$json.message}}",
  "actions": {{$json.actions}},
  "thinkingSteps": {{$json.thinkingSteps}}
}
```

---

## 🔐 Security Considerations

1. **Webhook Authentication:**
   - Add API key header check
   - Validate request origin
   - Rate limiting

2. **Ivanti API Authentication:**
   - Use cookies from extension (passed through)
   - Or use service account credentials stored in n8n

3. **AI API Keys:**
   - Store in n8n credentials (encrypted)
   - Never expose in workflow

---

## 📝 Example Workflow JSON

You can import this workflow structure into n8n:

```json
{
  "name": "Ivanti AI Assistant",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "httpMethod": "POST",
        "path": "ivanti-ai"
      }
    },
    {
      "name": "Get Ticket Data",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "GET",
        "url": "https://success.serviceitplus.com/HEAT/api/odata/businessobject/incidents"
      }
    },
    {
      "name": "Call AI",
      "type": "n8n-nodes-base.openAi",
      "parameters": {
        "operation": "complete",
        "model": "gpt-4"
      }
    },
    {
      "name": "Return Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "parameters": {}
    }
  ]
}
```

---

## 🚀 Testing

1. **Test Webhook:**
   ```bash
   curl -X POST https://your-n8n-instance.com/webhook/ivanti-ai \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Hello",
       "userId": "test-user",
       "userRoles": ["User"]
     }'
   ```

2. **Check Logs:**
   - View n8n execution logs
   - Check for errors in each node
   - Verify data flow

---

## 🔄 Self-Healing Integration

To add self-healing capabilities:

1. **Detect Issue:**
   - AI analyzes message for issues
   - Identifies remediation needed

2. **Trigger Workflow:**
   - Call another n8n workflow
   - Pass issue details

3. **Execute Remediation:**
   - Clean memory
   - Restart services
   - Run scripts
   - etc.

**Example:**
```javascript
// In "Execute Actions" node
if (action.type === 'SELF_HEAL') {
  // Call self-healing workflow
  await $http.post('https://your-n8n-instance.com/webhook/self-heal', {
    issue: action.issue,
    userId: $('Webhook').item.json.userId
  });
}
```

---

## 📚 Resources

- [n8n Documentation](https://docs.n8n.io/)
- [n8n HTTP Request Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [n8n OpenAI Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openai/)

---

**Last Updated:** January 2025
