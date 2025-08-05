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
   * Verify GA4 configuration and availability
   */
  function verifyGA4Setup() {
    const checks = {
      gtagDefined: typeof gtag !== 'undefined',
      dataLayerExists: !!(window.dataLayer),
      ga4Enabled: !!(config && config.enabled),
      gaIDPresent: !!(window.gtag && window.gtag.config && Object.keys(window.gtag.config))
    };
    
    log('GA4 Setup Verification:', checks);
    return checks;
  }
  
  /**
   * Enhanced GA4 event tracking with validation
   */
  function trackEvent(eventData, validation = true) {
    const enrichedData = {
      ...eventData,
      ab_timestamp: Date.now(),
      ab_session_id: window.cloudflareAbTesting?.sessionId || 'default'
    };
    
    // Add debugging metadata in debug mode
    if (DEBUG) {
      enrichedData.ab_debug = {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        referrer: document.referrer
      };
    }
    
    if (typeof gtag !== 'undefined') {
      const eventName = config.eventName || 'abVariantInit';
      
      // Enhanced event tracking with error handling
      try {
        gtag('event', eventName, enrichedData);
        
        if (DEBUG) {
          console.group('A/B Event Tracked');
          console.log('Event Name:', eventName);
          console.log('Event Data:', enrichedData);
          console.log('Current GA4 Config:', window.gtag?.config);
          console.groupEnd();
        }
        
        // Custom event for diagnostics
        if (typeof window.CustomEvent === 'function') {
          document.dispatchEvent(new CustomEvent('abVariantTracked', { detail: enrichedData }));
        }
        
      } catch (error) {
        console.error('GA4 Event tracking failed:', error);
      }
    } else {
      log('gtag not available', { enrichedData, gtagAvailable: typeof gtag });
      
      // Queue event for when gtag becomes available
      if (!window._abEventsQueue) {
        window._abEventsQueue = [];
        
        // Poll for gtag availability
        const pollForGTAG = setInterval(() => {
          if (typeof gtag !== 'undefined') {
            clearInterval(pollForGTAG);
            window._abEventsQueue.forEach(queuedEvent => {
              const eventName = config.eventName || 'abVariantInit';
              gtag('event', eventName, queuedEvent);
            });
            delete window._abEventQueue;
          }
        }, 500);
      }
      window._abEventsQueue.push(enrichedData);
    }
  }
  
  // Track which tests have been sent to GA4 to prevent duplicates
  const sentToGA4 = new Set();
  
  /**
   * Listen for abVariantInit events in dataLayer and ensure they reach GA4
   */
  function initGA4Listener() {
    const setupVerification = verifyGA4Setup();
    if (!setupVerification.ga4Enabled) {
      log('GA4 integration disabled, skipping listener setup');
      return;
    }
    
    // Ensure dataLayer exists
    window.dataLayer = window.dataLayer || [];
    
    // Store original push method
    const originalPush = window.dataLayer.push;
    
    // Enhanced override with comprehensive logging and deduplication
    window.dataLayer.push = function(...args) {
      const result = originalPush.apply(this, args);
      
      args.forEach(item => {
        if (item && item.event === 'abVariantInit' && item.ab_test && item.ab_variant) {
          const testKey = `${item.ab_test}`;
          
          // Prevent duplicate GA4 events for the same test in the same session
          if (sentToGA4.has(testKey)) {
            log(`Skipping duplicate GA4 event for test: ${item.ab_test}`, { 
              previouslySent: true, 
              currentVariant: item.ab_variant 
            });
            return;
          }
          
          // Mark this test as sent and track the event
          sentToGA4.add(testKey);
          
          trackEvent({
            ab_test: item.ab_test,
            ab_variant: item.ab_variant
          });
          
          log(`Sent to GA4: ${item.ab_test} = ${item.ab_variant}`, { 
            isFirstEvent: true 
          });
        }
      });
      
      return result;
    };
    
    log('GA4 listener initialized with deduplication');
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGA4Listener);
  } else {
    initGA4Listener();
  }

  // Generate session ID for diagnostics
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  if (window.cloudflareAbTesting) {
    window.cloudflareAbTesting.sessionId = sessionId;
  }

  log('GA4 A/B tracker initialized with session: ' + sessionId);
  
  // Expose diagnostic functions for troubleshooting
  if (DEBUG) {
    window.ABGA4Diagnostics = {
      verifySetup: verifyGA4Setup,
      getConfig: () => config,
      trackTest: (test, variant) => trackEvent({ab_test: test, ab_variant: variant})
    };
  }

})();