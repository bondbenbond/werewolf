#!/bin/sh
set -eu

cat > /usr/share/nginx/html/env.js <<EOF
window.__ENV__ = {
  SERVER_URL: "${SERVER_URL:-}",
};
EOF
