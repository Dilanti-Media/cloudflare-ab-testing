#!/bin/bash

# Cloudflare A/B Testing Plugin Build Script
# Creates a clean plugin zip for distribution

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_DIR="$ROOT_DIR/plugin"
BUILD_DIR="$ROOT_DIR/build"
RELEASES_DIR="$ROOT_DIR/releases"

echo -e "${YELLOW}Building Cloudflare A/B Testing Plugin...${NC}"

# Check if plugin directory exists
if [ ! -d "$PLUGIN_DIR" ]; then
    echo -e "${RED}Error: Plugin directory not found at $PLUGIN_DIR${NC}"
    exit 1
fi

# Get version from plugin file
VERSION=$(grep "Version:" "$PLUGIN_DIR/cloudflare-ab-testing.php" | head -1 | awk -F': *' '{print $2}' | tr -d ' ')
if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Could not extract version from plugin file${NC}"
    exit 1
fi

echo -e "${GREEN}Plugin version: $VERSION${NC}"

# Create build directories
mkdir -p "$BUILD_DIR"
mkdir -p "$RELEASES_DIR"

# Clean build directory
rm -rf "$BUILD_DIR/cloudflare-ab-testing"

# Copy plugin files
echo -e "${YELLOW}Copying plugin files...${NC}"
cp -r "$PLUGIN_DIR" "$BUILD_DIR/cloudflare-ab-testing"

# Remove development files from build
echo -e "${YELLOW}Cleaning development files...${NC}"
find "$BUILD_DIR/cloudflare-ab-testing" -name "*.log" -delete
find "$BUILD_DIR/cloudflare-ab-testing" -name ".DS_Store" -delete
find "$BUILD_DIR/cloudflare-ab-testing" -name "Thumbs.db" -delete

# Create WordPress readme.txt if it doesn't exist
if [ ! -f "$BUILD_DIR/cloudflare-ab-testing/readme.txt" ]; then
    echo -e "${YELLOW}Creating WordPress readme.txt...${NC}"
    cat > "$BUILD_DIR/cloudflare-ab-testing/readme.txt" << 'EOF'
=== Cloudflare A/B Testing ===
Contributors: dilantimedia
Tags: ab-testing, cloudflare, workers, performance, optimization
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: trunk
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Advanced A/B testing plugin using Cloudflare Workers with multi-layer caching and performance optimizations.

== Description ==

The Cloudflare A/B Testing plugin provides comprehensive A/B testing capabilities using Cloudflare Workers. It features automatic worker deployment, domain auto-detection, and advanced caching optimizations.

= Features =

* Automatic Worker Deployment
* Two Worker Versions (Full & Simple)
* Domain Auto-Detection
* Advanced Multi-layer Caching
* Real-time Status Monitoring
* Security Best Practices

= Requirements =

* Cloudflare account with Workers enabled
* Valid Cloudflare API token
* WordPress 5.0+
* PHP 7.4+

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/cloudflare-ab-testing/`
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Configure your Cloudflare credentials in A/B Tests → Settings
4. Deploy workers and configure tests

== Changelog ==

= 1.0.0 =
* Initial release
* Advanced worker deployment system
* Multi-layer caching optimizations
* Security enhancements
EOF
fi

# Create zip file
PLUGIN_ZIP="cloudflare-ab-testing-v$VERSION.zip"
echo -e "${YELLOW}Creating zip file: $PLUGIN_ZIP${NC}"

cd "$BUILD_DIR"
zip -r "$RELEASES_DIR/$PLUGIN_ZIP" cloudflare-ab-testing/ -q

# Calculate file size
SIZE=$(ls -lh "$RELEASES_DIR/$PLUGIN_ZIP" | awk '{print $5}')

echo -e "${GREEN}✓ Plugin built successfully!${NC}"
echo -e "${GREEN}  File: $RELEASES_DIR/$PLUGIN_ZIP${NC}"
echo -e "${GREEN}  Size: $SIZE${NC}"
echo -e "${GREEN}  Version: $VERSION${NC}"

# Create latest symlink
cd "$RELEASES_DIR"
ln -sf "$PLUGIN_ZIP" "cloudflare-ab-testing-latest.zip"

echo -e "${GREEN}✓ Latest symlink created${NC}"

# Clean up build directory
rm -rf "$BUILD_DIR"

echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo -e "${YELLOW}Installation instructions:${NC}"
echo -e "1. Download: $RELEASES_DIR/$PLUGIN_ZIP"
echo -e "2. Extract to: wp-content/plugins/"
echo -e "3. Activate in WordPress admin"