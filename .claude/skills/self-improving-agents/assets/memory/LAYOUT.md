# Memory layout contract

The agent only remembers what is written to disk. Keep this tree in a private
git repository — every learned lesson is then diffable, revertable, auditable.

```
memory/
├── LAYOUT.md                        # this file — the contract
├── app/                             # SCOPE: everyone using this application
│   ├── MEMORY.md                    # curated, always loaded, token-capped
│   ├── semantic/*.md                # facts (lesson format, type: semantic)
│   └── procedural/*.md              # how-to lessons (type: procedural)
├── team/<team-id>/                  # SCOPE: one team (approval flows, conventions)
│   ├── MEMORY.md
│   ├── semantic/*.md
│   └── procedural/*.md
├── user/<user-id>/                  # SCOPE: one person (preferences, history)
│   ├── MEMORY.md
│   ├── semantic/*.md
│   ├── procedural/*.md
│   └── episodic/YYYY-MM-DD.md       # append-only daily run log
├── pending/                         # STAGING — distiller writes here, humans approve
│   └── <scope-path>/<type>/*.md     # e.g. pending/team/support/procedural/proc-....md
└── archive/                         # deprecated lessons (kept for audit; never loaded)
```

## Load order (session start)

1. `app/MEMORY.md` → `team/<id>/MEMORY.md` → `user/<id>/MEMORY.md` (narrowest last = wins on conflict)
2. `user/<id>/episodic/` for today and yesterday
3. Lesson bodies are NOT loaded up front. MEMORY.md carries one-line pointers;
   the agent opens a lesson file only when relevant (progressive disclosure).
4. Load MEMORY.md as a frozen snapshot: writes made mid-session surface next
   session. This keeps the prompt prefix cache-stable.

## Scope selection (who learns what)

- personal preference / phrasing / tooling habit    → `user/`
- approval procedure, workflow, team convention     → `team/`
- company-wide rule, product fact, domain knowledge → `app/`
- When unsure: NARROWEST scope. Promotion to a wider scope is a human decision.

## Write rules

- Agents never write directly into `app/`, `team/`, or `user/` lesson dirs.
  Proposals go to `pending/`; a human (or a configured auto-approve policy for
  low-risk user-scope items) moves them out.
- Episodic logs are the one exception: the agent appends directly (raw record,
  low blast radius). Never edit past entries; correct with a new entry.
- Prefer patching an existing lesson over creating a near-duplicate.
- Deprecation = move to `archive/` + set `status: deprecated`. Never silent delete.
