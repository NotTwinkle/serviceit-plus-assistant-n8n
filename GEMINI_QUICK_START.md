# 🚀 Gemini Quick Start Guide

## Get Your Free Gemini API Key (2 Minutes)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with Google account
3. Click **"Get API key"** or **"Create API key"**
4. Select project (or create new)
5. **Copy the API key immediately!**

## Setup in n8n (3 Minutes)

### Option 1: Environment Variable (Recommended)

1. In n8n, go to **Settings** → **Environment Variables**
2. Click **"+ Add Variable"**
3. **Name:** `GEMINI_API_KEY`
4. **Value:** Paste your API key
5. Click **"Save"**

### Option 2: Direct in Workflow

1. Import `n8n-workflow-template.json`
2. Open **"Build Gemini Request"** node
3. Find this line:
   ```javascript
   const geminiApiKey = $env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';
   ```
4. Replace `'YOUR_GEMINI_API_KEY'` with your actual key:
   ```javascript
   const geminiApiKey = $env.GEMINI_API_KEY || 'AIzaSy...your-actual-key';
   ```

## Test Your Setup

### Test with curl:
```bash
curl -X POST https://your-n8n.com/webhook/ivanti-ai \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, test message",
    "userId": "test",
    "userFullName": "Test User",
    "userRoles": ["User"],
    "ticketId": null,
    "sessionId": "test-session"
  }'
```

### Expected Response:
```json
{
  "message": "Hello! How can I help you with Ivanti Service Manager?",
  "actions": [],
  "thinkingSteps": []
}
```

## Gemini Models Available

| Model | Speed | Best For | Free Tier |
|-------|-------|----------|-----------|
| `gemini-2.0-flash-exp` | ⚡ Very Fast | Testing, Quick responses | ✅ Yes |
| `gemini-1.5-flash` | ⚡ Fast | Production, Stable | ✅ Yes |
| `gemini-1.5-pro` | 🐢 Slower | Complex tasks | ⚠️ Limited |

**Recommended for testing:** `gemini-2.0-flash-exp`

## Free Tier Limits

- **Rate Limit:** 15 requests per minute
- **Daily Limit:** Generous free tier (varies)
- **No Credit Card:** Required for free tier
- **Perfect for:** Development and testing

## Troubleshooting

### "API key not valid"
- Check you copied the full key
- Verify key is active in Google AI Studio
- Make sure there are no extra spaces

### "Rate limit exceeded"
- You're making more than 15 requests/minute
- Wait 1 minute and try again
- Consider upgrading to paid tier for production

### "Model not found"
- Check model name spelling
- Try `gemini-1.5-flash` instead
- Some models may be region-specific

## Switch to OpenAI Later

If you want to switch to OpenAI later:

1. Get OpenAI API key from [platform.openai.com](https://platform.openai.com/)
2. Replace the "Build Gemini Request" and "Call Gemini API" nodes with:
   - **AI Agent** node (n8n built-in)
   - Or use OpenAI HTTP Request node
3. Update response parsing (OpenAI uses different format)

**But for now, Gemini is perfect for testing!** 🎉

---

**Last Updated:** December 2025

