(function() {
    'use strict';

    // Data passed from WordPress is available in `cloudflareAbTesting.registry`
    const registry = window.cloudflareAbTesting?.registry || [];

    if (!registry || registry.length === 0) {
        console.log('[DM A/B] No tests configured.');
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

            console.log(`[DM A/B] Active test: '${entry.test}', Variant: '${variant}' on path: '${path}'`);
        });
    }

    // Run the logic once the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAbTests);
    } else {
        initializeAbTests();
    }

})();