<?php
/**
 * Cloudflare API Helper Functions
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

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

