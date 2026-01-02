import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Settings, ChevronRight, Mail, Palette } from 'lucide-react';
import { Theme, DEFAULT_THEME, THEME_STORAGE_KEY } from '../types/theme';
import ThemeEditor from './ThemeEditor';
import { getTicketRecId } from '../content/utils/contextExtraction';

interface UserInfo {
  recId?: string;
  loginId: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  team?: string;
  department?: string;
  role?: string;
  roles?: string[];
  teams?: string[];
  location?: string;
}

interface Suggestion {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
  priority?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  // Optional structured payload for rich cards/actions
  metadata?: {
    templateId?: string; // ID of the template button that was clicked
    templateAction?: string; // Action type (e.g., 'view_tickets', 'create_incident')
    requiresFollowUp?: boolean; // Whether this prompt needs follow-up questions
    context?: Record<string, any>; // Additional context for the AI
  };
  // Contextual suggestions (adaptive quick actions)
  suggestions?: Suggestion[];
  // Token usage for this message exchange
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

// Serializable version of Message for storage (Date becomes ISO string)
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string format
}

interface ChatWidgetProps {
  currentUser?: UserInfo | null;
}

const formatTitleCase = (value: string): string => {
  return value
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

interface ThinkingStep {
  text: string;
  type: 'context' | 'action' | 'response';
}

const buildThinkingStatusSteps = (
  input: string, 
  ticketId: string | null,
  conversationLength: number = 0
): ThinkingStep[] => {
  const steps: ThinkingStep[] = [];
  const trimmed = input.trim();

  // Step 1: Always analyze conversation context first (like Cursor)
  if (conversationLength > 10) {
    steps.push({ 
      text: 'Analyzing conversation context...', 
      type: 'context' 
    });
  }

  // Step 2: Check if summarization is needed
  if (conversationLength > 30) {
    steps.push({ 
      text: 'Summarizing previous messages for better context...', 
      type: 'context' 
    });
  } else if (conversationLength > 15) {
    steps.push({ 
      text: 'Reviewing conversation history...', 
      type: 'context' 
    });
  }

  // Step 3: Typo correction (always show)
  steps.push({ 
    text: 'Checking for typos and normalizing input...', 
    type: 'context' 
  });

  // Step 4: Interpreting request
  steps.push({ 
    text: 'Interpreting your request...', 
    type: 'action' 
  });

  if (!trimmed) {
    steps.push({ 
      text: 'Checking Ivanti for details...', 
      type: 'action' 
    });
    steps.push({ 
      text: 'Formulating a helpful response...', 
      type: 'response' 
    });
    return steps;
  }

  const lower = trimmed.toLowerCase();

  // Context-specific actions
  if (ticketId && (lower.includes('this ticket') || lower.includes('incident') || lower.includes('update') || lower.includes('status'))) {
    steps.push({ 
      text: `Reviewing ticket #${ticketId} in Ivanti...`, 
      type: 'action' 
    });
  } else if (lower.includes('create') && lower.includes('incident')) {
    steps.push({ 
      text: 'Drafting the new incident details...', 
      type: 'action' 
    });
  } else if ((lower.includes('find') && lower.includes('user')) || lower.includes('employee')) {
    const match = trimmed.match(/["']([^"']+)["']/);
    if (match && match[1]) {
      steps.push({ 
        text: `Searching Ivanti for ${formatTitleCase(match[1])}...`, 
        type: 'action' 
      });
    } else {
      const words = trimmed.split(/\s+/);
      const possibleName = words.slice(-3).join(' ');
      const looksLikeName = possibleName.split(' ').filter(Boolean).every(word => /^[a-zA-Z][a-zA-Z'.-]*$/.test(word));
      steps.push({
        text: looksLikeName
          ? `Searching Ivanti for ${formatTitleCase(possibleName)}...`
          : 'Searching Ivanti for that user...',
        type: 'action'
      });
    }
  } else if (lower.includes('find') && (lower.includes('ticket') || lower.includes('incident'))) {
    steps.push({ 
      text: 'Looking up matching incidents in Ivanti...', 
      type: 'action' 
    });
  } else if (lower.includes('summary') || lower.includes('explain')) {
    steps.push({ 
      text: 'Summarizing information from Ivanti...', 
      type: 'action' 
    });
  } else {
    steps.push({ 
      text: 'Checking Ivanti for relevant data...', 
      type: 'action' 
    });
  }

  // Final step: Generating response
  steps.push({ 
    text: 'Formulating a helpful response...', 
    type: 'response' 
  });
  
  return steps;
};

// Template prompts for quick actions
interface PromptTemplate {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'view-tickets',
    label: 'Show all tickets',
    prompt: 'Show me all my open tickets',
    icon: '📋',
  },
  {
    id: 'solve-problem',
    label: 'I want to solve a problem',
    prompt: 'I want to solve a problem. Can you help me?',
    icon: '🔧',
  },
  {
    id: 'create-incident',
    label: 'Create new incident',
    prompt: 'I need to create a new incident. What information do you need?',
    icon: '➕',
  },
  {
    id: 'search-kb',
    label: 'Search knowledge base',
    prompt: 'Search the knowledge base for',
    icon: '🔍',
  },
  {
    id: 'check-status',
    label: 'Check ticket status',
    prompt: 'What is the status of my tickets?',
    icon: '📊',
  },
  {
    id: 'get-help',
    label: 'I need help',
    prompt: 'I need help with',
    icon: '❓',
  },
];

const ChatWidget: React.FC<ChatWidgetProps> = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
  const [thinkingStepObjects, setThinkingStepObjects] = useState<ThinkingStep[]>([]);
  const thinkingIntervalRef = useRef<number | null>(null);
  const [isHidden, setIsHidden] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [widgetWidth, setWidgetWidth] = useState(384); // Default: 384px (w-96)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWidgetWidthExpanded, setIsWidgetWidthExpanded] = useState(false);
  const [isExportChatExpanded, setIsExportChatExpanded] = useState(false);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [isThemeEditorOpen, setIsThemeEditorOpen] = useState(false);
  const [tempTheme, setTempTheme] = useState<Theme>(DEFAULT_THEME); // Temporary theme for editing

  // Token usage tracking state
  const [tokenStats, setTokenStats] = useState<{
    conversationTotal: number;
    contextUsagePercentage: number;
    globalTotal: number;
  } | null>(null);
  const [isTokenStatsExpanded, setIsTokenStatsExpanded] = useState(false);

  // Pending Service Request confirmation state
  const [pendingServiceRequest, setPendingServiceRequest] = useState<{
    subscriptionId: string;
    offeringName: string;
    fields: Array<{
      name: string;
      label: string;
      required: boolean;
      value?: string;
      options?: Array<{ value: string; label: string }>;
    }>;
    error?: string;
    missingFields?: Array<{ name: string; label: string }>;
    readyForConfirmation?: boolean; // ✅ Whether all required fields are filled
  } | null>(null);

  const handleUpdatePendingField = (fieldName: string, value: string) => {
    setPendingServiceRequest(prev => {
      if (!prev) return prev;
      
      // Update the field value
      const updatedFields = prev.fields.map(f =>
        f.name === fieldName ? { ...f, value } : f
      );
      
      // Check if all required fields are now filled
      const requiredFields = updatedFields.filter(f => f.required);
      const filledRequiredFields = requiredFields.filter(f => 
        f.value !== undefined && f.value !== null && f.value !== '' && String(f.value).trim() !== ''
      );
      const allRequiredFilled = requiredFields.length === 0 || filledRequiredFields.length === requiredFields.length;
      
      // Find still-missing required fields
      const stillMissing = requiredFields.filter(f => 
        !f.value || String(f.value).trim() === ''
      ).map(f => ({ name: f.name, label: f.label }));
      
      return {
        ...prev,
        fields: updatedFields,
        error: allRequiredFilled ? undefined : `Please fill in ${stillMissing.length} required field${stillMissing.length > 1 ? 's' : ''}: ${stillMissing.map(mf => mf.label).join(', ')}`,
        missingFields: allRequiredFilled ? undefined : stillMissing,
        readyForConfirmation: allRequiredFilled, // ✅ Update readiness status
      };
    });
  };

  const handleCancelPendingServiceRequest = () => {
    setPendingServiceRequest(null);
  };

  const handleConfirmPendingServiceRequest = async () => {
    if (!pendingServiceRequest) return;
    
    // ✅ Prevent submission if required fields are missing
    if (pendingServiceRequest.readyForConfirmation === false) {
      const missingList = pendingServiceRequest.missingFields?.map(mf => mf.label).join(', ') || 'required fields';
      setPendingServiceRequest(prev => prev ? {
        ...prev,
        error: `Cannot submit: Please fill in all required fields: ${missingList}`
      } : prev);
      return;
    }

    console.log('[ChatWidget] 🚀 Confirming service request with fields:', pendingServiceRequest.fields);
    console.log('[ChatWidget] 🚀 Fields count:', pendingServiceRequest.fields.length);

    const fieldValues: Record<string, any> = {};
    pendingServiceRequest.fields.forEach(f => {
      console.log(`[ChatWidget]   Field: ${f.name} = ${f.value}`);
      fieldValues[f.name] = f.value ?? '';
    });

    console.log('[ChatWidget] 🚀 Final fieldValues:', fieldValues);
    console.log('[ChatWidget] 🚀 FieldValues keys:', Object.keys(fieldValues));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CONFIRM_SERVICE_REQUEST',
        subscriptionId: pendingServiceRequest.subscriptionId,
        fieldValues,
      });

      if (!response || !response.success) {
        // Log technical details to console (for developers/debugging)
        console.error('[ChatWidget] ❌ Service request creation failed:', {
          response: response,
          error: response?.error,
          missingFields: response?.missingFields,
          timestamp: new Date().toISOString()
        });
        
        const errorMessage = response?.error || 'Unable to create your request. Please try again.';
        const missingFields = response?.missingFields || [];
        
        // Show error in the form (user-friendly)
        setPendingServiceRequest(prev =>
          prev
            ? {
                ...prev,
                error: errorMessage,
                missingFields: missingFields,
              }
            : prev
        );
        
        // ✅ Automatically send AI message explaining what's missing
        if (response?.validationError && missingFields.length > 0) {
          const aiExplanation: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `⚠️ **Cannot submit yet** - ${missingFields.length} required field${missingFields.length > 1 ? 's are' : ' is'} missing:\n\n${missingFields.map((f: any, i: number) => {
              let line = `${i + 1}. ${f.label || f.name}`;
              if (f.options && f.options.length > 0) {
                const opts = f.options.slice(0, 5).map((o: any) => o.label);
                line += ` (options: ${opts.join(', ')}${f.options.length > 5 ? `, +${f.options.length - 5} more` : ''})`;
              }
              return line;
            }).join('\n')}\n\nPlease fill in these fields in the form above, then try submitting again.`,
            timestamp: new Date(),
          };
          
          setMessages(prev => [...prev, aiExplanation]);
          
          // Scroll to show the error message
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
        
        return;
      }

      // Show success message in chat
      const successMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `✅ Service request ${response.requestNumber || ''} was created for "${response.offeringName || 'the selected request'}".`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);
      setPendingServiceRequest(null);
    } catch (error: any) {
      // Log technical details to console (for developers/debugging)
      console.error('[ChatWidget] ❌ Error confirming service request:', {
        error: error,
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        timestamp: new Date().toISOString()
      });
      
      // Show user-friendly error message
      setPendingServiceRequest(prev =>
        prev
          ? {
              ...prev,
              error: 'Unable to submit your request. Please try again.',
            }
          : prev
      );
    }
  };

 
  // Load theme from storage on mount
  useEffect(() => {
    chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
      if (result[THEME_STORAGE_KEY]) {
        try {
          const storedTheme = result[THEME_STORAGE_KEY] as Theme;
          // Validate theme structure
          if (storedTheme && storedTheme.colors && storedTheme.systemName && storedTheme.logo) {
            setTheme(storedTheme);
          } else {
            console.warn('Invalid theme in storage, using default');
            setTheme(DEFAULT_THEME);
          }
        } catch (error) {
          console.error('Error loading theme:', error);
          setTheme(DEFAULT_THEME);
        }
      }
    });
  }, []);

  // Save theme to storage when it changes
  useEffect(() => {
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
  }, [theme]);

  // Load settings from storage
  useEffect(() => {
    chrome.storage.local.get(['aiAssistantHidden', 'chatWidgetWidth'], (result) => {
      if (result.aiAssistantHidden === true) {
        setIsHidden(true);
      }
      if (result.chatWidgetWidth) {
        setWidgetWidth(result.chatWidgetWidth);
      }
    });
  }, []);

  // Refresh token stats
  const refreshTokenStats = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TOKEN_STATS'
      });
      
      if (response && response.success) {
        setTokenStats({
          conversationTotal: response.conversation?.totalTokens || 0,
          contextUsagePercentage: response.conversation?.contextUsagePercentage || 0,
          globalTotal: response.global?.totalTokens || 0,
        });
      }
    } catch (error) {
      console.warn('ChatWidget: Could not fetch token stats:', error);
    }
  };

  // Load token stats on mount and when chat opens
  useEffect(() => {
    if (isOpen && currentUser) {
      refreshTokenStats();
    }
  }, [isOpen, currentUser]);

  // Auto-focus input and scroll to bottom when chat opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      // Small delay to ensure input is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      
      // Scroll to bottom if there are messages
      if (messages.length > 0) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // Instant scroll when opening
        }, 150);
      }
    }
  }, [isOpen, isLoading]);

  // Save widget width to storage when it changes
  useEffect(() => {
    if (widgetWidth !== 384) {
      chrome.storage.local.set({ chatWidgetWidth: widgetWidth });
    }
  }, [widgetWidth]);

  // Get storage key for current user's conversation history
  const getConversationStorageKey = (): string | null => {
    if (!currentUser) return null;
    const userId = currentUser.loginId || currentUser.recId;
    return userId ? `conversationHistory_${userId}` : null;
  };

  // Helper function to get logo URL (handle base64, blob, or extension path)
  const getLogoUrl = (): string => {
    if (theme.logo.startsWith('data:image')) {
      return theme.logo; // Base64 image
    }
    if (theme.logo.startsWith('blob:')) {
      return theme.logo; // Object URL
    }
    return chrome.runtime.getURL(theme.logo); // Extension path
  };

  // Helper function to create welcome message with adaptive greeting
  const createWelcomeMessage = async () => {
    if (!currentUser) return;
    
    const userName = currentUser?.fullName || currentUser?.loginId || 'there';
    const userContext = currentUser?.team ? ` from ${currentUser.team}` : '';
    const params = new URLSearchParams(window.location.search);
    const recId = params.get('RecId');
    
    // If we're on a specific ticket page, use ticket-specific greeting
    if (recId) {
    const welcomeMessage: Message = {
      id: '1',
      role: 'assistant',
        content: `Hello ${userName}${userContext}! 👋 I'm here to assist you with Ticket #${recId}. How can I help you today?`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      return;
    }
    
    // Fetch active tickets count for adaptive greeting
    let ticketCount = 0;
    let ticketDetails = '';
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ACTIVE_TICKETS'
      });
      
      if (response && response.success) {
        ticketCount = response.totalCount || 0;
        const incidentCount = response.incidentCount || 0;
        const serviceRequestCount = response.serviceRequestCount || 0;
        
        // Build detailed ticket information
        if (ticketCount > 0) {
          const parts: string[] = [];
          if (incidentCount > 0) {
            parts.push(`${incidentCount} incident${incidentCount !== 1 ? 's' : ''}`);
          }
          if (serviceRequestCount > 0) {
            parts.push(`${serviceRequestCount} service request${serviceRequestCount !== 1 ? 's' : ''}`);
          }
          ticketDetails = parts.join(' and ');
        }
      }
    } catch (error) {
      console.warn('ChatWidget: Could not fetch active tickets for greeting:', error);
      // Continue with generic greeting if fetch fails
    }
    
    // Create adaptive greeting based on ticket count
    let greeting = '';
    if (ticketCount > 0) {
      greeting = `Hello ${userName}${userContext}! 👋 You have ${ticketCount} active ${ticketCount === 1 ? 'ticket' : 'tickets'} (${ticketDetails}). How can I help you with them today?`;
    } else {
      greeting = `Hello ${userName}${userContext}! 👋 I'm here to help you with Ivanti. What would you like to do today?`;
    }
    
    const welcomeMessage: Message = {
      id: '1',
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
    };
    
    setMessages([welcomeMessage]);
    
    // Scroll to bottom after welcome message is created
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 100);
  };

  // Convert Message to StoredMessage (for storage)
  const messageToStored = (msg: Message): StoredMessage => ({
    ...msg,
    timestamp: msg.timestamp.toISOString(),
  });

  // Convert StoredMessage to Message (from storage)
  const storedToMessage = (stored: StoredMessage): Message => ({
    ...stored,
    timestamp: new Date(stored.timestamp),
  });

  // Listen for logout events and clear messages
  useEffect(() => {
    const handleLogout = (message: any, _sender: any, sendResponse: Function) => {
      if (message.type === 'USER_LOGGED_OUT') {
        console.log('🚪 ========================================');
        console.log('🚪 ChatWidget: USER_LOGGED_OUT received!');
        console.log('🚪 ========================================');
        
        // Clear messages from memory immediately
        setMessages([]);
        
        // Close the widget
        setIsOpen(false);
        
        console.log('✅ ChatWidget: Cleared messages and closed widget');
        
        // Clear stored conversation history for current user
        const storageKey = getConversationStorageKey();
        if (storageKey) {
          console.log(`🧹 ChatWidget: Clearing conversation history: ${storageKey}`);
          chrome.storage.local.remove([storageKey], () => {
            console.log('✅ ChatWidget: Cleared conversation history from storage');
          });
        }
        
        sendResponse({ success: true });
      }
      return true; // Keep channel open for async response
    };

    chrome.runtime.onMessage.addListener(handleLogout);
    return () => {
      chrome.runtime.onMessage.removeListener(handleLogout);
    };
  }, [currentUser]);

  // Load conversation history from storage on mount
  // 2025 ENTERPRISE BEST PRACTICE: Session isolation with timestamp verification
  useEffect(() => {
    const storageKey = getConversationStorageKey();
    if (!storageKey || !currentUser) return;

    console.log('🔍 ChatWidget: Checking for conversation history...');

    // Verify stored user before loading history
    chrome.storage.local.get(['currentUser', storageKey], (result) => {
      // If currentUser doesn't exist in storage, user was logged out - don't load history
      if (!result.currentUser) {
        console.log('🚪 ChatWidget: No user session found, starting fresh conversation');
        createWelcomeMessage();
        return;
      }

      // Verify the stored user matches current user (prevent loading wrong user's history)
      const storedUser = result.currentUser;
      const currentUserId = currentUser.loginId || currentUser.recId;
      const storedUserId = storedUser.loginId || storedUser.recId;
      
      if (currentUserId !== storedUserId) {
        console.log('🔄 ChatWidget: User mismatch, starting fresh conversation');
        createWelcomeMessage();
        // Clear old user's history
        chrome.storage.local.remove([storageKey], () => {
          console.log('✅ ChatWidget: Cleared mismatched user history');
        });
        return;
      }

      const storedMessages = result[storageKey] as StoredMessage[] | undefined;
      
      if (storedMessages && Array.isArray(storedMessages) && storedMessages.length > 0) {
        // Restore messages from storage (only if NOT a fresh session)
        const restoredMessages = storedMessages.map(storedToMessage);
        console.log(`✅ ServiceIT: Restored ${restoredMessages.length} messages from conversation history`);
        setMessages(restoredMessages);
        
        // Auto-scroll to bottom after restoring messages (with delay to ensure DOM is rendered)
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); // Use 'auto' for instant scroll on load
        }, 200);
      } else {
        // No stored history - create welcome message
        console.log('🆕 ChatWidget: No history found, creating welcome message');
        createWelcomeMessage();
      }
    });
  }, [currentUser?.loginId, currentUser?.recId]); // Only reload if user changes

  // Save conversation history to storage whenever messages change
  // 2025 BEST PRACTICE: Persist history during session, clear on logout
  useEffect(() => {
    const storageKey = getConversationStorageKey();
    if (!storageKey || !currentUser || messages.length === 0) return;

    // Don't save if only welcome message exists (avoid overwriting with just welcome)
    const hasRealConversation = messages.some(
      (msg) => msg.id !== '1' || msg.role === 'user'
    );

    if (hasRealConversation) {
      const storedMessages = messages.map(messageToStored);
      chrome.storage.local.set({ [storageKey]: storedMessages }, () => {
        console.log(`💾 ServiceIT: Saved ${storedMessages.length} messages to conversation history`);
      });
    }
  }, [messages, currentUser?.loginId, currentUser?.recId]);

  // Detect user change (logout) and clear conversation history
  // 2025 BEST PRACTICE: Clear stored conversation when user logs out
  const prevUserRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = currentUser?.loginId || currentUser?.recId || null;
    const prevUserId = prevUserRef.current;

    // If user changed (logout detected), clear previous user's conversation from storage
    if (prevUserId && prevUserId !== currentUserId && prevUserId) {
      const previousStorageKey = `conversationHistory_${prevUserId}`;
      console.log('🔄 ServiceIT: User changed (logout detected), clearing previous user\'s conversation from storage');
      
      // Clear previous user's conversation from chrome.storage.local
      chrome.storage.local.remove([previousStorageKey], () => {
        console.log(`✅ ServiceIT: Cleared conversation history for user: ${prevUserId}`);
      });
      
      // Clear from memory
      setMessages([]);
    }

    prevUserRef.current = currentUserId;
  }, [currentUser?.loginId, currentUser?.recId]);

  // Extract RecId from URL on mount (using extracted utility)
  useEffect(() => {
    const recId = getTicketRecId();
    setTicketId(recId);
    
    // Log user info for debugging (including RecId)
    if (currentUser) {
      console.log('🔐 ServiceIT: Current User Session:', {
        recId: currentUser.recId,
        loginId: currentUser.loginId,
        fullName: currentUser.fullName,
        location: currentUser.location,
        team: currentUser.team,
        department: currentUser.department,
        role: currentUser.role
      });
    }
  }, [currentUser]);

  // Auto-scroll to bottom when new messages arrive or chat opens
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      // Use setTimeout to ensure DOM is fully rendered before scrolling
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isLoading || thinkingSteps.length <= 1) {
      if (thinkingIntervalRef.current) {
        window.clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
      setThinkingStepIndex(prev => (isLoading ? prev : 0));
      return;
    }

    if (thinkingIntervalRef.current) {
      window.clearInterval(thinkingIntervalRef.current);
    }

    thinkingIntervalRef.current = window.setInterval(() => {
      setThinkingStepIndex(prev => {
        if (prev >= thinkingSteps.length - 1) {
          if (thinkingIntervalRef.current) {
            window.clearInterval(thinkingIntervalRef.current);
            thinkingIntervalRef.current = null;
          }
          return prev;
        }
        return prev + 1;
      });
    }, 1200); // Slightly faster progression for better UX (like Cursor)

    return () => {
      if (thinkingIntervalRef.current) {
        window.clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
    };
  }, [isLoading, thinkingSteps]);

  // Handle template prompt button click
  const handleTemplateClick = (template: PromptTemplate) => {
    // Determine if this prompt requires follow-up (incomplete prompts)
    const requiresFollowUp = template.prompt.endsWith('for') || 
                            template.prompt.endsWith('with') ||
                            template.id === 'get-help' ||
                            template.id === 'search-kb';
    
    // Create a user message with template metadata
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: template.prompt,
      timestamp: new Date(),
      metadata: {
        templateId: template.id,
        templateAction: template.id.replace('-', '_'),
        requiresFollowUp: requiresFollowUp,
        context: {
          actionType: template.id,
          source: 'template_button',
        },
      },
    };

    // Add message to conversation immediately (UI feedback)
    setMessages(prev => [...prev, userMessage]);
    
    // Clear input
    setInputValue('');
    
    // Send message immediately with context (user message already added above)
    sendMessageWithTemplate(template, requiresFollowUp);
  };

  // Send message with template context
  const sendMessageWithTemplate = async (template: PromptTemplate, requiresFollowUp: boolean) => {
    if (isLoading) return;

    // Build thinking steps (use current messages length)
    const steps = buildThinkingStatusSteps(template.prompt, ticketId, messages.length);
    
    // Set loading state
    setIsLoading(true);
    setThinkingStepObjects(steps);
    setThinkingSteps(steps.map(s => s.text));
    setThinkingStepIndex(0);
    
    // Scroll to show thinking indicator
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    try {
      // Send message to background script with template metadata
      const response = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'SEND_MESSAGE',
          message: template.prompt,
          ticketId: ticketId,
          currentUser: currentUser,
          timestamp: new Date().toISOString(),
          templateContext: {
            templateId: template.id,
            templateAction: template.id.replace('-', '_'),
            requiresFollowUp: requiresFollowUp,
            actionType: template.id,
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 90000)
        )
      ]) as any;

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to send message');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message || 'No response from AI',
        timestamp: new Date(),
        tokenUsage: response.tokenUsage ? {
          inputTokens: response.tokenUsage.inputTokens || 0,
          outputTokens: response.tokenUsage.outputTokens || 0,
          totalTokens: response.tokenUsage.totalTokens || 0,
        } : undefined,
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      // Update token stats if provided
      if (response.tokenUsage) {
        setTokenStats({
          conversationTotal: response.tokenUsage.conversationTotal || 0,
          contextUsagePercentage: response.tokenUsage.contextUsagePercentage || 0,
          globalTotal: tokenStats?.globalTotal || 0,
        });
        
        // Refresh global stats
        refreshTokenStats();
      }
    } catch (error: any) {
      // Log technical details to console (for developers/debugging)
      console.error('[ChatWidget] ❌ Error sending template message:', {
        error: error,
        message: error.message,
        name: error.name,
        stack: error.stack,
        template: template.label,
        timestamp: new Date().toISOString()
      });
      
      // Show user-friendly error message (no technical details)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an issue processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setThinkingSteps([]);
      setThinkingStepIndex(0);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    // Build thinking steps BEFORE setting loading state (include conversation length for context management)
    const steps = buildThinkingStatusSteps(userMessage.content, ticketId, messages.length);
    
    // Add user message first
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    
    // Set loading state and thinking steps together
    setIsLoading(true);
    setThinkingStepObjects(steps); // Store full step objects
    setThinkingSteps(steps.map(s => s.text)); // Also keep string array for backward compatibility
    setThinkingStepIndex(0);
    
    // Scroll to bottom to show thinking indicator
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    try {
      // Send message to background script (which handles AI processing)
      // Add timeout to prevent getting stuck (90 seconds max - accounts for retries)
      const response = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'SEND_MESSAGE',
          message: userMessage.content,
          ticketId: ticketId,
          currentUser: currentUser, // Pass current user context
          timestamp: userMessage.timestamp.toISOString(),
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout: AI response took too long. This might be due to rate limiting or network issues. Please try again.')), 90000)
        )
      ]) as any;

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to send message');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message || 'I received your message.',
        timestamp: new Date(),
        suggestions: response.suggestions || [], // Add contextual suggestions from n8n
        tokenUsage: response.tokenUsage ? {
          inputTokens: response.tokenUsage.inputTokens || 0,
          outputTokens: response.tokenUsage.outputTokens || 0,
          totalTokens: response.tokenUsage.totalTokens || 0,
        } : undefined,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update token stats if provided
      if (response.tokenUsage) {
        setTokenStats({
          conversationTotal: response.tokenUsage.conversationTotal || 0,
          contextUsagePercentage: response.tokenUsage.contextUsagePercentage || 0,
          globalTotal: tokenStats?.globalTotal || 0, // Keep existing global total
        });
        
        // Refresh global stats
        refreshTokenStats();
      }

      // ✅ If agent provided thinking steps, show them
      if (response.thinkingSteps && response.thinkingSteps.length > 0) {
        console.log('[ChatWidget] 🤖 Agent provided thinking steps:', response.thinkingSteps);
        // Convert agent steps to the format expected by UI
        const agentStepObjects = response.thinkingSteps.map((step: any) => ({
          text: step.label,
          status: step.status, // pending, in_progress, completed, error
          detail: step.detail,
          error: step.error
        }));
        setThinkingStepObjects(agentStepObjects);
      }

      // Scroll to bottom after adding assistant message
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      // Handle any actions returned by AI (e.g., service request drafts)
      if (response.actions && response.actions.length > 0) {
        console.log('AI suggested actions:', response.actions);

        const srDraft = response.actions.find(
          (a: any) =>
            a.endpoint === 'ivanti://serviceRequest/draft' &&
            a.body &&
            a.body.subscriptionId &&
            a.body.fieldset &&
            Array.isArray(a.body.fieldset.fields)
        );

        if (srDraft) {
          const { subscriptionId, offeringName, fieldset, readyForConfirmation, missingRequiredFields } = srDraft.body;
          
          // ✅ ALWAYS show the form, even with missing fields
          // This allows users to see what's needed and fill in missing fields
          // Submit button will be disabled until all required fields are filled
          console.log('[ChatWidget] 📋 Creating fields from fieldset:', fieldset);
          console.log('[ChatWidget] 📋 Fieldset.fields:', fieldset.fields);
          console.log('[ChatWidget] ⚠️ Ready for confirmation:', readyForConfirmation);
          console.log('[ChatWidget] ⚠️ Missing required fields:', missingRequiredFields);
          
          const fields = fieldset.fields.map((f: any) => ({
            name: f.name,
            label: f.label,
            required: !!f.required,
            value: f.defaultValue ?? '',
            options: f.options || undefined,
          }));

          console.log('[ChatWidget] 📋 Mapped fields with values:', fields);
          console.log('[ChatWidget] 📋 Fields count:', fields.length);

          setPendingServiceRequest({
            subscriptionId,
            offeringName: offeringName || fieldset.name || 'Service Request',
            fields,
            error: readyForConfirmation === false && missingRequiredFields?.length 
              ? `Please fill in ${missingRequiredFields.length} required field${missingRequiredFields.length > 1 ? 's' : ''} before submitting: ${missingRequiredFields.map((mf: any) => mf.label || mf.name).join(', ')}`
              : undefined,
            missingFields: missingRequiredFields || undefined,
            readyForConfirmation: readyForConfirmation !== false, // Store this to disable submit button
          });
        }
      }

    } catch (error: any) {
      // Log technical details to console (for developers/debugging)
      console.error('[ChatWidget] ❌ Error sending message:', {
        error: error,
        message: error.message,
        name: error.name,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      // Show user-friendly error message (no technical details)
      let userFriendlyMessage = 'Sorry, I encountered an issue. Please try again.';
      
      if (error?.message?.includes('too long') || error?.message?.includes('timeout')) {
        userFriendlyMessage = '⏱️ This is taking longer than expected. Please try again in a moment.';
      } else if (error?.message?.includes('connect') || error?.message?.includes('network')) {
        userFriendlyMessage = '🌐 I\'m having trouble connecting right now. Please check your internet connection.';
      } else if (error?.message?.includes('processing')) {
        userFriendlyMessage = '⚠️ There was a problem processing your request. Please try again.';
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: userFriendlyMessage,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      if (thinkingIntervalRef.current) {
        window.clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
      setThinkingSteps([]);
      setThinkingStepObjects([]);
      setThinkingStepIndex(0);
      
      // Auto-focus input after message is sent
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  // Clear conversation (2025 BEST PRACTICE: User-controlled data deletion)
  const clearConversation = () => {
    if (!confirm('Are you sure you want to clear this conversation? This action cannot be undone.')) {
      return;
    }

    // Clear from memory
    setMessages([]);
    
    // Clear from storage
    const storageKey = getConversationStorageKey();
    if (storageKey) {
      chrome.storage.local.remove([storageKey], () => {
        console.log('✅ ChatWidget: User cleared conversation history');
      });
    }

    // Clear from background script (in-memory conversation)
    chrome.runtime.sendMessage({
      type: 'CLEAR_CONVERSATION'
    }).catch(() => {
      // Ignore errors
    });

    // Create new welcome message
    createWelcomeMessage();
  };

  const handleHide = () => {
    setIsHidden(true);
    setIsOpen(false);
    // Persist hidden state
    chrome.storage.local.set({ aiAssistantHidden: true });
  };

  const handleShow = () => {
    setIsHidden(false);
    // Clear hidden state
    chrome.storage.local.remove(['aiAssistantHidden']);
  };

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + A to toggle chat (when not hidden)
      if (e.altKey && e.key === 'a' && !isHidden) {
        e.preventDefault();
        toggleChat();
      }
      // Escape to close chat or hide assistant
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isHidden]);

  const exportChat = () => {
    try {
      if (!messages || messages.length === 0) {
        alert('There is no conversation to export yet.');
        return;
      }

      const userLabel =
        currentUser?.fullName ||
        currentUser?.loginId ||
        'Unknown User';

      const headerLines: string[] = [
        'Service IT Plus AI - Chat Transcript',
        `User: ${userLabel}`,
        ticketId ? `Ticket: ${ticketId}` : 'Ticket: None',
        `Exported: ${new Date().toISOString()}`,
        '',
      ];

      const bodyLines = messages.map((m) => {
        const time = m.timestamp instanceof Date
          ? m.timestamp.toLocaleString()
          : new Date(m.timestamp).toLocaleString();
        const role = m.role === 'user' ? 'User' : 'Assistant';
        return `[${time}] ${role}: ${m.content}`;
      });

      const content = [...headerLines, ...bodyLines].join('\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `serviceit-ai-chat-${safeTimestamp}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting chat transcript:', error);
      alert('Sorry, there was a problem exporting the chat. Please try again.');
    }
  };

  return (
    <>
      {/* Floating Trigger Button - Always visible when chat is closed */}
      {!isOpen && (
        <>
          {/* When NOT hidden: Show main button with text and X on hover */}
          {!isHidden && (
        <div 
              className="sit-fixed sit-bottom-10 sit-right-6 sit-z-[2147483646] sit-group sit-flex sit-items-center sit-gap-3"
          style={{ zIndex: 2147483646 }}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              {/* AI Assistant Text - Only shows on hover, with background */}
          <div 
                className="sit-transition-all sit-duration-300 sit-pointer-events-none sit-flex sit-items-center sit-gap-1"
                style={{
                  opacity: isHovering ? 1 : 0,
                  transform: isHovering ? 'translateX(0)' : 'translateX(8px)',
                  padding: '6px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  border: '1px solid rgba(0, 43, 92, 0.1)',
                }}
              >
                <span 
                  style={{ 
                    color: theme.colors.primary,
                    fontSize: '18px',
                    fontWeight: '900',
                    letterSpacing: '0.3px',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                  }}
                >
                  AI
                </span>
                <span 
            style={{
                    color: theme.colors.secondary,
                    fontSize: '18px',
                    fontWeight: '900',
                    letterSpacing: '0.3px',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                  }}
                >
                  Assistant
                </span>
          </div>

              {/* Hide Button - Only shows on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleHide();
                }}
                className="sit-transition-all sit-duration-300 sit-cursor-pointer sit-flex sit-items-center sit-justify-center sit-pointer-events-auto sit-border-0 sit-rounded-full"
                style={{
                  width: '32px',
                  height: '32px',
                  color: 'white',
                  backgroundColor: theme.colors.primary,
                  opacity: isHovering ? 1 : 0,
                  transform: isHovering ? 'scale(1)' : 'scale(0.8)',
                  visibility: isHovering ? 'visible' : 'hidden',
                  boxShadow: '0 2px 8px rgba(0, 43, 92, 0.3)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#001a3d';
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 43, 92, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#002b5c';
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 43, 92, 0.3)';
                }}
                aria-label="Hide AI Assistant"
                title="Hide Assistant"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Main Chat Button */}
          <button
            onClick={toggleChat}
            className="sit-group sit-w-20 sit-h-20 sit-rounded-full sit-cursor-pointer sit-transition-all sit-duration-300 sit-flex sit-items-center sit-justify-center sit-pointer-events-auto sit-border-0 sit-overflow-hidden sit-relative"
            style={{
              backgroundColor: theme.colors.primary,
              boxShadow: `0 6px 24px ${theme.colors.primary}80`,
              padding: '12px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = `0 8px 32px ${theme.colors.primary}B3`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = `0 6px 24px ${theme.colors.primary}80`;
            }}
                aria-label="Open AI Assistant"
          >
            {/* Pulse Effect */}
            <div 
              className="sit-absolute sit-inset-0 sit-rounded-full sit-animate-pulse-ring"
              style={{
                border: '2px solid rgba(255, 153, 0, 0.5)',
                zIndex: -1,
              }}
            />
            
            <img 
              src={getLogoUrl()}
              alt="Chat"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                filter: 'brightness(0) invert(1)'
              }}
              onError={(e) => {
                e.currentTarget.src = chrome.runtime.getURL('icons/SERVICEITLOGO.png');
              }}
            />
          </button>
        </div>
          )}

          {/* When Hidden: Only show chevron button (like side panel) */}
          {isHidden && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShow();
              }}
              className="sit-fixed sit-bottom-10 sit-right-6 sit-z-[2147483646] sit-transition-all sit-duration-300 sit-cursor-pointer sit-flex sit-items-center sit-justify-center sit-pointer-events-auto sit-border-0 sit-rounded-full"
              style={{
                width: '40px',
                height: '40px',
                color: 'white',
                backgroundColor: '#002b5c',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#002b5c';
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#002b5c';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
              }}
              aria-label="Show AI Assistant"
              title="Show Assistant"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="sit-fixed sit-bottom-5 sit-right-5 sit-rounded-2xl sit-flex sit-flex-col sit-overflow-hidden sit-pointer-events-auto"
          style={{
            width: `${widgetWidth}px`,
            height: '600px',
            backgroundColor: '#ffffff',
            zIndex: 2147483646,
            boxShadow: '0 12px 48px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            minWidth: '300px',
            maxWidth: `${Math.min(window.innerWidth - 40, 800)}px`,
          }}
        >
          {/* Header */}
          <div
            className="sit-px-5 sit-py-4 sit-flex sit-items-center sit-justify-between sit-border-0"
            style={{ 
              backgroundColor: theme.colors.primary,
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="sit-flex sit-items-center sit-gap-3">
              <div 
                className="sit-w-11 sit-h-11 sit-rounded-full sit-flex sit-items-center sit-justify-center sit-border-0 sit-overflow-hidden"
                style={{ 
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                  padding: '4px',
                }}
              >
                <img 
                  src={getLogoUrl()}
                  alt={theme.systemName}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                  onError={(e) => {
                    e.currentTarget.src = chrome.runtime.getURL('icons/SERVICEITLOGO.png');
                  }}
                />
              </div>
              <div className="sit-flex sit-flex-col">
                <span style={{ 
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '15px',
                  lineHeight: '1.3',
                  margin: '0',
                }}>
                  {theme.systemName}
                </span>
                {ticketId ? (
                  <span style={{ 
                    color: theme.colors.secondary,
                    fontSize: '12px',
                    fontWeight: '500',
                    lineHeight: '1.3',
                    margin: '0',
                  }}>
                    Ticket #{ticketId}
                  </span>
                ) : (
                  <span style={{ 
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '11px',
                    lineHeight: '1.3',
                    margin: '0',
                  }}>
                    Always here to help
                  </span>
                )}
              </div>
            </div>
            <div className="sit-flex sit-items-center sit-gap-2">
              {/* Token Usage Indicator - Cursor-style */}
              {tokenStats && tokenStats.contextUsagePercentage > 0 && (
                <div
                  className="sit-relative sit-group"
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSettingsOpen(true);
                    setIsTokenStatsExpanded(true);
                  }}
                  title={`${tokenStats.contextUsagePercentage.toFixed(1)}% context used`}
                >
                  <div
                    className="sit-px-2 sit-py-1 sit-rounded-md sit-transition-all sit-duration-200"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(8px)',
                      fontSize: '11px',
                      fontWeight: '500',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      minWidth: '70px',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    <span>{tokenStats.contextUsagePercentage.toFixed(1)}%</span>
                    <span style={{ opacity: 0.7 }}>context</span>
                  </div>
                </div>
              )}
              {/* Settings Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSettingsOpen(!isSettingsOpen);
                }}
                className="sit-w-8 sit-h-8 sit-rounded-lg sit-flex sit-items-center sit-justify-center sit-cursor-pointer sit-transition-all sit-duration-200 sit-border-0"
                style={{ 
                  backgroundColor: isSettingsOpen ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  if (!isSettingsOpen) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSettingsOpen) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                title="Settings"
                aria-label="Settings"
              >
                <div style={{ color: '#ffffff' }}>
                  <Settings 
                    size={18} 
                    strokeWidth={2}
                  />
                </div>
              </button>
              <button
                onClick={toggleChat}
                className="sit-w-8 sit-h-8 sit-rounded-lg sit-flex sit-items-center sit-justify-center sit-cursor-pointer sit-transition-all sit-duration-200 sit-border-0"
                style={{ 
                  backgroundColor: 'transparent',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            className="sit-flex-1 sit-overflow-y-auto sit-px-4 sit-py-6"
            style={{ 
              backgroundColor: theme.colors.surface,
              position: 'relative', // For absolute positioning of background
            }}
          >
            {/* Background Logo */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '180px',
                height: '180px',
                opacity: '0.05', // Very subtle watermark
                pointerEvents: 'none', // Allow clicking through
                zIndex: 0,
                backgroundImage: `url(${getLogoUrl()})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                filter: 'grayscale(100%)', // Optional: make it grayscale for a watermark feel
              }}
            />

            <div className="sit-flex sit-flex-col sit-gap-5" style={{ position: 'relative', zIndex: 1 }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="sit-flex sit-flex-col sit-gap-2 sit-fade-in-up"
                  style={{
                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    className="sit-rounded-2xl sit-border-0"
                    style={message.role === 'user' ? { 
                      backgroundColor: theme.colors.primary,
                      color: '#ffffff !important',
                      borderBottomRightRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0, 43, 92, 0.15)',
                      padding: '12px 16px',
                      maxWidth: '85%',
                    } : {
                      backgroundColor: '#ffffff',
                      color: '#1f2937',
                      border: '1px solid #e5e7eb',
                      borderBottomLeftRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                      padding: '20px 24px',
                      maxWidth: '85%',
                      width: 'fit-content',
                      minWidth: '250px',
                      marginBottom: '4px',
                    }}
                  >
                    {message.role === 'assistant' ? (
                      <div
                        className="sit-w-full sit-text-slate-800"
                        style={{
                          margin: '0',
                          fontSize: '15px',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          color: theme.colors.textSecondary,
                          fontWeight: 400,
                          textAlign: 'left',
                          fontFamily: '-apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif',
                          maxWidth: '720px',
                          width: '100%',
                          display: 'block',
                        }}
                      >
                        {message.content.replace(/\*\*/g, '')}
                      </div>
                    ) : (
                      <p style={{ 
                        margin: '0',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: '#ffffff',
                        fontWeight: 400,
                        textAlign: 'left',
                      }}>
                        {message.content}
                      </p>
                    )}
                  </div>
                  <span style={{ 
                    fontSize: '11px',
                    color: theme.colors.textMuted,
                    margin: '0',
                    paddingLeft: message.role === 'user' ? '0' : '8px',
                    paddingRight: message.role === 'user' ? '8px' : '0',
                  }}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  {/* Contextual Suggestions - Show after assistant messages */}
                  {message.role === 'assistant' && message.suggestions && message.suggestions.length > 0 && (
                    <div className="sit-flex sit-flex-col sit-gap-2 sit-mt-3" style={{ 
                      position: 'relative', 
                      zIndex: 1,
                      paddingLeft: message.role === 'assistant' ? '8px' : '0',
                      paddingRight: message.role === 'assistant' ? '0' : '8px',
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: theme.colors.textMuted,
                        fontWeight: 500,
                        marginBottom: '4px',
                      }}>
                        Suggested actions:
                      </div>
                      <div className="sit-flex sit-flex-wrap sit-gap-2">
                        {message.suggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            onClick={async () => {
                              // Send suggestion prompt as user message
                              if (isLoading) return; // Prevent clicks while loading
                              
                              const userMessage: Message = {
                                id: Date.now().toString(),
                                role: 'user',
                                content: suggestion.prompt,
                                timestamp: new Date(),
                              };
                              
                              // Add user message first
                              setMessages(prev => [...prev, userMessage]);
                              
                              // Build thinking steps
                              const steps = buildThinkingStatusSteps(suggestion.prompt, ticketId, messages.length);
                              setIsLoading(true);
                              setThinkingStepObjects(steps);
                              setThinkingSteps(steps.map(s => s.text));
                              setThinkingStepIndex(0);
                              
                              // Scroll to bottom
                              setTimeout(() => {
                                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                              }, 100);
                              
                              try {
                                // Send message to background script
                                const response = await Promise.race([
                                  chrome.runtime.sendMessage({
                                    type: 'SEND_MESSAGE',
                                    message: suggestion.prompt,
                                    ticketId: ticketId,
                                    currentUser: currentUser,
                                    timestamp: userMessage.timestamp.toISOString(),
                                  }),
                                  new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Request timeout')), 90000)
                                  )
                                ]) as any;
                                
                                if (!response || !response.success) {
                                  throw new Error(response?.error || 'Failed to send message');
                                }
                                
                                const assistantMessage: Message = {
                                  id: (Date.now() + 1).toString(),
                                  role: 'assistant',
                                  content: response.message || 'I received your message.',
                                  timestamp: new Date(),
                                  suggestions: response.suggestions || [],
                                  tokenUsage: response.tokenUsage ? {
                                    inputTokens: response.tokenUsage.inputTokens || 0,
                                    outputTokens: response.tokenUsage.outputTokens || 0,
                                    totalTokens: response.tokenUsage.totalTokens || 0,
                                  } : undefined,
                                };
                                
                                setMessages(prev => [...prev, assistantMessage]);
                                
                                // Update token stats if provided
                                if (response.tokenUsage) {
                                  setTokenStats({
                                    conversationTotal: response.tokenUsage.conversationTotal || 0,
                                    contextUsagePercentage: response.tokenUsage.contextUsagePercentage || 0,
                                    globalTotal: tokenStats?.globalTotal || 0,
                                  });
                                  refreshTokenStats();
                                }
                                
                                // Handle thinking steps
                                if (response.thinkingSteps && response.thinkingSteps.length > 0) {
                                  const agentStepObjects = response.thinkingSteps.map((step: any) => ({
                                    text: step.label,
                                    status: step.status,
                                    detail: step.detail,
                                    error: step.error
                                  }));
                                  setThinkingStepObjects(agentStepObjects);
                                }
                                
                                // Handle actions (service requests, etc.)
                                if (response.actions && response.actions.length > 0) {
                                  const srDraft = response.actions.find(
                                    (a: any) =>
                                      a.endpoint === 'ivanti://serviceRequest/draft' &&
                                      a.body &&
                                      a.body.subscriptionId &&
                                      a.body.fieldset &&
                                      Array.isArray(a.body.fieldset.fields)
                                  );
                                  
                                  if (srDraft) {
                                    const { subscriptionId, offeringName, fieldset, readyForConfirmation, missingRequiredFields } = srDraft.body;
                                    const fields = fieldset.fields.map((f: any) => ({
                                      name: f.name,
                                      label: f.label,
                                      required: !!f.required,
                                      value: f.defaultValue ?? '',
                                      options: f.options || undefined,
                                    }));
                                    
                                    setPendingServiceRequest({
                                      subscriptionId,
                                      offeringName: offeringName || fieldset.name || 'Service Request',
                                      fields,
                                      error: readyForConfirmation === false && missingRequiredFields?.length 
                                        ? `Please fill in ${missingRequiredFields.length} required field${missingRequiredFields.length > 1 ? 's' : ''} before submitting: ${missingRequiredFields.map((mf: any) => mf.label || mf.name).join(', ')}`
                                        : undefined,
                                      missingFields: missingRequiredFields || undefined,
                                      readyForConfirmation: readyForConfirmation !== false,
                                    });
                                  }
                                }
                                
                                setTimeout(() => {
                                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                                }, 100);
                              } catch (error: any) {
                                console.error('[ChatWidget] ❌ Error sending suggestion:', error);
                                const errorMessage: Message = {
                                  id: (Date.now() + 1).toString(),
                                  role: 'assistant',
                                  content: 'Sorry, I encountered an issue. Please try again.',
                                  timestamp: new Date(),
                                };
                                setMessages(prev => [...prev, errorMessage]);
                              } finally {
                                setIsLoading(false);
                                if (thinkingIntervalRef.current) {
                                  window.clearInterval(thinkingIntervalRef.current);
                                  thinkingIntervalRef.current = null;
                                }
                                setThinkingSteps([]);
                                setThinkingStepObjects([]);
                                setThinkingStepIndex(0);
                              }
                            }}
                            className="sit-px-4 sit-py-2 sit-rounded-lg sit-border sit-transition-all sit-duration-200 sit-cursor-pointer sit-text-sm sit-font-medium suggestion-button"
                            style={{
                              backgroundColor: '#ffffff',
                              borderColor: theme.colors.border,
                              color: theme.colors.textPrimary,
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme.colors.primary;
                              e.currentTarget.style.color = '#ffffff';
                              e.currentTarget.style.borderColor = theme.colors.primary;
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 43, 92, 0.2)';
                              const spans = e.currentTarget.querySelectorAll('span');
                              spans.forEach(span => {
                                (span as HTMLElement).style.color = '#ffffff';
                              });
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#ffffff';
                              e.currentTarget.style.color = theme.colors.textPrimary;
                              e.currentTarget.style.borderColor = theme.colors.border;
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                              const spans = e.currentTarget.querySelectorAll('span');
                              spans.forEach(span => {
                                (span as HTMLElement).style.color = '';
                              });
                            }}
                          >
                            {suggestion.icon && <span style={{ color: 'inherit' }}>{suggestion.icon}</span>}
                            <span style={{ color: 'inherit' }}>{suggestion.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Template Prompt Buttons - Show only when there's just the welcome message */}
              {messages.length === 1 && 
               messages[0]?.role === 'assistant' && 
               !isLoading && (
                <div className="sit-flex sit-flex-col sit-gap-3 sit-mt-2" style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    fontSize: '12px',
                    color: theme.colors.textMuted,
                    fontWeight: 500,
                    marginBottom: '4px',
                  }}>
                    Quick actions:
                  </div>
                  <div className="sit-flex sit-flex-wrap sit-gap-2">
                    {PROMPT_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className="sit-px-4 sit-py-2 sit-rounded-lg sit-border sit-transition-all sit-duration-200 sit-cursor-pointer sit-text-sm sit-font-medium template-button"
                        style={{
                          backgroundColor: '#ffffff',
                          borderColor: theme.colors.border,
                          color: theme.colors.textPrimary,
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.colors.primary;
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.borderColor = theme.colors.primary;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 43, 92, 0.2)';
                          // Ensure all child elements (icon and label) also turn white
                          const spans = e.currentTarget.querySelectorAll('span');
                          spans.forEach(span => {
                            (span as HTMLElement).style.color = '#ffffff';
                          });
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#ffffff';
                          e.currentTarget.style.color = theme.colors.textPrimary;
                          e.currentTarget.style.borderColor = theme.colors.border;
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                          // Reset child elements color
                          const spans = e.currentTarget.querySelectorAll('span');
                          spans.forEach(span => {
                            (span as HTMLElement).style.color = '';
                          });
                        }}
                      >
                        {template.icon && <span style={{ color: 'inherit' }}>{template.icon}</span>}
                        <span style={{ color: 'inherit' }}>{template.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Service Request confirmation card */}
              {pendingServiceRequest && (
                <div className="sit-flex sit-flex-col sit-gap-2 sit-fade-in-up" style={{ alignItems: 'flex-start' }}>
                  <div
                    className="sit-rounded-2xl sit-border sit-border-slate-200 sit-bg-white"
                    style={{
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
                      padding: '16px 18px',
                      maxWidth: '85%',
                      width: '100%',
                    }}
                  >
                    <div className="sit-flex sit-flex-col sit-gap-2">
                      <div className="sit-text-sm sit-font-semibold sit-text-slate-800">
                        Review Service Request
                      </div>
                      <div className="sit-text-xs sit-text-slate-500 sit-mb-1">
                        {pendingServiceRequest.offeringName}
                      </div>

                      {pendingServiceRequest.error && (
                        <div className="sit-bg-red-50 sit-border sit-border-red-200 sit-rounded-md sit-p-2 sit-mb-2">
                          <div className="sit-flex sit-items-start sit-gap-2">
                            <span className="sit-text-red-600 sit-font-bold">⚠️</span>
                            <div className="sit-flex-1">
                              <div className="sit-text-xs sit-font-semibold sit-text-red-800 sit-mb-1">
                                Cannot Submit - Missing Required Fields
                              </div>
                              <br />
                              <div className="sit-text-xs sit-text-red-700">
                                {pendingServiceRequest.error}
                              </div>
                              <br />
                              {pendingServiceRequest.missingFields && pendingServiceRequest.missingFields.length > 0 && (
                                <div className="sit-mt-2 sit-text-xs sit-text-red-600">
                                  <strong>Missing fields:</strong>{' '}
                                  {pendingServiceRequest.missingFields.map((mf: any) => mf.label || mf.name).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="sit-flex sit-flex-col sit-gap-2 sit-mt-1">
                        {pendingServiceRequest.fields.map((field) => {
                          const isMissing =
                            pendingServiceRequest.missingFields &&
                            pendingServiceRequest.missingFields.some((mf) => mf.name === field.name);

                          return (
                            <div key={field.name} className="sit-flex sit-flex-col sit-gap-1">
                              <label className="sit-text-xs sit-font-medium sit-text-slate-700">
                                {field.label}
                                {field.required && <span className="sit-text-red-500"> *</span>}
                              </label>
                              {field.options && field.options.length > 0 ? (
                                <>
                                  <select
                                    className={`sit-text-xs sit-rounded-md sit-border sit-px-2 sit-py-1 focus:sit-outline-none focus:sit-ring-2 ${
                                      isMissing
                                        ? 'sit-border-red-400 sit-bg-red-50 focus:sit-ring-red-500'
                                        : 'sit-border-slate-300 focus:sit-ring-sit-primary-500'
                                    }`}
                                    value={field.value || ''}
                                    onChange={(e) => handleUpdatePendingField(field.name, e.target.value)}
                                  >
                                    <option value="">Select an option...</option>
                                    {field.options.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  {/* ✅ Show available options as help text */}
                                  {field.options.length <= 10 && (
                                    <div className="sit-text-[10px] sit-text-slate-500 sit-mt-0.5">
                                      💡 Available: {field.options.slice(0, 8).map(opt => opt.label).join(', ')}
                                      {field.options.length > 8 && ` (+${field.options.length - 8} more)`}
                                    </div>
                                  )}
                                  {field.options.length > 10 && (
                                    <div className="sit-text-[10px] sit-text-slate-500 sit-mt-0.5">
                                      💡 {field.options.length} options available - select from dropdown above
                                    </div>
                                  )}
                                </>
                              ) : (
                                <input
                                  className={`sit-text-xs sit-rounded-md sit-border sit-px-2 sit-py-1 focus:sit-outline-none focus:sit-ring-2 ${
                                    isMissing
                                      ? 'sit-border-red-400 sit-bg-red-50 focus:sit-ring-red-500'
                                      : 'sit-border-slate-300 focus:sit-ring-sit-primary-500'
                                  }`}
                                  type="text"
                                  value={field.value || ''}
                                  onChange={(e) => handleUpdatePendingField(field.name, e.target.value)}
                                  placeholder={field.required ? 'Enter required information...' : 'Optional - enter if needed'}
                                />
                              )}
                              {/* ✅ Enhanced error message with guidance */}
                              {isMissing && (
                                <div className="sit-text-[11px] sit-text-red-600 sit-font-medium sit-flex sit-items-start sit-gap-1 sit-mt-0.5">
                                  <span>⚠️</span>
                                  <div className="sit-flex-1">
                                    <div>This field is required and cannot be empty.</div>
                                    {field.options && field.options.length > 0 && (
                                      <div className="sit-mt-1 sit-text-[10px] sit-text-red-500">
                                        Please select from: {field.options.slice(0, 5).map(opt => opt.label).join(', ')}
                                        {field.options.length > 5 && ` or ${field.options.length - 5} more options`}
                                      </div>
                                    )}
                                    {!field.options && (
                                      <div className="sit-mt-1 sit-text-[10px] sit-text-red-500">
                                        {field.label.toLowerCase().includes('email') && 'Enter a valid email address'}
                                        {field.label.toLowerCase().includes('name') && 'Enter the person\'s full name'}
                                        {field.label.toLowerCase().includes('location') && 'Enter the location (e.g., "Manila Office", "Remote")'}
                                        {field.label.toLowerCase().includes('manager') && 'Enter the manager\'s name'}
                                        {!field.label.toLowerCase().includes('email') && !field.label.toLowerCase().includes('name') && !field.label.toLowerCase().includes('location') && !field.label.toLowerCase().includes('manager') && 'Enter the required information'}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="sit-flex sit-justify-end sit-gap-2 sit-mt-3">
                        <button
                          type="button"
                          className="sit-text-xs sit-font-medium sit-text-slate-500 sit-px-3 sit-py-1.5 sit-rounded-md hover:sit-bg-slate-100"
                          onClick={handleCancelPendingServiceRequest}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="sit-text-xs sit-font-medium sit-px-3 sit-py-1.5 sit-rounded-md"
                          style={{
                            backgroundColor: pendingServiceRequest.readyForConfirmation !== false 
                              ? theme.colors.primary 
                              : '#9ca3af',
                            color: 'white',
                            cursor: pendingServiceRequest.readyForConfirmation !== false 
                              ? 'pointer' 
                              : 'not-allowed',
                            opacity: pendingServiceRequest.readyForConfirmation !== false ? 1 : 0.6
                          }}
                          onClick={handleConfirmPendingServiceRequest}
                          disabled={pendingServiceRequest.readyForConfirmation === false}
                          title={pendingServiceRequest.readyForConfirmation === false 
                            ? `Please fill in all required fields: ${pendingServiceRequest.missingFields?.map(mf => mf.label).join(', ')}`
                            : 'Submit this service request'}
                        >
                          {pendingServiceRequest.readyForConfirmation === false 
                            ? 'Fill Required Fields First' 
                            : 'Confirm & Submit'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Enhanced Thinking Indicator - Cursor-style minimal design (no card, clean and elegant) */}
              {isLoading && thinkingStepObjects.length > 0 && (
                <div className="sit-flex sit-flex-col sit-gap-1 sit-fade-in-up" style={{ alignItems: 'flex-start', width: '100%', padding: '6px 0' }}>
                  {thinkingStepObjects.map((step, index) => {
                    const isCompleted = index < thinkingStepIndex;
                    const isCurrent = index === thinkingStepIndex;
                    const isPending = index > thinkingStepIndex;

                    return (
                      <div
                        key={index}
                        className="sit-flex sit-items-center sit-gap-2.5 sit-transition-all sit-duration-200"
                        style={{
                          opacity: isPending ? 0.35 : 1,
                          padding: '3px 0',
                          width: '100%',
                        }}
                      >
                        {/* Minimal Status Icon - Very subtle and clean */}
                        <div className="sit-flex-shrink-0" style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isCompleted ? (
                            // Clean checkmark - minimal green check
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              style={{
                                color: '#10b981',
                                animation: 'sit-fade-in 0.2s ease-in',
                              }}
                            >
                              <path
                                d="M9 12l2 2 4-4"
                                stroke="#10b981"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : isCurrent ? (
                            // Subtle spinner - clean and minimal
                            <div
                              className="sit-rounded-full sit-border-2"
                              style={{
                                width: '14px',
                                height: '14px',
                                borderColor: theme.colors.primary,
                                borderTopColor: 'transparent',
                                borderWidth: '2px',
                                animation: 'sit-spin 0.8s linear infinite',
                              }}
                            />
                          ) : (
                            // Very subtle empty circle for pending
                            <div
                              className="sit-rounded-full sit-border"
                              style={{
                                width: '14px',
                                height: '14px',
                                borderColor: '#d1d5db',
                                borderWidth: '1.5px',
                                backgroundColor: 'transparent',
                                opacity: 0.4,
                              }}
                            />
                          )}
                        </div>

                        {/* Step Text - Cursor-style clean typography */}
                        <span
                          style={{
                            fontWeight: isCurrent ? 500 : 400,
                            fontSize: '13px',
                            color: isCompleted ? theme.colors.textMuted : isCurrent ? theme.colors.textPrimary : theme.colors.textMuted,
                            lineHeight: '1.6',
                            transition: 'all 0.2s ease',
                            letterSpacing: '-0.01em',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          }}
                        >
                          {step.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fallback: Single step thinking indicator (backward compatibility) */}
              {isLoading && thinkingStepObjects.length === 0 && thinkingSteps.length > 0 && (
                <div className="sit-flex sit-flex-col sit-gap-1 sit-fade-in-up" style={{ alignItems: 'flex-start' }}>
                  <div
                    className="sit-flex sit-items-center sit-gap-3 sit-py-3 sit-px-4 sit-rounded-2xl sit-text-sm"
                    style={{
                      backgroundColor: '#f9fafb',
                      color: '#1f2937',
                      border: '1px solid #e5e7eb',
                      borderBottomLeftRadius: '4px',
                      maxWidth: '85%',
                    }}
                  >
                    <div className="sit-flex sit-items-center sit-gap-1.5" style={{ flex: 1 }}>
                      <span style={{ 
                        fontWeight: 400, 
                        fontSize: '14px',
                        color: '#6b7280',
                        lineHeight: '1.5',
                      }}>
                        {thinkingSteps[Math.min(thinkingStepIndex, thinkingSteps.length - 1)]}
                      </span>
                      <div className="sit-flex sit-items-center sit-gap-1" style={{ marginLeft: '4px' }}>
                        <span
                          style={{
                            width: '4px',
                            height: '4px',
                            backgroundColor: '#9ca3af',
                            borderRadius: '50%',
                            display: 'inline-block',
                            animation: 'sit-thinking-dot 1.4s ease-in-out infinite',
                            animationDelay: '0s',
                          }}
                        />
                        <span
                          style={{
                            width: '4px',
                            height: '4px',
                            backgroundColor: '#9ca3af',
                            borderRadius: '50%',
                            display: 'inline-block',
                            animation: 'sit-thinking-dot 1.4s ease-in-out infinite',
                            animationDelay: '0.2s',
                          }}
                        />
                        <span
                          style={{
                            width: '4px',
                            height: '4px',
                            backgroundColor: '#9ca3af',
                            borderRadius: '50%',
                            display: 'inline-block',
                            animation: 'sit-thinking-dot 1.4s ease-in-out infinite',
                            animationDelay: '0.4s',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <span style={{ 
                    fontSize: '11px',
                    color: theme.colors.textMuted,
                    margin: '0',
                    paddingLeft: '8px',
                  }}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {/* Fallback Typing Indicator - Only if no thinking steps */}
              {isLoading && thinkingSteps.length === 0 && (
                <div className="sit-flex sit-flex-col sit-gap-1 sit-fade-in-up" style={{ alignItems: 'flex-start' }}>
                  <div 
                    className="sit-px-4 sit-py-3 sit-rounded-2xl sit-flex sit-items-center sit-gap-2"
                    style={{
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderBottomLeftRadius: '4px',
                      width: 'fit-content',
                    }}
                  >
                    <div className="sit-flex sit-items-center sit-gap-1">
                      <span
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#9ca3af',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'sit-thinking-dot 1.4s ease-in-out infinite',
                          animationDelay: '0s',
                        }}
                      />
                      <span
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#9ca3af',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'sit-thinking-dot 1.4s ease-in-out infinite',
                          animationDelay: '0.2s',
                        }}
                      />
                      <span
                        style={{
                          width: '4px',
                          height: '4px',
                          backgroundColor: '#9ca3af',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'sit-thinking-dot 1.4s ease-in-out infinite',
                          animationDelay: '0.4s',
                        }}
                      />
                    </div>
                  </div>
                  <span style={{ 
                    fontSize: '11px',
                    color: theme.colors.textMuted,
                    margin: '0',
                    paddingLeft: '8px',
                  }}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div 
            className="sit-px-4 sit-py-4 sit-border-0"
            style={{ 
              backgroundColor: '#ffffff',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <div className="sit-flex sit-gap-2 sit-items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={isLoading}
                className="sit-flex-1 sit-px-4 sit-py-3 sit-rounded-xl sit-border sit-transition-all sit-duration-200"
                style={{ 
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                  fontSize: '14px',
                  color: theme.colors.textPrimary,
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = theme.colors.primary;
                  e.target.style.boxShadow = `0 0 0 3px ${theme.colors.primary}1A`;
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = theme.colors.border;
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputValue.trim()}
                className="sit-w-10 sit-h-10 sit-rounded-xl sit-flex sit-items-center sit-justify-center sit-cursor-pointer sit-transition-all sit-duration-200 sit-border-0"
                style={{ 
                  backgroundColor: inputValue.trim() && !isLoading ? theme.colors.secondary : theme.colors.border,
                  color: inputValue.trim() && !isLoading ? '#ffffff' : theme.colors.textMuted,
                  opacity: isLoading ? '0.6' : '1',
                  cursor: (!inputValue.trim() || isLoading) ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (inputValue.trim() && !isLoading) {
                    // Darken secondary color by ~10%
                    const darkenColor = (color: string) => {
                      if (color.startsWith('#')) {
                        const num = parseInt(color.replace('#', ''), 16);
                        const r = Math.max(0, (num >> 16) - 20);
                        const g = Math.max(0, ((num >> 8) & 0x00FF) - 20);
                        const b = Math.max(0, (num & 0x0000FF) - 20);
                        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
                      }
                      return color;
                    };
                    e.currentTarget.style.backgroundColor = darkenColor(theme.colors.secondary);
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (inputValue.trim() && !isLoading) {
                    e.currentTarget.style.backgroundColor = theme.colors.secondary;
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <Send size={18} strokeWidth={2} />
              </button>
            </div>
            <p style={{
              margin: '8px 0 0 0',
              paddingLeft: '0',
              fontSize: '11px',
              color: theme.colors.textMuted,
              textAlign: 'left',
              width: '100%',
            }}>
              Powered by Service IT
            </p>
          </div>
        </div>
      )}

      {/* Settings Dialog - Modern, Clean Design */}
      {isSettingsOpen && isOpen && (
        <div
          className="sit-fixed sit-rounded-2xl sit-flex sit-flex-col sit-overflow-hidden sit-pointer-events-auto"
          style={{
            width: `${Math.min(widgetWidth, 420)}px`,
            maxHeight: '500px',
            backgroundColor: '#ffffff',
            zIndex: 2147483647, // Above chat widget
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            border: 'none',
            minWidth: '320px',
            maxWidth: '420px',
            right: `${widgetWidth + 40}px`, // Position to the left of chat widget with 40px gap
            top: `calc(100vh - 600px - 20px)`, // Align with top of chat widget (600px height + 20px bottom margin)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Settings Header */}
          <div
            className="sit-px-5 sit-py-4 sit-flex sit-items-center sit-justify-between sit-border-0"
            style={{ 
              backgroundColor: theme.colors.primary,
              color: '#ffffff',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div className="sit-flex sit-items-center sit-gap-3" style={{ color: '#ffffff' }}>
              <Settings 
                size={20} 
                strokeWidth={2}
              />
              <span style={{ 
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '15px',
                lineHeight: '1.3',
                margin: '0',
              }}>
                Settings
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(false);
              }}
              className="sit-w-8 sit-h-8 sit-rounded-lg sit-flex sit-items-center sit-justify-center sit-cursor-pointer sit-transition-all sit-duration-200 sit-border-0"
              style={{ 
                backgroundColor: 'transparent',
                color: '#ffffff',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>

          {/* Settings Content */}
          <div 
            className="sit-flex-1 sit-overflow-y-auto"
            style={{ 
              backgroundColor: '#ffffff',
            }}
          >
            <div className="sit-flex sit-flex-col">
              {/* Themes Section */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTempTheme(theme); // Initialize temp theme with current theme
                  setIsThemeEditorOpen(true);
                }}
                className="sit-w-full sit-flex sit-items-center sit-justify-between sit-px-5 sit-py-3.5 sit-cursor-pointer sit-border-0 sit-transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div className="sit-flex sit-items-center sit-gap-2">
                  <Palette size={16} strokeWidth={2} color="#6b7280" />
                  <span style={{ 
                    color: '#1f2937',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}>
                    Customize Theme
                  </span>
                </div>
                <ChevronRight 
                  size={16} 
                  strokeWidth={2}
                  color="#6b7280"
                />
              </button>

              {/* Widget Width Control - Collapsible */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsWidgetWidthExpanded(!isWidgetWidthExpanded);
                }}
                className="sit-w-full sit-flex sit-items-center sit-justify-between sit-px-5 sit-py-3.5 sit-cursor-pointer sit-border-0 sit-transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ 
                  color: '#1f2937',
                  fontWeight: '600',
                  fontSize: '14px',
                }}>
                  Widget Width
                </span>
                <div className="sit-flex sit-items-center sit-gap-2">
                  <span style={{ 
                    color: '#6b7280',
                    fontSize: '13px',
                    fontWeight: '500',
                  }}>
                    {widgetWidth}px
                  </span>
                  <ChevronRight 
                    size={16} 
                    strokeWidth={2}
                    color="#6b7280"
                    style={{
                      transform: isWidgetWidthExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </div>
              </button>
              
              {/* Widget Width Content - Collapsible */}
              {isWidgetWidthExpanded && (
                <div className="sit-px-5 sit-py-4 sit-border-b" style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                  <div className="sit-flex sit-items-center sit-gap-3 sit-mb-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setWidgetWidth(prev => Math.max(300, prev - 50));
                      }}
                      className="sit-cursor-pointer sit-border-0 sit-rounded-lg sit-flex sit-items-center sit-justify-center"
                      style={{
                        width: '36px',
                        height: '36px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        color: '#1f2937',
                        fontSize: '18px',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#002b5c';
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                      title="Decrease width"
                      aria-label="Decrease width"
                    >
                      −
                    </button>
                    <div className="sit-flex-1 sit-h-2 sit-rounded-full" style={{ backgroundColor: '#e5e7eb' }}>
                      <div 
                        className="sit-h-full sit-rounded-full sit-transition-all"
                        style={{ 
                          backgroundColor: theme.colors.primary,
                          width: `${((widgetWidth - 300) / (800 - 300)) * 100}%`,
                          minWidth: '4px',
                        }}
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setWidgetWidth(prev => Math.min(window.innerWidth - 40, 800, prev + 50));
                      }}
                      className="sit-cursor-pointer sit-border-0 sit-rounded-lg sit-flex sit-items-center sit-justify-center"
                      style={{
                        width: '36px',
                        height: '36px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        color: '#1f2937',
                        fontSize: '18px',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#002b5c';
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }}
                      title="Increase width"
                      aria-label="Increase width"
                    >
                      +
                    </button>
                  </div>
                  <span style={{ 
                    color: '#6b7280',
                    fontSize: '12px',
                  }}>
                    Adjust the width of the chat widget (300px - 800px)
                  </span>
                </div>
              )}

              {/* Token Usage Statistics - Collapsible */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTokenStatsExpanded(!isTokenStatsExpanded);
                  if (!isTokenStatsExpanded) {
                    refreshTokenStats();
                  }
                }}
                className="sit-w-full sit-flex sit-items-center sit-justify-between sit-px-5 sit-py-3.5 sit-cursor-pointer sit-border-0 sit-transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ 
                  color: '#1f2937',
                  fontWeight: '600',
                  fontSize: '14px',
                }}>
                  Token Usage
                </span>
                <ChevronRight 
                  size={16} 
                  strokeWidth={2}
                  color="#6b7280"
                  style={{
                    transform: isTokenStatsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
              
              {/* Token Usage Content - Collapsible */}
              {isTokenStatsExpanded && (
                <div className="sit-px-5 sit-py-4 sit-border-b" style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                  {tokenStats ? (
                    <div className="sit-flex sit-flex-col sit-gap-3">
                      {/* Current Conversation Stats */}
                      <div className="sit-flex sit-flex-col sit-gap-1">
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                          Current Conversation
                        </div>
                        <div className="sit-flex sit-items-center sit-justify-between sit-text-xs" style={{ color: '#6b7280' }}>
                          <span>Context Used:</span>
                          <span style={{ fontWeight: '600', color: tokenStats.contextUsagePercentage > 80 ? '#dc2626' : tokenStats.contextUsagePercentage > 50 ? '#f59e0b' : '#10b981' }}>
                            {tokenStats.contextUsagePercentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="sit-flex sit-items-center sit-justify-between sit-text-xs" style={{ color: '#6b7280' }}>
                          <span>Total Tokens:</span>
                          <span style={{ fontWeight: '600', color: '#1f2937' }}>
                            {tokenStats.conversationTotal.toLocaleString()}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="sit-h-2 sit-rounded-full sit-mt-2" style={{ backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
                          <div 
                            className="sit-h-full sit-rounded-full sit-transition-all"
                            style={{ 
                              backgroundColor: tokenStats.contextUsagePercentage > 80 ? '#dc2626' : tokenStats.contextUsagePercentage > 50 ? '#f59e0b' : '#10b981',
                              width: `${Math.min(tokenStats.contextUsagePercentage, 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Global Stats */}
                      <div className="sit-flex sit-flex-col sit-gap-1 sit-pt-2" style={{ borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                          All Time
                        </div>
                        <div className="sit-flex sit-items-center sit-justify-between sit-text-xs" style={{ color: '#6b7280' }}>
                          <span>Total Tokens:</span>
                          <span style={{ fontWeight: '600', color: '#1f2937' }}>
                            {tokenStats.globalTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', padding: '8px 0' }}>
                      No token usage data yet
                    </div>
                  )}
                </div>
              )}

              {/* Clear Conversation - 2025 BEST PRACTICE: User-controlled data deletion */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearConversation();
                  setIsSettingsOpen(false);
                }}
                className="sit-w-full sit-flex sit-items-center sit-justify-between sit-px-5 sit-py-3.5 sit-cursor-pointer sit-border-0 sit-transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ 
                  color: '#dc2626',
                  fontWeight: '600',
                  fontSize: '14px',
                }}>
                  Clear Conversation
                </span>
                <span style={{ 
                  color: theme.colors.textMuted,
                  fontSize: '12px',
                }}>
                  Start fresh
                </span>
              </button>

              {/* Export Chat - Collapsible */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExportChatExpanded(!isExportChatExpanded);
                }}
                className="sit-w-full sit-flex sit-items-center sit-justify-between sit-px-5 sit-py-3.5 sit-cursor-pointer sit-border-0 sit-transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ 
                  color: '#1f2937',
                  fontWeight: '600',
                  fontSize: '14px',
                }}>
                  Export Chat
                </span>
                <ChevronRight 
                  size={16} 
                  strokeWidth={2}
                  color="#6b7280"
                  style={{
                    transform: isExportChatExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
              
              {/* Export Chat Content - Collapsible */}
              {isExportChatExpanded && (
                <div className="sit-px-5 sit-py-4 sit-border-b" style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportChat();
                    }}
                    className="sit-w-full sit-px-4 sit-py-3 sit-rounded-xl sit-text-sm sit-font-semibold sit-cursor-pointer sit-transition-all sit-duration-200 sit-border-0 sit-mb-2"
                    style={{
                      backgroundColor: theme.colors.primary,
                      color: '#ffffff',
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0, 43, 92, 0.15)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#001a3d';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 43, 92, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#002b5c';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 43, 92, 0.15)';
                    }}
                  >
                    Export Conversation
                  </button>
                  <span style={{ 
                    color: '#6b7280',
                    fontSize: '12px',
                  }}>
                    Download your chat history as a text file
                  </span>
                </div>
              )}

              {/* Customer Service Section - Clean, Modern Card Design */}
              <div 
                className="sit-mx-5 sit-my-4 sit-p-5 sit-rounded-xl"
                style={{ 
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div className="sit-flex sit-items-start sit-gap-4 sit-mb-4">
                  <div 
                    className="sit-w-12 sit-h-12 sit-rounded-xl sit-flex sit-items-center sit-justify-center sit-flex-shrink-0"
                    style={{ 
                      backgroundColor: theme.colors.primary,
                    }}
                  >
                    <div style={{ color: '#ffffff' }}>
                      <Mail 
                        size={20} 
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>
                  <div className="sit-flex-1">
                    <div style={{ 
                      color: theme.colors.primary, 
                      fontWeight: '700', 
                      fontSize: '15px',
                      marginBottom: '4px'
                    }}>
                      Need Help?
                    </div>
                    <br />
                    <div style={{ 
                      color: '#6b7280', 
                      fontSize: '13px',
                      lineHeight: '1.5'
                    }}>
                      Our support team is ready to assist you. Send us an email and we'll respond promptly.
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open('mailto:support@serviceitplus.com', '_blank');
                    setIsSettingsOpen(false);
                  }}
                  className="sit-w-full sit-px-4 sit-py-3 sit-rounded-xl sit-text-sm sit-font-semibold sit-cursor-pointer sit-transition-all sit-duration-200 sit-border-0 sit-flex sit-items-center sit-justify-center sit-gap-2"
                  style={{
                    backgroundColor: '#ff9900',
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(255, 153, 0, 0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e68a00';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 153, 0, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ff9900';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 153, 0, 0.2)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ color: '#ffffff' }}>
                    <Mail 
                      size={16} 
                      strokeWidth={2.5}
                    />
                  </div>
                  <span style={{ color: '#ffffff' }}>Contact Support</span>
                </button>
                
                <div 
                  className="sit-mt-3 sit-px-3 sit-py-2 sit-rounded-lg"
                  style={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText('support@serviceitplus.com').then(() => {
                      // Optional: Show toast notification
                    });
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.cursor = 'pointer';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <Mail size={14} strokeWidth={2} color="#6b7280" />
                  <span style={{ 
                    color: '#374151',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: '500'
                  }}>
                    support@serviceitplus.com
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overlay to close settings when clicking outside */}
      {isSettingsOpen && isOpen && (
        <div
          className="sit-fixed sit-inset-0"
          style={{
            zIndex: 2147483646, // Below settings but above chat
            backgroundColor: 'transparent',
            pointerEvents: 'auto',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsSettingsOpen(false);
          }}
        />
      )}

      {/* Theme Editor Modal */}
      {isThemeEditorOpen && (
        <ThemeEditor
          currentTheme={theme}
          tempTheme={tempTheme}
          onTempThemeChange={setTempTheme}
          onSave={() => {
            setTheme(tempTheme);
            setIsThemeEditorOpen(false);
          }}
          onCancel={() => {
            setTempTheme(theme); // Reset temp theme to current theme
            setIsThemeEditorOpen(false);
          }}
          onReset={() => {
            setTempTheme(DEFAULT_THEME);
          }}
        />
      )}
    </>
  );
};

export default ChatWidget;
