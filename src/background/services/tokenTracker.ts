/**
 * Token Tracking Service
 * 
 * Tracks token usage per conversation and provides statistics.
 * Similar to Cursor's token usage tracking feature.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: number;
}

export interface ConversationTokenStats {
  conversationId: string; // Tab ID or session ID
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  messageCount: number;
  lastUpdated: number;
  usageHistory: TokenUsage[];
}

export interface GlobalTokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalConversations: number;
  lastReset: number;
}

// Store token stats per conversation (in memory)
const conversationStats = new Map<string, ConversationTokenStats>();

// Context window sizes for different models (default to Gemini Flash Lite)
const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  'gemini-2.5-flash-lite': 1000000, // 1M tokens
  'gemini-2.0-flash-live': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-pro': 2000000, // 2M tokens
  'gemini-1.5-flash': 1000000,
  'gemini-1.5-pro': 2000000,
  'llama3:latest': 128000,
  'llama3.2': 128000,
  'llama3.1': 128000,
  'llama3': 128000,
  'mistral:latest': 32000,
  'mistral': 32000,
  'qwen2.5': 32000,
  'phi3': 32000,
  'grok-beta': 128000,
  'grok-2': 128000,
  'grok-vision-beta': 128000,
};

const DEFAULT_CONTEXT_WINDOW = 1000000; // Default to 1M for Gemini models

/**
 * Estimate token count from text (simple approximation: 1 token ≈ 4 characters)
 * This is a rough estimate. For accurate counting, use model-specific tokenizers.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // More accurate: account for spaces and punctuation
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  // Average: 1 token ≈ 0.75 words or 4 characters (whichever is higher)
  return Math.max(Math.ceil(words / 0.75), Math.ceil(chars / 4));
}

/**
 * Get or create conversation stats
 */
function getOrCreateConversationStats(conversationId: string): ConversationTokenStats {
  if (!conversationStats.has(conversationId)) {
    conversationStats.set(conversationId, {
      conversationId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      lastUpdated: Date.now(),
      usageHistory: [],
    });
  }
  return conversationStats.get(conversationId)!;
}

/**
 * Record token usage for a message exchange
 */
export function recordTokenUsage(
  conversationId: string,
  inputText: string,
  outputText: string,
  actualUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
): TokenUsage {
  const stats = getOrCreateConversationStats(conversationId);
  
  // Use actual usage if provided (from API response), otherwise estimate
  const inputTokens = actualUsage?.inputTokens ?? estimateTokens(inputText);
  const outputTokens = actualUsage?.outputTokens ?? estimateTokens(outputText);
  const totalTokens = actualUsage?.totalTokens ?? (inputTokens + outputTokens);
  
  // Update conversation stats
  stats.totalInputTokens += inputTokens;
  stats.totalOutputTokens += outputTokens;
  stats.totalTokens += totalTokens;
  stats.messageCount += 1;
  stats.lastUpdated = Date.now();
  
  // Add to history (keep last 100 exchanges)
  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens,
    timestamp: Date.now(),
  };
  stats.usageHistory.push(usage);
  if (stats.usageHistory.length > 100) {
    stats.usageHistory.shift(); // Remove oldest
  }
  
  // Persist to storage
  persistConversationStats(conversationId, stats);
  
  return usage;
}

/**
 * Get token stats for a conversation
 */
export function getConversationStats(conversationId: string): ConversationTokenStats | null {
  return conversationStats.get(conversationId) || null;
}

/**
 * Get context window usage percentage
 */
export function getContextWindowUsage(
  conversationId: string,
  modelName: string = 'gemini-2.5-flash-lite'
): number {
  const stats = getConversationStats(conversationId);
  if (!stats) return 0;
  
  const contextWindow = CONTEXT_WINDOW_SIZES[modelName] || DEFAULT_CONTEXT_WINDOW;
  const usagePercentage = (stats.totalTokens / contextWindow) * 100;
  
  return Math.min(usagePercentage, 100); // Cap at 100%
}

/**
 * Get all conversation stats
 */
export function getAllConversationStats(): ConversationTokenStats[] {
  return Array.from(conversationStats.values());
}

/**
 * Get global token statistics
 */
export async function getGlobalTokenStats(): Promise<GlobalTokenStats> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['globalTokenStats'], (result) => {
      const stored = result.globalTokenStats as GlobalTokenStats | undefined;
      
      if (stored) {
        resolve(stored);
      } else {
        // Initialize if not exists
        const initial: GlobalTokenStats = {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalConversations: 0,
          lastReset: Date.now(),
        };
        chrome.storage.local.set({ globalTokenStats: initial });
        resolve(initial);
      }
    });
  });
}

/**
 * Update global token statistics
 */
export async function updateGlobalTokenStats(usage: TokenUsage): Promise<void> {
  const global = await getGlobalTokenStats();
  
  global.totalInputTokens += usage.inputTokens;
  global.totalOutputTokens += usage.outputTokens;
  global.totalTokens += usage.totalTokens;
  
  chrome.storage.local.set({ globalTokenStats: global });
}

/**
 * Persist conversation stats to storage
 */
function persistConversationStats(conversationId: string, stats: ConversationTokenStats): void {
  const storageKey = `tokenStats_${conversationId}`;
  chrome.storage.local.set({ [storageKey]: stats });
}

/**
 * Load conversation stats from storage
 */
export function loadConversationStats(conversationId: string): Promise<ConversationTokenStats | null> {
  return new Promise((resolve) => {
    const storageKey = `tokenStats_${conversationId}`;
    chrome.storage.local.get([storageKey], (result) => {
      const stats = result[storageKey] as ConversationTokenStats | undefined;
      if (stats) {
        conversationStats.set(conversationId, stats);
        resolve(stats);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Clear conversation stats
 */
export function clearConversationStats(conversationId: string): void {
  conversationStats.delete(conversationId);
  const storageKey = `tokenStats_${conversationId}`;
  chrome.storage.local.remove([storageKey]);
}

/**
 * Reset global token statistics
 */
export async function resetGlobalTokenStats(): Promise<void> {
  const reset: GlobalTokenStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalConversations: 0,
    lastReset: Date.now(),
  };
  chrome.storage.local.set({ globalTokenStats: reset });
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  } else if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  } else {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
}

