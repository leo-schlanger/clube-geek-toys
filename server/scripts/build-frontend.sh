#!/bin/bash
# Build frontend and copy to Docker volume
set -e

echo "Building frontend..."
cd "$(dirname "$0")/../.."
npm run build

echo "Copying dist to nginx volume..."
# For local dev: copy to dist folder served by nginx
# For production: copy to Docker volume
if [ -d "server/nginx/html" ]; then
  rm -rf server/nginx/html/*
  cp -r dist/* server/nginx/html/
else
  mkdir -p server/nginx/html
  cp -r dist/* server/nginx/html/
fi

echo "Frontend build complete!"
