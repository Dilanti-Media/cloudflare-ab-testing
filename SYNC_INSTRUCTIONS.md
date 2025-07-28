# Plugin Development & Sync Instructions

This guide covers development workflow, testing, and deployment procedures for the Cloudflare A/B Testing plugin with auto-updater functionality.

## 🔄 Development Workflow

### Local Development Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cloudflare-ab-testing.git
   cd cloudflare-ab-testing
   ```

2. **Set Up WordPress Environment**
   ```bash
   # Ensure WordPress is running locally
   # Default path: wordpress/wp-content/plugins/cloudflare-ab-testing/
   ```

3. **Make Scripts Executable**
   ```bash
   chmod +x scripts/*.sh
   ```

### Quick Development Sync

Due to `open_basedir` restrictions on some servers, use direct copying instead of symlinks:

```bash
# From project root - sync plugin files to WordPress
cd /Users/kim/Documents/MyFiles/BoilerplateH/cloudflare-ab-testing
cp -r plugin/* wordpress/wp-content/plugins/cloudflare-ab-testing/
```

### Alternative: Use the sync script

```bash
./sync-to-wordpress.sh
```

## 🧪 Testing Workflow

### 1. Version Consistency Check

Before any release, ensure version consistency:

```bash
# Check current version status
./scripts/version-sync.sh check

# Update to new version if needed
./scripts/version-sync.sh update 1.4.0
```

### 2. Local Testing

```bash
# Test algorithm distribution
cd testing/
node test-ab-complete.js

# Test cache worker performance
node test-cache-worker.js

# Run comprehensive tests
npm test  # If package.json scripts are configured
```

### 3. Plugin Validation

1. **WordPress Admin Testing**
   - Install plugin in local WordPress
   - Test all admin pages and functionality
   - Verify auto-updater configuration interface

2. **Worker Deployment Testing**
   - Test both Simple and Cache worker versions
   - Verify deployment through WordPress admin
   - Check Cloudflare dashboard for deployed workers

3. **Auto-Updater Testing**
   - Configure GitHub settings in admin
   - Create test release on GitHub
   - Verify update notifications appear
   - Test update installation process

## 🚀 Release Process

### 1. Prepare Release

```bash
# Update version (this updates both plugin header and constant)
./scripts/version-sync.sh update 1.4.0

# Verify consistency
./scripts/version-sync.sh check
```

### 2. Build Release Package

```bash
# Build plugin ZIP for distribution
./scripts/build-plugin.sh

# This creates: releases/cloudflare-ab-testing-v1.4.0.zip
```

### 3. Create GitHub Release

1. **Tag the Release**
   ```bash
   git tag v1.4.0
   git push origin v1.4.0
   ```

2. **Create GitHub Release**
   - Go to GitHub → Releases → Create new release
   - Tag: `v1.4.0` (must match plugin version)
   - Title: `Version 1.4.0`
   - Upload: `releases/cloudflare-ab-testing-v1.4.0.zip`
   - Add release notes describing changes
   - Mark as "Latest release"

### 4. Verify Auto-Updates

1. **Test Update Notification**
   - Check WordPress sites with previous version
   - Verify update appears in Dashboard → Updates

2. **Test Update Process**
   - Click "Update Now"
   - Verify successful installation
   - Check that settings are preserved

## 🔧 Development Features

### Current Architecture Improvements

✅ **Enhanced Plugin Structure**
- All core functionality organized in `includes/` folder
- Auto-updater system (`includes/plugin-updater.php`)
- Comprehensive admin interface with status cards
- Version management and build tools

✅ **Worker Management System**
- Dual worker architecture (Simple + Cache-optimized)
- Deployment through WordPress admin
- Real-time status monitoring
- Performance optimization features

✅ **Auto-Updater Integration**
- GitHub-based update system
- WordPress-native update experience
- Version synchronization tools
- Release automation support

✅ **Developer Tools**
- Version sync script for consistency
- Enhanced build script with validation
- Comprehensive testing suite
- Documentation automation

### Recent Fixes & Improvements

✅ **Version Management**
- Fixed version consistency between plugin header and constants
- Automated version synchronization scripts
- Build process validates versions before creating releases

✅ **GitHub Integration**
- Proper release tag formatting (v1.3.0 format)
- Auto-updater handles both public and private repositories
- Release asset management with ZIP file validation

✅ **WordPress Standards**
- Enhanced admin interface with status dashboard
- Improved error handling and user feedback
- Security enhancements and CSRF protection
- Multisite compatibility improvements

## 🛠️ Troubleshooting Development Issues

### Common Development Problems

1. **Version Mismatch Errors**
   ```bash
   # Fix with version sync script
   ./scripts/version-sync.sh check
   ./scripts/version-sync.sh update 1.3.0
   ```

2. **Build Script Fails**
   ```bash
   # Ensure proper permissions
   chmod +x scripts/*.sh
   
   # Check for version consistency
   ./scripts/version-sync.sh check
   ```

3. **Auto-Updater Not Working**
   - Verify GitHub repository is public or token is provided
   - Check release tags match version format (v1.3.0)
   - Ensure ZIP file is attached to GitHub release

4. **WordPress Sync Issues**
   ```bash
   # Force sync all files
   rm -rf wordpress/wp-content/plugins/cloudflare-ab-testing/
   cp -r plugin/ wordpress/wp-content/plugins/cloudflare-ab-testing/
   ```

### Development Environment Setup

```bash
# Complete development setup
git clone https://github.com/YOUR_USERNAME/cloudflare-ab-testing.git
cd cloudflare-ab-testing
chmod +x scripts/*.sh

# Initial sync to WordPress
./sync-to-wordpress.sh

# Check version status
./scripts/version-sync.sh check

# Run tests
cd testing/
node test-ab-complete.js
```

## 📋 Pre-Release Checklist

Before creating any release:

- [ ] Version consistency check passed
- [ ] All tests pass locally
- [ ] WordPress admin interface tested
- [ ] Worker deployment tested
- [ ] Auto-updater configuration tested
- [ ] Documentation updated
- [ ] Release notes prepared
- [ ] Build script creates clean ZIP
- [ ] GitHub release process tested

## 🔄 Continuous Integration

### Automated Testing (Future)

The project structure supports CI/CD integration:

```yaml
# Example GitHub Actions workflow
name: Test and Release
on:
  push:
    tags: ['v*']
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          cd testing/
          node test-ab-complete.js
      - name: Build plugin
        run: ./scripts/build-plugin.sh
      - name: Create release
        uses: actions/upload-release-asset@v1
        # ... release automation
```

---

**Need Help?**
- 📖 [Installation Guide](docs/installation.md)
- 🔧 [Auto-Updater Setup](docs/auto-updater-setup.md)
- 🐛 [GitHub Issues](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/issues)
