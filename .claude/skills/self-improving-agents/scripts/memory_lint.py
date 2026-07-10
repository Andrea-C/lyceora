"""memory_lint.py — deterministic health checks over the memory/ tree.

Usage: python scripts/memory_lint.py [memory_root]
Exit 1 if findings, 0 if clean. No API calls, no model — pure filesystem checks.
Run daily via cron; feed findings to the `curator` role weekly (see
assets/learning-loop/LOOP.md). Staleness is the documented failure mode of
context-layer learning — this linter is what makes review_by/hit_count
enforced rather than decorative.
"""
import datetime
import pathlib
import re
import sys

REQUIRED = {"id", "type", "scope", "status", "confidence", "review_by", "source_events"}
PENDING_MAX_AGE_DAYS = 14
CAPACITY = 2200
INVISIBLE = re.compile(r"[​‌‍⁠﻿]")


def frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    block = text.split("---", 2)[1]
    fields = {}
    for m in re.finditer(r"^(\w+):\s*(.*)$", block, re.M):
        value = re.sub(r"\s+#.*$", "", m.group(2)).strip()   # drop inline comments
        fields[m.group(1)] = value
    return fields


def main(root: pathlib.Path) -> int:
    today = datetime.date.today()
    findings = []
    ids = set()
    supersedes = []

    for f in root.rglob("*.md"):
        if f.name in ("LAYOUT.md", "MEMORY.md") or "archive" in f.parts:
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        if INVISIBLE.search(text):
            findings.append(f"INVISIBLE-UNICODE {f}")
        if "episodic" in f.parts:
            continue                            # raw logs: no frontmatter contract
        fm = frontmatter(text)
        missing = REQUIRED - fm.keys()
        if missing:
            findings.append(f"MISSING-FRONTMATTER {f}: {sorted(missing)}")
        ids.add(fm.get("id", ""))
        if fm.get("supersedes") not in (None, "", "null"):
            supersedes.append((f, fm["supersedes"]))
        try:
            if datetime.date.fromisoformat(fm.get("review_by", "")) < today:
                findings.append(f"STALE past review_by: {f}")
        except ValueError:
            pass
        if "pending" in f.parts:
            age = (datetime.datetime.now()
                   - datetime.datetime.fromtimestamp(f.stat().st_mtime)).days
            if age > PENDING_MAX_AGE_DAYS:
                findings.append(f"PENDING>{PENDING_MAX_AGE_DAYS}d: {f}")
        elif fm.get("status") == "pending":
            findings.append(f"STATUS-pending outside pending/: {f}")
        if fm.get("hit_count", "0") == "0" and fm.get("status") == "approved":
            findings.append(f"NEVER-USED approved lesson (candidate to archive): {f}")

    for f, target in supersedes:
        if target.strip('"') not in ids:
            findings.append(f"DANGLING supersedes in {f}: {target}")

    for mem in root.rglob("MEMORY.md"):
        n = len(mem.read_text(encoding="utf-8"))
        if n > CAPACITY * 0.8:
            findings.append(f"CAPACITY {n}/{CAPACITY}: {mem} — consolidate")

    print("\n".join(findings) or "memory: clean")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "memory")))
