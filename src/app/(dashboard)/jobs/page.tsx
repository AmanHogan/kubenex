"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LuCalendarClock,
  LuCircleCheck,
  LuCircleX,
  LuPlay,
  LuLoader,
  LuRefreshCw,
  LuClock,
  LuPlus,
  LuPause,
  LuTriangle,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

interface LatestRun {
  dag_run_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
}

interface Dag {
  dag_id: string;
  description: string | null;
  is_paused: boolean;
  is_active: boolean;
  schedule_interval: { value: string } | string | null;
  tags: { name: string }[];
  latest_run: LatestRun | null;
}

const STATE_ICON: Record<string, typeof LuCircleCheck> = {
  success: LuCircleCheck,
  failed: LuCircleX,
  running: LuLoader,
  queued: LuClock,
};

function getScheduleLabel(interval: Dag["schedule_interval"]): string {
  if (!interval) return "Manual";
  const val = typeof interval === "string" ? interval : interval.value;
  if (val === "0 3 * * *") return "Daily at 03:00";
  if (val === "@daily") return "Daily";
  if (val === "@hourly") return "Hourly";
  return val;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function JobsPage(): React.JSX.Element {
  const [dags, setDags] = useState<Dag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  const fetchDags = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDags(data.dags ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DAGs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDags();
  }, [fetchDags]);

  async function handleTrigger(dagId: string): Promise<void> {
    setTriggering(dagId);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger", dag_id: dagId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await fetchDags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger DAG");
    } finally {
      setTriggering(null);
    }
  }

  async function handleToggle(dagId: string, isPaused: boolean): Promise<void> {
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", dag_id: dagId, is_paused: isPaused }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await fetchDags();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle DAG");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Jobs & Pipelines
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, monitor, and manage Airflow DAG workflows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchDags()}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <LuRefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <LuPlus className="h-3.5 w-3.5" />
            Create Job
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_120px_120px_140px_100px] items-center border-b border-border/40 bg-muted/30 px-5 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Schedule</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Last Run</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tags</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground text-right">Actions</span>
        </div>

        {loading ? (
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse border-b border-border/20 bg-card" />
            ))}
          </div>
        ) : dags.length === 0 ? (
          <div className="bg-card px-6 py-12 text-center">
            <LuCalendarClock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No DAGs found. Create a job to get started.</p>
          </div>
        ) : (
          dags.map((dag, i) => {
            const state = dag.latest_run?.state ?? "none";
            const StateIcon = STATE_ICON[state] ?? LuClock;

            return (
              <div
                key={dag.dag_id}
                className={cn(
                  "group grid grid-cols-[2fr_1fr_120px_120px_140px_100px] items-center bg-card px-5 py-3 transition-colors hover:bg-muted/20",
                  i < dags.length - 1 && "border-b border-border/20"
                )}
              >
                {/* Name + description */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{dag.dag_id}</p>
                  {dag.description && (
                    <p className="truncate text-xs text-muted-foreground">{dag.description}</p>
                  )}
                </div>

                {/* Schedule */}
                <span className="text-xs text-muted-foreground">
                  {getScheduleLabel(dag.schedule_interval)}
                </span>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  {dag.is_paused ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <LuPause className="h-3 w-3" /> Paused
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-foreground">
                      <StateIcon className={cn("h-3 w-3", state === "running" && "animate-spin")} />
                      {state === "none" ? "No runs" : state}
                    </span>
                  )}
                </div>

                {/* Last run time */}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {timeAgo(dag.latest_run?.start_date ?? null)}
                </span>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {dag.tags.length > 0
                    ? dag.tags.map((t) => (
                        <span
                          key={t.name}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {t.name}
                        </span>
                      ))
                    : <span className="text-xs text-muted-foreground">—</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => void handleToggle(dag.dag_id, !dag.is_paused)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={dag.is_paused ? "Resume" : "Pause"}
                  >
                    {dag.is_paused ? <LuTriangle className="h-3.5 w-3.5" /> : <LuPause className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => void handleTrigger(dag.dag_id)}
                    disabled={triggering === dag.dag_id}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    title="Trigger run"
                  >
                    {triggering === dag.dag_id ? (
                      <LuLoader className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LuPlay className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
