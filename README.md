# 🤖 Ivanti AI Assistant - Chrome Extension

> **AI-powered intelligent assistant for Ivanti Service Manager with intelligent routing (Ollama + Gemini)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![n8n](https://img.shields.io/badge/n8n-Workflow-orange.svg)](https://n8n.io/)

## 🎯 Overview

An intelligent Chrome Extension that provides an AI-powered conversational interface for **Ivanti Service Manager**. Features **intelligent routing** that automatically routes simple questions to **Ollama** (local, fast, free) and complex questions to **Gemini** (cloud AI with high reasoning and tool access).

### ✨ Key Features

- 🧠 **Intelligent Routing** - Automatically routes simple vs complex questions
- 🚀 **Dual AI System** - Ollama (local) for simple queries, Gemini (cloud) for complex analysis
- 🔧 **Agentic AI** - Complex queries use tools (Redis Vector Store, Ivanti API)
- 💾 **Redis Integration** - Vector store for knowledge base (RAG) + chat memory
- 🎨 **Customizable UI** - Theme editor with live preview
- 🔐 **Secure** - Uses browser session cookies, no credential storage
- 📊 **Context-Aware** - Understands user roles, tickets, and conversation history

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Extension (Frontend)                               │
│  - React-based chat interface                              │
│  - Extracts user context, tickets, cookies                  │
└─────────────────────────────────────────────────────────────┘
                    ↓ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│  n8n Workflow Engine (Backend)                             │
│  - Complexity Analyzer (Gemini)                            │
│  - Intelligent Router                                       │
└─────────────────────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌───────────────┐      ┌──────────────────────┐
│  Ollama       │      │  Gemini AI Agent     │
│  (Simple Q&A) │      │  (Complex Reasoning) │
│  - Fast       │      │  - Tools Access      │
│  - Free       │      │  - Redis Vector KB   │
│  - Local      │      │  - Ivanti API        │
└───────────────┘      └──────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Chrome Browser** (or Chromium-based)
- **n8n** instance (cloud or self-hosted)
- **Ollama** installed locally (for simple queries)
- **Redis** (for vector store and chat memory)
- **Google Gemini API Key** (for complexity analysis and complex queries)

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/ivanti-ai-assistant.git
cd ivanti-ai-assistant
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create `.env.local` file:

```bash
# n8n Webhook URL
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/ivanti-ai

# Optional: Ivanti API Key (if needed)
VITE_IVANTI_API_KEY=your-api-key-here
```

### 4. Build Extension

```bash
npm run build
```

### 5. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **"Developer mode"** (top right)
3. Click **"Load unpacked"**
4. Select the `dist` folder

### 6. Setup n8n Workflow

Import the workflow from `n8n-workflow-intelligent-routing.json`:

1. Open your n8n instance
2. Click **"Import from File"**
3. Select `n8n-workflow-intelligent-routing.json`
4. Configure:
   - **GEMINI_API_KEY** environment variable
   - **Redis credentials** (for Vector Store and Chat Memory)
   - **Ollama** connection (default: `http://localhost:11434`)
5. Activate the workflow

See [N8N_SETUP_GUIDE.md](./N8N_SETUP_GUIDE.md) for detailed instructions.

## 📋 n8n Workflow Setup

The workflow implements **intelligent routing**:

1. **Webhook** - Receives POST requests from extension
2. **Complexity Analyzer** - Gemini analyzes question complexity
3. **Router** - Routes to:
   - **Simple** → Ollama (local, fast, free)
   - **Complex** → Gemini AI Agent (with tools)
4. **AI Agent** (Complex path):
   - Uses **Redis Vector Store** for knowledge base (RAG)
   - Uses **Ivanti API Tool** for ticket data
   - Uses **Redis Chat Memory** for conversation history

### Workflow Configuration

See [N8N_WORKFLOW_GUIDE.md](./N8N_WORKFLOW_GUIDE.md) for complete workflow setup.

## 🔧 Configuration

### Extension Configuration

Update `src/background/config.ts`:

```typescript
export const N8N_CONFIG = {
  webhookUrl: import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://your-n8n-instance.com/webhook/ivanti-ai',
  timeout: 30000, // 30 seconds
  retries: 2,
  retryDelay: 1000,
};
```

### n8n Environment Variables

Set in n8n Settings → Environment Variables:

- `GEMINI_API_KEY` - Your Google Gemini API key
- `IVANTI_API_KEY` - Your Ivanti REST API key (optional)

### Redis Configuration

Configure Redis for:
- **Vector Store** - Index: `ivanti-knowledge` (for RAG)
- **Chat Memory** - Session-based conversation history

## 📁 Project Structure

```
ivanti-ai-assistant/
├── src/
│   ├── background/          # Background service worker
│   │   ├── index.ts        # Main background script
│   │   ├── config.ts       # n8n configuration
│   │   └── services/       # Session, user, conversation management
│   ├── components/          # React UI components
│   │   ├── ChatWidget.tsx  # Main chat interface
│   │   ├── ThemeEditor.tsx # Theme customization
│   │   └── ...
│   ├── content/            # Content scripts
│   │   ├── index.tsx       # Main content script
│   │   └── utils/         # DOM scraping, context extraction
│   ├── types/              # TypeScript types
│   └── styles.css          # Tailwind CSS styles
├── public/                 # Static assets
│   └── icons/              # Extension icons
├── n8n-workflow-intelligent-routing.json  # n8n workflow
├── manifest.json           # Chrome extension manifest
├── package.json
└── README.md
```

## 🎨 Features

### Intelligent Routing

- **Simple Questions** → Ollama (local, fast, free)
  - Status checks
  - Basic lookups
  - Yes/No questions

- **Complex Questions** → Gemini AI Agent (cloud, powerful)
  - Analysis and reasoning
  - Multi-step actions
  - Tool usage (Redis KB, Ivanti API)

### AI Capabilities

- **Agentic AI** - Uses tools to retrieve information
- **RAG (Retrieval-Augmented Generation)** - Searches knowledge base first
- **Context-Aware** - Understands user roles, tickets, history
- **Self-Improvement** - Suggests adding solutions to KB

### User Experience

- 🎨 **Theme Customization** - Customize colors, fonts, layout
- 💬 **Conversation History** - Maintains context across messages
- 🔄 **Session Management** - Persists across browser restarts
- 🚪 **Logout Detection** - Automatically cleans up on logout

## 📚 Documentation

- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) - Complete project overview
- [INTELLIGENT_ROUTING_SYSTEM.md](./INTELLIGENT_ROUTING_SYSTEM.md) - Routing system details
- [COMPLEXITY_ANALYZER_PROMPT_V2.md](./COMPLEXITY_ANALYZER_PROMPT_V2.md) - Complexity analysis prompt
- [N8N_SETUP_GUIDE.md](./N8N_SETUP_GUIDE.md) - n8n setup instructions
- [N8N_WORKFLOW_GUIDE.md](./N8N_WORKFLOW_GUIDE.md) - Workflow configuration
- [OLLAMA_SETUP.md](./OLLAMA_SETUP.md) - Ollama installation guide
- [IVANTI_API_KEY_SETUP.md](./IVANTI_API_KEY_SETUP.md) - Ivanti API configuration

## 🔐 Security

- ✅ **No credential storage** - Uses browser session cookies
- ✅ **User-specific access** - Only sees what user can see
- ✅ **Automatic cleanup** - Clears data on logout
- ✅ **Permission-aware** - Respects Ivanti role permissions
- ✅ **HTTPS only** - All communications encrypted

## 🛠️ Development

### Development Mode

```bash
# Watch mode (auto-rebuild on changes)
npm run dev
```

### Production Build

```bash
npm run build
```

### Testing

1. Build extension: `npm run build`
2. Load in Chrome: `chrome://extensions/`
3. Open Ivanti Service Manager
4. Test with simple and complex questions

## 📊 Cost Optimization

The intelligent routing system optimizes costs:

- **80% Simple Questions** → Ollama (FREE, local)
- **20% Complex Questions** → Gemini (paid, but worth it for complex tasks)
- **Estimated Savings**: 60-80% vs using cloud AI for everything

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **n8n** - Workflow automation platform
- **Ollama** - Local LLM runtime
- **Google Gemini** - Cloud AI with tool access
- **Ivanti Service Manager** - ITSM platform

## 🆘 Support

### Troubleshooting

**Extension not loading?**
- Check browser console for errors
- Verify `manifest.json` is correct
- Ensure all dependencies are installed

**n8n webhook not responding?**
- Check webhook URL in config
- Verify n8n workflow is active
- Check n8n execution logs

**Ollama not working?**
- Ensure Ollama is running: `ollama serve`
- Check model is installed: `ollama list`
- Verify connection: `curl http://localhost:11434/api/generate`

**Redis connection issues?**
- Verify Redis is running
- Check credentials in n8n
- Ensure vector index exists: `ivanti-knowledge`

## 📈 Roadmap

- [ ] Enhanced error handling
- [ ] More Ivanti API tools
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Voice input/output
- [ ] Mobile app version

---

**Made with ❤️ for Ivanti Service Manager users**

**Version:** 2.0.0  
**Last Updated:** January 2025  
**Status:** ✅ Active Development
