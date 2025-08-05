(function() {
    'use strict';

    // Data passed from WordPress is available in `cloudflareAbTesting.registry`
    const registry = window.cloudflareAbTesting?.registry || [];
    
    // Track which tests have already been processed to prevent duplicates
    const processedTests = new Set();

    if (!registry || registry.length === 0) {
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
     * Get variant from Cloudflare Worker servers (meta tag or headers)
     * This trusts the worker's actual assignment, bypassing cookies entirely
     */
    function getActualVariant(cookieName) {
        // Primary: Check Cloudflare Worker meta tag (server-assigned)
        const workerVariant = document.querySelector('meta[name="cf-ab-variant"]')?.content?.trim();
        if (workerVariant === 'A' || workerVariant === 'B') {
            if (window.cloudflareAbTesting?.debug) {
                console.log(`[Variant] Worker assigned: ${workerVariant} for ${cookieName}`);
            }
            return workerVariant;
        }

        // Debug: Check why meta tag is missing
        if (window.cloudflareAbTesting?.debug) {
            const allVariantMeta = document.querySelectorAll('meta[name="cf-ab-variant"]');
            const allTestMeta = document.querySelectorAll('meta[name="cf-ab-test"]');
            console.log(`[Variant Debug] Meta tags for ${cookieName}:`, {
                variantsFound: allVariantMeta.length,
                testsFound: allTestMeta.length,
                available: Array.from(allTestMeta).map(m => ({test: m.content, variant: allVariantMeta[0]?.content}))
            });
        }

        // URL parameter (for manual testing/debugging)
        const urlParams = new URLSearchParams(window.location.search);
        const urlVariant = urlParams.get(cookieName);
        if (urlVariant === 'A' || urlVariant === 'B') {
            return urlVariant;
        }

        // Issue warning if no worker signal
        if (window.cloudflareAbTesting?.debug) {
            console.warn(`[Variant Error] Worker meta tag missing for test ${cookieName}. Check:
              1. Worker deployment
              2. Test path matching
              3. Cache invalidation
              Current HTML has: document.querySelector('meta[name="cf-ab-variant"]') = ${document.querySelector('meta[name="cf-ab-variant"]')}
            `);
        }

        return 'A'; // Safe fallback - indicates configuration issue
    }

    /**
     * Processes all registered A/B tests.
     */
    function initializeAbTests() {
        const path = window.location.pathname;
        window.dataLayer = window.dataLayer || [];

        registry.forEach(entry => {
            // Skip if we've already processed this test
            const testKey = `${entry.test}-${path}`;
            if (processedTests.has(testKey)) {
                if (window.cloudflareAbTesting?.debug) {
                    console.log('[A/B Debug] Skipping already processed test:', entry.test);
                }
                return;
            }

            // Use consistent path matching logic for A/B test activation
            const isActive = entry.paths.some(prefix =>
                path === prefix || path.startsWith(prefix + '/')
            );

            // Debug: log test matching details
            if (window.cloudflareAbTesting?.debug) {
                console.log(
                    '[Test]',
                    'test:', entry.test,
                    'paths:', entry.paths,
                    'current path:', path,
                    'match?', isActive
                );
            }

            if (!isActive) {
                return;
            }

            // Get variant from multiple sources
            const variant = getActualVariant(entry.cookieName);
            const cookieValue = getCookieValue(entry.cookieName);

            // Enhanced debugging
            if (window.cloudflareAbTesting?.debug) {
                console.log('[A/B Debug] Test:', entry.test, {
                    'Cookie Value': cookieValue,
                    'Final Variant': variant,
                    'Cookie Name': entry.cookieName,
                    'All Cookies': document.cookie,
                    'Meta Tag': document.querySelector('meta[name="cf-ab-variant"]')?.content,
                    'URL Params': window.location.search
                });
            }

            // Mark this test as processed
            processedTests.add(testKey);

            // Push one dataLayer event carrying both the test name and variant
            // Push dataLayer event with consistent structure
            const eventData = {
                event: 'abVariantInit',
                ab_test: entry.test,      // e.g. "pricing_button"
                ab_variant: variant       // "A" or "B"
            };

            window.dataLayer.push(eventData);

            if (window.cloudflareAbTesting?.debug) {
                console.log('[GA4 Tracking] Pushed event:', eventData);
                console.log('[GA4 Tracking] Current dataLayer:', window.dataLayer);
            }
        });
    }

    /**
     * Initialize with retry mechanism for meta tag detection
     */
    function initializeWithRetry() {
        // Try immediately first
        initializeAbTests();
        
        // Retry to catch meta tags that might be injected after initial script execution
        // This handles cases where the DOM is not fully ready or meta tags are dynamically added
        setTimeout(() => {
            if (window.cloudflareAbTesting?.debug) {
                console.log('[A/B Debug] Running delayed retry to check for meta tags...');
            }
            initializeAbTests();
        }, 100);
        
        // One more try after page load completes to ensure meta tags are available
        setTimeout(() => {
            if (window.cloudflareAbTesting?.debug) {
                console.log('[A/B Debug] Running final retry after page load for meta tags...');
            }
            initializeAbTests();
        }, 1000);
    }

    // Run the logic once the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeWithRetry);
    } else {
        initializeWithRetry();
    }

    // Visual debug indicator removed to avoid confusion from stale cookie values
    // The actual variant is determined by the Cloudflare Worker, not JavaScript cookies

})();