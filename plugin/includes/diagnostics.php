<?php
/**
 * Diagnostic Page
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

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

        // System Health Check
        echo '<div class="postbox" style="margin-top: 20px;">';
        echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">System Health Check</h2>';
        echo '<div class="inside" style="padding: 15px;">';
        
        // Real-time health monitoring
        echo '<div id="health-check-container">';
        echo '<p>Running comprehensive system health checks...</p>';
        echo '<button id="run-health-check" class="button button-primary">Run Health Check</button>';
        echo '<div id="health-results" style="margin-top: 15px; display: none;"></div>';
        echo '</div>';
        
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

        // Live Environment Test
        echo '<div class="postbox" style="margin-top: 20px;">';
        echo '<h2 class="hndle" style="padding: 10px 15px; margin: 0; border-bottom: 1px solid #ddd;">Live Environment Test</h2>';
        echo '<div class="inside" style="padding: 15px;">';
        
        echo '<p>Test your current environment to verify A/B testing is working correctly:</p>';
        echo '<button id="test-live-environment" class="button button-secondary">Test Live Environment</button>';
        echo '<div id="live-test-results" style="margin-top: 15px; display: none;"></div>';
        
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
            
            // Run comprehensive health check
            $('#run-health-check').click(function() {
                const button = $(this);
                const results = $('#health-results');
                
                button.prop('disabled', true).text('Running...');
                results.html('<p>🔍 Running comprehensive health checks...</p>').show();
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_health_check',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            const checks = response.data;
                            let html = '<div class="health-check-results">';
                            
                            // Overall status
                            const overallStatus = checks.overall_status;
                            const statusIcon = overallStatus === 'healthy' ? '✅' : overallStatus === 'warning' ? '⚠️' : '❌';
                            const statusColor = overallStatus === 'healthy' ? 'green' : overallStatus === 'warning' ? 'orange' : 'red';
                            
                            html += `<h3 style="color: ${statusColor};">${statusIcon} Overall Status: ${overallStatus.toUpperCase()}</h3>`;
                            
                            // Individual checks
                            checks.checks.forEach(function(check) {
                                const checkIcon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
                                const checkColor = check.status === 'pass' ? 'green' : check.status === 'warning' ? 'orange' : 'red';
                                
                                html += `<div style="margin: 10px 0; padding: 10px; border-left: 4px solid ${checkColor}; background: #f9f9f9;">`;
                                html += `<h4 style="margin: 0 0 5px 0; color: ${checkColor};">${checkIcon} ${check.name}</h4>`;
                                html += `<p style="margin: 0;">${check.message}</p>`;
                                
                                if (check.details && check.details.length > 0) {
                                    html += '<ul style="margin: 5px 0 0 20px;">';
                                    check.details.forEach(function(detail) {
                                        html += `<li>${detail}</li>`;
                                    });
                                    html += '</ul>';
                                }
                                
                                if (check.recommendation) {
                                    html += `<p style="margin: 5px 0 0 0; font-style: italic; color: #666;"><strong>Recommendation:</strong> ${check.recommendation}</p>`;
                                }
                                
                                html += '</div>';
                            });
                            
                            html += '</div>';
                            results.html(html);
                        } else {
                            results.html(`<p style="color: red;">❌ Health check failed: ${response.data}</p>`);
                        }
                    },
                    error: function() {
                        results.html('<p style="color: red;">❌ Network error during health check.</p>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Run Health Check');
                    }
                });
            });
            
            // Test live environment
            $('#test-live-environment').click(function() {
                const button = $(this);
                const results = $('#live-test-results');
                
                button.prop('disabled', true).text('Testing...');
                results.html('<p>🧪 Testing live environment...</p>').show();
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'cloudflare_ab_test_live_environment',
                        nonce: nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            const test = response.data;
                            let html = '<div class="live-test-results">';
                            
                            html += `<h4>Environment Test Results</h4>`;
                            html += `<p><strong>Test URL:</strong> <code>${test.test_url}</code></p>`;
                            html += `<p><strong>Status Code:</strong> ${test.status_code}</p>`;
                            
                            if (test.worker_headers && Object.keys(test.worker_headers).length > 0) {
                                html += '<p><strong>Worker Headers Found:</strong></p><ul>';
                                Object.keys(test.worker_headers).forEach(function(key) {
                                    html += `<li><code>${key}: ${test.worker_headers[key]}</code></li>`;
                                });
                                html += '</ul>';
                            } else {
                                html += '<p style="color: orange;">⚠️ No worker headers detected</p>';
                            }
                            
                            if (test.meta_tags_found) {
                                html += `<p style="color: green;">✅ Meta tags injection working</p>`;
                                html += `<p><strong>Detected Variant:</strong> <code>${test.detected_variant || 'None'}</code></p>`;
                                html += `<p><strong>Detected Test:</strong> <code>${test.detected_test || 'None'}</code></p>`;
                            } else {
                                html += '<p style="color: red;">❌ Meta tags not found - A/B testing may not be working</p>';
                            }
                            
                            if (test.recommendations && test.recommendations.length > 0) {
                                html += '<h4>Recommendations:</h4><ul>';
                                test.recommendations.forEach(function(rec) {
                                    html += `<li>${rec}</li>`;
                                });
                                html += '</ul>';
                            }
                            
                            html += '</div>';
                            results.html(html);
                        } else {
                            results.html(`<p style="color: red;">❌ Live test failed: ${response.data}</p>`);
                        }
                    },
                    error: function() {
                        results.html('<p style="color: red;">❌ Network error during live test.</p>');
                    },
                    complete: function() {
                        button.prop('disabled', false).text('Test Live Environment');
                    }
                });
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
        
        .health-check-results h3 {
            margin-top: 0;
        }
        
        .health-check-results h4 {
            margin-bottom: 5px;
        }
        
        .live-test-results h4 {
            margin-top: 0;
            margin-bottom: 10px;
        }
        </style>
    </div>
    <?php
}

