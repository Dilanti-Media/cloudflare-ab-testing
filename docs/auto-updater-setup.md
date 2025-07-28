# Auto-Updater Setup Guide

This guide explains how to set up and use the GitHub-based auto-updater for the Cloudflare A/B Testing plugin.

## Overview

The auto-updater allows your WordPress plugin to receive updates directly from GitHub releases, bypassing the need for the WordPress Plugin Directory. This is perfect for:

- Private or custom plugins
- Beta testing with specific users
- Maintaining control over update distribution
- Faster release cycles

## How It Works

1. **Version Check**: The plugin periodically checks GitHub for new releases
2. **Update Notification**: WordPress displays update notifications when newer versions are available
3. **One-Click Update**: Users can update directly from the WordPress admin
4. **Automatic Download**: The plugin downloads and installs updates from GitHub releases

## Setup Instructions

### 1. GitHub Repository Setup

Your GitHub repository should have:
- Tagged releases (e.g., `v1.2.0`, `v1.3.0`)
- Release assets (ZIP files) or use GitHub's auto-generated source archives
- Public repository (or provide GitHub tokens for private repos)

### 2. Create GitHub Releases

When you're ready to release a new version:

1. **Build the plugin:**
   ```bash
   cd /path/to/your/plugin
   ./scripts/build-plugin.sh
   ```

2. **Create GitHub release:**
   - Go to your GitHub repository
   - Click "Releases" → "Create a new release"
   - Tag version: `v1.2.0` (match the version in your plugin file)
   - Release title: `Version 1.2.0`
   - Upload the ZIP file from `releases/cloudflare-ab-testing-v1.2.0.zip`
   - Add release notes describing changes
   - Mark as "Latest release"

### 3. Configure WordPress Sites

For each WordPress site using your plugin:

1. **Go to WordPress Admin:**
   - Navigate to "A/B Tests" → "Configuration"
   - Scroll to "Plugin Updates" section

2. **Enter GitHub Details:**
   - **GitHub Username**: Your GitHub username or organization
   - **GitHub Repository**: Repository name (e.g., "cloudflare-ab-testing")
   - **GitHub Token**: (Optional) Only needed for private repositories

3. **Save Configuration**

### 4. GitHub Token Setup (For Private Repos)

If your repository is private:

1. **Create Personal Access Token:**
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate new token with `repo` scope
   - Copy the token

2. **Add to WordPress:**
   - Paste token in "GitHub Token" field
   - Save configuration

## Usage

### For End Users

Once configured, updates work automatically:

1. **Check for Updates:**
   - Go to WordPress Admin → Dashboard → Updates
   - Or Plugins → Installed Plugins
   - Updates appear alongside WordPress core and other plugin updates

2. **Install Updates:**
   - Click "Update Now" next to the plugin
   - WordPress handles the download and installation automatically
   - Plugin is updated without losing settings

### For Developers

**Release Process:**
1. Update version number in `cloudflare-ab-testing.php`
2. Run build script: `./scripts/build-plugin.sh`
3. Create GitHub release with version tag
4. Upload the generated ZIP file
5. Users receive update notifications within 6 hours

**Version Numbering:**
- Use semantic versioning: `1.2.3`
- Plugin file version must match GitHub tag (without 'v' prefix)
- Example: Plugin shows "1.2.0", GitHub tag is "v1.2.0"

## Troubleshooting

### Updates Not Appearing

1. **Check Configuration:**
   - Verify GitHub username and repository name
   - Ensure GitHub release exists with proper tag

2. **Clear Caches:**
   - The plugin caches version checks for 6 hours
   - Deactivate and reactivate plugin to clear cache

3. **Check GitHub API:**
   - Ensure repository is public or token is provided
   - Test API access: `https://api.github.com/repos/username/repo/releases/latest`

### Download Failures

1. **GitHub Rate Limits:**
   - Use GitHub token to increase rate limits
   - Wait and try again if rate limited

2. **File Permissions:**
   - Ensure WordPress can write to `/wp-content/upgrade/`
   - Check file permissions on hosting

3. **ZIP File Issues:**
   - Ensure uploaded ZIP contains plugin folder structure
   - Test ZIP file manually before uploading

### Common Issues

**Plugin not updating:**
- Check that new version number is higher than current
- Verify GitHub release is marked as "Latest release"
- Clear WordPress update transients

**Permission errors:**
- Ensure user has `manage_options` capability
- Check WordPress file permissions

**GitHub API errors:**
- Verify repository name spelling
- Check if repository is public/accessible
- Validate GitHub token if using private repo

## Security Considerations

1. **GitHub Tokens:**
   - Store tokens securely in WordPress options
   - Use minimal required permissions
   - Regularly rotate tokens

2. **Update Verification:**
   - Plugin validates ZIP file structure
   - Only downloads from configured GitHub repository
   - Uses WordPress's built-in update mechanisms

3. **Access Control:**
   - Only administrators can configure updater settings
   - Update checks only run in admin area
   - Respects WordPress user capabilities

## Advanced Configuration

### Custom Update Check Intervals

The plugin checks for updates every 6 hours by default. To modify:

```php
// In your theme's functions.php or custom plugin
add_filter('cloudflare_ab_update_check_interval', function($interval) {
    return 12 * HOUR_IN_SECONDS; // Check every 12 hours
});
```

### Custom Download Sources

You can modify the download URL logic:

```php
// Custom download URL for releases
add_filter('cloudflare_ab_download_url', function($url, $version, $username, $repo) {
    // Return custom download URL
    return "https://custom-server.com/releases/plugin-v{$version}.zip";
}, 10, 4);
```

## Best Practices

1. **Testing:**
   - Test updates on staging sites first
   - Use pre-release tags for beta testing
   - Maintain changelog for users

2. **Version Management:**
   - Follow semantic versioning
   - Tag releases consistently
   - Don't delete old releases

3. **Communication:**
   - Provide clear release notes
   - Document breaking changes
   - Maintain backward compatibility when possible

4. **Backup:**
   - Users should backup before updates
   - Consider automatic backup integration
   - Provide rollback instructions

This auto-updater system provides a professional, WordPress-native update experience while maintaining full control over your plugin distribution.
