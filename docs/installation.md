# Installation Guide

## Quick Install (Recommended)

### Download Pre-built Plugin

1. **Go to Releases**: Visit the [GitHub Releases page](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/releases)

2. **Download latest version**: Click on `cloudflare-ab-testing-v1.0.0.zip`

3. **Install in WordPress**:
   ```
   WordPress Admin → Plugins → Add New → Upload Plugin
   ```
   
4. **Activate**: Click "Activate Plugin"

### Manual Installation

1. **Download and extract**:
   ```bash
   wget https://github.com/YOUR_USERNAME/cloudflare-ab-testing/archive/main.zip
   unzip main.zip
   ```

2. **Copy plugin folder**:
   ```bash
   cp -r cloudflare-ab-testing-main/plugin/ /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
   ```

3. **Set permissions**:
   ```bash
   chown -R www-data:www-data /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
   chmod -R 755 /path/to/wordpress/wp-content/plugins/cloudflare-ab-testing/
   ```

## Post-Installation Setup

### 1. Configure Cloudflare Credentials

1. Go to **A/B Tests** → **Settings** in WordPress admin
2. Enter your **Cloudflare Account ID**
3. Create and enter a **Cloudflare API Token**

#### Creating API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Custom token** template
4. Set permissions:
   - **Zone:Zone:Read**
   - **Zone:Zone Settings:Edit** 
   - **Account:Cloudflare Workers:Edit**
   - **Account:Account Analytics:Read**

### 2. Create KV Namespace

1. Go to **A/B Tests** → **Diagnostics**
2. Click **Create New Namespace**
3. Enter a name like `ab-testing-prod`
4. Click **Create**

### 3. Deploy Worker

1. Go to **A/B Tests** → **Worker Management**
2. Choose worker version:
   - **Full Version**: For high-traffic production sites
   - **Simple Version**: For basic A/B testing needs
3. Click **Deploy Worker**
4. Confirm deployment to auto-detected domain

### 4. Configure A/B Tests

1. Go to **A/B Tests** → **Diagnostics**
2. Add test configuration:
   ```json
   [
     {
       "test": "homepage_cta_test",
       "paths": ["/", "/home"],
       "cookieName": "AB_CTA_BUTTON_TEST"
     }
   ]
   ```
3. Click **Save Configuration**

### 5. Add Shortcodes to Content

Add to your pages/posts:

```
[ab_test a="Original Button" b="New Button Text"]
[ab_test_debug]
```

## Verification

### Check Worker Status

1. Go to **A/B Tests** → **Worker Management**
2. Click **Refresh Status**
3. Verify worker shows as **Active**

### Test A/B Functionality

1. Visit your site in incognito mode
2. Check for `X-Worker-Active: true` header
3. Look for A/B test cookies being set
4. Refresh multiple times to see consistent variants

### Debug Mode

Add `?__cf_bypass_cache=1` to any URL to see debug headers:
- `X-Worker-Active: true`
- `X-AB-Test: test_name`
- `X-AB-Variant: A` or `B`

## Troubleshooting

### Common Issues

**Worker not deploying:**
- Check Cloudflare credentials
- Verify API token permissions
- Ensure domain is in Cloudflare

**No A/B testing happening:**
- Check KV namespace binding
- Verify test configuration
- Check path matching in registry

**Permission errors:**
- Update API token permissions
- Check account ID is correct

### Support

- [GitHub Issues](https://github.com/YOUR_USERNAME/cloudflare-ab-testing/issues)
- [Documentation](../README.md)
- [Configuration Guide](configuration.md)