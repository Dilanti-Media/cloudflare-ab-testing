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
DEFINE_VERSION=$(grep "define.*CLOUDFLARE_AB_TESTING_VERSION" "$PLUGIN_DIR/cloudflare-ab-testing.php" | sed "s/.*'\([^']*\)'.*/\1/")

if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Could not extract version from plugin file${NC}"
    exit 1
fi

# Check version consistency
if [ "$VERSION" != "$DEFINE_VERSION" ]; then
    echo -e "${RED}Error: Version mismatch in plugin file!${NC}"
    echo -e "   Plugin header: $VERSION"
    echo -e "   Define constant: $DEFINE_VERSION"
    echo -e "${YELLOW}Run './scripts/version-sync.sh check' to fix this${NC}"
    exit 1
fi

echo -e "${GREEN}Plugin version: $VERSION${NC}"

# Check if this version already has a release
EXISTING_RELEASE="$RELEASES_DIR/cloudflare-ab-testing-v$VERSION.zip"
if [ -f "$EXISTING_RELEASE" ]; then
    echo -e "${YELLOW}⚠️  Release already exists for version $VERSION${NC}"
    read -p "Do you want to rebuild it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Build cancelled${NC}"
        exit 0
    fi
fi

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

# Update readme.txt with current version
if [ -f "$BUILD_DIR/cloudflare-ab-testing/readme.txt" ]; then
    echo -e "${YELLOW}Updating readme.txt version...${NC}"
    sed -i.bak "s/Stable tag: .*/Stable tag: $VERSION/" "$BUILD_DIR/cloudflare-ab-testing/readme.txt"
    rm -f "$BUILD_DIR/cloudflare-ab-testing/readme.txt.bak"
fi

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
echo -e "${YELLOW}Creating zip file...${NC}"
cd "$BUILD_DIR"
ZIP_NAME="cloudflare-ab-testing.zip"
VERSIONED_ZIP_NAME="cloudflare-ab-testing-v$VERSION.zip"
zip -r "$ZIP_NAME" cloudflare-ab-testing -x "*.git*" "*.svn*" "node_modules/*"

# Move to releases directory and create versioned copy
mv "$ZIP_NAME" "$RELEASES_DIR/$VERSIONED_ZIP_NAME"
cp "$RELEASES_DIR/$VERSIONED_ZIP_NAME" "$RELEASES_DIR/$ZIP_NAME"

# Create latest symlink for easy access
cd "$RELEASES_DIR"
rm -f cloudflare-ab-testing-latest.zip
ln -s "$VERSIONED_ZIP_NAME" cloudflare-ab-testing-latest.zip

echo -e "${GREEN}✓ Plugin built successfully!${NC}"
echo -e "${GREEN}✓ WordPress-compatible: $RELEASES_DIR/$ZIP_NAME${NC}"
echo -e "${GREEN}✓ Versioned release: $RELEASES_DIR/$VERSIONED_ZIP_NAME${NC}"
echo -e "${GREEN}✓ Latest symlink: $RELEASES_DIR/cloudflare-ab-testing-latest.zip${NC}"

# Cleanup
rm -rf "$BUILD_DIR/cloudflare-ab-testing"

# GitHub Release Instructions
echo -e "\n${YELLOW}=== GitHub Release Instructions ===${NC}"
echo -e "1. Create a new release on GitHub with tag: ${GREEN}v$VERSION${NC}"
echo -e "2. Upload the versioned zip file: ${GREEN}$RELEASES_DIR/$VERSIONED_ZIP_NAME${NC}"
echo -e "3. Add release notes describing changes in this version"
echo -e "4. Set as the latest release for auto-updater compatibility"
echo -e "\n${YELLOW}=== WordPress Update Instructions ===${NC}"
echo -e "• For WordPress admin updates, use: ${GREEN}$RELEASES_DIR/$ZIP_NAME${NC}"
echo -e "• This filename ensures correct folder extraction in WordPress"
echo -e "\n${YELLOW}=== Auto-updater Configuration ===${NC}"
echo -e "Users need to configure these settings in WordPress admin:"
echo -e "• GitHub Username: ${GREEN}[your-github-username]${NC}"
echo -e "• GitHub Repository: ${GREEN}[your-repo-name]${NC}"
echo -e "• GitHub Token: ${GREEN}[optional-for-private-repos]${NC}"

echo -e "\n${GREEN}Build complete!${NC}"
echo ""
echo -e "${YELLOW}Installation instructions:${NC}"
echo -e "1. Download: $RELEASES_DIR/$PLUGIN_ZIP"
echo -e "2. Extract to: wp-content/plugins/"
echo -e "3. Activate in WordPress admin"