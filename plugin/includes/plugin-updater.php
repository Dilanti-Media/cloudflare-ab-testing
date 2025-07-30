<?php
/**
 * Plugin Updater Class
 * Handles automatic updates from GitHub releases
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Cloudflare_AB_Plugin_Updater {

    private $plugin_slug;
    private $plugin_basename;
    private $version;
    private $github_username;
    private $github_repo;
    private $github_token; // Optional, for private repos

    public function __construct( $plugin_basename, $github_username, $github_repo, $version, $github_token = '' ) {
        $this->plugin_basename = $plugin_basename;
        $this->plugin_slug = dirname( $plugin_basename );
        $this->version = $version;
        $this->github_username = $github_username;
        $this->github_repo = $github_repo;
        $this->github_token = $github_token;

        add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'check_for_update' ) );
        add_filter( 'plugins_api', array( $this, 'plugin_info' ), 20, 3 );
        add_filter( 'upgrader_pre_download', array( $this, 'download_package' ), 10, 3 );
        add_action( 'upgrader_process_complete', array( $this, 'after_update' ), 10, 2 );
    }

    /**
     * Check for plugin updates
     */
    public function check_for_update( $transient ) {
        if ( empty( $transient->checked ) ) {
            return $transient;
        }

        // Get remote version
        $remote_version = $this->get_remote_version();

        // Ensure we have a valid version that's different from current
        if ( empty( $remote_version ) || $remote_version === $this->version ) {
            return $transient;
        }

        // If remote version is newer, add to update queue
        if ( version_compare( $this->version, $remote_version, '<' ) ) {
            $remote_info = $this->get_remote_info();
            $compatibility_info = $this->extract_compatibility_info( $remote_info );
            
            $transient->response[ $this->plugin_basename ] = (object) array(
                'slug' => $this->plugin_slug,
                'plugin' => $this->plugin_basename,
                'new_version' => $remote_version,
                'url' => $this->get_github_repo_url(),
                'package' => $this->get_download_url( $remote_version ),
                'tested' => $compatibility_info['tested'] ?? '6.8.2',
                'requires' => $compatibility_info['requires'] ?? '5.0',
                'requires_php' => $compatibility_info['requires_php'] ?? '7.4',
                'compatibility' => array(),
                'upgrade_notice' => $this->get_upgrade_notice( $remote_info )
            );
        }

        return $transient;
    }

    /**
     * Get plugin information for the update screen
     */
    public function plugin_info( $result, $action, $args ) {
        if ( $action !== 'plugin_information' || $args->slug !== $this->plugin_slug ) {
            return $result;
        }

        $remote_version = $this->get_remote_version();
        $remote_info = $this->get_remote_info();

        // Extract compatibility info from release body if available
        $compatibility_info = $this->extract_compatibility_info( $remote_info );

        return (object) array(
            'name' => 'Cloudflare A/B Testing',
            'slug' => $this->plugin_slug,
            'version' => $remote_version,
            'author' => 'Dilanti Media',
            'author_profile' => 'https://dilantimedia.com/',
            'homepage' => $this->get_github_repo_url(),
            'download_link' => $this->get_download_url( $remote_version ),
            'package' => $this->get_download_url( $remote_version ),
            'sections' => array(
                'description' => 'Provides A/B testing capabilities integrated with Cloudflare Workers.',
                'changelog' => $this->get_changelog( $remote_info ),
            ),
            'requires' => $compatibility_info['requires'] ?? '5.0',
            'tested' => $compatibility_info['tested'] ?? '6.8.2',
            'requires_php' => $compatibility_info['requires_php'] ?? '7.4',
            'last_updated' => $remote_info['published_at'] ?? date( 'Y-m-d H:i:s' ),
            'download_count' => $remote_info['download_count'] ?? 0,
            'stable_tag' => $remote_version,
            'upgrade_notice' => $this->get_upgrade_notice( $remote_info ),
        );
    }

    /**
     * Download the update package
     */
    public function download_package( $reply, $package, $upgrader ) {
        if ( strpos( $package, 'github.com' ) !== false &&
             strpos( $package, $this->github_repo ) !== false ) {

            $args = array(
                'timeout' => 300,
                'headers' => array()
            );

            if ( ! empty( $this->github_token ) ) {
                $args['headers']['Authorization'] = 'token ' . $this->github_token;
            }

            $response = wp_remote_get( $package, $args );

            if ( is_wp_error( $response ) ) {
                return new WP_Error( 'download_failed', 'Failed to download update package: ' . $response->get_error_message() );
            }

            $upgrade_folder = $upgrader->skin->wp_filesystem->wp_content_dir() . 'upgrade/';
            $filename = 'cloudflare-ab-testing-update.zip';
            $full_path = $upgrade_folder . $filename;

            // Create upgrade directory if it doesn't exist
            if ( ! $upgrader->skin->wp_filesystem->is_dir( $upgrade_folder ) ) {
                $upgrader->skin->wp_filesystem->mkdir( $upgrade_folder, 0755 );
            }

            // Write the file
            if ( ! $upgrader->skin->wp_filesystem->put_contents( $full_path, wp_remote_retrieve_body( $response ), 0644 ) ) {
                return new WP_Error( 'download_failed', 'Failed to write update file' );
            }

            return $full_path;
        }

        return $reply;
    }

    /**
     * Actions to perform after update
     */
    public function after_update( $upgrader_object, $options ) {
        if ( $options['action'] === 'update' && $options['type'] === 'plugin' ) {
            // Clear update transients
            delete_site_transient( 'update_plugins' );
            delete_transient( 'cloudflare_ab_remote_version' );
            delete_transient( 'cloudflare_ab_remote_info' );
        }
    }

    /**
     * Get the latest version from GitHub
     */
    private function get_remote_version() {
        $cached = get_transient( 'cloudflare_ab_remote_version' );
        if ( $cached !== false ) {
            return $cached;
        }

        $info = $this->get_remote_info();
        $version = isset( $info['tag_name'] ) ? ltrim( $info['tag_name'], 'v' ) : '';
        
        // Ensure we have a valid version number
        if ( empty( $version ) || !preg_match('/^\d+\.\d+(\.\d+)?/', $version) ) {
            $version = $this->version;
        }

        set_transient( 'cloudflare_ab_remote_version', $version, HOUR_IN_SECONDS * 3 );
        return $version;
    }

    /**
     * Get release information from GitHub API
     */
    private function get_remote_info() {
        $cached = get_transient( 'cloudflare_ab_remote_info' );
        if ( $cached !== false ) {
            return $cached;
        }

        $url = sprintf(
            'https://api.github.com/repos/%s/%s/releases/latest',
            $this->github_username,
            $this->github_repo
        );

        $args = array(
            'timeout' => 30,
            'headers' => array(
                'Accept' => 'application/vnd.github.v3+json',
                'User-Agent' => 'WordPress Plugin Updater'
            )
        );

        if ( ! empty( $this->github_token ) ) {
            $args['headers']['Authorization'] = 'token ' . $this->github_token;
        }

        $response = wp_remote_get( $url, $args );

        if ( is_wp_error( $response ) ) {
            error_log('Cloudflare A/B Testing: Failed to fetch release info - ' . $response->get_error_message());
            return array();
        }

        $body = wp_remote_retrieve_body( $response );
        $info = json_decode( $body, true );

        if ( ! is_array( $info ) ) {
            error_log('Cloudflare A/B Testing: Failed to parse release info - Invalid JSON response');
            return array();
        }

        // Ensure we have required fields
        if ( ! isset( $info['tag_name'] ) ) {
            error_log('Cloudflare A/B Testing: Invalid GitHub API response - missing tag_name');
            return array();
        }

        set_transient( 'cloudflare_ab_remote_info', $info, HOUR_IN_SECONDS * 3 );
        return $info;
    }

    /**
     * Get the download URL for a specific version
     */
    private function get_download_url( $version ) {
        $info = $this->get_remote_info();

        // Look for a zip asset in the release
        if ( isset( $info['assets'] ) && is_array( $info['assets'] ) ) {
            foreach ( $info['assets'] as $asset ) {
                if ( strpos( $asset['name'], '.zip' ) !== false ) {
                    return $asset['browser_download_url'];
                }
            }
        }

        // Fallback to GitHub's auto-generated zip (for backwards compatibility)
        return sprintf(
            'https://github.com/%s/%s/archive/refs/tags/v%s.zip',
            $this->github_username,
            $this->github_repo,
            $version
        );
    }

    /**
     * Get GitHub repository URL
     */
    private function get_github_repo_url() {
        return sprintf(
            'https://github.com/%s/%s',
            $this->github_username,
            $this->github_repo
        );
    }

    /**
     * Extract changelog from release notes
     */
    private function get_changelog( $info ) {
        if ( isset( $info['body'] ) && ! empty( $info['body'] ) ) {
            return wpautop( wp_kses_post( $info['body'] ) );
        }

        return 'No changelog available for this release.';
    }

    /**
     * Extract compatibility information from release notes
     */
    private function extract_compatibility_info( $remote_info ) {
        $info = array();
        
        if ( isset( $remote_info['body'] ) && ! empty( $remote_info['body'] ) ) {
            $body = $remote_info['body'];
            
            // Look for WordPress version compatibility
            if ( preg_match( '/Tested up to:\s*(\d+\.\d+(\.\d+)?)/i', $body, $matches ) ) {
                $info['tested'] = $matches[1];
            }
            
            // Look for WordPress minimum requirement
            if ( preg_match( '/Requires at least:\s*(\d+\.\d+(\.\d+)?)/i', $body, $matches ) ) {
                $info['requires'] = $matches[1];
            }
            
            // Look for PHP requirement
            if ( preg_match( '/Requires PHP:\s*(\d+\.\d+(\.\d+)?)/i', $body, $matches ) ) {
                $info['requires_php'] = $matches[1];
            }
        }
        
        return $info;
    }

    /**
     * Extract upgrade notice from release notes
     */
    private function get_upgrade_notice( $remote_info ) {
        if ( isset( $remote_info['body'] ) && ! empty( $remote_info['body'] ) ) {
            $body = $remote_info['body'];
            
            // Look for upgrade notice section
            if ( preg_match( '/## Upgrade Notice\s*(.+?)(\n##|$)/is', $body, $matches ) ) {
                return trim( $matches[1] );
            }
            
            // Look for first paragraph as notice
            $lines = explode( "\n", $body );
            foreach ( $lines as $line ) {
                $line = trim( $line );
                if ( ! empty( $line ) && strpos( $line, '#' ) !== 0 ) {
                    return $line;
                }
            }
        }
        
        return 'A new version is available with improvements and bug fixes.';
    }
}