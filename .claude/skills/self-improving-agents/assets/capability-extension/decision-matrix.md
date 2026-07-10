# Extending an agent's capabilities: tool vs MCP server vs skill

## Decision matrix

| Question | Custom tool | MCP server | Skill (SKILL.md) |
|---|---|---|---|
| What it adds | New executable capability (code you write) | Existing external capability (code someone runs) | Knowledge/procedure using capabilities the agent already has |
| Runtime cost | In-process, lowest latency | Separate process/network hop | Zero (text loaded on demand) |
| Reuse | This agent/app only | Any MCP-capable agent, any host | Any agent that reads the format |
| Auth | You handle it | Server handles OAuth/mTLS/tokens | None needed |
| Who can create it | Developer | Developer/vendor | Developer, user, OR THE AGENT ITSELF |
| Trust posture | Your code | Treat third-party servers/tools as untrusted code | Treat third-party skills as untrusted code |
| Goes stale? | Compiles/tests catch it | Version drift | Silently — needs review_by dates |

## Choose in this order (cheapest adequate mechanism wins)

1. Prompt line / memory lesson — is this just knowledge? → `memory/` (see assets/memory/LAYOUT.md)
2. Skill — a repeatable multi-step procedure over EXISTING tools? → SKILL.md
3. Custom tool — needs new code, side effects, or tight latency? → tool_template.py
4. MCP server — capability already exists as a service, or must be shared
   across agents/hosts, or needs managed auth? → mcp-servers.template.yaml

Also: want other agents to use YOUR agent? Expose it as an MCP server.

## Self-authoring (the agent extends itself) — skills ONLY

Agents may draft skills; they may NOT define new tools or MCP servers for
themselves (that changes the permission surface — humans only).

Triggers worth a draft: task took >= 5 tool calls and will recur; recovery
after an error/dead-end; a user correction; a discovered non-obvious workflow.

Flow: draft with SKILL-authoring.template.md → stage under `skills/pending/` →
safety scan → human reviews diff → approve (move to `skills/`) or reject.
