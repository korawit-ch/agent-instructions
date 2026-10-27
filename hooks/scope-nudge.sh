#!/bin/bash
# UserPromptSubmit: when a message carries two or more ticket/thread links (ClickUp, Slack, GitHub
# PRs/issues, Linear, Jira, Notion), remind Claude to pin which one defines the job before editing.
# Prints nothing otherwise.
prompt=$(jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

n=$(printf '%s' "$prompt" | grep -oE 'https?://[^[:space:])>]+' |
  grep -cE 'app\.clickup\.com/t/|\.slack\.com/archives/|github\.com/[^/]+/[^/]+/(pull|issues)/[0-9]+|linear\.app/|atlassian\.net/browse/|notion\.so/')
[ "$n" -ge 2 ] || exit 0

jq -n --arg c "This message links $n tickets/threads. Per the Scope rule: before editing, decide which one defines the job and which are context only. Unless the message already says so, ask me in one question (e.g. \"Fix what the Slack message reports and use the tickets as background?\"). Investigating and reading all of them is fine." \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
