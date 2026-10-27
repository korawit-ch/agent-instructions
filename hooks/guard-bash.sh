#!/bin/bash
# PreToolUse (Bash): force a confirmation prompt before
#   - git commit/push (only when the current message asks),
#   - anything that reaches a staging or production environment, reads included (only when the
#     user's own message names that environment).
# Prints nothing (normal permission flow) when the command is not matched.
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

ask() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}
remote="Remote environment: staging/production is off-limits, reads included, unless the user's own message named it."

if printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|\s)git(\s+-C\s+\S+)?\s+(commit|push)(\s|$)'; then
  ask "Global rule: never commit or push unless the current message explicitly asks."
fi

# Postgres connection URLs and -h/--host flags pointing anywhere but this machine.
hosts=$(printf '%s' "$cmd" | grep -Eo 'postgres(ql)?://[^@/ ]*@[^:/ ?]+' | sed -E 's#.*@##'
  if printf '%s' "$cmd" | grep -Eiq '(psql|pg_dump|pg_restore|pg_dumpall)'; then
    printf '%s' "$cmd" | grep -Eo '(-h|--host[= ])\s*[^ ]+' | sed -E 's#^(-h|--host[= ])\s*##'
  fi)
for h in $hosts; do
  case "$h" in localhost|127.0.0.1|::1|0.0.0.0|db|postgres|host.docker.internal) ;; *) ask "$remote Command targets host '$h'." ;; esac
done

# Remote hosts, the env vars that hold remote connection strings, and environment switches.
if printf '%s' "$cmd" | grep -Eiq 'rds\.amazonaws\.com|\.supabase\.co|aurora|SUPABASE_DB_URL|ENVIRONMENT=["'"'"']?(PRODUCTION|STAGING)|--(env|environment)[= ](prod|production|staging)'; then
  ask "$remote Command mentions a remote database, connection variable or environment switch."
fi

# Cloud and server CLIs that act on real accounts (git's own SSH to github.com is fine).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|\s)(aws|eb|kubectl|flyctl|vercel|railway)\s' ||
  printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|\s)supabase\s+(db\s+(push|pull|dump|remote|reset\s+--linked)|link|secrets|functions\s+deploy|projects|migration\s+(up|repair)\s+--linked)' ||
  { printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|\s)(ssh|scp|sftp|rsync)\s' && ! printf '%s' "$cmd" | grep -Eq '(ssh\s+(-T\s+)?git@github\.com|ssh-keygen|ssh-add)'; }; then
  ask "$remote Command uses a cloud, deploy or server CLI."
fi
exit 0
