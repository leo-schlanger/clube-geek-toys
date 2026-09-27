#!/bin/bash
# Health Check + Alert Script
# Checks API health and sends email alert via Resend if down.
# Usage: Run via cron every 5 minutes.
#
# Required env vars (from server/.env):
#   RESEND_API_KEY, ADMIN_EMAIL
#
# crontab: */5 * * * * /bin/bash /opt/clube-geek-toys/server/scripts/health-check.sh >> /var/log/clube-health.log 2>&1

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
#
# Two guards against false alarms. Every deploy recreates the API, and a check
# landing in that minute used to email "[DOWN]" — 13 of the 14 alerts since
# April were deploys, which teaches the team to ignore the real one.
#  1. The deploy touches DEPLOY_MARKER; while it is fresh, a failure is not an
#     outage. The marker ages out on its own, so a deploy that dies halfway
#     still ends up alerting.
#  2. Only the second failure in a row alerts (>= 5 minutes down).
DEPLOY_MARKER="${DEPLOY_MARKER:-/opt/clube-geek-toys/.deploying}"
DEPLOY_GRACE_MIN="${DEPLOY_GRACE_MIN:-15}"
FAIL_COUNT_FILE="${STATE_FILE}.fails"
FAILS_BEFORE_ALERT="${FAILS_BEFORE_ALERT:-2}"

if check_health; then
  rm -f "$FAIL_COUNT_FILE"
  if [ -f "$STATE_FILE" ]; then
    # Was down (and alerted), now recovered
    DOWN_SINCE=$(cat "$STATE_FILE")
    rm -f "$STATE_FILE"
    send_alert \
      "[RECOVERED] Clube Geek API is back online" \
      "API recovered at $(date). Was down since $DOWN_SINCE. URL: $HEALTH_URL"
    echo "[$(date)] RECOVERED - API is back online"
  fi
  exit 0
fi

if [ -f "$DEPLOY_MARKER" ] && [ -n "$(find "$DEPLOY_MARKER" -mmin -"$DEPLOY_GRACE_MIN" 2>/dev/null)" ]; then
  echo "[$(date)] Health check failed during a deploy - not alerting"
  exit 0
fi

FAILS=$(( $(cat "$FAIL_COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$FAILS" > "$FAIL_COUNT_FILE"

if [ "$FAILS" -lt "$FAILS_BEFORE_ALERT" ]; then
  echo "[$(date)] Health check failed ($FAILS/$FAILS_BEFORE_ALERT) - waiting for the next check"
elif [ ! -f "$STATE_FILE" ]; then
  date > "$STATE_FILE"
  send_alert \
    "[DOWN] Clube Geek API is unreachable" \
    "API health check failed $FAILS times in a row, last at $(date). URL: $HEALTH_URL. Check: docker compose ps && docker compose logs api"
  echo "[$(date)] DOWN - Alert sent"
else
  echo "[$(date)] Still down (alert already sent)"
fi
