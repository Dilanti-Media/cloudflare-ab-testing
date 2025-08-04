/**
 * Simplified Google Analytics 4 A/B Testing Tracker
 *
 * This script listens for the abVariantInit events that are already being
 * pushed by the main cloudflare-ab-testing.js script and ensures they
 * reach GA4 properly. We don't duplicate the tracking logic.
 */

(function() {
  'use strict';

  // Exit early if not configured
  if (!window.cloudflareAbTesting?.ga4) {
    return;
  }

  const config = window.cloudflareAbTesting.ga4;
  const DEBUG = window.cloudflareAbTesting?.debug || false;

  function log(message, data) {
    if (DEBUG) {
      console.log(`[GA4 A/B] ${message}`, data || '');
    }
  }

  /**
   * Listen for abVariantInit events in dataLayer and ensure they reach GA4
   */
  function initGA4Listener() {
    // Ensure dataLayer exists
    window.dataLayer = window.dataLayer || [];
    
    // Store original push method
    const originalPush = window.dataLayer.push;
    
    // Override push to intercept our A/B test events
    window.dataLayer.push = function(...args) {
      // Call original push first
      const result = originalPush.apply(this, args);
      
      // Check each pushed item for our A/B test events
      args.forEach(item => {
        if (item && item.event === 'abVariantInit' && item.ab_test && item.ab_variant) {
          // Ensure the event reaches GA4 via gtag if available
          if (typeof gtag !== 'undefined') {
            const eventName = config.event_name || 'abVariantInit';
            gtag('event', eventName, {
              ab_test: item.ab_test,
              ab_variant: item.ab_variant
            });
            log('Event forwarded to gtag', { 
              event: eventName,
              ab_test: item.ab_test, 
              ab_variant: item.ab_variant 
            });
          } else {
            log('gtag not available, event only in dataLayer', item);
          }
        }
      });
      
      return result;
    };
    
    log('GA4 listener initialized - will forward abVariantInit events to gtag');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGA4Listener);
  } else {
    // DOM already loaded - call directly
    initGA4Listener();
  }

  log('GA4 A/B tracker initialized');

})();