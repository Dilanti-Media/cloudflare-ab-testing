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

