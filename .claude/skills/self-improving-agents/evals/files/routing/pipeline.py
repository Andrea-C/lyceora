"""Research-assistant pipeline. All four roles call the same hardcoded model."""

MODEL = "claude-opus-4-1"


def call_llm(model, prompt):
    """Stubbed LLM call — the real client lives elsewhere; signature is what matters."""
    raise NotImplementedError("wire a provider client here")


def run_orchestrator(user_request, findings=None):
    prompt = f"Plan and answer the research request: {user_request}\nFindings so far: {findings}"
    return call_llm(MODEL, prompt)


def run_researcher(source_url):
    prompt = f"Read {source_url} and extract findings relevant to the current task."
    return call_llm(MODEL, prompt)


def run_summarizer(document_text):
    prompt = f"Compress this document to <500 tokens, keep numbers and names:\n{document_text}"
    return call_llm(MODEL, prompt)


def run_critic(draft):
    prompt = f"Review this draft for unsupported claims and missing citations:\n{draft}"
    return call_llm(MODEL, prompt)
