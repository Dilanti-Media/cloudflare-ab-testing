# Plugin Sync Instructions

Due to `open_basedir` restrictions on the server, symlinks don't work. Here's how to sync the plugin for testing:

## Quick Sync Command

Run this command from the project root to copy all plugin files to WordPress:

```bash
cd /Users/kim/Documents/MyFiles/BoilerplateH/cloudflare-ab-testing
cp -r plugin/* wordpress/wp-content/plugins/cloudflare-ab-testing/
```

## Alternative: Use the sync script

```bash
./sync-to-wordpress.sh
```

## What's been fixed in the plugin:

✅ **Fixed Multipart Format Issue**
- Both deployment and update functions now use correct format
- `main_module: 'script.js'` in metadata
- `name="script"; filename="script.js"` in multipart form data

✅ **Complete refactored structure**
- All files organized in `includes/` folder
- All AJAX handlers properly registered
- "Update Worker Code" button added to worker status table

## Testing the "Update Worker Code" Feature:

1. Copy files to WordPress: `cp -r plugin/* wordpress/wp-content/plugins/cloudflare-ab-testing/`
2. Go to WordPress admin → **A/B Tests** → **Worker Management**
3. Find an existing A/B testing worker
4. Click **"Update Code"** button
5. Confirm the update

The multipart format should now work correctly! 🎉

## Files that need to be synced:

- `cloudflare-ab-testing.php` (main plugin file)
- `includes/worker-management.php` (contains the multipart fix)
- `includes/admin-settings.php`
- `includes/cloudflare-api.php`
- `includes/diagnostics.php`
- `includes/shortcodes.php`
- `workers/ab-testing.js`
- `workers/ab-testing-with-cache.js`
- `assets/js/cloudflare-ab-testing.js`