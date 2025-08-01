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
 * - Enhanced error handling and debugging
 */

(function () {
  "use strict";

  // Initialize debug mode
  const DEBUG_MODE = window.cloudflareAbTesting?.debug || false;

  // Configuration constants
  const DEFAULT_MAX_ATTEMPTS = 5;
  const DEFAULT_RETRY_DELAY_MS = 500;
  const MAX_RETRY_DELAY_MS = 4000; // Cap maximum retry delay to prevent excessive waits
  const MAX_DEPENDENCY_CHECK_ATTEMPTS = 20;
  const DEPENDENCY_CHECK_DELAY_MS = 50;

  // Enhanced debugging function
  function debugLog(message, data = {}) {
    if (DEBUG_MODE) {
      console.log(`[GA4 A/B Testing] ${message}:`, data);
    }
  }

  // Check if GA4 tracking is enabled
  debugLog("Script initialized", {
    cloudflareAbTesting: window.cloudflareAbTesting,
  });

  if (!window.cloudflareAbTesting || !window.cloudflareAbTesting.ga4) {
    debugLog("GA4 not configured - exiting", {
      hasCloudflareAbTesting: !!window.cloudflareAbTesting,
      hasGa4Config: !!window.cloudflareAbTesting?.ga4,
    });
    return; // GA4 not configured, exit early
  }

  const config = window.cloudflareAbTesting.ga4;
  const tests = window.cloudflareAbTesting.registry || [];

  debugLog("Configuration loaded", { config, tests });

  /**
   * Get cookie value by name
   * @param {string} name - Cookie name to retrieve
   * @returns {string|null} Cookie value or null if not found
   */
  function getCookieValue(name) {
    try {
      const re = new RegExp(
        "(?:^|; )" +
          name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") +
          "=([^;]*)",
      );
      const match = document.cookie.match(re);
      const value = match ? decodeURIComponent(match[1]) : null;
      debugLog(`Cookie ${name} retrieved`, { value, found: !!value });
      return value;
    } catch (error) {
      debugLog(`Error reading cookie ${name}`, { error: error.message });
      return null;
    }
  }

  /**
   * Initialize A/B test tracking for GA4
   *
   * This function is called automatically when the script loads
   * to set up tracking for all active A/B tests on the current page.
   */
  function initABTracking() {
    try {
      const path = window.location.pathname;
      debugLog("Starting A/B tracking", { path, totalTests: tests.length });

      // Ensure dataLayer exists
      window.dataLayer = window.dataLayer || [];
      debugLog("dataLayer initialized", {
        dataLayerExists: !!window.dataLayer,
      });

      // Process each test in the registry
      tests.forEach((entry, index) => {
        debugLog(`Processing test ${index}`, entry);

        // Check if test is active for current path
        const isActive =
          entry.paths &&
          Array.isArray(entry.paths) &&
          entry.paths.some(
            (prefix) => path === prefix || path.startsWith(prefix + "/"),
          );

        debugLog(`Test ${entry.test} path check`, {
          test: entry.test,
          path,
          testPaths: entry.paths,
          isActive,
        });

        if (!isActive) {
          debugLog(`Test ${entry.test} not active for current path - skipping`);
          return; // Skip tests not active on this page
        }

        debugLog(`Test ${entry.test} is active - proceeding`);

        // Read the cookie for this test
        let variant = getCookieValue(entry.cookieName);

        // If no cookie yet, default to "A" (Worker will override on actual response)
        if (variant !== "A" && variant !== "B") {
          debugLog(
            `No valid cookie found for ${entry.cookieName}, defaulting to A`,
          );
          variant = "A";
        }

        debugLog(`Variant determined for ${entry.test}`, { variant });

        // Get event name from config or use default
        const eventName = config.eventName || "abVariantInit";
        debugLog(`Event name configured`, { eventName });

        // Build event data for gtag (without 'event' property)
        const gtagEventData = {
          ab_test: entry.test,
          ab_variant: variant,
        };

        // Build event data for dataLayer (with 'event' property)
        const dataLayerEventData = {
          event: eventName,
          ab_test: entry.test,
          ab_variant: variant,
        };

        // Add custom dimensions if provided
        if (config.customDimensions) {
          const customDims = config.customDimensions
            .split(",")
            .map((dim) => dim.trim())
            .filter((dim) => dim);

          debugLog(`Adding custom dimensions`, { customDims });

          customDims.forEach((dim) => {
            const customDimData = {
              test: entry.test,
              variant: variant,
              path: path,
            };
            gtagEventData[dim] = customDimData;
            dataLayerEventData[dim] = customDimData;
          });
        }

        // Add standard A/B testing dimensions
        const sessionData = {
          test: entry.test,
          variant: variant,
          path: path,
          timestamp: new Date().toISOString(),
        };
        gtagEventData.ab_session = sessionData;
        dataLayerEventData.ab_session = sessionData;

        debugLog(`Final event data prepared`, {
          gtagEventData,
          dataLayerEventData,
        });

        // Special handling for Google Analytics Enhanced Ecommerce
        if (typeof gtag !== "undefined") {
          debugLog("gtag available - sending event via gtag", {
            gtagType: typeof gtag,
            eventName,
            eventData: gtagEventData,
          });

          // FIX: Use proper gtag format - don't include 'event' property in parameters
          // gtag requires the event name as the second argument and the event parameters as a flat object (third argument).
          // In contrast, dataLayer expects a single object with an 'event' property specifying the event name.
          // This distinction is critical: passing an 'event' property in the gtag parameters will result in incorrect tracking.
          gtag("event", eventName, gtagEventData);
          debugLog("Event sent via gtag");
        } else {
          debugLog("gtag not available - using dataLayer");
          // Standard dataLayer integration
          window.dataLayer.push(dataLayerEventData);
          debugLog("Event sent via dataLayer");
        }

        debugLog(`GA4 A/B Test Tracking completed for ${entry.test}`, {
          test: entry.test,
          variant: variant,
          event: eventName,
          path: path,
          timestamp: new Date().toISOString(),
        });
      });

      debugLog("A/B tracking initialization completed");
    } catch (error) {
      console.error("[GA4 A/B Testing] Error in initABTracking:", error);
      debugLog("Tracking failed with error", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Update tracking when variant changes (via cookie)
   * Useful for user-initiated changes or testing scenarios
   *
   * @param {string} testName - The test slug/identifier
   * @param {string} newVariant - The new variant ('A' or 'B')
   */
  function updateVariantTracking(testName, newVariant) {
    try {
      debugLog("Updating variant tracking", { testName, newVariant });

      if (
        !config.enabled ||
        typeof testName === "undefined" ||
        typeof newVariant === "undefined"
      ) {
        debugLog("Variant update skipped - invalid parameters", {
          configEnabled: config.enabled,
          testName,
          newVariant,
        });
        return;
      }

      if (newVariant !== "A" && newVariant !== "B") {
        debugLog("Invalid variant provided", { newVariant });
        return;
      }

      window.dataLayer = window.dataLayer || [];
      const eventName = config.eventName || "abVariantInit";

      // Build separate data for gtag and dataLayer
      const gtagUpdateData = {
        ab_test: testName,
        ab_variant: newVariant,
        ab_update_type: "variant_change",
      };

      const dataLayerUpdateData = {
        event: eventName,
        ...gtagUpdateData,
      };

      debugLog("Sending variant update event", {
        gtagUpdateData,
        dataLayerUpdateData,
      });

      if (typeof gtag !== "undefined") {
        gtag("event", eventName, gtagUpdateData);
        debugLog("Variant update sent via gtag");
      } else {
        window.dataLayer.push(dataLayerUpdateData);
        debugLog("Variant update sent via dataLayer");
      }

      debugLog("Variant tracking updated successfully", {
        testName,
        newVariant,
      });
    } catch (error) {
      console.error("[GA4 A/B Testing] Error in updateVariantTracking:", error);
      debugLog("Variant update failed", {
        error: error.message,
        testName,
        newVariant,
      });
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
    try {
      debugLog("Manual A/B test trigger called", { options });

      if (!config.enabled || !options.test || !options.variant) {
        debugLog("Manual test trigger skipped - invalid parameters", {
          configEnabled: config.enabled,
          test: options.test,
          variant: options.variant,
        });
        return;
      }

      if (options.variant !== "A" && options.variant !== "B") {
        debugLog("Invalid variant provided for manual test", {
          variant: options.variant,
        });
        return;
      }

      const eventName =
        options.eventName || config.eventName || "abVariantInit";

      // Build separate data for gtag and dataLayer
      const gtagEventData = {
        ab_test: options.test,
        ab_variant: options.variant,
        ...options.customData,
      };

      const dataLayerEventData = {
        event: eventName,
        ...gtagEventData,
      };

      debugLog("Sending manual test event", {
        eventName,
        gtagEventData,
        dataLayerEventData,
      });

      window.dataLayer = window.dataLayer || [];

      if (typeof gtag !== "undefined") {
        gtag("event", eventName, gtagEventData);
        debugLog("Manual test event sent via gtag");
      } else {
        window.dataLayer.push(dataLayerEventData);
        debugLog("Manual test event sent via dataLayer");
      }

      debugLog("Manual A/B test tracking completed", {
        test: options.test,
        variant: options.variant,
        eventName,
      });
    } catch (error) {
      console.error("[GA4 A/B Testing] Error in trackABTest:", error);
      debugLog("Manual test tracking failed", {
        error: error.message,
        options,
      });
    }
  }

  // Enhanced initialization with better timing and error handling
  function initializeTracking() {
    try {
      debugLog("Starting tracking initialization");

      // Verify configuration is still valid
      if (!window.cloudflareAbTesting || !window.cloudflareAbTesting.ga4) {
        debugLog("Configuration missing during initialization");
        return;
      }

      // Initialize tracking
      initABTracking();

      // Expose public API for advanced integrations
      // Extend the existing ga4 object instead of overwriting it
      if (
        !window.cloudflareAbTesting.ga4 ||
        typeof window.cloudflareAbTesting.ga4 !== "object"
      ) {
        window.cloudflareAbTesting.ga4 = {};
      }

      window.cloudflareAbTesting.ga4.updateVariant = updateVariantTracking;
      window.cloudflareAbTesting.ga4.trackTest = trackABTest;
      window.cloudflareAbTesting.ga4.isEnabled = function () {
        try {
          return config.enabled === true;
        } catch (error) {
          debugLog("Error checking enabled status", { error: error.message });
          return false;
        }
      };
      window.cloudflareAbTesting.ga4.getDebugInfo = function () {
        return {
          config: config,
          tests: tests,
          debugMode: DEBUG_MODE,
          hasDataLayer: !!window.dataLayer,
          hasGtag: typeof gtag !== "undefined",
        };
      };

      debugLog("Public API exposed", {
        functions: ["updateVariant", "trackTest", "isEnabled", "getDebugInfo"],
      });

      debugLog("GA4 A/B Tracking initialization completed successfully");
    } catch (error) {
      console.error(
        "[GA4 A/B Testing] Fatal error during initialization:",
        error,
      );
      debugLog("Initialization failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  // Initialize tracking with proper timing and dependency checking
  let initializationStarted = false;

  function safeInitializeTracking() {
    if (!initializationStarted) {
      initializationStarted = true;
      initializeTracking();
    } else {
      debugLog("Initialization already started - skipping duplicate call");
    }
  }

  // Wait for required dependencies before initializing
  function waitForDependenciesAndInitialize(attempt = 1) {
    // Check if required dependencies are available
    const hasWindow = typeof window !== "undefined";
    const hasDocument = typeof document !== "undefined";
    const hasGtag = hasWindow && typeof window.gtag !== "undefined"; // Optional: gtag is preferred but not required

    debugLog("Checking dependencies", {
      hasWindow,
      hasDocument,
      hasGtag,
      hasRequiredConfig: !!(
        window.cloudflareAbTesting && window.cloudflareAbTesting.ga4
      ),
      attempt,
    });

    // Essential dependencies: window, document, and GA4 configuration
    // gtag is optional - we can fallback to dataLayer if gtag is not available
    if (
      hasWindow &&
      hasDocument &&
      !!(window.cloudflareAbTesting && window.cloudflareAbTesting.ga4)
    ) {
      debugLog("Dependencies satisfied - initializing tracking", {
        trackingMethod: hasGtag ? "gtag" : "dataLayer",
      });
      setTimeout(safeInitializeTracking, 0);
    } else if (attempt < MAX_DEPENDENCY_CHECK_ATTEMPTS) {
      // Retry with setTimeout for better timing
      debugLog("Dependencies not ready - will retry", {
        attempt,
        maxAttempts: MAX_DEPENDENCY_CHECK_ATTEMPTS,
      });
      setTimeout(function () {
        waitForDependenciesAndInitialize(attempt + 1);
      }, DEPENDENCY_CHECK_DELAY_MS);
    } else {
      debugLog(
        "Max dependency check attempts reached - aborting initialization",
        {
          maxAttempts: MAX_DEPENDENCY_CHECK_ATTEMPTS,
          missingDependencies: {
            hasWindow,
            hasDocument,
            hasConfig: !!(
              window.cloudflareAbTesting && window.cloudflareAbTesting.ga4
            ),
          },
        },
      );
    }
  }

  // Exponential backoff retry mechanism for fallback initialization
  function retryInitializeTracking(
    attempt = 1,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    delay = DEFAULT_RETRY_DELAY_MS,
  ) {
    if (initializationStarted) {
      debugLog("Retry: Initialization already started - stopping retries");
      return;
    }

    debugLog("Retry: Attempting fallback initialization", { attempt, delay });
    safeInitializeTracking();

    if (!initializationStarted && attempt < maxAttempts) {
      const nextDelay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      debugLog("Retry: Scheduling next attempt", {
        nextAttempt: attempt + 1,
        nextDelay,
      });
      setTimeout(function () {
        retryInitializeTracking(attempt + 1, maxAttempts, nextDelay);
      }, delay);
    } else if (!initializationStarted) {
      debugLog(
        "Retry: Maximum attempts reached - initialization may have failed",
        { maxAttempts },
      );
    }
  }

  // Primary initialization logic
  if (document.readyState === "loading") {
    debugLog("DOM not ready - waiting for DOMContentLoaded");
    document.addEventListener(
      "DOMContentLoaded",
      waitForDependenciesAndInitialize,
    );
  } else {
    debugLog("DOM already loaded - checking dependencies");
    // Use dependency checking instead of arbitrary timeout
    waitForDependenciesAndInitialize();
  }

  // Fallback initialization for safety - only if not already complete and with retry mechanism
  if (document.readyState === "complete" && !initializationStarted) {
    debugLog("Fallback: DOM complete - ensuring initialization with retries");
    retryInitializeTracking();
  }

  debugLog("GA4 A/B Tracking script loaded and configured");
})();
