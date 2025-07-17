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

/*--------------------------------------------------
  1) Admin Menu & Settings
--------------------------------------------------*/
add_action( 'admin_menu', 'cloudflare_ab_register_admin_page' );
add_action( 'admin_init', 'cloudflare_ab_register_settings' );

function cloudflare_ab_register_admin_page() {
    add_menu_page(
        __( 'A/B Tests', 'cloudflare-ab-testing' ),
        'A/B Tests',
        'manage_options',
        'cloudflare-ab-settings',
        'cloudflare_ab_settings_page_markup',
        'dashicons-chart-area',
        2
    );
    
    // Add diagnostic submenu
    add_submenu_page(
        'cloudflare-ab-settings',
        __( 'A/B Testing Diagnostics', 'cloudflare-ab-testing' ),
        __( 'Diagnostics', 'cloudflare-ab-testing' ),
        'manage_options',
        'cloudflare-ab-diagnostics',
        'cloudflare_ab_diagnostics_page_markup'
    );
    
    // Add worker management submenu
    add_submenu_page(
        'cloudflare-ab-settings',
        __( 'Worker Management', 'cloudflare-ab-testing' ),
        __( 'Worker Management', 'cloudflare-ab-testing' ),
        'manage_options',
        'cloudflare-ab-worker-management',
        'cloudflare_ab_worker_management_page_markup'
    );
}

function cloudflare_ab_register_settings() {
    // Register settings group
    register_setting( 'cloudflare_ab_options_group', 'cloudflare_ab_enabled_urls', 'cloudflare_ab_sanitize_urls' );
    register_setting( 'cloudflare_ab_options_group', 'cloudflare_ab_cloudflare_credentials' );

    // --- Section: Test Configuration ---
    add_settings_section(
        'cloudflare_ab_section_main',
        __( 'A/B Test Configuration', 'cloudflare-ab-testing' ),
        '__return_false',
        'cloudflare-ab-settings'
    );

    add_settings_field(
        'cloudflare_ab_field_urls',
        __( 'Enabled URLs', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_urls_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_main'
    );

    // --- Section: Cloudflare Credentials ---
    add_settings_section(
        'cloudflare_ab_section_cloudflare',
        __( 'Cloudflare Credentials', 'cloudflare-ab-testing' ),
        function() {
            echo '<p>' . esc_html__( 'Credentials required to push the test registry to the Cloudflare KV store.', 'cloudflare-ab-testing' ) . '</p>';
        },
        'cloudflare-ab-settings'
    );

    add_settings_field(
        'cloudflare_ab_field_cf_account_id',
        __( 'Cloudflare Account ID', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_cf_credentials_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_cloudflare',
        [ 'key' => 'account_id', 'label' => 'Account ID', 'help' => 'Find this in your Cloudflare dashboard sidebar under "Account ID"' ]
    );

    add_settings_field(
        'cloudflare_ab_field_cf_namespace_id',
        __( 'KV Namespace ID', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_cf_credentials_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_cloudflare',
        [ 'key' => 'namespace_id', 'label' => 'KV Namespace ID' ]
    );

    add_settings_field(
        'cloudflare_ab_field_cf_api_token',
        __( 'Cloudflare API Token', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_cf_credentials_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_cloudflare',
        [ 'key' => 'api_token', 'label' => 'API Token', 'is_secret' => true, 'help' => 'Create this at My Profile > API Tokens with "Account:Zone:Read" and "Account:Cloudflare Workers:Edit" permissions' ]
    );
}

/*--------------------------------------------------
  2) Markup Callbacks for Settings Fields
--------------------------------------------------*/
function cloudflare_ab_field_urls_markup() {
    $value = get_option( 'cloudflare_ab_enabled_urls', '' );
    ?>
    <p>
        <?php esc_html_e( 'Enter one A/B test per line, in this format: "identifier|/path1,/path2"', 'cloudflare-ab-testing' ); ?>
    </p>
    <textarea name="cloudflare_ab_enabled_urls" rows="8" cols="60" class="large-text code"><?php echo esc_textarea( $value ); ?></textarea>
    <p class="description">
        <?php
        printf(
            wp_kses_post(
                __( 'Example: <code>homepage_banner|/,/home</code> or <code>pricing_button|/pricing,/pricing/compare</code>', 'cloudflare-ab-testing' )
            )
        );
        ?>
    </p>
    <?php
}

function cloudflare_ab_field_cf_credentials_markup( $args ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $key = $args['key'];
    $value = isset( $credentials[$key] ) ? $credentials[$key] : '';
    $type = isset( $args['is_secret'] ) && $args['is_secret'] ? 'password' : 'text';
    ?>
    <input type="<?php echo esc_attr($type); ?>" name="cloudflare_ab_cloudflare_credentials[<?php echo esc_attr($key); ?>]" value="<?php echo esc_attr( $value ); ?>" class="regular-text">
    <?php if ( isset( $args['help'] ) ): ?>
        <p class="description"><?php echo esc_html( $args['help'] ); ?></p>
    <?php endif; ?>
    <?php
}

/*--------------------------------------------------
  3) Settings Page Markup
--------------------------------------------------*/
function cloudflare_ab_settings_page_markup() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    ?>
    <div class="wrap">
        <h1><?php esc_html_e( 'A/B Tests', 'cloudflare-ab-testing' ); ?></h1>
        <form method="post" action="options.php">
            <?php
            settings_fields( 'cloudflare_ab_options_group' );
            do_settings_sections( 'cloudflare-ab-settings' );
            submit_button();
            ?>
        </form>
    </div>
    <?php
}

/*--------------------------------------------------
  4) Sanitization and Utility Functions
--------------------------------------------------*/
function cloudflare_ab_sanitize_urls( $input ) {
    $lines = preg_split( '/[\r\n]+/', trim( $input ) );
    $out   = [];

    foreach ( $lines as $line ) {
        $line = trim( $line );
        if ( empty( $line ) || strpos( $line, '|' ) === false ) {
            continue;
        }

        list( $slug_part, $paths_part ) = array_map( 'trim', explode( '|', $line, 2 ) );
        $slug = sanitize_key( $slug_part );
        if ( empty( $slug ) ) {
            continue;
        }

        $raw_paths  = array_filter( array_map( 'trim', explode( ',', $paths_part ) ) );
        $good_paths = [];
        foreach ( $raw_paths as $p ) {
            if ( strpos( $p, '/' ) !== 0 ) continue;
            $clean = esc_url_raw( $p );
            if ( ! empty( $clean ) ) {
                $parsed = wp_parse_url( $clean, PHP_URL_PATH );
                $good_paths[] = $parsed ? $parsed : $clean;
            }
        }

        if ( ! empty( $good_paths ) ) {
            $out[] = $slug . '|' . implode( ',', $good_paths );
        }
    }
    return implode( "\n", $out );
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
        if ( in_array( $current_path, $paths, true ) ) {
            return 'AB_' . strtoupper( str_replace( '-', '_', $slug ) );
        }
    }
    return null;
}

/*--------------------------------------------------
  5) Shortcode Logic
--------------------------------------------------*/
function cloudflare_ab_simple_ab_shortcode( $atts ) {
    $atts = shortcode_atts( [
        'a'       => '',
        'b'       => '',
        'default' => 'a',
        'param'   => cloudflare_ab_get_cookie_for_current_path() ?? 'AB_VARIANT',
    ], $atts, 'ab_test' );

    $param_upper = strtoupper($atts['param']);
    $sel = $atts['default']; // Default value

    if ( ! empty( $_GET[ $atts['param'] ] ) ) {
        $sel = sanitize_key( $_GET[ $atts['param'] ] );
    } elseif ( ! empty( $_SERVER[ 'HTTP_X_' . $param_upper ] ) ) {
        $sel = sanitize_key( $_SERVER[ 'HTTP_X_' . $param_upper ] );
    } elseif ( ! empty( $_COOKIE[ $atts['param'] ] ) ) {
        $sel = sanitize_key( $_COOKIE[ $atts['param'] ] );
    }

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

/*--------------------------------------------------
  5b) Debug Shortcode
--------------------------------------------------*/
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


/*--------------------------------------------------
  6) Enqueue Scripts & Styles
--------------------------------------------------*/
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

/*--------------------------------------------------
  7) Push Registry to Cloudflare KV on Update
--------------------------------------------------*/
add_action( 'update_option_cloudflare_ab_enabled_urls', 'cloudflare_ab_push_registry_to_kv', 10, 2 );
function cloudflare_ab_push_registry_to_kv( $old_value, $new_value ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id   = $credentials['account_id'] ?? '';
    $cf_namespace_id = $credentials['namespace_id'] ?? '';
    $cf_api_token    = $credentials['api_token'] ?? '';

    if ( empty($cf_account_id) || empty($cf_namespace_id) || empty($cf_api_token) ) {
        error_log('[DM A/B] Cloudflare credentials are not set. Cannot push to KV.');
        return;
    }

    $lines = array_filter( array_map( 'trim', preg_split( '/[\r\n]+/', $new_value ) ) );
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

    $json_payload = wp_json_encode( array_values( $tests ) );
    $url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/storage/kv/namespaces/{$cf_namespace_id}/values/registry";

    $response = wp_remote_request( $url, [
        'method'  => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type'  => 'application/json',
        ],
        'body'    => $json_payload,
        'timeout' => 15,
    ] );

    if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
        error_log( '[DM A/B] Failed to update KV registry: ' . print_r( $response, true ) );
    }
}

/*--------------------------------------------------
  7b) Initialize Default Test Configuration
--------------------------------------------------*/
add_action( 'admin_init', 'cloudflare_ab_maybe_initialize_defaults' );
function cloudflare_ab_maybe_initialize_defaults() {
    // Only initialize if no configuration exists
    if ( empty( get_option( 'cloudflare_ab_enabled_urls', '' ) ) ) {
        // Set a default test for the homepage
        $default_config = "homepage_test|/";
        update_option( 'cloudflare_ab_enabled_urls', $default_config );
    }
}

/*--------------------------------------------------
  8) Cloudflare KV API Helper Functions
--------------------------------------------------*/
function cloudflare_ab_get_cloudflare_kv_namespaces() {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        return new WP_Error( 'missing_credentials', 'Account ID and API Token are required' );
    }
    
    $url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/storage/kv/namespaces";
    
    $response = wp_remote_get( $url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $response ) ) {
        return $response;
    }
    
    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );
    $data = json_decode( $body, true );
    
    if ( $status_code !== 200 ) {
        return new WP_Error( 'api_error', 'Cloudflare API Error: ' . ($data['errors'][0]['message'] ?? 'Unknown error') );
    }
    
    return $data['result'] ?? [];
}

function cloudflare_ab_create_cloudflare_kv_namespace( $namespace_name ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        return new WP_Error( 'missing_credentials', 'Account ID and API Token are required' );
    }
    
    $url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/storage/kv/namespaces";
    
    $response = wp_remote_post( $url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'body' => json_encode( ['title' => $namespace_name] ),
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $response ) ) {
        return $response;
    }
    
    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );
    $data = json_decode( $body, true );
    
    if ( $status_code !== 200 ) {
        return new WP_Error( 'api_error', 'Cloudflare API Error: ' . ($data['errors'][0]['message'] ?? 'Unknown error') );
    }
    
    return $data['result'] ?? [];
}

// Handle AJAX requests for KV namespace management
add_action( 'wp_ajax_cloudflare_ab_create_kv_namespace', 'cloudflare_ab_ajax_create_kv_namespace' );
function cloudflare_ab_ajax_create_kv_namespace() {
    check_ajax_referer( 'cloudflare_ab_kv_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $namespace_name = sanitize_text_field( $_POST['namespace_name'] ?? '' );
    if ( empty( $namespace_name ) ) {
        wp_send_json_error( 'Namespace name is required' );
    }
    
    $result = cloudflare_ab_create_cloudflare_kv_namespace( $namespace_name );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

add_action( 'wp_ajax_cloudflare_ab_select_kv_namespace', 'cloudflare_ab_ajax_select_kv_namespace' );
function cloudflare_ab_ajax_select_kv_namespace() {
    check_ajax_referer( 'cloudflare_ab_kv_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $namespace_id = sanitize_text_field( $_POST['namespace_id'] ?? '' );
    if ( empty( $namespace_id ) ) {
        wp_send_json_error( 'Namespace ID is required' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $credentials['namespace_id'] = $namespace_id;
    update_option( 'cloudflare_ab_cloudflare_credentials', $credentials );
    
    wp_send_json_success( 'Namespace selected successfully' );
}

add_action( 'wp_ajax_cloudflare_ab_fetch_kv_namespaces', 'cloudflare_ab_ajax_fetch_kv_namespaces' );
function cloudflare_ab_ajax_fetch_kv_namespaces() {
    check_ajax_referer( 'cloudflare_ab_kv_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $result = cloudflare_ab_get_cloudflare_kv_namespaces();
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

add_action( 'wp_ajax_cloudflare_ab_test_credentials', 'cloudflare_ab_ajax_test_credentials' );
function cloudflare_ab_ajax_test_credentials() {
    check_ajax_referer( 'cloudflare_ab_kv_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        wp_send_json_error( 'Account ID and API Token are required' );
    }
    
    // Clean the API token (remove any whitespace)
    $cf_api_token = trim( $cf_api_token );
    
    // Validate token format and detect common issues
    $token_length = strlen( $cf_api_token );
    
    // Check if it might be a Global API Key (37 characters, hex)
    if ( $token_length === 37 && ctype_xdigit( $cf_api_token ) ) {
        wp_send_json_error( 'This appears to be a Global API Key, not an API Token. Please create a custom API Token instead.' );
    }
    
    // Check general token format
    if ( $token_length < 20 || $token_length > 50 ) {
        wp_send_json_error( 'API Token format appears invalid (length: ' . $token_length . ')' );
    }
    
    // Test with a simple API call to verify the token
    $url = "https://api.cloudflare.com/client/v4/user/tokens/verify";
    
    $response = wp_remote_get( $url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
            'User-Agent' => 'DM-AB-Testing/1.0.0'
        ],
        'timeout' => 15,
        'sslverify' => true
    ] );
    
    if ( is_wp_error( $response ) ) {
        wp_send_json_error( 'Network error: ' . $response->get_error_message() );
    }
    
    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );
    $data = json_decode( $body, true );
    
    // Return detailed debugging info
    $debug_info = [
        'status_code' => $status_code,
        'raw_body' => $body,
        'parsed_data' => $data,
        'token_length' => strlen( $cf_api_token ),
        'token_preview' => substr( $cf_api_token, 0, 8 ) . '...' . substr( $cf_api_token, -4 )
    ];
    
    if ( $status_code === 200 && isset( $data['success'] ) && $data['success'] ) {
        wp_send_json_success( [
            'message' => 'API Token is valid',
            'token_status' => $data['result']['status'] ?? 'active',
            'debug' => $debug_info
        ] );
    } else {
        $error_msg = 'Authentication failed';
        
        if ( isset( $data['errors'] ) && is_array( $data['errors'] ) && ! empty( $data['errors'] ) ) {
            $error_msg = $data['errors'][0]['message'] ?? $error_msg;
        }
        
        wp_send_json_error( $error_msg . ' (HTTP ' . $status_code . ')', $debug_info );
    }
}

/*--------------------------------------------------
  9) Cloudflare Worker Management Functions
--------------------------------------------------*/

function cloudflare_ab_get_worker_from_file($version = 'cache') {
    $worker_file = ($version === 'simple') ? 'ab-simple-worker.js' : 'ab-cache-worker.js';
    $worker_path = plugin_dir_path(__FILE__) . 'workers/' . $worker_file;
    
    if (file_exists($worker_path)) {
        return file_get_contents($worker_path);
    }
    
    return false;
}

function cloudflare_ab_get_worker_template($version = 'cache') {
    // Get worker from local file first
    $worker_content = cloudflare_ab_get_worker_from_file($version);
    if ($worker_content) {
        return $worker_content;
    }
    
    // Fallback to embedded template
    return '
addEventListener(\'fetch\', event => {
  event.respondWith(handleRequest(event.request, event));
});

const CONFIG = {
  TIMEOUT_MS: 30000,
  CACHE_TTL: 14400, // 4 hours
  REGISTRY_CACHE_TTL: 300,
  COOKIE_MAX_AGE: 31536000,
  VALID_VARIANTS: [\'A\', \'B\'],
  MAX_COOKIE_SIZE: 8192,
  STATIC_CACHE: {
    IMAGES: { edge: 604800, browser: 86400 },
    FONTS: { edge: 2592000, browser: 604800 },
    STYLES_SCRIPTS: { edge: 43200, browser: 1800 },
    DEFAULT: { edge: 86400, browser: 3600 }
  }
};

// Simple logging
function logInfo(...args) {
  console.log(...args);
}

function logWarn(...args) {
  console.warn(...args);
}

function logError(...args) {
  console.error(...args);
}

// Basic config validation
if (!CONFIG.CACHE_TTL || !CONFIG.TIMEOUT_MS) {
  throw new Error(\'Invalid worker configuration\');
}

logInfo(\'Worker initialized successfully\');

// Simple debug info
function createDebugInfo(request) {
  return {
    timestamp: new Date().toISOString(),
    method: request.method,
    cfRay: request.headers.get(\'CF-Ray\')
  };
}

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const debug = createDebugInfo(request);
  
  try {
    // Skip processing for admin, API, or static files
    if (shouldBypassProcessing(url, request)) {
      logInfo(\'Bypassing processing for:\', url.pathname);
      return fetch(request);
    }

    // Get A/B test registry
    const registry = await getTestRegistry();
    if (!registry || registry.length === 0) {
      logInfo(\'No A/B tests configured\');
      return fetch(request);
    }

    // Find matching test for current path
    const matchingTest = findMatchingTest(url.pathname, registry);
    if (!matchingTest) {
      logInfo(\'No matching test for path:\', url.pathname);
      return fetch(request);
    }

    // Handle A/B test logic
    return handleABTest(request, url, matchingTest, debug);
    
  } catch (error) {
    logError(\'Worker error:\', error);
    return fetch(request);
  }
}

function shouldBypassProcessing(url, request) {
  const path = url.pathname;
  
  // Admin and API paths
  if (path.startsWith(\'/wp-admin/\') || 
      path.startsWith(\'/wp-json/\') || 
      path.startsWith(\'/wp-login\')) {
    return true;
  }
  
  // Static files
  const staticExtensions = [\'.jpg\', \'.jpeg\', \'.png\', \'.gif\', \'.webp\', \'.svg\', 
                           \'.css\', \'.js\', \'.woff\', \'.woff2\', \'.ttf\', \'.eot\',
                           \'.pdf\', \'.zip\', \'.ico\', \'.xml\', \'.txt\'];
  
  if (staticExtensions.some(ext => path.endsWith(ext))) {
    return true;
  }
  
  // Logged-in users (check cookies)
  const cookies = request.headers.get(\'Cookie\') || \'\';
  if (cookies.includes(\'wordpress_logged_in_\')) {
    return true;
  }
  
  // Debug flags
  if (url.searchParams.has(\'__cf_bypass_cache\') || 
      url.searchParams.has(\'nonitro\')) {
    return true;
  }
  
  return false;
}

async function getTestRegistry() {
  try {
    if (typeof AB_TESTS_KV === \'undefined\') {
      logWarn(\'KV namespace not bound\');
      return [];
    }
    
    const registry = await AB_TESTS_KV.get("registry", { type: "json" }) || [];
    logInfo(\'Registry loaded:\', registry.length, \'tests\');
    return registry;
    
  } catch (error) {
    logError(\'Registry fetch failed:\', error);
    return [];
  }
}

function findMatchingTest(pathname, registry) {
  return registry.find(test => {
    return test.paths && test.paths.some(path => {
      if (pathname === path) return true;
      const normalizedPath = path.endsWith(\'/\') ? path : path + \'/\';
      return pathname.startsWith(normalizedPath);
    });
  });
}

async function handleABTest(request, url, test, debug) {
  const headers = new Headers(request.headers);
  let variant = getVariantFromRequest(request, test.cookieName);
  
  // Generate variant if not set
  if (!variant) {
    variant = generateVariant(request);
  }
  
  // Add variant header for origin
  headers.set(\'X-\' + test.cookieName, variant);
  
  // Create modified request
  const modifiedRequest = new Request(request, { headers });
  
  // Get response from origin
  const response = await fetch(modifiedRequest);
  
  // Create response with A/B cookie
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
  
  // Set A/B test cookie
  newResponse.headers.set(\'Set-Cookie\', 
    `${test.cookieName}=${variant}; Path=/; Max-Age=${CONFIG.COOKIE_MAX_AGE}; SameSite=Lax`);
  
  // Add debug headers
  newResponse.headers.set(\'X-Worker-Active\', \'true\');
  newResponse.headers.set(\'X-AB-Test\', test.test);
  newResponse.headers.set(\'X-AB-Variant\', variant);
  
  return newResponse;
}

function getVariantFromRequest(request, cookieName) {
  const url = new URL(request.url);
  
  // Check URL parameter first
  const urlVariant = url.searchParams.get(cookieName);
  if (CONFIG.VALID_VARIANTS.includes(urlVariant)) {
    return urlVariant;
  }
  
  // Check cookie
  const cookies = request.headers.get(\'Cookie\') || \'\';
  const cookieMatch = cookies.match(new RegExp(cookieName + \'=([AB])\'));
  if (cookieMatch) {
    return cookieMatch[1];
  }
  
  return null;
}

function generateVariant(request) {
  // Simple IP-based deterministic assignment
  const ip = request.headers.get(\'CF-Connecting-IP\') || 
             request.headers.get(\'X-Forwarded-For\') || 
             \'127.0.0.1\';
  
  // Simple hash of IP
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash) % 2 === 0 ? \'A\' : \'B\';
}
';
}

function cloudflare_ab_deploy_worker( $worker_name, $zone_id, $namespace_id, $version = 'cache' ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        return new WP_Error( 'missing_credentials', 'Account ID and API Token are required' );
    }
    
    $worker_script = cloudflare_ab_get_worker_template($version);
    
    // Step 1: Upload worker script
    $upload_url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts/{$worker_name}";
    
    $upload_response = wp_remote_request( $upload_url, [
        'method' => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/javascript',
        ],
        'body' => $worker_script,
        'timeout' => 30,
    ] );
    
    if ( is_wp_error( $upload_response ) ) {
        return $upload_response;
    }
    
    if ( wp_remote_retrieve_response_code( $upload_response ) !== 200 ) {
        $body = wp_remote_retrieve_body( $upload_response );
        return new WP_Error( 'upload_failed', 'Worker upload failed: ' . $body );
    }
    
    // Step 2: Bind KV namespace
    $bindings_url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts/{$worker_name}/bindings";
    
    $bindings_data = [
        'bindings' => [
            [
                'type' => 'kv_namespace',
                'name' => 'AB_TESTS_KV',
                'namespace_id' => $namespace_id
            ]
        ]
    ];
    
    $bindings_response = wp_remote_request( $bindings_url, [
        'method' => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'body' => json_encode( $bindings_data ),
        'timeout' => 30,
    ] );
    
    if ( is_wp_error( $bindings_response ) ) {
        return $bindings_response;
    }
    
    if ( wp_remote_retrieve_response_code( $bindings_response ) !== 200 ) {
        $body = wp_remote_retrieve_body( $bindings_response );
        return new WP_Error( 'bindings_failed', 'KV binding failed: ' . $body );
    }
    
    // Step 3: Create route for the zone
    $routes_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes";
    
    $route_data = [
        'pattern' => '*',
        'script' => $worker_name
    ];
    
    $route_response = wp_remote_post( $routes_url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'body' => json_encode( $route_data ),
        'timeout' => 30,
    ] );
    
    if ( is_wp_error( $route_response ) ) {
        return $route_response;
    }
    
    if ( wp_remote_retrieve_response_code( $route_response ) !== 200 ) {
        $body = wp_remote_retrieve_body( $route_response );
        return new WP_Error( 'route_failed', 'Route creation failed: ' . $body );
    }
    
    return [
        'worker_name' => $worker_name,
        'zone_id' => $zone_id,
        'namespace_id' => $namespace_id,
        'status' => 'deployed'
    ];
}

function cloudflare_ab_get_zones() {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_api_token) ) {
        return new WP_Error( 'missing_token', 'API Token is required' );
    }
    
    $url = "https://api.cloudflare.com/client/v4/zones";
    
    $response = wp_remote_get( $url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $response ) ) {
        return $response;
    }
    
    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );
    $data = json_decode( $body, true );
    
    if ( $status_code !== 200 ) {
        return new WP_Error( 'api_error', 'Cloudflare API Error: ' . ($data['errors'][0]['message'] ?? 'Unknown error') );
    }
    
    return $data['result'] ?? [];
}

/*--------------------------------------------------
  10) Diagnostic Page
--------------------------------------------------*/
function cloudflare_ab_diagnostics_page_markup() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    
    $enabled_urls = get_option( 'cloudflare_ab_enabled_urls', '' );
    $cf_credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $current_path = isset($_SERVER['REQUEST_URI']) ? wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) : '/';
    
    ?>
    <div class="wrap">
        <h1><?php esc_html_e( 'A/B Testing Diagnostics', 'cloudflare-ab-testing' ); ?></h1>
        
        <div class="notice notice-info">
            <p><?php esc_html_e( 'This page helps diagnose common A/B testing configuration issues.', 'cloudflare-ab-testing' ); ?></p>
        </div>
        
        <?php
        // Configuration Status
        echo '<div class="postbox" style="margin-top: 20px;">';
        echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Configuration Status</h2>';
        echo '<div class="inside" style="padding: 15px;">';
        
        // Check if URLs are configured
        if ( empty( trim( $enabled_urls ) ) ) {
            echo '<p><span class="dashicons dashicons-warning" style="color: #d63638;"></span> <strong>No A/B test URLs configured</strong></p>';
            echo '<p>Go to <a href="' . admin_url('admin.php?page=cloudflare-ab-settings') . '">A/B Tests</a> to configure test URLs.</p>';
        } else {
            echo '<p><span class="dashicons dashicons-yes" style="color: #00a32a;"></span> <strong>A/B test URLs configured</strong></p>';
        }
        
        // Check Cloudflare credentials
        $cf_account_id = $cf_credentials['account_id'] ?? '';
        $cf_namespace_id = $cf_credentials['namespace_id'] ?? '';
        $cf_api_token = $cf_credentials['api_token'] ?? '';
        
        if ( empty($cf_account_id) || empty($cf_namespace_id) || empty($cf_api_token) ) {
            echo '<p><span class="dashicons dashicons-warning" style="color: #d63638;"></span> <strong>Cloudflare credentials incomplete</strong></p>';
            echo '<p>Missing: ';
            $missing = [];
            if (empty($cf_account_id)) $missing[] = 'Account ID';
            if (empty($cf_namespace_id)) $missing[] = 'Namespace ID';
            if (empty($cf_api_token)) $missing[] = 'API Token';
            echo implode(', ', $missing);
            echo '</p>';
            
            // If we have account ID and API token but missing namespace, show KV management
            if ( !empty($cf_account_id) && !empty($cf_api_token) && empty($cf_namespace_id) ) {
                echo '<div id="kv-namespace-management" style="margin-top: 15px; padding: 15px; background: #f9f9f9; border: 1px solid #ddd;">';
                echo '<h4>KV Namespace Management</h4>';
                echo '<p>We can fetch your existing KV namespaces or create a new one:</p>';
                
                echo '<button id="test-credentials" class="button" style="margin-right: 10px;">Test Credentials</button>';
                echo '<button id="fetch-kv-namespaces" class="button">Fetch Existing Namespaces</button>';
                echo '<button id="show-create-namespace" class="button" style="margin-left: 10px;">Create New Namespace</button>';
                
                echo '<div id="kv-namespaces-list" style="margin-top: 15px; display: none;"></div>';
                echo '<div id="create-namespace-form" style="margin-top: 15px; display: none;">';
                echo '<input type="text" id="new-namespace-name" placeholder="Enter namespace name (e.g., ab-testing-prod)" style="width: 300px;">';
                echo '<button id="create-namespace" class="button button-primary" style="margin-left: 10px;">Create Namespace</button>';
                echo '</div>';
                
                echo '<div id="kv-status" style="margin-top: 10px;"></div>';
                echo '</div>';
            }
            
            // Show help for finding credentials
            if ( empty($cf_account_id) || empty($cf_api_token) ) {
                echo '<div style="margin-top: 15px; padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-left: 4px solid #f39c12;">';
                echo '<h4 style="margin-top: 0;">How to Find Your Cloudflare Credentials</h4>';
                
                if ( empty($cf_account_id) ) {
                    echo '<p><strong>Finding Your Account ID:</strong></p>';
                    echo '<ol>';
                    echo '<li>Go to your <a href="https://dash.cloudflare.com/" target="_blank">Cloudflare Dashboard</a></li>';
                    echo '<li>Select any domain (or go to the main dashboard)</li>';
                    echo '<li>Look at the right sidebar - you\'ll see "Account ID" listed there</li>';
                    echo '<li>Copy the Account ID (it looks like: <code>c828a88271d7400c5abc709d4e6b97f7</code>)</li>';
                    echo '</ol>';
                }
                
                if ( empty($cf_api_token) ) {
                    echo '<p><strong>Creating an API Token (NOT Global API Key):</strong></p>';
                    echo '<div style="background: #e8f4f8; padding: 10px; margin: 10px 0; border-left: 4px solid #2196f3;">';
                    echo '<p><strong>⚠️ Important:</strong> You need an <strong>API Token</strong>, not the Global API Key!</p>';
                    echo '</div>';
                    
                    echo '<p><strong>Step-by-step instructions:</strong></p>';
                    echo '<ol>';
                    echo '<li>Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">My Profile > API Tokens</a></li>';
                    echo '<li>Click "Create Token" (the blue button)</li>';
                    echo '<li><strong>Choose Template:</strong> Select "Custom token" (not any preset template)</li>';
                    echo '<li><strong>Token Name:</strong> Enter something like "A/B Testing Plugin"</li>';
                    echo '<li><strong>Permissions:</strong> Add these two permissions:</li>';
                    echo '<ul style="margin: 10px 0;">';
                    echo '<li><strong>Account</strong> → <code>Cloudflare Workers:Edit</code></li>';
                    echo '<li><strong>Zone</strong> → <code>Zone:Read</code></li>';
                    echo '</ul>';
                    echo '<li><strong>Account Resources:</strong> Select "Include - All accounts"</li>';
                    echo '<li><strong>Zone Resources:</strong> Select "Include - All zones" (or choose specific zones)</li>';
                    echo '<li><strong>Client IP Address Filtering:</strong> Leave blank (optional)</li>';
                    echo '<li><strong>TTL:</strong> Leave blank for no expiration (or set as needed)</li>';
                    echo '<li>Click "Continue to summary"</li>';
                    echo '<li>Review and click "Create Token"</li>';
                    echo '<li><strong>Copy the token immediately</strong> - it won\'t be shown again!</li>';
                    echo '</ol>';
                    
                    echo '<div style="background: #fff3cd; padding: 10px; margin: 10px 0; border-left: 4px solid #f39c12;">';
                    echo '<p><strong>📋 Alternative: Use a Preset Template</strong></p>';
                    echo '<p>You can also use the <strong>"Edit Cloudflare Workers"</strong> preset template, then add <strong>Zone:Read</strong> permission manually.</p>';
                    echo '</div>';
                }
                
                echo '<p><strong>💡 Troubleshooting Authentication Errors:</strong></p>';
                echo '<ul>';
                echo '<li><strong>Invalid request headers:</strong> Usually means the API token format is wrong or has extra characters</li>';
                echo '<li><strong>Account ID:</strong> Should be a 32-character hex string like <code>c828a88271d7400c5abc709d4e6b97f7</code></li>';
                echo '<li><strong>API Token:</strong> Should be 40+ characters, starting with letters/numbers</li>';
                echo '<li><strong>Token Permissions:</strong> Must include "Account:Cloudflare Workers:Edit" and "Zone:Read"</li>';
                echo '<li><strong>Token Expiration:</strong> Check if your token has expired</li>';
                echo '<li><strong>Copy/Paste Issues:</strong> Make sure no extra spaces or characters were copied</li>';
                echo '</ul>';
                
                echo '<p><strong>🔍 Common Token Issues:</strong></p>';
                echo '<div style="background: #ffebee; padding: 10px; margin: 10px 0; border-left: 4px solid #f44336;">';
                echo '<p><strong>❌ Don\'t use Global API Key:</strong></p>';
                echo '<ul>';
                echo '<li>Global API Key (37 characters, hex) won\'t work for this</li>';
                echo '<li>Global API Key gives too much access and isn\'t recommended</li>';
                echo '<li>You need a custom API Token with specific permissions</li>';
                echo '</ul>';
                echo '</div>';
                
                echo '<div style="background: #e8f5e8; padding: 10px; margin: 10px 0; border-left: 4px solid #4caf50;">';
                echo '<p><strong>✅ Use API Token instead:</strong></p>';
                echo '<ul>';
                echo '<li>API Token: 40+ characters, mixed alphanumeric</li>';
                echo '<li>Example: <code>1234567890abcdef1234567890abcdef12345678</code></li>';
                echo '<li>Created in "API Tokens" section (not "Global API Key")</li>';
                echo '<li>Has specific permissions only</li>';
                echo '</ul>';
                echo '</div>';
                
                echo '<p><strong>🎯 Recommended Setup:</strong></p>';
                echo '<ol>';
                echo '<li>Use "Edit Cloudflare Workers" preset template</li>';
                echo '<li>Add "Zone:Read" permission manually</li>';
                echo '<li>Set to "All accounts" and "All zones"</li>';
                echo '<li>No expiration (leave TTL blank)</li>';
                echo '</ol>';
                echo '</div>';
            }
        } else {
            echo '<p><span class="dashicons dashicons-yes" style="color: #00a32a;"></span> <strong>Cloudflare credentials configured</strong></p>';
        }
        
        echo '</div></div>';
        
        // Test Registry
        if ( ! empty( trim( $enabled_urls ) ) ) {
            echo '<div class="postbox" style="margin-top: 20px;">';
            echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Test Registry</h2>';
            echo '<div class="inside" style="padding: 15px;">';
            
            $lines = array_filter( array_map( 'trim', preg_split( '/[\r\n]+/', $enabled_urls ) ) );
            $parsed_tests = [];
            
            foreach ( $lines as $line ) {
                if ( strpos( $line, '|' ) === false ) continue;
                list( $slug_part, $paths_part ) = array_map( 'trim', explode( '|', $line, 2 ) );
                $slug = sanitize_key( $slug_part );
                if ( empty( $slug ) ) continue;
                
                $paths = array_values( array_filter( array_map( 'trim', explode( ',', $paths_part ) ) ) );
                if ( empty( $paths ) ) continue;
                
                $cookie_name = 'AB_' . strtoupper( str_replace( '-', '_', $slug ) );
                $is_current_path_active = in_array( $current_path, $paths, true );
                
                $parsed_tests[] = [
                    'slug' => $slug,
                    'paths' => $paths,
                    'cookie_name' => $cookie_name,
                    'is_active' => $is_current_path_active
                ];
            }
            
            if ( empty( $parsed_tests ) ) {
                echo '<p>No valid tests found in configuration.</p>';
            } else {
                echo '<table class="widefat striped">';
                echo '<thead><tr><th>Test ID</th><th>Paths</th><th>Cookie Name</th><th>Status</th></tr></thead>';
                echo '<tbody>';
                
                foreach ( $parsed_tests as $test ) {
                    $status_icon = $test['is_active'] ? 
                        '<span class="dashicons dashicons-yes" style="color: #00a32a;"></span> Active on current path' : 
                        '<span class="dashicons dashicons-minus" style="color: #999;"></span> Inactive';
                    
                    echo '<tr>';
                    echo '<td><code>' . esc_html( $test['slug'] ) . '</code></td>';
                    echo '<td>' . implode( ', ', array_map( 'esc_html', $test['paths'] ) ) . '</td>';
                    echo '<td><code>' . esc_html( $test['cookie_name'] ) . '</code></td>';
                    echo '<td>' . $status_icon . '</td>';
                    echo '</tr>';
                }
                
                echo '</tbody></table>';
            }
            
            echo '</div></div>';
        }
        
        // Current Request Info
        echo '<div class="postbox" style="margin-top: 20px;">';
        echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Current Request Info</h2>';
        echo '<div class="inside" style="padding: 15px;">';
        
        echo '<p><strong>Current Path:</strong> <code>' . esc_html( $current_path ) . '</code></p>';
        echo '<p><strong>Request URI:</strong> <code>' . esc_html( $_SERVER['REQUEST_URI'] ?? 'N/A' ) . '</code></p>';
        
        // Check for A/B test cookies
        $ab_cookies = [];
        foreach ( $_COOKIE as $name => $value ) {
            if ( strpos( $name, 'AB_' ) === 0 ) {
                $ab_cookies[ $name ] = $value;
            }
        }
        
        if ( ! empty( $ab_cookies ) ) {
            echo '<p><strong>A/B Test Cookies Found:</strong></p>';
            echo '<ul>';
            foreach ( $ab_cookies as $name => $value ) {
                echo '<li><code>' . esc_html( $name ) . '</code> = <code>' . esc_html( $value ) . '</code></li>';
            }
            echo '</ul>';
        } else {
            echo '<p><strong>A/B Test Cookies:</strong> None found</p>';
        }
        
        // Check for Cloudflare Worker headers
        $cf_headers = [];
        foreach ( $_SERVER as $key => $value ) {
            if ( strpos( $key, 'HTTP_X_AB_' ) === 0 || strpos( $key, 'HTTP_X_WORKER' ) === 0 || strpos( $key, 'HTTP_X_CACHE' ) === 0 ) {
                $cf_headers[ $key ] = $value;
            }
        }
        
        if ( ! empty( $cf_headers ) ) {
            echo '<p><strong>Cloudflare Worker Headers:</strong></p>';
            echo '<ul>';
            foreach ( $cf_headers as $name => $value ) {
                echo '<li><code>' . esc_html( $name ) . '</code> = <code>' . esc_html( $value ) . '</code></li>';
            }
            echo '</ul>';
        } else {
            echo '<p><strong>Cloudflare Worker Headers:</strong> None found</p>';
        }
        
        echo '</div></div>';
        
        // Test Shortcode Simulator
        echo '<div class="postbox" style="margin-top: 20px;">';
        echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Shortcode Simulator</h2>';
        echo '<div class="inside" style="padding: 15px;">';
        
        echo '<p>Test how shortcodes would behave with different variant values:</p>';
        
        // Simulate [ab_test] shortcode
        $cookie_name = cloudflare_ab_get_cookie_for_current_path();
        echo '<div style="background: #f9f9f9; padding: 10px; margin: 10px 0; border-left: 4px solid #0073aa;">';
        echo '<p><strong>Shortcode:</strong> <code>[ab_test a="Variant A Content" b="Variant B Content"]</code></p>';
        echo '<p><strong>Current Path Cookie:</strong> ' . ($cookie_name ? '<code>' . esc_html($cookie_name) . '</code>' : 'No matching test') . '</p>';
        
        if ( $cookie_name ) {
            $current_variant = $_COOKIE[$cookie_name] ?? 'A';
            echo '<p><strong>Current Variant:</strong> <code>' . esc_html($current_variant) . '</code></p>';
            echo '<p><strong>Would Display:</strong> "' . ($current_variant === 'B' ? 'Variant B Content' : 'Variant A Content') . '"</p>';
        } else {
            echo '<p><strong>Result:</strong> No active test for current path - would display default (Variant A)</p>';
        }
        echo '</div>';
        
        // Test URLs
        echo '<p><strong>Test URLs:</strong></p>';
        echo '<ul>';
        echo '<li><a href="' . esc_url( add_query_arg( $cookie_name ?: 'AB_TEST', 'A', home_url( $current_path ) ) ) . '" target="_blank">Test Variant A</a></li>';
        echo '<li><a href="' . esc_url( add_query_arg( $cookie_name ?: 'AB_TEST', 'B', home_url( $current_path ) ) ) . '" target="_blank">Test Variant B</a></li>';
        echo '</ul>';
        
        echo '</div></div>';
        
        // Troubleshooting
        echo '<div class="postbox" style="margin-top: 20px;">';
        echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Troubleshooting</h2>';
        echo '<div class="inside" style="padding: 15px;">';
        
        echo '<h3>Common Issues:</h3>';
        echo '<ol>';
        echo '<li><strong>Shortcodes not working:</strong> Make sure the plugin is activated and test URLs are configured.</li>';
        echo '<li><strong>Always showing the same variant:</strong> Check if Cloudflare Worker is running and cookies are being set.</li>';
        echo '<li><strong>Tests not appearing:</strong> Verify the current path matches one of the configured test paths.</li>';
        echo '<li><strong>KV updates failing:</strong> Check Cloudflare credentials and API token permissions.</li>';
        echo '</ol>';
        
        echo '<h3>Debug Steps:</h3>';
        echo '<ol>';
        echo '<li>Use the <code>[ab_test_debug]</code> shortcode on pages to see detailed debug info.</li>';
        echo '<li>Check browser cookies and look for <code>AB_*</code> cookies.</li>';
        echo '<li>Inspect response headers for Cloudflare Worker headers (<code>X-Worker-*</code>).</li>';
        echo '<li>Test manually with URL parameters like <code>?AB_TEST=A</code> or <code>?AB_TEST=B</code>.</li>';
        echo '</ol>';
        
        echo '</div></div>';
        ?>
        
        <!-- KV Namespace Management JavaScript -->
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            const nonce = '<?php echo wp_create_nonce('cloudflare_ab_kv_nonce'); ?>';
            
            // Test credentials
            $('#test-credentials').click(function() {
                const button = $(this);
                const status = $('#kv-status');
                
                button.prop('disabled', true).text('Testing...');
                status.html('<p>Testing Cloudflare credentials...</p>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_test_credentials',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            status.html('<p style="color: green;">✅ Credentials are valid! Token status: ' + response.data.token_status + '</p>' +
                                '<p style="color: gray; font-size: 12px;">Token preview: ' + response.data.debug.token_preview + '</p>');
                        } else {
                            let errorHtml = '<p style="color: red;">❌ Credentials test failed: ' + response.data + '</p>';
                            
                            // Show specific help for Global API Key detection
                            if (response.data.includes('Global API Key')) {
                                errorHtml += '<div style="background: #ffebee; padding: 15px; margin: 15px 0; border-left: 4px solid #f44336;">';
                                errorHtml += '<h4 style="margin-top: 0; color: #d32f2f;">❌ Global API Key Detected</h4>';
                                errorHtml += '<p>You\'re using a Global API Key, but you need to create an API Token instead.</p>';
                                errorHtml += '<p><strong>Quick fix:</strong></p>';
                                errorHtml += '<ol>';
                                errorHtml += '<li>Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">Cloudflare API Tokens</a></li>';
                                errorHtml += '<li>Click "Create Token"</li>';
                                errorHtml += '<li>Use "Edit Cloudflare Workers" template</li>';
                                errorHtml += '<li>Add "Zone:Read" permission</li>';
                                errorHtml += '<li>Create and copy the new token</li>';
                                errorHtml += '</ol>';
                                errorHtml += '</div>';
                            }
                            
                            // Show debug information if available
                            if (response.debug) {
                                errorHtml += '<details style="margin-top: 10px; font-size: 12px; color: #666;">';
                                errorHtml += '<summary>Debug Information (click to expand)</summary>';
                                errorHtml += '<pre style="background: #f5f5f5; padding: 10px; margin: 5px 0; overflow-x: auto;">';
                                errorHtml += JSON.stringify(response.debug, null, 2);
                                errorHtml += '</pre>';
                                errorHtml += '</details>';
                            }
                            
                            status.html(errorHtml);
                        }
                    },
                    error: function() {
                        status.html('<p style="color: red;">Network error occurred during credentials test.</p>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Test Credentials');
                    }
                });
            });
            
            // Fetch existing namespaces
            $('#fetch-kv-namespaces').click(function() {
                const button = $(this);
                const status = $('#kv-status');
                const list = $('#kv-namespaces-list');
                
                button.prop('disabled', true).text('Fetching...');
                status.html('<p>Fetching KV namespaces...</p>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_fetch_kv_namespaces',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            const namespaces = response.data;
                            let html = '<h4>Existing KV Namespaces:</h4>';
                            
                            if (namespaces.length === 0) {
                                html += '<p>No existing KV namespaces found.</p>';
                            } else {
                                html += '<table class="widefat striped">';
                                html += '<thead><tr><th>Name</th><th>ID</th><th>Created</th><th>Action</th></tr></thead>';
                                html += '<tbody>';
                                
                                namespaces.forEach(function(ns) {
                                    const created = new Date(ns.created_on).toLocaleDateString();
                                    html += '<tr>';
                                    html += '<td><strong>' + ns.title + '</strong></td>';
                                    html += '<td><code>' + ns.id + '</code></td>';
                                    html += '<td>' + created + '</td>';
                                    html += '<td><button class="button button-primary select-namespace" data-id="' + ns.id + '" data-name="' + ns.title + '">Select</button></td>';
                                    html += '</tr>';
                                });
                                html += '</tbody></table>';
                            }
                            
                            list.html(html).show();
                            status.html('<p style="color: green;">Found ' + namespaces.length + ' KV namespaces.</p>');
                        } else {
                            status.html('<p style="color: red;">Error: ' + response.data + '</p>');
                        }
                    },
                    error: function() {
                        status.html('<p style="color: red;">Network error occurred.</p>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Fetch Existing Namespaces');
                    }
                });
            });
            
            // Show create namespace form
            $('#show-create-namespace').click(function() {
                $('#create-namespace-form').toggle();
                $('#new-namespace-name').focus();
            });
            
            // Create new namespace
            $('#create-namespace').click(function() {
                const button = $(this);
                const nameInput = $('#new-namespace-name');
                const status = $('#kv-status');
                const namespaceName = nameInput.val().trim();
                
                if (!namespaceName) {
                    status.html('<p style="color: red;">Please enter a namespace name.</p>');
                    return;
                }
                
                button.prop('disabled', true).text('Creating...');
                status.html('<p>Creating namespace "' + namespaceName + '"...</p>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_create_kv_namespace',
                        namespace_name: namespaceName,
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            const namespace = response.data;
                            status.html('<p style="color: green;">Namespace "' + namespace.title + '" created successfully! ID: ' + namespace.id + '</p>');
                            
                            // Auto-select the new namespace
                            selectNamespace(namespace.id, namespace.title);
                            
                            nameInput.val('');
                            $('#create-namespace-form').hide();
                        } else {
                            status.html('<p style="color: red;">Error: ' + response.data + '</p>');
                        }
                    },
                    error: function() {
                        status.html('<p style="color: red;">Network error occurred.</p>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Create Namespace');
                    }
                });
            });
            
            // Select namespace
            $(document).on('click', '.select-namespace', function() {
                const namespaceId = $(this).data('id');
                const namespaceName = $(this).data('name');
                selectNamespace(namespaceId, namespaceName);
            });
            
            function selectNamespace(namespaceId, namespaceName) {
                const status = $('#kv-status');
                
                status.html('<p>Selecting namespace "' + namespaceName + '"...</p>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_select_kv_namespace',
                        namespace_id: namespaceId,
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            status.html('<p style="color: green;">Namespace selected successfully! Reloading page...</p>');
                            setTimeout(function() {
                                location.reload();
                            }, 1500);
                        } else {
                            status.html('<p style="color: red;">Error: ' + response.data + '</p>');
                        }
                    },
                    error: function() {
                        status.html('<p style="color: red;">Network error occurred.</p>');
                    }
                });
            }
            
            // Handle enter key in namespace name input
            $('#new-namespace-name').keypress(function(e) {
                if (e.which === 13) {
                    $('#create-namespace').click();
                }
            });
        });
        </script>
        
        <style>
        #kv-namespace-management {
            border-radius: 4px;
        }
        
        #kv-namespace-management h4 {
            margin-top: 0;
            margin-bottom: 10px;
        }
        
        #kv-namespaces-list table {
            margin-top: 10px;
        }
        
        #kv-status p {
            margin: 5px 0;
            padding: 5px;
        }
        
        .select-namespace {
            font-size: 12px;
            padding: 4px 8px;
            height: auto;
        }
        </style>
    </div>
    <?php
}

/*--------------------------------------------------
  11) Worker Management Page
--------------------------------------------------*/
function cloudflare_ab_worker_management_page_markup() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_namespace_id = $credentials['namespace_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    $has_credentials = !empty($cf_account_id) && !empty($cf_api_token);
    $has_namespace = !empty($cf_namespace_id);
    
    ?>
    <div class="wrap">
        <h1><?php esc_html_e( 'Worker Management', 'cloudflare-ab-testing' ); ?></h1>
        
        <div class="notice notice-info">
            <p><?php esc_html_e( 'Deploy and manage your Cloudflare Workers directly from WordPress.', 'cloudflare-ab-testing' ); ?></p>
        </div>
        
        <?php if ( !$has_credentials ): ?>
            <div class="notice notice-error">
                <p><strong>Missing Credentials:</strong> Please configure your Cloudflare credentials first.</p>
                <p><a href="<?php echo admin_url('admin.php?page=cloudflare-ab-settings'); ?>" class="button">Configure Credentials</a></p>
            </div>
        <?php elseif ( !$has_namespace ): ?>
            <div class="notice notice-warning">
                <p><strong>Missing KV Namespace:</strong> Please select or create a KV namespace first.</p>
                <p><a href="<?php echo admin_url('admin.php?page=cloudflare-ab-diagnostics'); ?>" class="button">Manage KV Namespaces</a></p>
            </div>
        <?php else: ?>
            
            <!-- Worker Version Selection -->
            <div class="postbox" style="margin-top: 20px;">
                <h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Worker Configuration</h2>
                <div class="inside" style="padding: 15px;">
                    <table class="form-table">
                        <tr>
                            <th scope="row">Worker Version</th>
                            <td>
                                <select id="worker-version" class="regular-text">
                                    <option value="cache">Full Version (with advanced caching)</option>
                                    <option value="simple">Simple Version (lightweight)</option>
                                </select>
                                <p class="description">
                                    <strong>Full Version:</strong> Advanced caching, static asset optimization, production-ready<br>
                                    <strong>Simple Version:</strong> Basic A/B testing without complex caching, easier to understand
                                </p>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
            
            <!-- Worker Deployment Section -->
            <div class="postbox" style="margin-top: 20px;">
                <h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Deploy New Worker</h2>
                <div class="inside" style="padding: 15px;">
                    
                    <div id="worker-deployment-form">
                        <table class="form-table">
                            <tr>
                                <th scope="row">Worker Name</th>
                                <td>
                                    <input type="text" id="worker-name" value="ab-testing-worker" class="regular-text" />
                                    <p class="description">Name for your worker (letters, numbers, hyphens only)</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Target Domain</th>
                                <td>
                                    <div id="zone-display" class="regular-text" style="padding: 8px; background: #f0f0f1; border: 1px solid #c3c4c7; border-radius: 4px;">
                                        <span id="zone-status">🔍 Detecting domain...</span>
                                    </div>
                                    <input type="hidden" id="zone-id" />
                                    <p class="description">Worker will be deployed to the Cloudflare zone that matches this website's domain</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">KV Namespace</th>
                                <td>
                                    <code><?php echo esc_html($cf_namespace_id); ?></code>
                                    <p class="description">This namespace will be bound to AB_TESTS_KV in the worker</p>
                                </td>
                            </tr>
                        </table>
                        
                        <div style="margin-top: 20px;">
                            <button id="deploy-worker" class="button button-primary">Deploy Worker</button>
                            <button id="load-zones" class="button" style="margin-left: 10px;">Refresh Zones</button>
                        </div>
                    </div>
                    
                    <div id="deployment-status" style="margin-top: 20px;"></div>
                    
                </div>
            </div>
            
            <!-- Worker Status Section -->
            <div class="postbox" style="margin-top: 20px;">
                <h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Worker Status</h2>
                <div class="inside" style="padding: 15px;">
                    
                    <div id="worker-status-list">
                        <p>Loading worker status...</p>
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <button id="refresh-status" class="button">Refresh Status</button>
                    </div>
                    
                </div>
            </div>
            
            <!-- Worker Template Preview -->
            <div class="postbox" style="margin-top: 20px;">
                <h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Worker Template Preview</h2>
                <div class="inside" style="padding: 15px;">
                    
                    <p>This is the worker code that will be deployed:</p>
                    <div style="margin-bottom: 10px;">
                        <strong>Version:</strong> 
                        <span id="template-version-display" style="color: #00a32a;">Full Version (with caching)</span>
                        <br><small>Source: Plugin workers directory</small>
                    </div>
                    
                    <textarea readonly style="width: 100%; height: 300px; font-family: monospace; font-size: 12px;" id="worker-template"><?php echo esc_textarea(cloudflare_ab_get_worker_template('cache')); ?></textarea>
                    
                    <p class="description">
                        <strong>Key Features:</strong>
                        <ul id="worker-features">
                            <li>✅ Automatic KV namespace binding (AB_TESTS_KV)</li>
                            <li>✅ Dynamic A/B test registry loading</li>
                            <li>✅ IP-based deterministic variant assignment</li>
                            <li>✅ Bypass for admin pages and static files</li>
                            <li>✅ Comprehensive error handling</li>
                            <li>✅ Debug headers for monitoring</li>
                            <li id="cache-features">✅ Advanced caching system with cache keys</li>
                            <li id="static-features">✅ Static asset optimization</li>
                            <li id="coalescing-features">✅ Request coalescing</li>
                        </ul>
                    </p>
                    
                </div>
            </div>
            
        <?php endif; ?>
        
        <!-- JavaScript for Worker Management -->
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            const nonce = '<?php echo wp_create_nonce('cloudflare_ab_worker_nonce'); ?>';
            
            // Load zones on page load
            loadZones();
            
            // Worker version selection
            $('#worker-version').change(function() {
                const version = $(this).val();
                const versionText = version === 'cache' ? 'Full Version (with caching)' : 'Simple Version (lightweight)';
                
                // Update status
                updateStatus('Selected worker version: ' + versionText, 'info');
                
                // Update template preview
                $('#template-version-display').text(versionText);
                
                // Show/hide features based on version
                if (version === 'cache') {
                    $('#cache-features').show();
                    $('#static-features').show();
                    $('#coalescing-features').show();
                } else {
                    $('#cache-features').hide();
                    $('#static-features').hide();
                    $('#coalescing-features').hide();
                }
                
                // Fetch new template
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_get_worker_template',
                        version: version,
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            $('#worker-template').val(response.data);
                        }
                    },
                    error: function() {
                        console.log('Failed to fetch worker template');
                    }
                });
            });
            
            // Load zones function
            function loadZones() {
                $('#zone-status').html('🔍 Detecting domain...');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_load_zones',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            let currentDomain = window.location.hostname;
                            let matchedZone = null;
                            
                            // Extract root domain from current domain (remove subdomains)
                            let rootDomain = currentDomain;
                            let domainParts = currentDomain.split('.');
                            if (domainParts.length > 2) {
                                // Keep only the last 2 parts (domain.tld)
                                rootDomain = domainParts.slice(-2).join('.');
                            }
                            
                            // Find matching zone
                            response.data.forEach(function(zone) {
                                if (zone.name === currentDomain || 
                                    zone.name === rootDomain ||
                                    zone.name === currentDomain.replace(/^www\./, '') ||
                                    'www.' + zone.name === currentDomain) {
                                    matchedZone = zone;
                                }
                            });
                            
                            if (matchedZone) {
                                // Zone found - show success
                                $('#zone-status').html('✅ <strong>' + matchedZone.name + '</strong> (ID: ' + matchedZone.id + ')');
                                $('#zone-id').val(matchedZone.id);
                                $('#zone-display').css('background', '#d4edda').css('border-color', '#c3e6cb');
                                updateStatus('Domain detected: ' + matchedZone.name + ' (from current domain: ' + currentDomain + ')', 'updated');
                            } else {
                                // No zone found - show warning
                                $('#zone-status').html('⚠️ <strong>No matching Cloudflare zone found</strong><br>Current domain: ' + currentDomain + '<br>Root domain: ' + rootDomain);
                                $('#zone-id').val('');
                                $('#zone-display').css('background', '#f8d7da').css('border-color', '#f5c6cb');
                                updateStatus('WARNING: No Cloudflare zone matches this domain (' + currentDomain + '). Please ensure this domain is added to your Cloudflare account.', 'error');
                            }
                        } else {
                            $('#zone-status').html('❌ Error loading zones');
                            $('#zone-display').css('background', '#f8d7da').css('border-color', '#f5c6cb');
                            updateStatus('Error loading zones: ' + response.data, 'error');
                        }
                    },
                    error: function() {
                        $('#zone-status').html('❌ Network error');
                        $('#zone-display').css('background', '#f8d7da').css('border-color', '#f5c6cb');
                        updateStatus('Network error while loading zones', 'error');
                    }
                });
            }
            
            // Refresh zones button
            $('#load-zones').click(function() {
                loadZones();
            });
            
            // Deploy worker
            $('#deploy-worker').click(function() {
                const button = $(this);
                const workerName = $('#worker-name').val().trim();
                const zoneId = $('#zone-id').val();
                const zoneName = $('#zone-status').text().replace('✅ ', '').split(' (ID:')[0];
                const workerVersion = $('#worker-version').val();
                
                if (!workerName) {
                    updateStatus('Please enter a worker name', 'error');
                    return;
                }
                
                if (!zoneId) {
                    updateStatus('Cannot deploy: No matching Cloudflare zone found for this domain. Please ensure this domain is added to your Cloudflare account.', 'error');
                    return;
                }
                
                // Safety confirmation showing the target domain and worker version
                const versionText = workerVersion === 'cache' ? 'Full Version (with caching)' : 'Simple Version (lightweight)';
                if (!confirm('Deploy worker "' + workerName + '" (' + versionText + ') to domain "' + zoneName + '"?\n\nThis will create/update the worker and bind it to the auto-detected domain.')) {
                    return;
                }
                
                button.prop('disabled', true).text('Deploying...');
                updateStatus('Deploying worker "' + workerName + '"...', 'info');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_deploy_worker',
                        worker_name: workerName,
                        zone_id: zoneId,
                        worker_version: workerVersion,
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            updateStatus('✅ Worker deployed successfully!', 'success');
                            updateStatus('Worker Name: ' + response.data.worker_name, 'success');
                            updateStatus('Zone ID: ' + response.data.zone_id, 'success');
                            updateStatus('KV Namespace: ' + response.data.namespace_id, 'success');
                            
                            // Refresh status
                            setTimeout(function() {
                                refreshWorkerStatus();
                            }, 2000);
                        } else {
                            updateStatus('❌ Deployment failed: ' + response.data, 'error');
                        }
                    },
                    error: function() {
                        updateStatus('❌ Network error during deployment', 'error');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Deploy Worker');
                    }
                });
            });
            
            // Refresh status
            $('#refresh-status').click(function() {
                refreshWorkerStatus();
            });
            
            function refreshWorkerStatus() {
                $('#worker-status-list').html('<p>Loading worker status...</p>');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_worker_status_with_routes',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            let html = '<div class="worker-status-results">';
                            
                            if (response.data.length === 0) {
                                html += '<p>No workers found.</p>';
                            } else {
                                html += '<table class="widefat striped">';
                                html += '<thead><tr><th>Worker Name</th><th>Status</th><th>Routes</th><th>Created</th><th>Actions</th></tr></thead>';
                                html += '<tbody>';
                                
                                response.data.forEach(function(worker) {
                                    // Determine status based on worker properties and routes
                                    let status = 'inactive';
                                    let statusClass = 'status-inactive';
                                    
                                    if (worker.routes && worker.routes.length > 0) {
                                        status = 'active';
                                        statusClass = 'status-active';
                                    } else if (worker.id && worker.id.length > 0) {
                                        status = 'deployed';
                                        statusClass = 'status-active';
                                    }
                                    
                                    console.log('Worker:', worker.id, 'Routes:', worker.routes ? worker.routes.length : 0, 'Status:', status);
                                    
                                    // Format routes for display
                                    let routesDisplay = 'No routes';
                                    if (worker.routes && worker.routes.length > 0) {
                                        routesDisplay = worker.routes.map(function(route) {
                                            return route.pattern + ' (' + route.zone_name + ')';
                                        }).join('<br>');
                                    }
                                    
                                    html += '<tr>';
                                    html += '<td><strong>' + worker.id + '</strong></td>';
                                    html += '<td><span class="' + statusClass + '">' + status + '</span></td>';
                                    html += '<td>' + routesDisplay + '</td>';
                                    html += '<td>' + new Date(worker.created_on).toLocaleString() + '</td>';
                                    html += '<td>';
                                    html += '<button class="button button-small" onclick="viewWorker(\'' + worker.id + '\')">View</button> ';
                                    html += '<button class="button button-small" onclick="checkWorkerRoutes(\'' + worker.id + '\')">Check Routes</button>';
                                    html += '</td>';
                                    html += '</tr>';
                                });
                                
                                html += '</tbody></table>';
                            }
                            
                            html += '</div>';
                            $('#worker-status-list').html(html);
                        } else {
                            $('#worker-status-list').html('<p style="color: red;">Error loading status: ' + response.data + '</p>');
                        }
                    },
                    error: function() {
                        $('#worker-status-list').html('<p style="color: red;">Network error loading status</p>');
                    }
                });
            }
            
            function updateStatus(message, type) {
                const statusDiv = $('#deployment-status');
                const color = type === 'error' ? 'red' : type === 'success' ? 'green' : 'blue';
                statusDiv.append('<p style="color: ' + color + ';">' + message + '</p>');
                statusDiv.get(0).scrollTop = statusDiv.get(0).scrollHeight;
            }
            
            // Global function for viewing worker
            window.viewWorker = function(workerId) {
                window.open('https://dash.cloudflare.com/workers/services/view/' + workerId, '_blank');
            };
            
            // Global function for checking worker routes
            window.checkWorkerRoutes = function(workerId) {
                updateStatus('Checking routes for worker: ' + workerId, 'info');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_check_worker_routes',
                        worker_id: workerId,
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            let routes = response.data;
                            if (routes.length === 0) {
                                updateStatus('❌ No routes found for worker: ' + workerId, 'error');
                            } else {
                                updateStatus('✅ Found ' + routes.length + ' route(s) for worker: ' + workerId, 'success');
                                routes.forEach(function(route) {
                                    updateStatus('  → ' + route.pattern + ' (Zone: ' + route.zone_name + ')', 'info');
                                });
                            }
                        } else {
                            updateStatus('❌ Error checking routes: ' + response.data, 'error');
                        }
                    },
                    error: function() {
                        updateStatus('❌ Network error checking routes', 'error');
                    }
                });
            };
            
            // Load initial status
            refreshWorkerStatus();
        });
        </script>
        
        <style>
        .worker-status-results .status-active { color: #00a32a; font-weight: bold; }
        .worker-status-results .status-inactive { color: #d63638; }
        .worker-status-results .status-unknown { color: #999; }
        
        #deployment-status {
            max-height: 300px;
            overflow-y: auto;
            background: #f9f9f9;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        #deployment-status p {
            margin: 5px 0;
            font-family: monospace;
            font-size: 12px;
        }
        
        .worker-status-results table {
            margin-top: 10px;
        }
        </style>
    </div>
    <?php
}

// AJAX handlers for worker management
add_action( 'wp_ajax_cloudflare_ab_load_zones', 'cloudflare_ab_ajax_load_zones' );
function cloudflare_ab_ajax_load_zones() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $result = cloudflare_ab_get_zones();
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

add_action( 'wp_ajax_cloudflare_ab_deploy_worker', 'cloudflare_ab_ajax_deploy_worker' );
function cloudflare_ab_ajax_deploy_worker() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $worker_name = sanitize_text_field( $_POST['worker_name'] ?? '' );
    $zone_id = sanitize_text_field( $_POST['zone_id'] ?? '' );
    $worker_version = sanitize_text_field( $_POST['worker_version'] ?? 'cache' );
    
    if ( empty( $worker_name ) || empty( $zone_id ) ) {
        wp_send_json_error( 'Worker name and zone ID are required' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $namespace_id = $credentials['namespace_id'] ?? '';
    
    if ( empty( $namespace_id ) ) {
        wp_send_json_error( 'KV namespace ID is required' );
    }
    
    $result = cloudflare_ab_deploy_worker( $worker_name, $zone_id, $namespace_id, $worker_version );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

add_action( 'wp_ajax_cloudflare_ab_worker_status', 'cloudflare_ab_ajax_worker_status' );
function cloudflare_ab_ajax_worker_status() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        wp_send_json_error( 'Account ID and API Token are required' );
    }
    
    $url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts";
    
    $response = wp_remote_get( $url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $response ) ) {
        wp_send_json_error( $response->get_error_message() );
    }
    
    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );
    $data = json_decode( $body, true );
    
    if ( $status_code !== 200 ) {
        wp_send_json_error( 'API Error: ' . ($data['errors'][0]['message'] ?? 'Unknown error') );
    }
    
    wp_send_json_success( $data['result'] ?? [] );
}

add_action( 'wp_ajax_cloudflare_ab_check_worker_routes', 'cloudflare_ab_ajax_check_worker_routes' );
function cloudflare_ab_ajax_check_worker_routes() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $worker_id = sanitize_text_field( $_POST['worker_id'] ?? '' );
    if ( empty( $worker_id ) ) {
        wp_send_json_error( 'Worker ID is required' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_api_token) ) {
        wp_send_json_error( 'API Token is required' );
    }
    
    // First, get all zones to map zone IDs to names
    $zones = cloudflare_ab_get_zones();
    if ( is_wp_error( $zones ) ) {
        wp_send_json_error( 'Failed to get zones: ' . $zones->get_error_message() );
    }
    
    $zone_names = [];
    foreach ( $zones as $zone ) {
        $zone_names[ $zone['id'] ] = $zone['name'];
    }
    
    // Get routes for each zone
    $all_routes = [];
    foreach ( $zones as $zone ) {
        $zone_id = $zone['id'];
        $url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes";
        
        $response = wp_remote_get( $url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $cf_api_token,
                'Content-Type' => 'application/json',
            ],
            'timeout' => 15,
        ] );
        
        if ( ! is_wp_error( $response ) && wp_remote_retrieve_response_code( $response ) === 200 ) {
            $body = wp_remote_retrieve_body( $response );
            $data = json_decode( $body, true );
            
            if ( isset( $data['result'] ) && is_array( $data['result'] ) ) {
                foreach ( $data['result'] as $route ) {
                    if ( isset( $route['script'] ) && $route['script'] === $worker_id ) {
                        $all_routes[] = [
                            'pattern' => $route['pattern'],
                            'zone_id' => $zone_id,
                            'zone_name' => $zone_names[ $zone_id ] ?? $zone_id,
                            'id' => $route['id'] ?? ''
                        ];
                    }
                }
            }
        }
    }
    
    wp_send_json_success( $all_routes );
}

add_action( 'wp_ajax_cloudflare_ab_get_worker_template', 'cloudflare_ab_ajax_get_worker_template' );
function cloudflare_ab_ajax_get_worker_template() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $version = sanitize_text_field( $_POST['version'] ?? 'cache' );
    
    if ( ! in_array( $version, [ 'cache', 'simple' ] ) ) {
        wp_send_json_error( 'Invalid worker version' );
    }
    
    $template = cloudflare_ab_get_worker_template( $version );
    
    if ( ! $template ) {
        wp_send_json_error( 'Failed to load worker template' );
    }
    
    wp_send_json_success( $template );
}

add_action( 'wp_ajax_cloudflare_ab_worker_status_with_routes', 'cloudflare_ab_ajax_worker_status_with_routes' );
function cloudflare_ab_ajax_worker_status_with_routes() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        wp_send_json_error( 'Account ID and API Token are required' );
    }
    
    // Get workers
    $workers_url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts";
    
    $workers_response = wp_remote_get( $workers_url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $workers_response ) ) {
        wp_send_json_error( $workers_response->get_error_message() );
    }
    
    $status_code = wp_remote_retrieve_response_code( $workers_response );
    $body = wp_remote_retrieve_body( $workers_response );
    $workers_data = json_decode( $body, true );
    
    if ( $status_code !== 200 ) {
        wp_send_json_error( 'API Error: ' . ($workers_data['errors'][0]['message'] ?? 'Unknown error') );
    }
    
    $workers = $workers_data['result'] ?? [];
    
    // Get zones for route checking
    $zones = cloudflare_ab_get_zones();
    if ( is_wp_error( $zones ) ) {
        wp_send_json_error( 'Failed to get zones: ' . $zones->get_error_message() );
    }
    
    $zone_names = [];
    foreach ( $zones as $zone ) {
        $zone_names[ $zone['id'] ] = $zone['name'];
    }
    
    // Get routes for each worker
    foreach ( $workers as &$worker ) {
        $worker_id = $worker['id'];
        $worker_routes = [];
        
        // Check routes across all zones
        foreach ( $zones as $zone ) {
            $zone_id = $zone['id'];
            $routes_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes";
            
            $routes_response = wp_remote_get( $routes_url, [
                'headers' => [
                    'Authorization' => 'Bearer ' . $cf_api_token,
                    'Content-Type' => 'application/json',
                ],
                'timeout' => 15,
            ] );
            
            if ( ! is_wp_error( $routes_response ) && wp_remote_retrieve_response_code( $routes_response ) === 200 ) {
                $routes_body = wp_remote_retrieve_body( $routes_response );
                $routes_data = json_decode( $routes_body, true );
                
                if ( isset( $routes_data['result'] ) && is_array( $routes_data['result'] ) ) {
                    foreach ( $routes_data['result'] as $route ) {
                        if ( isset( $route['script'] ) && $route['script'] === $worker_id ) {
                            $worker_routes[] = [
                                'pattern' => $route['pattern'],
                                'zone_id' => $zone_id,
                                'zone_name' => $zone_names[ $zone_id ] ?? $zone_id,
                                'id' => $route['id'] ?? ''
                            ];
                        }
                    }
                }
            }
        }
        
        $worker['routes'] = $worker_routes;
    }
    
    wp_send_json_success( $workers );
}
?>
