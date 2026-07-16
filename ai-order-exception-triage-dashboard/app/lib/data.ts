import "server-only";
import { getSupabaseClient } from "./supabase";
import type {
  ExceptionDetail,
  ExceptionStatus,
  Order,
  OrderException,
  OrderExceptionWithOrder,
} from "./types";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type ExceptionFilter = ExceptionStatus | "all";

export async function listExceptions(
  filter: ExceptionFilter
): Promise<OrderExceptionWithOrder[]> {
  const supabase = getSupabaseClient();

  let query = supabase.from("order_exceptions").select("*");
  if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data: exceptions, error } = await query;
  if (error) throw new Error(`Failed to load order_exceptions: ${error.message}`);

  const rows = (exceptions ?? []) as OrderException[];
  const orderIds = [...new Set(rows.map((row) => row.order_id))];

  let ordersById: Record<string, Order> = {};
  if (orderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .in("order_id", orderIds);
    if (ordersError) throw new Error(`Failed to load orders: ${ordersError.message}`);
    ordersById = Object.fromEntries(
      ((orders ?? []) as Order[]).map((order) => [order.order_id, order])
    );
  }

  return rows
    .map((row) => ({ ...row, order: ordersById[row.order_id] ?? null }))
    .sort((a, b) => {
      const severityDelta =
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      if (severityDelta !== 0) return severityDelta;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
}

export async function getExceptionDetail(
  orderId: string,
  exceptionType: string
): Promise<ExceptionDetail | null> {
  const supabase = getSupabaseClient();

  const { data: exceptionRows, error: exceptionError } = await supabase
    .from("order_exceptions")
    .select("*")
    .eq("order_id", orderId)
    .eq("exception_type", exceptionType);
  if (exceptionError) {
    throw new Error(`Failed to load order_exceptions: ${exceptionError.message}`);
  }

  const exception = (exceptionRows ?? [])[0] as OrderException | undefined;
  if (!exception) return null;

  const { data: orderRows, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("order_id", orderId);
  if (orderError) throw new Error(`Failed to load order: ${orderError.message}`);
  const order = ((orderRows ?? [])[0] as Order | undefined) ?? null;

  const { data: shipments, error: shipmentsError } = await supabase
    .from("shipments")
    .select("*")
    .eq("order_id", orderId);
  if (shipmentsError) throw new Error(`Failed to load shipments: ${shipmentsError.message}`);

  let inventory = null;
  if (order) {
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("inventory")
      .select("*")
      .eq("product_id", order.product_id);
    if (inventoryError) {
      throw new Error(`Failed to load inventory: ${inventoryError.message}`);
    }
    inventory = (inventoryRows ?? [])[0] ?? null;
  }

  return {
    exception,
    order,
    shipments: shipments ?? [],
    inventory,
  };
}
