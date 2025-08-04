# 🚀 Cloudflare A/B Testing v2.0.0 - Installation & Setup Guide

## 📥 Installation Options

### Option 1: WordPress Admin (Recommended)
1. **Download** the release file: `cloudflare-ab-testing-v2.0.0.zip`
2. **WordPress Admin** → Plugins → Add New → Upload Plugin
3. **Upload** the zip file and **Activate**
4. **Configure** in **A/B Tests** → **Settings**

### Option 2: Manual Installation
1. **Download** `cloudflare-ab-testing-v2.0.0.zip`
2. **Extract** to `/wp-content/plugins/cloudflare-ab-testing/`
3. **Activate** through WordPress Admin → Plugins
4. **Configure** your Cloudflare credentials

## 🔧 Initial Configuration

### Step 1: Cloudflare API Credentials
1. **Go to A/B Tests** → **Settings**
2. **Enable GitHub Release Updater** (optional):
   - GitHub Username: `Dilanti-Media`
   - GitHub Repository: `cloudflare-ab-testing`
   - GitHub Token: Leave empty (public repo)

3. **Cloudflare Configuration**:
   - **Account ID**: Your Cloudflare Account ID
   - **API Token**: Create at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - **Zone ID**: Your website's Cloudflare zone ID

### Step 2: Worker Deployment
1. **Go to A/B Tests** → **Worker Management**
2. **Deploy Worker** to Cloudflare
3. **Choose Worker Type**:
   - **Simple Worker**: Production-ready basic functionality
   - **Advanced Worker**: Multi-layer caching optimization

### Step 3: Configure Tests
1. **Go to A/B Tests** → **Settings**
2. **Add Test Configuration**:
   ```
   homepage_test|/,/home
   pricing_test|/pricing,/pricing/plans
   ```
3. **Save Settings**

## 📊 GA4 Tracking Setup

The enhanced GA4 tracking works automatically once configured:

### Automatic Tracking
- **Events sent**: `ab_test_view` or custom event name
- **Tracking properties**:
  - `ab_test`: Test name identifier
  - `ab_variant`: A or B variant

### Manual Tracking (Optional)
```javascript
// Test if GA4 tracking is enabled
if (cloudflareAbTesting.ga4 && cloudflareAbTesting.ga4.isEnabled()) {
  // Manual tracking for custom scenarios
  cloudflareAbTesting.ga4.track('custom_test', 'A');
}
```

## 🔍 Verification & Testing

### Quick Test
1. **Visit your site** - you should see A/B variants being served
2. **Check Console** for debug output (admin users only)
3. **Monitor GA4** for tracking events

### Advanced Testing
```bash
# Test distribution locally
node testing/test-ab-complete.js

# Validate live system
node testing/test-live-distribution.sh
```

## 🚨 Common Issues & Solutions

### Issue: "Failed to deploy worker"
- **Check**: Cloudflare API token permissions
- **Solution**: Token needs Workers permissions for your account

### Issue: "GA4 events not showing"
- **Check**: Ensure gtag is properly configured on site
- **Solution**: Verify GA4 measurement ID is active

### Issue: "50/50 split not exact"
- **Normal**: Algorithm uses hash-based distribution - minor deviations are expected
- **Test**: Run validation suites for statistical validation

## 📱 Production Checklist

- [ ] WordPress 5.0+ installed
- [ ] PHP 7.4+ configured
- [ ] Cloudflare Workers plan active
- [ ] API token with correct permissions
- [ ] Test configurations added
- [ ] Worker successfully deployed
- [ ] GA4 tracking verified

## 🎯 Next Steps

1. **Monitor performance** in GA4 for tracking events
2. **Test A/B results** using the built-in debug tools
3. **Scale configurations** as needed for different pages
4. **Review analytics** after 24-48 hours for meaningful data

## 📞 Support

- **Documentation**: [GitHub Repository](https://github.com/Dilanti-Media/cloudflare-ab-testing)
- **Issues**: [GitHub Issues](https://github.com/Dilanti-Media/cloudflare-ab-testing/issues)
- **Live Demo**: [Test Site](https://cloudflare-ab-testing.dilanti.media/)