# Google Analytics 4 Integration Guide

This document covers the complete setup and usage of Google Analytics 4 (GA4) tracking for the Cloudflare A/B Testing WordPress plugin.

## 🎯 Overview

The GA4 integration provides automatic tracking of A/B test variants using custom events and dimensions, making it easy to analyze conversion rates, engagement metrics, and other key performance indicators directly in your Google Analytics 4 dashboard.

## 🔧 Quick Setup

### 1. Enable GA4 Tracking
1. Navigate to **A/B Tests → Settings**
2. Scroll to **Google Analytics 4 Integration** section
3. Check **Enable GA4 Tracking**
4. Configure optional settings
5. Save changes

### 2. Verify GA4 is Installed
Ensure Google Analytics 4 is properly installed on your site:
- Via WordPress plugin (GA Google Analytics, MonsterInsights, etc.)
- Manual gtag.js installation
- Google Tag Manager setup

## 📊 Event Tracking Structure

### Default Event
event: `abVariantInit`
event parameters:
- `ab_test`: Test identifier (e.g., "homepage_banner")
- `ab_variant`: Variant assigned (A or B)

### Example Event Data
```javascript
{
  event: 'abVariantInit',
  ab_test: 'homepage_banner',
  ab_variant: 'A',
  ab_session: {
    test: 'homepage_banner',
    variant: 'A',
    path: '/',
    timestamp: '2025-07-28T15:30:00Z'
  }
}
```

## 🎛️ Configuration Options

### Basic Configuration
| Setting | Default | Description |
|---------|---|-----------|
| **Enable GA4 Tracking** | Disabled | Master switch to enable/disable tracking |
| **Custom Event Name** | `abVariantInit` | Event name used in GA4 |
| **Custom Dimensions** | None | Additional dimension names |

### Event Name Customization
Change the event name to match your analytics conventions:
- Google Analytics 4: Custom events use this name
- Google Tag Manager: Trigger setup uses this name
- Custom analytics systems

### Custom Dimensions Setup
Add additional tracking dimensions for advanced analysis:

**Examples:**
- `ab_session` - Tracks session-specific data
- `variation_source` - Identifies tracking source
- `experiment_group` - Groups related experiments

## 📈 Creating Custom Dimensions in GA4

### 1. Via Google Analytics Admin
1. **Admin → Custom Definitions → Custom Dimensions**
2. **Create Dimension**
3. **Settings:**
   - **Dimension name**: Your custom name
   - **Scope**: Event
   - **Event parameter**: Must match your configuration

### 2. Common Dimension Configurations

**Test Name Dimension**
- Name: `A/B Test Name`
- Event parameter: `ab_test`
- Scope: Event

**Variant Dimension**
- Name: `A/B Variant`
- Event parameter: `ab_variant`
- Scope: Event

**Session Tracking**
- Name: `A/B Session`
- Event parameter: `ab_session`
- Scope: Event

## 📊 GA4 Dashboard Setup

### Creating Explorations

#### 1. Free Form Exploration
1. **Analyze → Explore → Free Form**
2. **Add the following dimensions:**
   - Event name: `abVariantInit`
   - Custom dimension: `ab_test`
   - Custom dimension: `ab_variant`

3. **Add metrics:**
   - Conversions (if configured)
   - Session duration
   - Bounce rate
   - Purchase revenue

4. **Apply filters:**
   - Event name exactly matches `abVariantInit`

#### 2. Explore Variables Configuration
```
Free Form Exploration
├── Dimension Splits
│   ├── ab_test
│   ├── ab_variant
├── Metrics
│   ├── Conversion Rate
│   ├── Average Session Duration
│   ├── Bounce Rate
│   └── Revenue Per User
└── Filters
    └── Event name = abVariantInit
```

### Dashboard Templates

#### A/B Test Overview Report
**Use this template for quick insights**
- **Primary dimension**: ab_test
- **Secondary dimension**: ab_variant
- **Metrics**: Events, Event value, Conversions
- **Comparison date range**: Previous period

#### Conversion Funnel Analysis
**Track conversion effectiveness by variant**
1. **Events in your GA4 dashboard**
2. **Filter by abVariantInit event**
3. **Add conversions as events**
4. **Create funnel for each variant**

## 🧪 Testing Your GA4 Setup

### 1. Debug Mode
Enable debug mode for real-time verification:
1. **Enable in plugin settings**
2. **Open browser console**
3. **Navigate to tested pages**
4. **Look for debug output:** `GA4 A/B Test Tracking: {...}`

### 2. Google Analytics Debug
For real-time verification:
- **Google Analytics 4:** Real-time reports
- **GA4 Debug View:** Check if events are firing
- **Browser Extension:** Google Analytics Debugger

### 3. GTM Preview Mode
If using Google Tag Manager:
1. **Enable Preview Mode**
2. **Navigate to tested pages**
3. **Verify tag firing and data layer values**

## 🔍 Google Tag Manager Integration (Optional)

### Setting up GTM Integration

#### Method 1: Using GTM Preview Mode
1. **Create Custom Event Trigger**
   - **Trigger name**: `abVariantInit Custom Event`
   - **Event name**: `abVariantInit`

2. **Create GA4 Event Tag**
   - **Tag name**: `GA4 - A/B Variant Tracking`
   - **Event name**: `abVariantInit` or custom name
   - **Event parameters:**
     ```json
     {
       "ab_test": "{{Event - ab_test}}",
       "ab_variant": "{{Event - ab_variant}}"
     }
     ```

#### Method 2: Data Layer Variables
Create data layer variables for custom dimensions:
```javascript
// Data Layer Variable: ab_test
var_name = ab_test

// Data Layer Variable: ab_variant
var_name = ab_variant
```

## 📊 Advanced Tracking Scenarios

### E-commerce Tracking
For enhanced e-commerce sites:
```javascript
// Automatic e-commerce enhancement
gtag('event', 'purchase', {
  transaction_id: '12345',
  value: 25.42,
  currency: 'USD',
  ab_test: 'checkout_flow',
  ab_variant: 'A'
});
```

### Custom Funnel Analysis
Track specific user journeys:
1. **Add event parameters to relevant events**
2. **Create custom conversions**
3. **Build exploration funnels**

### Multi-Session Tracking
For long-running experiments:
- **Use custom dimensions for persistent tracking**
- **Create segments based on ab_test parameters**
- **Analyze cross-session behavior**

## ❗ Troubleshooting

### Events Not Firing
**Checklist:**
1. Verify GA4 is properly installed and tracking page views
2. Check if A/B tests are active on current page
3. Enable debug mode in plugin settings
4. Check browser console for JavaScript errors

### Custom Dimensions Not Appearing
**Common Issues:**
1. Custom dimensions not configured in GA4 admin
2. Event parameters don't match dimension names
3. Data takes 24-48 hours to appear in GA4 reports
4. Sampling may affect small data sets

### Missing Data in GA4
**Solutions:**
1. Ensure GA4 event parameter names match exactly
2. Check real-time reports for immediate verification
3. Verify event parameter values are within limits
4. Use GA4 Debug View for real-time troubleshooting

## 📋 GA4 Setup Checklist

### Pre-Setup
- [ ] Google Analytics 4 property created
- [ ] GA4 tracking code installed on site
- [ ] WordPress plugin installed and activated
- [ ] A/B test configuration complete

### Configuration
- [ ] Enable GA4 tracking in plugin settings
- [ ] Set custom event name (default: abVariantInit)
- [ ] Configure any custom dimensions
- [ ] Save configuration

### Verification
- [ ] Check real-time GA4 events are firing
- [ ] Verify event parameters contain correct data
- [ ] Test both variants produce visual differences
- [ ] Confirm data populates in GA4 reports

### Advanced Setup
- [ ] Create custom dimensions in GA4
- [ ] Set up exploration reports
- [ ] Configure conversion tracking
- [ ] Create A/B testing dashboard

## ✨ Best Practices

### Event Naming
- Use consistent, descriptive event names
- Match event names across testing environments
- Document custom event names for team consistency

### Testing Strategy
- **Start with default settings** for quick validation
- **Use custom dimensions** once basic tracking works
- **Implement conversion tracking** for meaningful analysis
- **Test multiple pages** to validate implementation

### Data Retention
- **Wait 24-48 hours** for data to populate fully
- **Check real-time reports** immediately for verification
- **Use data sampling** considerations for low-traffic sites

## 🎯 Next Steps

After GA4 setup is complete:
1. **Set up conversion tracking** in GA4
2. **Create automated reports** using GA4 APIs
3. **Integrate with Google Optimize** for enhanced experimentation
4. **Set up alerts** for significant variant performance changes