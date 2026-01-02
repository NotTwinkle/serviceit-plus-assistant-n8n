/**
 * API Path Discovery Utility
 * 
 * Discovers the correct API path prefix for different Ivanti instance configurations.
 * Different instances may use different path structures (e.g., /HEAT/api/, /api/, /ServiceManager/api/)
 */

const API_PATH_PREFIXES = [
  '/HEAT/api',           // Most common (Ivanti HEAT/Service Manager)
  '/api',                // Some instances use direct /api
  '/ServiceManager/api', // Service Manager instances
  '/ISM/api',            // Ivanti Service Manager
  '/Ivanti/api',         // Generic Ivanti
  '/HEAT/rest',          // Legacy REST endpoints
  '/rest',               // Direct REST
];

const DISCOVERY_ENDPOINTS = [
  // Try OData endpoints first (more likely to work)
  '/odata/businessobject/employees?$top=1',
  '/odata/businessobject/categorys?$top=1',
  '/odata/businessobject/incidents?$top=1',
  // Then try REST API endpoints
  '/v1/User/current',
  '/v1/user/current',
  '/rest/Session/User',
];

const CACHE_KEY = 'serviceit_api_path_prefix';
const STORAGE_KEY = 'serviceit_api_path_prefix'; // For chrome.storage.local (background script access)
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get API key from stored configuration
 */
async function getStoredApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('ivanti_config', (result) => {
      if (result.ivanti_config?.apiKey) {
        resolve(result.ivanti_config.apiKey);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Discover the API path prefix by trying different prefixes and endpoints
 */
export async function discoverApiPath(baseUrl: string, forceRefresh: boolean = false): Promise<string | null> {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCachedPath();
    if (cached) {
      console.log(`[APIDiscovery] Using cached API path prefix: ${cached}`);
      // Verify cached prefix still works
      const testUrl = `${baseUrl}${cached}/odata/businessobject/employees?$top=1`;
      try {
        const testResponse = await fetch(testUrl, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        if (testResponse.status !== 404) {
          return cached;
        } else {
          console.log(`[APIDiscovery] Cached prefix ${cached} returned 404, re-discovering...`);
          clearApiPathCache();
        }
      } catch (e) {
        // Network error, keep cached value
        return cached;
      }
    }
  } else {
    clearApiPathCache();
  }

  console.log('[APIDiscovery] Starting API path discovery...');
  
  // Try each prefix with each endpoint
  for (const prefix of API_PATH_PREFIXES) {
    for (const endpoint of DISCOVERY_ENDPOINTS) {
      const fullPath = `${prefix}${endpoint}`;
      const testUrl = `${baseUrl}${fullPath}`;
      
      try {
        console.log(`[APIDiscovery] Testing: ${fullPath}`);
        
        // Get API key from storage
        const apiKey = await getStoredApiKey();
        const headers: Record<string, string> = {
          'Accept': 'application/json',
        };
        
        // Add API key if available
        if (apiKey) {
          headers['Authorization'] = `rest_api_key=${apiKey}`;
        }
        
        const response = await fetch(testUrl, {
          method: 'GET',
          credentials: 'include',
          headers,
        });
        
        const status = response.status;
        console.log(`[APIDiscovery] ${fullPath} → ${status}`);
        
        // Accept 200, 204 (success) or 401/403 (auth required but endpoint exists)
        // Reject 404 (endpoint doesn't exist)
        if (status === 200 || status === 204 || status === 401 || status === 403) {
          console.log(`[APIDiscovery] ✅ Found working API path prefix: ${prefix} (via ${endpoint}, status: ${status})`);
          
          // Cache the discovered prefix
          cachePath(prefix);
          
          return prefix;
        }
        
        // If 404, this prefix/endpoint combo doesn't exist, try next
        if (status === 404) {
          continue;
        }
        
        // For other errors (400, 500, etc.), endpoint might exist but have issues
        // Only cache if we got a response (not 404) - means the API path exists
        if (status >= 400 && status < 500 && status !== 404) {
          console.log(`[APIDiscovery] ⚠️ Endpoint exists but returned ${status}, caching prefix anyway`);
          cachePath(prefix);
          return prefix;
        }
        
        // For 500+ errors, don't cache - might be temporary server issues
        if (status >= 500) {
          console.log(`[APIDiscovery] Server error ${status} for ${prefix}${endpoint}, trying next...`);
          continue;
        }
      } catch (error: any) {
        // Network/CORS errors - skip this combination
        console.log(`[APIDiscovery] Error testing ${fullPath}:`, error.message);
        continue;
      }
    }
  }
  
  console.warn('[APIDiscovery] ❌ Could not discover API path prefix. All attempts failed.');
  return null;
}

/**
 * Get cached API path prefix
 */
function getCachedPath(): string | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const { prefix, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    
    if (age > CACHE_DURATION) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return prefix;
  } catch (error) {
    return null;
  }
}

/**
 * Cache the discovered API path prefix
 */
function cachePath(prefix: string): void {
  try {
    // Cache in sessionStorage (for content script)
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      prefix,
      timestamp: Date.now(),
    }));
    
    // Also cache in chrome.storage.local (for background script)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          prefix,
          timestamp: Date.now(),
        }
      });
    }
  } catch (error) {
    console.warn('[APIDiscovery] Failed to cache path:', error);
  }
}

/**
 * Clear cached API path (useful for testing or when instance changes)
 */
export function clearApiPathCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(STORAGE_KEY);
    }
    console.log('[APIDiscovery] Cleared API path cache');
  } catch (error) {
    console.warn('[APIDiscovery] Failed to clear cache:', error);
  }
}

/**
 * Get API path prefix from storage (for background script use)
 */
export async function getApiPathPrefix(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(null);
      return;
    }
    
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      try {
        const cached = result[STORAGE_KEY];
        if (!cached) {
          resolve(null);
          return;
        }
        
        const { prefix, timestamp } = cached;
        const age = Date.now() - timestamp;
        
        if (age > CACHE_DURATION) {
          chrome.storage.local.remove(STORAGE_KEY);
          resolve(null);
          return;
        }
        
        resolve(prefix);
      } catch (error) {
        resolve(null);
      }
    });
  });
}

/**
 * Build full API endpoint URL with discovered prefix
 */
export async function buildApiUrl(baseUrl: string, endpoint: string): Promise<string> {
  // Remove leading slash from endpoint if present (we'll add it)
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  // Discover path prefix if not cached
  const prefix = await discoverApiPath(baseUrl);
  
  if (prefix) {
    // Ensure prefix ends with / and endpoint doesn't start with /
    const separator = prefix.endsWith('/') ? '' : '/';
    return `${baseUrl}${prefix}${separator}${cleanEndpoint}`;
  }
  
  // Fallback to default HEAT/api prefix
  console.warn('[APIDiscovery] Using fallback /HEAT/api prefix');
  return `${baseUrl}/HEAT/api/${cleanEndpoint}`;
}

/**
 * Get list of endpoints to try with discovered prefix
 */
export async function getEndpointsWithPrefix(
  baseUrl: string,
  endpointPaths: string[]
): Promise<string[]> {
  const prefix = await discoverApiPath(baseUrl) || '/HEAT/api';
  
  return endpointPaths.map(path => {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    const separator = prefix.endsWith('/') ? '' : '/';
    return `${baseUrl}${prefix}${separator}${cleanPath}`;
  });
}

