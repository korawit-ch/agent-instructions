---
name: risk-review
description: Risk-first review of a diff, branch, or PR. Use when asked to review code or changes.
---

# Risk-first review

Read the changed code and enough surrounding code to judge it. Review in this order and spend
effort top-down:

1. Intent: does it do what was asked, completely?
2. Correctness and failure paths: edge cases, error handling, null/empty, off-by-one.
3. Data integrity and concurrency: apply the five high-risk questions (fail halfway, runs twice,
   concurrent requests, transaction boundaries, outside consumers).
4. Auth, permissions, and security: authz on every path, input validation, secrets, injection,
   client-trusted values.
5. Architecture fit: boundaries, reuse, duplicated logic.
6. Performance: N+1 queries, unbounded queries/loops, missing indexes, hot-path work.
7. Tests: is the risky behavior covered?
8. Deploy/ops: migrations, backward compatibility, config, rollout.
9. Maintainability and naming.

## Severity

- BLOCKER: correctness, security, data loss, or a serious architectural problem
- IMPORTANT: significant reliability, performance, or design problem
- SUGGESTION: worthwhile, not required
- NIT: style (at most 3, and only if nothing above is open)

## Output

Findings sorted by severity. Each one gives severity, file:line, the problem, a concrete failure
scenario, and the fix. If there are no meaningful findings, say so in one line. Never invent
findings to fill the review. Example:

```
BLOCKER orders.service.ts:88 — refund() reads the balance, then writes it without a lock.
Two concurrent refunds both pass the check and over-refund. Fix: a conditional update
(`WHERE balance >= amount`) and check the affected-row count.
```
