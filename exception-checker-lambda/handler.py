import json
import os
from datetime import datetime, timezone

import anthropic
from supabase import create_client, Client

MODEL = "claude-opus-4-8"
MAX_TURNS = 25

_anthropic_client = anthropic.Client(api_key=os.environ.get("ANTHROPIC_API_KEY"))
_supabase_client = create_client(
    supabase_url=os.environ.get("SUPABASE_URL"),
    supabase_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
)

NON_TERMINAL_STATUSES = ["pending", "processing", "shipped", "exception"]

TOOLS = [
    {
        "name": "list_candidate_orders",
        "description": (
            "List orders that are not yet in a terminal state (delivered or cancelled), "
            "most recently placed first. Use this to find orders worth investigating. "
            "Call again with a different offset to page through more if you want to look "
            "beyond the first batch."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "statuses": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Order statuses to include. Defaults to all non-terminal statuses.",
                },
                "limit": {"type": "integer", "description": "Max rows to return, capped at 50.", "default": 20},
                "offset": {"type": "integer", "description": "Rows to skip, for pagination.", "default": 0},
            },
            "required": [],
        },
    },
    {
        "name": "get_order_context",
        "description": (
            "Fetch full detail for one order: the order row, its shipment(s), and the "
            "inventory row for its product. Call this before flagging an exception."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"],
        },
    },
    {
        "name": "flag_exception",
        "description": (
            "Record that an order needs human attention. Upserts on (order_id, "
            "exception_type), so calling this again for the same order/type updates "
            "the existing finding instead of duplicating it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "exception_type": {
                    "type": "string",
                    "description": (
                        "Short category, e.g. shipping_delay, inventory_shortage, "
                        "stuck_processing, address_issue, payment_issue, quantity_mismatch."
                    ),
                },
                "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "summary": {"type": "string", "description": "What's wrong, in 1-3 sentences."},
                "recommended_action": {"type": "string", "description": "The concrete next step a human should take."},
                "evidence": {
                    "type": "object",
                    "description": "The specific field values that justify this flag.",
                },
            },
            "required": ["order_id", "exception_type", "severity", "summary", "recommended_action", "evidence"],
        },
    },
    {
        "name": "resolve_exception",
        "description": "Mark a previously flagged exception as resolved because the underlying condition has cleared.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "exception_type": {"type": "string"},
                "resolution_note": {"type": "string"},
            },
            "required": ["order_id", "exception_type", "resolution_note"],
        },
    },
    {
        "name": "finish_triage",
        "description": (
            "Call this when you've reviewed a reasonable batch of candidate orders and "
            "have no more to investigate this run. Ends the session."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "orders_reviewed": {"type": "integer"},
                "notes": {"type": "string", "description": "Brief summary of this triage run."},
            },
            "required": ["orders_reviewed"],
        },
    },
]


def _list_candidate_orders(statuses=None, limit=20, offset=0):
    limit = max(1, min(int(limit or 20), 50))
    offset = max(0, int(offset or 0))
    statuses = statuses or NON_TERMINAL_STATUSES

    result = (
        _supabase_client.table("orders")
        .select("*")
        .in_("order_status", statuses)
        .order("order_date", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"orders": result.data, "count": len(result.data)}


def _get_order_context(order_id):
    order_rows = _supabase_client.table("orders").select("*").eq("order_id", order_id).execute().data
    if not order_rows:
        return {"error": f"no order found with order_id={order_id}"}
    order = order_rows[0]

    shipments = _supabase_client.table("shipments").select("*").eq("order_id", order_id).execute().data
    inventory = (
        _supabase_client.table("inventory").select("*").eq("product_id", order["product_id"]).execute().data
    )

    return {
        "order": order,
        "shipments": shipments,
        "inventory": inventory[0] if inventory else None,
    }


def _flag_exception(order_id, exception_type, severity, summary, recommended_action, evidence):
    row = {
        "order_id": order_id,
        "exception_type": exception_type,
        "severity": severity,
        "status": "open",
        "summary": summary,
        "recommended_action": recommended_action,
        "evidence": evidence,
        "resolved_at": None,
    }
    (
        _supabase_client.table("order_exceptions")
        .upsert(row, on_conflict="order_id,exception_type", default_to_null=False)
        .execute()
    )
    return {"ok": True}


def _resolve_exception(order_id, exception_type, resolution_note):
    (
        _supabase_client.table("order_exceptions")
        .update({
            "status": "resolved",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "recommended_action": f"Resolved: {resolution_note}",
        })
        .eq("order_id", order_id)
        .eq("exception_type", exception_type)
        .execute()
    )
    return {"ok": True}


TOOL_FUNCTIONS = {
    "list_candidate_orders": _list_candidate_orders,
    "get_order_context": _get_order_context,
    "flag_exception": _flag_exception,
    "resolve_exception": _resolve_exception,
}


def _run_tool(name, tool_input):
    if name == "finish_triage":
        return tool_input
    func = TOOL_FUNCTIONS.get(name)
    if not func:
        return {"error": f"unknown tool {name}"}
    try:
        return func(**tool_input)
    except Exception as exc:
        return {"error": str(exc)}


SYSTEM_PROMPT = """You are an order-exception triage agent for an e-commerce operations team.
Use your tools to investigate orders and decide which ones genuinely need human attention.

Signals worth investigating are not an exhaustive checklist -- use judgment -- but include:
- order_status is 'exception', or a shipment's shipment_status is 'exception'
- a shipment has a delay_reason set, or actual_ship_date is well past expected_ship_date
- estimated_delivery_date has passed but shipment_status isn't 'delivered'
- an order has sat in 'processing' far longer than its fulfillment_priority implies
- inventory_status is 'out_of_stock' or 'low_stock' for a product tied to a pending order
- reserved_quantity for the product doesn't cover the order's quantity
- order_total looks inconsistent with quantity * unit_price

A good recommended_action is something a human can actually go do, not "investigate further."
Most orders in a healthy pipeline are fine -- only flag ones with real, evidenced problems.

Review at most {max_orders} orders this run, then call finish_triage.
"""


def lambda_handler(event, context):
    event = event or {}
    max_orders = int(event.get("max_orders", 30))

    messages = [
        {"role": "user", "content": "Run a triage pass now. Start by listing candidate orders."}
    ]

    orders_reviewed = 0
    exceptions_flagged = 0
    turns_used = 0
    finish_notes = None

    for turn in range(MAX_TURNS):
        turns_used = turn + 1
        response = _anthropic_client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM_PROMPT.format(max_orders=max_orders),
            tools=TOOLS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        tool_uses = [block for block in response.content if block.type == "tool_use"]
        if not tool_uses:
            break

        tool_results = []
        done = False
        for block in tool_uses:
            if block.name == "get_order_context":
                orders_reviewed += 1
            elif block.name == "flag_exception":
                exceptions_flagged += 1
            elif block.name == "finish_triage":
                finish_notes = block.input
                done = True

            result = _run_tool(block.name, block.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, default=str),
            })

        messages.append({"role": "user", "content": tool_results})

        if done:
            break

    return {
        "statusCode": 200,
        "body": json.dumps({
            "turns_used": turns_used,
            "orders_reviewed": orders_reviewed,
            "exceptions_flagged": exceptions_flagged,
            "finish_notes": finish_notes,
        }),
    }
