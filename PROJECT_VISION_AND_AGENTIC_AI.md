# Project Vision: Agentic AI Backend in n8n

## 🎯 Project Goal

**Build an intelligent, agentic AI assistant for Ivanti Service Manager that can autonomously perform actions, make decisions, and self-heal - all orchestrated through n8n workflows.**

### Core Vision

Transform the Chrome Extension from a simple AI chat interface into a **fully autonomous agentic system** that:

1. **Understands Context**: Knows who the user is, what they're viewing, and what they can do
2. **Acts Autonomously**: Can perform actions in Ivanti without constant user confirmation
3. **Self-Heals**: Detects issues and automatically remediates them
4. **Learns & Adapts**: Improves over time based on user interactions and system feedback
5. **Role-Aware**: Understands user permissions and acts accordingly

---

## 🏗️ Architecture: n8n as AI Backend

### Why n8n?

**n8n provides the perfect platform for building agentic AI because:**

1. **Workflow Orchestration**: Complex multi-step agentic flows are natural in n8n
2. **Tool Integration**: Easy integration with Ivanti APIs, AI providers, and external services
3. **Self-Healing**: n8n workflows can monitor, detect issues, and trigger remediation
4. **Visual Development**: Build complex agentic logic without writing extensive code
5. **Scalability**: Handle multiple users and conversations concurrently
6. **Extensibility**: Add new tools and capabilities easily

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (Frontend)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Content Script (React UI)                                │  │
│  │  - ChatWidget                                             │  │
│  │  - User identification                                    │  │
│  │  - Session management                                     │  │
│  │  - Context extraction (ticket RecId)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           │ HTTP POST                             │
│                           ▼                                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Webhook
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    n8n Workflow Engine                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AGENTIC AI WORKFLOW                                      │  │
│  │                                                           │  │
│  │  1. Receive Message                                       │  │
│  │  2. Analyze Intent (AI)                                  │  │
│  │  3. Gather Context (Ivanti APIs)                          │  │
│  │  4. Think & Plan (ReAct Pattern)                          │  │
│  │  5. Execute Tools (Ivanti Actions)                        │  │
│  │  6. Validate Results                                      │  │
│  │  7. Respond or Ask for More Info                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SELF-HEALING WORKFLOW                                    │  │
│  │  - Monitor system health                                  │  │
│  │  - Detect issues (memory, performance, errors)           │  │
│  │  - Automatically remediate                                │  │
│  │  - Report status                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  TOOL INTEGRATIONS                                         │  │
│  │  - Ivanti REST API                                        │  │
│  │  - Ivanti OData API                                       │  │
│  │  - Knowledge Base Search                                  │  │
│  │  - Documentation Lookup                                   │  │
│  │  - User Role/Permission Checks                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  - Ivanti Service Manager (success.serviceitplus.com)           │
│  - AI Providers (Gemini, OpenAI, Anthropic, etc.)                │
│  - Knowledge Base Systems                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🤖 Agentic AI Concept

### What is Agentic AI?

**Agentic AI** is AI that can:
- **Think** through problems step-by-step
- **Act** by calling tools and APIs
- **Observe** the results of actions
- **Reason** about what to do next
- **Decide** autonomously (within constraints)
- **Self-Correct** when things go wrong

### ReAct Pattern (Reasoning + Acting)

The **ReAct pattern** is the foundation of agentic AI:

```
1. THINK: "What do I need to do?"
   - Analyze user request
   - Identify required information
   - Plan steps

2. ACT: "Let me gather information"
   - Call Ivanti API to get ticket data
   - Search knowledge base
   - Check user permissions

3. OBSERVE: "What did I learn?"
   - Process API responses
   - Extract relevant facts
   - Identify missing information

4. THINK: "What should I do next?"
   - Reason about gathered data
   - Decide if more information is needed
   - Plan next actions

5. ACT: "Let me perform the action"
   - Create service request
   - Update ticket
   - Execute remediation

6. VALIDATE: "Did it work?"
   - Check results
   - Verify success
   - Handle errors

7. RESPOND: "Here's what I did"
   - Explain actions taken
   - Report results
   - Ask for confirmation if needed
```

### Anti-Hallucination Mechanism

**Critical Feature**: Agentic AI must **never hallucinate** (make up facts).

**How we prevent hallucinations:**

1. **Tool-Grounded Facts**: All facts come from tool calls (Ivanti APIs, KB, etc.)
2. **Validation**: Every fact is validated against source data
3. **Explicit Reasoning**: AI must show its reasoning process
4. **Error Handling**: If tools fail, AI acknowledges uncertainty
5. **No Assumptions**: AI never assumes facts it doesn't have

---

## ✅ Can We Build This in n8n?

### **YES - Absolutely!**

n8n is **perfectly suited** for building agentic AI because:

### 1. **Workflow = Agent Logic**

Each n8n workflow can represent an agent's decision tree:

```
Webhook → Intent Detection → Route to Agent → Execute Tools → Validate → Respond
```

### 2. **Tools = n8n Nodes**

Every tool the agent needs is a n8n node:
- **HTTP Request Node**: Call Ivanti APIs
- **Code Node**: Process data, make decisions
- **Switch Node**: Route based on conditions
- **Loop Node**: Iterate through steps
- **Function Node**: Complex logic

### 3. **State Management = n8n Variables**

n8n can maintain state across workflow executions:
- **Workflow Variables**: Store agent context
- **Database Nodes**: Persistent memory
- **Redis Nodes**: Fast caching

### 4. **Self-Healing = Monitoring Workflows**

n8n can run background workflows that:
- Monitor system health
- Detect issues
- Trigger remediation
- Report status

### 5. **Multi-Agent System = Multiple Workflows**

Different agents for different tasks:
- **Service Request Agent**: Creates service requests
- **Incident Agent**: Manages incidents
- **Self-Healing Agent**: Monitors and fixes issues
- **Knowledge Agent**: Searches KB and docs

---

## 🚀 Implementation Strategy

### Phase 1: Basic AI Backend (Current State)

**Status**: ✅ **Extracted and Ready**

- Chrome Extension sends messages to n8n webhook
- n8n receives message, calls AI, returns response
- Basic conversation flow working

**Files Ready:**
- `src/background/index.ts` - Sends to n8n
- `src/background/services/sessionManager.ts` - Session management
- `src/background/services/userIdentity.ts` - User identification
- `src/background/services/conversationManager.ts` - History management

---

### Phase 2: Intent Detection & Routing

**Goal**: Detect user intent and route to appropriate agent

**n8n Workflow Structure:**

```
1. Webhook (Receive Message)
   ↓
2. Code Node: Analyze Intent
   - Extract keywords
   - Classify intent (create, update, search, etc.)
   ↓
3. Switch Node: Route by Intent
   ├─ CREATE_SERVICE_REQUEST → Service Request Agent
   ├─ UPDATE_TICKET → Incident Agent
   ├─ SEARCH_USER → Search Agent
   ├─ SELF_HEAL → Self-Healing Agent
   └─ GENERAL_QUERY → General AI Agent
```

**Implementation:**
- Use AI to classify intent (or keyword matching for speed)
- Route to specialized workflows
- Each workflow is a specialized agent

---

### Phase 3: ReAct Pattern Implementation

**Goal**: Implement thinking → acting → observing loop

**n8n Workflow Structure:**

```
1. Receive Message & Context
   ↓
2. Code Node: Build Initial Plan
   - What information do I need?
   - What tools should I call?
   - What's the sequence?
   ↓
3. Loop Node: ReAct Loop
   ├─ THINK: Analyze current state
   ├─ ACT: Call tool (HTTP Request to Ivanti)
   ├─ OBSERVE: Process response
   ├─ REASON: Decide next step
   └─ Repeat until complete or error
   ↓
4. Code Node: Validate Results
   - Check all required data collected
   - Verify no errors
   - Ensure facts are grounded
   ↓
5. Generate Response
   - Format response with facts
   - Include reasoning steps
   - Ask for missing info if needed
```

**Key n8n Nodes:**
- **Code Node**: Thinking logic, reasoning
- **HTTP Request Node**: Tool calls (Ivanti APIs)
- **Switch Node**: Conditional logic
- **Loop Node**: Iterative ReAct cycles
- **Function Node**: Complex validation

---

### Phase 4: Tool System

**Goal**: Create reusable tools for agents

**Tool Categories:**

#### 1. **Ivanti Data Tools**
- `getTicket(recId)` - Get ticket details
- `searchUsers(query)` - Search employees
- `getRequestOfferings()` - Get service catalog
- `getFieldset(subscriptionId)` - Get form fields
- `createServiceRequest(data)` - Create SR
- `updateTicket(recId, data)` - Update ticket

#### 2. **Knowledge Tools**
- `searchKnowledgeBase(query)` - Search KB articles
- `getDocumentation(topic)` - Get Ivanti docs
- `getBestPractices(category)` - Get best practices

#### 3. **Permission Tools**
- `checkUserPermission(userId, action)` - Check if user can do action
- `getUserRoles(userId)` - Get user roles
- `validateFieldValue(field, value)` - Validate form field

**Implementation in n8n:**
- Create **sub-workflows** for each tool
- Call sub-workflows from main agent workflow
- Reuse across different agents

---

### Phase 5: Service Request Agent

**Goal**: Fully autonomous service request creation

**Agent Flow:**

```
1. User: "Create account unlock request"
   ↓
2. Agent THINKS: "I need to:
   - Find 'Account Unlock' offering
   - Get its form fields
   - Auto-fill user info
   - Ask for missing required fields"
   ↓
3. Agent ACTS:
   - Calls: getRequestOfferings()
   - Calls: getFieldset(subscriptionId)
   - Calls: getUserProfile(userId)
   ↓
4. Agent OBSERVES:
   - Found offering: "Account Unlock"
   - Form has 5 fields, 2 required
   - User profile has: name, email, department
   ↓
5. Agent THINKS:
   - Can auto-fill: name, email, department
   - Need to ask: reason, urgency
   ↓
6. Agent ACTS:
   - Auto-fills what it can
   - Asks user: "What's the reason for unlock?"
   ↓
7. User: "Forgot password"
   ↓
8. Agent ACTS:
   - Fills reason field
   - Checks if all required fields filled
   - If yes: Creates service request
   - If no: Asks for remaining fields
   ↓
9. Agent VALIDATES:
   - Verifies SR created successfully
   - Gets SR number
   ↓
10. Agent RESPONDS:
    - "✅ Created Service Request #SR-12345"
    - Shows summary
```

**n8n Implementation:**

```
Webhook
  ↓
Code: Parse Intent (Service Request Creation)
  ↓
HTTP Request: Get Request Offerings
  ↓
Code: Match Offering Name
  ↓
HTTP Request: Get Fieldset
  ↓
Code: Analyze Fields (required vs optional)
  ↓
HTTP Request: Get User Profile
  ↓
Code: Auto-fill Fields
  ↓
Switch: All Required Fields Filled?
  ├─ YES → HTTP Request: Create Service Request
  │         ↓
  │         Code: Validate Creation
  │         ↓
  │         Respond: Success
  └─ NO → Respond: Ask for Missing Fields
```

---

### Phase 6: Self-Healing Agent

**Goal**: Automatically detect and fix issues

**Self-Healing Scenarios:**

#### Scenario 1: High Memory Usage
```
1. Monitor Node: Check system memory
   ↓
2. Code: If memory > 80%
   ↓
3. HTTP Request: Call cleanup workflow
   ↓
4. Code: Verify memory reduced
   ↓
5. Notify: Report remediation
```

#### Scenario 2: API Rate Limiting
```
1. HTTP Request: Call Ivanti API
   ↓
2. Code: If 429 (Rate Limit)
   ↓
3. Wait Node: Wait 60 seconds
   ↓
4. HTTP Request: Retry with backoff
   ↓
5. Code: Log retry attempt
```

#### Scenario 3: Failed Workflow
```
1. Error Trigger: Catch workflow errors
   ↓
2. Code: Analyze error type
   ↓
3. Switch: Route by error type
   ├─ API_ERROR → Retry with backoff
   ├─ AUTH_ERROR → Refresh credentials
   └─ DATA_ERROR → Validate and fix data
   ↓
4. Code: Attempt remediation
   ↓
5. Notify: Report success/failure
```

**n8n Implementation:**

Create a **monitoring workflow** that runs on a schedule:
- Checks system health every 5 minutes
- Monitors workflow execution logs
- Detects patterns (errors, slowness, etc.)
- Triggers remediation workflows
- Reports status

---

### Phase 7: Role-Aware Agent

**Goal**: Agent understands user permissions and acts accordingly

**Implementation:**

```
1. Code: Get User Roles
   ↓
2. Code: Map Roles to Permissions
   - Admin: Can do everything
   - Service Desk: Can create/update tickets
   - Self Service: Can only create requests
   ↓
3. Code: Check if Action Allowed
   ↓
4. Switch: Action Allowed?
   ├─ YES → Proceed with action
   └─ NO → Respond: "You don't have permission"
```

**Permission Matrix:**

| Role | Create SR | Update Ticket | Delete Ticket | View All Tickets |
|------|-----------|---------------|---------------|------------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Service Desk | ✅ | ✅ | ❌ | ✅ |
| Self Service | ✅ | ❌ | ❌ | ❌ (own only) |

---

## 📋 n8n Workflow Examples

### Example 1: Basic Agentic Flow

```json
{
  "name": "Agentic AI Assistant",
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
      "name": "Analyze Intent",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Analyze user message to determine intent\nconst message = $input.item.json.message.toLowerCase();\n\nlet intent = 'GENERAL';\nif (message.includes('create') && message.includes('request')) {\n  intent = 'CREATE_SERVICE_REQUEST';\n} else if (message.includes('update') || message.includes('change')) {\n  intent = 'UPDATE_TICKET';\n} else if (message.includes('find') || message.includes('search')) {\n  intent = 'SEARCH';\n}\n\nreturn { intent, ...$input.item.json };"
      }
    },
    {
      "name": "Route by Intent",
      "type": "n8n-nodes-base.switch",
      "parameters": {
        "rules": {
          "values": [
            {
              "value": "CREATE_SERVICE_REQUEST",
              "operation": "equals"
            },
            {
              "value": "UPDATE_TICKET",
              "operation": "equals"
            },
            {
              "value": "SEARCH",
              "operation": "equals"
            }
          ]
        },
        "dataPropertyName": "intent"
      }
    },
    {
      "name": "Service Request Agent",
      "type": "n8n-nodes-base.subworkflow",
      "parameters": {
        "workflowId": "service-request-agent"
      }
    },
    {
      "name": "Call AI",
      "type": "n8n-nodes-base.openAi",
      "parameters": {
        "operation": "complete",
        "model": "gpt-4",
        "systemPrompt": "You are an agentic AI assistant for Ivanti. Use only facts from tool calls. Never hallucinate."
      }
    },
    {
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "parameters": {}
    }
  ]
}
```

### Example 2: ReAct Loop Implementation

```javascript
// Code Node: ReAct Loop Controller
const maxIterations = 5;
let iteration = 0;
let context = {
  facts: {},
  missingInfo: [],
  actions: []
};

while (iteration < maxIterations) {
  // THINK: Analyze what we need
  const needs = analyzeNeeds(context, $input.item.json.message);
  
  if (needs.length === 0) {
    break; // We have everything we need
  }
  
  // ACT: Call tool for first need
  const toolResult = await callTool(needs[0]);
  
  // OBSERVE: Process result
  context.facts[needs[0]] = toolResult;
  
  iteration++;
}

// Generate response from context
return {
  message: generateResponse(context),
  thinkingSteps: context.actions,
  facts: context.facts
};
```

---

## 🎯 Success Criteria

### Agentic AI is Working When:

1. ✅ **Autonomous Actions**: Agent can create service requests without step-by-step guidance
2. ✅ **Tool Grounding**: All facts come from tool calls, no hallucinations
3. ✅ **Self-Correction**: Agent detects errors and retries/fixes automatically
4. ✅ **Context Awareness**: Agent remembers conversation and user context
5. ✅ **Role Compliance**: Agent respects user permissions
6. ✅ **Self-Healing**: System detects and fixes issues automatically

---

## 🚧 Challenges & Solutions

### Challenge 1: State Management Across Workflow Executions

**Problem**: n8n workflows are stateless by default.

**Solution**:
- Use **n8n Database** node for persistent state
- Use **Redis** node for fast caching
- Store conversation context in database
- Pass context in webhook payload

### Challenge 2: Complex ReAct Loops

**Problem**: ReAct pattern requires iterative loops.

**Solution**:
- Use **Loop Over Items** node
- Use **Code Node** with while loops
- Use **Sub-workflows** for each iteration
- Set maximum iterations to prevent infinite loops

### Challenge 3: Tool Error Handling

**Problem**: Tools can fail, need graceful handling.

**Solution**:
- Use **Error Trigger** node
- Implement retry logic with backoff
- Validate all tool responses
- Fallback to alternative tools

### Challenge 4: AI Hallucination Prevention

**Problem**: AI might make up facts.

**Solution**:
- **Strict System Prompts**: "Only use facts from tool calls"
- **Validation**: Verify all facts against source data
- **Explicit Reasoning**: Force AI to show reasoning
- **Tool-Grounded Responses**: Never respond without tool data

---

## 📚 Resources

### n8n Documentation
- [n8n Workflows](https://docs.n8n.io/workflows/)
- [n8n Code Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/)
- [n8n HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [n8n Sub-workflows](https://docs.n8n.io/workflows/sub-workflows/)

### Agentic AI Patterns
- [ReAct Paper](https://arxiv.org/abs/2210.03629)
- [LangChain Agents](https://python.langchain.com/docs/modules/agents/)
- [AutoGPT Architecture](https://github.com/Significant-Gravitas/AutoGPT)

---

## ✅ Conclusion

**YES, we can absolutely build agentic AI in n8n!**

n8n provides:
- ✅ Workflow orchestration for complex agent logic
- ✅ Tool integration (HTTP, Code, Database nodes)
- ✅ State management (Database, Redis nodes)
- ✅ Error handling and retry logic
- ✅ Self-healing capabilities (monitoring workflows)
- ✅ Visual development (no complex code needed)

**The path forward:**
1. Start with basic AI backend (✅ Done)
2. Add intent detection and routing
3. Implement ReAct pattern with tools
4. Build specialized agents (SR, Incident, etc.)
5. Add self-healing capabilities
6. Make it role-aware

**This is not only feasible - it's the ideal platform for agentic AI!**

---

**Last Updated:** January 2025  
**Status:** ✅ Vision Defined, Ready for Implementation
