<?php
/**
 * Plugin Name:       Cloudflare A/B Testing
 * Plugin URI:        https://dilantimedia.com/
 * Description:       Provides A/B testing capabilities integrated with Cloudflare Workers.
 * Version:           1.0.0
 * Author:            Dilanti Media
 * Author URI:        https://dilantimedia.com/
 * License:           GPL-2.0+
 * License URI:       http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain:       cloudflare-ab-testing
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

define( 'CLOUDFLARE_AB_TESTING_VERSION', '1.0.0' );
define( 'CLOUDFLARE_AB_TESTING_URL', plugin_dir_url( __FILE__ ) );

// Include the new files
require_once plugin_dir_path( __FILE__ ) . 'includes/admin-settings.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/shortcodes.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/cloudflare-api.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/worker-management.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/diagnostics.php';

function cloudflare_ab_get_cookie_for_current_path() {
    $raw = get_option( 'cloudflare_ab_enabled_urls', '' );
    $lines = array_filter( array_map( 'trim', preg_split( '/[\r\n]+/', $raw ) ) );
    $current_path = wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );

    foreach ( $lines as $line ) {
        if ( strpos( $line, '|' ) === false ) continue;

        list( $slug_part, $paths_part ) = array_map( 'trim', explode( '|', $line, 2 ) );
        $slug = sanitize_key( $slug_part );
        if ( ! $slug ) continue;

        $paths = array_filter( array_map( 'trim', explode( ',', $paths_part ) ) );
        if ( in_array( $current_path, $paths, true ) ) {
            return 'AB_' . strtoupper( str_replace( '-', '_', $slug ) );
        }
    }
    return null;
}

add_action( 'wp_enqueue_scripts', 'cloudflare_ab_enqueue_assets' );
function cloudflare_ab_enqueue_assets() {
    // Force no-caching headers for debugging
    if ( ! headers_sent() ) {
        header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
        header("Pragma: no-cache");
        header("Expires: 0");
    }

    // Enqueue JS
    wp_enqueue_script(
        'cloudflare-ab-testing-script',
        CLOUDFLARE_AB_TESTING_URL . 'assets/js/cloudflare-ab-testing.js',
        [],
        CLOUDFLARE_AB_TESTING_VERSION,
        true
    );

    // Pass PHP data to JS
    $raw_urls = get_option( 'cloudflare_ab_enabled_urls', '' );
    $lines = array_filter( array_map( 'trim', preg_split( '/[\r\n]+/', $raw_urls ) ) );
    $tests = [];
    foreach ( $lines as $line ) {
        if ( strpos( $line, '|' ) === false ) continue;
        list( $slug_part, $paths_part ) = array_map( 'trim', explode( '|', $line, 2 ) );
        $slug = sanitize_key( $slug_part );
        if ( empty( $slug ) ) continue;

        $paths = array_values( array_filter( array_map( 'trim', explode( ',', $paths_part ) ) ) );
        if ( empty( $paths ) ) continue;

        $tests[] = [
            'test'       => $slug,
            'paths'      => $paths,
            'cookieName' => 'AB_' . strtoupper( str_replace( '-', '_', $slug ) ),
        ];
    }
    wp_localize_script( 'cloudflare-ab-testing-script', 'cloudflareAbTesting', [ 'registry' => $tests ] );
    
    // Add PHP debug output for logged-in users or when debug mode is enabled
    if ( ( is_user_logged_in() && current_user_can( 'manage_options' ) ) || ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
        cloudflare_ab_add_debug_output( $tests );
    }

    // Enqueue basic inline styles for demo buttons
    $custom_css = ".ab-cta-button { padding: 10px 20px; background-color: #0073aa; color: #fff; border: none; font-size: 1em; cursor: pointer; } .ab-cta-button.variant-b { background-color: #00a0d2; }";
    wp_register_style( 'dm-ab-inline-styles', false );
    wp_enqueue_style( 'dm-ab-inline-styles' );
    wp_add_inline_style( 'dm-ab-inline-styles', $custom_css );
}

add_action( 'admin_init', 'cloudflare_ab_maybe_initialize_defaults' );
function cloudflare_ab_maybe_initialize_defaults() {
    // Only initialize if no configuration exists
    if ( empty( get_option( 'cloudflare_ab_enabled_urls', '' ) ) ) {
        // Set a default test for the homepage
        $default_config = "homepage_test|/";
        update_option( 'cloudflare_ab_enabled_urls', $default_config );
    }
}

function cloudflare_ab_add_debug_output( $tests ) {
    $current_path = wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
    $active_tests = [];
    
    foreach ( $tests as $test ) {
        if ( in_array( $current_path, $test['paths'], true ) ) {
            $cookie_name = $test['cookieName'];
            $variant = 'A'; // Default
            
            // Check for variant in various sources
            if ( !empty( $_GET[$cookie_name] ) ) {
                $variant = sanitize_key( $_GET[$cookie_name] );
                $source = 'URL Parameter';
            } elseif ( !empty( $_SERVER['HTTP_X_' . strtoupper($cookie_name)] ) ) {
                $variant = sanitize_key( $_SERVER['HTTP_X_' . strtoupper($cookie_name)] );
                $source = 'Worker Header';
            } elseif ( !empty( $_COOKIE[$cookie_name] ) ) {
                $variant = sanitize_key( $_COOKIE[$cookie_name] );
                $source = 'Cookie';
            } else {
                $source = 'Default';
            }
            
            $active_tests[] = [
                'test' => $test['test'],
                'variant' => $variant,
                'source' => $source,
                'cookie_name' => $cookie_name,
                'path' => $current_path
            ];
        }
    }
    
    if ( !empty( $active_tests ) ) {
        add_action( 'wp_footer', function() use ( $active_tests ) {
            echo "<!-- A/B Test Debug Info -->\n";
            echo "<script>\n";
            echo "console.log('%c🧪 PHP A/B Test Debug Info:', 'color: #d63638; font-weight: bold; font-size: 14px;');\n";
            foreach ( $active_tests as $test ) {
                echo "console.log('%c   PHP Test: {$test['test']} | Variant: {$test['variant']} | Source: {$test['source']}', 'color: #d63638;');\n";
            }
            echo "</script>\n";
            echo "<!-- End A/B Test Debug -->\n";
        } );
    }
}
