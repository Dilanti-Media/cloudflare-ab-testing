# Release v1.4.1 - GitHub Settings Auto-Configuration

## 🎯 What's New
This release introduces **zero-configuration GitHub auto-updates** by intelligently prefilling the public repository settings. The plugin now works immediately after installation without requiring manual GitHub configuration.

## ✨ New Features

### GitHub Auto-Configuration (`feature/github-settings-prefill`)
- **Smart Defaults:** Automatically uses `Dilanti-Media/cloudflare-ab-testing` when fields are empty
- **Zero-config Updates:** Works immediately after activation
- **Backward Compatibility:** Custom repositories still override when provided
- **Intuitive Placeholders:** Inputs show default values with helpful hints

### User Experience Improvements
- **Simplified Setup:** No GitHub configuration required for standard installations
- **Clear Instructions:** Updated help text indicates optional configuration
- **Placeholder Hints:** "Dilanti-Media" and "cloudflare-ab-testing" placeholders
- **Seamless Updates:** Auto-updater always active with intelligent fallback

## 🔧 Technical Details

### Auto-Updater Configuration
```php
// Always initialized with defaults or custom settings
$github_username = !empty($settings['github_username']) ? $settings['github_username'] : 'Dilanti-Media';
$github_repo = !empty($settings['github_repo']) ? $settings['github_repo'] : 'cloudflare-ab-testing';
```

### Field Updates
- **GitHub Username:** Help text updated to "leave blank for Dilanti-Media"
- **Repository Name:** Help text updated to "leave blank for cloudflare-ab-testing"
- **Both fields:** Non-required, populated with intelligent defaults

## 🎯 Benefits
- ✅ **Zero-configuration:** Install and use immediately
- ✅ **Automatic updates:** Gets latest releases from GitHub
- ✅ **Flexible:** Custom repositories override defaults seamlessly
- ✅ **User-friendly:** Clear instructions and placeholder hints
- ✅ **Production-ready:** No breaking changes to existing setups

## 📊 Testing Results
- ✅ **Fresh install:** Works without GitHub configuration
- ✅ **Custom repo:** Still overrides correctly
- ✅ **Auto-updater:** Triggers immediately after activation
- ✅ **Backward compatibility:** Preserves existing user settings

## 🚀 Quick Start
1. **Install v1.4.1** - No configuration needed
2. **Plugin activates** - Auto-updater ready with defaults
3. **Get updates** - Automatically receives new releases
4. **(Optional)** - Configure custom GitHub user/repo if needed

## 📄 Files Changed
- `plugin/cloudflare-ab-testing.php`: v1.4.1 version update
- `plugin/includes/admin-settings.php`: GitHub settings improvements
- Added: Help text and placeholder hints for better UX

**Installer:** Works immediately with Dilanti-Media/cloudflare-ab-testing
**Custom:** Override anytime via plugin settings panel