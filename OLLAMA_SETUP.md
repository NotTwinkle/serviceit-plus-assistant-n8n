# 🦙 Ollama Setup Guide

## What is Ollama?

**Ollama** is a tool to run large language models (LLMs) locally on your machine. It's:
- ✅ **Free** - No API costs
- ✅ **Fast** - Local processing
- ✅ **Private** - Data stays on your machine
- ✅ **Perfect** - For simple questions in our routing system

---

## 🚀 Quick Setup

### 1. Install Ollama

#### macOS
```bash
brew install ollama
```

#### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### Windows
Download from: https://ollama.com/download

### 2. Start Ollama

```bash
ollama serve
```

Ollama will run on `http://localhost:11434`

### 3. Pull a Fast Model

For our use case, we need a **fast, small model** for:
- Complexity analysis
- Simple Q&A

**Recommended Models:**

```bash
# Best balance: Fast + Good quality
ollama pull llama3.2

# Alternative: Even faster, smaller
ollama pull phi3

# Alternative: Good quality
ollama pull mistral
```

**For our workflow, we use `llama3.2`** (already configured in template)

### 4. Test Ollama

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Hello, test",
  "stream": false
}'
```

**Expected Response:**
```json
{
  "model": "llama3.2",
  "created_at": "...",
  "response": "Hello! How can I help you today?",
  "done": true
}
```

---

## 🔧 Configuration in n8n

### Option 1: Ollama on Same Machine as n8n

If n8n is running locally:
- **URL:** `http://localhost:11434`
- **No changes needed** - Already configured in workflow

### Option 2: Ollama on Different Machine

If Ollama is on a different server:
1. Update workflow node "Build Ollama Request"
2. Change URL from `http://localhost:11434` to `http://your-ollama-server:11434`

### Option 3: Ollama in Docker

```bash
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

---

## 📊 Model Comparison

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| **llama3.2** | 2B | ⚡⚡⚡ | ⭐⭐⭐ | **Recommended** - Best balance |
| **phi3** | 3.8B | ⚡⚡⚡⚡ | ⭐⭐ | Fastest, good for simple Q&A |
| **mistral** | 7B | ⚡⚡ | ⭐⭐⭐⭐ | Better quality, slightly slower |
| **llama3.1** | 8B | ⚡ | ⭐⭐⭐⭐⭐ | Best quality, slower |

**For our use case:** `llama3.2` is perfect - fast enough for routing, good enough for simple answers.

---

## 🧪 Testing in n8n Workflow

### Test Complexity Analyzer

1. Import workflow: `n8n-workflow-intelligent-routing.json`
2. Test with simple question:
   ```
   "What's the status of ticket INC-123?"
   ```
   - Should route to **Ollama** path
   - Should get fast response

3. Test with complex question:
   ```
   "Why is this ticket taking so long? What should I do?"
   ```
   - Should route to **Gemini** path
   - Should get detailed reasoning

---

## 🐛 Troubleshooting

### "Connection refused" Error
- ✅ Check Ollama is running: `ollama serve`
- ✅ Check port 11434 is open
- ✅ Verify URL in workflow: `http://localhost:11434`

### "Model not found" Error
- ✅ Pull the model: `ollama pull llama3.2`
- ✅ List models: `ollama list`
- ✅ Verify model name in workflow

### Slow Responses
- ✅ Use smaller model (llama3.2 instead of llama3.1)
- ✅ Reduce `num_predict` in workflow
- ✅ Check system resources (CPU/RAM)

### Ollama Not Starting
- ✅ Check if port 11434 is already in use
- ✅ Try different port: `OLLAMA_HOST=0.0.0.0:11435 ollama serve`
- ✅ Update workflow URL accordingly

---

## 💡 Tips

1. **Keep Ollama Running**
   - Run `ollama serve` in background
   - Or use systemd/service to auto-start

2. **Monitor Performance**
   - Check response times
   - Monitor CPU/RAM usage
   - Adjust model size if needed

3. **Update Models**
   ```bash
   ollama pull llama3.2  # Updates to latest version
   ```

4. **Multiple Models**
   - You can have multiple models installed
   - Switch in workflow by changing model name

---

## 📚 Resources

- **Ollama Website:** https://ollama.com
- **Ollama Models:** https://ollama.com/library
- **API Documentation:** https://github.com/ollama/ollama/blob/main/docs/api.md

---

## ✅ Checklist

- [ ] Ollama installed
- [ ] Ollama running (`ollama serve`)
- [ ] Model pulled (`ollama pull llama3.2`)
- [ ] Test API call successful
- [ ] n8n workflow configured
- [ ] Test simple question → Routes to Ollama
- [ ] Test complex question → Routes to Gemini

---

**Last Updated:** December 2025  
**Status:** Ready for Setup

