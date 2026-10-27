#!/bin/bash
# Keeps Claude desktop session titles in the agreed shape.
#   Parent (never forked, or detached): "<repos>[:<stories>][ ➔ #<PRs>] | <title>",
#     e.g. "W:DEV-1234 ➔ #132 | ...", "W,A ➔ #132,100 | ...", "G | ..." until the repo is known.
#   Set SESSION_TITLE_REPOS to your own repo letters, e.g. "W Web, A API, M Mobile".
#   Fork: "(<topic>) <root parent's current title>"; a fresh "(fork)" asks the user for the topic first.
# UserPromptSubmit: tells Claude what to check this turn.
# Stop: blocks the end of a turn once while the title is still out of shape.
# Reads the desktop app's own session record (title, fork lineage).
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // "UserPromptSubmit"')
sid=$(printf '%s' "$input" | jq -r '.session_id // empty')
[ -z "$sid" ] && exit 0
# A prompt that is just "Done" marks the session finished: its title gets a leading "✅ ".
# A prompt that is just "Close" marks it closed without finishing: a leading "❎ ".
# Any other prompt reopens it, so the mark comes off. Stop can't see the prompt, so the
# UserPromptSubmit run records the verdict for the Stop run of the same turn.
state="${TMPDIR:-/tmp}/session-title-$sid.done"
if [ "$event" = Stop ]; then
  said=$(cat "$state" 2>/dev/null || echo no)
else
  said=no
  word=$(printf '%s' "$input" | jq -r '.prompt // ""' | tr -d '[:space:]')
  printf '%s' "$word" | grep -qiE '^done[.!]*$' && said=done
  printf '%s' "$word" | grep -qiE '^close[.!]*$' && said=close
  printf '%s' "$said" > "$state"
fi
# The mark this turn's prompt asks for ("yes" is the verdict an older version of this hook wrote).
case "$said" in
  done|yes) mark="✅ "; said_word=Done ;;
  close) mark="❎ "; said_word=Close ;;
  *) mark=""; said_word="" ;;
esac

rename='Rename with mcp__ccd_session_mgmt__set_session_title (session_id "self").'
repos=${SESSION_TITLE_REPOS:-W Web, A API, M Mobile}
rule="Parent session titles are \"<repos>[:<stories>][ ➔ #<PRs>] | <3-6 word title>\": repos are one letter each, comma-separated ($repos, G general or not yet known; another repo gets its first letter); stories are ticket ids, the first in full and the rest as numbers (DEV-1234,1235); PRs are numbers in the same order as the repos (#132,100). Leave out \":<stories>\" when no story is known and \" ➔ #<PRs>\" when there is no PR yet. E.g. \"W:DEV-1234 ➔ #132 | Local DB setup\", \"W,A,M:DEV-1234,1235,1236 ➔ #132,133,134 | ...\", \"A | Login bug fixes\", \"G | Weekly planning\". Forks are titled \"(<2-5 word topic>) <root parent title>\"."
# A parent title in the agreed shape, optionally marked "✅ " (the user said "Done") or "❎ " ("Close").
shape='^((✅|❎) )?[A-Z](,[A-Z])*(:[A-Z][A-Z0-9]*-[0-9]+(,[0-9]+)*)?( ➔ #[0-9]+(,[0-9]+)*)? \| .+'

# The mark a title starts with ("✅ ", "❎ " or nothing), and what it means.
mark_of() {
  case "$1" in "✅ "*) printf '✅ ' ;; "❎ "*) printf '❎ ' ;; esac
}
mark_word() {
  case "$1" in "✅ ") printf finished ;; "❎ ") printf closed ;; esac
}

say() {
  jq -n --arg c "$1" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
  exit 0
}
block() {
  jq -n --arg r "Session title check: $1" '{decision: "block", reason: $r}'
  exit 0
}

# A second Stop in the same turn always passes, so a declined or failed rename can't loop.
if [ "$event" = Stop ] && [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = true ]; then
  exit 0
fi

dir="$HOME/Library/Application Support/Claude/claude-code-sessions"
meta=""
if [ -d "$dir" ]; then
  while IFS= read -r f; do
    if jq -e --arg sid "$sid" '.cliSessionId == $sid' "$f" >/dev/null 2>&1; then meta=$f; break; fi
  done < <(grep -rlF --include='local_*.json' "$sid" "$dir" 2>/dev/null)
fi

# The app saves a new session's record lazily, so it is often missing on the first prompt.
if [ -z "$meta" ]; then
  [ "$event" = Stop ] && exit 0
  say "Before ending your reply, read this session's title with mcp__ccd_session_mgmt__get_session (session_id \"self\") and make it follow the naming rule. $rule A session with parentSessionId set is a fork (title it \"(<topic>) <root parent title>\"); otherwise it is a parent, and an unprefixed or auto-generated title gets \"G | \" in front (the real repo/story/PR prefix if this turn shows one). $rename"
fi

title=$(jq -r '.title // ""' "$meta")
is_fork=$(jq -r 'if .forkedFromSessionId != null and (.lineageDetached // false) != true then "yes" else "no" end' "$meta")

if [ "$is_fork" = yes ]; then
  # Walk up to the root parent: the first ancestor that was never forked or has been detached.
  base=""
  cur=$meta
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pid=$(jq -r '.forkedFromSessionId // empty' "$cur")
    [ -n "$pid" ] || break
    cur=$(ls "$dir"/*/*/"$pid".json 2>/dev/null | head -n 1)
    [ -n "$cur" ] || break
    if jq -e '.forkedFromSessionId == null or (.lineageDetached // false) == true' "$cur" >/dev/null; then
      base=$(jq -r '.title // ""' "$cur")
      break
    fi
  done
  [ -n "$base" ] || exit 0
  # A fork carries its own mark; the root parent's mark is not part of the fork's base title.
  base=${base#"$(mark_of "$base")"}
  had=$(mark_of "$title")
  title=${title#"$had"}
  # The mark follows this turn's prompt: ✅ for "Done", ❎ for "Close", none for anything else.
  if [ "$had" != "$mark" ]; then
    case "$title" in "("?*") $base")
      if [ -n "$mark" ]; then
        fix="The user said \"$said_word\": this fork is $(mark_word "$mark"). Rename it to \"$mark$title\". $rename"
      else
        fix="The user continued this $(mark_word "$had") fork, so it is open again: remove the ${had% } by renaming it to \"$title\". $rename"
      fi
      [ "$event" = Stop ] && block "$fix"
      say "$fix Do this before ending your reply." ;;
    esac
  fi
  topic_rule="the topic is 2-5 words, with PR refs like Web#129 or API#95,98 where known. $rename"
  case "$title" in
    *" (fork)")
      [ "$event" = Stop ] && block "this fork is still titled \"$title\". Ask the user what it is about (AskUserQuestion), then rename it to \"$mark(<topic>) $base\"; $topic_rule"
      say "This session is a fork still titled \"$title\". Before working on the request, use AskUserQuestion to ask the user what this fork is about, offering 1-2 short topics drawn from their message. Then rename this session to \"$mark(<topic>) $base\" and continue with the request; $topic_rule" ;;
    "(fork: "*)
      topic=$(printf '%s' "$title" | sed -nE 's/^\(fork: ([^()]*)\).*/\1/p')
      [ "$event" = Stop ] && block "rename this fork to \"$mark($topic) $base\"; $topic_rule"
      say "Fork title: \"$title\" uses the old \"(fork: ...)\" format. Before ending your reply, rename it to \"$mark($topic) $base\", adjusting the topic if this turn changed it; $topic_rule" ;;
    "("?*") $base")
      [ "$event" = Stop ] && exit 0
      say "Fork title: \"$mark$title\" (this fork's topic in the leading parentheses, then the root parent's title). Before ending your reply, if this turn's prompt or your answer shows the topic has shifted, widened, or gained a PR number, update only that topic; otherwise leave the title alone. $topic_rule" ;;
    "("*")"*)
      topic=$(printf '%s' "$title" | sed -nE 's/^\(([^()]*)\).*/\1/p')
      [ "$event" = Stop ] && block "this fork's title doesn't end with its root parent's current title; rename it to \"$mark($topic) $base\"; $topic_rule"
      say "Fork title: \"$title\" doesn't end with its root parent's current title. Before ending your reply, rename it to \"$mark($topic) $base\", adjusting the topic if this turn changed it; $topic_rule" ;;
    *")")
      topic=$(printf '%s' "$title" | sed -nE 's/.*\(([^()]*)\)$/\1/p')
      [ "$event" = Stop ] && block "rename this fork to \"$mark($topic) $base\"; $topic_rule"
      say "Fork title: \"$title\" uses the old topic-at-the-end format. Before ending your reply, rename it to \"$mark($topic) $base\", adjusting the topic if this turn changed it; $topic_rule" ;;
    *)
      [ "$event" = Stop ] && block "this fork has no topic; rename it to \"$mark(<topic>) $base\", taking the topic from this fork's conversation; $topic_rule"
      say "This fork's title \"$title\" has no topic. Before ending your reply, rename it to \"$mark(<topic>) $base\", taking the topic from this fork's conversation; $topic_rule" ;;
  esac
fi

had=$(mark_of "$title")
bare=${title#"$had"}
if [ -z "$mark" ] && [ -n "$had" ]; then
  fix="The user continued a $(mark_word "$had") session, so it is open again: remove the ${had% } by renaming it to \"$bare\" (and update the rest of the title if the scope changed). Leave its forks' own marks alone. $rename"
  [ "$event" = Stop ] && block "$fix"
  say "$fix Do this before ending your reply."
elif [ -n "$mark" ] && [ -n "$title" ] && [ "$had" != "$mark" ]; then
  [ "$event" = Stop ] && block "the user said \"$said_word\", but the title doesn't start with ${mark% }; rename it to \"$mark$bare\". $rename"
  say "The user said \"$said_word\": this session is $(mark_word "$mark"). Before ending your reply, rename it to \"$mark$bare\" (fixing the rest of the title first if it isn't in the agreed shape), but leave its forks alone: a fork's title ends with the parent title without the mark, and a fork gets its own ✅ or ❎ only when the user says \"Done\" or \"Close\" in that fork. $rename"
elif printf '%s' "$title" | grep -qE "$shape"; then
  [ "$event" = Stop ] && exit 0
  say "Session title: \"$title\". $rule The title covers the session's whole current scope, not just its first prompt. Before ending your reply, update the prefix if this turn identified a repo, story id or PR number it lacks (or replaces G), and rewrite the title text if the work has shifted or widened beyond it; otherwise leave the title alone. Keep a leading \"✅ \" or \"❎ \" when renaming. When you rename it, also rename every fork whose title ends with the old title (find them with mcp__ccd_session_mgmt__list_sessions) to \"(<its topic>) <new title without a leading ✅ or ❎>\", keeping each fork's own leading mark. $rename"
elif [ -z "$title" ]; then
  [ "$event" = Stop ] && block "this session has no title; title it \"G | <3-6 word topic>\" (the real repo/story/PR prefix if the conversation shows one). $rename"
  say "This session has no title yet. $rule Before ending your reply, title it \"G | <3-6 word topic>\", using the real repo/story/PR prefix if this turn already shows one. $rename"
else
  [ "$event" = Stop ] && block "\"$title\" isn't in the \"<repos>[:<stories>][ ➔ #<PRs>] | <title>\" shape; rename it, converting any old [Project#refs] prefix (\"G | \" if no repo is known). $rename"
  say "Session title: \"$title\" isn't in the agreed shape. $rule Before ending your reply, rename it: convert an old \"[Web#132,API#100] x\" prefix to \"W,A ➔ #132,100 | x\", and put \"G | \" in front of an unprefixed title unless this turn shows the real repo/story/PR. $rename"
fi
