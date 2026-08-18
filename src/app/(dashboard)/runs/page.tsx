"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LuCircleCheck,
  LuCircleX,
  LuLoader,
  LuClock,
  LuRefreshCw,
  LuTrash2,
  LuChevronDown,
  LuChevronRight,
  LuHistory,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

interface DagRun {
  dag_id: string;
  dag_run_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  execution_date: string;
  conf: Record<string, unknown> | null;
}

interface TaskInstance {
  task_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  duration: number | null;
  try_number: number;
}

const STATE_STYLES: Record<string, { icon: typeof LuCircleCheck; className: string; label: string }> = {
  success: { icon: LuCircleCheck, className: "text-emerald-400 bg-emerald-500/10", label: "Success" },
  failed: { icon: LuCircleX, className: "text-red-400 bg-red-500/10", label: "Failed" },
  running: { icon: LuLoader, className: "text-blue-400 bg-blue-500/10", label: "Running" },
  queued: { icon: LuClock, className: "text-amber-400 bg-amber-500/10", label: "Queued" },
};

const ALL_STATES = ["all", "success", "failed", "running", "queued"] as const;

export default function RunsPage(): React.JSX.Element {
  const [runs, setRuns] = useState<DagRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRuns = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/runs?limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRuns(data.runs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  async function handleDelete(dagId: string, dagRunId: string): Promise<void> {
    setDeleting(dagRunId);
    try {
      const res = await fetch("/api/runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dag_id: dagId, dag_run_id: dagRunId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setRuns((prev) => prev.filter((r) => r.dag_run_id !== dagRunId));
      if (expandedRun === dagRunId) {
        setExpandedRun(null);
        setTasks([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete run");
    } finally {
      setDeleting(null);
    }
  }

  async function handleExpand(dagId: string, dagRunId: string): Promise<void> {
    if (expandedRun === dagRunId) {
      setExpandedRun(null);
      setTasks([]);
      return;
    }
    setExpandedRun(dagRunId);
    setTasksLoading(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dag_id: dagId, dag_run_id: dagRunId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }

  const filtered = filter === "all" ? runs : runs.filter((r) => r.state === filter);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Run History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View, inspect, and manage DAG run history.
          </p>
        </div>
        <button
          onClick={() => void fetchRuns()}
          className="flex items-center gap-1.5 rounded-lg border-2 border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <LuRefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex gap-2">
        {ALL_STATES.map((s) => (
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
            {s === "all" ? `All (${runs.length})` : `${s} (${runs.filter((r) => r.state === s).length})`}
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
            <div key={i} className="h-14 animate-pulse rounded-xl border-2 border-border/60 bg-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center">
          <LuHistory className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No runs found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-border/60">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_100px_160px_160px_80px] gap-px border-b border-border/40 bg-muted/50 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>DAG</span>
            <span>Run ID</span>
            <span>Status</span>
            <span>Started</span>
            <span>Ended</span>
            <span className="text-right">Actions</span>
          </div>

          {filtered.map((run) => {
            const style = STATE_STYLES[run.state] ?? {
              icon: LuClock,
              className: "text-muted-foreground bg-muted",
              label: run.state,
            };
            const StateIcon = style.icon;
            const isExpanded = expandedRun === run.dag_run_id;

            return (
              <div key={run.dag_run_id}>
                <div
                  className={cn(
                    "grid grid-cols-[1fr_1fr_100px_160px_160px_80px] items-center gap-px border-b border-border/40 bg-card px-5 py-3 transition-colors hover:bg-muted/30",
                    isExpanded && "bg-muted/20"
                  )}
                >
                  <button
                    className="flex items-center gap-2 text-left text-sm font-medium hover:text-primary"
                    onClick={() => void handleExpand(run.dag_id, run.dag_run_id)}
                  >
                    {isExpanded ? (
                      <LuChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <LuChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    {run.dag_id}
                  </button>
                  <span className="truncate text-xs text-muted-foreground font-mono">
                    {run.dag_run_id}
                  </span>
                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      style.className
                    )}
                  >
                    <StateIcon className={cn("h-3 w-3", run.state === "running" && "animate-spin")} />
                    {style.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {run.start_date ? new Date(run.start_date).toLocaleString() : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {run.end_date ? new Date(run.end_date).toLocaleString() : "—"}
                  </span>
                  <div className="flex justify-end">
                    <button
                      onClick={() => void handleDelete(run.dag_id, run.dag_run_id)}
                      disabled={deleting === run.dag_run_id}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      title="Delete run"
                    >
                      {deleting === run.dag_run_id ? (
                        <LuLoader className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LuTrash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded task instances */}
                {isExpanded && (
                  <div className="border-b border-border/40 bg-muted/10 px-8 py-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Task Instances
                    </p>
                    {tasksLoading ? (
                      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                        <LuLoader className="h-3 w-3 animate-spin" /> Loading tasks…
                      </div>
                    ) : tasks.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">No task instances.</p>
                    ) : (
                      <div className="space-y-1">
                        {tasks.map((task) => {
                          const ts = STATE_STYLES[task.state] ?? {
                            icon: LuClock,
                            className: "text-muted-foreground bg-muted",
                            label: task.state,
                          };
                          const TIcon = ts.icon;
                          return (
                            <div
                              key={task.task_id}
                              className="grid grid-cols-[1fr_100px_100px_80px] items-center rounded-lg bg-card px-4 py-2"
                            >
                              <span className="text-xs font-medium">{task.task_id}</span>
                              <span
                                className={cn(
                                  "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  ts.className
                                )}
                              >
                                <TIcon className={cn("h-2.5 w-2.5", task.state === "running" && "animate-spin")} />
                                {ts.label}
                              </span>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {task.duration != null ? `${task.duration.toFixed(1)}s` : "—"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Try #{task.try_number}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
