#!/usr/bin/env bash

# Exit if any command fails
set -o errexit

# Optional: log current directory and files (for debug)
echo "Running render-build.sh"
pwd
ls -la

# Install dependencies cleanly
npm install

# If needed: build your SSL or other custom build steps
npm run build || echo "No build step found or failed gracefully"

echo "Build completed"