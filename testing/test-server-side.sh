#!/bin/bash

# Server-side A/B Testing Verification Script for ayakacasinos.com
# Run this script on your server to test A/B variant distribution

echo "🎰 Testing A/B Variants on ayakacasinos.com"
echo "==========================================="
echo "Running 10 tests to check for variant distribution..."
echo ""

VARIANT_A=0
VARIANT_B=0
NO_VARIANT=0
SUCCESS_COUNT=0
TOTAL_TESTS=10

for i in $(seq 1 $TOTAL_TESTS); do
    echo "Test $i/$TOTAL_TESTS: Requesting ayakacasinos.com"
    
    # Make request and capture both headers and HTML
    RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -H "Cache-Control: no-cache" https://ayakacasinos.com/ 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Extract HTTP status code
        HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
        HTML_CONTENT=$(echo "$RESPONSE" | sed 's/HTTP_CODE:[0-9]*//')
        
        if [ "$HTTP_CODE" = "200" ]; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            
            # Extract meta tag variant
            VARIANT=$(echo "$HTML_CONTENT" | grep -o '<meta name="cf-ab-variant" content="[AB]"' | grep -o '[AB]' | head -1)
            TEST_NAME=$(echo "$HTML_CONTENT" | grep -o '<meta name="cf-ab-test" content="[^"]*"' | sed 's/.*content="\([^"]*\)".*/\1/' | head -1)
            
            # Check for GA4 script
            GA4_SCRIPT=""
            if echo "$HTML_CONTENT" | grep -q "cloudflare-ab-tracking.js"; then
                GA4_SCRIPT="✅"
            else
                GA4_SCRIPT="❌"
            fi
            
            # Count variants
            if [ "$VARIANT" = "A" ]; then
                VARIANT_A=$((VARIANT_A + 1))
                echo "  ✅ $HTTP_CODE | Variant: A | Test: ${TEST_NAME:-NONE} | GA4 Script: $GA4_SCRIPT"
            elif [ "$VARIANT" = "B" ]; then
                VARIANT_B=$((VARIANT_B + 1))
                echo "  ✅ $HTTP_CODE | Variant: B | Test: ${TEST_NAME:-NONE} | GA4 Script: $GA4_SCRIPT"
            else
                NO_VARIANT=$((NO_VARIANT + 1))
                echo "  ✅ $HTTP_CODE | Variant: NONE | Test: ${TEST_NAME:-NONE} | GA4 Script: $GA4_SCRIPT"
            fi
        else
            echo "  ❌ HTTP $HTTP_CODE"
        fi
    else
        echo "  ❌ Request failed"
    fi
    
    # Short delay between requests
    if [ $i -lt $TOTAL_TESTS ]; then
        sleep 2
    fi
done

echo ""
echo "📊 SUMMARY RESULTS"
echo "=================="
echo "Successful requests: $SUCCESS_COUNT/$TOTAL_TESTS"
echo ""
echo "🎯 VARIANT DISTRIBUTION:"
if [ $SUCCESS_COUNT -gt 0 ]; then
    PERCENT_A=$((VARIANT_A * 100 / SUCCESS_COUNT))
    PERCENT_B=$((VARIANT_B * 100 / SUCCESS_COUNT))
    PERCENT_NULL=$((NO_VARIANT * 100 / SUCCESS_COUNT))
    
    echo "  Variant A: $VARIANT_A requests (${PERCENT_A}%)"
    echo "  Variant B: $VARIANT_B requests (${PERCENT_B}%)"
    echo "  No variant: $NO_VARIANT requests (${PERCENT_NULL}%)"
else
    echo "  No successful requests to analyze"
fi

echo ""
echo "🔍 ANALYSIS:"

if [ $VARIANT_A -gt 0 ] && [ $VARIANT_B -gt 0 ]; then
    echo "✅ BOTH A and B variants detected - A/B testing is working!"
    echo "   GA4 should be receiving both A and B variant data."
    echo "   If GA4 still only shows A, check GA4 configuration."
elif [ $VARIANT_A -gt 0 ] && [ $VARIANT_B -eq 0 ]; then
    echo "⚠️ ONLY Variant A detected - B variant not appearing"
    echo "   This explains why GA4 only shows variant A data."
    echo "   Problem: Worker algorithm may be biased or always returning A."
    echo "   Solution needed: Check worker deployment and algorithm."
elif [ $VARIANT_B -gt 0 ] && [ $VARIANT_A -eq 0 ]; then
    echo "⚠️ ONLY Variant B detected - A variant not appearing"
    echo "   This is unusual - check worker configuration."
else
    echo "❌ NO variants detected - A/B testing not working"
    echo "   Problems to check:"
    echo "   - Cloudflare Worker not deployed or not running"
    echo "   - Meta tag injection not working"
    echo "   - WordPress plugin not processing headers correctly"
fi

echo ""
echo "💡 RECOMMENDED ACTIONS:"
if [ $VARIANT_A -gt 0 ] && [ $VARIANT_B -eq 0 ]; then
    echo "1. Check Cloudflare Worker algorithm - it may be biased toward A"
    echo "2. Verify worker is using proper hash function for variant assignment"
    echo "3. Test with different IP addresses/User-Agents"
    echo "4. Check if worker route is correctly configured"
elif [ $NO_VARIANT -eq $SUCCESS_COUNT ]; then
    echo "1. Verify Cloudflare Worker is deployed and active"
    echo "2. Check worker route matches your domain exactly"
    echo "3. Verify WordPress plugin is updated to v2.1.8"
    echo "4. Check WordPress diagnostics page for configuration issues"
else
    echo "1. A/B testing appears to be working correctly"
    echo "2. If GA4 issues persist, check GA4 event configuration"
    echo "3. Verify GA4 custom dimensions are set up correctly"
fi

echo ""
echo "🔧 To run WordPress diagnostics:"
echo "   Go to WordPress Admin → A/B Tests → Diagnostics"
echo "   Click 'Run Health Check' and 'Test Live Environment'"