# n8n AI Workflow Setup Guide (2025)

This guide will help you set up n8n with AI workflows for your Chrome Extension.

## ⭐ Recommended: Use Google Gemini for Testing

**Why Gemini?**
- ✅ **FREE Tier Available** - Perfect for testing!
- ✅ **Cost-Effective** - Much cheaper than OpenAI
- ✅ **Fast Response Times** - Gemini 2.0 Flash is very fast
- ✅ **Generous Rate Limits** - 15 requests/minute on free tier
- ✅ **No Credit Card Required** - For free tier

**This workflow template is configured for Gemini by default!**

---

## 🎯 Quick Start with Gemini (5 Minutes)

1. **Get Gemini API Key** (Free!)
   - Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Click "Get API key" → Create API key
   - Copy the key

2. **Import Workflow**
   - Open n8n
   - Click "Import from File"
   - Select `n8n-workflow-template.json`
   - Open the "Build Gemini Request" node
   - Replace `YOUR_GEMINI_API_KEY` with your actual key

3. **Activate & Test**
   - Toggle workflow to "Active"
   - Copy webhook URL
   - Update `src/background/config.ts` with webhook URL
   - Build extension: `npm run build`
   - Test in Chrome!

---

## 🚀 Quick Start

### Option 1: n8n Cloud (Easiest)
1. Sign up at [n8n.io](https://n8n.io)
2. Create a new workspace
3. Start building workflows immediately

### Option 2: Self-Hosted n8n
1. **Docker (Recommended):**
   ```bash
   docker run -it --rm \
     --name n8n \
     -p 5678:5678 \
     -v ~/.n8n:/home/node/.n8n \
     n8nio/n8n
   ```
2. Access at `http://localhost:5678`
3. Follow setup wizard

**Or use the Self-Hosted AI Starter Kit:**
- GitHub: [n8n-io/self-hosted-ai-starter-kit](https://github.com/n8n-io/self-hosted-ai-starter-kit)
- Pre-configured AI environment

---

## 📋 Step-by-Step Setup

### Step 1: Get AI API Keys

#### Google Gemini (Recommended for Testing - FREE Tier Available!) ⭐
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API key in new project"** or **"Get API key"**
4. Copy the key immediately (you can view it later in your project)
5. **Free Tier:** Gemini offers generous free tier for testing!
   - **Gemini 2.0 Flash:** Free tier available
   - **Rate Limits:** 15 requests per minute (free tier)
   - **Perfect for testing!**

#### OpenAI (GPT-4, GPT-3.5) - More Expensive
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign in or create account
3. Navigate to **API keys** section
4. Click **"Create new secret key"**
5. Copy the key (shown only once!)
6. **Note:** OpenAI charges per token, can get expensive quickly

#### Anthropic Claude (Alternative)
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Navigate to **API Keys**
3. Create new key

---

### Step 2: Add Gemini API Key to n8n

**Option A: Using Environment Variable (Recommended)**
1. In n8n, go to **Settings** → **Environment Variables**
2. Click **"+ Add Variable"**
3. Name: `GEMINI_API_KEY`
4. Value: Paste your Gemini API key
5. Click **"Save"**

**Option B: Using Workflow Variable**
1. In your workflow, go to **Settings** (gear icon)
2. Add workflow variable: `GEMINI_API_KEY`
3. Set value to your API key

**Option C: Hardcode in Code Node (Not Recommended)**
- You can paste the API key directly in the "Build Gemini Request" code node
- Replace `YOUR_GEMINI_API_KEY` with your actual key
- ⚠️ **Security Warning:** This exposes your key in the workflow

---

### Step 3: Create Your Workflow

#### A. Basic Webhook + AI Workflow

1. **Create New Workflow**
   - Click **"Workflows"** → **"+ New Workflow"**

2. **Add Webhook Trigger**
   - Click **"Add first step"**
   - Search for **"Webhook"**
   - Select **"Webhook"** node
   - Configure:
     - **HTTP Method:** `POST`
     - **Path:** `ivanti-ai` (or your custom path)
     - **Response Mode:** `Last Node`
   - Click **"Listen for test event"** to get your webhook URL
   - Copy the webhook URL (e.g., `https://your-n8n.com/webhook/ivanti-ai`)

3. **Add Code Node: Build Gemini Request**
   - Click **"+"** after Webhook node
   - Search for **"Code"**
   - Select **"Code"** node
   - Name it: **"Build Gemini Request"**
   - Paste this code (update API key):
     ```javascript
     // Build prompt for Gemini
     const context = $input.item.json;
     
     // Build system instructions
     const systemPrompt = `You are an expert AI assistant for Ivanti Service Manager.
     
     User Context:
     - Name: ${context.userFullName || 'Unknown'}
     - Roles: ${(context.userRoles || []).join(', ') || 'None'}
     - Current Ticket: ${context.ticketId || 'None'}
     
     Instructions:
     - Help user with Ivanti-related questions
     - Use only facts from provided data (never hallucinate)
     - Be conversational and helpful
     - If you don't know something, say so`;
     
     // Build conversation history
     let conversationText = '';
     if (context.conversationHistory && context.conversationHistory.length > 0) {
       conversationText = context.conversationHistory
         .slice(-5) // Last 5 messages
         .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
         .join('\n\n');
     }
     
     // Build full prompt
     const fullPrompt = `${systemPrompt}\n\n${conversationText ? 'Previous conversation:\n' + conversationText + '\n\n' : ''}User: ${context.message}\n\nAssistant:`;
     
     // Get API key from environment variable or hardcode
     const geminiApiKey = $env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE';
     const model = 'gemini-2.0-flash-exp'; // Fast and free tier friendly
     
     return {
       url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
       method: 'POST',
       headers: {
         'Content-Type': 'application/json'
       },
       body: {
         contents: [{
           parts: [{ text: fullPrompt }]
         }],
         generationConfig: {
           temperature: 0.7,
           maxOutputTokens: 2000
         }
       }
     };
     ```
   - **Important:** Replace `YOUR_GEMINI_API_KEY_HERE` with your actual API key, or use `$env.GEMINI_API_KEY` if you set it as environment variable

4. **Add HTTP Request Node: Call Gemini API**
   - Click **"+"** after "Build Gemini Request"
   - Search for **"HTTP Request"**
   - Select **"HTTP Request"** node
   - Configure:
     - **Method:** `POST`
     - **URL:** `={{ $json.url }}`
     - **Send Headers:** Yes
     - **Header:** `Content-Type: application/json`
     - **Send Body:** Yes
     - **Body Content Type:** JSON
     - **Body:** `={{ $json.body }}`

5. **Add Code Node: Parse Gemini Response**
   - Click **"+"** after "Call Gemini API"
   - Search for **"Code"**
   - Select **"Code"** node
   - Name it: **"Parse AI Response"**
   - Paste this code:
     ```javascript
     // Parse Gemini API response
     const aiResponse = $input.item.json;
     
     // Extract message from Gemini response
     let message = '';
     
     if (aiResponse.candidates && aiResponse.candidates[0]) {
       const candidate = aiResponse.candidates[0];
       if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
         message = candidate.content.parts[0].text || '';
       }
     }
     
     if (!message) {
       message = 'No response from AI';
     }
     
     return {
       message: message.trim(),
       actions: [],
       thinkingSteps: []
     };
     ```

6. **Add Respond to Webhook Node**
   - Click **"+"** after "Parse AI Response"
   - Search for **"Respond to Webhook"**
   - Configure:
     - **Response Code:** `200`
     - **Response Body:** `={{ $json }}`

6. **Save and Activate**
   - Click **"Save"** (top right)
   - Toggle **"Active"** switch to ON

---

### Step 4: Test Your Workflow

#### Test with curl:
```bash
curl -X POST https://your-n8n.com/webhook/ivanti-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, can you help me?",
    "userId": "test-user",
    "userFullName": "Test User",
    "userRoles": ["User"],
    "ticketId": null,
    "sessionId": "test-session"
  }'
```

#### Test from Extension:
1. Update `src/background/config.ts` with your webhook URL
2. Build extension: `npm run build`
3. Load in Chrome
4. Send a test message

---

## 🎯 Recommended Templates (2025)

### 1. **Build Your First AI Agent**
- **URL:** [n8n.io/workflows/6270-build-your-first-ai-agent](https://n8n.io/workflows/6270-build-your-first-ai-agent/)
- **Features:**
  - AI-powered chatbot
  - Tool integration (weather, news)
  - Google Gemini integration
  - Perfect starting point

### 2. **AI Agent Chat**
- **URL:** [n8ntemplates.me/templates/ai-agent-chat-1954](https://n8ntemplates.me/templates/ai-agent-chat-1954)
- **Features:**
  - OpenAI integration
  - Memory buffer
  - Conversational agent
  - SerpAPI integration

### 3. **AI Prompt Generator**
- **URL:** [n8n.io/workflows/5045-ai-prompt-generator-workflow](https://n8n.io/workflows/5045-ai-prompt-generator-workflow)
- **Features:**
  - Converts user input to structured prompts
  - Dynamic question generation
  - Good for refining AI interactions

### 4. **Beginner's Guide Workflow**
- **URL:** [n8n.io/workflows/9306-beginners-guide](https://n8n.io/workflows/9306-beginners-guide-to-workflow-automation-with-openai-langchain-and-api-integrations)
- **Features:**
  - Core building blocks
  - API integrations
  - LangChain integration
  - Great learning resource

---

## 🔧 Advanced: Full Workflow with Ivanti Integration

### Complete Workflow Structure:

```
1. Webhook (Receive from Extension)
   ↓
2. Code Node: Parse & Validate Input
   ↓
3. HTTP Request: Get User Info (if needed)
   ↓
4. HTTP Request: Get Ticket Data (if ticketId provided)
   ↓
5. HTTP Request: Get Knowledge Base (optional)
   ↓
6. Code Node: Build AI Context
   ↓
7. AI Agent: Process with Context
   ↓
8. Code Node: Parse AI Response
   ↓
9. Respond to Webhook: Return Response
```

### Node-by-Node Setup:

#### Node 1: Webhook
- **Type:** Webhook
- **Method:** POST
- **Path:** `ivanti-ai`
- **Response Mode:** Last Node

#### Node 2: Parse Input (Code Node)
```javascript
// Extract data from webhook
const input = $input.item.json;

return {
  message: input.message,
  userId: input.userId,
  userLoginId: input.userLoginId,
  userFullName: input.userFullName,
  userRoles: input.userRoles || [],
  userTeams: input.userTeams || [],
  ticketId: input.ticketId || null,
  sessionId: input.sessionId,
  conversationHistory: input.conversationHistory || []
};
```

#### Node 3: Get Ticket Data (HTTP Request) - Conditional
- **Type:** HTTP Request
- **Method:** GET
- **URL:** `https://success.serviceitplus.com/HEAT/api/odata/businessobject/incidents?$filter=RecId eq '{{$json.ticketId}}'&$select=RecId,IncidentNumber,Subject,Status,Priority`
- **Authentication:** Use cookies from webhook
- **Condition:** Only run if `ticketId` is not null

#### Node 4: Build Context (Code Node)
```javascript
const webhookData = $('Webhook').item.json;
const ticketData = $('Get Ticket Data').item.json;

return {
  user: {
    name: webhookData.userFullName,
    roles: webhookData.userRoles,
    teams: webhookData.userTeams
  },
  ticket: ticketData?.value?.[0] || null,
  conversationHistory: webhookData.conversationHistory,
  message: webhookData.message
};
```

#### Node 5: AI Agent
- **Chat Model:** OpenAI Chat Model (or Gemini)
- **System Message:** (See Step 3 above)
- **Messages:** Use context from Node 4

#### Node 6: Parse Response (Code Node)
```javascript
const aiResponse = $input.item.json;

// Extract message from AI response
const message = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text 
  || aiResponse.choices?.[0]?.message?.content
  || aiResponse.message
  || 'No response';

return {
  message,
  actions: aiResponse.actions || [],
  thinkingSteps: aiResponse.thinkingSteps || []
};
```

#### Node 7: Respond to Webhook
- **Response Code:** 200
- **Response Body:** Use output from Node 6

---

## 🛠️ Using n8n AI Workflow Builder (2025 Feature)

n8n now has an **AI Workflow Builder** that can create workflows from natural language!

1. In n8n, click **"AI Workflow Builder"**
2. Describe your workflow:
   ```
   Create a webhook that receives messages from a Chrome extension,
   calls OpenAI to process the message with user context,
   and returns the AI response back to the extension.
   ```
3. n8n will generate the workflow automatically
4. Review and customize as needed

**Documentation:** [docs.n8n.io/advanced-ai/ai-workflow-builder](https://docs.n8n.io/advanced-ai/ai-workflow-builder)

---

## 📚 Additional Resources

### Official Documentation
- **n8n Docs:** [docs.n8n.io](https://docs.n8n.io/)
- **AI Tutorial:** [docs.n8n.io/advanced-ai/intro-tutorial](https://docs.n8n.io/advanced-ai/intro-tutorial/)
- **Webhook Guide:** [docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

### Video Tutorials
- **Build ANYTHING With n8n's NEW AI Workflow Builder:** [YouTube](https://www.youtube.com/watch?v=X4PUoZSPlw0)
- **n8n Tutorial for Beginners: Complete AI Automation Guide:** [YouTube](https://www.youtube.com/watch?v=CfD17vBCPEU)

### Community Templates
- **n8n Workflows:** [n8n.io/workflows](https://n8n.io/workflows)
- **n8n Templates:** [n8ntemplates.me](https://n8ntemplates.me)

---

## 🔐 Security Best Practices

1. **Secure Your Webhook:**
   - Add API key authentication
   - Use HTTPS only
   - Validate request origin
   - Implement rate limiting

2. **Protect API Keys:**
   - Store in n8n Credentials (encrypted)
   - Never expose in workflow code
   - Rotate keys regularly

3. **Validate Input:**
   - Check required fields
   - Sanitize user input
   - Validate data types

---

## 🎯 Next Steps

1. ✅ Set up n8n (Cloud or Self-hosted)
2. ✅ Get AI API key (OpenAI/Gemini/Anthropic)
3. ✅ Add credentials to n8n
4. ✅ Create basic webhook + AI workflow
5. ✅ Test with curl
6. ✅ Update extension config with webhook URL
7. ✅ Test end-to-end
8. 🔄 Add Ivanti API integration (optional)
9. 🔄 Add intent detection (Phase 2)
10. 🔄 Implement ReAct pattern (Phase 3)

---

## 🔑 Ivanti API Key Configuration

Your Ivanti API key has been integrated into the workflow template.

**API Key:** `78D033FDB3D14F0FB4C66261B4FAA3AF`

### Setup in n8n:

1. **Option 1: Environment Variable (Recommended)**
   - Go to **Settings** → **Environment Variables**
   - Add: `IVANTI_API_KEY` = `78D033FDB3D14F0FB4C66261B4FAA3AF`

2. **Option 2: Already in Template**
   - The workflow template includes the API key as fallback
   - It will work automatically if environment variable is not set

The API key is sent as `X-API-Key` header in all Ivanti API requests.

See `IVANTI_API_KEY_SETUP.md` for detailed instructions.

---

## 🆘 Troubleshooting

### Webhook not responding
- Check workflow is **Active**
- Verify webhook URL is correct
- Check n8n execution logs
- Test with curl first

### AI not responding
- Verify API key is correct
- Check API quota/limits
- Review AI node configuration
- Check system message format

### Ivanti API authentication fails
- Verify Ivanti API key is correct: `78D033FDB3D14F0FB4C66261B4FAA3AF`
- Check if API key has required permissions
- Ensure cookies are also being sent (dual authentication)
- Check Ivanti API logs for errors

### Extension can't connect
- Verify webhook URL in `config.ts`
- Check CORS settings (if self-hosted)
- Verify network connectivity
- Check browser console for errors

---

**Last Updated:** December 2025  
**Status:** ✅ Ready for Setup

