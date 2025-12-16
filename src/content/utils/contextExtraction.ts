/**
 * Context Extraction Utilities
 * 
 * Extracts context from the current page:
 * - Ticket RecId from URL
 * - Page type (incident, service request, etc.)
 * - Ivanti domain detection
 */

/**
 * Extract ticket RecId from URL query parameters
 * Ivanti URLs often contain RecId as a query parameter
 * Example: https://success.serviceitplus.com/HEAT/...?RecId=ABC123...
 */
export function extractTicketRecIdFromURL(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const recId = params.get('RecId') || params.get('recId') || params.get('RecID');
    
    if (recId && recId.length > 0) {
      console.log('[ContextExtraction] ✅ Found ticket RecId in URL:', recId);
      return recId;
    }
    
    // Also check hash fragment (some Ivanti pages use hash)
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const hashRecId = hashParams.get('RecId') || hashParams.get('recId');
      if (hashRecId) {
        console.log('[ContextExtraction] ✅ Found ticket RecId in hash:', hashRecId);
        return hashRecId;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[ContextExtraction] Error extracting RecId from URL:', error);
    return null;
  }
}

/**
 * Extract ticket RecId from page content (DOM)
 * Some Ivanti pages embed RecId in the page HTML
 */
export function extractTicketRecIdFromDOM(): string | null {
  try {
    // Look for common patterns where RecId might be embedded
    const patterns = [
      /RecId['":\s]*=['"]?([A-F0-9]{32})/i,
      /recId['":\s]*=['"]?([A-F0-9]{32})/i,
      /data-rec-id=['"]?([A-F0-9]{32})/i,
      /data-recId=['"]?([A-F0-9]{32})/i,
    ];
    
    const pageText = document.body?.innerText || document.body?.textContent || '';
    
    for (const pattern of patterns) {
      const match = pageText.match(pattern);
      if (match && match[1]) {
        console.log('[ContextExtraction] ✅ Found ticket RecId in DOM:', match[1]);
        return match[1];
      }
    }
    
    // Look for RecId in data attributes
    const elementsWithRecId = document.querySelectorAll('[data-rec-id], [data-recId], [data-rec-id]');
    for (const el of elementsWithRecId) {
      const recId = (el as HTMLElement).dataset.recId || 
                   (el as HTMLElement).dataset.recid ||
                   (el as HTMLElement).getAttribute('data-rec-id');
      if (recId && recId.length === 32) {
        console.log('[ContextExtraction] ✅ Found ticket RecId in data attribute:', recId);
        return recId;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[ContextExtraction] Error extracting RecId from DOM:', error);
    return null;
  }
}

/**
 * Get ticket RecId using all available methods
 * Tries URL first, then DOM
 */
export function getTicketRecId(): string | null {
  // Try URL first (most reliable)
  const urlRecId = extractTicketRecIdFromURL();
  if (urlRecId) {
    return urlRecId;
  }
  
  // Fallback to DOM
  const domRecId = extractTicketRecIdFromDOM();
  if (domRecId) {
    return domRecId;
  }
  
  return null;
}

/**
 * Detect if we're on an Ivanti domain
 */
export function isIvantiDomain(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return hostname.includes('serviceitplus.com') ||
         hostname.includes('ivanti.com') ||
         hostname.includes('heat');
}

/**
 * Detect page type from URL
 */
export function getPageType(): 'incident' | 'service-request' | 'unknown' {
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  
  if (path.includes('incident') || search.includes('incident')) {
    return 'incident';
  }
  
  if (path.includes('servicereq') || path.includes('service-request') || search.includes('servicereq')) {
    return 'service-request';
  }
  
  return 'unknown';
}

/**
 * Get full page context
 */
export function getPageContext(): {
  ticketRecId: string | null;
  pageType: 'incident' | 'service-request' | 'unknown';
  url: string;
  isIvanti: boolean;
} {
  return {
    ticketRecId: getTicketRecId(),
    pageType: getPageType(),
    url: window.location.href,
    isIvanti: isIvantiDomain(),
  };
}
