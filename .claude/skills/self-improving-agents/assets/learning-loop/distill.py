"""Distillation pass scaffold: learning/inbox/*.jsonl -> memory/pending/ proposals.

Run on a schedule (cron) or on idle. Uses the `distiller` role from models.yaml —
a cheap-tier model, never the orchestrator's (cost + cache stability).
Replace call_model() with your provider client; everything else is plumbing.
"""
import json
import pathlib
import re
import shutil

INBOX = pathlib.Path("learning/inbox")
PENDING = pathlib.Path("memory/pending")
MEMORY = pathlib.Path("memory")
PROMPT = pathlib.Path(__file__).with_name("distiller-prompt.md").read_text(encoding="utf-8")

# Minimal self-write safety net: block prompt-injection phrasing, exfiltration
# hints, and invisible Unicode. Extend for your domain; a poisoned memory write
# is a persistent jailbreak.
INJECTION_PATTERNS = [
    r"ignore (all )?previous instructions",
    r"\bexfiltrat",
    r"[​‌‍⁠﻿]",   # zero-width / invisible characters
]


def call_model(system_prompt: str, user_content: str) -> str:
    """Resolve models.yaml agents.distiller -> tier chain -> provider record;
    call the provider with its api_mode. Return raw text (expected: JSON array)."""
    raise NotImplementedError


def memory_index() -> str:
    lines = []
    for pattern in ("**/sem-*.md", "**/proc-*.md"):
        for f in MEMORY.glob(pattern):
            if "pending" in f.parts or "archive" in f.parts:
                continue
            text = f.read_text(encoding="utf-8")
            head = text.split("---")[1] if text.startswith("---") else ""
            lines.append(f"{f.relative_to(MEMORY)}: {' '.join(head.split())[:160]}")
    return "\n".join(lines)


def safety_scan(text: str) -> bool:
    return not any(re.search(p, text, re.I) for p in INJECTION_PATTERNS)


def main() -> None:
    signal_files = sorted(INBOX.glob("signals-*.jsonl"))
    signals = "\n".join(f.read_text(encoding="utf-8") for f in signal_files)
    if not signals.strip():
        return

    raw = call_model(
        PROMPT.replace("{{signals}}", signals).replace("{{memory_index}}", memory_index()),
        "Distill now.",
    )
    for p in json.loads(raw):
        if p.get("confidence", 0) < 0.5:
            continue
        doc = (
            "---\n"
            + "\n".join(
                f"{k}: {json.dumps(v)}"
                for k, v in {**p["frontmatter"], "status": "pending",
                             "op": p["op"], "created_by": "distiller"}.items()
            )
            + "\n---\n\n"
            + p["body_markdown"]
        )
        if not safety_scan(doc):
            continue                                    # rejected by the verify gate
        out = PENDING / p["scope"] / p["type"] / f"{p.get('id') or p['target_id']}.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(doc, encoding="utf-8")

    processed = INBOX / "processed"
    processed.mkdir(exist_ok=True)
    for f in signal_files:
        shutil.move(str(f), processed / f.name)         # idempotent re-runs


if __name__ == "__main__":
    main()
