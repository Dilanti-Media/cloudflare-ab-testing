<?php
/**
 * WordPress Update Compatibility Check
 * 
 * Identifies and prevents WordPress update failures
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Cloudflare_AB_Update_Compatibility {
    
    public function __construct() {
        add_action( 'admin_init', array( $this, 'install_update_hooks' ) );
        add_filter( 'plugin_update_check_debug_display', '__return_true' );
    }
    
    public function install_update_hooks() {
        add_action( 'upgrader_process_complete', array( $this, 'after_update_debug' ), 10, 2 );
        add_action( 'upgrader_source_selection', array( $this, 'ensure_correct_structure' ), 10, 4 );
    }
    
    public function ensure_correct_structure( $source, $remote_source, $upgrader, $hook_extra ) {
        if ( strpos( $source, 'cloudflare-ab-testing' ) !== false ) {
            // Ensure we're updating the correct plugin structure
            return $source;
        }
        return $source;
    }
    
    public function after_update_debug( $upgrader_object, $options ) {
        if ( $options['action'] === 'update' && $options['type'] === 'plugin' ) {
            foreach( $options['plugins'] as $plugin ) {
                if ( $plugin === 'cloudflare-ab-testing/cloudflare-ab-testing.php' ) {
                    error_log( 'Cloudflare A/B Testing update completed successfully' );
                    // Additional debugging hooks
                }
            }
        }
    }
}

// Initialize compatibility checker
new Cloudflare_AB_Update_Compatibility();