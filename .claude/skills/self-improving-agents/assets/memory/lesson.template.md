---
id: proc-2026-07-09-refund-over-limit    # <type>-<date>-<slug>; sem- for semantic
type: procedural                          # semantic | procedural
scope: team/support                       # app | team/<id> | user/<id>
status: approved                          # pending | approved | deprecated
confidence: 0.8                           # distiller-assigned, 0..1
hit_count: 4                              # times retrieved AND marked helpful
last_verified: 2026-07-09
review_by: 2026-10-09                     # staleness gate — linter flags when past
source_events:                            # AG-UI provenance (why we believe this)
  - { thread: th_9f2c, run: run_113, event: TOOL_CALL_RESULT }
  - { thread: th_9f2c, run: run_114, event: CUSTOM/USER_OVERRIDE }
created_by: distiller                     # distiller | user | agent:<role>
approved_by: manager@example.com          # required before status: approved
supersedes: null                          # id of lesson this replaces, if any
tags: [refunds, approvals]
---

## Problem
Customer requests a refund above the $2,000 auto-approval limit; the agent
refused, but a manager approved it manually.

## Action that worked
1. Verify order total and payment state.
2. If amount > limit: do NOT refuse. Draft the refund, attach order id and
   one-line reason, route to the approvals queue.
3. Reference the most similar past approval if one exists (episodic search).

## When NOT to apply
Chargebacks already in dispute; suspected fraud flags.

## Verification
Manager approval event appears in the run trace; refund state = "approved".
