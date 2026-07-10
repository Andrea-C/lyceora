"""Provider-neutral custom tool definition.

The spec is one JSON-Schema dict; thin adapters map it to each api_mode:
  anthropic_messages: {"name", "description", "input_schema": PARAMETERS}
  chat_completions:   {"type": "function", "function": {"name", "description",
                       "parameters": PARAMETERS}}
  gemini:             {"function_declarations": [{"name", "description",
                       "parameters": PARAMETERS}]}
"""
TOOL_SPEC = {
    "name": "lookup_order",
    # Write the description for the model, not for docs: say WHEN to call it,
    # not just what it does.
    "description": ("Look up an order by id. Returns status, total, and refund "
                    "eligibility. Use before any refund action."),
    "parameters": {
        "type": "object",
        "properties": {
            "order_id": {"type": "string", "description": "e.g. ORD-4821"},
            "include_history": {"type": "boolean", "default": False},
        },
        "required": ["order_id"],
    },
}


def handle(args: dict) -> dict:
    """Executor. Return a JSON-serializable result; raise an error with a
    model-readable message on failure (the model will read it and adapt)."""
    ...


# Register centrally so tools self-register at import time and the dispatch
# layer discovers them from one registry:
#   REGISTRY.register(TOOL_SPEC, handle, toolset="orders")
