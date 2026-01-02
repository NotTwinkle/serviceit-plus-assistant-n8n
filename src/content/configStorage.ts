/**
 * Configuration Storage Service (Content Script Copy)
 * 
 * Duplicate of configStorage.ts to avoid code splitting issues.
 * This ensures the content script bundles everything it needs.
 */

export interface IvantiConfig {
  baseUrl: string;
  apiPathPrefix: string;
  apiKey?: string;
  configuredAt: number;
}

const CONFIG_KEY = 'ivanti_config';

/**
 * Get stored configuration
 */
export async function getStoredConfig(): Promise<IvantiConfig | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_KEY, (result) => {
      if (result[CONFIG_KEY]) {
        resolve(result[CONFIG_KEY] as IvantiConfig);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Save configuration
 */
export async function saveConfig(config: Omit<IvantiConfig, 'configuredAt'>): Promise<void> {
  return new Promise((resolve, reject) => {
    const fullConfig: IvantiConfig = {
      ...config,
      configuredAt: Date.now(),
    };

    chrome.storage.local.set({ [CONFIG_KEY]: fullConfig }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        // Also update sessionStorage for immediate use
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('serviceit_api_path_prefix', JSON.stringify({
            prefix: config.apiPathPrefix,
            timestamp: Date.now(),
          }));
        }
        resolve();
      }
    });
  });
}

/**
 * Check if configuration exists
 */
export async function hasConfig(): Promise<boolean> {
  const config = await getStoredConfig();
  return config !== null;
}

/**
 * Clear stored configuration
 */
export async function clearConfig(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(CONFIG_KEY, () => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('serviceit_api_path_prefix');
      }
      resolve();
    });
  });
}

/**
 * Get API path prefix from stored config
 */
export async function getStoredApiPathPrefix(): Promise<string | null> {
  const config = await getStoredConfig();
  return config?.apiPathPrefix || null;
}

/**
 * Get base URL from stored config
 */
export async function getStoredBaseUrl(): Promise<string | null> {
  const config = await getStoredConfig();
  return config?.baseUrl || null;
}

