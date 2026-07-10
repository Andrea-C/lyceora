# Lyceora — AI-Teacher Learning Platform: Design Spec

**Date:** 2026-07-11
**Status:** Approved by Andrea (design review, this date)
**Source material:** `docs/ai-teacher-scratchpad.md`, `docs/Math/programma-matematica-estate-2026-progetto.md`, `docs/Math/Risorse-Recupero-Matematica-Medie.md`

## Context

Lyceora is a Math-Academy-style adaptive learning platform built on a knowledge graph, taught by AI agents. It is a startup/product exploration, but its first milestone serves a real user: a 13-year-old Italian student who must recover a math insufficiency over summer 2026. His teacher assigned 8 topics (potenze, divisibilità, frazioni e operazioni, radici, equivalenze, piano cartesiano, perimetro/area dei poligoni, teorema di Pitagora). A research report (`Risorse-Recupero-Matematica-Medie.md`) already maps each topic to vetted Italian video lessons, exercise platforms, and self-assessment tools.

**Decisions locked in during design review:**

- First slice: thin vertical — one subject (Math), full learning loop end-to-end.
- Audience: kids 8–15; first path is Italian middle-school math (the 8 recovery topics plus surrounding years' topics over time).
- Bilingual (Italian + English) from day one.
- Content model: hybrid — AI Socratic teacher + curated web videos + AI-generated exercises.
- Stack: TypeScript full-stack.
- Architecture: modular monolith in a pnpm monorepo (Approach A).
- Milestone 1 must be usable by user #1 within ~2–3 weeks.

## 1. Product shape (Milestone 1)

A bilingual web app. A parent creates an account and a child profile. The student takes an adaptive diagnostic, then works through a personalized path with an AI teacher. First learning path: **"Recupero Matematica — Scuola Media"**. A daily session mixes new lessons, exercises, and spaced-repetition reviews, earning XP toward a daily goal with a streak counter.

## 2. Knowledge backbone

**Canonical format:** the os-taxonomy schema (github.com/withmarbleapp/os-taxonomy) — micro-topics with stable IDs, subject/domain, per-locale name and description, age range, evidence criteria for mastery, assessment prompt templates (with `{{name}}` placeholders), topic type classification, and prerequisite dependency edges.

**Components:**

- `packages/taxonomy` — schema types, validation, loaders, and a graph query engine: prerequisite closure, learning-frontier computation, topological ordering, remediation-target selection.
- **Italian middle-school extension** (`math-it-media`): the 8 recovery topics decomposed into ~40–60 micro-topics (e.g., "Potenze" → definition, properties with equal bases, negative/fractional exponents, expressions with powers), authored bilingually (`{ it, en }` fields), with prerequisite edges linking downward into os-taxonomy's existing math topics (ages ~8–11) so the diagnostic can descend into foundational gaps.
- **Curated resources**: records linking each topic to 2–3 alternative video lessons, exercise platforms, and self-assessment tools. Milestone 1 seeds these manually from the Risorse research report (Schooltoon, Matematicale, Elia Bombardelli/LessThan3Math, Khan Academy, UbiMath, YouMath, GeoGebra, Redooc, Wordwall, WeSchool, Didattica.live, Matematica delle Medie, Full Mind, Sieteprontianavigare, Matematicamente).

**License note:** os-taxonomy is ODbL 1.0 (database) + CC BY-SA 4.0 (authored content). ODbL is share-alike for derivative databases: if we distribute a product built on a derived database, the derived database (not the application code) must be offered under ODbL, with attribution. Acceptable for now; requires a legal pass at startup stage.

## 3. Learning engine (pedagogy)

Mastery learning over a knowledge graph, in the style of Math Academy:

- **Mastery states** per student per micro-topic: `unknown → in-progress → mastered → needs-review`. Transitions are driven by assessment evidence records, never by mere completion.
- **Adaptive diagnostic (pre-assessment):** starts at the target topics of the chosen path; on failure, probes prerequisite topics downward through the graph; outputs the student's mastery frontier and a personalized path.
- **Lesson loop:** AI teacher explains (short explanation + embedded curated video alternatives) → comprehension check → AI-generated exercises with instant feedback → topic assessment → **routing decision**: advance along the graph, or remediate the specific failed prerequisite.
- **Spaced repetition:** mastered topics enter a review queue with expanding intervals; reviews are interleaved into daily sessions. M1 ships a simple fixed-multiplier interval scheme; refinement (e.g., implicit repetition through advanced topics) comes later.
- **Gamification (M1):** XP per completed activity, configurable daily XP goal, streaks. Badges and level certificates get schema placeholders but ship in M2.
- **Pedagogy stance:** non-judgmental error handling — errors are analyzed as learning resources, never sanctioned (per the math-anxiety findings in the Risorse report). Small operational steps, visual-first explanations, personalized pace.

## 4. AI agents

All agents run on a provider-agnostic layer — the Vercel AI SDK, supporting Anthropic, OpenAI, Google, OpenRouter, and local models via Ollama/OpenAI-compatible endpoints — with per-agent model tier configuration (pattern from `.claude/skills/self-improving-agents/assets/config/models.yaml`).

| Agent | Role | Model tier | Milestone |
|---|---|---|---|
| Teacher | Socratic tutoring in the student's language. Context: topic metadata, evidence criteria, student mastery map, recent error history. | high | M1 |
| Assessor | Generates exercises from taxonomy assessment templates; grades answers including free-form; emits evidence records. | mid | M1 |
| Curator | Build-time agent that searches/validates web resources per topic. | mid | M2 |
| Distiller | Background self-improvement loop over session transcripts → agent memory (via self-improving-agents skill). | high (offline) | M3 |

Frontend↔agent communication uses the **AG-UI protocol**: streaming agent events and generative UI (exercises rendered inside the conversation flow).

## 5. Architecture & stack

pnpm monorepo, single deployable:

```
apps/web          Next.js (App Router) — UI, API routes, AG-UI streaming endpoint
packages/taxonomy schema, graph engine, content (os-taxonomy import + math-it-media extension)
packages/agents   agent definitions, prompts, provider/model config, AG-UI server logic
packages/db       Postgres + Drizzle: users, profiles, mastery, evidence, XP, sessions, review queue
```

- **Auth:** parent account (email-based, Better Auth) with child profiles; the child never manages credentials.
- **i18n:** next-intl; UI strings and all content records carry `{ it, en }`.
- **Persistence:** Neon Postgres, Drizzle ORM.
- **Deployment:** Vercel (app + cron for review scheduling) + Neon.
- **Boundary rule:** `apps/web` may import from packages; packages never import from the app; `taxonomy` and `db` do not import from `agents`. This keeps later extraction of the agent runtime into its own service cheap.

## 6. Error handling & safety

- Guardrailed teacher system prompt: stays on subject, age-appropriate, supportive tone, never shames errors.
- Provider fallback chain on model failure; retries with backoff.
- Per-session token budget; cheaper models for grading where quality allows.
- Graceful degradation: if agents are unavailable, curated videos and pre-generated exercises still function.
- Parent dashboard for progress visibility. GDPR-minor/COPPA considerations flagged for a later legal pass; M1 mitigates by parent-managed accounts and no child PII beyond first name.

## 7. Testing

- **Unit:** graph operations (frontier, prerequisite closure, routing), mastery state machine, XP/streak rules, spaced-repetition scheduler.
- **Agent evals:** rubric-based eval sets per agent — assessor must grade known-good/known-bad answer fixtures correctly; teacher must stay in the requested language and level.
- **E2E (Playwright):** diagnostic → lesson → exercise → mastery → routing, in both languages.

## 8. Milestones

- **M1 (~2–3 weeks):** everything above, deployed, usable by user #1: the 8 recovery topic clusters authored bilingually, adaptive diagnostic, AI teacher + curated videos, AI exercises with instant feedback, mastery-gated routing, simple spaced repetition, XP/streaks, parent+child auth, IT/EN.
- **M2:** full os-taxonomy math import (ages 8–11), curator agent for automated resource discovery, richer spaced repetition, badges, parent progress reports.
- **M3:** self-improvement loop (distiller + memory, safety-gated), AI media generation for lessons (images/video/audio), "new learning path" authoring harness, additional subjects and languages.

## Out of scope (explicitly)

- Native mobile apps (responsive web only).
- Real-time multiplayer/competitive features.
- Human-tutor marketplace.
- Full ministerial-curriculum alignment beyond the topics needed for the paths we author.
