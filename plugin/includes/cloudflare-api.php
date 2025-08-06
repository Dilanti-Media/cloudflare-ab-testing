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
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            error_log('[DM A/B] Cloudflare credentials are not set. Cannot push to KV.');
        }
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
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            error_log( '[DM A/B] Failed to update KV registry: ' . print_r( $response, true ) );
        }
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

// Health Check AJAX Handler
add_action( 'wp_ajax_cloudflare_ab_health_check', 'cloudflare_ab_ajax_health_check' );
function cloudflare_ab_ajax_health_check() {
    check_ajax_referer( 'cloudflare_ab_kv_nonce', 'nonce' );

    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }

    $checks = [];
    $overall_status = 'healthy';

    // 1. Configuration Check
    $enabled_urls = get_option( 'cloudflare_ab_enabled_urls', '' );
    $cf_credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    
    if ( empty( trim( $enabled_urls ) ) ) {
        $checks[] = [
            'name' => 'A/B Test Configuration',
            'status' => 'fail',
            'message' => 'No A/B tests configured',
            'recommendation' => 'Go to A/B Tests settings and configure at least one test'
        ];
        $overall_status = 'critical';
    } else {
        $lines = array_filter( array_map( 'trim', preg_split( '/[\r\n]+/', $enabled_urls ) ) );
        $valid_tests = 0;
        foreach ( $lines as $line ) {
            if ( strpos( $line, '|' ) !== false ) {
                $valid_tests++;
            }
        }
        
        if ( $valid_tests > 0 ) {
            $checks[] = [
                'name' => 'A/B Test Configuration',
                'status' => 'pass',
                'message' => "Found {$valid_tests} configured test(s)",
                'details' => ["Valid test configurations: {$valid_tests}"]
            ];
        } else {
            $checks[] = [
                'name' => 'A/B Test Configuration',
                'status' => 'fail',
                'message' => 'Invalid test configuration format',
                'recommendation' => 'Check test configuration syntax (test_name|/path1,/path2)'
            ];
            $overall_status = 'critical';
        }
    }

    // 2. Cloudflare Credentials Check
    $cf_account_id = $cf_credentials['account_id'] ?? '';
    $cf_namespace_id = $cf_credentials['namespace_id'] ?? '';
    $cf_api_token = $cf_credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_namespace_id) || empty($cf_api_token) ) {
        $missing = [];
        if (empty($cf_account_id)) $missing[] = 'Account ID';
        if (empty($cf_namespace_id)) $missing[] = 'Namespace ID';
        if (empty($cf_api_token)) $missing[] = 'API Token';
        
        $checks[] = [
            'name' => 'Cloudflare Credentials',
            'status' => 'fail',
            'message' => 'Incomplete Cloudflare credentials',
            'details' => ['Missing: ' . implode(', ', $missing)],
            'recommendation' => 'Complete all Cloudflare credentials in settings'
        ];
        $overall_status = 'critical';
    } else {
        $checks[] = [
            'name' => 'Cloudflare Credentials',
            'status' => 'pass',
            'message' => 'All Cloudflare credentials configured'
        ];
    }

    // 3. API Token Validation
    if ( !empty($cf_api_token) ) {
        $token_length = strlen( trim( $cf_api_token ) );
        
        if ( $token_length === 37 && ctype_xdigit( trim( $cf_api_token ) ) ) {
            $checks[] = [
                'name' => 'API Token Validation',
                'status' => 'fail',
                'message' => 'Global API Key detected instead of API Token',
                'recommendation' => 'Create a custom API Token instead of using Global API Key'
            ];
            if ( $overall_status === 'healthy' ) $overall_status = 'critical';
        } else if ( $token_length < 20 || $token_length > 50 ) {
            $checks[] = [
                'name' => 'API Token Validation',
                'status' => 'warning',
                'message' => 'API Token format may be invalid',
                'details' => ["Token length: {$token_length} characters"],
                'recommendation' => 'Verify API Token format is correct'
            ];
            if ( $overall_status === 'healthy' ) $overall_status = 'warning';
        } else {
            $checks[] = [
                'name' => 'API Token Validation',
                'status' => 'pass',
                'message' => 'API Token format appears valid',
                'details' => ["Token length: {$token_length} characters"]
            ];
        }
    }

    // 4. Worker Headers Check
    $has_worker_headers = false;
    $worker_headers = [];
    foreach ( $_SERVER as $key => $value ) {
        if ( strpos( $key, 'HTTP_X_AB_' ) === 0 || strpos( $key, 'HTTP_X_WORKER' ) === 0 ) {
            $has_worker_headers = true;
            $worker_headers[$key] = $value;
        }
    }
    
    if ( $has_worker_headers ) {
        $checks[] = [
            'name' => 'Worker Headers Detection',
            'status' => 'pass',
            'message' => 'Cloudflare Worker headers detected',
            'details' => array_map( function($k, $v) { return "{$k}: {$v}"; }, array_keys($worker_headers), array_values($worker_headers) )
        ];
    } else {
        $checks[] = [
            'name' => 'Worker Headers Detection',
            'status' => 'warning',
            'message' => 'No Cloudflare Worker headers detected in admin context',
            'details' => ['This is normal in WordPress admin area'],
            'recommendation' => 'Test from frontend to verify worker is functioning'
        ];
        if ( $overall_status === 'healthy' ) $overall_status = 'warning';
    }

    // 5. Meta Tag Injection Check
    if ( function_exists( 'cloudflare_ab_inject_meta_tags' ) ) {
        $checks[] = [
            'name' => 'Meta Tag Injection',
            'status' => 'pass',
            'message' => 'Meta tag injection function is available'
        ];
    } else {
        $checks[] = [
            'name' => 'Meta Tag Injection',
            'status' => 'fail',
            'message' => 'Meta tag injection function not found',
            'recommendation' => 'Check plugin installation and activation'
        ];
        $overall_status = 'critical';
    }

    // 6. WordPress Hooks Check
    $wp_head_priority = has_action( 'wp_head', 'cloudflare_ab_inject_meta_tags' );
    if ( $wp_head_priority !== false ) {
        $checks[] = [
            'name' => 'WordPress Hooks',
            'status' => 'pass',
            'message' => 'Meta tag injection properly hooked to wp_head',
            'details' => ["Priority: {$wp_head_priority}"]
        ];
    } else {
        $checks[] = [
            'name' => 'WordPress Hooks',
            'status' => 'fail',
            'message' => 'Meta tag injection not properly hooked',
            'recommendation' => 'Check plugin initialization'
        ];
        $overall_status = 'critical';
    }

    wp_send_json_success([
        'overall_status' => $overall_status,
        'checks' => $checks,
        'timestamp' => current_time( 'mysql' )
    ]);
}

// Live Environment Test AJAX Handler
add_action( 'wp_ajax_cloudflare_ab_test_live_environment', 'cloudflare_ab_ajax_test_live_environment' );
function cloudflare_ab_ajax_test_live_environment() {
    check_ajax_referer( 'cloudflare_ab_kv_nonce', 'nonce' );

    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }

    $site_url = home_url( '/' );
    $test_url = $site_url;
    
    // Make a request to our own site to test A/B functionality
    $response = wp_remote_get( $test_url, [
        'headers' => [
            'User-Agent' => 'WordPress A/B Testing Health Check',
            'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        ],
        'timeout' => 15,
        'sslverify' => true
    ] );

    if ( is_wp_error( $response ) ) {
        wp_send_json_error( 'Failed to connect to site: ' . $response->get_error_message() );
    }

    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );
    $headers = wp_remote_retrieve_headers( $response );

    // Check for worker headers
    $worker_headers = [];
    foreach ( $headers as $key => $value ) {
        if ( stripos( $key, 'x-ab-' ) === 0 || stripos( $key, 'x-worker' ) === 0 ) {
            $worker_headers[$key] = $value;
        }
    }

    // Check for meta tags
    $meta_tags_found = false;
    $detected_variant = null;
    $detected_test = null;
    
    if ( preg_match( '/<meta name="cf-ab-variant" content="([^"]+)"/', $body, $variant_match ) ) {
        $meta_tags_found = true;
        $detected_variant = $variant_match[1];
    }
    
    if ( preg_match( '/<meta name="cf-ab-test" content="([^"]+)"/', $body, $test_match ) ) {
        $detected_test = $test_match[1];
    }

    // Generate recommendations
    $recommendations = [];
    
    if ( empty( $worker_headers ) ) {
        $recommendations[] = 'No worker headers detected - verify Cloudflare Worker is deployed and configured correctly';
    }
    
    if ( !$meta_tags_found ) {
        $recommendations[] = 'Meta tags not being injected - check that worker is sending headers and WordPress is processing them';
    }
    
    if ( $status_code !== 200 ) {
        $recommendations[] = "Site returned HTTP {$status_code} - check site accessibility";
    }

    wp_send_json_success([
        'test_url' => $test_url,
        'status_code' => $status_code,
        'worker_headers' => $worker_headers,
        'meta_tags_found' => $meta_tags_found,
        'detected_variant' => $detected_variant,
        'detected_test' => $detected_test,
        'recommendations' => $recommendations,
        'timestamp' => current_time( 'mysql' )
    ]);
}

