// Diff Review: a PR review layer for the repos in the session folder.
//
// The band above the prompt notes each repo whose branch has something to
// review (commits ahead of the base branch, unpushed commits, uncommitted
// changes), with a "Review ›" button. Nothing is held or blocked.
// The pane is the review, in sections split by dividers: per repo, tabs for
// All (base → working tree), PR (base...HEAD), Unpushed (upstream..HEAD) and
// Uncommitted (HEAD → working tree); the commits (folds; each opens that
// commit alone); the files changed, grouped by folder, each opening its diff
// right under its row, drawn by the engine's own diff view.
//
// Refreshed when the session starts, when a main turn ends, and by Refresh.
// /diff-review [repo] opens the pane too.
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are
// spelled literally, and helpers that take `$` are top-level functions.

const PANE_ID = "diff-review";
const BAND_REPOS_MAX = 3; // repo rows in the band; the rest are counted
const CODE_CHARS_MAX = 60000; // diff text drawn per file
const PANE_CHARS_MAX = 90000; // diff text drawn across open files; a drawing holds 100000
const UNTRACKED_MAX = 50; // untracked files read per review
const COMMITS_SHOWN_MAX = 30; // commit rows listed in the Files view

// The editors an Open button can use; `options.editor` picks which.
const EDITORS = {
  cursor: { label: "Cursor", scheme: "cursor", cli: "cursor" },
  vscode: { label: "VS Code", scheme: "vscode", cli: "code" },
};
let editorId = "cursor";

const SCOPES = [
  { id: "all", label: "All", hint: "Everything on this branch, committed or not, against" },
  { id: "pr", label: "PR", hint: "What the PR shows: commits on this branch against" },
  { id: "unpushed", label: "Unpushed", hint: "Commits not pushed yet, against" },
  { id: "uncommitted", label: "Uncommitted", hint: "Changes not committed yet, against" },
];

// Repos with something to review, from the last refresh.
let repos = [];
let refreshing = false;
// The band is dismissed until what it would say changes.
let dismissedKey = "";
// The pane: { repo, reviews: { all, pr, unpushed, uncommitted }, scope,
// open: { [path]: true }, commit: null | { sha, subject, review }, showCommits }.
let view = null;

export function register(on, options) {
  editorId = options?.editor === "vscode" ? "vscode" : "cursor";
  on("session.start", async ($, e, next) => {
    const r = await next(e);
    await $.command.register({ name: "diff-review", description: "Diff Review: PR-style review of a repo's branch (optional: a repo folder)" });
    await refresh($);
    return r;
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (!e.agentId) {
      await refresh($);
    }
    return r;
  });

  on("command.run", { command: "diff-review" }, async ($, e) => {
    await refresh($);
    const arg = String(e.args ?? "").trim();
    const repo = arg ? repos.find((r) => r.name === arg || r.dir.endsWith(`/${arg}`)) : repos[0];
    if (!repo) {
      return { text: arg ? `Diff Review: nothing to review in ${arg}.` : "Diff Review: no repo here has anything to review." };
    }
    await openReview($, repo);
    return { text: `Diff Review: ${repo.name}` };
  });

  // The band: one row per repo with something to review, other mods' bands beneath.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (repos.length === 0 || e.props.isWorking || e.props.hasSurvey || bandKey() === dismissedKey) {
      return next(e);
    }
    // Claude Code's own placeholder ({ type: "engine" }) is never nested.
    const drawn = await Promise.resolve(next(e)).catch(() => null);
    const below = drawn && typeof drawn === "object" && drawn.type !== "engine" ? drawn : null;
    const t = $.ui.resolve(e);
    const band = drawBand($, t, e.props.maxRows, e.props.bodyColumns);
    if (!below) {
      return band;
    }
    return t.Box({ flexDirection: "column", children: [band, below] });
  });

  on("ui.render", { component: "Pane" }, ($, e, next) => {
    if (e.requestId !== PANE_ID || view === null) {
      return next(e);
    }
    const t = $.ui.resolve(e);
    return drawPane($, t, e.props.bodyColumns, e.surface);
  });

  // The person closed the pane (Escape or the engine's mark).
  on("ui.close", ($, e, next) => {
    if (e.id === PANE_ID || e.requestId === PANE_ID) {
      view = null;
    }
    return next(e);
  });
}

// ---- Reading the repos ----------------------------------------------------

// One line per repo: dir, branch, base, upstream, commits ahead of base,
// commits ahead of upstream, uncommitted entries, shortstat base → working tree.
// The session folder itself if it is a repo, else each repo one level down.
const SUMMARY_SCRIPT = `
summarize() {
  d="$1"
  git -C "$d" rev-parse --verify -q HEAD >/dev/null || return 0
  br=$(git -C "$d" rev-parse --abbrev-ref HEAD)
  base=""
  for b in origin/HEAD origin/main origin/master origin/develop; do
    if git -C "$d" rev-parse --verify -q "$b" >/dev/null; then base=$(git -C "$d" rev-parse --abbrev-ref "$b"); break; fi
  done
  up=$(git -C "$d" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
  ab=0; mb=""
  if [ -n "$base" ]; then
    mb=$(git -C "$d" merge-base "$base" HEAD 2>/dev/null)
    ab=$(git -C "$d" rev-list --count "$base..HEAD" 2>/dev/null || echo 0)
  fi
  au=""
  [ -n "$up" ] && au=$(git -C "$d" rev-list --count "$up..HEAD" 2>/dev/null)
  dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  stat=""
  [ -n "$mb" ] && stat=$(git -C "$d" diff --shortstat "$mb" 2>/dev/null)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$d" "$br" "$base" "$up" "$ab" "$au" "$dirty" "$stat"
}
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  summarize "$(git rev-parse --show-toplevel)"
else
  for d in */; do [ -e "$d.git" ] && summarize "$PWD/\${d%/}"; done
fi
exit 0
`;

/** Parses the summary script's lines into repos with something to review. */
export function parseSummary(stdout) {
  const out = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const [dir, branch, base, upstream, ahead, unpushed, dirty, stat] = line.split("\t");
    const files = Number(/(\d+) files? changed/.exec(stat ?? "")?.[1] ?? 0);
    const add = Number(/(\d+) insertions?/.exec(stat ?? "")?.[1] ?? 0);
    const del = Number(/(\d+) deletions?/.exec(stat ?? "")?.[1] ?? 0);
    const repo = {
      dir,
      name: dir.split("/").pop(),
      branch,
      base,
      upstream,
      ahead: Number(ahead) || 0,
      unpushed: upstream ? Number(unpushed) || 0 : null,
      dirty: Number(dirty) || 0,
      files,
      add,
      del,
    };
    if (repo.ahead > 0 || repo.dirty > 0 || (repo.unpushed ?? 0) > 0) {
      out.push(repo);
    }
  }
  return out;
}

async function refresh($) {
  if (refreshing) {
    return;
  }
  refreshing = true;
  try {
    const cwd = await $.session.cwd();
    const run = await $.process.run(["bash", "-c", SUMMARY_SCRIPT], { cwd, timeoutMs: 60000 });
    repos = parseSummary(run.stdout);
    if (view !== null) {
      const same = repos.find((r) => r.dir === view.repo.dir);
      if (same) {
        await loadReviews($, same);
      }
    }
  } catch {
    // an optional notice: keep the last one rather than fail the turn
  } finally {
    refreshing = false;
    $.ui.invalidate("ui.render");
  }
}

async function git($, cwd, args, timeoutMs = 30000) {
  return $.process.run(["git", "-c", "core.quotePath=false", ...args], { cwd, timeoutMs });
}

const DIFF = ["--no-color", "--no-ext-diff", "-M", "-U3"];

/** The four reviews of one repo, loaded into `view`; the view's place is kept. */
async function loadReviews($, repo) {
  const mergeBase = repo.base ? (await git($, repo.dir, ["merge-base", repo.base, "HEAD"])).stdout.trim() : "";
  const untracked = await readUntracked($, repo.dir);
  const reviews = {
    all: mergeBase
      ? await review($, repo, ["diff", ...DIFF, mergeBase], `${repo.base}..HEAD`, untracked)
      : await review($, repo, ["diff", ...DIFF, "HEAD"], "", untracked, "No base branch found (origin/HEAD, main, master, develop): showing uncommitted changes."),
    pr: mergeBase
      ? await review($, repo, ["diff", ...DIFF, `${repo.base}...HEAD`], `${repo.base}..HEAD`, [])
      : emptyReview("No base branch found, so there is no PR view."),
    unpushed: repo.upstream
      ? await review($, repo, ["diff", ...DIFF, `${repo.upstream}..HEAD`], `${repo.upstream}..HEAD`, [])
      : emptyReview("This branch has no upstream yet: every commit on it is unpushed (see PR)."),
    uncommitted: await review($, repo, ["diff", ...DIFF, "HEAD"], "", untracked),
  };
  const same = view !== null && view.repo.dir === repo.dir;
  view = {
    repo,
    reviews,
    scope: same ? view.scope : "all",
    open: same ? view.open : {},
    commit: same ? view.commit : null,
    showCommits: same ? view.showCommits : true,
  };
}

function emptyReview(note) {
  return { files: [], commits: [], add: 0, del: 0, note };
}

async function review($, repo, gitArgs, logRange, untracked, note = "") {
  const out = emptyReview(note);
  if (logRange) {
    const log = await git($, repo.dir, ["log", "--format=%h%x09%s", "--no-decorate", logRange]);
    out.commits = log.stdout.split("\n").filter((l) => l !== "").map((l) => {
      const [sha, ...rest] = l.split("\t");
      return { sha, subject: rest.join("\t") };
    });
  }
  const patch = await git($, repo.dir, gitArgs);
  if (patch.exitCode !== 0) {
    out.note = `git failed: ${patch.stderr.trim().slice(0, 200)}`;
    return out;
  }
  out.files = [...parsePatch(patch.stdout), ...untracked].sort((a, b) => a.path.localeCompare(b.path));
  if (patch.isStdoutTruncated) {
    out.note = `${out.note} The diff was too large to read whole; later files are missing.`.trim();
  }
  for (const f of out.files) {
    out.add += f.add;
    out.del += f.del;
  }
  return out;
}

/** One commit alone, for the commit view. */
async function commitReview($, repo, sha) {
  return review($, repo, ["show", "--format=", ...DIFF, sha], "", []);
}

async function readUntracked($, dir) {
  const list = await git($, dir, ["ls-files", "--others", "--exclude-standard"]);
  const paths = list.stdout.split("\n").filter((l) => l !== "");
  const files = [];
  for (const path of paths.slice(0, UNTRACKED_MAX)) {
    let text = "";
    try {
      text = String(await $.fs.read(`${dir}/${path}`));
    } catch {
      text = "";
    }
    const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    files.push({
      path,
      status: "A",
      untracked: true,
      add: lines.length,
      del: 0,
      binary: false,
      hunks: lines.length === 0 ? [] : [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)],
    });
  }
  return files;
}

/** A unified diff, split into files, each with its counts and raw hunk lines. */
export function parsePatch(text) {
  const files = [];
  let file = null;
  let inHunks = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      file = { path: m ? m[2] : line.slice(11), status: "M", untracked: false, add: 0, del: 0, binary: false, hunks: [] };
      files.push(file);
      inHunks = false;
      continue;
    }
    if (file === null) {
      continue;
    }
    if (!inHunks) {
      if (line.startsWith("new file mode")) {
        file.status = "A";
      } else if (line.startsWith("deleted file mode")) {
        file.status = "D";
      } else if (line.startsWith("rename from ")) {
        file.status = "R";
        file.from = line.slice(12);
      } else if (line.startsWith("rename to ")) {
        file.path = line.slice(10);
      } else if (line.startsWith("Binary files ")) {
        file.binary = true;
      } else if (line.startsWith("@@")) {
        inHunks = true;
        file.hunks.push(line);
      }
      continue;
    }
    if (line.startsWith("+")) {
      file.add += 1;
    } else if (line.startsWith("-")) {
      file.del += 1;
    } else if (!line.startsWith(" ") && !line.startsWith("@@") && !line.startsWith("\\")) {
      continue; // the patch's trailing blank line
    }
    file.hunks.push(line);
  }
  return files;
}

/** The hunks as one diff source, cut at a hunk boundary when too long to draw. */
export function diffSource(file) {
  const out = [];
  let size = 0;
  let cut = 0;
  let hunk = [];
  const flush = () => {
    const text = hunk.join("\n");
    if (size + text.length > CODE_CHARS_MAX && out.length > 0) {
      cut += 1;
    } else {
      out.push(text);
      size += text.length + 1;
    }
    hunk = [];
  };
  for (const line of file.hunks) {
    if (line.startsWith("@@") && hunk.length > 0) {
      flush();
    }
    hunk.push(line);
  }
  if (hunk.length > 0) {
    flush();
  }
  return { source: out.join("\n"), cutHunks: cut };
}

// ---- The diff as SVG ------------------------------------------------------

// Small text the surface's own text size can't give: the diff is drawn as an
// image. Rows are GitHub's: old and new line numbers, then the line, tinted
// green or red; long lines continue on rows without numbers.
const SVG_FONT_PX = 11;
const SVG_ROW_PX = 16;
const SVG_CHAR_PX = 6.7; // a monospace glyph at SVG_FONT_PX
const SVG_CELL_PX = 7.5; // a pane cell on the desktop, to size the image
const SVG_GUTTER_CHARS = 12; // "1234 1234 + "
const SVG_ROWS_PER_PART = 250; // one image stays well under 131072 characters
const SVG_ROWS_MAX = 1500; // rows drawn per file

const SVG_STYLE = `<style>
text{font:${SVG_FONT_PX}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:#1f2328;white-space:pre}
.n{fill:#6e7781}.h{fill:#57606a}
.ra{fill:#dafbe1}.rd{fill:#ffebe9}.rh{fill:#ddf4ff}
@media (prefers-color-scheme:dark){
text{fill:#e6edf3}.n{fill:#7d8590}.h{fill:#8b949e}
.ra{fill:rgba(46,160,67,.25)}.rd{fill:rgba(248,81,73,.25)}.rh{fill:rgba(56,139,253,.15)}}
</style>`;

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The diff's rows: `{ kind: "hunk" | "add" | "del" | "ctx" | "more", old, new, text }`, wrapped to `width` characters. */
export function diffRows(file, width) {
  const rows = [];
  let oldLine = 0;
  let newLine = 0;
  const push = (kind, old, nu, text) => {
    let rest = text.replace(/\t/g, "    ");
    let first = true;
    do {
      // Break at the last space in the row when there is one past its middle.
      let cut = rest.length <= width ? rest.length : rest.lastIndexOf(" ", width);
      if (cut < width / 2) {
        cut = Math.min(width, rest.length);
      } else if (rest.length > width) {
        cut += 1;
      }
      rows.push(first ? { kind, old, new: nu, text: rest.slice(0, cut) } : { kind, old: null, new: null, text: rest.slice(0, cut), more: true });
      rest = rest.slice(cut);
      first = false;
    } while (rest.length > 0);
  };
  for (const line of file.hunks) {
    if (line.startsWith("@@")) {
      const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      oldLine = h ? Number(h[1]) : 0;
      newLine = h ? Number(h[2]) : 0;
      push("hunk", null, null, line);
    } else if (line.startsWith("+")) {
      push("add", null, newLine++, line.slice(1));
    } else if (line.startsWith("-")) {
      push("del", oldLine++, null, line.slice(1));
    } else if (line.startsWith(" ")) {
      push("ctx", oldLine++, newLine++, line.slice(1));
    }
  }
  return rows;
}

/** The diff as SVG images of up to SVG_ROWS_PER_PART rows, sized to `columns` cells. */
export function svgDiff(file, columns) {
  const widthPx = Math.max(320, Math.round((columns || 80) * SVG_CELL_PX));
  const chars = Math.max(20, Math.floor((widthPx - 8) / SVG_CHAR_PX) - SVG_GUTTER_CHARS);
  const all = diffRows(file, chars);
  const rows = all.slice(0, SVG_ROWS_MAX);
  const num = (n) => (n === null || n === undefined ? "    " : String(n).padStart(4));
  const svgs = [];
  for (let start = 0; start < rows.length; start += SVG_ROWS_PER_PART) {
    const part = rows.slice(start, start + SVG_ROWS_PER_PART);
    const height = part.length * SVG_ROW_PX;
    const body = part.map((r, i) => {
      const y = i * SVG_ROW_PX;
      const base = y + SVG_ROW_PX - 4;
      const tint = r.kind === "add" ? "ra" : r.kind === "del" ? "rd" : r.kind === "hunk" ? "rh" : "";
      const rect = tint ? `<rect class="${tint}" x="0" y="${y}" width="${widthPx}" height="${SVG_ROW_PX}"/>` : "";
      if (r.kind === "hunk" && !r.more) {
        return `${rect}<text class="h" x="4" y="${base}">${escapeXml(r.text)}</text>`;
      }
      const sign = r.more ? " " : r.kind === "add" ? "+" : r.kind === "del" ? "-" : " ";
      const gutter = `${num(r.old)} ${num(r.new)} ${sign} `;
      return `${rect}<text x="4" y="${base}"><tspan class="n">${gutter}</tspan>${escapeXml(r.text)}</text>`;
    }).join("");
    svgs.push({
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${height}" viewBox="0 0 ${widthPx} ${height}">${SVG_STYLE}${body}</svg>`,
      width: widthPx,
      height,
    });
  }
  return { svgs, hiddenRows: all.length - rows.length };
}

// ---- Drawing --------------------------------------------------------------

const STATUS = {
  A: { word: "added", color: "success" },
  D: { word: "deleted", color: "error" },
  M: { word: "modified", color: "warning" },
  R: { word: "renamed", color: "suggestion" },
};

function bandKey() {
  return repos.map((r) => `${r.dir}:${r.branch}:${r.ahead}:${r.unpushed}:${r.dirty}:${r.files}:${r.add}:${r.del}`).join("|");
}

/** "3 commits (1 unpushed) · 2 uncommitted" for one repo. */
export function repoSummary(r) {
  const parts = [];
  if (r.ahead > 0) {
    parts.push(`${r.ahead} ${r.ahead === 1 ? "commit" : "commits"}${r.unpushed ? ` (${r.unpushed} unpushed)` : ""}`);
  } else if (r.unpushed) {
    parts.push(`${r.unpushed} unpushed`);
  }
  if (r.dirty > 0) {
    parts.push(`${r.dirty} uncommitted`);
  }
  if (r.upstream === "" && r.ahead > 0) {
    parts.push("not pushed yet");
  }
  return parts.join(" · ");
}

async function openReview($, repo) {
  await loadReviews($, repo);
  await $.ui.open({ id: PANE_ID, title: "Diff Review", focus: true, closeOnEscape: true });
  $.ui.invalidate("ui.render");
}

function counts(t, add, del) {
  const { Text } = t;
  return [Text({ key: "a", color: "success", children: `+${add}` }), Text({ key: "d", color: "error", children: `−${del}` })];
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const WIDE_COLUMNS = 110; // one line per repo from here
const NARROW_COLUMNS = 50; // below this, one line for all repos

/**
 * Which layout the band takes in `rows` × `columns`: "wide" (a line per repo),
 * "stacked" (two lines per repo: name and Review, then the details) or
 * "summary" (one line for every repo).
 */
export function bandLayout(repoCount, rows, columns) {
  const shown = Math.min(repoCount, BAND_REPOS_MAX) + (repoCount > BAND_REPOS_MAX ? 1 : 0);
  if (columns >= WIDE_COLUMNS && rows >= shown) {
    return "wide";
  }
  if (columns >= NARROW_COLUMNS && rows >= shown * 2) {
    return "stacked";
  }
  return "summary";
}

function drawBand($, t, maxRows, bodyColumns) {
  const { Box, Text, Button } = t;
  const rows = Number.isFinite(maxRows) && maxRows > 0 ? maxRows : 6;
  const columns = Number.isFinite(bodyColumns) && bodyColumns > 0 ? bodyColumns : 80;
  const layout = bandLayout(repos.length, rows, columns);
  const dismiss = Button({
    key: "dismiss",
    label: "✕",
    plain: true,
    role: "dismiss",
    onPress: () => {
      dismissedKey = bandKey();
      $.ui.invalidate("ui.render");
    },
  });
  // The close button closes the whole notice, so it sits apart from the rows,
  // at the top-right edge.
  const withDismiss = (body) => Box({
    flexDirection: "row",
    gap: 2,
    children: [
      Box({ key: "body", flexDirection: "column", flexGrow: 1, flexShrink: 1, children: [body] }),
      Box({ key: "close", flexShrink: 0, children: [dismiss] }),
    ],
  });
  // What stays whole (the name, Review) never shrinks; the details give way.
  const fixed = (key, child) => Box({ key, flexShrink: 0, children: [child] });
  const fill = (key, children) => Box({ key, gap: 1, flexGrow: 1, flexShrink: 1, overflow: "hidden", children });
  const review = (r, i) => fixed(`review-box-${i}`, Button({ key: `review-${i}`, label: "Review ›", plain: true, onPress: () => openReview($, r) }));
  const details = (r) => [
    Text({ key: "what", wrap: "truncate-end", children: repoSummary(r) }),
    Text({ key: "files", dimColor: true, wrap: "truncate-end", children: plural(r.files, "file") }),
    ...counts(t, r.add, r.del),
  ];

  if (layout === "summary") {
    const files = repos.reduce((n, r) => n + r.files, 0);
    return withDismiss(Box({
      gap: 1,
      children: [
        fill("sum", [Text({ key: "sum", color: "suggestion", wrap: "truncate-end", children: `⧉ ${plural(repos.length, "repo")} to review · ${plural(files, "file")}` })]),
        fixed("review-box", Button({ key: "review", label: "Review ›", plain: true, onPress: () => openReview($, repos[0]) })),
      ],
    }));
  }

  const shown = repos.slice(0, BAND_REPOS_MAX);
  const lines = shown.map((r, i) => {
    const name = fixed("name", Text({ key: "name", color: "suggestion", bold: true, children: `⧉ ${r.name}` }));
    if (layout === "wide") {
      return Box({
        key: `repo${i}`,
        gap: 1,
        children: [
          name,
          fill("info", [Text({ key: "branch", dimColor: true, wrap: "truncate-middle", children: r.base ? `${r.branch} → ${r.base}` : r.branch }), ...details(r)]),
          review(r, i),
        ],
      });
    }
    return Box({
      key: `repo${i}`,
      flexDirection: "column",
      children: [
        Box({ key: "top", gap: 1, children: [name, fill("gap", []), review(r, i)] }),
        Box({ key: "info", gap: 1, paddingLeft: 2, overflow: "hidden", children: details(r) }),
      ],
    });
  });
  if (repos.length > BAND_REPOS_MAX) {
    lines.push(Text({ key: "more", dimColor: true, wrap: "truncate-end", children: `  + ${repos.length - BAND_REPOS_MAX} more repos (open Review to switch)` }));
  }
  return withDismiss(Box({ flexDirection: "column", children: lines }));
}


/** The review the pane shows now: one commit's, or the scope's. */
function currentReview() {
  return view.commit ? view.commit.review : view.reviews[view.scope];
}

function closePane($) {
  return () => {
    view = null;
    $.ui.close({ id: PANE_ID });
    $.ui.invalidate("ui.render");
  };
}

/** Files grouped by folder, in path order, each with its index in the review. */
export function groupByFolder(files) {
  const groups = [];
  files.forEach((f, index) => {
    const slash = f.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : f.path.slice(0, slash);
    const name = slash === -1 ? f.path : f.path.slice(slash + 1);
    let g = groups[groups.length - 1];
    if (!g || g.dir !== dir) {
      g = { dir, files: [] };
      groups.push(g);
    }
    g.files.push({ file: f, name, index });
  });
  return groups;
}

function divider(t, key, columns) {
  return t.Text({ key, dimColor: true, wrap: "truncate-end", children: "─".repeat(Math.max(10, columns)) });
}

// The pane: where you are and what is compared, the commits, the files with
// their diffs opening in place, the actions; a divider between each.
function drawPane($, t, bodyColumns, surface) {
  const { Box } = t;
  const columns = Number.isFinite(bodyColumns) && bodyColumns > 0 ? bodyColumns : 80;
  const rv = currentReview();
  const sections = [
    headerSection($, t, rv),
    !view.commit && rv.commits.length > 0 ? commitsSection($, t, rv) : null,
    filesSection($, t, rv, columns, surface),
    actionsSection($, t),
  ].filter(Boolean);
  const children = [];
  sections.forEach((section, i) => {
    if (i > 0) {
      children.push(divider(t, `divider${i}`, columns));
    }
    children.push(section);
  });
  return Box({ flexDirection: "column", children });
}

function headerSection($, t, rv) {
  const { Box, Text, Button } = t;
  const { repo, reviews } = view;
  const redraw = () => $.ui.invalidate("ui.render");
  const scope = SCOPES.find((s) => s.id === view.scope) ?? SCOPES[0];
  const rows = [];
  if (repos.length > 1) {
    rows.push(Box({
      key: "repos",
      gap: 1,
      flexWrap: "wrap",
      justifyContent: "center",
      children: repos.map((r, i) =>
        Button({ key: `repo${i}`, label: r.name, variant: r.dir === repo.dir ? "primary" : "secondary", onPress: () => openReview($, r) })),
    }));
  }
  rows.push(Box({
    key: "branch-row",
    gap: 2,
    marginY: 1,
    alignItems: "center",
    flexWrap: "wrap",
    children: [
      Box({ key: "branch", flexGrow: 1, flexShrink: 1, children: [Text({ key: "branch", bold: true, wrap: "truncate-middle", children: repo.base ? `${repo.branch} → ${repo.base}` : repo.branch })] }),
      ...openButtons($, t, "repo", repo.dir, null, "Open source code"),
    ],
  }));
  if (view.commit) {
    rows.push(Box({
      key: "commit-bar",
      gap: 1,
      children: [
        Button({ key: "back-commit", label: "‹ All changes", hotkey: "b", onPress: () => { view.commit = null; redraw(); } }),
        Text({ key: "sha", color: "warning", children: view.commit.sha }),
        Text({ key: "subject", wrap: "truncate-end", children: view.commit.subject }),
      ],
    }));
  } else {
    rows.push(Box({
      key: "tabs",
      gap: 1,
      flexWrap: "wrap",
      children: SCOPES.map((s) =>
        Button({
          key: `tab-${s.id}`,
          label: `${s.label} ${reviews[s.id].files.length}`,
          variant: s.id === scope.id ? "primary" : "secondary",
          onPress: () => { view.scope = s.id; redraw(); },
        })),
    }));
    const against = scope.id === "unpushed" ? repo.upstream : scope.id === "uncommitted" ? "HEAD" : repo.base;
    rows.push(Text({ key: "hint", dimColor: true, wrap: "wrap", children: `${scope.hint} ${against || "—"}.` }));
  }
  return Box({ key: "header", flexDirection: "column", children: rows });
}

// Commits: open by default and folding; each opens that commit alone.
function commitsSection($, t, rv) {
  const { Box, Text, Button } = t;
  const { repo } = view;
  const redraw = () => $.ui.invalidate("ui.render");
  const rows = [
    Button({
      key: "toggle-commits",
      plain: true,
      label: `${view.showCommits ? "▾" : "▸"} Commits · ${rv.commits.length}`,
      onPress: () => { view.showCommits = !view.showCommits; redraw(); },
    }),
  ];
  if (view.showCommits) {
    rv.commits.slice(0, COMMITS_SHOWN_MAX).forEach((c, i) => {
      // A Button takes one plain label, so the colored parts sit beside it
      // and the row lights as one under the pointer.
      rows.push(Box({
        key: `crow${i}`,
        gap: 1,
        hover: { backgroundColor: "subtle" },
        children: [
          Text({ key: "sha", color: "warning", children: `  ${c.sha}` }),
          Box({
            key: "subject",
            flexShrink: 1,
            children: [
              Button({
                key: `commit${i}`,
                plain: true,
                label: c.subject || c.sha,
                onPress: async () => {
                  const review = await commitReview($, repo, c.sha);
                  view.commit = { sha: c.sha, subject: c.subject, review };
                  redraw();
                },
              }),
            ],
          }),
        ],
      }));
    });
    if (rv.commits.length > COMMITS_SHOWN_MAX) {
      rows.push(Text({ key: "more-commits", dimColor: true, children: `  … ${rv.commits.length - COMMITS_SHOWN_MAX} older commits` }));
    }
  }
  return Box({ key: "commits", flexDirection: "column", children: rows });
}

// Files, grouped by folder; a click opens the file's diff under its row.
function filesSection($, t, rv, columns, surface) {
  const { Box, Text, Button, Code, Svg } = t;
  // The terminal draws no Svg: it keeps the engine's own diff view.
  const useSvg = surface !== "terminal" && typeof Svg === "function";
  const redraw = () => $.ui.invalidate("ui.render");
  const anyOpen = rv.files.some((f) => view.open[f.path]);
  const rows = [
    Box({
      key: "files-head",
      gap: 1,
      flexWrap: "wrap",
      children: [
        Text({ key: "n", bold: true, children: `Files changed · ${rv.files.length}` }),
        ...counts(t, rv.add, rv.del),
        rv.files.length > 1
          ? Button({
              key: "toggle-all",
              plain: true,
              label: anyOpen ? "Collapse all" : "Expand all",
              onPress: () => {
                view.open = anyOpen ? {} : Object.fromEntries(rv.files.map((f) => [f.path, true]));
                redraw();
              },
            })
          : null,
      ],
    }),
  ];
  if (rv.note) {
    rows.push(Text({ key: "note", dimColor: true, italic: true, wrap: "wrap", children: rv.note }));
  }
  if (rv.files.length === 0) {
    rows.push(Text({ key: "empty", dimColor: true, children: "Nothing to review in this view." }));
  }

  let budget = PANE_CHARS_MAX;
  for (const [g, group] of groupByFolder(rv.files).entries()) {
    rows.push(Text({ key: `dir${g}`, dimColor: true, wrap: "truncate-start", children: group.dir ? `${group.dir}/` : "./" }));
    for (const { file, name, index } of group.files) {
      const st = STATUS[file.status] ?? STATUS.M;
      const isOpen = Boolean(view.open[file.path]);
      rows.push(Box({
        key: `frow${index}`,
        gap: 1,
        children: [
          Text({ key: "st", color: st.color, bold: true, children: `  ${file.status}` }),
          Box({
            key: "name",
            flexShrink: 1,
            children: [
              Button({
                key: `file${index}`,
                plain: true,
                label: `${isOpen ? "▾" : "▸"} ${name}`,
                onPress: () => {
                  view.open = { ...view.open, [file.path]: !isOpen };
                  redraw();
                },
              }),
            ],
          }),
          Text({ key: "add", color: "success", children: `+${file.add}` }),
          Text({ key: "del", color: "error", children: `−${file.del}` }),
          // An open file can be opened in the editor from the row's right end;
          // a deleted one is gone from disk.
          ...(isOpen && file.status !== "D"
            ? [
                Box({ key: "spacer", flexGrow: 1 }),
                ...openButtons($, t, `file${index}`, `${view.repo.dir}/${file.path}`, firstChangedLine(file), "Open file", true),
              ]
            : []),
        ],
      }));
      if (isOpen) {
        const body = [];
        if (file.status === "D") {
          body.push(Text({ key: "gone", dimColor: true, children: "Deleted: nothing to open in an editor." }));
        }
        if (file.from) {
          body.push(Text({ key: "renamed", dimColor: true, wrap: "wrap", children: `renamed from ${file.from}` }));
        }
        if (file.binary) {
          body.push(Text({ key: "bin", dimColor: true, children: "Binary file: no text diff." }));
        } else if (file.hunks.length === 0) {
          body.push(Text({ key: "none", dimColor: true, children: file.status === "R" ? "Renamed with no content changes." : "Empty file." }));
        } else if (useSvg) {
          // Small text: the diff as an image at the SVG renderer's own font size.
          const { svgs, hiddenRows } = svgDiff(file, columns);
          svgs.forEach((svg, n) => {
            body.push(Svg({ key: `svg${n}`, source: svg.source, alt: `Diff of ${file.path}, part ${n + 1}: +${file.add} −${file.del}`, width: svg.width, height: svg.height }));
          });
          if (hiddenRows > 0) {
            body.push(Text({ key: "cut", dimColor: true, italic: true, children: `${plural(hiddenRows, "more line")} not drawn; open the file in your editor.` }));
          }
        } else {
          const { source, cutHunks } = diffSource(file);
          if (source.length > budget) {
            body.push(Text({ key: "budget", dimColor: true, italic: true, wrap: "wrap", children: "Too many diffs open to draw this one too: collapse another file." }));
          } else {
            budget -= source.length;
            body.push(Code({ key: "diff", source, path: file.path, format: "diff", wrap: "wrap" }));
            if (cutHunks > 0) {
              body.push(Text({ key: "cut", dimColor: true, italic: true, children: `${plural(cutHunks, "more hunk")} too long to draw here; open the file in your editor.` }));
            }
          }
        }
        rows.push(Box({ key: `fdiff${index}`, flexDirection: "column", paddingLeft: 4, marginBottom: 1, children: body }));
      }
    }
  }
  return Box({ key: "files", flexDirection: "column", children: rows });
}

function actionsSection($, t) {
  const { Box, Button } = t;
  return Box({
    key: "actions",
    gap: 1,
    justifyContent: "center",
    children: [
      Button({ key: "refresh", label: "Refresh", hotkey: "r", onPress: () => refresh($) }),
      Button({ key: "close", label: "Close", hotkey: "c", role: "dismiss", onPress: closePane($) }),
    ],
  });
}

// ---- Opening in an editor -------------------------------------------------

/** The first changed line on the new side, to open the file at. */
export function firstChangedLine(file) {
  let newLine = 0;
  for (const line of file.hunks) {
    if (line.startsWith("@@")) {
      newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    } else if (line.startsWith("+") || line.startsWith("-")) {
      return Math.max(1, newLine);
    } else if (line.startsWith(" ")) {
      newLine += 1;
    }
  }
  return newLine > 0 ? newLine : null;
}

/** `cursor://file/<path>:<line>`: the editor opens the file there, or the folder. */
export function editorUrl(id, path, line) {
  const editor = EDITORS[id] ?? EDITORS.cursor;
  const encoded = path.split("/").map((p) => encodeURIComponent(p)).join("/");
  return `${editor.scheme}://file${encoded.startsWith("/") ? "" : "/"}${encoded}${line ? `:${line}` : ""}`;
}

// The URL first, so it works without the CLI on PATH; then the CLI.
async function openInEditor($, id, path, line) {
  const editor = EDITORS[id] ?? EDITORS.cursor;
  try {
    const viaUrl = await $.process.run(["open", editorUrl(id, path, line)], { timeoutMs: 10000 });
    if (viaUrl.exitCode === 0) {
      return;
    }
    const target = line ? `${path}:${line}` : path;
    for (const cli of [editor.cli, `/usr/local/bin/${editor.cli}`, `/opt/homebrew/bin/${editor.cli}`]) {
      const run = await $.process.run(line ? [cli, "-g", target] : [cli, target], { timeoutMs: 10000 }).catch(() => null);
      if (run && run.exitCode === 0) {
        return;
      }
    }
  } catch {
    // reported below
  }
  $.ui.toast(`Diff Review: couldn't open ${editor.label}`);
}

/** One button: opens in the editor the `editor` option names. */
function openButtons($, t, key, path, line, label, plain = false) {
  const { Button } = t;
  const onPress = () => openInEditor($, editorId, path, line);
  return [plain ? Button({ key: `open-${key}`, label, plain: true, onPress }) : Button({ key: `open-${key}`, label, variant: "primary", onPress })];
}
