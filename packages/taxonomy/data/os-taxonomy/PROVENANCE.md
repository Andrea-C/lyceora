<!--
Vendoring header (Lyceora) — not part of the upstream document below.

Source repo:    https://github.com/withmarbleapp/os-taxonomy
Files vendored:  data/topics.json, data/dependencies.json (unmodified)
Upstream commit: 96a7933754af672e1bfdbf7ecb05c325860c6e0d (main, committed 2026-07-08)
Fetch date:      2026-07-11

Licenses (per upstream README / this file):
  - Database (topic/dependency structure): ODbL 1.0 (Open Database License)
  - Content (topic names, descriptions, evidence, assessment prompts): CC BY-SA 4.0
  - Encumbered curriculum-standards sources are licensed separately per the
    "Per-source terms" section below; Lyceora does not vendor
    data/curriculum-standards.json and does not ship any full-text standard.
    math-core.json topics do carry the bare standard *codes* passed through
    from upstream topics.json (e.g. "ccss-math:K.OA.1", "uk-nc-2013:Maths/Y1/AS/1"
    — 128 of the 228 math-core topics have one or more) as topic metadata;
    per the "codes-only" distinction below, a bare code is a short factual
    identifier, not the encumbered standard text itself, and this is exactly
    upstream's own codes-only-safe practice.

Everything below this line is the upstream PROVENANCE.md, unmodified.
-->

# Provenance & third-party licensing

The micro-topics, the prerequisite graph, and all of Marble's authored text are original work, released under ODbL 1.0 + CC BY-SA 4.0 (see [README](README.md#license)).

**`data/curriculum-standards.json` is different.** Those standards are extracted from external curriculum frameworks that Marble does **not** own and **cannot** relicense. You can only receive from us the rights the upstream holders grant. Each source's terms — and exactly what we ship — are below.


## The "codes-only" distinction

For encumbered sources we ship only the **standard code** (e.g. `1-ESS1-1`) and its key — a short **factual identifier**, low copyright risk — and we **omit the verbatim standard text** (`description`, `clarificationStatement`, etc.). The topic→standard *links* in `topics.json` are unaffected, so "this topic maps to standard X" is preserved throughout. Sources marked `textIncluded: false` in `curriculum-standards.json` are codes-only.

## Per-source terms

### 🟢 `uk-nc-2013` — The National Curriculum in England (KS1–2) — **full text**
- **Publisher / rights:** UK Department for Education. © Crown copyright.
- **License:** [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Permits commercial use, adaptation, and redistribution. **No share-alike.**
- **Required notice:** *"Contains public sector information licensed under the Open Government Licence v3.0."*
- **We ship:** full standard text.

### 🟡 `ccss-ela`, `ccss-math` — Common Core State Standards — **full text**
- **Publisher / rights:** © 2010 National Governors Association Center for Best Practices (NGA Center) and Council of Chief State School Officers (CCSSO).
- **License:** the CCSS Public License grants *"a limited, non-exclusive, royalty-free license to copy, publish, distribute, and display the Common Core State Standards **for purposes that support the Common Core State Standards Initiative**."* This is **purpose-limited**, and it does **not** clearly grant derivative-work or sublicensing rights — so the CCSS-derived records remain under the CCSS Public License, **not** ODbL.
- **Required notice:** *"© Copyright 2010 National Governors Association Center for Best Practices and Council of Chief State School Officers."*
- **We ship:** full standard text, under the CCSS Public License.

### 🔴 `ngss-k5`, `ngss-ms` — Next Generation Science Standards — **codes only**
- **Publisher / rights:** copyright held by the National Academies Press. *"NGSS"* and *"Next Generation Science Standards"* are **registered trademarks of WestEd**.
- **License:** non-commercial entities may freely copy/adapt. **Commercial** entities may use the standards only with restrictions — including submitting samples for approval and a mandatory trademark disclaimer. Not relicensable under ODbL.
- **Required notice (if referencing NGSS):** *"NGSS is a registered trademark of WestEd. Neither WestEd nor the lead states and partners that developed the Next Generation Science Standards were involved in the production of this product, and do not endorse it."*
- **We ship:** codes/keys only (verbatim text omitted). To include full NGSS text, obtain WestEd clearance first.

### 🔴 `c3-social-studies` — C3 Framework for Social Studies — **codes only**
- **Publisher / rights:** © National Council for the Social Studies (NCSS).
- **License:** permission-based; redistribution of the framework text requires NCSS permission.
- **We ship:** codes/keys only. Obtain NCSS permission before shipping full text.

### 🔴 `ib-pyp-pspe` — IB PYP Personal, Social & Physical Education Scope & Sequence — **codes only**
- **Publisher / rights:** © International Baccalaureate Organization (IBO).
- **License:** IB content is copyrighted and IBO is protective of it; redistribution requires explicit IB permission. This is the most restrictive source.
- **We ship:** codes/keys only. Do not ship full text without IB permission.

## Changing what ships

The export tool takes a per-source switch. To (re)include a source's full text after clearing rights, regenerate with that slug removed from the codes-only set:

```bash
# ship everything verbatim
DATABASE_URL=… node exportTaxonomy.mjs --codes-only=
# default (encumbered sources codes-only)
DATABASE_URL=… node exportTaxonomy.mjs
```
