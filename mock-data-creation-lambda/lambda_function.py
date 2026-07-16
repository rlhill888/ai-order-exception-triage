import os
import random
import string
import uuid
import anthropic
import json
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled", "exception"]
ORDER_STATUS_WEIGHTS = [10, 15, 25, 35, 5, 10]

FULFILLMENT_PRIORITIES = ["standard", "expedited", "rush"]
FULFILLMENT_WEIGHTS = [70, 22, 8]

SHIPPING_METHODS = ["ground", "express", "overnight", "freight"]
SHIPPING_WEIGHTS = [55, 25, 12, 8]
TRANSIT_DAYS_BY_METHOD = {"ground": 5, "express": 2, "overnight": 1, "freight": 8}

SHIP_STATUS_BY_ORDER_STATUS = {
    "processing": "pending",
    "shipped": "in_transit",
    "delivered": "delivered",
    "exception": "exception",
}

CARRIERS = ["UPS", "FedEx", "USPS", "DHL"]
WAREHOUSES = ["Dallas, TX", "Reno, NV", "Columbus, OH", "Atlanta, GA", "Newark, NJ"]

_anthropic_client = anthropic.Client(api_key=os.environ.get("ANTHROPIC_API_KEY"))
_supabase_client = create_client(
            supabase_url=os.environ.get("SUPABASE_URL"),
            supabase_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        )

def _generate_products(count: int) -> list[dict]:
    schema = {
        "type": "object", 
        "properties": {
            "products": {
                "type": "array", 
                "items": {
                    "type": "object",
                    "properties": {
                        "product_name": {"type": "string"},
                        "category": {"type": "string"},
                        "sku_suffix": {
                            "type": "string",
                            "description": "Short variant code like BLK-XL or 128GB"
                        },
                        "base_price": {"type": "number"}
                    },
                    "required": ["product_name", "category", "sku_suffix", "base_price"],
                    "additionalProperties": False
                }

                }
            }, 
            "required": ["products"], "additionalProperties": False
            }


    response = _anthropic_client.messages.create(
        model="claude-opus-4-8",
        max_tokens=8000,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[
            {
                "role": "user", "content": f"Generate {count} realistic, diverse e-commerce products spanning categories "
                "like electronics, home goods, apparel, kitchen, and outdoor gear. Use "
                "plausible retail prices appropriate to each category. Ensure no two "
                "products are near-duplicates of each other."
            }
        ],
    )

    # extract the text block, json.loads it, return the "products" list
    return json.loads(response.content[0].text)["products"]


def _generate_customers(count: int) -> list[dict]:
    schema = {
        "type": "object",
        "properties": {
            "customers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string"}
                    },
                    "required": ["name", "email"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["customers"],
        "additionalProperties": False
    }

    response = _anthropic_client.messages.create(
        model="claude-opus-4-8",
        max_tokens=6000,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[
            {
                "role": "user",
                "content": f"Generate {count} realistic, diverse customer name + email pairs "
                "for a US e-commerce site. Emails should plausibly derive from the name "
                "(e.g. combinations of first/last name, initials, or numbers). Ensure no "
                "two customers are near-duplicates of each other."
            }
        ],
    )

    return json.loads(response.content[0].text)["customers"]


def _generate_delay_reasons(count: int) -> list[str]:
    schema = {
        "type": "object",
        "properties": {
            "delay_reasons": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["delay_reasons"],
        "additionalProperties": False
    }

    response = _anthropic_client.messages.create(
        model="claude-opus-4-8",
        max_tokens=3000,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[
            {
                "role": "user",
                "content": f"Generate {count} short, realistic reasons a shipment could be "
                "delayed or flagged as an exception in an order fulfillment system "
                "(e.g. carrier delays, address issues, inventory mismatches, damage in "
                "transit). One sentence each. Ensure no two reasons are near-duplicates "
                "of each other."
            }
        ],
    )

    return json.loads(response.content[0].text)["delay_reasons"]


def _build_inventory(products: list[dict], run_token: str):
    rows = []
    prices = {}
    now = datetime.now(timezone.utc)

    for i, p in enumerate(products, start=1):
        product_id = f"PROD-{run_token}-{i:04d}"

        warehouse_qty = random.randint(0, 500)
        reserved_qty = random.randint(0, min(warehouse_qty, 50))
        store_qty = random.randint(0, 100)
        reorder_threshold = random.randint(10, 60)
        total_available = warehouse_qty + store_qty

        if total_available == 0:
            status = "out_of_stock"
        elif total_available <= reorder_threshold:
            status = "low_stock"
        elif random.random() < 0.03:
            status = "discontinued"
        else:
            status = "in_stock"

        category_code = "".join(ch for ch in p["category"].upper() if ch.isalnum())[:4] or "GEN"
        sku = f"{category_code}-{p['sku_suffix']}-{i:04d}"[:50]

        rows.append({
            "product_id": product_id,
            "product_name": p["product_name"][:150],
            "sku": sku,
            "warehouse_quantity": warehouse_qty,
            "reserved_quantity": reserved_qty,
            "store_quantity": store_qty,
            "reorder_threshold": reorder_threshold,
            "inventory_last_updated": (now - timedelta(days=random.randint(0, 14))).isoformat(),
            "inventory_status": status,
        })
        prices[product_id] = round(float(p["base_price"]), 2)

    return rows, prices


def _build_orders(inventory_rows: list[dict], prices: dict, customers: list[dict], count: int, run_token: str):
    now = datetime.now(timezone.utc)
    orders = []

    for i in range(1, count + 1):
        product = random.choice(inventory_rows)
        product_id = product["product_id"]
        unit_price = round(prices[product_id] * random.uniform(0.9, 1.15), 2)
        quantity = random.randint(1, 5)
        customer = random.choice(customers)

        orders.append({
            "order_id": f"ORD-{run_token}-{i:04d}",
            "customer_name": customer["name"][:100],
            "customer_email": customer["email"][:150],
            "order_date": (now - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23))).isoformat(),
            "product_id": product_id,
            "product_name": product["product_name"],
            "quantity": quantity,
            "unit_price": unit_price,
            "order_total": round(unit_price * quantity, 2),
            "order_status": random.choices(ORDER_STATUSES, weights=ORDER_STATUS_WEIGHTS, k=1)[0],
            "fulfillment_priority": random.choices(FULFILLMENT_PRIORITIES, weights=FULFILLMENT_WEIGHTS, k=1)[0],
            "shipping_method": random.choices(SHIPPING_METHODS, weights=SHIPPING_WEIGHTS, k=1)[0],
        })

    return orders


def _build_shipments(orders: list[dict], delay_reasons: list[str], run_token: str):
    shipments = []
    i = 0

    for order in orders:
        if order["order_status"] not in SHIP_STATUS_BY_ORDER_STATUS:
            continue
        i += 1

        shipment_status = SHIP_STATUS_BY_ORDER_STATUS[order["order_status"]]
        order_date = datetime.fromisoformat(order["order_date"])
        expected_ship = order_date + timedelta(days=random.randint(1, 3))

        is_delayed = shipment_status == "exception" or random.random() < 0.08
        if shipment_status == "pending":
            actual_ship = None
        else:
            jitter_days = random.randint(2, 6) if is_delayed else random.randint(-1, 1)
            actual_ship = expected_ship + timedelta(days=jitter_days)

        transit_days = TRANSIT_DAYS_BY_METHOD.get(order["shipping_method"], 5)
        estimated_delivery = (actual_ship or expected_ship) + timedelta(days=transit_days)

        tracking_number = "".join(random.choices(string.ascii_uppercase + string.digits, k=12))

        shipments.append({
            "shipment_id": f"SHIP-{run_token}-{i:04d}",
            "order_id": order["order_id"],
            "shipment_status": shipment_status,
            "expected_ship_date": expected_ship.isoformat(),
            "actual_ship_date": actual_ship.isoformat() if actual_ship else None,
            "estimated_delivery_date": estimated_delivery.isoformat(),
            "tracking_number": tracking_number,
            "carrier": random.choice(CARRIERS),
            "warehouse_location": random.choice(WAREHOUSES),
            "shipment_last_updated": datetime.now(timezone.utc).isoformat(),
            "delay_reason": random.choice(delay_reasons)[:255] if is_delayed else None,
        })

    return shipments


def lambda_handler(event, context):
    event = event or {}
    num_products = int(event.get("num_products", 30))
    num_customers = int(event.get("num_customers", 40))
    num_orders = int(event.get("num_orders", 60))

    # Distinguishes IDs across repeated invocations so primary keys never collide.
    run_token = uuid.uuid4().hex[:6].upper()

    products = _generate_products(num_products)
    customers = _generate_customers(num_customers)
    delay_reasons = _generate_delay_reasons(max(10, num_orders // 4))

    inventory_rows, prices = _build_inventory(products, run_token)
    order_rows = _build_orders(inventory_rows, prices, customers, num_orders, run_token)
    shipment_rows = _build_shipments(order_rows, delay_reasons, run_token)

    _supabase_client.table("inventory").insert(inventory_rows).execute()
    _supabase_client.table("orders").insert(order_rows).execute()
    _supabase_client.table("shipments").insert(shipment_rows).execute()

    return {
        "statusCode": 200,
        "body": json.dumps({
            "inventory_rows": len(inventory_rows),
            "order_rows": len(order_rows),
            "shipment_rows": len(shipment_rows),
        }),
    }
