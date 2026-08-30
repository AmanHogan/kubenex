"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuCircleCheck,
  LuCircleX,
  LuRefreshCw,
  LuHistory,
  LuChevronDown,
  LuChevronRight,
  LuSquareTerminal,
  LuClock,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

interface HistoryEntry {
  id: number;
  statement: string;
  source: string;
  status: string;
  error: string | null;
  rowCount: number | null;
  truncated: boolean;
  durationMs: number;
  startedAt: string;
}

const STATUS_STYLES: Record<
  string,
  { icon: typeof LuCircleCheck; className: string; label: string }
> = {
  success: {
    icon: LuCircleCheck,
    className: "text-emerald-400 bg-emerald-500/10",
    label: "Success",
  },
  error: {
    icon: LuCircleX,
    className: "text-red-400 bg-red-500/10",
    label: "Error",
  },
};

const ALL_STATUSES = ["all", "success", "error"] as const;

/** Compact relative time — history is scanned, not read precisely. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Collapse whitespace so multi-line SQL fits on a single table row. */
function oneLine(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

export default function QueryHistoryPage(): React.JSX.Element {
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchHistory = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/history?limit=200");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setEntries(data.entries ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // Deferred to a microtask so the effect body itself does not call
    // setState synchronously; the callback stays reusable by the Refresh
    // button, which an inlined effect would not allow.
    void Promise.resolve().then(() => {
      if (alive) void fetchHistory();
    });
    return () => {
      alive = false;
    };
  }, [fetchHistory]);

  /** Hand the statement to the SQL editor via sessionStorage.
   *  A URL param would break on long queries. */
  function openInEditor(statement: string): void {
    try {
      sessionStorage.setItem("kubenex:pending-query", statement);
    } catch {
      // Private-mode browsers can refuse sessionStorage; navigation still works.
    }
    router.push("/sql");
  }

  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.status === filter);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Query History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every statement run against Spark SQL, from any surface.
          </p>
        </div>
        <button
          onClick={() => void fetchHistory()}
          className="flex items-center gap-1.5 rounded-lg border-2 border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <LuRefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "all"
              ? `All (${entries.length})`
              : `${s} (${entries.filter((e) => e.status === s).length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border-2 border-border/60 bg-card"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center">
          <LuHistory className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No queries yet. Run something in the SQL Editor.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-border/60">
          <div className="grid grid-cols-[100px_1fr_110px_90px_90px_90px] gap-px border-b border-border/40 bg-muted/50 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Status</span>
            <span>Statement</span>
            <span>Source</span>
            <span className="text-right">Rows</span>
            <span className="text-right">Duration</span>
            <span className="text-right">When</span>
          </div>

          {filtered.map((entry) => {
            const style = STATUS_STYLES[entry.status] ?? {
              icon: LuClock,
              className: "text-muted-foreground bg-muted",
              label: entry.status,
            };
            const StatusIcon = style.icon;
            const isExpanded = expanded === entry.id;

            return (
              <div key={entry.id}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : entry.id)}
                  className={cn(
                    "grid w-full grid-cols-[100px_1fr_110px_90px_90px_90px] items-center gap-px border-b border-border/40 bg-card px-5 py-3 text-left transition-colors hover:bg-muted/30",
                    isExpanded && "bg-muted/20"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      style.className
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {style.label}
                  </span>
                  <span className="flex items-center gap-2 truncate font-mono text-xs text-foreground">
                    {isExpanded ? (
                      <LuChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <LuChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{oneLine(entry.statement)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.source}
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {entry.rowCount ?? "—"}
                    {entry.truncated && "+"}
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {formatDuration(entry.durationMs)}
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {relativeTime(entry.startedAt)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-b border-border/40 bg-muted/10 px-5 py-4">
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-card px-3 py-2 font-mono text-xs text-foreground">
                      {entry.statement}
                    </pre>

                    {entry.error && (
                      <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {entry.error}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() => openInEditor(entry.statement)}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <LuSquareTerminal className="h-3 w-3" />
                        Open in SQL Editor
                      </button>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {new Date(entry.startedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
