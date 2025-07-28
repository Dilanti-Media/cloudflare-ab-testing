#!/bin/bash

# Version Sync Script
# Ensures plugin version and GitHub releases are properly synchronized

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_FILE="$ROOT_DIR/plugin/cloudflare-ab-testing.php"
RELEASES_DIR="$ROOT_DIR/releases"

echo -e "${BLUE}=== Version Sync Checker ===${NC}"

# Check if plugin file exists
if [ ! -f "$PLUGIN_FILE" ]; then
    echo -e "${RED}Error: Plugin file not found at $PLUGIN_FILE${NC}"
    exit 1
fi

# Get current version from plugin file
PLUGIN_VERSION=$(grep "Version:" "$PLUGIN_FILE" | head -1 | awk -F': *' '{print $2}' | tr -d ' ')
DEFINE_VERSION=$(grep "define.*CLOUDFLARE_AB_TESTING_VERSION" "$PLUGIN_FILE" | sed "s/.*'\([^']*\)'.*/\1/")

echo -e "${YELLOW}Current plugin version: ${GREEN}$PLUGIN_VERSION${NC}"
echo -e "${YELLOW}Define constant version: ${GREEN}$DEFINE_VERSION${NC}"

# Check if versions match in plugin file
if [ "$PLUGIN_VERSION" != "$DEFINE_VERSION" ]; then
    echo -e "${RED}❌ Version mismatch in plugin file!${NC}"
    echo -e "   Plugin header: $PLUGIN_VERSION"
    echo -e "   Define constant: $DEFINE_VERSION"
    echo -e "${YELLOW}Fix this by updating both to the same version${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Plugin file versions are consistent${NC}"
fi

# Check existing releases
if [ -d "$RELEASES_DIR" ]; then
    echo -e "\n${YELLOW}Existing releases:${NC}"
    ls -1 "$RELEASES_DIR"/*.zip 2>/dev/null | while read -r file; do
        if [[ "$file" != *"latest"* ]]; then
            basename "$file"
        fi
    done | sort -V

    # Check if current version has a release
    EXPECTED_RELEASE="$RELEASES_DIR/cloudflare-ab-testing-v$PLUGIN_VERSION.zip"
    if [ -f "$EXPECTED_RELEASE" ]; then
        echo -e "${GREEN}✓ Release exists for current version: v$PLUGIN_VERSION${NC}"
    else
        echo -e "${YELLOW}⚠️  No release found for current version: v$PLUGIN_VERSION${NC}"
        echo -e "${BLUE}Run './scripts/build-plugin.sh' to create a new release${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No releases directory found${NC}"
fi

# Function to update version
update_version() {
    local new_version="$1"

    echo -e "\n${YELLOW}Updating plugin to version $new_version...${NC}"

    # Update plugin header
    sed -i.bak "s/Version: *[0-9.]\+/Version:           $new_version/" "$PLUGIN_FILE"

    # Update define constant
    sed -i.bak "s/define( 'CLOUDFLARE_AB_TESTING_VERSION', '[^']*' );/define( 'CLOUDFLARE_AB_TESTING_VERSION', '$new_version' );/" "$PLUGIN_FILE"

    # Remove backup file
    rm -f "$PLUGIN_FILE.bak"

    echo -e "${GREEN}✓ Plugin updated to version $new_version${NC}"
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "1. Run ${GREEN}./scripts/build-plugin.sh${NC} to create release"
    echo -e "2. Create GitHub release with tag ${GREEN}v$new_version${NC}"
    echo -e "3. Upload the generated ZIP file to GitHub release"
}

# Command line options
case "${1:-}" in
    "update")
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a version${NC}"
            echo -e "Usage: $0 update 1.4.0"
            exit 1
        fi
        update_version "$2"
        ;;
    "check")
        echo -e "\n${GREEN}Version check complete!${NC}"
        ;;
    *)
        echo -e "\n${BLUE}Usage:${NC}"
        echo -e "  $0 check           - Check version consistency"
        echo -e "  $0 update 1.4.0    - Update plugin to new version"
        echo -e "\n${BLUE}Current status: ${GREEN}Plugin v$PLUGIN_VERSION${NC}"
        ;;
esac
