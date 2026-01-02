/**
 * Configuration for n8n Backend Integration
 * 
 * This extension uses n8n as the backend for all AI processing and Ivanti API calls.
 * The extension only handles UI and routing - all business logic is in n8n workflows.
 */

export const N8N_CONFIG = {
  // n8n Webhook URL - Update this to your n8n instance
  // Can be set via environment variable: VITE_N8N_WEBHOOK_URL
  webhookUrl: import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://your-n8n-instance.com/webhook/ivanti-ai',
  
  // Security secret for n8n webhook authentication
  // Must match the secret in your n8n workflow's "Security & Data Prep" node
  securitySecret: import.meta.env.VITE_N8N_SECRET || 'my-super-secret-password-123',
  
  // Request timeout (milliseconds)
  // Increased to 60 seconds to accommodate workflows that use AI models (can take 45+ seconds)
  timeout: 60000, // 60 seconds
  
  // Retry configuration
  retries: 2,
  retryDelay: 1000, // 1 second
};

export const IVANTI_CONFIG = {
  // Base URL for Ivanti instance (used for context extraction only)
  baseUrl: 'https://swhealthdemo-try.trysaasiteu.com',
  
  // API Key for Ivanti API authentication (used by n8n workflows)
  // This key is passed to n8n so it can authenticate with Ivanti APIs
  apiKey: '9E7D8E238EE34F92B87F595841DD7079',
};

// Configuration validation
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!N8N_CONFIG.webhookUrl || N8N_CONFIG.webhookUrl === 'https://your-n8n-instance.com/webhook/ivanti-ai') {
    errors.push('n8n webhook URL is not configured. Please set VITE_N8N_WEBHOOK_URL in .env.local or update config.ts');
  }
  
  if (!IVANTI_CONFIG.baseUrl) {
    errors.push('Ivanti base URL is missing');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
