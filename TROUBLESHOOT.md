# 🔧 WordPress Update Debugging Guide

## 📝 Current Test Setup
**Local WordPress**: v1.5.1  
**GitHub Release**: v2.0.0  
**Expected Behavior**: WordPress detects v2.0.0 as available update

## 🚨 How to Get Detailed Error Information

### 1. Enable WordPress Debug Mode
Add to wp-config.php:
```php
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', true );
define( 'SCRIPT_DEBUG', true );
```

### 2. Check Debug Log After Update Attempt
```bash
# Check WordPress debug log
tail -f /path/to/wordpress/wp-content/debug.log

# Or check system logs
grep "cloudflare" /var/log/*.log
```

### 3. Test Plugin Update Health
```php
// Add this test code to debug
add_action('admin_init', function() {
    $updater = new Cloudflare_AB_Plugin_Updater(
        'cloudflare-ab-testing/cloudflare-ab-testing.php',
        'Dilanti-Media',
        'cloudflare-ab-testing',
        '1.5.1'
    );
    
    $remote = $updater->get_remote_version();
    error_log('Remote version: ' . $remote);
    
    $download = $updater->get_download_url('2.0.0');
    error_log('Download URL: ' . $download);
    
    $test = wp_remote_get($download);
    if (is_wp_error($test)) {
        error_log('Download test failed: ' . $test->get_error_message());
    }
});
```

## 🔍 Common Update Issues & Solutions

### 1. "Update failed: error" (the current issue)

**Known Fixes:**
- **1.5.1 includes the fix**: Ensure you're testing with the correct v1.5.1 plugin
- **PHP compatibility**: Check PHP version (requires 7.4+)
- **WordPress version**: Requires 5.0+ (the updater supports this)

### 2. File System Issues
```bash
# Check WordPress filesystem permissions
ls -la wordpress/wp-content/plugins/
ls -la wordpress/wp-content/upgrade/

# Check if WordPress can write
sudo -u www-data touch wordpress/wp-content/test-write.txt
sudo -u www-data rm wordpress/wp-content/test-write.txt
```

### 3. GitHub API Response
```bash
# Test GitHub API directly
curl -s https://api.github.com/repos/Dilanti-Media/cloudflare-ab-testing/releases/latest
```

## 🎯 Testing Strategy

### 1. When Ready to Try Update
1. **Clear WordPress transients**: 
   ```bash
   wp transient delete --all
   ```
2. **Clear browser cache** for WordPress admin
3. **Try update** and immediately check debug.log
4. **Monitor real-time** for specific error messages

### 2. If Still Getting Generic Errors
1. **Check network tab** in browser dev tools during update
2. **Use WordPress CLI** for verbose output:
   ```bash
   wp plugin update cloudflare-ab-testing --debug
   ```
3. **Check server error logs** for PHP/memory issues

## 🛠️ Enhanced Debugging

### Debug Plugin Health Check
```php
// Add to functions.php temporarily
add_action('admin_notices', function() {
    $updater = new Cloudflare_AB_Plugin_Updater(
        'cloudflare-ab-testing/cloudflare-ab-testing.php',
        'Dilanti-Media',
        'cloudflare-ab-testing',
        '1.5.1'
    );
    
    $errors = [];
    
    // Test GitHub API
    $token = get_transient('cloudflare_ab_remote_info');
    if (!$token) {
        $errors[] = 'GitHub API issue';
    }
    
    // Test filesystem
    if (!wp_is_writable(WP_CONTENT_DIR . '/upgrade/')) {
        $errors[] = 'Upgrade directory not writable';
    }
    
    if ($errors) {
        echo '<div class="error"><p>Cloudflare A/B Update Issues: ' . implode(', ', $errors) . '</p></div>';
    }
});
```