export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "exception";

export type ShipmentStatus = "pending" | "in_transit" | "delivered" | "exception";

export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock" | "discontinued";

export type ExceptionSeverity = "low" | "medium" | "high" | "critical";

export type ExceptionStatus = "open" | "resolved";

export type Order = {
  order_id: string;
  customer_name: string;
  customer_email: string;
  order_date: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  order_total: number;
  order_status: OrderStatus;
  fulfillment_priority: string;
  shipping_method: string;
};

export type Shipment = {
  shipment_id: string;
  order_id: string;
  shipment_status: ShipmentStatus;
  expected_ship_date: string;
  actual_ship_date: string | null;
  estimated_delivery_date: string;
  tracking_number: string;
  carrier: string;
  warehouse_location: string;
  shipment_last_updated: string;
  delay_reason: string | null;
};

export type Inventory = {
  product_id: string;
  product_name: string;
  sku: string;
  warehouse_quantity: number;
  reserved_quantity: number;
  store_quantity: number;
  reorder_threshold: number;
  inventory_last_updated: string;
  inventory_status: InventoryStatus;
};

export type OrderException = {
  order_id: string;
  exception_type: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  summary: string;
  recommended_action: string;
  evidence: Record<string, unknown>;
  resolved_at: string | null;
  created_at?: string;
};

export type OrderExceptionWithOrder = OrderException & {
  order: Order | null;
};

export type ExceptionDetail = {
  exception: OrderException;
  order: Order | null;
  shipments: Shipment[];
  inventory: Inventory | null;
};
