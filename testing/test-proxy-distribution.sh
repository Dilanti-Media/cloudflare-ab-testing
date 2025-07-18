#!/bin/bash

# Test script to verify A/B distribution using squid proxies
# This simulates users from different IP addresses to test the hash-based distribution

URL="https://cloudflare-ab-testing.dilanti.media/"
REQUESTS_PER_PROXY=20
TEMP_DIR="/tmp/ab-proxy-test-$$"

# Load proxy credentials from .env file
if [[ -f .env ]]; then
    source .env
else
    echo "❌ .env file not found. Please create it with SQUID_PROXY_USERNAME and SQUID_PROXY_PASSWORD"
    exit 1
fi

if [[ -z "$SQUID_PROXY_USERNAME" || -z "$SQUID_PROXY_PASSWORD" ]]; then
    echo "❌ SQUID_PROXY_USERNAME and SQUID_PROXY_PASSWORD must be set in .env"
    exit 1
fi

# Squid proxy list
PROXIES=(
    "23.19.98.55:8800"
    "23.19.98.180:8800"
    "173.234.232.213:8800"
    "23.19.98.82:8800"
    "23.19.98.57:8800"
    "173.234.232.82:8800"
    "173.232.127.234:8800"
    "173.234.194.122:8800"
    "173.234.194.169:8800"
    "173.232.127.166:8800"
)

# User agents for variety
USER_AGENTS=(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1"
    "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1"
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0"
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0"
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59"
)

echo "🧪 Proxy-Based A/B Testing Distribution Test"
echo "==========================================="
echo "URL: $URL"
echo "Proxies: ${#PROXIES[@]}"
echo "Requests per proxy: $REQUESTS_PER_PROXY"
echo "Total requests: $((${#PROXIES[@]} * REQUESTS_PER_PROXY))"
echo ""

# Create temporary directory for storing results
mkdir -p "$TEMP_DIR"

# Arrays to store results
declare -A variants
variants[A]=0
variants[B]=0

declare -A proxy_variants
declare -A proxy_counts

echo "🚀 Testing proxies..."

# Test each proxy
for proxy in "${PROXIES[@]}"; do
    echo "Testing proxy: $proxy"
    
    proxy_variants[$proxy,A]=0
    proxy_variants[$proxy,B]=0
    proxy_counts[$proxy]=0
    
    # Make multiple requests through this proxy
    for i in $(seq 1 $REQUESTS_PER_PROXY); do
        # Rotate through different user agents
        USER_AGENT="${USER_AGENTS[$((i % ${#USER_AGENTS[@]}))]}"
        
        # Make request through proxy
        RESPONSE=$(curl -s -I \
            --connect-timeout 10 \
            --max-time 30 \
            --proxy "$proxy" \
            --proxy-user "$SQUID_PROXY_USERNAME:$SQUID_PROXY_PASSWORD" \
            -H "User-Agent: $USER_AGENT" \
            "$URL" 2>/dev/null)
        
        # Check if request was successful
        if [[ $? -eq 0 ]]; then
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
            
            # Increment counters
            ((variants[$COOKIE_VARIANT]++))
            ((proxy_variants[$proxy,$COOKIE_VARIANT]++))
            ((proxy_counts[$proxy]++))
            
            echo -n "."
        else
            echo -n "x"
        fi
    done
    echo ""
done

echo ""
echo "📊 Overall Results:"

# Calculate overall results
TOTAL_A=${variants[A]}
TOTAL_B=${variants[B]}
TOTAL_TESTS=$((TOTAL_A + TOTAL_B))

if [[ $TOTAL_TESTS -eq 0 ]]; then
    echo "❌ No successful requests. Check proxy configuration."
    exit 1
fi

PERCENT_A=$(echo "scale=2; $TOTAL_A * 100 / $TOTAL_TESTS" | bc -l)
PERCENT_B=$(echo "scale=2; $TOTAL_B * 100 / $TOTAL_TESTS" | bc -l)

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
echo "🔍 Per-Proxy Results:"
echo "Proxy                    | Requests | A    | B    | A%    | B%"
echo "-------------------------|----------|------|------|-------|-------"

for proxy in "${PROXIES[@]}"; do
    COUNT=${proxy_counts[$proxy]}
    if [[ $COUNT -gt 0 ]]; then
        A_COUNT=${proxy_variants[$proxy,A]}
        B_COUNT=${proxy_variants[$proxy,B]}
        A_PERCENT=$(echo "scale=1; $A_COUNT * 100 / $COUNT" | bc -l)
        B_PERCENT=$(echo "scale=1; $B_COUNT * 100 / $COUNT" | bc -l)
        
        printf "%-24s | %8d | %4d | %4d | %5s | %5s\n" \
            "$proxy" "$COUNT" "$A_COUNT" "$B_COUNT" "${A_PERCENT}%" "${B_PERCENT}%"
    else
        printf "%-24s | %8s | %4s | %4s | %5s | %5s\n" \
            "$proxy" "FAILED" "-" "-" "-" "-"
    fi
done

echo ""
echo "🎯 Key Insights:"
echo "   • Each proxy IP should get consistent variants (due to IP-based hashing)"
echo "   • Overall distribution should be close to 50/50 across all proxies"
echo "   • Individual proxy results may vary due to small sample sizes"

echo ""
echo "💡 Manual Testing Tips:"
echo "   1. Visit: $URL"
echo "   2. Check browser console for debug output"
echo "   3. Force variant with: ${URL}?AB_HOMEPAGE_TEST=B"
echo "   4. Use different browsers/devices for variety"

# Cleanup
rm -rf "$TEMP_DIR"