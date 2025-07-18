#!/bin/bash

# Sync script to copy plugin files to WordPress test site
# This solves the open_basedir restriction issue

echo "🔄 Syncing plugin files to WordPress test site..."

# Source and destination paths
SOURCE_DIR="/Users/kim/Documents/MyFiles/BoilerplateH/cloudflare-ab-testing/plugin"
DEST_DIR="/Users/kim/Documents/MyFiles/BoilerplateH/cloudflare-ab-testing/wordpress/wp-content/plugins/cloudflare-ab-testing"

# Remove existing destination directory
echo "🗑️  Removing existing plugin directory..."
rm -rf "$DEST_DIR"

# Copy plugin files
echo "📁 Copying plugin files..."
cp -r "$SOURCE_DIR" "$DEST_DIR"

# Check if copy was successful
if [ $? -eq 0 ]; then
    echo "✅ Plugin files synced successfully!"
    echo "📂 Files copied to: $DEST_DIR"
    echo ""
    echo "📝 To sync changes after editing:"
    echo "   Run: ./sync-to-wordpress.sh"
    echo ""
    echo "🚀 You can now test the plugin in WordPress!"
else
    echo "❌ Failed to sync plugin files"
    exit 1
fi