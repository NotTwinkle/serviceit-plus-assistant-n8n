# 🧠 Intelligent AI Routing System

## 🎯 Concept

**Smart Cost Optimization:** Route questions to the right AI model based on complexity.

```
User Question
    ↓
Complexity Analyzer (Ollama - Fast & Free)
    ↓
    ├─ Simple Question? → Ollama (Local, Fast, Free)
    └─ Complex Question? → Gemini with High Reasoning (Agentic, Powerful)
```

---

## 📊 Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Webhook Receives Message                                  │
│    - User question                                            │
│    - Context (user, ticket, history)                         │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Complexity Analyzer (Ollama)                             │
│    - Quick analysis: Simple or Complex?                     │
│    - Returns: { complexity: "simple" | "complex", score: 0-1 } │
│    - Fast & Free (local LLM)                                │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Router (Switch Node)                                      │
│    ├─ Simple? → Route to Ollama Path                        │
│    └─ Complex? → Route to Agentic Path                      │
└─────────────────────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌───────────────┐      ┌──────────────────────┐
│ 4a. Ollama    │      │ 4b. Agentic Gemini   │
│ (Simple Path) │      │ (Complex Path)        │
│               │      │                       │
│ - Fast        │      │ - High Reasoning      │
│ - Free        │      │ - Tool Access         │
│ - Local       │      │ - Ivanti API Calls    │
│ - Direct      │      │ - Multi-step          │
│   Response    │      │   Reasoning           │
└───────────────┘      └──────────────────────┘
        ↓                       ↓
        └───────────┬───────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Parse & Return Response                                  │
│    - Format response                                        │
│    - Return to extension                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Complexity Detection Strategy

### ✅ AI-Based Analysis (Current Implementation)

**We use Gemini AI to analyze question complexity** - No regex, no keyword matching!

**Why AI Analysis?**
- ✅ **Intelligent** - Understands context and nuance
- ✅ **Accurate** - Better than keyword matching
- ✅ **Adaptive** - Learns from question patterns
- ✅ **Context-aware** - Considers full question meaning

**How It Works:**
1. Question arrives → Send to Gemini for analysis
2. Gemini analyzes: "Is this simple or complex?"
3. Returns JSON: `{ complexity: "simple"|"complex", score: 0-1, reason: "..." }`
4. Route based on AI decision

**Gemini Analysis Prompt:**
```
Analyze this question and determine if it's SIMPLE or COMPLEX.

SIMPLE questions:
- Direct answers, single facts, status checks
- Simple lookups, basic information
- Yes/No questions, single-step queries

COMPLEX questions:
- Requires reasoning, analysis, or multi-step thinking
- Needs context from multiple sources
- Requires actions or recommendations

Question: "{user_message}"

Respond with JSON: {
  "complexity": "simple" or "complex",
  "score": 0.0 to 1.0,
  "reason": "brief explanation"
}
```

**Benefits:**
- 🧠 **Smart** - AI understands intent, not just keywords
- 🎯 **Accurate** - Better routing decisions
- 🔄 **Adaptive** - Handles edge cases naturally
- 📊 **Explainable** - Returns reason for decision

---

## 🛠️ Implementation Plan

### Step 1: Add Complexity Analyzer Node (AI-Based)

**Node:** Code Node → HTTP Request to Gemini

**Purpose:** Use AI to analyze question complexity (no regex!)

**Implementation:**

#### Node 1: Build Gemini Analysis Request
```javascript
// Build Gemini request for complexity analysis
const input = $input.item.json;
const message = input.message || '';

const prompt = `Analyze this question and determine if it's SIMPLE or COMPLEX.

SIMPLE questions:
- Direct answers, single facts, status checks
- Simple lookups, basic information
- Yes/No questions, single-step queries
- Examples: "What's the status?", "Who is assigned?", "Show me tickets"

COMPLEX questions:
- Requires reasoning, analysis, or multi-step thinking
- Needs context from multiple sources
- Requires actions or recommendations
- Examples: "Why is this happening?", "What should I do?", "Create and assign ticket"

Question: "${message}"

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "complexity": "simple" or "complex",
  "score": 0.0 to 1.0 (0.0 = very simple, 1.0 = very complex),
  "reason": "brief one-sentence explanation"
}`;

const geminiApiKey = $env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';
const model = 'gemini-2.0-flash-exp'; // Fast model for quick analysis

return {
  url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3, // Low temperature for consistent analysis
      maxOutputTokens: 150, // Short response
      responseMimeType: 'application/json' // Force JSON response
    }
  },
  originalInput: input // Keep original for later
};
```

#### Node 2: Call Gemini API
- HTTP Request node
- Uses the request from Node 1

#### Node 3: Parse Analysis Response
```javascript
// Parse Gemini JSON response
const geminiResponse = $input.item.json;
const originalInput = $('Complexity Analyzer').item.json.originalInput;

// Extract JSON from response
let analysis = null;
try {
  if (geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
    const responseText = geminiResponse.candidates[0].content.parts[0].text;
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    analysis = JSON.parse(jsonText);
  }
} catch (error) {
  // Fallback to simple if parsing fails
  analysis = { complexity: 'simple', score: 0.3, reason: 'Analysis failed' };
}

return {
  ...originalInput,
  complexity: analysis.complexity,
  complexityScore: analysis.score || 0.5,
  complexityReason: analysis.reason
};
```

---

### Step 2: Add Router Node

**Node:** Switch Node or IF Node

**Logic:**
- If `complexity === 'simple'` → Route to Ollama
- If `complexity === 'complex'` → Route to Agentic Gemini

---

### Step 3: Ollama Path (Simple Questions)

**Node:** HTTP Request to Ollama

**Configuration:**
```javascript
// Ollama API Call
POST http://localhost:11434/api/generate
{
  "model": "llama3.2", // or "mistral", "phi3" - fast models
  "prompt": `You are an AI assistant for Ivanti Service Manager.

User: ${context.userFullName}
Ticket: ${context.ticketId || 'None'}

Question: ${context.message}

Answer concisely:`,
  "stream": false,
  "options": {
    "temperature": 0.7,
    "max_tokens": 500
  }
}
```

**Benefits:**
- ✅ **Free** - No API costs
- ✅ **Fast** - Local processing
- ✅ **Private** - Data stays local
- ✅ **Perfect for simple Q&A**

---

### Step 4: Agentic Path (Complex Questions)

**Node:** Gemini with High Reasoning

**Configuration:**
```javascript
// Gemini API with high reasoning effort
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent
{
  "contents": [{
    "parts": [{
      "text": `You are an expert AI assistant for Ivanti Service Manager with agentic capabilities.

User: ${context.userFullName}
Roles: ${context.userRoles}
Ticket: ${context.ticketData}

This is a COMPLEX question requiring reasoning and potentially actions.

Question: ${context.message}

Think step-by-step. If you need data, indicate what to fetch.
If you need to take action, explain what action.`
    }]
  }],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 2000,
    "reasoningEffort": "high" // ← High reasoning for complex questions
  }
}
```

**Features:**
- ✅ **High Reasoning** - Deep analysis
- ✅ **Tool Access** - Can call Ivanti APIs
- ✅ **Multi-step** - Can reason through complex problems
- ✅ **Context-aware** - Uses all available data

---

## 📋 Complete Workflow Structure

```
1. Webhook (Receive Message)
   ↓
2. Parse Input
   ↓
3. Complexity Analyzer (Ollama - Fast Analysis)
   ├─ Analyze question
   └─ Return: { complexity, score, reason }
   ↓
4. Router (Switch Node)
   ├─ Simple? → Path A (Ollama)
   └─ Complex? → Path B (Agentic)
   ↓
   ├─ Path A: Ollama Response
   │   ├─ Call Ollama API
   │   ├─ Get direct answer
   │   └─ Format response
   │
   └─ Path B: Agentic Gemini
       ├─ Get Ticket Data (if needed)
       ├─ Get KB Articles (if needed)
       ├─ Build Context
       ├─ Call Gemini (High Reasoning)
       ├─ Parse Response
       └─ Format response
   ↓
5. Merge Responses
   ↓
6. Parse & Format
   ↓
7. Respond to Webhook
```

---

## 💰 Cost Optimization

### Simple Questions (80% of queries)
- **Ollama:** $0 (local)
- **Tokens:** ~100-300 tokens
- **Time:** < 1 second
- **Savings:** 100% vs paid API

### Complex Questions (20% of queries)
- **Gemini:** ~$0.001-0.01 per query (with free tier)
- **Tokens:** ~500-2000 tokens
- **Time:** 2-5 seconds
- **High Reasoning:** Worth the cost for complex tasks

### Estimated Savings
- **Before:** All questions → Gemini = $0.01-0.05 per query
- **After:** 80% Ollama (free) + 20% Gemini = $0.002-0.01 per query
- **Savings:** 60-80% cost reduction! 🎉

---

## 🚀 Setup Instructions

### 1. Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download
```

### 2. Pull a Fast Model

```bash
# Fast, small models (good for complexity analysis)
ollama pull llama3.2
ollama pull phi3
ollama pull mistral

# For simple Q&A
ollama pull llama3.2  # Best balance
```

### 3. Test Ollama

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Hello, test",
  "stream": false
}'
```

### 4. Update n8n Workflow

Add the routing nodes as described above.

---

## 🎯 Complexity Detection Examples

### Simple Questions → Ollama
- "What's the status of ticket INC-123?"
- "Who is assigned to this ticket?"
- "When was this created?"
- "Show me my open tickets"
- "Is the printer fixed?"

### Complex Questions → Agentic Gemini
- "Why is this ticket taking so long? What should I do?"
- "Create a service request for account unlock and assign it to IT team"
- "Analyze all tickets from last week and tell me the trends"
- "Based on the ticket history, what's the best approach to resolve this?"
- "Update the ticket, notify the user, and create a follow-up task"

---

## 🔧 Advanced: Adaptive Routing

### Score-Based Routing
```javascript
if (score < 0.3) → Ollama (very simple)
if (score 0.3-0.7) → Gemini Standard (medium)
if (score > 0.7) → Gemini High Reasoning (complex)
```

### Context-Aware Routing
```javascript
// If ticket data needed → Always use Agentic
if (ticketId && requiresData) → Agentic

// If just status check → Ollama
if (isStatusCheck) → Ollama
```

---

## 📊 Monitoring & Optimization

### Track Metrics
- **Routing accuracy:** % correct routing decisions
- **Cost per query:** Average cost
- **Response time:** Ollama vs Gemini
- **User satisfaction:** Simple vs complex answers

### Optimize Over Time
- Adjust complexity thresholds
- Fine-tune keyword lists
- Improve Ollama prompts
- Balance cost vs quality

---

## ✅ Benefits

1. **Cost Savings:** 60-80% reduction in API costs
2. **Speed:** Simple questions answered instantly (local)
3. **Quality:** Complex questions get proper reasoning
4. **Scalability:** Ollama handles high volume for free
5. **Privacy:** Simple queries stay local
6. **Flexibility:** Easy to adjust routing logic

---

## 🎓 Next Steps

1. ✅ Set up Ollama locally
2. ✅ Add complexity analyzer to workflow
3. ✅ Add router node
4. ✅ Configure Ollama path
5. ✅ Configure Agentic path
6. ✅ Test with sample questions
7. ✅ Monitor and optimize

---

**Last Updated:** December 2025  
**Status:** Ready for Implementation

