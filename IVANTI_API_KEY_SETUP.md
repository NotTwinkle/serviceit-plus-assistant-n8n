# 🔑 Ivanti API Key Setup

Your Ivanti API key has been integrated into the workflow template.

## API Key
```
78D033FDB3D14F0FB4C66261B4FAA3AF
```

## 🔧 How to Configure in n8n

### Option 1: Environment Variable (Recommended - Most Secure)

1. In n8n, go to **Settings** → **Environment Variables**
2. Click **"+ Add Variable"**
3. **Name:** `IVANTI_API_KEY`
4. **Value:** `78D033FDB3D14F0FB4C66261B4FAA3AF`
5. Click **"Save"**

The workflow will automatically use this environment variable.

### Option 2: Direct in Workflow (Quick Setup)

The workflow template already has the API key as a fallback. If you don't set the environment variable, it will use:
```
78D033FDB3D14F0FB4C66261B4FAA3AF
```

⚠️ **Note:** If you commit the workflow to version control, the API key will be visible. Use Option 1 for production.

---

## 📋 Where the API Key is Used

The API key is added as an `X-API-Key` header in all Ivanti API requests:

### HTTP Request Nodes:
- **Get Ticket Data** - Fetches ticket information
- Any other Ivanti API calls you add

### Header Format:
```
X-API-Key: 78D033FDB3D14F0FB4C66261B4FAA3AF
```

---

## 🔐 Security Best Practices

1. ✅ **Use Environment Variables** - Don't hardcode in workflow
2. ✅ **Rotate Keys Regularly** - Change API keys periodically
3. ✅ **Limit Access** - Only give API key to trusted services
4. ✅ **Monitor Usage** - Check Ivanti logs for API key usage
5. ✅ **Use HTTPS** - Always use encrypted connections

---

## 🧪 Testing

After setting up the API key, test your workflow:

1. **Test Webhook:**
   ```bash
   curl -X POST https://your-n8n.com/webhook/ivanti-ai \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Test",
       "userId": "test",
       "ticketId": "YOUR_TICKET_ID"
     }'
   ```

2. **Check n8n Execution Logs:**
   - Look for successful HTTP requests to Ivanti
   - Verify `X-API-Key` header is included
   - Check for 200 OK responses

3. **If Authentication Fails:**
   - Verify API key is correct
   - Check if API key has required permissions
   - Ensure Ivanti instance accepts API key authentication
   - Some Ivanti instances may require cookies + API key

---

## 🔄 Dual Authentication (Cookies + API Key)

The workflow uses **both**:
- **Cookies** - User session authentication
- **API Key** - Service authentication

This provides:
- ✅ User-specific access (via cookies)
- ✅ Service-level authentication (via API key)
- ✅ Better security and access control

---

## 📝 Alternative Header Names

If your Ivanti instance uses a different header name, update the workflow:

Common alternatives:
- `Authorization: Bearer 78D033FDB3D14F0FB4C66261B4FAA3AF`
- `ApiKey: 78D033FDB3D14F0FB4C66261B4FAA3AF`
- `X-Ivanti-API-Key: 78D033FDB3D14F0FB4C66261B4FAA3AF`

To change:
1. Open "Get Ticket Data" node (or any Ivanti API node)
2. Find the `X-API-Key` header
3. Change the header name to match your Ivanti configuration

---

## 🆘 Troubleshooting

### "401 Unauthorized" Error
- ✅ Verify API key is correct
- ✅ Check if API key is active in Ivanti
- ✅ Ensure API key has required permissions
- ✅ Try with cookies only (remove API key temporarily)

### "403 Forbidden" Error
- ✅ Check API key permissions
- ✅ Verify user (from cookies) has access
- ✅ Check Ivanti API access settings

### "API Key Not Found"
- ✅ Set environment variable `IVANTI_API_KEY` in n8n
- ✅ Or verify fallback key is in workflow
- ✅ Check header name matches Ivanti requirements

---

**Last Updated:** December 2025  
**API Key:** `78D033FDB3D14F0FB4C66261B4FAA3AF`

