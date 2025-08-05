/**
 * Simplified Google Analytics 4 A/B Testing Tracker
 *
 * Basic GA4 tracking for A/B tests with minimal complexity
 */

(function() {
  'use strict';

  console.log(gtag);

  // Exit early if not configured
  if (!window.cloudflareAbTesting?.ga4) {
    return;
  }

  console.log(gtag);

  const config = window.cloudflareAbTesting.ga4;
  const tests = window.cloudflareAbTesting.registry || [];
  const DEBUG = window.cloudflareAbTesting?.debug || false;

  function log(message, data) {
    if (DEBUG) {
      console.log(`[GA4 A/B] ${message}`, data || '');
    }
  }

  /**
   * Get variant from meta tag (primary) or URL parameter (fallback)
   */
  function getVariant(cookieName) {
    // Primary: Check Cloudflare Worker meta tag
    const metaVariant = document.querySelector('meta[name="cf-ab-variant"]')?.content?.trim();
    if (metaVariant === 'A' || metaVariant === 'B') {
      return metaVariant;
    }

    // Fallback: URL parameter (for debugging)
    const urlParams = new URLSearchParams(window.location.search);
    const urlVariant = urlParams.get(cookieName);
    if (urlVariant === 'A' || urlVariant === 'B') {
      return urlVariant;
    }

    return 'A'; // Default fallback
  }

  /**
   * Check if variant is valid (A or B)
   */
  function isValidVariant(variant) {
    return variant === 'A' || variant === 'B';
  }

  /**
   * Send tracking event to GA4
   */
  function trackEvent(testName, variant) {
    try {
      const eventName = config.eventName || 'ab_test_view';
      const eventData = {
        ab_test: testName,
        ab_variant: variant
      };

      // Ensure dataLayer exists
      window.dataLayer = window.dataLayer || [];

      // Send via gtag if available, otherwise use dataLayer
      if (typeof gtag !== 'undefined') {
        gtag('event', eventName, eventData);
        log('Event sent via gtag', { testName, variant });
      } else {
        window.dataLayer.push({
          event: eventName,
          ...eventData
        });
        log('Event sent via dataLayer', { testName, variant });
      }
    } catch (error) {
      console.error('[GA4 A/B] Tracking failed:', error.message);
    }
  }

  /**
   * Initialize A/B test tracking
   */
  function initTracking() {
    const currentPath = window.location.pathname;
    log('Initializing tracking', { path: currentPath, testsCount: tests.length });

    tests.forEach(test => {
      // Skip if no cookie name defined
      if (!test.cookieName) {
        log('Test missing cookieName - skipping', { test: test.test });
        return;
      }

      // Check if test is active on current path
      const paths = Array.isArray(test.paths) ? test.paths : [];
      const isActive = paths.some(path =>
          currentPath === path || currentPath.startsWith(path + '/')
      );

      if (!isActive) {
        log('Test inactive on path', { test: test.test, path: currentPath });
        return;
      }

      // Get variant from meta tag (set by Cloudflare Worker)
      let variant = getVariant(test.cookieName);

      log('Tracking test', { test: test.test, variant });
      trackEvent(test.test, variant);
    });
  }

  /**
   * Public API for manual tracking
   */
  function exposeAPI() {
    window.cloudflareAbTesting.ga4.track = function(testName, variant) {
      if (typeof testName === 'string' && testName.trim().length > 0 && isValidVariant(variant)) {
        trackEvent(testName, variant);
      } else {
        log('Invalid arguments to track():', { testName, variant });
      }
    };

    window.cloudflareAbTesting.ga4.isEnabled = function() {
      return config.enabled === true;
    };
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    console.log(gtag);
    document.addEventListener('DOMContentLoaded', initTracking);
  } else {
    // DOM already loaded - call directly
    initTracking();
  }

  // Expose public API
  exposeAPI();

  log('GA4 A/B tracker initialized');

})();
