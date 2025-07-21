<?php
/**
 * Shortcode Logic
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

function cloudflare_ab_simple_ab_shortcode( $atts ) {
    $atts = shortcode_atts( [
        'a'       => '',
        'b'       => '',
        'default' => 'a',
        'param'   => cloudflare_ab_get_cookie_for_current_path() ?? 'AB_VARIANT',
    ], $atts, 'ab_test' );

    $param_upper = strtoupper($atts['param']);
    $sel = $atts['default']; // Default value

    // Debug logging for troubleshooting (only when WP_DEBUG is true)
    $debug_info = [];
    
    if ( ! empty( $_GET[ $atts['param'] ] ) ) {
        $sel = sanitize_key( $_GET[ $atts['param'] ] );
        $debug_info[] = "Source: GET parameter, Value: $sel";
    } elseif ( ! empty( $_SERVER[ 'HTTP_X_AB_VARIANT' ] ) ) {
        // Check Cloudflare Worker's X-AB-Variant header first
        $sel = sanitize_key( $_SERVER[ 'HTTP_X_AB_VARIANT' ] );
        $debug_info[] = "Source: X-AB-Variant header, Value: $sel";
    } elseif ( ! empty( $_SERVER[ 'HTTP_X_' . $param_upper ] ) ) {
        $sel = sanitize_key( $_SERVER[ 'HTTP_X_' . $param_upper ] );
        $debug_info[] = "Source: HTTP_X_{$param_upper} header, Value: $sel";
    } elseif ( ! empty( $_COOKIE[ $atts['param'] ] ) ) {
        $sel = sanitize_key( $_COOKIE[ $atts['param'] ] );
        $debug_info[] = "Source: Cookie {$atts['param']}, Value: $sel";
    } else {
        $debug_info[] = "Source: Default fallback, Value: $sel";
    }
    
    // Add debug output to HTML - always include for troubleshooting
    $server_debug = [];
    $server_debug[] = "GET_param: " . (isset($_GET[$atts['param']]) ? $_GET[$atts['param']] : 'NOT_SET');
    $server_debug[] = "X-AB-Variant: " . (isset($_SERVER['HTTP_X_AB_VARIANT']) ? $_SERVER['HTTP_X_AB_VARIANT'] : 'NOT_SET');
    $server_debug[] = "Cookie: " . (isset($_COOKIE[$atts['param']]) ? $_COOKIE[$atts['param']] : 'NOT_SET');
    
    $debug_comment = "<!-- AB-DEBUG: " . implode(' | ', $debug_info) . " | SERVER: " . implode(' | ', $server_debug) . " -->\n";
    echo $debug_comment;

    $sel = strtolower($sel);
    $sc = isset( $atts[ $sel ] ) ? trim( $atts[ $sel ] ) : '';

    if ( $sc && ! preg_match( '/^\\[.*\\]$/s', $sc ) ) {
        $sc = '[' . $sc . ']';
    }

    return do_shortcode( $sc );
}
add_shortcode( 'ab_test', 'cloudflare_ab_simple_ab_shortcode' );

// Demo shortcodes for variants
function cloudflare_ab_cta_a_shortcode() { return '<button class="ab-cta-button variant-a">Variant A</button>'; }
add_shortcode( 'cta_a', 'cloudflare_ab_cta_a_shortcode' );

function cloudflare_ab_cta_b_shortcode() { return '<button class="ab-cta-button variant-b">Variant B</button>'; }
add_shortcode( 'cta_b', 'cloudflare_ab_cta_b_shortcode' );

function cloudflare_ab_debug_shortcode() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return '';
    }

    $cookie_name = cloudflare_ab_get_cookie_for_current_path();
    $param_upper = strtoupper( $cookie_name );

    $output = '<div class="dm-ab-debug" style="border: 2px solid #f00; padding: 15px; margin: 20px 0; background: #fff8f8; color: #333;">';
    $output .= '<h3 style="margin-top: 0;">A/B Test Debug Info</h3>';
    $output .= '<ul>';

    // Check GET parameter
    if ( isset( $_GET[ $cookie_name ] ) ) {
        $output .= '<li><strong>Source:</strong> GET Parameter (<code>' . esc_html( $cookie_name ) . '</code>)</li>';
        $output .= '<li><strong>Value:</strong> ' . esc_html( sanitize_key( $_GET[ $cookie_name ] ) ) . '</li>';
    }
    // Check Cloudflare Worker X-AB-Variant Header
    elseif ( isset( $_SERVER[ 'HTTP_X_AB_VARIANT' ] ) ) {
        $output .= '<li><strong>Source:</strong> Cloudflare Worker Header (<code>X-AB-Variant</code>)</li>';
        $output .= '<li><strong>Value:</strong> ' . esc_html( sanitize_key( $_SERVER[ 'HTTP_X_AB_VARIANT' ] ) ) . '</li>';
    }
    // Check Cloudflare Worker Header
    elseif ( isset( $_SERVER[ 'HTTP_X_' . $param_upper ] ) ) {
        $output .= '<li><strong>Source:</strong> Cloudflare Worker Header (<code>HTTP_X_' . esc_html( $param_upper ) . '</code>)</li>';
        $output .= '<li><strong>Value:</strong> ' . esc_html( sanitize_key( $_SERVER[ 'HTTP_X_' . $param_upper ] ) ) . '</li>';
    }
    // Check Cookie
    elseif ( isset( $_COOKIE[ $cookie_name ] ) ) {
        $output .= '<li><strong>Source:</strong> Browser Cookie (<code>' . esc_html( $cookie_name ) . '</code>)</li>';
        $output .= '<li><strong>Value:</strong> ' . esc_html( sanitize_key( $_COOKIE[ $cookie_name ] ) ) . '</li>';
    }
    // No variant found
    else {
        $output .= '<li><strong>Source:</strong> None found. Using default.</li>';
    }

    $output .= '<li><strong>Current Path:</strong> ' . esc_html( wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) ) . '</li>';
    $output .= '<li><strong>Matched Cookie Name:</strong> ' . ( $cookie_name ? '<code>' . esc_html( $cookie_name ) . '</code>' : '<em>None</em>' ) . '</li>';
    $output .= '</ul>';
    $output .= '<h4>$_COOKIE Superglobal:</h4><pre>' . esc_html( print_r( $_COOKIE, true ) ) . '</pre>';
    $output .= '</div>';

    return $output;
}
add_shortcode( 'ab_test_debug', 'cloudflare_ab_debug_shortcode' );

