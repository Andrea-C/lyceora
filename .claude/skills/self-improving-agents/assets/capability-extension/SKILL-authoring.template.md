---
name: {{kebab-case-name}}
description: {{when to use + what it does, third person, <= 500 chars}}
version: 0.1.0
metadata:
  status: pending                 # pending | approved — pending skills are NEVER loaded
  created_by: agent               # provenance is mandatory for self-authored skills
  source_events:
    - { thread: "...", run: "...", event: "..." }
  approved_by: null               # set by the human who approves
  requires_toolsets: []           # tools this skill assumes exist
  review_by: {{+90 days}}
---

## When to use
{{trigger conditions — specific enough that the model does NOT load this skill unnecessarily}}

## Procedure
1. {{step}}
2. {{step}}

## Pitfalls
- {{mistake this skill exists to prevent — usually the original failure}}

## Verification
{{how to confirm it worked, checkable from the run trace}}
