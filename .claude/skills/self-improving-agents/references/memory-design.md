# Memory Design: Stores, Write Pathways, Curation, and Self-Write Safety

Language-neutral deep-dive on designing the memory layer of a self-improving
agent. SKILL.md gives you the learning loop and the decision trees (which
memory kind, how to gate a write); this file gives you the store design and
the mechanics. Everything here scaffolds from `assets/memory/` and
`scripts/memory_lint.py`.

## Table of contents

1. [Design principles](#1-design-principles)
2. [Memory taxonomy and tradeoffs](#2-memory-taxonomy-and-tradeoffs)
3. [Disk layout](#3-disk-layout)
4. [Token discipline: caps, capacity headers, frozen snapshots](#4-token-discipline)
5. [Episodic memory: searchable, not in-context](#5-episodic-memory)
6. [Write pathways](#6-write-pathways)
7. [Learning Containers: scoping every lesson](#7-learning-containers)
8. [Self-write safety mechanics](#8-self-write-safety-mechanics)
9. [Curation and lifecycle](#9-curation-and-lifecycle)
10. [Distiller implementation notes](#10-distiller-implementation-notes)
11. [Scaffolding checklist](#11-scaffolding-checklist)
12. [Key sources](#key-sources)

## 1. Design principles

**Memory is plain Markdown on disk, in a private git repository.** The
OpenClaw framing is the right mental model: "the model only remembers what
gets saved to disk." Files beat databases for the curated layer because every
learned lesson becomes diffable, revertable, and auditable with tools you
already have — `git diff` is the review UI, `git revert` is the undo button,
and the commit log is the audit trail. Databases earn their place only for
the raw episodic layer, where you need full-text search over volume (see §5).

**Memory is detached from the framework.** Keep the store independent of
whatever agent framework produced it. That is what makes lessons portable —
the same memory tree can back a CopilotKit agent, a Google ADK agent, and a
Microsoft Agent Framework agent simultaneously — and it is what makes the
learning data an asset you own rather than a byproduct locked in a vendor's
runtime. Owning this data is the moat; the framework is replaceable.

**Agents propose, humans approve, files move.** The approval gate should be
"a file moves out of `pending/`" — a mechanism that needs nothing beyond a
filesystem and git, and that no prompt injection can talk its way around.

## 2. Memory taxonomy and tradeoffs

Three kinds, each with a distinct failure mode. Design for all three; the
common mistake is building only the first: "a self-improving agent needs the
last two; most setups only have the first."

| Kind | Contains | Strength | Failure mode | Mitigation |
|---|---|---|---|---|
| **Semantic** | Stable facts (limits, names, domain rules) | Reusable everywhere | Goes stale *silently* — nothing errors when the refund limit changes | `last_verified` + `review_by` dates, lint pass (§9) |
| **Episodic** | Specific things that happened once | A real past case beats an abstract rule | Mostly noise; drowns context if loaded wholesale | Append-only logs, searchable not in-context, aggressive curation |
| **Procedural** | How to handle a class of situation | Consistent behavior across sessions | Highest risk: a wrong workflow is *confidently wrong every time* | Provenance + repetition or human approval before promotion |

The promotion path follows the risk gradient: record uncertain observations
as episodic first, promote to procedural only after the pattern repeats or a
human confirms it. Multi-step procedures that reference tools should graduate
further into skills (see `references/capabilities.md`) — a skill costs ~100
tokens until used, versus a procedure sitting in every prompt.

## 3. Disk layout

Two proven layouts; combine them.

**Layered persona/rules/facts/logs** (as done in OpenClaw) separates *what
rarely changes* from *what changes daily*, which keeps each file small and its
edit blast-radius obvious:

| File | Role | Loaded |
|---|---|---|
| `SOUL.md` | Persona, values, boundaries | First, every session |
| `AGENTS.md` | Operating rules, incl. how to use memory | Every session |
| `USER.md` | Who the user is | Every session |
| `IDENTITY.md` | Name / vibe / emoji | Bootstrap only |
| `TOOLS.md` | Tool guidance (guidance, not definitions) | Every session |
| `MEMORY.md` | Curated durable facts | Main private sessions only |
| `memory/YYYY-MM-DD.md` | Append-only daily logs | Today + yesterday at start |
| `HEARTBEAT.md` | Heartbeat checklist | Heartbeat runs only |
| `DREAMS.md` | Consolidation summaries from dreaming | Optional |

Note `MEMORY.md` loads only in *main, private* sessions — sandboxed or shared
sessions never see durable memory, which prevents leaking one context's facts
into another. Load timing is a design lever: bootstrap-only files cost zero
ongoing tokens; every-session files pay rent forever.

**Scoped container tree** (this skill's layout, `assets/memory/LAYOUT.md`)
adds Learning Containers (§7): `app/`, `team/<id>/`, `user/<id>/` scope
directories, each holding a token-capped `MEMORY.md` plus `semantic/` and
`procedural/` lesson files, with `pending/` mirroring the tree for staged
proposals and `archive/` for deprecated lessons. Load order is widest-first
(app → team → user) so the narrowest scope wins on conflict. Lesson bodies
are *not* loaded up front — `MEMORY.md` carries one-line pointers and the
agent opens a lesson file only when relevant (progressive disclosure, the
same trick skills use). Scaffold from `assets/memory/LAYOUT.md`,
`MEMORY.template.md`, `lesson.template.md`, and `episodic-day.template.md`
rather than re-deriving the format.

## 4. Token discipline

Unbounded memory growth is a top pitfall, and the fix is structural, not
willpower. Three mechanisms (as done in hermes-agent):

- **Hard caps per always-loaded file.** ~800 tokens for `MEMORY.md`, ~500 for
  `USER.md`. Small caps force consolidation: detail migrates into lesson
  files that load on demand, and the always-in-context layer stays cheap.
- **Capacity header the agent can see**, e.g. `[67% — 1,474/2,200 chars]` at
  the top of the file. The agent cannot budget what it cannot measure.
  Consolidate when above 80% — merge related lines, push bodies into lesson
  files, drop the stale.
- **Frozen snapshot at session start.** Load memory once when the session
  begins; writes made mid-session land on disk but surface *next* session.
  This is not laziness — mutating in-context memory mid-conversation breaks
  the provider prompt-prefix cache (every cached token after the edit is
  invalidated, on every subsequent turn) and makes agent behavior
  non-reproducible within a session. Place the memory snapshot in the third,
  volatile tier of a cache-stable prompt (stable identity → skills/context →
  volatile memory), so even across sessions only the smallest tier churns.

Give the agent a **write-only memory tool** — `add` / `replace` / `remove`,
deliberately no `read` (memory is auto-injected, so a read operation only
invites the model to waste turns re-reading what it already has).

## 5. Episodic memory

Episodic memory is high-volume and low-density, so it gets the opposite
treatment from curated memory: **searchable, not in-context.**

- **Append-only daily logs** (`user/<id>/episodic/YYYY-MM-DD.md`, format in
  `assets/memory/episodic-day.template.md`): one entry per notable run, with
  outcome, signal type, and AG-UI event refs. Never edit past entries —
  correct with a new entry. Load only today + yesterday at session start.
- **Full-text session search** over everything older (pattern: all sessions
  persisted to SQLite with an FTS5 index, exposed as a `session_search` tool,
  as done in hermes-agent's `state.db`). The agent recalls a raw
  multi-week-old exchange when — and only when — a current task resembles it.

The division of labor: logs are the durable record, the index makes them
reachable, and neither occupies context until asked for. Episodic entries are
also the distiller's raw material — the "Follow-up: promoted →
proc-…" line in an entry is the lineage link from raw experience to
distilled lesson.

## 6. Write pathways

A store nobody writes to teaches nothing. Plan multiple pathways, ordered
here from most to least explicit. The first is user-initiated; the rest are
agent- or system-initiated and therefore need the gates in §8.

1. **Explicit teaching** — user says "remember X". Highest-confidence signal
   there is; scan it (§8) and apply directly to the narrowest container.
2. **Nudges** (as done in hermes-agent) — at intervals, inject an internal
   system-level prompt telling the agent to review recent activity and decide
   what to persist. Cheap to build; counters the default failure where the
   agent simply never thinks to save anything.
3. **Background post-turn review** — after a turn completes, a pass on a
   cheap auxiliary model asks "did anything here deserve remembering?" Route
   it through a dedicated model slot (the `distiller`/`curator` roles in
   `assets/config/models.yaml`) so it never touches the main model's budget
   or cache. Verify model IDs in that file before use — they rot.
4. **Compaction flush** (as done in OpenClaw) — when context is about to be
   summarized, run a silent save-before-summarize turn first: "write anything
   important to memory files now." Compaction is exactly the moment
   unwritten knowledge is destroyed; flush before you compress.
5. **Dreaming** (as done in Letta and OpenClaw) — a scheduled background pass
   that collects short-term recall signals, scores candidates, and promotes
   only items above a threshold to long-term memory. The threshold is the
   noise filter: repetition earns promotion, one-offs decay.
6. **Passive user modeling** (as done with hermes-agent's Honcho layer,
   ~12 identity dimensions) — a dialectic layer that builds a user model from
   conversation without explicit writes. Treat external memory providers
   (Honcho, Mem0, …) as *additive* plug-ins behind your own store, never as a
   replacement for it — otherwise portability and data ownership (§1) are gone.
7. **The distiller** — this skill's own loop: AG-UI learning signals →
   proposals in `pending/`. See §10.

## 7. Learning Containers

Every lesson gets a scope that controls how far it spreads:

- `user/<id>/` — personal preferences, phrasing, tooling habits
- `team/<id>/` — approval procedures, workflows, team conventions
- `app/` — company-wide rules, product facts, domain knowledge

Scope directories *are* the containers: spread control by filesystem path is
auditable at a glance and enforceable by the loader (a request in user A's
session simply never reads `user/B/`). Why this matters beyond privacy: a
lesson learned from one user's correction may be that user's idiosyncrasy,
not a rule. Cross-user leaks are both a correctness bug and a trust breach —
one user's data surfacing in another's session can end a customer
relationship.

Rules of thumb: when unsure, choose the **narrowest** scope — promotion to a
wider scope is a human decision, never automatic. Anything written at team or
app scope always requires human approval (Tree 5 in SKILL.md), because the
blast radius of a wrong lesson multiplies by the container's population.

## 8. Self-write safety mechanics

A poisoned memory write is a *persistent* jailbreak: injected once, obeyed
every session after. SKILL.md states the non-negotiables; here is the
machinery.

**Scan every write, regardless of author.** Three checks before anything is
staged or applied: prompt-injection phrasing ("ignore previous
instructions" and kin), exfiltration patterns (URLs/instructions that move
data out), and invisible Unicode (zero-width characters that hide payloads
from human reviewers — block outright, since no legitimate lesson needs
them). `assets/learning-loop/distill.py` ships a minimal regex scan and
`scripts/memory_lint.py` re-checks the whole tree for invisible Unicode; for
higher assurance, route proposals through a cheap-model `safety_scan` task
slot as a second opinion.

**Stage, then approve — as configuration, not convention.** Make gating a
config switch so it cannot be skipped by a forgetful integration (as done in
hermes-agent: `memory: {write_approval: true}` and `skills: {write_approval:
true, guard_agent_created: true}`, with agent-created items staged under a
`pending/` directory and a review flow of *list pending → view diff → approve
or reject*). OpenClaw's Skill Workshop is the same pattern at the skill
level: the agent drafts a PROPOSAL, a human inspects and applies it. The
invariant both share: **the agent proposes; a human moves the file.** Nothing
in `pending/` is ever loaded into any agent's context.

**Forbid self-writes that expand power.** A proposal may not grant the agent
new permissions, alter tool access, or modify the learning loop itself —
auto-reject these categories in the distiller prompt *and* in the scan,
because an agent that can edit its own gates has no gates. (This is also why
the improving agent must never grade its own improvement: automatic scores
can be gamed, and a self-graded writer will eventually game them. Human
decisions are the ground truth; scores are advisory.)

**Auto-apply only the low-risk corner.** A reasonable policy: auto-apply
user-scope, non-procedural, high-confidence (≥0.9) items with an audit-log
entry; stage everything else. Procedural rules and skills always see a human.

## 9. Curation and lifecycle

Staleness is the documented failure mode of context-layer learning — nothing
in the loop checks that a lesson is still true. Curation is therefore not
optional hygiene; it is the half of the system that keeps the other half from
rotting. Mechanisms, cheapest first:

- **Usage evidence:** track a helped-count (`hit_count`: times retrieved
  *and* marked helpful, the skillbook pattern from hermes-agent's Agentic
  Context Engine). Approved lessons that are never used are archive
  candidates; lessons that keep helping earn longer review intervals.
- **Freshness dates:** `last_verified` set on creation/re-verification and
  `review_by` as an expiry gate. Semantic facts especially — they fail
  silently, so the date is the only alarm you get.
- **Deterministic lint** (`scripts/memory_lint.py`, run daily, no API calls):
  flags past-`review_by` lessons, `pending/` items older than 14 days,
  missing frontmatter, dangling `supersedes` links, never-used approved
  lessons, invisible Unicode, and `MEMORY.md` files above 80% capacity.
  Deterministic checks first, model judgment second: the lint finds *what* to
  look at; the weekly `curator` pass (cheap tier) decides re-verify, merge,
  extend, or archive.
- **Patch over rewrite:** when a lesson is wrong or incomplete, propose a
  minimal edit (old-string/new-string style, as hermes-agent's skill patching
  prefers) rather than a near-duplicate replacement. Patches produce
  reviewable diffs and preserve provenance; rewrites reset both.
- **Deprecate, never silently delete:** move to `archive/` with
  `status: deprecated` and a `supersedes` link from any replacement. Auditors
  (and the distiller, checking whether a signal is already covered) need the
  history.
- **Lineage-preserving compression** for conversation context: when a session
  must be summarized, compress lossily on a cheap auxiliary model but keep
  reference chains from each summary back to the original turns, so detail is
  recoverable on demand. Working defaults (as done in hermes-agent):
  `threshold: 0.50, target_ratio: 0.20, protect_first_n: 3,
  protect_last_n: 20` — protect the head (task framing) and the tail (live
  state); everything between is fair game.

Cadence defaults: lint daily, curate weekly, human review as a standing
queue (`assets/learning-loop/LOOP.md`).

## 10. Distiller implementation notes

The distiller is the background agent that turns raw signals into candidate
lessons (SKILL.md §3 has the loop; this is the implementation contract).

- **Inputs:** the signal inbox (`learning/inbox/*.jsonl`, records matching
  `assets/agui/learning-signal.schema.json`) plus an index of existing
  lessons (id, type, scope, one-line summary, status) so it can prefer
  PATCH/DEPRECATE over duplicate creation.
- **Decisions per signal cluster:** IGNORE / SEMANTIC / PROCEDURAL / PATCH /
  DEPRECATE — with procedural requiring a demonstrated workflow, a repeated
  (≥2×) correction, or an `explicit_teach` signal. Repetition is the noise
  filter that keeps one-off flukes out of durable memory.
- **Every proposal cites its source events** (thread_id, run_id, AG-UI event
  refs). Provenance is what lets a reviewer answer "why do we believe this?"
  and what lets curation later re-verify against the original trace.
- **Confidence floor:** below 0.5, propose nothing. 0.9+ means an explicit
  statement or repeated identical correction; 0.6–0.8 a single clear
  override.
- **Output is structured** (JSON array of create/patch/deprecate operations),
  written as files under `memory/pending/<scope>/<type>/` — never applied.
- **Run it on the cheap tier** (`agents.distiller` in
  `assets/config/models.yaml`), scheduled hourly or on idle. It is narrow,
  repetitive background work — exactly what should never share the
  orchestrator's model budget or perturb its cache. For privacy-sensitive
  user data, point the tier at a local model (and if that is Ollama, set
  `context_length` explicitly — its default is 4k, far too small for a
  signal batch plus memory index).

Scaffold from `assets/learning-loop/distiller-prompt.md` (the portable core)
and `assets/learning-loop/distill.py` (the plumbing shape — inbox read,
safety scan, pending write, idempotent inbox archival; only `call_model()`
is left to your provider layer).

## 11. Scaffolding checklist

1. Copy `assets/memory/LAYOUT.md` into the project's `memory/` root; create
   the scope tree; `git init` it as a **private** repo.
2. Instantiate `MEMORY.template.md` per scope; set the capacity header.
3. Wire session start: load MEMORY.md files widest-first as a frozen
   snapshot, plus today+yesterday episodic logs; everything else on demand.
4. Wire the write pathways you can afford, in order: explicit teach →
   compaction flush → nudges/post-turn review → distiller (§10) → dreaming.
5. Turn on gating **before** enabling any agent-initiated write: scan +
   `pending/` staging + approval flow + audit log (§8).
6. Cron `scripts/memory_lint.py` daily; schedule the curator weekly.
7. Verify end-to-end with a synthetic correction (SKILL.md §10): inject a
   fake user correction, confirm it lands in the inbox, becomes a pending
   proposal, is blocked from context until approved, and loads next session
   after approval.

## Key sources

- hermes-agent (Nous Research): https://github.com/NousResearch/hermes-agent · docs: https://hermes-agent.nousresearch.com/docs
- OpenClaw: https://github.com/openclaw/openclaw · docs: https://docs.openclaw.ai
- AG-UI protocol (provenance/event vocabulary): https://docs.ag-ui.com/concepts/events
- Conceptual backbone: "Self Learning for Agents Clearly Explained" and
  "Building a Moat: Self Learning Agents" (Atai Barkai, CopilotKit) — see
  `references/learning-layers.md` for the layer framework these establish.
