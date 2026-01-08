/**
 * @fileoverview Validates external references (xrefs and trefs) by fetching live data from external gh-pages.
 * 
 * This script runs on page load and checks if external references are still valid:
 * - Checks if the referenced term still exists in the external specification
 * - Checks if the definition content has changed
 * - Displays visual indicators next to references when issues are detected
 * 
 * The validation works by:
 * 1. Collecting all unique external specifications from the page
 * 2. Fetching the live gh-page HTML for each external spec
 * 3. Extracting term definitions from the fetched HTML
 * 4. Comparing with the cached data in allXTrefs
 * 5. Adding visual indicators for missing or changed terms
 */

/**
 * Configuration object for the validator
 * @type {Object}
 */
const VALIDATOR_CONFIG = {
    // CSS classes for different validation states
    classes: {
        indicator: 'external-ref-validation-indicator',
        missing: 'external-ref-missing',
        changed: 'external-ref-changed',
        valid: 'external-ref-valid',
        error: 'external-ref-error'
    },
    // Text labels for indicators
    labels: {
        missing: '⚠️ Term not found',
        changed: '🔄 Definition changed',
        error: '❌ Could not verify',
        valid: '✓ Verified'
    },
    // Whether to show valid indicators (can be noisy)
    showValidIndicators: false,
    // Cache timeout in milliseconds (5 minutes)
    cacheTimeout: 5 * 60 * 1000
};

/**
 * Cache for fetched external specifications
 * Prevents redundant fetches for the same spec
 * @type {Map<string, {timestamp: number, data: Object}>}
 */
const fetchCache = new Map();

/**
 * Normalizes HTML content for comparison by removing extra whitespace and converting to lowercase
 * This helps compare definitions that might have minor formatting differences
 * 
 * @param {string} html - The HTML content to normalize
 * @returns {string} - Normalized text content
 */
function normalizeContent(html) {
    if (!html) return '';
    
    // Create a temporary element to parse HTML and extract text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get text content and normalize whitespace
    return tempDiv.textContent
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extracts terms and their definitions from fetched HTML content
 * Parses the HTML structure used by Spec-Up-T specifications
 * 
 * @param {string} html - The full HTML of the fetched page
 * @returns {Map<string, {content: string, rawContent: string}>} - Map of term IDs to their definitions
 */
function extractTermsFromHtml(html) {
    const terms = new Map();
    
    // Create a DOM parser to work with the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all dt elements in terms-and-definitions-list
    const termElements = doc.querySelectorAll('dl.terms-and-definitions-list dt');
    
    termElements.forEach(dt => {
        // Extract term ID from the span element
        const termSpan = dt.querySelector('[id^="term:"]');
        if (!termSpan) return;
        
        const termId = termSpan.id;
        // Extract just the term name (last part after the last colon)
        const termName = termId.split(':').pop();
        
        // Get the definition content from the following dd element(s)
        let definitionContent = '';
        let rawContent = '';
        let sibling = dt.nextElementSibling;
        
        // Collect all consecutive dd elements (there can be multiple)
        while (sibling && sibling.tagName === 'DD') {
            // Skip meta-info wrapper elements for trefs
            if (!sibling.classList.contains('meta-info-content-wrapper')) {
                rawContent += sibling.outerHTML;
                definitionContent += sibling.textContent + ' ';
            }
            sibling = sibling.nextElementSibling;
        }
        
        terms.set(termName.toLowerCase(), {
            content: definitionContent.trim(),
            rawContent: rawContent,
            termId: termId
        });
    });
    
    return terms;
}

/**
 * Fetches the external specification page and extracts term definitions
 * Uses caching to prevent redundant fetches
 * 
 * @param {string} ghPageUrl - The URL of the external specification's gh-page
 * @param {string} specName - The name of the external specification (for logging)
 * @returns {Promise<Map<string, Object>|null>} - Map of terms or null if fetch fails
 */
async function fetchExternalSpec(ghPageUrl, specName) {
    // Check cache first
    const cached = fetchCache.get(ghPageUrl);
    if (cached && (Date.now() - cached.timestamp) < VALIDATOR_CONFIG.cacheTimeout) {
        return cached.data;
    }
    
    try {
        const response = await fetch(ghPageUrl, {
            mode: 'cors',
            headers: {
                'Accept': 'text/html'
            }
        });
        
        if (!response.ok) {
            console.warn(`[External Ref Validator] Failed to fetch ${specName}: ${response.status}`);
            return null;
        }
        
        const html = await response.text();
        const terms = extractTermsFromHtml(html);
        
        // Cache the result
        fetchCache.set(ghPageUrl, {
            timestamp: Date.now(),
            data: terms
        });
        
        return terms;
    } catch (error) {
        console.warn(`[External Ref Validator] Error fetching ${specName}:`, error.message);
        return null;
    }
}

/**
 * Creates a validation indicator element to display next to a reference
 * 
 * @param {string} type - The type of indicator: 'missing', 'changed', 'valid', or 'error'
 * @param {Object} details - Additional details to show in the indicator
 * @param {string} [details.message] - Custom message to display
 * @param {string} [details.oldContent] - The old/cached content
 * @param {string} [details.newContent] - The new/live content
 * @returns {HTMLElement} - The indicator element
 */
function createIndicator(type, details = {}) {
    const indicator = document.createElement('span');
    indicator.classList.add(
        VALIDATOR_CONFIG.classes.indicator,
        VALIDATOR_CONFIG.classes[type]
    );
    
    // Set the main label text
    const labelText = details.message || VALIDATOR_CONFIG.labels[type];
    indicator.setAttribute('title', labelText);
    
    // Create the visible indicator content
    const iconSpan = document.createElement('span');
    iconSpan.classList.add('indicator-icon');
    iconSpan.textContent = VALIDATOR_CONFIG.labels[type].split(' ')[0]; // Just the emoji
    indicator.appendChild(iconSpan);
    
    // For changed content, add a details popup
    if (type === 'changed' && details.oldContent && details.newContent) {
        indicator.classList.add('has-details');
        
        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('validation-details');
        detailsDiv.innerHTML = `
            <div class="validation-details-header">Definition Changed</div>
            <div class="validation-details-section">
                <strong>Cached (at build time):</strong>
                <div class="validation-content-old">${escapeHtml(truncateText(details.oldContent, 200))}</div>
            </div>
            <div class="validation-details-section">
                <strong>Current (live):</strong>
                <div class="validation-content-new">${escapeHtml(truncateText(details.newContent, 200))}</div>
            </div>
            <div class="validation-details-footer">
                <em>Rebuild the spec to update the definition</em>
            </div>
        `;
        indicator.appendChild(detailsDiv);
    }
    
    // For missing terms, add a simple tooltip
    if (type === 'missing') {
        indicator.classList.add('has-details');
        
        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('validation-details');
        detailsDiv.innerHTML = `
            <div class="validation-details-header">Term Not Found</div>
            <div class="validation-details-section">
                The term referenced here no longer exists in the external specification.
                It may have been renamed, moved, or removed.
            </div>
            <div class="validation-details-footer">
                <em>Check the external specification for updates</em>
            </div>
        `;
        indicator.appendChild(detailsDiv);
    }
    
    return indicator;
}

/**
 * Escapes HTML special characters to prevent XSS
 * 
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncates text to a maximum length with ellipsis
 * 
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
}

/**
 * Validates a single xref element against live data
 * 
 * @param {HTMLElement} element - The xref anchor element
 * @param {Map<string, Map<string, Object>>} liveData - Map of spec URLs to their live term data
 * @param {Object} cachedXtref - The cached xtref data for this reference
 */
function validateXref(element, liveData, cachedXtref) {
    if (!cachedXtref || !cachedXtref.ghPageUrl) {
        return; // No data to validate against
    }
    
    const liveTerms = liveData.get(cachedXtref.ghPageUrl);
    
    // Check if we could fetch the live data
    if (liveTerms === null) {
        const indicator = createIndicator('error');
        insertIndicatorAfterElement(element, indicator);
        return;
    }
    
    if (!liveTerms) {
        return; // Fetch is still pending or failed silently
    }
    
    const termKey = cachedXtref.term.toLowerCase();
    const liveTerm = liveTerms.get(termKey);
    
    // Check if term exists in live spec
    if (!liveTerm) {
        const indicator = createIndicator('missing');
        insertIndicatorAfterElement(element, indicator);
        return;
    }
    
    // Compare content
    const cachedNormalized = normalizeContent(cachedXtref.content);
    const liveNormalized = normalizeContent(liveTerm.rawContent);
    
    if (cachedNormalized !== liveNormalized) {
        const indicator = createIndicator('changed', {
            oldContent: cachedXtref.content ? extractTextFromHtml(cachedXtref.content) : 'No cached content',
            newContent: liveTerm.content || 'No live content'
        });
        insertIndicatorAfterElement(element, indicator);
        return;
    }
    
    // Content is valid and unchanged
    if (VALIDATOR_CONFIG.showValidIndicators) {
        const indicator = createIndicator('valid');
        insertIndicatorAfterElement(element, indicator);
    }
}

/**
 * Validates a single tref element against live data
 * 
 * @param {HTMLElement} element - The tref dt element
 * @param {Map<string, Map<string, Object>>} liveData - Map of spec URLs to their live term data
 * @param {Object} cachedXtref - The cached xtref data for this reference
 */
function validateTref(element, liveData, cachedXtref) {
    if (!cachedXtref || !cachedXtref.ghPageUrl) {
        return; // No data to validate against
    }
    
    const liveTerms = liveData.get(cachedXtref.ghPageUrl);
    
    // Check if we could fetch the live data
    if (liveTerms === null) {
        const indicator = createIndicator('error');
        insertIndicatorIntoTref(element, indicator);
        return;
    }
    
    if (!liveTerms) {
        return; // Fetch is still pending or failed silently
    }
    
    const termKey = cachedXtref.term.toLowerCase();
    const liveTerm = liveTerms.get(termKey);
    
    // Check if term exists in live spec
    if (!liveTerm) {
        const indicator = createIndicator('missing');
        insertIndicatorIntoTref(element, indicator);
        return;
    }
    
    // Compare content
    const cachedNormalized = normalizeContent(cachedXtref.content);
    const liveNormalized = normalizeContent(liveTerm.rawContent);
    
    if (cachedNormalized !== liveNormalized) {
        const indicator = createIndicator('changed', {
            oldContent: cachedXtref.content ? extractTextFromHtml(cachedXtref.content) : 'No cached content',
            newContent: liveTerm.content || 'No live content'
        });
        insertIndicatorIntoTref(element, indicator);
        return;
    }
    
    // Content is valid and unchanged
    if (VALIDATOR_CONFIG.showValidIndicators) {
        const indicator = createIndicator('valid');
        insertIndicatorIntoTref(element, indicator);
    }
}

/**
 * Extracts plain text from HTML content
 * 
 * @param {string} html - HTML content
 * @returns {string} - Plain text
 */
function extractTextFromHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
}

/**
 * Inserts an indicator element after an xref anchor
 * 
 * @param {HTMLElement} element - The anchor element
 * @param {HTMLElement} indicator - The indicator to insert
 */
function insertIndicatorAfterElement(element, indicator) {
    // Check if indicator already exists
    if (element.nextElementSibling?.classList.contains(VALIDATOR_CONFIG.classes.indicator)) {
        return; // Already has an indicator
    }
    element.insertAdjacentElement('afterend', indicator);
}

/**
 * Inserts an indicator element into a tref dt element
 * 
 * @param {HTMLElement} dtElement - The dt element
 * @param {HTMLElement} indicator - The indicator to insert
 */
function insertIndicatorIntoTref(dtElement, indicator) {
    // Find the span with the term text
    const termSpan = dtElement.querySelector('span.term-external');
    if (!termSpan) {
        return;
    }
    
    // Check if indicator already exists
    if (termSpan.querySelector('.' + VALIDATOR_CONFIG.classes.indicator)) {
        return; // Already has an indicator
    }
    
    termSpan.appendChild(indicator);
}

/**
 * Collects all unique external specifications from the page
 * by examining xref and tref elements
 * 
 * @returns {Map<string, {url: string, specName: string}>} - Map of ghPageUrls to spec info
 */
function collectExternalSpecs() {
    const specs = new Map();
    
    // Check if allXTrefs is available
    if (typeof allXTrefs === 'undefined' || !allXTrefs?.xtrefs) {
        console.warn('[External Ref Validator] allXTrefs data not available');
        return specs;
    }
    
    // Collect unique specs from allXTrefs
    allXTrefs.xtrefs.forEach(xtref => {
        if (xtref.ghPageUrl && !specs.has(xtref.ghPageUrl)) {
            specs.set(xtref.ghPageUrl, {
                url: xtref.ghPageUrl,
                specName: xtref.externalSpec
            });
        }
    });
    
    return specs;
}

/**
 * Finds the cached xtref data for an xref element
 * 
 * @param {HTMLElement} element - The xref anchor element
 * @returns {Object|null} - The cached xtref data or null
 */
function findCachedXtrefForXref(element) {
    if (typeof allXTrefs === 'undefined' || !allXTrefs?.xtrefs) {
        return null;
    }
    
    // Extract spec and term from data-local-href (format: #term:specName:termName)
    const localHref = element.getAttribute('data-local-href') || '';
    const match = localHref.match(/#term:([^:]+):(.+)/);
    
    if (!match) {
        return null;
    }
    
    const [, specName, termName] = match;
    
    // Find matching xtref
    return allXTrefs.xtrefs.find(x => 
        x.externalSpec === specName && 
        x.term.toLowerCase() === termName.toLowerCase()
    );
}

/**
 * Finds the cached xtref data for a tref element
 * 
 * @param {HTMLElement} element - The tref dt element or its inner span
 * @returns {Object|null} - The cached xtref data or null
 */
function findCachedXtrefForTref(element) {
    if (typeof allXTrefs === 'undefined' || !allXTrefs?.xtrefs) {
        return null;
    }
    
    // Get the original term from data attribute
    const termSpan = element.querySelector('[data-original-term]') || 
                     element.closest('[data-original-term]');
    
    if (!termSpan) {
        return null;
    }
    
    const originalTerm = termSpan.dataset.originalTerm;
    
    // Find matching xtref that has a tref source file
    return allXTrefs.xtrefs.find(x => 
        x.term.toLowerCase() === originalTerm.toLowerCase() &&
        x.sourceFiles?.some(sf => sf.type === 'tref')
    );
}

/**
 * Main validation function that orchestrates the entire validation process
 * Called after DOM is loaded and trefs are inserted
 */
async function validateExternalRefs() {
    console.log('[External Ref Validator] Starting validation...');
    
    // Collect unique external specs
    const specs = collectExternalSpecs();
    
    if (specs.size === 0) {
        console.log('[External Ref Validator] No external specifications to validate');
        return;
    }
    
    console.log(`[External Ref Validator] Found ${specs.size} external specification(s) to validate`);
    
    // Fetch all external specs in parallel
    const fetchPromises = Array.from(specs.entries()).map(async ([url, spec]) => {
        const terms = await fetchExternalSpec(url, spec.specName);
        return [url, terms];
    });
    
    const fetchResults = await Promise.all(fetchPromises);
    const liveData = new Map(fetchResults);
    
    // Validate all xref elements
    const xrefElements = document.querySelectorAll('a.x-term-reference');
    xrefElements.forEach(element => {
        const cachedXtref = findCachedXtrefForXref(element);
        if (cachedXtref) {
            validateXref(element, liveData, cachedXtref);
        }
    });
    
    // Validate all tref elements
    const trefElements = document.querySelectorAll('dt.term-external');
    trefElements.forEach(element => {
        const cachedXtref = findCachedXtrefForTref(element);
        if (cachedXtref) {
            validateTref(element, liveData, cachedXtref);
        }
    });
    
    console.log('[External Ref Validator] Validation complete');
    
    // Dispatch event to signal validation is complete
    document.dispatchEvent(new CustomEvent('external-refs-validated', {
        detail: {
            specsValidated: specs.size,
            xrefsValidated: xrefElements.length,
            trefsValidated: trefElements.length
        }
    }));
}

/**
 * Initialize the validator when DOM and trefs are ready
 * We wait for the 'trefs-inserted' event to ensure all content is in place
 */
function initializeValidator() {
    // Wait for trefs to be inserted first
    document.addEventListener('trefs-inserted', () => {
        // Small delay to ensure DOM is fully updated
        setTimeout(validateExternalRefs, 100);
    });
    
    // Fallback: if trefs-inserted doesn't fire within 3 seconds, run anyway
    setTimeout(() => {
        // Check if we've already validated
        if (document.querySelector('.' + VALIDATOR_CONFIG.classes.indicator)) {
            return; // Already ran
        }
        console.warn('[External Ref Validator] trefs-inserted event not received, validating anyway');
        validateExternalRefs();
    }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeValidator);
} else {
    initializeValidator();
}
