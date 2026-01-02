/**
 * API Path Helper for Background Script
 * 
 * Gets the discovered API path prefix from storage
 */

const STORAGE_KEY = 'serviceit_api_path_prefix';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get API path prefix from storage
 * Falls back to default /HEAT/api if not found
 */
export async function getApiPathPrefix(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      try {
        const cached = result[STORAGE_KEY];
        if (!cached) {
          resolve('/HEAT/api'); // Default fallback
          return;
        }
        
        const { prefix, timestamp } = cached;
        const age = Date.now() - timestamp;
        
        if (age > CACHE_DURATION) {
          chrome.storage.local.remove(STORAGE_KEY);
          resolve('/HEAT/api'); // Default fallback
          return;
        }
        
        resolve(prefix);
      } catch (error) {
        resolve('/HEAT/api'); // Default fallback
      }
    });
  });
}

/**
 * Build API URL with discovered prefix
 */
export async function buildApiUrl(baseUrl: string, endpoint: string): Promise<string> {
  const prefix = await getApiPathPrefix();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  const separator = prefix.endsWith('/') ? '' : '/';
  return `${baseUrl}${prefix}${separator}${cleanEndpoint}`;
}

