#!/bin/bash
# Health Check + Alert Script
# Checks API health and sends email alert via Resend if down.
# Usage: Run via cron every 5 minutes.
#
# Required env vars (from server/.env):
#   RESEND_API_KEY, ADMIN_EMAIL
#
# crontab: */5 * * * * cd /opt/clube-geek-toys/server && ./scripts/health-check.sh >> /var/log/clube-health.log 2>&1

set -uo pipefail

HEALTH_URL="${HEALTH_URL:-https://api.geeketoys.com.br/health}"
STATE_FILE="/tmp/clube-health-state"
TIMEOUT=10

# Load env vars from server/.env if available
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^(RESEND_API_KEY|ADMIN_EMAIL)=' "$ENV_FILE" | xargs)
fi

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@geeketoys.com.br}"

check_health() {
  local response
  response=$(curl -sf --max-time "$TIMEOUT" "$HEALTH_URL" 2>/dev/null)
  if [ $? -eq 0 ] && echo "$response" | grep -q '"status":"ok"'; then
    return 0
  fi
  return 1
}

send_alert() {
  local subject="$1"
  local body="$2"

  if [ -z "${RESEND_API_KEY:-}" ]; then
    echo "[$(date)] ALERT (no email configured): $subject - $body"
    return
  fi

  curl -s -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"Monitor <contato@geeketoys.com.br>\",
      \"to\": [\"$ADMIN_EMAIL\"],
      \"subject\": \"$subject\",
      \"text\": \"$body\"
    }" > /dev/null 2>&1

  echo "[$(date)] Alert email sent: $subject"
}

# Main logic
if check_health; then
  # API is UP
  if [ -f "$STATE_FILE" ]; then
    # Was down, now recovered
    DOWN_SINCE=$(cat "$STATE_FILE")
    rm -f "$STATE_FILE"
    send_alert \
      "[RECOVERED] Clube Geek API is back online" \
      "API recovered at $(date). Was down since $DOWN_SINCE. URL: $HEALTH_URL"
    echo "[$(date)] RECOVERED - API is back online"
  fi
else
  # API is DOWN
  if [ ! -f "$STATE_FILE" ]; then
    # First failure - record and alert
    date > "$STATE_FILE"
    send_alert \
      "[DOWN] Clube Geek API is unreachable" \
      "API health check failed at $(date). URL: $HEALTH_URL. Check: docker compose ps && docker compose logs api"
    echo "[$(date)] DOWN - Alert sent"
  else
    echo "[$(date)] Still down (alert already sent)"
  fi
fi
