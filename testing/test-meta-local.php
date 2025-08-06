<?php
/**
 * Test meta tag injection locally
 */

// Simulate WordPress environment
define('ABSPATH', true);
define('WP_DEBUG', true);

// Simulate $_SERVER headers from worker
$_SERVER['HTTP_X_AB_VARIANT'] = 'B';
$_SERVER['HTTP_X_AB_TEST'] = 'homepage_test';

// Mock functions
function is_admin() { return false; }
function sanitize_text_field($text) { return $text; }
function esc_attr($text) { return htmlspecialchars($text, ENT_QUOTES); }

function cloudflare_ab_get_cookie_for_current_path() {
    return 'AB_HOMEPAGE_TEST';
}

// Copy the exact function from our plugin
function cloudflare_ab_inject_meta_tags() {
    // Only inject on frontend, not admin
    if ( is_admin() ) {
        return;
    }
    
    // Get A/B test info from Cloudflare Worker headers
    $ab_test = '';
    $ab_variant = '';
    
    // Check for worker headers in $_SERVER
    // Note: HTTP headers with hyphens become underscores in PHP $_SERVER
    $possible_variant_headers = ['HTTP_X_AB_VARIANT'];
    $possible_test_headers = ['HTTP_X_AB_TEST'];
    
    foreach ( $possible_test_headers as $header ) {
        if ( isset( $_SERVER[$header] ) && ! empty( $_SERVER[$header] ) ) {
            $ab_test = sanitize_text_field( $_SERVER[$header] );
            break;
        }
    }
    
    foreach ( $possible_variant_headers as $header ) {
        if ( isset( $_SERVER[$header] ) && ! empty( $_SERVER[$header] ) ) {
            $ab_variant = sanitize_text_field( $_SERVER[$header] );
            break;
        }
    }
    
    // If no worker headers found, check for specific test headers
    if ( empty( $ab_variant ) ) {
        $cookie_name = cloudflare_ab_get_cookie_for_current_path();
        if ( $cookie_name ) {
            $header_name = 'HTTP_X_' . strtoupper( str_replace( 'AB_', '', $cookie_name ) );
            if ( isset( $_SERVER[$header_name] ) ) {
                $ab_variant = sanitize_text_field( $_SERVER[$header_name] );
                $ab_test = strtolower( str_replace( [ 'AB_', '_' ], [ '', '_' ], $cookie_name ) );
                $ab_test = trim( $ab_test, '_' );
            }
        }
    }
    
    // Final fallback: if we have a test configured but no variant, don't inject anything
    // This prevents always showing variant A when worker isn't working
    if ( empty( $ab_variant ) || empty( $ab_test ) ) {
        return;
    }
    
    // Only inject if we have a valid variant from the worker
    if ( in_array( $ab_variant, [ 'A', 'B' ] ) ) {
        echo '<meta name="cf-ab-variant" content="' . esc_attr( $ab_variant ) . '">' . "\n";
        echo '<meta name="cf-ab-test" content="' . esc_attr( $ab_test ) . '">' . "\n";
        
        // Debug comment (only visible in HTML source)
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            echo '<!-- CF-AB-DEBUG: variant=' . esc_attr( $ab_variant ) . ', test=' . esc_attr( $ab_test ) . ', headers=' . esc_attr( json_encode( array_filter( $_SERVER, function($key) { return strpos($key, 'HTTP_X') === 0; }, ARRAY_FILTER_USE_KEY ) ) ) . ' -->' . "\n";
        }
    }
}

echo "Testing meta tag injection with simulated headers:\n";
echo "Headers: X-AB-Variant: B, X-AB-Test: homepage_test\n\n";
echo "Expected output:\n";
echo "<meta name=\"cf-ab-variant\" content=\"B\">\n";
echo "<meta name=\"cf-ab-test\" content=\"homepage_test\">\n\n";
echo "Actual output:\n";
cloudflare_ab_inject_meta_tags();
?>