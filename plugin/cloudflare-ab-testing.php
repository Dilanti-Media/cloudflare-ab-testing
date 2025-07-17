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
