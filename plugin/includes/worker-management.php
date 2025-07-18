<?php
/**
 * Cloudflare Worker Management Functions
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

/**
 * Debug logging helper - only logs when WP_DEBUG is enabled
 */
function cloudflare_ab_debug_log( $message ) {
    if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
        // Sanitize the message to prevent log injection attacks
        $sanitized_message = is_string( $message ) ? json_encode( $message ) : json_encode( print_r( $message, true ) );
        error_log( $sanitized_message );
    }
}

/**
 * Builds the multipart/form-data body for uploading a worker script.
 *
 * @param array $metadata The metadata for the worker.
 * @param string $worker_script The worker script content.
 * @return array An array containing the body and boundary.
 */
function cloudflare_ab_build_worker_upload_body( $metadata, $worker_script ) {
    $boundary = wp_generate_uuid4();
    $body = '';

    // Add metadata part first
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Disposition: form-data; name=\"metadata\"\r\n";
    $body .= "Content-Type: application/json\r\n\r\n";
    $body .= json_encode($metadata) . "\r\n";

    // Add script part with field name matching main_module exactly
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Disposition: form-data; name=\"script\"; filename=\"script.js\"\r\n";
    $body .= "Content-Type: application/javascript+module\r\n\r\n";
    $body .= $worker_script . "\r\n";

    $body .= "--{$boundary}--\r\n";

    return [
        'body' => $body,
        'boundary' => $boundary,
    ];
}

function cloudflare_ab_get_zone_info( $zone_id, $cf_api_token ) {
    $url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}";

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

    if ( $status_code !== 200 || !isset( $data['result'] ) ) {
        return new WP_Error( 'zone_fetch_failed', 'Failed to fetch zone info: ' . $body );
    }

    return $data['result'];
}

function cloudflare_ab_delete_worker( $worker_name ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';

    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        return new WP_Error( 'missing_credentials', 'Account ID and API Token are required' );
    }

    $delete_url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts/{$worker_name}";

    $response = wp_remote_request( $delete_url, [
        'method' => 'DELETE',
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

    if ( $status_code !== 200 ) {
        return new WP_Error( 'delete_failed', 'Worker deletion failed: ' . $body );
    }

    return true;
}

function cloudflare_ab_delete_route( $zone_id, $route_id ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_api_token = $credentials['api_token'] ?? '';

    if ( empty($cf_api_token) ) {
        return new WP_Error( 'missing_token', 'API Token is required' );
    }

    $delete_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes/{$route_id}";

    $response = wp_remote_request( $delete_url, [
        'method' => 'DELETE',
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

    if ( $status_code !== 200 ) {
        return new WP_Error( 'route_delete_failed', 'Route deletion failed: ' . $body );
    }

    return true;
}

function cloudflare_ab_transfer_route( $zone_id, $route_id, $new_worker_name ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_api_token = $credentials['api_token'] ?? '';

    if ( empty($cf_api_token) ) {
        return new WP_Error( 'missing_token', 'API Token is required' );
    }

    $update_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes/{$route_id}";

    $route_data = [
        'script' => $new_worker_name
    ];

    $response = wp_remote_request( $update_url, [
        'method' => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'body' => json_encode( $route_data ),
        'timeout' => 15,
    ] );

    if ( is_wp_error( $response ) ) {
        return $response;
    }

    $status_code = wp_remote_retrieve_response_code( $response );
    $body = wp_remote_retrieve_body( $response );

    if ( $status_code !== 200 ) {
        return new WP_Error( 'route_transfer_failed', 'Route transfer failed: ' . $body );
    }

    return true;
}

function cloudflare_ab_deploy_worker( $worker_name, $zone_id, $namespace_id, $version = 'cache', $route_preset = 'all', $custom_route_pattern = '' ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';

    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        return new WP_Error( 'missing_credentials', 'Account ID and API Token are required' );
    }

    // Get zone name for route pattern
    $zone_info = cloudflare_ab_get_zone_info( $zone_id, $cf_api_token );
    if ( is_wp_error( $zone_info ) ) {
        return $zone_info;
    }
    $zone_name = $zone_info['name'];

    $worker_script = cloudflare_ab_get_worker_template($version);

    if ( empty( $worker_script ) ) {
        return new WP_Error( 'worker_script_empty', 'Worker script is empty or invalid' );
    }

    // Step 1: Upload worker script with KV bindings using multipart form
    $upload_url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts/{$worker_name}";

    $metadata = [
        'main_module' => 'script.js',
        'bindings' => [
            [
                'type' => 'kv_namespace',
                'name' => 'AB_TESTS_KV',
                'namespace_id' => $namespace_id
            ]
        ],
        'compatibility_date' => '2024-01-01',
        'compatibility_flags' => []
    ];

    // Build multipart form data
    $upload_data = cloudflare_ab_build_worker_upload_body( $metadata, $worker_script );

    $upload_response = wp_remote_request( $upload_url, [
        'method'  => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type'  => 'multipart/form-data; boundary=' . $upload_data['boundary'],
        ],
        'body'    => $upload_data['body'],
        'timeout' => 30,
    ] );

    if ( is_wp_error( $upload_response ) ) {
        return $upload_response;
    }

    if ( wp_remote_retrieve_response_code( $upload_response ) !== 200 ) {
        $body = wp_remote_retrieve_body( $upload_response );
        return new WP_Error( 'upload_failed', 'Worker upload failed: ' . $body );
    }

    // Step 2: Create route(s) for the zone
    $routes_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes";

    // Generate route pattern based on preset
    $route_patterns = [];

    if ( $route_preset === 'all' ) {
        $route_patterns[] = "*{$zone_name}/*";
    } elseif ( $route_preset === 'pages' ) {
        // For pages only, we use the catch-all pattern but rely on the worker's bypass logic
        // to exclude WordPress admin, REST API, and system paths
        // This is more reliable than trying to create specific patterns for all possible content
        $route_patterns[] = "*{$zone_name}/*";
    } elseif ( $route_preset === 'home' ) {
        $route_patterns[] = "*{$zone_name}/";
        $route_patterns[] = "*{$zone_name}";
    } elseif ( $route_preset === 'custom' && !empty( $custom_route_pattern ) ) {
        $route_patterns[] = $custom_route_pattern;
    } else {
        // Fallback to all traffic
        $route_patterns[] = "*{$zone_name}/*";
    }

    // Check for existing routes that might conflict
    $existing_routes_response = wp_remote_get( $routes_url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'timeout' => 15,
    ] );

    $conflicting_routes = [];
    if ( !is_wp_error( $existing_routes_response ) && wp_remote_retrieve_response_code( $existing_routes_response ) === 200 ) {
        $existing_body = wp_remote_retrieve_body( $existing_routes_response );
        $existing_data = json_decode( $existing_body, true );

        if ( isset( $existing_data['result'] ) && is_array( $existing_data['result'] ) ) {
            foreach ( $existing_data['result'] as $existing_route ) {
                foreach ( $route_patterns as $new_pattern ) {
                    if ( $existing_route['pattern'] === $new_pattern ) {
                        $conflicting_routes[] = [
                            'pattern' => $new_pattern,
                            'existing_worker' => $existing_route['script'] ?? 'unknown',
                            'route_id' => $existing_route['id'] ?? ''
                        ];
                    }
                }
            }
        }
    }

    // If there are conflicts, return an error with details
    if ( !empty( $conflicting_routes ) ) {
        $conflict_details = [];
        foreach ( $conflicting_routes as $conflict ) {
            $conflict_details[] = "Pattern '{$conflict['pattern']}' is already used by worker '{$conflict['existing_worker']}'";
        }
        return new WP_Error( 'route_conflicts', 'Route conflicts detected: ' . implode( ', ', $conflict_details ) );
    }

    // Create routes
    $created_routes = [];
    foreach ( $route_patterns as $pattern ) {
        $route_data = [
            'pattern' => $pattern,
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
            return new WP_Error( 'route_failed', 'Route creation failed for pattern ' . $pattern . ': ' . $body );
        }

        $created_routes[] = $pattern;
    }

    return [
        'worker_name' => $worker_name,
        'zone_id' => $zone_id,
        'namespace_id' => $namespace_id,
        'routes' => $created_routes,
        'zone_name' => $zone_name,
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

// AJAX handlers for worker management
add_action( 'wp_ajax_cloudflare_ab_get_zones', 'cloudflare_ab_ajax_get_zones' );
add_action( 'wp_ajax_cloudflare_ab_deploy_worker', 'cloudflare_ab_ajax_deploy_worker' );
add_action( 'wp_ajax_cloudflare_ab_get_worker_status', 'cloudflare_ab_ajax_get_worker_status' );
add_action( 'wp_ajax_cloudflare_ab_delete_worker', 'cloudflare_ab_ajax_delete_worker' );
add_action( 'wp_ajax_cloudflare_ab_delete_route', 'cloudflare_ab_ajax_delete_route' );
add_action( 'wp_ajax_cloudflare_ab_add_route', 'cloudflare_ab_ajax_add_route' );
add_action( 'wp_ajax_cloudflare_ab_get_worker_template', 'cloudflare_ab_ajax_get_worker_template' );
add_action( 'wp_ajax_cloudflare_ab_update_worker_code', 'cloudflare_ab_ajax_update_worker_code' );

function cloudflare_ab_ajax_get_zones() {
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

function cloudflare_ab_ajax_deploy_worker() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $worker_name = sanitize_text_field( $_POST['worker_name'] ?? '' );
    $zone_id = sanitize_text_field( $_POST['zone_id'] ?? '' );
    $namespace_id = sanitize_text_field( $_POST['namespace_id'] ?? '' );
    $version = sanitize_text_field( $_POST['version'] ?? 'cache' );
    $route_preset = sanitize_text_field( $_POST['route_preset'] ?? 'all' );
    $custom_route_pattern = sanitize_text_field( $_POST['custom_route_pattern'] ?? '' );
    
    if ( empty( $worker_name ) || empty( $zone_id ) || empty( $namespace_id ) ) {
        wp_send_json_error( 'Worker name, zone ID, and namespace ID are required' );
    }
    
    $result = cloudflare_ab_deploy_worker( $worker_name, $zone_id, $namespace_id, $version, $route_preset, $custom_route_pattern );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

function cloudflare_ab_ajax_get_worker_status() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $zone_id = sanitize_text_field( $_POST['zone_id'] ?? '' );
    
    if ( empty( $zone_id ) ) {
        wp_send_json_error( 'Zone ID is required' );
    }
    
    $result = cloudflare_ab_get_worker_status( $zone_id );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

function cloudflare_ab_ajax_delete_worker() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $worker_id = sanitize_text_field( $_POST['worker_id'] ?? '' );
    
    if ( empty( $worker_id ) ) {
        wp_send_json_error( 'Worker ID is required' );
    }
    
    $result = cloudflare_ab_delete_worker( $worker_id );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( 'Worker deleted successfully' );
}

function cloudflare_ab_ajax_delete_route() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $route_id = sanitize_text_field( $_POST['route_id'] ?? '' );
    $zone_id = sanitize_text_field( $_POST['zone_id'] ?? '' );
    
    if ( empty( $route_id ) || empty( $zone_id ) ) {
        wp_send_json_error( 'Route ID and Zone ID are required' );
    }
    
    $result = cloudflare_ab_delete_route( $zone_id, $route_id );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( 'Route deleted successfully' );
}

function cloudflare_ab_ajax_add_route() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $worker_id = sanitize_text_field( $_POST['worker_id'] ?? '' );
    $zone_id = sanitize_text_field( $_POST['zone_id'] ?? '' );
    $route_preset = sanitize_text_field( $_POST['route_preset'] ?? 'all' );
    $custom_route_pattern = sanitize_text_field( $_POST['custom_route_pattern'] ?? '' );
    
    if ( empty( $worker_id ) || empty( $zone_id ) ) {
        wp_send_json_error( 'Worker ID and Zone ID are required' );
    }
    
    $result = cloudflare_ab_add_route_to_worker( $worker_id, $zone_id, $route_preset, $custom_route_pattern );
    
    if ( is_wp_error( $result ) ) {
        wp_send_json_error( $result->get_error_message() );
    }
    
    wp_send_json_success( $result );
}

function cloudflare_ab_ajax_get_worker_template() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $version = sanitize_text_field( $_POST['version'] ?? 'cache' );
    
    $template = cloudflare_ab_get_worker_template( $version );
    
    if ( empty( $template ) ) {
        wp_send_json_error( 'Failed to load worker template' );
    }
    
    wp_send_json_success( $template );
}

function cloudflare_ab_ajax_update_worker_code() {
    check_ajax_referer( 'cloudflare_ab_worker_nonce', 'nonce' );
    
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Unauthorized' );
    }
    
    $worker_id = sanitize_text_field( $_POST['worker_id'] ?? '' );
    
    if ( empty( $worker_id ) ) {
        wp_send_json_error( 'Worker ID is required' );
    }
    
    // Validate that this is an A/B testing worker
    if ( strpos( $worker_id, 'ab-testing' ) === false && strpos( $worker_id, 'ab-cache' ) === false ) {
        wp_send_json_error( 'Only A/B testing workers can be updated with this function' );
    }
    
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    $namespace_id = $credentials['namespace_id'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) || empty($namespace_id) ) {
        wp_send_json_error( 'Cloudflare credentials are required' );
    }
    
    // Determine worker version based on name
    $worker_version = ( strpos( $worker_id, 'cache' ) !== false ) ? 'cache' : 'simple';
    $worker_script = cloudflare_ab_get_worker_template( $worker_version );
    
    if ( empty( $worker_script ) ) {
        wp_send_json_error( "Failed to load {$worker_version} worker template" );
    }
    
    // Debug: Check script length and content
    if ( strlen( $worker_script ) < 100 ) {
        wp_send_json_error( "Worker script appears to be too short or invalid (length: " . strlen( $worker_script ) . ")" );
    }
    
    // Debug: Check if script has proper export format (ES module or event listeners)
    if ( strpos( $worker_script, 'export default' ) === false && strpos( $worker_script, 'addEventListener' ) === false ) {
        wp_send_json_error( "Worker script missing export default or event listeners. Script preview: " . substr( $worker_script, 0, 200 ) . "..." );
    }
    
    // Debug: Log first few lines to verify content
    $script_lines = explode( "\n", $worker_script );
    $first_lines = array_slice( $script_lines, 0, 5 );
    cloudflare_ab_debug_log( "[DM A/B] Worker script first 5 lines: " . implode( " | ", $first_lines ) );
    
    // Update worker script with KV binding (same as deploy logic)
    $upload_url = "https://api.cloudflare.com/client/v4/accounts/{$cf_account_id}/workers/scripts/{$worker_id}";
    
    $metadata = [
        'main_module' => 'script.js',
        'bindings' => [
            [
                'type' => 'kv_namespace',
                'name' => 'AB_TESTS_KV',
                'namespace_id' => $namespace_id
            ]
        ],
        'compatibility_date' => '2024-01-01',
        'compatibility_flags' => []
    ];
    
    // Build multipart form data
    $upload_data = cloudflare_ab_build_worker_upload_body( $metadata, $worker_script );
    $body = $upload_data['body'];
    $boundary = $upload_data['boundary'];

    // Debug: Log detailed information
    cloudflare_ab_debug_log( "[DM A/B] Updated metadata with main_module: " . json_encode( $metadata ) );
    cloudflare_ab_debug_log( "[DM A/B] Multipart body preview: " . substr( $body, 0, 500 ) . "..." );
    cloudflare_ab_debug_log( "[DM A/B] Boundary: " . $boundary );
    cloudflare_ab_debug_log( "[DM A/B] Full metadata part: " . substr( $body, strpos( $body, 'name="metadata"' ), 200 ) );
    
    $upload_response = wp_remote_request( $upload_url, [
        'method'  => 'PUT',
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type'  => 'multipart/form-data; boundary=' . $boundary,
        ],
        'body'    => $body,
        'timeout' => 30,
    ] );
    
    if ( is_wp_error( $upload_response ) ) {
        wp_send_json_error( 'Failed to update worker: ' . $upload_response->get_error_message() );
    }
    
    $response_code = wp_remote_retrieve_response_code( $upload_response );
    if ( $response_code !== 200 ) {
        $upload_body = wp_remote_retrieve_body( $upload_response );
        
        // Log for debugging
        cloudflare_ab_debug_log( "[DM A/B] Worker update failed for {$worker_id}: HTTP {$response_code}" );
        cloudflare_ab_debug_log( "[DM A/B] Response body: " . $upload_body );
        cloudflare_ab_debug_log( "[DM A/B] Script length: " . strlen( $worker_script ) );
        cloudflare_ab_debug_log( "[DM A/B] Metadata: " . json_encode( $metadata ) );
        
        wp_send_json_error( 'Failed to update worker: ' . $upload_body );
    }
    
    wp_send_json_success( 'Worker updated successfully' );
}

function cloudflare_ab_get_worker_template( $version = 'cache' ) {
    $plugin_dir = plugin_dir_path( dirname( __FILE__ ) );
    
    if ( $version === 'simple' ) {
        $template_file = $plugin_dir . 'workers/ab-testing.js';
    } else {
        $template_file = $plugin_dir . 'workers/ab-testing-with-cache.js';
    }
    
    // Debug logging
    cloudflare_ab_debug_log( '[DM A/B] Loading worker template: ' . $template_file );
    cloudflare_ab_debug_log( '[DM A/B] Plugin dir: ' . $plugin_dir );
    cloudflare_ab_debug_log( '[DM A/B] Version requested: ' . $version );
    cloudflare_ab_debug_log( '[DM A/B] File exists: ' . (file_exists( $template_file ) ? 'YES' : 'NO') );
    
    if ( ! file_exists( $template_file ) ) {
        cloudflare_ab_debug_log( '[DM A/B] Worker template file not found: ' . $template_file );
        return '';
    }
    
    $content = file_get_contents( $template_file );
    cloudflare_ab_debug_log( '[DM A/B] Template content length: ' . strlen( $content ) );
    cloudflare_ab_debug_log( '[DM A/B] Template first 100 chars: ' . substr( $content, 0, 100 ) );
    
    return $content;
}

function cloudflare_ab_get_worker_status( $zone_id ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_account_id) || empty($cf_api_token) ) {
        return new WP_Error( 'missing_credentials', 'Account ID and API Token are required' );
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
    
    if ( is_wp_error( $workers_response ) || wp_remote_retrieve_response_code( $workers_response ) !== 200 ) {
        return new WP_Error( 'workers_fetch_failed', 'Failed to fetch workers' );
    }
    
    $workers_data = json_decode( wp_remote_retrieve_body( $workers_response ), true );
    $workers = $workers_data['result'] ?? [];
    
    // Get routes for this zone
    $routes_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes";
    $routes_response = wp_remote_get( $routes_url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $routes_response ) || wp_remote_retrieve_response_code( $routes_response ) !== 200 ) {
        return new WP_Error( 'routes_fetch_failed', 'Failed to fetch routes' );
    }
    
    $routes_data = json_decode( wp_remote_retrieve_body( $routes_response ), true );
    $routes = $routes_data['result'] ?? [];
    
    // Combine workers with their routes
    $worker_status = [];
    
    foreach ( $workers as $worker ) {
        $worker_routes = array_filter( $routes, function( $route ) use ( $worker ) {
            return isset( $route['script'] ) && $route['script'] === $worker['id'];
        } );
        
        $worker_status[] = [
            'id' => $worker['id'],
            'created_on' => $worker['created_on'] ?? '',
            'modified_on' => $worker['modified_on'] ?? '',
            'routes' => array_values( $worker_routes )
        ];
    }
    
    return $worker_status;
}

function cloudflare_ab_add_route_to_worker( $worker_id, $zone_id, $route_preset, $custom_route_pattern = '' ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_api_token = $credentials['api_token'] ?? '';
    
    if ( empty($cf_api_token) ) {
        return new WP_Error( 'missing_token', 'API Token is required' );
    }
    
    // Get zone info to build route pattern
    $zone_info = cloudflare_ab_get_zone_info( $zone_id, $cf_api_token );
    if ( is_wp_error( $zone_info ) ) {
        return $zone_info;
    }
    $zone_name = $zone_info['name'];
    
    // Generate route pattern
    $route_pattern = '';
    if ( $route_preset === 'all' ) {
        $route_pattern = "*{$zone_name}/*";
    } elseif ( $route_preset === 'pages' ) {
        $route_pattern = "*{$zone_name}/*";
    } elseif ( $route_preset === 'home' ) {
        $route_pattern = "*{$zone_name}/";
    } elseif ( $route_preset === 'custom' && !empty( $custom_route_pattern ) ) {
        $route_pattern = $custom_route_pattern;
    } else {
        return new WP_Error( 'invalid_route_preset', 'Invalid route preset' );
    }
    
    // Create route
    $routes_url = "https://api.cloudflare.com/client/v4/zones/{$zone_id}/workers/routes";
    $route_data = [
        'pattern' => $route_pattern,
        'script' => $worker_id
    ];
    
    $response = wp_remote_post( $routes_url, [
        'headers' => [
            'Authorization' => 'Bearer ' . $cf_api_token,
            'Content-Type' => 'application/json',
        ],
        'body' => json_encode( $route_data ),
        'timeout' => 15,
    ] );
    
    if ( is_wp_error( $response ) ) {
        return $response;
    }
    
    $status_code = wp_remote_retrieve_response_code( $response );
    if ( $status_code !== 200 ) {
        $body = wp_remote_retrieve_body( $response );
        return new WP_Error( 'route_creation_failed', 'Route creation failed: ' . $body );
    }
    
    return [
        'pattern' => $route_pattern,
        'worker_id' => $worker_id,
        'zone_id' => $zone_id
    ];
}

function cloudflare_ab_worker_management_page_markup() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $cf_account_id = $credentials['account_id'] ?? '';
    $cf_namespace_id = $credentials['namespace_id'] ?? '';
    $cf_api_token = $credentials['api_token'] ?? '';
    
    // Remember worker version selection
    $selected_worker_version = get_option( 'cloudflare_ab_worker_version', 'simple' );

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
                                <select id="worker-version" class="regular-text" name="cloudflare_ab_worker_version">
                                    <option value="cache" <?php selected( $selected_worker_version, 'cache' ); ?>>Full Version (with advanced caching)</option>
                                    <option value="simple" <?php selected( $selected_worker_version, 'simple' ); ?>>Simple Version (lightweight)</option>
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
                                    <input type="text" id="worker-name" value="ab-testing-with-cache" class="regular-text" />
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
                                <th scope="row">Route Pattern</th>
                                <td>
                                    <select id="route-preset" class="regular-text" style="margin-bottom: 10px;">
                                        <option value="all">All Traffic (*domain.com/*)</option>
                                        <option value="pages">Pages Only (exclude WordPress admin, REST API, and system paths)</option>
                                        <option value="home">Homepage Only (*domain.com/ and *domain.com)</option>
                                        <option value="custom">Custom Pattern</option>
                                    </select>
                                    <div id="custom-route-container" style="display: none; margin-top: 10px;">
                                        <input type="text" id="custom-route-pattern" placeholder="*example.com/shop/*" class="regular-text" />
                                        <p class="description">Enter custom route pattern (e.g., *example.com/shop/*, *example.com/blog/*)</p>
                                    </div>
                                    <div id="route-preview" style="margin-top: 10px; padding: 8px; background: #f0f0f1; border-radius: 4px; font-family: monospace; font-size: 12px;"></div>
                                    <p class="description">
                                        <strong>Route Examples:</strong><br>
                                        • <code>*domain.com/*</code> - All traffic<br>
                                        • <code>*domain.com/shop/*</code> - Shop pages only<br>
                                        • <code>*domain.com/</code> - Homepage only<br>
                                        • <code>*domain.com/blog/*</code> - Blog pages only<br>
                                        <strong>Note:</strong> "Pages Only" excludes WordPress admin (/wp-admin/*, /wp-login.php), REST API (/wp-json/*), and system paths (/wp-content/*, /wp-includes/*)
                                    </p>
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

            <!-- Add Route Modal -->
            <div id="add-route-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;">
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%;">
                    <h3 style="margin-top: 0;">Add Route to Worker</h3>
                    <div style="margin-bottom: 15px;">
                        <strong>Worker:</strong> <span id="modal-worker-id"></span>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="modal-route-preset" style="display: block; margin-bottom: 5px;"><strong>Route Pattern:</strong></label>
                        <select id="modal-route-preset" style="width: 100%; padding: 5px;">
                            <option value="all">All Traffic (*domain.com/*)</option>
                            <option value="pages">Pages Only (exclude WordPress admin, REST API, and system paths)</option>
                            <option value="home">Homepage Only (*domain.com/ and *domain.com)</option>
                            <option value="custom">Custom Pattern</option>
                        </select>
                    </div>

                    <div id="modal-custom-route-container" style="display: none; margin-bottom: 15px;">
                        <input type="text" id="modal-custom-route-pattern" placeholder="*example.com/shop/*" style="width: 100%; padding: 5px;" />
                        <p style="margin: 5px 0; font-size: 12px; color: #666;">Enter custom route pattern (e.g., *example.com/shop/*, *example.com/blog/*)</p>
                    </div>

                    <div id="modal-route-preview" style="margin-bottom: 15px; padding: 10px; background: #f0f0f1; border-radius: 4px; font-family: monospace; font-size: 12px;"></div>

                    <div style="text-align: right;">
                        <button type="button" onclick="closeAddRouteModal()" style="margin-right: 10px;">Cancel</button>
                        <button type="button" id="apply-route-btn" class="button button-primary" onclick="applyRouteToWorker()">Apply Route</button>
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

            // Handle route preset selection
            $('#route-preset, #modal-route-preset').change(function() {
                const isModal = $(this).attr('id').startsWith('modal');
                const customContainer = isModal ? $('#modal-custom-route-container') : $('#custom-route-container');

                if ($(this).val() === 'custom') {
                    customContainer.show();
                } else {
                    customContainer.hide();
                }
                updateRoutePreview(isModal);
            });

            // Update route preview
            $('#custom-route-pattern, #modal-custom-route-pattern').on('input', function() {
                const isModal = $(this).attr('id').startsWith('modal');
                updateRoutePreview(isModal);
            });

            function updateRoutePreview(isModal = false) {
                const preset = isModal ? $('#modal-route-preset').val() : $('#route-preset').val();
                const customPattern = isModal ? $('#modal-custom-route-pattern').val() : $('#custom-route-pattern').val();
                const zoneName = $('#zone-display').text().replace('✅ ', '');
                const preview = isModal ? $('#modal-route-preview') : $('#route-preview');

                let pattern = '';

                if (preset === 'all') {
                    pattern = '*' + zoneName + '/*';
                } else if (preset === 'pages') {
                    pattern = '*' + zoneName + '/* (with bypass for admin/API)';
                } else if (preset === 'home') {
                    pattern = '*' + zoneName + '/';
                } else if (preset === 'custom') {
                    pattern = customPattern || '...';
                }

                preview.text(pattern);
            }

            // Load zones
            function loadZones() {
                const zoneStatus = $('#zone-status');
                const zoneDisplay = $('#zone-display');
                const zoneIdInput = $('#zone-id');

                zoneStatus.text('🔍 Detecting domain...');

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_get_zones',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            const zones = response.data;
                            const siteUrl = '<?php echo home_url(); ?>';
                            const siteDomain = new URL(siteUrl).hostname;

                            const matchedZone = zones.find(zone => siteDomain.endsWith(zone.name));

                            if (matchedZone) {
                                zoneDisplay.html('✅ ' + matchedZone.name);
                                zoneIdInput.val(matchedZone.id);
                                updateRoutePreview();
                                loadWorkerStatus(matchedZone.id);
                            } else {
                                zoneDisplay.html('❌ No matching zone found for ' + siteDomain);
                            }
                        } else {
                            zoneDisplay.html('❌ Error fetching zones: ' + response.data);
                        }
                    },
                    error: function() {
                        zoneDisplay.html('❌ Network error fetching zones');
                    }
                });
            }

            $('#load-zones').click(loadZones);

            // Deploy worker
            $('#deploy-worker').click(function() {
                const button = $(this);
                const status = $('#deployment-status');

                const workerName = $('#worker-name').val();
                const zoneId = $('#zone-id').val();
                const namespaceId = '<?php echo $cf_namespace_id; ?>';
                const version = $('#worker-version').val();
                const routePreset = $('#route-preset').val();
                const customRoutePattern = $('#custom-route-pattern').val();

                if (!workerName || !zoneId) {
                    status.html('<p style="color: red;">Worker name and target domain are required.</p>');
                    return;
                }

                button.prop('disabled', true).text('Deploying...');
                status.html('<p>Deploying worker "' + workerName + '"...</p>');

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_deploy_worker',
                        nonce: nonce,
                        worker_name: workerName,
                        zone_id: zoneId,
                        namespace_id: namespaceId,
                        version: version,
                        route_preset: routePreset,
                        custom_route_pattern: customRoutePattern
                    },
                    success: function(response) {
                        if (response.success) {
                            const data = response.data;
                            let html = '<p style="color: green;">✅ Worker deployed successfully!</p>';
                            html += '<ul>';
                            html += '<li><strong>Worker:</strong> ' + data.worker_name + '</li>';
                            html += '<li><strong>Zone:</strong> ' + data.zone_name + '</li>';
                            html += '<li><strong>Routes:</strong> ' + data.routes.join(', ') + '</li>';
                            html += '</ul>';
                            status.html(html);
                            loadWorkerStatus(zoneId);
                        } else {
                            status.html('<p style="color: red;">❌ Deployment failed: ' + response.data + '</p>');
                        }
                    },
                    error: function() {
                        status.html('<p style="color: red;">❌ Network error during deployment.</p>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Deploy Worker');
                    }
                });
            });

            // Load worker status
            function loadWorkerStatus(zoneId) {
                const statusList = $('#worker-status-list');
                statusList.html('<p>Loading worker status...</p>');

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_get_worker_status',
                        nonce: nonce,
                        zone_id: zoneId
                    },
                    success: function(response) {
                        if (response.success) {
                            const workers = response.data;
                            let html = '';

                            if (workers.length === 0) {
                                html = '<p>No active workers found for this zone.</p>';
                            } else {
                                html += '<table class="widefat striped">';
                                html += '<thead><tr><th>Worker</th><th>Routes</th><th>Actions</th></tr></thead>';
                                html += '<tbody>';

                                workers.forEach(function(worker) {
                                    html += '<tr>';
                                    html += '<td><strong>' + worker.id + '</strong></td>';
                                    html += '<td>';
                                    if (worker.routes.length > 0) {
                                        html += '<ul>';
                                        worker.routes.forEach(function(route) {
                                            html += '<li><code>' + route.pattern + '</code> <button class="delete-route" data-route-id="' + route.id + '" data-zone-id="' + zoneId + '">❌</button></li>';
                                        });
                                        html += '</ul>';
                                    } else {
                                        html += '<em>No routes assigned</em>';
                                    }
                                    html += '</td>';
                                    html += '<td>';
                                    html += '<button class="add-route" data-worker-id="' + worker.id + '" data-zone-id="' + zoneId + '">Add Route</button>';
                                    // Only show Update Code button for A/B testing workers
                                    if (worker.id.includes('ab-testing') || worker.id.includes('ab-cache')) {
                                        html += '<button class="update-worker-code" data-worker-id="' + worker.id + '" style="margin-left: 10px; color: #0073aa;">Update Code</button>';
                                    }
                                    html += '<button class="delete-worker" data-worker-id="' + worker.id + '" style="margin-left: 10px; color: #d63638;">Delete Worker</button>';
                                    html += '</td>';
                                    html += '</tr>';
                                });

                                html += '</tbody></table>';
                            }

                            statusList.html(html);
                        } else {
                            statusList.html('<p style="color: red;">❌ Error loading worker status: ' + response.data + '</p>');
                        }
                    },
                    error: function() {
                        statusList.html('<p style="color: red;">❌ Network error loading worker status.</p>');
                    }
                });
            }

            $('#refresh-status').click(function() {
                const zoneId = $('#zone-id').val();
                if (zoneId) {
                    loadWorkerStatus(zoneId);
                }
            });

            // Update worker code
            $(document).on('click', '.update-worker-code', function() {
                const workerId = $(this).data('worker-id');
                const button = $(this);
                
                if (!confirm('Are you sure you want to update the worker code for "' + workerId + '"? This will replace the current code with the latest version from the plugin.')) {
                    return;
                }
                
                button.prop('disabled', true).text('Updating...');
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_update_worker_code',
                        nonce: nonce,
                        worker_id: workerId
                    },
                    success: function(response) {
                        if (response.success) {
                            alert('Worker code updated successfully!');
                        } else {
                            alert('Error updating worker code: ' + response.data);
                        }
                    },
                    error: function() {
                        alert('Network error occurred while updating worker code.');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Update Code');
                    }
                });
            });

            // Delete worker
            $(document).on('click', '.delete-worker', function() {
                const workerId = $(this).data('worker-id');
                if (!confirm('Are you sure you want to delete worker "' + workerId + '"? This cannot be undone.')) {
                    return;
                }

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_delete_worker',
                        nonce: nonce,
                        worker_id: workerId
                    },
                    success: function(response) {
                        if (response.success) {
                            alert('Worker deleted successfully');
                            $('#refresh-status').click();
                        } else {
                            alert('Error deleting worker: ' + response.data);
                        }
                    }
                });
            });

            // Delete route
            $(document).on('click', '.delete-route', function() {
                const routeId = $(this).data('route-id');
                const zoneId = $(this).data('zone-id');
                if (!confirm('Are you sure you want to delete this route?')) {
                    return;
                }

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_delete_route',
                        nonce: nonce,
                        route_id: routeId,
                        zone_id: zoneId
                    },
                    success: function(response) {
                        if (response.success) {
                            alert('Route deleted successfully');
                            $('#refresh-status').click();
                        } else {
                            alert('Error deleting route: ' + response.data);
                        }
                    }
                });
            });

            // Add route modal
            $(document).on('click', '.add-route', function() {
                const workerId = $(this).data('worker-id');
                const zoneId = $(this).data('zone-id');

                $('#modal-worker-id').text(workerId);
                $('#apply-route-btn').data('worker-id', workerId).data('zone-id', zoneId);

                updateRoutePreview(true);
                $('#add-route-modal').show();
            });

            window.closeAddRouteModal = function() {
                $('#add-route-modal').hide();
            }

            window.applyRouteToWorker = function() {
                const workerId = $('#apply-route-btn').data('worker-id');
                const zoneId = $('#apply-route-btn').data('zone-id');
                const preset = $('#modal-route-preset').val();
                const customPattern = $('#modal-custom-route-pattern').val();

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_add_route',
                        nonce: nonce,
                        worker_id: workerId,
                        zone_id: zoneId,
                        route_preset: preset,
                        custom_route_pattern: customPattern
                    },
                    success: function(response) {
                        if (response.success) {
                            alert('Route added successfully');
                            closeAddRouteModal();
                            $('#refresh-status').click();
                        } else {
                            alert('Error adding route: ' + response.data);
                        }
                    }
                });
            }

            // Worker template preview
            $('#worker-version').change(function() {
                const version = $(this).val();
                const featuresList = $('#worker-features');

                if (version === 'simple') {
                    $('#template-version-display').text('Simple Version (lightweight)').css('color', '#f59e0b');
                    featuresList.find('#cache-features, #static-features, #coalescing-features').hide();
                } else {
                    $('#template-version-display').text('Full Version (with caching)').css('color', '#00a32a');
                    featuresList.find('#cache-features, #static-features, #coalescing-features').show();
                }

                // Load worker template
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_get_worker_template',
                        nonce: nonce,
                        version: version
                    },
                    success: function(response) {
                        if (response.success) {
                            $('#worker-template').val(response.data);
                        }
                    }
                });
            });

        });
        </script>

    </div>
    <?php
}

