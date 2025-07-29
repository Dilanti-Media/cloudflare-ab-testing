/**
 * Google Analytics 4 Tracking for A/B Testing
 * 
 * Handles automatic GA4 tracking when enabled via plugin settings
 * 
 * Features:
 * - Conditional loading based on plugin settings
 * - Path-based test activation
 * - Cookie-based variant detection
 * - Custom event naming support
 * - GA4 dataLayer integration
 */

(function() {
    'use strict';

    // Check if GA4 tracking is enabled
    if (!window.cloudflareAbTesting || !window.cloudflareAbTesting.ga4) {
        return; // GA4 not configured, exit early
    }

    const config = window.cloudflareAbTesting.ga4;
    const tests = window.cloudflareAbTesting.registry || [];

    /**
     * Get cookie value by name
     * @param {string} name - Cookie name to retrieve
     * @returns {string|null} Cookie value or null if not found
     */
    function getCookieValue(name) {
        const re = new RegExp(
            "(?:^|; )" +
            name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') +
            "=([^;]*)"
        );
        const match = document.cookie.match(re);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * Initialize A/B test tracking for GA4
     * 
     * This function is called automatically when the script loads
     * to set up tracking for all active A/B tests on the current page.
     */
    function initABTracking() {
        const path = window.location.pathname;
        window.dataLayer = window.dataLayer || [];

        // Process each test in the registry
        tests.forEach(entry => {
            // Check if test is active for current path
            const isActive = entry.paths.some(prefix =>
                path === prefix || path.startsWith(prefix + '/')
            );

            if (!isActive) {
                return; // Skip tests not active on this page
            }

            // Read the cookie for this test
            let variant = getCookieValue(entry.cookieName);
            
            // If no cookie yet, default to "A" (Worker will override on actual response)
            if (variant !== 'A' && variant !== 'B') {
                variant = 'A';
            }

            // Get event name from config or use default
            const eventName = config.eventName || 'abVariantInit';

            // Build the event data object
            const eventData = {
                event: eventName,
                ab_test: entry.test,
                ab_variant: variant
            };

            // Add custom dimensions if provided
            if (config.customDimensions) {
                const customDims = config.customDimensions.split(',')
                    .map(dim => dim.trim())
                    .filter(dim => dim);
                
                customDims.forEach(dim => {
                    eventData[dim] = {
                        test: entry.test,
                        variant: variant,
                        path: path
                    };
                });
            }

            // Add standard A/B testing dimensions
            eventData.ab_session = {
                test: entry.test,
                variant: variant,
                path: path,
                timestamp: new Date().toISOString()
            };

            // Special handling for Google Analytics Enhanced Ecommerce
            if (typeof gtag !== 'undefined') {
                // Direct gtag integration
                gtag('event', eventName, eventData);
            } else {
                // Standard dataLayer integration
                window.dataLayer.push(eventData);
            }

            // Debug output for admin users
            if (window.cloudflareAbTesting.debug) {
                console.log('GA4 A/B Test Tracking:', {
                    test: entry.test,
                    variant: variant,
                    event: eventName,
                    path: path
                });
            }
        });
    }

    /**
     * Update tracking when variant changes (via cookie)
     * Useful for user-initiated changes or testing scenarios
     * 
     * @param {string} testName - The test slug/identifier
     * @param {string} newVariant - The new variant ('A' or 'B')
     */
    function updateVariantTracking(testName, newVariant) {
        if (!config.enabled || typeof testName === 'undefined' || typeof newVariant === 'undefined') {
            return;
        }

        window.dataLayer = window.dataLayer || [];
        const eventName = config.eventName || 'abVariantInit';

        const updateData = {
            event: eventName,
            ab_test: testName,
            ab_variant: newVariant,
            ab_update_type: 'variant_change'
        };

        window.dataLayer.push(updateData);

        // Debug output
        if (window.cloudflareAbTesting.debug) {
            console.log('GA4 A/B Variant Updated:', updateData);
        }
    }

    /**
     * Manual trigger for A/B test events
     * Useful for custom integrations or testing
     * 
     * @param {Object} options - Event configuration
     * @param {string} options.test - Test identifier
     * @param {string} options.variant - Variant ('A' or 'B')
     * @param {string} [options.eventName] - Custom event name
     * @param {Object} [options.customData] - Additional event data
     */
    function trackABTest(options = {}) {
        if (!config.enabled || !options.test || !options.variant) {
            return;
        }

        const eventName = options.eventName || config.eventName || 'abVariantInit';
        const eventData = {
            event: eventName,
            ab_test: options.test,
            ab_variant: options.variant,
            ...options.customData
        };

        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(eventData);
    }

    // Initialize tracking when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initABTracking);
    } else {
        // DOM already loaded
        initABTracking();
    }

    // Expose public API for advanced integrations
    window.cloudflareAbTesting.ga4 = {
        updateVariant: updateVariantTracking,
        trackTest: trackABTest,
        isEnabled: function() {
            return config.enabled === true;
        }
    };

})();