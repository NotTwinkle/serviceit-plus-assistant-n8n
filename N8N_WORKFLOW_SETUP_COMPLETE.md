# 🎯 n8n Workflow Setup - Complete Configuration Guide

## ✅ What's Been Configured

Your workflow JSON has been updated with all necessary configurations:

### 1. **Switch Node (Route by Complexity)** ✅
- **Configured** to route based on `complexity` field
- **Output 0 (simple)**: Routes to Ollama path
- **Output 1 (complex)**: Routes to Gemini Agent path

### 2. **Ollama Node (Simple Path)** ✅
- **Model**: `llama3.2` (updated from `llama3:latest`)
- **Messages**: Configured with system prompt + user context
- **Temperature**: 0.7

### 3. **AI Agent Node (Complex Path)** ✅
- **Agent Type**: `zeroShotReact` (ReAct pattern)
- **System Message**: Uses `agentPrompt` from "Build Complex Agent Prompt"
- **Max Iterations**: 5
- **Return Intermediate Steps**: Enabled (for thinkingSteps)

### 4. **Google Gemini Chat Model** ✅
- **Model**: `gemini-2.0-flash-exp`
- **Temperature**: 0.7
- **Max Output Tokens**: 2000
- **Connected** to AI Agent as Language Model

### 5. **Redis Chat Memory** ✅
- **Type**: Buffer Window Memory
- **Session ID**: Uses `sessionId` from input (or 'default-session')
- **Window Size**: 10 messages
- **Connected** to AI Agent as Memory input

### 6. **Redis Vector Store (KB)** ✅
- **Index**: `ivanti-knowledge`
- **Top K**: 5 results
- **Query**: Uses `message` field
- **Connected** to AI Agent as Tool input

### 7. **Ivanti API Tool (get_ticket)** ✅
- **Name**: `get_ticket`
- **Base URL**: `https://success.serviceitplus.com`
- **Path**: `/HEAT/api/rest/incident`
- **Method**: GET
- **Headers**: 
  - `Authorization: rest_api_key=78D033FDB3D14F0FB4C66261B4FAA3AF`
  - `Cookie: {{$json.cookies}}`
- **Query Param**: `RecId={{$json.ticketId}}`
- **Connected** to AI Agent as Tool input

---

## 🔧 What You Need to Do Next

### Step 1: Configure Redis Credentials

In n8n, you need to set up Redis credentials:

1. Go to **Credentials** → **Add Credential**
2. Search for **Redis**
3. Configure:
   - **Host**: Your Redis host (e.g., `localhost` or `redis.example.com`)
   - **Port**: `6379` (default)
   - **Password**: (if required)
   - **Database**: `0` (default)

4. **Update the workflow JSON**:
   - Find `"redis-vector-store-node-id"` node
   - Update `"credentials": { "redis": { "id": "your-redis-credential-id" } }`
   - Replace `"your-redis-credential-id"` with your actual Redis credential ID from n8n

### Step 2: Set Up Redis Vector Store Index

Before using the workflow, create the Redis vector index:

```bash
# Connect to Redis
redis-cli

# Create vector index for knowledge base
FT.CREATE ivanti-knowledge ON HASH PREFIX 1 kb: SCHEMA \
  content TEXT \
  embedding VECTOR FLAT 6 DIM 1536 TYPE FLOAT32 DISTANCE_METRIC COSINE
```

Or use RedisInsight/Redis GUI to create the index.

### Step 3: Populate Redis Vector Store

Add knowledge base entries to Redis:

```bash
# Example: Add a KB entry
HSET kb:entry1 content "How to reset password in Ivanti" embedding "[0.1,0.2,...]"
```

Or use n8n to populate it from closed tickets (future enhancement).

### Step 4: Test the Workflow

1. **Activate** the workflow in n8n
2. **Copy** the webhook URL (e.g., `https://your-n8n.com/webhook/ivanti-ai`)
3. **Update** your Chrome extension config:
   - Set `VITE_N8N_WEBHOOK_URL` in `.env.local`
4. **Test** with a simple question: "What's the status?"
5. **Test** with a complex question: "Why is this ticket delayed? What should I do?"

---

## 📋 Node Connections Summary

```
Webhook → Parse Input → Build Complexity Prompt → Complex Handler (Gemini)
                                                          ↓
                                    Parse Complexity Result
                                                          ↓
                                    Route by Complexity (Switch)
                                    ├─ simple → Message a model (Ollama) → Format Simple Response
                                    └─ complex → Build Complex Agent Prompt → AI Agent → Format Complex Response
                                                                                    ↑
                                    ┌───────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
        Google Gemini Chat Model   Redis Chat Memory   Redis Vector Store (KB)
                                                      Ivanti API Tool (get_ticket)
```

---

## 🐛 Troubleshooting

### Issue: "Redis credential not found"
- **Solution**: Create Redis credential in n8n and update the workflow JSON

### Issue: "Vector index not found"
- **Solution**: Create `ivanti-knowledge` index in Redis (see Step 2 above)

### Issue: "Ollama connection failed"
- **Solution**: Ensure Ollama is running: `ollama serve`
- **Check**: Model exists: `ollama list` (should show `llama3.2`)

### Issue: "Switch node not routing correctly"
- **Solution**: Check that `complexity` field is exactly `"simple"` or `"complex"` (lowercase)

### Issue: "AI Agent not using tools"
- **Solution**: Verify tool nodes are connected to AI Agent's `ai_tool` inputs
- **Check**: Tools appear in AI Agent node's tool list in n8n UI

---

## 📚 References

- [n8n AI Agent Documentation](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)
- [Redis Vector Store Setup](https://redis.io/docs/interact/search-and-query/indexing/)
- [Ivanti REST API Documentation](https://help.ivanti.com/ht/help/en_US/ISM/2020/admin/Content/Configure/API/REST_API_Overview.htm)

---

**Last Updated**: January 2025  
**Status**: ✅ Ready for Testing (after Redis setup)

