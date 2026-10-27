---
name: pre-pr-review
description: Review a draft PR the way its reviewers do, post the review on the PR, prepare the fixes and draft the thread replies, then propose them to the user. Runs automatically right after a draft PR is created (hooks/review-trigger.sh announces it); also use when asked to pre-review or self-review a PR or branch.
---

# Pre-review a draft PR

Goal: find what the team's reviewers would find, before they do. Good reviews go
2–3 hops past the diff, give each finding a concrete failure scenario, and check the code against
the repo's own AGENTS.md / CLAUDE.md.

**Where it sits.** The user asks to commit, push and create a draft PR. Creating the draft PR starts this
skill, and it runs to the end on its own: review → post the review on the PR → fix and commit
locally → draft the thread replies → propose. The review never blocks the push or the PR. What
stays the user's call: pushing the fix commits and posting the replies (step 6).

## 1. Pin the range

- Repo, branch and PR: `git rev-parse --show-toplevel`, `git branch --show-current`,
  `gh pr view --json number,baseRefName,headRefOid,isDraft`.
- Diff `<base>...HEAD` at the pushed head. Review exactly what the PR shows: uncommitted changes
  are outside the review.
- A later round on the same PR (new commits after an earlier pre-review): review the new commits
  in full and re-check only the findings still open on the PR.

## 2. Review (two independent reads)

Run both; don't share your own view of the change with either, so the reads stay unanchored.

1. **Bugs in the diff:** invoke the `code-review` skill at `max` on the branch.
2. **Outside the diff:** a general-purpose subagent with only the repo path, the range, and this
   brief: follow every changed concept (table, column, flag, route, label, helper) to all its
   readers and writers, including other apps or repos that share the same data; apply the
   `risk-review` skill; check the review patterns your team keeps (if any); check the change against the repo's AGENTS.md / nested
   CLAUDE.md files; for high-risk code answer the five questions (fails halfway, runs twice,
   concurrent requests, transaction boundaries, outside consumers). Every finding needs file:line,
   a concrete failure scenario, and a fix.

Verify each finding in the code yourself before posting it. Drop what doesn't hold up.

## 3. Post the review on the PR

One GitHub review of type `COMMENT`, pinned to the reviewed head commit, under the user's account
(`gh api -X POST repos/<owner>/<repo>/pulls/<n>/reviews --input <json>`):

- **Summary body:** starts with `🔍 **Pre-review: <round>**`, where `<round>` says which push this
  review covers, in a few words: `first push` for the PR's first review, `after fix` for the
  commits that answered an earlier pre-review, or what the new commits did (e.g. `after reducing
  the seed data size`). Then `### Minor` (one line each) and `### Outside this PR
  (pre-existing)`. No intro paragraph, no @mentions, no AI attribution.
- **Inline comments:** one per Blocking / Should-fix finding, on the exact changed line: what is
  wrong, the concrete failure, the fix. Every target line must be in the PR diff.
- A finding that needs a team decision, a secret (e.g. a hard-coded password), or anything about
  a person stays out of the PR: list it for the user in step 6 instead.

## 4. Fix and commit locally

Fix the Blocking and Should-fix findings and the cheap Minors, following ENGINEERING.md → Scope
(the fix and what it requires; cleanup kept apart; nothing beyond the findings). Verify the fixes
(the repo's tests, lint, typecheck; a regression test or mutation check that shows each fix
bites). Commit on the PR branch with plain messages and no AI trailer. **Don't push.**

## 5. Draft the replies

One reply per inline thread: "Fixed in `<sha>`: …" (what changed, how it was verified), or why it
isn't changed. Plus one short PR comment for the Minor items if any were fixed. Write them to a
file in the scratchpad; **don't post.** The commit hashes are the local ones; they stay valid
after a plain push.

## 6. Propose

Show the user: what the review posted (link), the fix commits (what each fixes, file:line, how it was
verified), the drafted replies in full, findings left open and why, and the items kept out of the
PR. Ask one question: push the fix commits and post the replies. On the user's yes: push, then post
each reply on its thread (`gh api -X POST …/pulls/<n>/comments/<id>/replies`) and the Minor
comment.
