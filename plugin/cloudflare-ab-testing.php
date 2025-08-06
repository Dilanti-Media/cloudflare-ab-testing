<?php
/**
 * Plugin Name:       Cloudflare A/B Testing
 * Plugin URI:        https://dilantimedia.com/
 * Description:       Provides A/B testing capabilities integrated with Cloudflare Workers.
 * Version:           2.1.8
 * Author:            Dilanti Media
 * Author URI:        https://dilantimedia.com/
 * License:           GPL-2.0+
 * License URI:       http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain:       cloudflare-ab-testing
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

define( 'CLOUDFLARE_AB_TESTING_VERSION', '2.1.8' );
define( 'CLOUDFLARE_AB_TESTING_URL', plugin_dir_url( __FILE__ ) );

// Include the new files
require_once plugin_dir_path( __FILE__ ) . 'includes/admin-settings.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/shortcodes.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/cloudflare-api.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/worker-management.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/diagnostics.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/plugin-updater.php';

// Initialize the plugin updater
add_action( 'init', 'cloudflare_ab_init_updater' );
function cloudflare_ab_init_updater() {
    // Check for updates in admin area or CLI context
    if ( is_admin() || defined( 'WP_CLI' ) ) {
        // Get GitHub settings from admin panel
        $github_settings = get_option( 'cloudflare_ab_github_updater', [] );

        // Use defaults if empty, or use configured settings
        $github_username = !empty($github_settings['github_username']) ? $github_settings['github_username'] : 'Dilanti-Media';
        $github_repo = !empty($github_settings['github_repo']) ? $github_settings['github_repo'] : 'cloudflare-ab-testing';

        // Always initialize with defaults or custom settings
        new Cloudflare_AB_Plugin_Updater(
            plugin_basename( __FILE__ ),
            $github_username,
            $github_repo,
            CLOUDFLARE_AB_TESTING_VERSION,
            isset( $github_settings['github_token'] ) ? $github_settings['github_token'] : ''
        );
    }
}

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
        
        // Use same matching logic as your old working code
        foreach ( $paths as $path ) {
            if ( $current_path === $path || strpos( $current_path, $path . '/' ) === 0 ) {
                return 'AB_' . strtoupper( str_replace( '-', '_', $slug ) );
            }
        }
    }
    return null;
}

// Inject A/B meta tags early in head (before any shortcodes) 
add_action( 'wp_head', 'cloudflare_ab_inject_meta_tags', 1 );

// Alternative meta tag injection using output buffering (more aggressive) - DISABLED DUE TO SITE BREAKING
// add_action( 'init', 'cloudflare_ab_start_output_buffering' );

function cloudflare_ab_start_output_buffering() {
    if ( ! is_admin() ) {
        ob_start( 'cloudflare_ab_inject_meta_tags_buffer' );
    }
}

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
    
    // If we have a variant but no test name, infer it from current path configuration
    if ( ! empty( $ab_variant ) && empty( $ab_test ) ) {
        $cookie_name = cloudflare_ab_get_cookie_for_current_path();
        if ( $cookie_name ) {
            // Extract test name from cookie name (AB_HOMEPAGE_TEST -> homepage_test)
            $ab_test = strtolower( str_replace( [ 'AB_', '_' ], [ '', '_' ], $cookie_name ) );
            $ab_test = trim( $ab_test, '_' );
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
    
    // Final check: if we have a valid variant, proceed
    if ( empty( $ab_variant ) ) {
        return;
    }
    
    // Only inject if we have a valid variant from the worker
    if ( in_array( $ab_variant, [ 'A', 'B' ] ) ) {
        echo '<meta name="cf-ab-variant" content="' . esc_attr( $ab_variant ) . '">' . "\n";
        echo '<meta name="cf-ab-test" content="' . esc_attr( $ab_test ) . '">' . "\n";
        
        // Debug comment (only visible in HTML source when WP_DEBUG is enabled)
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            echo '<!-- CF-AB-DEBUG: variant=' . esc_attr( $ab_variant ) . ', test=' . esc_attr( $ab_test ) . ' -->' . "\n";
        }
    }
}

// Removed buffer function as it was causing site to break

// Enqueue scripts and styles
add_action( 'wp_enqueue_scripts', 'cloudflare_ab_enqueue_assets' );
add_action( 'admin_enqueue_scripts', 'cloudflare_ab_enqueue_admin_assets' );
add_action( 'wp_ajax_cloudflare_ab_save_worker_version', 'cloudflare_ab_save_worker_version' );

function cloudflare_ab_enqueue_assets() {
    // Force no-caching headers for debugging (only when debug mode is enabled)
    $debug_enabled = ( 
        ( isset( $_GET['ab_debug'] ) && $_GET['ab_debug'] === '1' && is_user_logged_in() && current_user_can( 'manage_options' ) )
    );
    
    if ( ! headers_sent() && $debug_enabled ) {
        header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
        header("Pragma: no-cache");
        header("Expires: 0");
    }

    // Enqueue main JS
    wp_enqueue_script(
        'cloudflare-ab-testing-script',
        CLOUDFLARE_AB_TESTING_URL . 'assets/js/cloudflare-ab-testing.js',
        [],
        CLOUDFLARE_AB_TESTING_VERSION . '.' . time(),
        true
    );

    // Prepare test configuration
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

    // Get GA4 settings for JavaScript
    $ga4_settings = get_option( 'cloudflare_ab_ga4_settings', [] );
    $ga4_enabled = isset( $ga4_settings['enabled'] ) ? (bool) $ga4_settings['enabled'] : false;
    
    $js_config = [
        'registry' => $tests,
        'debug' => ( 
            // Only enable debug if explicitly requested via URL parameter AND user is admin
            ( isset( $_GET['ab_debug'] ) && $_GET['ab_debug'] === '1' && is_user_logged_in() && current_user_can( 'manage_options' ) )
        )
    ];
    
    // Add GA4 configuration if enabled
    if ( $ga4_enabled ) {
        $js_config['ga4'] = [
            'enabled' => true,
            'event_name' => !empty( $ga4_settings['event_name'] ) ? $ga4_settings['event_name'] : 'abVariantInit',
            'custom_dimensions' => !empty( $ga4_settings['custom_dimensions'] ) ? $ga4_settings['custom_dimensions'] : '',
        ];
    }
    
    wp_localize_script( 'cloudflare-ab-testing-script', 'cloudflareAbTesting', $js_config );
    
    // Enqueue GA4 tracking script if enabled
    if ( $ga4_enabled ) {
        wp_enqueue_script(
            'cloudflare-ab-tracking',
            CLOUDFLARE_AB_TESTING_URL . 'assets/js/cloudflare-ab-tracking.js',
            [],
            CLOUDFLARE_AB_TESTING_VERSION . '.' . time(),
            true
        );
    }

    // Enqueue basic inline styles for demo buttons
    $custom_css = ".ab-cta-button { padding: 10px 20px; background-color: #0073aa; color: #fff; border: none; font-size: 1em; cursor: pointer; } .ab-cta-button.variant-b { background-color: #00a0d2; }";
    wp_register_style( 'dm-ab-inline-styles', false );
    wp_enqueue_style( 'dm-ab-inline-styles' );
    wp_add_inline_style( 'dm-ab-inline-styles', $custom_css );
}

function cloudflare_ab_enqueue_admin_assets( $hook ) {
    // Only load on our admin pages
    if ( strpos( $hook, 'cloudflare-ab' ) === false ) {
        return;
    }
    
    // Enqueue admin CSS
    wp_enqueue_style(
        'cloudflare-ab-admin-styles',
        CLOUDFLARE_AB_TESTING_URL . 'assets/css/admin-styles.css',
        [],
        CLOUDFLARE_AB_TESTING_VERSION
    );
    
    // Enqueue admin JS
    wp_enqueue_script(
        'cloudflare-ab-admin-scripts',
        CLOUDFLARE_AB_TESTING_URL . 'assets/js/admin-scripts.js',
        [ 'jquery' ],
        CLOUDFLARE_AB_TESTING_VERSION . '.' . time(),
        true
    );
    
    // Localize script for AJAX
    wp_localize_script( 'cloudflare-ab-admin-scripts', 'cloudflareAbAdmin', [
        'nonce' => wp_create_nonce( 'cloudflare_ab_admin_nonce' ),
        'ajaxurl' => admin_url( 'admin-ajax.php' ),
        'strings' => [
            'confirmDelete' => __( 'Are you sure you want to delete this? This action cannot be undone.', 'cloudflare-ab-testing' ),
            'loading' => __( 'Loading...', 'cloudflare-ab-testing' ),
            'error' => __( 'An error occurred. Please try again.', 'cloudflare-ab-testing' ),
            'success' => __( 'Operation completed successfully.', 'cloudflare-ab-testing' )
        ]
    ] );
}

function cloudflare_ab_save_worker_version() {
    // Verify nonce
    if ( ! wp_verify_nonce( $_POST['nonce'], 'cloudflare_ab_admin_nonce' ) ) {
        wp_die( 'Security check failed' );
    }
    
    // Check permissions
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Insufficient permissions' );
    }
    
    $worker_version = sanitize_text_field( $_POST['worker_version'] );
    
    // Validate worker version
    if ( ! in_array( $worker_version, ['simple', 'cache'] ) ) {
        wp_send_json_error( 'Invalid worker version' );
    }
    
    // Save the preference
    update_option( 'cloudflare_ab_worker_version', $worker_version );
    
    wp_send_json_success( 'Worker version preference saved' );
}

add_action( 'admin_init', 'cloudflare_ab_maybe_initialize_defaults' );
function cloudflare_ab_maybe_initialize_defaults() {
    // Only initialize if no configuration exists
    if ( empty( get_option( 'cloudflare_ab_enabled_urls', '' ) ) ) {
        // Set a default test for the homepage
        $default_config = "homepage_test|/,/home";
        update_option( 'cloudflare_ab_enabled_urls', $default_config );
    }
}
