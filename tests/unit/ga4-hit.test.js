/** @jest-environment jsdom */

describe('GA4 tracking integration (browser script)', () => {
  beforeEach(() => {
    // Reset DOM and globals
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.dataLayer = [];

    // Configure plugin globals before script loads
    window.cloudflareAbTesting = {
      debug: true,
      registry: [
        { test: 'HOME', cookieName: 'AB_HOMEPAGE_TEST', paths: ['/ga4'] }
      ],
      ga4: {
        enabled: true,
        eventName: 'ab_test_view'
      }
    };

    // Default to GA4 via dataLayer path (no gtag defined)
    delete window.gtag;

    // Set URL path to match the test
    const url = new URL('https://example.com/ga4');
    Object.defineProperty(window, 'location', { value: url, writable: true });

    // Insert meta indicating the worker-assigned variant
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'cf-ab-variant');
    meta.setAttribute('content', 'B');
    document.head.appendChild(meta);
  });

  test('pushes GA4 event to dataLayer with test name and variant', async () => {
    // Load the browser script (IIFE)
    require('../../plugin/assets/js/cloudflare-ab-tracking.js');

    // The script runs immediately (document is already complete in jsdom)
    const events = window.dataLayer.filter(e => e && e.event === 'ab_test_view');
    expect(events.length).toBeGreaterThanOrEqual(1);

    const evt = events[0];
    expect(evt.ab_test).toBe('HOME');
    expect(['A', 'B']).toContain(evt.ab_variant);
  });
});

