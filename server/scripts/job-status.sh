#!/bin/bash
# Heartbeat and alert for the host cron jobs. Source it, then:
#
#   job_ok   <job>              — record a success (read by GET /health → jobs)
#   job_fail <job> <message>    — e-mail ops now
#
# Why both. These jobs only wrote to /var/log/clube-*.log, which nobody reads:
# a backup that failed, or a crontab that stopped running altogether, looked
# exactly like one that worked. `job_fail` covers the first case at once; the
# heartbeat covers the second — /health reports a job whose last success is
# too old, and the external monitor (.github/workflows/uptime.yml) fails on it.
#
# Both are best-effort: a heartbeat that cannot be written must never turn a
# good backup into a failed job.

JOB_ENV_FILE="${JOB_ENV_FILE:-/opt/clube-geek-toys/server/.env}"
JOB_DB_CONTAINER="${JOB_DB_CONTAINER:-clube-geek-postgres}"

_job_env() {
  grep -E "^$1=" "$JOB_ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'"
}

job_ok() {
  local job="$1"
  [[ "$job" =~ ^[a-z_]+$ ]] || return 0
  docker exec "$JOB_DB_CONTAINER" sh -c \
    "psql -q -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\" -c \"INSERT INTO config (key, value) VALUES ('job_ok_${job}', to_jsonb(NOW()::text)) ON CONFLICT (key) DO UPDATE SET value = to_jsonb(NOW()::text), updated_at = NOW()\"" \
    >/dev/null 2>&1 || echo "[$(date)] WARNING: could not record heartbeat for ${job}" >&2
  return 0
}

job_fail() {
  local job="$1" message="$2"
  echo "[$(date)] ALERT ${job}: ${message}" >&2
  local key to from host
  key=$(_job_env RESEND_API_KEY)
  to=$(_job_env OPS_ALERT_EMAIL)
  [[ -n "$to" ]] || to=$(_job_env ADMIN_EMAIL)
  from=$(_job_env FROM_EMAIL)
  [[ -n "$from" ]] || from="Clube GeekPop & Toys <contato@geeketoys.com.br>"
  host=$(hostname)
  if [[ -z "$key" || -z "$to" ]]; then
    echo "[$(date)] WARNING: no RESEND_API_KEY/ADMIN_EMAIL — alert not e-mailed" >&2
    return 0
  fi
  local body
  body=$(python3 -c 'import json,sys; print(json.dumps({"from": sys.argv[1], "to": sys.argv[2], "subject": "[ALERTA] Tarefa da VPS falhou: " + sys.argv[3], "text": sys.argv[4]}))' \
    "$from" "$to" "$job" "Tarefa: ${job}
Máquina: ${host}
Quando: $(date)

${message}

Onde olhar: ssh na VPS → tail -50 /var/log/clube-*.log")
  curl -s --max-time 20 -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \
    -d "$body" >/dev/null 2>&1 || echo "[$(date)] WARNING: alert e-mail failed" >&2
  return 0
}
