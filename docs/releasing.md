# Releasing Cloudflare A/B Testing

Two ways to publish a new GitHub release with the ZIP asset attached.

Prereqs
- Ensure plugin version is updated in plugin/cloudflare-ab-testing.php (header and constant).
- Update CHANGELOG.md.
- Commit and push.

Option A: Tag push (recommended)
1. Create a tag following vX.Y.Z (example: v2.1.9).
2. Push the tag to GitHub.
3. GitHub Actions will build the ZIP, create (or update) the release, upload the asset, and mark it as “latest”.

Option B: Manual workflow
1. In GitHub, go to Actions → Release plugin → Run workflow.
2. Enter the version (e.g., 2.1.9).
3. The workflow checks out the repo, builds the ZIP, and creates/updates the release for that tag.

Notes
- The workflow validates the plugin header and constant match the version/tag.
- The asset name uploaded is releases/cloudflare-ab-testing-vX.Y.Z.zip.
- Pre-releases: include a hyphen in the version (e.g., 2.2.0-beta.1); the workflow marks it as a prerelease automatically.
- WordPress auto-updater uses the “latest” GitHub release and requires a .zip asset; this workflow ensures that.

