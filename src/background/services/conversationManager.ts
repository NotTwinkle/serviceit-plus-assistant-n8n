/**
 * Conversation Management Service
 * 
 * Handles conversation history for n8n backend.
 * Manages history per tab, cleans redundant messages, and prepares context for n8n.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  summary?: string;
}

/**
 * Configuration for conversation management
 */
const CONVERSATION_CONFIG = {
  // Maximum number of recent messages to send to n8n
  MAX_RECENT_MESSAGES: 20,
  
  // Threshold to trigger summarization
  SUMMARIZE_AFTER: 30,
  
  // Maximum total messages before aggressive cleanup
  MAX_TOTAL_MESSAGES: 50,
  
  // Maximum tokens per message (estimated: 1 token ≈ 4 characters)
  MAX_MESSAGE_TOKENS: 500,
  
  // Maximum conversation context tokens
  MAX_CONTEXT_TOKENS: 32000,
};

/**
 * Estimate token count for a message
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens in conversation history
 */
function estimateConversationTokens(messages: ChatMessage[]): number {
  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content || '');
  }, 0);
}

/**
 * Check if a message is redundant or low-quality
 */
function isLowQualityMessage(msg: ChatMessage, recentMessages: ChatMessage[]): boolean {
  // Skip system messages
  if (msg.role === 'system') return false;
  
  // Check for very short messages
  if (msg.content && msg.content.trim().length < 5) return true;
  
  // Check for duplicate content
  if (recentMessages.some(m => 
    m.role === msg.role && 
    m.content === msg.content && 
    m !== msg
  )) {
    return true;
  }
  
  // Check for error messages that are redundant
  if (msg.content && (
    msg.content.includes('Error: Error:') ||
    msg.content.match(/I'm sorry.*I'm sorry/i)
  )) {
    return true;
  }
  
  return false;
}

/**
 * Clean redundant or low-quality messages from conversation
 */
export function cleanConversation(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = [];
  const seen = new Set<string>();
  
  for (const msg of messages) {
    // Always keep system messages
    if (msg.role === 'system') {
      cleaned.push(msg);
      continue;
    }
    
    // Skip low-quality messages
    if (isLowQualityMessage(msg, cleaned)) {
      continue;
    }
    
    // Skip exact duplicates
    const contentHash = `${msg.role}:${msg.content?.substring(0, 100)}`;
    if (seen.has(contentHash)) {
      continue;
    }
    seen.add(contentHash);
    
    // Truncate extremely long messages
    if (msg.content && estimateTokens(msg.content) > CONVERSATION_CONFIG.MAX_MESSAGE_TOKENS) {
      const truncated = msg.content.substring(0, CONVERSATION_CONFIG.MAX_MESSAGE_TOKENS * 4);
      cleaned.push({
        ...msg,
        content: truncated + '... [truncated]'
      });
      continue;
    }
    
    cleaned.push(msg);
  }
  
  return cleaned;
}

/**
 * Create a simple summary of conversation history
 */
export function createConversationSummary(messages: ChatMessage[]): string {
  const userQueries: string[] = [];
  const mentionedIncidents = new Set<string>();
  const mentionedUsers = new Set<string>();
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      // Extract incident numbers
      const incidentMatches = msg.content?.match(/#?(\d{5,})/g) || [];
      incidentMatches.forEach(inc => mentionedIncidents.add(inc.replace('#', '')));
      
      // Extract user names
      const nameMatches = msg.content?.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g) || [];
      nameMatches.forEach(name => mentionedUsers.add(name));
      
      // Store significant queries
      if (msg.content && msg.content.length > 10 && msg.content.length < 200) {
        userQueries.push(msg.content.substring(0, 100));
      }
    }
  }
  
  const summaryParts: string[] = [];
  
  if (mentionedIncidents.size > 0) {
    const incidents = Array.from(mentionedIncidents).slice(0, 5);
    summaryParts.push(`Incidents mentioned: ${incidents.join(', ')}`);
  }
  
  if (mentionedUsers.size > 0) {
    const users = Array.from(mentionedUsers).slice(0, 3);
    summaryParts.push(`Users mentioned: ${users.join(', ')}`);
  }
  
  if (userQueries.length > 0) {
    const recentQueries = userQueries.slice(-3);
    summaryParts.push(`Recent queries: ${recentQueries.map(q => `"${q}"`).join('; ')}`);
  }
  
  summaryParts.push(`Total exchanges: ${Math.floor(messages.length / 2)}`);
  
  return summaryParts.join('. ') + '.';
}

/**
 * Apply sliding window to conversation history
 * Keeps most recent messages and summarizes older ones
 */
export function applySlidingWindow(
  messages: ChatMessage[],
  currentMessage: string
): ChatMessage[] {
  // First, clean the conversation
  let cleaned = cleanConversation(messages);
  
  // Check token count
  const totalTokens = estimateConversationTokens(cleaned) + estimateTokens(currentMessage);
  
  // If within limits, return as-is
  if (cleaned.length <= CONVERSATION_CONFIG.SUMMARIZE_AFTER && 
      totalTokens <= CONVERSATION_CONFIG.MAX_CONTEXT_TOKENS) {
    return cleaned;
  }
  
  console.log('[ConversationManager] Applying sliding window. Current:', cleaned.length, 'messages');
  
  // Separate system messages (always keep)
  const systemMessages = cleaned.filter(msg => msg.role === 'system');
  const userAssistantMessages = cleaned.filter(msg => msg.role !== 'system');
  
  // Keep recent messages
  const recentMessages = userAssistantMessages.slice(-CONVERSATION_CONFIG.MAX_RECENT_MESSAGES);
  const oldMessages = userAssistantMessages.slice(0, -CONVERSATION_CONFIG.MAX_RECENT_MESSAGES);
  
  // Create summary of old messages
  let result: ChatMessage[] = [...systemMessages];
  
  if (oldMessages.length > 0) {
    const summary = createConversationSummary(oldMessages);
    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `[CONVERSATION SUMMARY]: ${summary}`,
      timestamp: Date.now(),
      summary: 'true'
    };
    result.push(summaryMessage);
  }
  
  // Add recent messages
  result.push(...recentMessages);
  
  console.log('[ConversationManager] After sliding window:', result.length, 'messages');
  
  return result;
}

/**
 * Manage conversation - main entry point
 * Prepares conversation history for n8n
 */
export function manageConversation(
  messages: ChatMessage[],
  currentMessage: string
): ChatMessage[] {
  // Apply sliding window (summarization if needed)
  let managed = applySlidingWindow(messages, currentMessage);
  
  // Final cleanup
  managed = cleanConversation(managed);
  
  // Limit to last N messages for n8n (to avoid huge payloads)
  const limited = managed.slice(-CONVERSATION_CONFIG.MAX_RECENT_MESSAGES);
  
  return limited;
}

/**
 * Extract key information from conversation
 */
export function extractConversationKeyInfo(messages: ChatMessage[]): {
  mentionedIncidents: string[];
  mentionedUsers: string[];
  recentActions: string[];
} {
  const mentionedIncidents = new Set<string>();
  const mentionedUsers = new Set<string>();
  const recentActions: string[] = [];
  
  // Look at last 10 messages
  const recentMessages = messages.slice(-10);
  
  for (const msg of recentMessages) {
    // Extract incident numbers
    const incidentMatches = msg.content?.match(/#?(\d{5,})/g) || [];
    incidentMatches.forEach(inc => mentionedIncidents.add(inc.replace('#', '')));
    
    // Extract user names
    const nameMatches = msg.content?.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g) || [];
    nameMatches.forEach(name => mentionedUsers.add(name));
    
    // Track actions
    if (msg.role === 'assistant') {
      if (msg.content?.includes('created')) recentActions.push('created');
      if (msg.content?.includes('updated')) recentActions.push('updated');
      if (msg.content?.includes('found')) recentActions.push('searched');
    }
  }
  
  return {
    mentionedIncidents: Array.from(mentionedIncidents),
    mentionedUsers: Array.from(mentionedUsers),
    recentActions: Array.from(new Set(recentActions))
  };
}
