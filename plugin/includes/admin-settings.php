<?php
/**
 * Admin Menu & Settings
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

add_action( 'admin_menu', 'cloudflare_ab_register_admin_page' );
add_action( 'admin_init', 'cloudflare_ab_register_settings' );

function cloudflare_ab_register_admin_page() {
    // Main menu page
    add_menu_page(
        __( 'A/B Tests', 'cloudflare-ab-testing' ),
        'A/B Tests',
        'manage_options',
        'cloudflare-ab-settings',
        'cloudflare_ab_settings_page_markup',
        'dashicons-chart-area',
        25 // Position after Comments
    );
    
    // Rename the first submenu to be more descriptive
    add_submenu_page(
        'cloudflare-ab-settings',
        __( 'Test Configuration', 'cloudflare-ab-testing' ),
        __( 'Configuration', 'cloudflare-ab-testing' ),
        'manage_options',
        'cloudflare-ab-settings',
        'cloudflare_ab_settings_page_markup'
    );

    // Worker management submenu - moved up as it's more commonly used
    add_submenu_page(
        'cloudflare-ab-settings',
        __( 'Worker Management', 'cloudflare-ab-testing' ),
        __( 'Worker Management', 'cloudflare-ab-testing' ),
        'manage_options',
        'cloudflare-ab-worker-management',
        'cloudflare_ab_worker_management_page_markup'
    );

    // Diagnostics submenu - moved down as it's used less frequently
    add_submenu_page(
        'cloudflare-ab-settings',
        __( 'Diagnostics & Help', 'cloudflare-ab-testing' ),
        __( 'Diagnostics', 'cloudflare-ab-testing' ),
        'manage_options',
        'cloudflare-ab-diagnostics',
        'cloudflare_ab_diagnostics_page_markup'
    );
}

function cloudflare_ab_register_settings() {
    // Register settings group
    register_setting( 'cloudflare_ab_options_group', 'cloudflare_ab_enabled_urls', 'cloudflare_ab_sanitize_urls' );
    register_setting( 'cloudflare_ab_options_group', 'cloudflare_ab_cloudflare_credentials' );
    register_setting( 'cloudflare_ab_options_group', 'cloudflare_ab_worker_version' );
    register_setting( 'cloudflare_ab_options_group', 'cloudflare_ab_github_updater' );

    // --- Section: Test Configuration ---
    add_settings_section(
        'cloudflare_ab_section_main',
        __( 'A/B Test Configuration', 'cloudflare-ab-testing' ),
        function() {
            echo '<p>' . esc_html__( 'Configure your A/B tests by specifying test names and the paths where they should be active.', 'cloudflare-ab-testing' ) . '</p>';
        },
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
            echo '<p>' . esc_html__( 'Enter your Cloudflare API credentials to enable worker deployment and KV storage management.', 'cloudflare-ab-testing' ) . '</p>';
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

    // --- Section: Plugin Updates ---
    add_settings_section(
        'cloudflare_ab_section_updates',
        __( 'Plugin Updates', 'cloudflare-ab-testing' ),
        function() {
            echo '<p>' . esc_html__( 'Configure automatic plugin updates from GitHub releases.', 'cloudflare-ab-testing' ) . '</p>';
        },
        'cloudflare-ab-settings'
    );

    add_settings_field(
        'cloudflare_ab_field_github_username',
        __( 'GitHub Username', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_github_updater_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_updates',
        [ 'key' => 'github_username', 'label' => 'GitHub Username', 'help' => 'The GitHub username or organization that owns the repository' ]
    );

    add_settings_field(
        'cloudflare_ab_field_github_repo',
        __( 'GitHub Repository', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_github_updater_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_updates',
        [ 'key' => 'github_repo', 'label' => 'Repository Name', 'help' => 'The name of the GitHub repository (e.g., "cloudflare-ab-testing")' ]
    );

    add_settings_field(
        'cloudflare_ab_field_github_token',
        __( 'GitHub Token (Optional)', 'cloudflare-ab-testing' ),
        'cloudflare_ab_field_github_updater_markup',
        'cloudflare-ab-settings',
        'cloudflare_ab_section_updates',
        [ 'key' => 'github_token', 'label' => 'Personal Access Token', 'is_secret' => true, 'help' => 'Only required for private repositories. Create at GitHub Settings > Developer settings > Personal access tokens' ]
    );

    // Remove the admin footer action as we're using standard WordPress sections
}

function cloudflare_ab_field_urls_markup() {
    $value = get_option( 'cloudflare_ab_enabled_urls', '' );
    ?>
    <textarea 
        id="cloudflare_ab_enabled_urls"
        name="cloudflare_ab_enabled_urls" 
        rows="8" 
        cols="60"
        class="large-text code"
        placeholder="homepage_test|/,/home&#10;pricing_test|/pricing,/pricing/compare"
        data-tooltip="<?php esc_attr_e( 'Enter one A/B test per line in format: test_name|/path1,/path2', 'cloudflare-ab-testing' ); ?>"
    ><?php echo esc_textarea( $value ); ?></textarea>
    <p class="description">
        <?php esc_html_e( 'Format: test_name|/path1,/path2 (one per line)', 'cloudflare-ab-testing' ); ?><br>
        <?php esc_html_e( 'Example:', 'cloudflare-ab-testing' ); ?><br>
        <code>homepage_banner|/,/home</code><br>
        <code>pricing_button|/pricing,/pricing/compare</code>
    </p>
    <?php
}

function cloudflare_ab_field_cf_credentials_markup( $args ) {
    $credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $key = $args['key'];
    $value = isset( $credentials[$key] ) ? $credentials[$key] : '';
    $type = isset( $args['is_secret'] ) && $args['is_secret'] ? 'password' : 'text';
    $field_id = 'cloudflare_ab_' . $key;
    ?>
    <input 
        type="<?php echo esc_attr($type); ?>" 
        id="<?php echo esc_attr($field_id); ?>"
        name="cloudflare_ab_cloudflare_credentials[<?php echo esc_attr($key); ?>]" 
        value="<?php echo esc_attr( $value ); ?>" 
        class="regular-text"
        <?php echo !empty($value) ? 'required' : ''; ?>
        data-tooltip="<?php echo isset( $args['help'] ) ? esc_attr( $args['help'] ) : ''; ?>"
    >
    <?php if ( isset( $args['help'] ) ): ?>
        <p class="description"><?php echo esc_html( $args['help'] ); ?></p>
    <?php endif; ?>
    <?php if ( !empty($value) && $type === 'password' ) : ?>
        <button type="button" class="button ab-copy-btn" data-target="#<?php echo esc_attr($field_id); ?>" style="margin-left: 10px;">
            <?php esc_html_e( 'Copy', 'cloudflare-ab-testing' ); ?>
        </button>
    <?php endif; ?>
    <?php
}

function cloudflare_ab_field_github_updater_markup( $args ) {
    $updater_settings = get_option( 'cloudflare_ab_github_updater', [] );
    $key = $args['key'];
    $value = isset( $updater_settings[$key] ) ? $updater_settings[$key] : '';
    $type = isset( $args['is_secret'] ) && $args['is_secret'] ? 'password' : 'text';
    $field_id = 'cloudflare_ab_' . $key;
    ?>
    <input
        type="<?php echo esc_attr($type); ?>"
        id="<?php echo esc_attr($field_id); ?>"
        name="cloudflare_ab_github_updater[<?php echo esc_attr($key); ?>]"
        value="<?php echo esc_attr( $value ); ?>"
        class="regular-text"
        <?php echo !empty($value) ? 'required' : ''; ?>
        data-tooltip="<?php echo isset( $args['help'] ) ? esc_attr( $args['help'] ) : ''; ?>"
    >
    <?php if ( isset( $args['help'] ) ): ?>
        <p class="description"><?php echo esc_html( $args['help'] ); ?></p>
    <?php endif; ?>
    <?php if ( !empty($value) && $type === 'password' ) : ?>
        <button type="button" class="button ab-copy-btn" data-target="#<?php echo esc_attr($field_id); ?>" style="margin-left: 10px;">
            <?php esc_html_e( 'Copy', 'cloudflare-ab-testing' ); ?>
        </button>
    <?php endif; ?>
    <?php
}

function cloudflare_ab_settings_page_markup() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    
    // Get current configuration for status cards
    $enabled_urls = get_option( 'cloudflare_ab_enabled_urls', '' );
    $cf_credentials = get_option( 'cloudflare_ab_cloudflare_credentials', [] );
    $has_tests = !empty( trim( $enabled_urls ) );
    $has_credentials = !empty( $cf_credentials['account_id'] ) && !empty( $cf_credentials['api_token'] );
    
    ?>
    <div class="wrap cloudflare-ab-admin">
        <h1><?php esc_html_e( 'A/B Tests', 'cloudflare-ab-testing' ); ?></h1>
        
        <!-- Status Cards -->
        <div class="ab-status-cards">
            <div class="ab-status-card <?php echo $has_tests ? 'success' : 'warning'; ?>">
                <h3>
                    <span class="ab-status-icon <?php echo $has_tests ? 'success' : 'warning'; ?>">
                        <?php echo $has_tests ? '✅' : '⚠️'; ?>
                    </span>
                    <?php esc_html_e( 'Test Configuration', 'cloudflare-ab-testing' ); ?>
                </h3>
                <p>
                    <?php if ( $has_tests ) : ?>
                        <?php esc_html_e( 'A/B tests are configured and ready to use.', 'cloudflare-ab-testing' ); ?>
                    <?php else : ?>
                        <?php esc_html_e( 'No A/B tests configured yet. Add your first test below.', 'cloudflare-ab-testing' ); ?>
                    <?php endif; ?>
                </p>
            </div>
            
            <div class="ab-status-card <?php echo $has_credentials ? 'success' : 'error'; ?>">
                <h3>
                    <span class="ab-status-icon <?php echo $has_credentials ? 'success' : 'error'; ?>">
                        <?php echo $has_credentials ? '✅' : '❌'; ?>
                    </span>
                    <?php esc_html_e( 'Cloudflare Connection', 'cloudflare-ab-testing' ); ?>
                </h3>
                <p>
                    <?php if ( $has_credentials ) : ?>
                        <?php esc_html_e( 'Connected to Cloudflare API successfully.', 'cloudflare-ab-testing' ); ?>
                    <?php else : ?>
                        <?php esc_html_e( 'Cloudflare API credentials required for worker deployment.', 'cloudflare-ab-testing' ); ?>
                    <?php endif; ?>
                </p>
            </div>
            
            <div class="ab-status-card info">
                <h3>
                    <span class="ab-status-icon info">📊</span>
                    <?php esc_html_e( 'Quick Actions', 'cloudflare-ab-testing' ); ?>
                </h3>
                <p>
                    <a href="<?php echo admin_url('admin.php?page=cloudflare-ab-worker-management'); ?>" class="ab-btn ab-btn-primary">
                        <?php esc_html_e( 'Deploy Worker', 'cloudflare-ab-testing' ); ?>
                    </a>
                    <a href="<?php echo admin_url('admin.php?page=cloudflare-ab-diagnostics'); ?>" class="ab-btn ab-btn-secondary">
                        <?php esc_html_e( 'Run Diagnostics', 'cloudflare-ab-testing' ); ?>
                    </a>
                </p>
            </div>
        </div>
        
        <form method="post" action="options.php" class="ab-form">
            <?php settings_fields( 'cloudflare_ab_options_group' ); ?>
            <?php do_settings_sections( 'cloudflare-ab-settings' ); ?>
            
            <div class="ab-action-buttons">
                <?php submit_button( __( 'Save Configuration', 'cloudflare-ab-testing' ), 'primary ab-btn ab-btn-primary', 'submit', false ); ?>
                <button type="button" class="ab-btn ab-btn-secondary ab-add-test-config" data-tooltip="<?php esc_attr_e( 'Interactive helper to add a new A/B test configuration', 'cloudflare-ab-testing' ); ?>">
                    <?php esc_html_e( '+ Add Test', 'cloudflare-ab-testing' ); ?>
                </button>
            </div>
        </form>
    </div>
    <?php
}

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
