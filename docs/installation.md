# Installation Guide

This guide covers the complete installation and setup process for the Cloudflare A/B Testing WordPress plugin with auto-updater functionality.

## 🚀 Quick Install (Recommended)

### Method 1: WordPress Admin Upload

1. **Download Latest Release**
   - Visit the [GitHub Releases page](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/releases)
   - Download `cloudflare-ab-testing-v1.3.0.zip` (or latest version)

2. **Install via WordPress Admin**
   ```
   WordPress Admin → Plugins → Add New → Upload Plugin
   ```
   - Choose the downloaded ZIP file
   - Click "Install Now"
   - Click "Activate Plugin"

3. **Configure Auto-Updates** (Optional but Recommended)
   - Navigate to **A/B Tests → Configuration**
   - Scroll to "Plugin Updates" section
   - Enter your GitHub username and repository name
   - Save configuration

### Method 2: Direct Download

```bash
# Download latest release
wget https://github.com/YOUR_USERNAME/cloudflare-ab-testing/releases/latest/download/cloudflare-ab-testing-latest.zip

# Extract to WordPress plugins directory
unzip cloudflare-ab-testing-latest.zip -d /path/to/wordpress/wp-content/plugins/

# Set proper permissions
chown -R www-data:www-data /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
chmod -R 755 /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
```

### Method 3: Development Installation

For developers or those who want the latest features:

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/cloudflare-ab-testing.git
cd cloudflare-ab-testing

# Build plugin
./scripts/build-plugin.sh

# Copy to WordPress
cp -r plugin/ /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
```

## ⚙️ Post-Installation Setup

### 1. Initial Configuration

1. **Activate Plugin**
   - Go to **WordPress Admin → Plugins**
   - Find "Cloudflare A/B Testing" and click "Activate"

2. **Access Settings**
   - Navigate to **A/B Tests** in the WordPress admin menu
   - You'll see the main configuration page with status cards

### 2. Configure Auto-Updates (Recommended)

1. **Navigate to Plugin Updates Section**
   - Go to **A/B Tests → Configuration**
   - Scroll to "Plugin Updates" section

2. **Enter GitHub Details**
   ```
   GitHub Username: your-github-username
   GitHub Repository: cloudflare-ab-testing
   GitHub Token: (optional - only for private repos)
   ```

3. **Save Configuration**
   - Click "Save Configuration"
   - You'll now receive automatic update notifications

### 3. Configure Cloudflare Credentials

1. **Gather Required Information**
   - **Account ID**: Found in Cloudflare dashboard sidebar
   - **API Token**: Create at Cloudflare → My Profile → API Tokens
   - **KV Namespace ID**: Create a Workers KV namespace

2. **Create Cloudflare API Token**
   - Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click **Create Token**
   - Use **Custom token** template
   - Set permissions:
     - **Account:Cloudflare Workers:Edit**
     - **Zone:Zone:Read**
     - **Account:Account:Read**
   - Include your specific account and zones

3. **Create KV Namespace**
   ```bash
   # Using Wrangler CLI
   wrangler kv:namespace create "AB_TESTING"
   
   # Or via Cloudflare Dashboard
   # Workers → KV → Create Namespace → Name: "AB_TESTING"
   ```

4. **Enter Credentials in WordPress**
   - **Account ID**: Your Cloudflare account ID
   - **API Token**: The token you just created
   - **KV Namespace ID**: The namespace ID from step 3

### 4. Deploy Cloudflare Worker

1. **Navigate to Worker Management**
   - Go to **A/B Tests → Worker Management**

2. **Choose Worker Version**
   - **Simple Worker**: Basic A/B testing functionality
   - **Cache Worker**: Performance-optimized with caching

3. **Deploy Worker**
   - Click "Deploy [Version] Worker"
   - Wait for deployment confirmation
   - The worker will be deployed to your Cloudflare account

### 5. Configure A/B Tests

1. **Navigate to Test Configuration**
   - Go to **A/B Tests → Configuration**
   - Find the "A/B Test Configuration" section

2. **Add Test Configurations**
   ```
   Format: test-name|/path1,/path2
   
   Examples:
   homepage_banner|/,/home
   pricing_button|/pricing,/pricing/compare
   checkout_flow|/checkout,/cart
   feature_test|/features,/features/new
   ```

3. **Save Configuration**
   - Click "Save Configuration"
   - Tests are now active on specified paths

## 🔧 Advanced Configuration

### Custom Worker Deployment

If you need to customize the worker code:

1. **Edit Worker Files**
   ```bash
   # Simple version
   nano plugin/workers/ab-testing.js
   
   # Cache-optimized version
   nano plugin/workers/ab-testing-with-cache.js
   ```

2. **Deploy Custom Worker**
   - Use the Worker Management page
   - Or deploy manually via Wrangler CLI

### Environment-Specific Settings

For different environments (staging, production):

```php
// In wp-config.php
define('CLOUDFLARE_AB_ENV', 'staging');
define('CLOUDFLARE_AB_DEBUG', true);
```

### WordPress Multisite

For WordPress multisite installations:

1. **Network Activation**
   - Activate plugin network-wide
   - Configure separately for each site

2. **Shared Configuration**
   - Use the same Cloudflare credentials across sites
   - Configure different test paths per site

## 🧪 Verification & Testing

### 1. Run Built-in Diagnostics

1. **Navigate to Diagnostics**
   - Go to **A/B Tests → Diagnostics**

2. **Run System Checks**
   - Click "Run All Diagnostics"
   - Review results for any issues

3. **Test Worker Functionality**
   - Use the built-in worker testing tools
   - Verify variant assignment is working

### 2. Manual Testing

1. **Test Variant Assignment**
   ```bash
   # Test with different IP addresses or user agents
   curl -H "User-Agent: TestBot/1.0" https://yoursite.com/
   ```

2. **Check Analytics Integration**
   - Open browser developer tools
   - Look for `dataLayer` entries with variant information

3. **Verify Update System**
   - Check **Dashboard → Updates** for plugin update notifications
   - Test update process if newer version available

## 🔍 Troubleshooting

### Common Issues

1. **Plugin Not Appearing in Updates**
   - Verify GitHub configuration in Plugin Updates section
   - Check repository is public or token is provided
   - Clear WordPress update caches

2. **Worker Deployment Fails**
   - Verify Cloudflare API credentials
   - Check account has Workers enabled
   - Ensure sufficient Workers quota

3. **A/B Tests Not Working**
   - Run diagnostics to identify issues
   - Check worker is deployed and active
   - Verify test configuration format

4. **Permission Errors**
   - Ensure proper file permissions (755 for directories, 644 for files)
   - Check WordPress user has `manage_options` capability

### Getting Help

1. **Check Documentation**
   - Review [Auto-Updater Setup Guide](auto-updater-setup.md)
   - Check [Testing Guide](../testing/README.md)

2. **Run Diagnostics**
   - Use built-in diagnostic tools
   - Check WordPress debug logs

3. **GitHub Issues**
   - Search existing issues
   - Create new issue with diagnostic output

## 🚀 Next Steps

After successful installation:

1. **Set Up Analytics Tracking**
   - Configure Google Analytics integration
   - Set up conversion tracking

2. **Plan Your Tests**
   - Define test hypotheses
   - Set up test duration and success metrics

3. **Monitor Performance**
   - Use Cloudflare Analytics to monitor worker performance
   - Check WordPress admin for test results

4. **Stay Updated**
   - Enable auto-updates for seamless version upgrades
   - Subscribe to release notifications

---

**Need Help?** 
- 📖 [Documentation](../README.md)
- 🔧 [Auto-Updater Guide](auto-updater-setup.md)  
- 🐛 [GitHub Issues](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/issues)
- 📧 [Email Support](mailto:support@dilantimedia.com)

**Note**: Replace `YOUR_USERNAME` with your actual GitHub username in all URLs.
