// A/B Test Debug & Force Variant Script
// Add this to your site temporarily to debug and force variants

(function() {
    console.log('=== A/B Test Debug Script Loaded ===');
    
    // 1. Show all current cookies
    console.log('Current cookies:', document.cookie);
    
    // 2. Show any A/B related headers from the current page response
    console.log('Page headers (check Network tab for X-AB-* headers)');
    
    // 3. Force variant B for testing (uncomment the line below and replace COOKIE_NAME)
    // document.cookie = "COOKIE_NAME=B; path=/; max-age=3600";
    
    // 4. Override the tracking to always send B (for testing)
    const originalDataLayerPush = window.dataLayer?.push || function() {};
    window.dataLayer = window.dataLayer || [];
    
    // Store the original push method
    const realPush = window.dataLayer.push;
    
    // Override to force variant B for testing
    window.dataLayer.push = function(...args) {
        args.forEach(item => {
            if (item && item.event === 'abVariantInit') {
                console.log('=== INTERCEPTED A/B EVENT ===');
                console.log('Original:', JSON.stringify(item, null, 2));
                
                // UNCOMMENT THE LINE BELOW TO FORCE VARIANT B FOR TESTING
                // item.ab_variant = 'B';
                
                console.log('Sending to GA4:', JSON.stringify(item, null, 2));
                console.log('================================');
            }
        });
        
        return realPush.apply(this, args);
    };
    
    // 5. Check meta tags injected by Cloudflare Worker
    setTimeout(() => {
        const variantMeta = document.querySelector('meta[name="cf-ab-variant"]');
        const testMeta = document.querySelector('meta[name="cf-ab-test"]');
        
        console.log('Meta tags:');
        console.log('- cf-ab-variant:', variantMeta?.content || 'NOT FOUND');
        console.log('- cf-ab-test:', testMeta?.content || 'NOT FOUND');
        
        if (!variantMeta) {
            console.warn('No meta tag found - Cloudflare Worker may not be running or injecting meta tags');
        }
    }, 500);
    
    // 6. Monitor dataLayer events
    setInterval(() => {
        const abEvents = (window.dataLayer || []).filter(item => 
            item && item.event === 'abVariantInit'
        );
        if (abEvents.length > 0) {
            console.log('Current A/B events in dataLayer:', abEvents);
        }
    }, 2000);
    
})();

// Instructions:
// 1. Add this script to your page (in console or as a script tag)
// 2. Check console for debug info
// 3. To force variant B for testing, uncomment the cookie line above and replace COOKIE_NAME with your test cookie name (e.g., "AB_HOMEPAGE_TEST")
// 4. Check Network tab for X-AB-* headers from your Cloudflare Worker
