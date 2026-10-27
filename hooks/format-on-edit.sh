#!/bin/bash
# PostToolUse (Edit|Write): run the repo's own Prettier on the edited file,
# only when the repo has a Prettier config and a local prettier binary.
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -z "$f" ] || [ ! -f "$f" ] && exit 0
dir=$(dirname "$f")
while [ "$dir" != "/" ]; do
  if [ -x "$dir/node_modules/.bin/prettier" ]; then
    if compgen -G "$dir/.prettierrc*" >/dev/null || compgen -G "$dir/prettier.config.*" >/dev/null \
      || jq -e '.prettier' "$dir/package.json" >/dev/null 2>&1; then
      (cd "$dir" && ./node_modules/.bin/prettier --write --ignore-unknown --log-level warn "$f") >/dev/null 2>&1
    fi
    exit 0
  fi
  dir=$(dirname "$dir")
done
exit 0
