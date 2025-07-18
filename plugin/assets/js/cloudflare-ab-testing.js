(function() {
    'use strict';

    // Debug mode - enabled for admin users or when WP_DEBUG is true
    const DEBUG_MODE = window.cloudflareAbTesting?.debug || false;

    // Debug logging helper
    function debugLog(...args) {
        if (DEBUG_MODE) {
            console.log(...args);
        }
    }

    // Data passed from WordPress is available in `cloudflareAbTesting.registry`
    const registry = window.cloudflareAbTesting?.registry || [];

    if (!registry || registry.length === 0) {
        debugLog('[DM A/B] No tests configured.');
        return;
    }

    /**
     * Helper to read a cookie by name.
     * @param {string} name - The name of the cookie.
     * @returns {string|null} - The cookie value or null if not found.
     */
    function getCookieValue(name) {
        const re = new RegExp(`(?:^|; )${name.replace(/([\.$?*|{}\\(\)\[\]\\\/\+^])/g, '\\$1')}=([^;]*)`);
        const match = document.cookie.match(re);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * Processes all registered A/B tests.
     */
    function initializeAbTests() {
        const path = window.location.pathname;
        window.dataLayer = window.dataLayer || [];

        registry.forEach(entry => {
            // Check if the current path matches any of the test's specified paths.
            // A match occurs if the path is identical or if it's a sub-path (e.g., /pricing/ matches /pricing/new-plan).
            const isActive = entry.paths.some(prefix => {
                if (path === prefix) return true;
                // Ensure trailing slash for prefix matching to avoid incorrect matches (e.g., /page matching /page-two).
                const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
                return path.startsWith(normalizedPrefix);
            });

            if (!isActive) {
                return;
            }

            // Read the cookie for this test.
            let variant = getCookieValue(entry.cookieName);

            // If no cookie is found (e.g., first visit, cache race), default to 'A'.
            // The Cloudflare worker is the source of truth and will set the definitive cookie.
            if (variant !== 'A' && variant !== 'B') {
                variant = 'A';
            }

            // Push the test information to the dataLayer for analytics.
            window.dataLayer.push({
                event: 'abVariantInit',
                ab_test: entry.test,      // e.g., "pricing_button"
                ab_variant: variant       // "A" or "B"
            });

            debugLog(`[DM A/B] Active test: '${entry.test}', Variant: '${variant}' on path: '${path}'`);
            
            // Add visual debug information for manual verification (only in debug mode)
            if (DEBUG_MODE) {
                console.log(`%c🧪 A/B Test Debug Info:`, 'color: #0073aa; font-weight: bold; font-size: 14px;');
                console.log(`%c   Test ID: ${entry.test}`, 'color: #0073aa;');
                console.log(`%c   Variant: ${variant}`, 'color: #0073aa; font-weight: bold;');
                console.log(`%c   Cookie: ${entry.cookieName}=${variant}`, 'color: #0073aa;');
                console.log(`%c   Path: ${path}`, 'color: #0073aa;');
                console.log(`%c   Matched Paths: ${entry.paths.join(', ')}`, 'color: #0073aa;');
            }
        });
    }

    // Run the logic once the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAbTests);
    } else {
        initializeAbTests();
    }

    // Add visual debug indicator in bottom right corner (only if debug mode is enabled)
    function addVisualDebugIndicator() {
        if (!DEBUG_MODE) {
            return; // Don't show visual indicator unless debug mode is enabled
        }
        const path = window.location.pathname;
        const activeTests = registry.filter(entry => {
            return entry.paths.some(prefix => {
                if (path === prefix) return true;
                const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
                return path.startsWith(normalizedPrefix);
            });
        });

        if (activeTests.length > 0) {
            const debugDiv = document.createElement('div');
            debugDiv.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #0073aa;
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 12px;
                z-index: 9999;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                cursor: pointer;
                max-width: 200px;
            `;
            
            const variants = activeTests.map(test => {
                const variant = getCookieValue(test.cookieName) || 'A';
                return `${test.test}: ${variant}`;
            }).join('<br>');
            
            debugDiv.innerHTML = `🧪 A/B Tests<br>${variants}`;
            debugDiv.title = 'Click to hide A/B test debug info';
            
            debugDiv.addEventListener('click', function() {
                this.style.display = 'none';
            });
            
            document.body.appendChild(debugDiv);
        }
    }

    // Add visual indicator when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addVisualDebugIndicator);
    } else {
        addVisualDebugIndicator();
    }

})();