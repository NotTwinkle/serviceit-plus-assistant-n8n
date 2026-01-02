/**
 * DOM Scraping Utilities
 * 
 * Utilities for scraping user information from the DOM as fallback.
 * Used when API-based identification fails.
 */

/**
 * Extract the actual name from a string that might contain prefixes (e.g., "SIT Lance Nunez" -> "Lance Nunez")
 */
function extractNameFromText(str: string): string {
  const trimmed = str.trim();
  const words = trimmed.split(/\s+/);
  
  // Known prefixes that should be removed (all uppercase, short codes)
  const knownPrefixes = ['SIT', 'ADMIN', 'USER', 'ROLE', 'ID'];
  
  // Known suffixes that should be removed
  const knownSuffixes = ['administrator', 'admin', 'user', 'manager'];
  
  // Start with all words
  let resultWords = [...words];
  
  // First, remove suffix if present (check last word)
  if (resultWords.length > 2 && resultWords[resultWords.length - 1]) {
    const lastWord = resultWords[resultWords.length - 1].toLowerCase();
    if (knownSuffixes.includes(lastWord)) {
      resultWords = resultWords.slice(0, -1);
    }
  }
  
  // Then, remove prefix if present (check first word)
  if (resultWords.length > 1 && resultWords[0]) {
    const firstWord = resultWords[0];
    const isPrefix = 
      (firstWord.length >= 2 && firstWord.length <= 5 && 
       firstWord === firstWord.toUpperCase() && 
       firstWord !== firstWord.toLowerCase()) ||
      knownPrefixes.includes(firstWord.toUpperCase());
    
    if (isPrefix) {
      resultWords = resultWords.slice(1);
    }
  }
  
  // Return the cleaned name
  const cleaned = resultWords.join(' ');
  return cleaned || trimmed; // Fallback to original if all words were removed
}

/**
 * Check if text looks like a valid person's name
 */
export function isValidName(str: string): boolean {
  const trimmed = str.trim();
  
  // Extract the actual name (remove prefixes/suffixes)
  const extractedName = extractNameFromText(trimmed);
  const words = extractedName.split(/\s+/);
  
  // Must be at least 2 words (First Last) after extraction
  if (words.length < 2 || words.length > 4) return false;
  
  // Each word must start with capital letter and be at least 2 chars
  // Allow all-uppercase short words (like "SIT") as prefixes, but validate the name part
  for (const word of words) {
    // Allow all-uppercase short codes (2-5 chars) - these are prefixes
    if (word.length >= 2 && word.length <= 5 && word === word.toUpperCase() && word !== word.toLowerCase()) {
      continue; // This is a prefix, skip validation
    }
    // Otherwise, must match standard name pattern: Capital letter + lowercase
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
  
  // Check if any blacklist term matches (check both original and extracted)
  if (blacklist.some(bad => trimmed.toLowerCase().includes(bad.toLowerCase()))) {
    return false;
  }
  if (blacklist.some(bad => extractedName.toLowerCase().includes(bad.toLowerCase()))) {
    return false;
  }
  
  // Must not contain common UI keywords
  if (/Desk|Request|Calendar|Log|Assets|Configuration|Metrics|Number|Size|Workspace|Management|Results|Modeling/i.test(extractedName)) {
    return false;
  }
  
  // After extraction, must have at least 2 valid name words
  const validNameWords = words.filter(w => {
    if (w.length >= 2 && w.length <= 5 && w === w.toUpperCase() && w !== w.toLowerCase()) {
      return false; // Skip prefix words
    }
    return /^[A-Z][a-z]{1,}$/.test(w);
  });
  
  return validNameWords.length >= 2;
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
 * Detect if the current page is a login page
 * Checks for common login interface elements
 */
export function detectLoginInterface(): boolean {
  console.log("🔍 ServiceIT: Checking for login interface...");
  
  try {
    // Check for password input (most reliable indicator)
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    if (passwordInputs.length > 0) {
      console.log(`✅ ServiceIT: Found ${passwordInputs.length} password input(s) - likely login page`);
      
      // Additional check: is there a visible login form?
      const form = passwordInputs[0].closest('form');
      if (form) {
        const formText = form.textContent?.toLowerCase() || '';
        const hasLoginKeywords = 
          formText.includes('login') || 
          formText.includes('sign in') || 
          formText.includes('username') || 
          formText.includes('email');
        
        if (hasLoginKeywords) {
          console.log("✅ ServiceIT: Login form detected - user is NOT logged in");
          return true;
        }
      }
      
      // If password input is visible and in viewport, likely login page
      const rect = passwordInputs[0].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log("✅ ServiceIT: Visible password input detected - likely login page");
        return true;
      }
    }
    
    // Check for login-related text in page title or headings
    const pageTitle = document.title.toLowerCase();
    const hasLoginTitle = 
      pageTitle.includes('login') || 
      pageTitle.includes('sign in') || 
      pageTitle.includes('authentication');
    
    if (hasLoginTitle) {
      console.log("✅ ServiceIT: Login page title detected");
      return true;
    }
    
    // Check for common login page structure
    const loginContainers = document.querySelectorAll('[class*="login" i], [id*="login" i]');
    for (const container of loginContainers) {
      const hasPasswordInput = container.querySelector('input[type="password"]');
      const hasSubmitButton = container.querySelector('button[type="submit"], input[type="submit"]');
      
      if (hasPasswordInput && hasSubmitButton) {
        console.log("✅ ServiceIT: Login container with form detected");
        return true;
      }
    }
    
    // Check URL for login indicators
    const url = window.location.href.toLowerCase();
    const loginUrlPatterns = [
      '/login',
      '/signin',
      '/sign-in',
      '/auth',
      '/authentication',
      '/logon',
      '/sign-on',
    ];
    
    for (const pattern of loginUrlPatterns) {
      if (url.includes(pattern)) {
        console.log(`✅ ServiceIT: Login URL pattern detected: ${pattern}`);
        return true;
      }
    }
    
    console.log("❌ ServiceIT: No login interface detected - user may be logged in");
    return false;
  } catch (e) {
    console.error("❌ ServiceIT: Error detecting login interface:", e);
    return false; // On error, assume not login page (safer to try initialization)
  }
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
    
    // Strategy 0: Find ALL text in the top-right corner and log it (from old implementation)
    // This is the "tally" approach - scan all elements and validate which ones are names
    console.log("🔍 ServiceIT: Looking for user in visible header (top-right corner scan)...");
    const topRightElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < 100 && rect.left > window.innerWidth * 0.7;
    });
    
    console.log(`🔍 ServiceIT: Found ${topRightElements.length} elements in top-right corner`);
    
    for (const el of topRightElements.slice(0, 20)) {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 100) {
        console.log(`  📍 Element text: "${text}"`);
        
        // FIRST: Extract the actual name (remove prefixes/suffixes like "SIT" and "Administrator")
        const extractedName = extractNameFromText(text);
        console.log(`  🔍 Extracted name from "${text}": "${extractedName}"`);
        
        // THEN: Check if the extracted name matches name pattern AND is visible (this is the "tally" validation)
        if (extractedName !== text && isValidName(extractedName)) {
          const rect = el.getBoundingClientRect();
          console.log(`  ✅ FOUND VALID NAME in header: "${text}" -> extracted: "${extractedName}" at position (${rect.left}, ${rect.top})`);
          return extractedName; // Return the cleaned name
        } else if (isValidName(text)) {
          // Also check original text in case it's already clean
          const rect = el.getBoundingClientRect();
          console.log(`  ✅ FOUND VALID NAME in header: "${text}" at position (${rect.left}, ${rect.top})`);
          return text;
        }
      }
    }
    
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
          const extractedName = extractNameFromText(text);
          console.log(`✅ ServiceIT: Found user via header selector "${selector}": ${text} -> extracted: "${extractedName}"`);
          return extractedName;
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
          const extractedName = extractNameFromText(text);
          console.log(`✅ ServiceIT: Found user via selector "${selector}": ${text} -> extracted: "${extractedName}"`);
          return extractedName;
        }
      }
    }

    // Strategy 3: Look in the top-right corner
    const candidates = scanTopRightCorner();
    if (candidates.length > 0) {
      console.log("✅ ServiceIT: DOM scraped candidates:", candidates.slice(0, 5));
      // Extract the actual name from the candidate (remove prefixes)
      const extractedName = extractNameFromText(candidates[0].text);
      return extractedName;
    }

    // Strategy 4: Look for elements with aria-label or title containing "user"
    const ariaElements = document.querySelectorAll('[aria-label*="user" i], [title*="user" i]');
    for (const el of ariaElements) {
      const text = el.textContent?.trim();
      if (text && isValidName(text)) {
        const extractedName = extractNameFromText(text);
        console.log(`✅ ServiceIT: Found user via aria/title: ${text} -> extracted: "${extractedName}"`);
        return extractedName;
      }
    }

    console.log("❌ ServiceIT: No valid name found in DOM after all strategies");
    return null;

  } catch (e) {
    console.error("❌ ServiceIT: DOM scraping failed", e);
    return null;
  }
}
