/**
 * Simplified Google Analytics 4 A/B Testing Tracker
 *
 * Basic GA4 tracking for A/B tests with minimal complexity
 */

(function() {
  'use strict';

  // Exit early if not configured
  if (!window.cloudflareAbTesting?.ga4) {
    return;
  }

  const config = window.cloudflareAbTesting.ga4;
  const tests = window.cloudflareAbTesting.registry || [];
  const DEBUG = window.cloudflareAbTesting?.debug || false;

  function log(message, data) {
    if (DEBUG) {
      console.log(`[GA4 A/B] ${message}`, data || '');
    }
  }

  /**
   * Get cookie value by name
   */
  function getCookie(name) {
    // Escape special regex characters to prevent ReDoS
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp('(^|; )' + escapedName + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
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
  }

  /**
   * Initialize A/B test tracking
   */
  function initTracking() {
    const currentPath = window.location.pathname;
    log('Initializing tracking', { path: currentPath, testsCount: tests.length });

    tests.forEach(test => {
      // Check if test is active on current path
      const paths = Array.isArray(test.paths) ? test.paths : [];
      const isActive = paths.some(path =>
          currentPath === path || currentPath.startsWith(path + '/')
      );

      if (!isActive) {
        log('Test inactive on path', { test: test.test, path: currentPath });
        return;
      }

      // Get variant from cookie (default to 'A' if not found)
      let variant = getCookie(test.cookieName);
      if (!isValidVariant(variant)) {
        variant = 'A';
      }

      log('Tracking test', { test: test.test, variant });
      trackEvent(test.test, variant);
    });
  }

  /**
   * Public API for manual tracking
   */
  function exposeAPI() {
    window.cloudflareAbTesting.ga4.track = function(testName, variant) {
      if (testName && isValidVariant(variant)) {
        trackEvent(testName, variant);
      }
    };

    window.cloudflareAbTesting.ga4.isEnabled = function() {
      return config.enabled === true;
    };
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracking);
  } else {
    // DOM already loaded - call directly
    initTracking();
  }

  // Expose public API
  exposeAPI();

  log('GA4 A/B tracker initialized');

})();