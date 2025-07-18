#!/bin/bash

# Test script to verify live 50/50 distribution on the actual website
# This script makes multiple requests to test the A/B distribution

URL="https://cloudflare-ab-testing.dilanti.media/"
TOTAL_REQUESTS=100
TEMP_DIR="/tmp/ab-test-$$"

echo "🧪 Live A/B Testing Distribution Test"
echo "====================================="
echo "URL: $URL"
echo "Requests: $TOTAL_REQUESTS"
echo ""

# Create temporary directory for storing results
mkdir -p "$TEMP_DIR"

# Arrays to store results
declare -A variants
variants[A]=0
variants[B]=0

echo "🚀 Making requests..."

# Make requests with different User-Agents and track cookies
for i in $(seq 1 $TOTAL_REQUESTS); do
    # Rotate through different user agents to simulate different users
    case $((i % 4)) in
        0) USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ;;
        1) USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ;;
        2) USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" ;;
        3) USER_AGENT="Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1" ;;
    esac
    
    # Make request and capture headers
    RESPONSE=$(curl -s -I -H "User-Agent: $USER_AGENT" "$URL" 2>/dev/null)
    
    # Extract variant from Set-Cookie header
    COOKIE_VARIANT=$(echo "$RESPONSE" | grep -i "set-cookie:" | grep "AB_HOMEPAGE_TEST" | sed 's/.*AB_HOMEPAGE_TEST=\([AB]\).*/\1/')
    
    # If no cookie, check X-AB-Variant header
    if [[ -z "$COOKIE_VARIANT" ]]; then
        COOKIE_VARIANT=$(echo "$RESPONSE" | grep -i "x-ab-variant:" | sed 's/.*x-ab-variant: *\([AB]\).*/\1/')
    fi
    
    # Default to A if nothing found
    if [[ -z "$COOKIE_VARIANT" ]]; then
        COOKIE_VARIANT="A"
    fi
    
    # Increment counter
    ((variants[$COOKIE_VARIANT]++))
    
    # Show progress
    if (( i % 10 == 0 )); then
        echo -n "."
    fi
done

echo ""
echo ""

# Calculate results
TOTAL_A=${variants[A]}
TOTAL_B=${variants[B]}
TOTAL_TESTS=$((TOTAL_A + TOTAL_B))

PERCENT_A=$(echo "scale=2; $TOTAL_A * 100 / $TOTAL_TESTS" | bc -l)
PERCENT_B=$(echo "scale=2; $TOTAL_B * 100 / $TOTAL_TESTS" | bc -l)

echo "📊 Results:"
echo "   Variant A: $TOTAL_A (${PERCENT_A}%)"
echo "   Variant B: $TOTAL_B (${PERCENT_B}%)"
echo "   Total: $TOTAL_TESTS"
echo ""

# Check if distribution is balanced (45-55% range)
if (( $(echo "$PERCENT_A >= 45 && $PERCENT_A <= 55" | bc -l) )); then
    BALANCED="✅ YES"
else
    BALANCED="❌ NO"
fi

echo "✅ Distribution Analysis:"
echo "   Expected: ~50% A, ~50% B"
echo "   Actual: ${PERCENT_A}% A, ${PERCENT_B}% B"
echo "   Balanced: $BALANCED"

if [[ "$BALANCED" == "❌ NO" ]]; then
    echo "   ⚠️  Distribution is outside acceptable range (45-55%)"
fi

echo ""
echo "💡 Manual Testing Tips:"
echo "   1. Visit: $URL"
echo "   2. Open browser console to see debug output"
echo "   3. Force variant with: ${URL}?AB_HOMEPAGE_TEST=B"
echo "   4. Clear cookies and refresh to get new assignments"
echo "   5. Try different browsers/devices for different user agents"

# Cleanup
rm -rf "$TEMP_DIR"