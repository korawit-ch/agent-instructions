#!/bin/bash
# Sync ENGINEERING.md (shared core) + your personal overlay to Codex's copy, check the shared core
# for personal details, check optional ChatGPT copies, and regenerate the cloud setup script.
#   exit 0  synced and checked
#   exit 1  stopped: master looks wrong, or Codex's copy was edited (diff printed)
# Paths (override with environment variables):
#   AGENT_INSTRUCTIONS_DIR      the instructions repo           (default ~/agent-instructions)
#   AGENT_INSTRUCTIONS_OVERLAY  your personal overlay           (default ~/agent-instructions-personal.md)
#   AGENT_INSTRUCTIONS_STATE    leak patterns, last Codex copy, ChatGPT copies, cloud script, stamps
#                               (default ~/.agent-instructions; keep it out of any public repo)
set -u
R="${AGENT_INSTRUCTIONS_DIR:-$HOME/agent-instructions}"
M="$R/ENGINEERING.md"
P="${AGENT_INSTRUCTIONS_OVERLAY:-$HOME/agent-instructions-personal.md}"
S="${AGENT_INSTRUCTIONS_STATE:-$HOME/.agent-instructions}"
LEAK="$S/leak-patterns.txt"
LAST="$S/codex-last-sync.md"
CX="$HOME/.codex/AGENTS.md"
CL="$HOME/.claude/CLAUDE.md"
GPT_FIELDS="$S/chatgpt-custom-instructions.md"
GPT_MEMORY="$S/chatgpt-memory.md"
mkdir -p "$S"

# 1. The master must still be the engineering file (an app can overwrite it through a symlink).
if [ "$(head -n 1 "$M")" != "# Engineering Instructions" ]; then
  echo "STOP: $M does not start with '# Engineering Instructions'. Something overwrote it; restore it from git or $LAST."
  exit 1
fi
[ -f "$P" ] || echo "WARN: no personal overlay at $P (set AGENT_INSTRUCTIONS_OVERLAY)"

# 2. Codex's copy must be what we last wrote; otherwise something (the Codex app) edited it.
if [ -L "$CX" ]; then
  echo "STOP: $CX is a symlink. It must be a plain copy (the Codex app writes to it)."
  exit 1
fi
# Codex has no imports, so its copy is the core and the overlay joined.
J=$(mktemp); trap 'rm -f "$J"' EXIT
{ cat "$M"; if [ -f "$P" ]; then printf '\n'; cat "$P"; fi; } > "$J"
if [ -f "$CX" ] && [ -f "$LAST" ] && ! cmp -s "$CX" "$LAST" && ! cmp -s "$CX" "$J"; then
  echo "STOP: $CX was edited since the last sync. Diff (last sync -> Codex's copy):"
  diff -u "$LAST" "$CX"
  exit 1
fi

# 3. Copy and verify.
mkdir -p "$(dirname "$CX")"
cp "$J" "$LAST" && cp "$J" "$CX"
if cmp -s "$J" "$LAST" && cmp -s "$J" "$CX"; then
  echo "OK: core + overlay = ~/.codex/AGENTS.md"
else
  echo "STOP: copies don't match after copying."
  exit 1
fi
grep -qF "ENGINEERING.md" "$CL" 2>/dev/null &&
  echo "OK: ~/.claude/CLAUDE.md imports the core" ||
  echo "WARN: ~/.claude/CLAUDE.md does not import $M"

# 4. Long lines in the master (ASCII lines only; emoji count as several bytes).
awk 'length > 100 && !/[^\x00-\x7F]/ {printf "WARN: %s line %d is %d chars (wrap at 100)\n", FILENAME, FNR, length}' "$M"

# 5. Leak check: nothing in the shared repo may match a personal pattern (one regex per line:
#    your name, emails, employers, colleagues, private repo names).
if [ -s "$LEAK" ]; then
  hits=$(cd "$R" && grep -rnE -f "$LEAK" --exclude=.DS_Store --exclude-dir=.git . 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "LEAK: personal details in the shared core (move them to the overlay):"
    printf '%s\n' "$hits"
  else
    echo "OK: no personal details in $R"
  fi
else
  echo "NOTE: no leak patterns yet; add one regex per line to $LEAK"
fi

# 6. ChatGPT copies (optional, hand-condensed): field limits, memory item sizes, staleness.
if [ -f "$GPT_FIELDS" ] || [ -f "$GPT_MEMORY" ]; then
  python3 -I - "$GPT_FIELDS" "$GPT_MEMORY" <<'EOF'
import os, re, sys
fields, memory = sys.argv[1], sys.argv[2]
if os.path.exists(fields):
    t = open(fields, encoding="utf-8").read()
    for head, block in re.findall(r"## (.+?)\n\n```text\n(.*?)```", t, re.S):
        n = len(block.rstrip("\n"))
        flag = "OVER LIMIT" if n > 1500 else "ok"
        print(f"ChatGPT field {n:5d}/1500 {flag:10s} {head[:45]}")
if os.path.exists(memory):
    m = open(memory, encoding="utf-8").read()
    items = re.findall(r"^(\d+)\. (.*)$", m, re.M)
    big = [f"#{k} ({len(v)})" for k, v in items if len(v) > 600]
    print(f"ChatGPT memory: {len(items)} items" + (f"; long: {', '.join(big)}" if big else ""))
EOF
  STAMP="$S/.chatgpt-reviewed"
  if [ ! -e "$STAMP" ] || [ "$STAMP" -ot "$M" ] || { [ -f "$P" ] && [ "$STAMP" -ot "$P" ]; }; then
    echo "CHECK: the master changed since the ChatGPT copies were last reviewed. Update them if the change matters in ChatGPT, then: touch $STAMP"
  fi
fi

# 7. Cloud setup script (cloud sessions can't read ~/.claude).
"$(dirname "$0")/cloud-setup.sh" || exit 1
CS="$S/cloud-setup.sh"
CSTAMP="$S/.cloud-setup-pasted"
if [ ! -e "$CSTAMP" ] || [ "$CSTAMP" -ot "$CS" ]; then
  echo "CHECK: the cloud setup script changed since it was last pasted. Paste $CS into your cloud environment's setup script, then: touch $CSTAMP"
fi

# 8. Public copy (optional): flag sources that changed since it was last updated.
"$(dirname "$0")/public-check.sh"
exit 0
