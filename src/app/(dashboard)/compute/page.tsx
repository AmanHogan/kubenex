"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LuCpu,
  LuHardDrive,
  LuServer,
  LuActivity,
  LuRefreshCw,
  LuLoader,
  LuCircleCheck,
  LuCircleX,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

interface Worker {
  id: string;
  host: string;
  state: string;
  cores: number;
  coresUsed: number;
  memoryMB: number;
  memoryUsedMB: number;
}

interface App {
  id: string;
  name: string;
  cores?: number;
  memoryPerExecutorMB?: number;
  state: string;
  startTime: string;
  durationMs: number;
}

interface ClusterInfo {
  status: string;
  totalCores: number;
  usedCores: number;
  totalMemoryMB: number;
  usedMemoryMB: number;
  workers: Worker[];
  activeApps: App[];
  completedApps: App[];
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function ComputePage(): React.JSX.Element {
  const [cluster, setCluster] = useState<ClusterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompute = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/compute");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCluster(data.cluster ?? null);
      if (!data.cluster) setError(data.message ?? "Cluster not reachable");
      else setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compute info");
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
      if (alive) void fetchCompute();
    });
    return () => {
      alive = false;
    };
  }, [fetchCompute]);

  const corePct = cluster ? Math.round((cluster.usedCores / Math.max(cluster.totalCores, 1)) * 100) : 0;
  const memPct = cluster ? Math.round((cluster.usedMemoryMB / Math.max(cluster.totalMemoryMB, 1)) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Compute
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spark cluster resources and worker status.
          </p>
        </div>
        <button
          onClick={() => void fetchCompute()}
          className="flex items-center gap-1.5 rounded-lg border-2 border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <LuRefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <LuLoader className="h-4 w-4 animate-spin" /> Loading cluster info…
        </div>
      ) : !cluster ? (
        <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center">
          <LuServer className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Spark Master not reachable. Check the cluster connection.
          </p>
        </div>
      ) : (
        <>
          {/* Cluster overview cards */}
          <div className="mb-6 grid grid-cols-4 gap-4">
            <div className="rounded-xl border-2 border-border/60 bg-card p-5 ring-1 ring-foreground/10">
              <LuActivity className="mb-2 h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-bold">{cluster.status}</p>
              <p className="mt-1 text-xs text-muted-foreground">Cluster Status</p>
            </div>
            <div className="rounded-xl border-2 border-border/60 bg-card p-5 ring-1 ring-foreground/10">
              <LuServer className="mb-2 h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-bold">{cluster.workers.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Workers</p>
            </div>
            <div className="rounded-xl border-2 border-border/60 bg-card p-5 ring-1 ring-foreground/10">
              <LuCpu className="mb-2 h-4 w-4 text-muted-foreground" />
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-bold">{cluster.usedCores}</p>
                <p className="text-sm text-muted-foreground">/ {cluster.totalCores}</p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${corePct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Cores ({corePct}%)</p>
            </div>
            <div className="rounded-xl border-2 border-border/60 bg-card p-5 ring-1 ring-foreground/10">
              <LuHardDrive className="mb-2 h-4 w-4 text-muted-foreground" />
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-bold">{formatMB(cluster.usedMemoryMB)}</p>
                <p className="text-sm text-muted-foreground">/ {formatMB(cluster.totalMemoryMB)}</p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${memPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Memory ({memPct}%)</p>
            </div>
          </div>

          {/* Workers table */}
          <h2 className="mb-3 text-sm font-semibold">Workers</h2>
          <div className="mb-6 overflow-x-auto rounded-xl border-2 border-border/60 bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Worker ID</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Host</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">State</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cores</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Memory</th>
                </tr>
              </thead>
              <tbody>
                {cluster.workers.map((w) => (
                  <tr key={w.id} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{w.id}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{w.host}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        w.state === "ALIVE"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      )}>
                        {w.state === "ALIVE" ? <LuCircleCheck className="h-3 w-3" /> : <LuCircleX className="h-3 w-3" />}
                        {w.state}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {w.coresUsed} / {w.cores}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatMB(w.memoryUsedMB)} / {formatMB(w.memoryMB)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Active applications */}
          <h2 className="mb-3 text-sm font-semibold">
            Active Applications ({cluster.activeApps.length})
          </h2>
          {cluster.activeApps.length === 0 ? (
            <p className="mb-6 text-xs text-muted-foreground">No active applications.</p>
          ) : (
            <div className="mb-6 space-y-2">
              {cluster.activeApps.map((app) => (
                <div key={app.id} className="flex items-center justify-between rounded-xl border-2 border-border/60 bg-card px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{app.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{app.id}</p>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-muted-foreground">
                    <span>{app.cores} cores</span>
                    <span>{formatMB(app.memoryPerExecutorMB ?? 0)} / exec</span>
                    <span>{formatDuration(app.durationMs)}</span>
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400">
                      {app.state}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Completed apps */}
          {cluster.completedApps.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-semibold">
                Recent Completed ({cluster.completedApps.length})
              </h2>
              <div className="space-y-1">
                {cluster.completedApps.map((app) => (
                  <div key={app.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2">
                    <span className="text-xs font-medium">{app.name}</span>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatDuration(app.durationMs)}</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        {app.state}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
