import Link from "next/link";
import { SeverityBadge, StatusBadge } from "@/app/components/Badges";
import { listExceptions, type ExceptionFilter } from "@/app/lib/data";

export const dynamic = "force-dynamic";

const FILTERS: { value: ExceptionFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

function isExceptionFilter(value: string | undefined): value is ExceptionFilter {
  return value === "open" || value === "resolved" || value === "all";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter: ExceptionFilter = isExceptionFilter(params.status) ? params.status : "open";

  let exceptions: Awaited<ReturnType<typeof listExceptions>> = [];
  let loadError: string | null = null;
  try {
    exceptions = await listExceptions(filter);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <main className="flex flex-1 flex-col px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Order Exceptions
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {exceptions.length} {filter === "all" ? "" : filter} exception
            {exceptions.length === 1 ? "" : "s"}
          </p>
        </div>
        <nav className="flex gap-1 rounded-full border border-black/[.08] p-1 dark:border-white/[.145]">
          {FILTERS.map((item) => (
            <Link
              key={item.value}
              href={item.value === "open" ? "/" : `/?status=${item.value}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === item.value
                  ? "bg-foreground text-background"
                  : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.05]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Couldn&apos;t load exceptions: {loadError}
        </div>
      )}

      {!loadError && exceptions.length === 0 && (
        <div className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
          No {filter === "all" ? "" : filter} exceptions found. Try running the exception
          triage lambda from the menu above.
        </div>
      )}

      {!loadError && exceptions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[.02] text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[.03] dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {exceptions.map((exception) => (
                <tr
                  key={`${exception.order_id}:${exception.exception_type}`}
                  className="transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.04]"
                >
                  <td className="px-4 py-3">
                    <SeverityBadge severity={exception.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/exceptions/${encodeURIComponent(
                        exception.order_id
                      )}/${encodeURIComponent(exception.exception_type)}`}
                      className="font-medium text-black hover:underline dark:text-zinc-50"
                    >
                      {exception.order_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {exception.order?.customer_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-zinc-600 dark:text-zinc-400">
                    {exception.exception_type.replaceAll("_", " ")}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {exception.summary}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={exception.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDate(exception.resolved_at ?? exception.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

