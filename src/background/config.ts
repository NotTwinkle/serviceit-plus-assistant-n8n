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
  
  // Request timeout (milliseconds)
  timeout: 30000, // 30 seconds
  
  // Retry configuration
  retries: 2,
  retryDelay: 1000, // 1 second
};

export const IVANTI_CONFIG = {
  // Base URL for Ivanti instance (used for context extraction only)
  baseUrl: 'https://success.serviceitplus.com',
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
