"""Tool stubs for the support bot. Return canned data; no real backend."""
import json

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_order",
            "description": "Look up an order by id",
            "parameters": {
                "type": "object",
                "properties": {"order_id": {"type": "string"}},
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "issue_refund",
            "description": "Issue a refund for an order",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                    "amount": {"type": "number"},
                },
                "required": ["order_id", "amount"],
            },
        },
    },
]

_ORDERS = {
    "ORD-1001": {"status": "delivered", "total": 40.0, "customer": "basic"},
    "ORD-2002": {"status": "delivered_late", "total": 450.0, "customer": "prime"},
}


def lookup_order(order_id):
    order = _ORDERS.get(order_id)
    if not order:
        return json.dumps({"error": f"order {order_id} not found"})
    return json.dumps({"order_id": order_id, **order})


def issue_refund(order_id, amount):
    if amount > 200:
        return json.dumps({
            "ok": False,
            "error": "refund amount exceeds the $200 automatic limit",
        })
    return json.dumps({"ok": True, "order_id": order_id, "refunded": amount})


def dispatch_tool(name, raw_args):
    args = json.loads(raw_args)
    if name == "lookup_order":
        return lookup_order(**args)
    if name == "issue_refund":
        return issue_refund(**args)
    return json.dumps({"error": f"unknown tool {name}"})
