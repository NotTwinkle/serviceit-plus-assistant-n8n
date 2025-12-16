/**
 * DOM Scraping Utilities
 * 
 * Utilities for scraping user information from the DOM as fallback.
 * Used when API-based identification fails.
 */

/**
 * Check if text looks like a valid person's name
 */
export function isValidName(str: string): boolean {
  const trimmed = str.trim();
  
  // Must be at least 2 words (First Last)
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  
  // Each word must start with capital letter and be at least 2 chars
  for (const word of words) {
    if (!/^[A-Z][a-z]{1,}$/.test(word)) return false;
  }
  
  // Blacklist common UI terms
  const blacklist = [
    'Quick Links', 'Service IT', 'Log Out', 'Logout', 'Settings', 'Help', 'Support',
    'Home', 'Dashboard', 'Menu', 'Admin', 'Search', 'Filter', 'View', 'Edit',
    'Create', 'New', 'Save', 'Cancel', 'Back', 'Next', 'Previous', 'Close',
    'App Management', 'User And Roles', 'System Tools', 'Automation',
    'Service Request', 'Service Desk', 'Change Calendar', 'Call Log', 'Project Roles',
    'Discovered Assets', 'Site Configuration', 'Analytic Metrics', 'Business Value',
    'Week Number', 'Page Size', 'Modified On', 'Object Workspace', 'All Active',
    'Service Management', 'Ivanti Neurons', 'Bot Results', 'Value Modeling'
  ];
  
  // Check if any blacklist term matches
  if (blacklist.some(bad => trimmed.toLowerCase().includes(bad.toLowerCase()))) {
    return false;
  }
  
  // Must not contain common UI keywords
  if (/Desk|Request|Calendar|Log|Assets|Configuration|Metrics|Number|Size|Workspace|Management|Results|Modeling/i.test(trimmed)) {
    return false;
  }
  
  return true;
}

/**
 * Scan the top-right corner of the page for user names
 */
export function scanTopRightCorner(): Array<{text: string, score: number}> {
  const allElements = document.querySelectorAll('*');
  const candidates: Array<{text: string, score: number, element: Element}> = [];
  const windowWidth = window.innerWidth;

  for (const el of allElements) {
    const rect = el.getBoundingClientRect();
    
    // Only look in top 200px and right 30% of screen
    if (rect.top < 0 || rect.top > 200) continue;
    if (rect.left < windowWidth * 0.6) continue;

    // Get direct text only (not children)
    const directText = Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim())
      .filter(t => t && t.length > 0)
      .join(' ');

    if (directText && isValidName(directText)) {
      // Score based on position and context
      let score = 0;
      
      // Top-right corner is best
      if (rect.left > windowWidth * 0.8) score += 100;
      if (rect.top < 80) score += 50;
      
      // Prefer smaller elements
      if (rect.width < 200) score += 30;
      
      // Prefer elements with user-related classes
      const className = el.className?.toString().toLowerCase() || '';
      if (className.includes('user') || className.includes('profile')) score += 50;
      
      // Prefer clickable elements
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'a' || tagName === 'button' || tagName === 'span') score += 20;
      
      candidates.push({ text: directText, score, element: el });
    }
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);
  
  return candidates.map(c => ({ text: c.text, score: c.score }));
}

/**
 * Scrape display name from DOM (used as fallback hint for API lookup)
 * Enhanced version with multiple strategies
 */
export async function scrapeUserNameFromDOM(): Promise<string | null> {
  console.log("🔍 ServiceIT: Scraping display name from DOM...");
  
  try {
    // Wait a bit for the page to fully load (Ivanti uses lazy loading)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Strategy 1: Look for the user name in the visible header
    const headerSelectors = [
      'header [class*="user"]',
      'header [class*="profile"]',
      '.header-user',
      '.header-profile',
      '[role="banner"] [class*="user"]'
    ];

    for (const selector of headerSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.trim();
        if (text && isValidName(text)) {
          console.log(`✅ ServiceIT: Found user via header selector "${selector}": ${text}`);
          return text;
        }
      }
    }

    // Strategy 2: Look for common Ivanti user menu selectors
    const commonSelectors = [
      '.user-name',
      '.username',
      '.user-display-name',
      '.profile-name',
      '.current-user',
      '[class*="user"][class*="name"]',
      '[id*="user"][id*="name"]',
      '.x-btn-inner', // ExtJS button text
      '.x-menu-item-text', // ExtJS menu items
      '[data-user-name]',
      '[data-username]'
    ];

    for (const selector of commonSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.trim();
        if (text && isValidName(text)) {
          console.log(`✅ ServiceIT: Found user via selector "${selector}": ${text}`);
          return text;
        }
      }
    }

    // Strategy 3: Look in the top-right corner
    const candidates = scanTopRightCorner();
    if (candidates.length > 0) {
      console.log("✅ ServiceIT: DOM scraped candidates:", candidates.slice(0, 5));
      return candidates[0].text;
    }

    // Strategy 4: Look for elements with aria-label or title containing "user"
    const ariaElements = document.querySelectorAll('[aria-label*="user" i], [title*="user" i]');
    for (const el of ariaElements) {
      const text = el.textContent?.trim();
      if (text && isValidName(text)) {
        console.log(`✅ ServiceIT: Found user via aria/title: ${text}`);
        return text;
      }
    }

    console.log("❌ ServiceIT: No valid name found in DOM after all strategies");
    return null;

  } catch (e) {
    console.error("❌ ServiceIT: DOM scraping failed", e);
    return null;
  }
}
