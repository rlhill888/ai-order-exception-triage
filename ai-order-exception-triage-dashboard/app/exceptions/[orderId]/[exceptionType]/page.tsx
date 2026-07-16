import Link from "next/link";
import { notFound } from "next/navigation";
import { SeverityBadge, StatusBadge } from "@/app/components/Badges";
import { getExceptionDetail } from "@/app/lib/data";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/[.08] p-5 dark:border-white/[.145]">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-black dark:text-zinc-50">{value}</dd>
    </div>
  );
}

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ orderId: string; exceptionType: string }>;
}) {
  const { orderId, exceptionType } = await params;
  const decodedOrderId = decodeURIComponent(orderId);
  const decodedExceptionType = decodeURIComponent(exceptionType);

  let detail: Awaited<ReturnType<typeof getExceptionDetail>> = null;
  let loadError: string | null = null;
  try {
    detail = await getExceptionDetail(decodedOrderId, decodedExceptionType);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  const backLink = (
    <div>
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Back to exceptions
      </Link>
    </div>
  );

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col gap-6 px-8 py-8">
        {backLink}
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Couldn&apos;t load this exception: {loadError}
        </div>
      </main>
    );
  }

  if (!detail) {
    notFound();
  }

  const { exception, order, shipments, inventory } = detail;

  return (
    <main className="flex flex-1 flex-col gap-6 px-8 py-8">
      {backLink}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {decodedOrderId}
          </h1>
          <p className="mt-1 capitalize text-zinc-600 dark:text-zinc-400">
            {exception.exception_type.replaceAll("_", " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <SeverityBadge severity={exception.severity} />
          <StatusBadge status={exception.status} />
        </div>
      </div>

      <Card title="Exception">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Summary" value={exception.summary} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Recommended action" value={exception.recommended_action} />
          </div>
          <Field label="Flagged" value={formatDate(exception.created_at)} />
          <Field label="Resolved" value={formatDate(exception.resolved_at)} />
        </dl>
        {exception.evidence && Object.keys(exception.evidence).length > 0 && (
          <div className="mt-4">
            <dt className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Evidence</dt>
            <pre className="overflow-x-auto rounded-lg bg-black/[.03] p-3 text-xs text-zinc-700 dark:bg-white/[.05] dark:text-zinc-300">
              {JSON.stringify(exception.evidence, null, 2)}
            </pre>
          </div>
        )}
      </Card>

      {order ? (
        <Card title="Order">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Customer" value={order.customer_name} />
            <Field label="Email" value={order.customer_email} />
            <Field label="Order status" value={<span className="capitalize">{order.order_status}</span>} />
            <Field label="Product" value={order.product_name} />
            <Field label="Quantity" value={order.quantity} />
            <Field label="Unit price" value={formatCurrency(order.unit_price)} />
            <Field label="Order total" value={formatCurrency(order.order_total)} />
            <Field
              label="Fulfillment priority"
              value={<span className="capitalize">{order.fulfillment_priority}</span>}
            />
            <Field
              label="Shipping method"
              value={<span className="capitalize">{order.shipping_method}</span>}
            />
            <Field label="Order date" value={formatDate(order.order_date)} />
          </dl>
        </Card>
      ) : (
        <Card title="Order">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No order found with id {decodedOrderId}.
          </p>
        </Card>
      )}

      <Card title="Shipments">
        {shipments.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No shipments for this order.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {shipments.map((shipment) => (
              <div
                key={shipment.shipment_id}
                className="rounded-lg border border-black/[.06] p-4 dark:border-white/[.1]"
              >
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field
                    label="Status"
                    value={<span className="capitalize">{shipment.shipment_status}</span>}
                  />
                  <Field label="Carrier" value={shipment.carrier} />
                  <Field label="Tracking #" value={shipment.tracking_number} />
                  <Field label="Warehouse" value={shipment.warehouse_location} />
                  <Field label="Expected ship" value={formatDate(shipment.expected_ship_date)} />
                  <Field label="Actual ship" value={formatDate(shipment.actual_ship_date)} />
                  <Field
                    label="Estimated delivery"
                    value={formatDate(shipment.estimated_delivery_date)}
                  />
                  <Field label="Last updated" value={formatDate(shipment.shipment_last_updated)} />
                  {shipment.delay_reason && (
                    <div className="sm:col-span-3">
                      <Field label="Delay reason" value={shipment.delay_reason} />
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}
      </Card>

      {inventory && (
        <Card title="Inventory">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="SKU" value={inventory.sku} />
            <Field
              label="Status"
              value={<span className="capitalize">{inventory.inventory_status}</span>}
            />
            <Field label="Warehouse qty" value={inventory.warehouse_quantity} />
            <Field label="Reserved qty" value={inventory.reserved_quantity} />
            <Field label="Store qty" value={inventory.store_quantity} />
            <Field label="Reorder threshold" value={inventory.reorder_threshold} />
            <Field label="Last updated" value={formatDate(inventory.inventory_last_updated)} />
          </dl>
        </Card>
      )}
    </main>
  );
}
