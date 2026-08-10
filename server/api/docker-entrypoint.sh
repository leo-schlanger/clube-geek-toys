#!/bin/sh
# Ensure upload dirs exist and are writable by the node user (uid 1000).
# Named Docker volumes often mount as root:root — without this, product image
# uploads fail with EACCES on /app/uploads/products.
set -e
mkdir -p /app/uploads/products /app/uploads/contracts /app/uploads/photos
# May fail if volume is read-only; ignore non-fatal
chown -R node:node /app/uploads 2>/dev/null || true
chmod -R u+rwX /app/uploads 2>/dev/null || true
exec su-exec node "$@"
