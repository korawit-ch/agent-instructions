#!/bin/bash
# The 🌿 Git box for replies (Response layout, right above ⏭️ Next), one line per repo or worktree:
#   > 🌿 **Git:** `my-app-wt2` on `feat/x` · unpushed:3 · staged:0 · unstaged:4 · untracked:1
# unpushed counts commits on HEAD that no remote branch has; staged/unstaged/untracked count files.
# behind, conflicts and a rebase/merge in progress show only when present.
# Usage: git-tag.sh [path...]   (default: the current directory)
# As a UserPromptSubmit hook (git-tag.sh --hook): measures the session's folder at prompt time and
# reminds Claude to add the box.

script="~/agent-instructions/hooks/git-tag.sh"

line() {
  local top status branch counts unpushed behind op gd
  if ! top=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null); then
    printf '> 🌿 **Git:** `%s` is not a git repo\n' "$1"
    return
  fi
  # Optional locks off, so this never takes the index lock from the user's own git tools.
  status=$(GIT_OPTIONAL_LOCKS=0 git -C "$top" status --porcelain=v2 --branch --untracked-files=all)
  branch=$(printf '%s\n' "$status" | awk '$1 == "#" && $2 == "branch.head" { print $3 }')
  [ "$branch" = "(detached)" ] && branch="detached at $(git -C "$top" rev-parse --short HEAD)"
  # Porcelain v2: "1"/"2" lines carry XY (X = index, Y = worktree, "." = unchanged),
  # "u" lines are unmerged files, "?" lines untracked files.
  counts=$(printf '%s\n' "$status" | awk '
    $1 == "1" || $1 == "2" { if (substr($2, 1, 1) != ".") s++; if (substr($2, 2, 1) != ".") u++ }
    $1 == "u" { c++ }
    $1 == "?" { t++ }
    $1 == "#" && $2 == "branch.upstream" { up = 1 }
    $1 == "#" && $2 == "branch.ab" { ab = 1; b = substr($4, 2) }
    END { printf "%d %d %d %d %d %d", s, u, t, c, b, (up && !ab) }')
  set -- $counts
  if [ -z "$(git -C "$top" remote)" ]; then
    unpushed="no remote"
  else
    unpushed="unpushed:$(git -C "$top" rev-list --count HEAD --not --remotes 2>/dev/null || echo 0)"
  fi
  behind=""
  [ "$5" -gt 0 ] && behind=" · behind:$5"
  # An upstream with no ahead/behind line was deleted on the remote (usually merged).
  [ "$6" -eq 1 ] && behind=" · upstream gone"
  op=""
  gd=$(git -C "$top" rev-parse --absolute-git-dir)
  if [ -d "$gd/rebase-merge" ] || [ -d "$gd/rebase-apply" ]; then op=" · ⚠️ rebasing"
  elif [ -f "$gd/MERGE_HEAD" ]; then op=" · ⚠️ merging"
  elif [ -f "$gd/CHERRY_PICK_HEAD" ]; then op=" · ⚠️ cherry-picking"
  elif [ -f "$gd/REVERT_HEAD" ]; then op=" · ⚠️ reverting"
  fi
  [ "$4" -gt 0 ] && op="$op · ⚠️ conflicts:$4"
  printf '> 🌿 **Git:** `%s` on `%s` · %s%s · staged:%s · unstaged:%s · untracked:%s%s\n' \
    "$(basename "$top")" "$branch" "$unpushed" "$behind" "$1" "$2" "$3" "$op"
}

if [ "$1" = "--hook" ]; then
  cwd=$(jq -r '.cwd // empty')
  [ -n "$cwd" ] || exit 0
  if git -C "$cwd" rev-parse --show-toplevel >/dev/null 2>&1; then
    msg="Git box: at prompt time this session's worktree is
$(line "$cwd")
Put the 🌿 Git box right above ⏭️ Next in your reply (Response layout). Reuse the line above only if nothing in git changed during this turn (no edits, staging, commits, pushes, pulls or branch switches); otherwise run \`$script <path>...\` as your last tool call and paste its output. Add a line for each other repo or worktree this session works in."
  else
    msg="Git box: this session's folder ($cwd) is not a git repo. Put the 🌿 Git box right above ⏭️ Next in your reply (Response layout): when this session works in repos or worktrees, run \`$script <path>...\` for them as your last tool call and paste its output; otherwise write \`> 🌿 **Git:** no repo in use\`."
  fi
  jq -n --arg c "$msg" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
  exit 0
fi

[ $# -eq 0 ] && set -- .
first=1
for p in "$@"; do
  # A blank line between lines keeps each one its own quoted box in Markdown.
  [ $first -eq 1 ] || echo
  first=0
  line "$p"
done
