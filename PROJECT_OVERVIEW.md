# 🎯 Project Overview: Ivanti AI Assistant

## What We're Building

We're building an **advanced AI-powered assistant** for **Ivanti Service Manager** that runs as a **Chrome Browser Extension**. This assistant helps users interact with Ivanti more efficiently using natural language conversations.

---

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Browser Extension (Frontend)                        │
│  - React-based chat interface                               │
│  - Injects into Ivanti pages                                │
│  - Extracts user context, tickets, cookies                   │
└─────────────────────────────────────────────────────────────┘
                    ↓ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│  n8n Workflow Engine (Backend)                              │
│  - Intelligent routing system                               │
│  - Complexity analysis                                       │
│  - AI model selection                                        │
│  - Ivanti API integration                                   │
└─────────────────────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌───────────────┐      ┌──────────────────────┐
│  Ollama       │      │  Google Gemini       │
│  (Local LLM)  │      │  (Cloud AI)          │
│               │      │                       │
│  - Simple Q&A │      │  - Complex reasoning  │
│  - Fast       │      │  - High reasoning    │
│  - Free       │      │  - Agentic actions   │
└───────────────┘      └──────────────────────┘
        ↓                       ↓
        └───────────┬───────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  Ivanti Service Manager                                      │
│  - Ticket management                                         │
│  - Service requests                                          │
│  - Knowledge base                                            │
│  - User management                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Goals

### 1. **Intelligent Question Routing**
- Analyze user questions to determine complexity
- Route simple questions to fast, local AI (Ollama)
- Route complex questions to powerful cloud AI (Gemini)
- Optimize cost and response time

### 2. **Context-Aware Assistance**
- Understand current user context (who they are, what they're viewing)
- Access ticket information automatically
- Use conversation history for better responses
- Respect user roles and permissions

### 3. **Ivanti Integration**
- Authenticate using user's browser session cookies
- Access Ivanti REST APIs and OData endpoints
- Fetch ticket data, knowledge base articles, user info
- Perform actions (create tickets, update status, etc.)

### 4. **Cost Optimization**
- Use free local AI (Ollama) for 80% of simple questions
- Use cloud AI (Gemini) only for complex reasoning
- Reduce API costs by 60-80%
- Maintain high quality responses

### 5. **Advanced AI Capabilities**
- **Agentic AI** for complex tasks (reasoning, analysis, actions)
- **Multi-step reasoning** for problem-solving
- **Tool access** to Ivanti APIs
- **Self-healing** capabilities (future)

---

## 🔑 Key Features

### User Experience
- ✅ **Natural Language Interface** - Chat with Ivanti using plain English
- ✅ **Context-Aware** - Knows what ticket you're viewing
- ✅ **Smart Routing** - Fast answers for simple questions, deep analysis for complex ones
- ✅ **Conversation History** - Remembers previous messages
- ✅ **Theme Customization** - Users can customize appearance

### Technical Features
- ✅ **Session Management** - Tracks user sessions across browser restarts
- ✅ **Logout Detection** - Automatically cleans up on logout
- ✅ **Cookie-Based Auth** - Uses browser cookies (no credential storage)
- ✅ **Intelligent Routing** - AI analyzes question complexity
- ✅ **Dual AI System** - Ollama + Gemini working together

### Ivanti Integration
- ✅ **Ticket Context** - Automatically extracts ticket info from URL
- ✅ **User Identification** - Multi-strategy user detection
- ✅ **API Access** - Calls Ivanti REST and OData APIs
- ✅ **Knowledge Base** - Can search and reference KB articles
- ✅ **Role Awareness** - Understands user permissions

---

## 🧠 AI Routing System

### How It Works

1. **User asks a question** in the chat widget
2. **Complexity Analyzer** (Gemini AI) analyzes the question
3. **Router** decides which AI to use:
   - **Simple** → Ollama (local, fast, free)
   - **Complex** → Gemini (cloud, powerful, reasoning)

### Simple Questions (→ Ollama)
- "What's the status of ticket INC-123?"
- "Who is assigned to this ticket?"
- "Show me my open tickets"
- "When was this created?"

**Characteristics:**
- Direct factual answers
- Single data point lookup
- No reasoning needed
- Fast response (< 1 second)

### Complex Questions (→ Gemini High Reasoning)
- "Why is this ticket taking so long? What should I do?"
- "Based on the ticket history, what's the best approach?"
- "Create a service request for account unlock and assign it to IT"
- "Analyze all tickets from last week and recommend improvements"

**Characteristics:**
- Requires reasoning and analysis
- Multi-step thinking
- Needs recommendations
- Context-dependent answers
- May require actions

---

## 🔐 Authentication & Security

### How Authentication Works

1. **User logs into Ivanti** → Browser stores session cookies
2. **Extension extracts cookies** → Reads cookies from Ivanti domain
3. **Extension sends cookies to n8n** → Includes in webhook payload
4. **n8n uses cookies** → Authenticates with Ivanti APIs
5. **Ivanti validates** → Returns data based on user permissions

### Security Features
- ✅ **No credential storage** - Uses temporary session cookies
- ✅ **User-specific access** - Only sees what user can see
- ✅ **Automatic cleanup** - Clears data on logout
- ✅ **Permission-aware** - Respects Ivanti role permissions
- ✅ **HTTPS only** - All communications encrypted

---

## 📊 Data Flow

### Example: Simple Question

```
User: "What's the status of ticket INC-123?"
    ↓
Extension → Extracts ticket ID from URL
    ↓
Extension → Sends to n8n webhook (with cookies, context)
    ↓
n8n → Complexity Analyzer (Gemini)
    ↓
Gemini: "This is SIMPLE (score: 0.2)"
    ↓
Router → Routes to Ollama
    ↓
Ollama → "The ticket INC-123 is currently In Progress"
    ↓
n8n → Returns to Extension
    ↓
User sees answer in chat widget
```

### Example: Complex Question

```
User: "Why is ticket INC-123 taking so long? What should I do?"
    ↓
Extension → Sends to n8n webhook
    ↓
n8n → Complexity Analyzer (Gemini)
    ↓
Gemini: "This is COMPLEX (score: 0.9)"
    ↓
Router → Routes to Gemini (High Reasoning)
    ↓
n8n → Fetches ticket data from Ivanti API (using cookies)
    ↓
Gemini → Analyzes ticket history, status, assignments
    ↓
Gemini → "Based on the ticket data, it's been waiting for IT team response. 
          I recommend: 1) Escalate to IT manager, 2) Add priority note, 
          3) Set follow-up reminder"
    ↓
n8n → Returns detailed analysis
    ↓
User sees comprehensive answer with recommendations
```

---

## 🛠️ Technology Stack

### Frontend (Chrome Extension)
- **React** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Chrome Extension APIs** - Browser integration

### Backend (n8n Workflows)
- **n8n** - Workflow automation platform
- **Google Gemini** - Cloud AI (complex questions, analysis)
- **Ollama** - Local AI (simple questions)
- **HTTP Requests** - Ivanti API integration

### Integration
- **Ivanti Service Manager** - ITSM platform
- **REST APIs** - User data, tickets
- **OData APIs** - Business objects, queries
- **Session Cookies** - Authentication

---

## 🎯 Use Cases

### 1. Quick Status Checks
**User:** "What's the status?"
**System:** Routes to Ollama → Fast answer → "Ticket INC-123 is In Progress"

### 2. Ticket Analysis
**User:** "Why is this ticket taking so long?"
**System:** Routes to Gemini → Fetches ticket data → Analyzes → "The ticket has been waiting for IT team response for 3 days. I recommend escalating..."

### 3. Action Requests
**User:** "Create a service request for account unlock"
**System:** Routes to Gemini → Analyzes request → Calls Ivanti API → Creates SR → Confirms

### 4. Knowledge Base Queries
**User:** "How do I reset a password?"
**System:** Routes to Gemini → Searches KB → Returns article → "According to KB article #123..."

### 5. Multi-Step Tasks
**User:** "Update ticket INC-123, change priority to High, and notify the user"
**System:** Routes to Gemini → Plans steps → Executes actions → Confirms completion

---

## 🚀 Future Vision

### Phase 1: Basic AI Backend ✅
- Webhook routing
- Basic AI responses
- User identification
- Session management

### Phase 2: Intelligent Routing ✅ (Current)
- Complexity analysis
- Ollama + Gemini routing
- Cost optimization

### Phase 3: Agentic AI (Planned)
- ReAct pattern (Reasoning + Acting)
- Tool system for Ivanti APIs
- Multi-step reasoning
- Autonomous actions

### Phase 4: Self-Healing (Planned)
- Automatic issue detection
- Self-remediation
- Health monitoring
- Proactive assistance

### Phase 5: Advanced Features (Planned)
- Role-based actions
- Workflow automation
- Predictive analytics
- Custom integrations

---

## 📈 Success Metrics

### Performance
- ✅ **Response Time:** < 1 second for simple questions
- ✅ **Cost Reduction:** 60-80% savings vs all-cloud AI
- ✅ **Accuracy:** > 95% correct routing decisions
- ✅ **User Satisfaction:** Fast, accurate responses

### Technical
- ✅ **Uptime:** 99.9% availability
- ✅ **Error Rate:** < 1% failed requests
- ✅ **Scalability:** Handles 1000+ requests/hour
- ✅ **Security:** Zero credential leaks

---

## 🎓 Key Concepts

### Intelligent Routing
- **Why:** Optimize cost and speed
- **How:** AI analyzes question complexity
- **Result:** Right AI for right question

### Context Awareness
- **What:** Knows user, ticket, history
- **How:** Extracts from browser, URL, cookies
- **Benefit:** More relevant, personalized answers

### Agentic AI
- **What:** AI that can reason and act
- **How:** ReAct pattern + tool access
- **Benefit:** Can solve complex problems autonomously

### Cost Optimization
- **Strategy:** Use free local AI for simple questions
- **Impact:** 60-80% cost reduction
- **Trade-off:** Slightly slower for complex questions (acceptable)

---

## 📚 Related Documentation

- `README.md` - Setup and installation
- `PROJECT_VISION_AND_AGENTIC_AI.md` - Long-term vision
- `INTELLIGENT_ROUTING_SYSTEM.md` - Routing system details
- `N8N_SETUP_GUIDE.md` - n8n configuration
- `OLLAMA_SETUP.md` - Local AI setup
- `COMPLEXITY_ANALYZER_PROMPT.md` - AI prompt for complexity analysis

---

**Project Status:** ✅ Active Development  
**Version:** 2.0.0  
**Last Updated:** December 2025

