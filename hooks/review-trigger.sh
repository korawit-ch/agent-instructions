#!/bin/bash
# PostToolUse (Bash): after a draft PR is created, tell Claude to run the pre-pr-review skill now
# (review → post on the PR → fix + commit locally → draft replies → propose).
# Set PRE_PR_REVIEW_OWNERS (space-separated GitHub owners, e.g. "my-org other-org") to limit it to
# those owners' repos; unset, it runs for every draft PR. Prints nothing for any other command.
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
printf '%s' "$cmd" | grep -Eq '(^|[;&|(]|[[:space:]])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' || exit 0
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(--draft|-d)([[:space:]]|$)' || exit 0

# Which repo: an explicit --repo/-R, else the directory the command ran in (cwd, a leading `cd`).
owners=${PRE_PR_REVIEW_OWNERS:-}
if [ -n "$owners" ]; then
  match=""
  dir=$(printf '%s' "$input" | jq -r '.cwd // empty')
  c=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+"?([^"&;]+)"?[[:space:]]*(&&|;).*/\1/p' | sed -E 's/[[:space:]]+$//')
  case "$c" in "") ;; /*) dir=$c ;; "~"*) dir="$HOME${c#\~}" ;; *) dir="$dir/$c" ;; esac
  remotes=$(git -C "$dir" remote -v 2>/dev/null)
  for o in $owners; do
    printf '%s' "$cmd" | grep -Eq "(--repo|-R)[[:space:]=]+$o/" && match=1
    printf '%s' "$remotes" | grep -q "[:/]$o/" && match=1
  done
  [ -n "$match" ] || exit 0
fi

url=$(printf '%s' "$input" | jq -r '[.tool_response.stdout?, .tool_response.output?, (.tool_response|strings)] | map(select(. != null)) | join("\n")' 2>/dev/null |
  grep -Eo 'https://github\.com/[^/[:space:]]+/[^/[:space:]]+/pull/[0-9]+' | head -1)
msg="Draft PR created (${url:-see the gh output}). Run the pre-pr-review skill on it now, straight through without stopping for approval: review, then post the review on the PR, then fix and commit locally (do not push), then draft the thread replies (do not post them), then propose the fixes and replies to the user."
jq -n --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
