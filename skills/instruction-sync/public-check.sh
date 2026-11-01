#!/bin/bash
# Optional: for a private instructions repo that you also publish as a sanitized public copy.
# The public copy is sanitized by hand, so this keeps a baseline: a copy of the sources as they were
# at the last public update. Any difference from it is something to re-sanitize into the public copy.
#   public-check.sh           list changed, new and removed files, with the diff since the baseline
#   public-check.sh --accept  the public copy is updated: make the current sources the new baseline
# Set AGENT_INSTRUCTIONS_PUBLIC to the public copy's checkout; unset, this check is skipped.
set -u
R="${AGENT_INSTRUCTIONS_DIR:-$HOME/agent-instructions}"
S="${AGENT_INSTRUCTIONS_STATE:-$HOME/.agent-instructions}"
BASE="$S/public-baseline"
PUB="${AGENT_INSTRUCTIONS_PUBLIC:-}"
[ -n "$PUB" ] || exit 0

# What the public copy is built from. A new skill or hook shows up as new: decide whether to publish it.
sources() { (cd "$R" && find ENGINEERING.md hooks skills -type f ! -name .DS_Store 2>/dev/null | sort); }

if [ "${1:-}" = --accept ]; then
  rm -rf "$BASE" && mkdir -p "$BASE"
  (cd "$R" && sources | while IFS= read -r f; do mkdir -p "$BASE/$(dirname "$f")" && cp -p "$f" "$BASE/$f"; done)
  echo "OK: public baseline set to the current sources ($(sources | wc -l | tr -d ' ') files)"
  exit 0
fi

if [ ! -d "$BASE" ]; then
  echo "CHECK: no public baseline yet. After the public copy matches the sources, run: $0 --accept"
  exit 0
fi

changed=() added=() removed=()
while IFS= read -r f; do
  if [ ! -e "$BASE/$f" ]; then added+=("$f")
  elif ! cmp -s "$R/$f" "$BASE/$f"; then changed+=("$f"); fi
done < <(sources)
while IFS= read -r f; do
  [ -e "$R/$f" ] || removed+=("$f")
done < <(cd "$BASE" && find . -type f | sed 's#^\./##' | sort)

if [ ${#changed[@]} -eq 0 ] && [ ${#added[@]} -eq 0 ] && [ ${#removed[@]} -eq 0 ]; then
  echo "OK: public copy is current with the sources"
  exit 0
fi
echo "CHECK: sources changed since the public copy ($PUB) was last updated. Re-sanitize these there:"
for f in ${changed[@]+"${changed[@]}"}; do echo "  changed: $f"; done
for f in ${added[@]+"${added[@]}"}; do echo "  new:     $f (publish it, or leave it out on purpose)"; done
for f in ${removed[@]+"${removed[@]}"}; do echo "  removed: $f (remove it from the public copy too)"; done
for f in ${changed[@]+"${changed[@]}"}; do diff -u --label "baseline/$f" --label "$f" "$BASE/$f" "$R/$f"; done
echo "Then leak-scan the public copy, commit and push it (only when asked), and run: $0 --accept"
exit 0
