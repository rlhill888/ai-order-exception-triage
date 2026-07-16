"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  refreshExceptions,
  triggerExceptionCheckerLambda,
  triggerMockDataLambda,
  type LambdaTriggerResult,
} from "@/app/lib/actions";

type ActionKey = "mockData" | "exceptionChecker";

const ACTIONS: {
  key: ActionKey;
  label: string;
  description: string;
  run: () => Promise<LambdaTriggerResult>;
}[] = [
  {
    key: "mockData",
    label: "Generate mock data",
    description: "Seeds new products, customers, orders, and shipments.",
    run: triggerMockDataLambda,
  },
  {
    key: "exceptionChecker",
    label: "Run exception triage",
    description: "Reviews open orders and flags new exceptions.",
    run: triggerExceptionCheckerLambda,
  },
];

export default function LambdaMenu() {
  const [open, setOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<ActionKey | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleRun(action: (typeof ACTIONS)[number]) {
    setPendingKey(action.key);
    setMessages((prev) => ({ ...prev, [action.key]: "" }));
    const result = await action.run();
    setPendingKey(null);
    setMessages((prev) => ({
      ...prev,
      [action.key]: result.ok
        ? "Started — this can take a minute or two. Refresh to see new data."
        : `Failed: ${result.error}`,
    }));
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Run Lambdas
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-black/[.08] bg-white p-2 shadow-lg dark:border-white/[.145] dark:bg-zinc-900"
        >
          {ACTIONS.map((action) => (
            <div key={action.key} className="rounded-lg p-2 hover:bg-black/[.03] dark:hover:bg-white/[.05]">
              <button
                type="button"
                role="menuitem"
                disabled={pendingKey === action.key}
                onClick={() => handleRun(action)}
                className="w-full text-left disabled:opacity-60"
              >
                <div className="text-sm font-medium text-black dark:text-zinc-50">
                  {pendingKey === action.key ? "Triggering…" : action.label}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{action.description}</div>
                {messages[action.key] && (
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {messages[action.key]}
                  </div>
                )}
              </button>
            </div>
          ))}

          <div className="mt-1 border-t border-black/[.08] p-2 dark:border-white/[.145]">
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await refreshExceptions();
                setOpen(false);
              })}
              className="w-full rounded-lg text-left text-sm font-medium text-zinc-600 hover:text-black disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {isPending ? "Refreshing…" : "Refresh list"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
