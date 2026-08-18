"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuDatabase,
  LuSquareTerminal,
  LuNotebook,
  LuCalendarClock,
  LuServer,
  LuActivity,
  LuCircleCheck,
  LuCircleX,
  LuLoader,
  LuClock,
  LuHistory,
  LuUpload,
  LuArrowRight,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

/* eslint-disable react/no-unescaped-entities */

interface RecentRun {
  dag_id: string;
  dag_run_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
}

const QUICK_LINKS = [
  {
    href: "/sql",
    label: "SQL Editor",
    description: "Write and run SQL queries against your Spark cluster.",
    icon: LuSquareTerminal,
    cta: "Open editor",
  },
  {
    href: "/notebooks",
    label: "Notebooks",
    description: "SQL notebooks with Spark, or PySpark on JupyterHub.",
    icon: LuNotebook,
    cta: "Open workspace",
  },
  {
    href: "/catalog",
    label: "Data Catalog",
    description: "Browse databases, tables, and column schemas.",
    icon: LuDatabase,
    cta: "Browse catalog",
  },
  {
    href: "/jobs",
    label: "Jobs & Pipelines",
    description: "Monitor and trigger Airflow DAG runs.",
    icon: LuCalendarClock,
    cta: "View jobs",
  },
  {
    href: "/runs",
    label: "Run History",
    description: "View, filter, and manage all DAG runs.",
    icon: LuHistory,
    cta: "View runs",
  },
  {
    href: "/ingest",
    label: "Data Ingestion",
    description: "Upload files to MinIO, register as Hive tables.",
    icon: LuUpload,
    cta: "Upload data",
  },
] as const;

const STATE_STYLES: Record<string, { icon: typeof LuCircleCheck; className: string }> = {
  success: { icon: LuCircleCheck, className: "text-emerald-400" },
  failed: { icon: LuCircleX, className: "text-red-400" },
  running: { icon: LuLoader, className: "text-blue-400" },
  queued: { icon: LuClock, className: "text-amber-400" },
};

export default function OverviewPage(): React.JSX.Element {
  const [dagCount, setDagCount] = useState<number | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [clusterStatus, setClusterStatus] = useState<string | null>(null);
  const [workerCount, setWorkerCount] = useState<number | null>(null);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [tableCount, setTableCount] = useState<number | null>(null);

  const fetchOverview = useCallback(async (): Promise<void> => {
    const [jobsRes, runsRes, computeRes, catalogRes] = await Promise.allSettled([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/runs?limit=5").then((r) => r.json()),
      fetch("/api/compute").then((r) => r.json()),
      fetch("/api/catalog").then((r) => r.json()),
    ]);

    if (jobsRes.status === "fulfilled") setDagCount(jobsRes.value.dags?.length ?? 0);
    if (runsRes.status === "fulfilled") setRecentRuns(runsRes.value.runs ?? []);
    if (computeRes.status === "fulfilled" && computeRes.value.cluster) {
      setClusterStatus(computeRes.value.cluster.status);
      setWorkerCount(computeRes.value.cluster.workers?.length ?? 0);
    }
    if (catalogRes.status === "fulfilled") {
      const dbs = catalogRes.value.databases ?? [];
      setDbCount(dbs.length);
      setTableCount(dbs.reduce((s: number, d: { tables: unknown[] }) => s + d.tables.length, 0));
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <section className="mb-14 text-center">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
          Welcome to Kubenex.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Your bare-metal data platform, forged on Kubernetes.
        </p>
      </section>

      {/* Cluster status cards */}
      <section className="mb-14">
        <div className="mb-6 text-center">
          <h2 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Cluster at a glance.
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Live metrics from your Spark cluster and Hive metastore.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Spark", value: clusterStatus ?? "—", icon: LuActivity },
            { label: "Workers", value: workerCount ?? "—", icon: LuServer },
            { label: "Databases", value: dbCount ?? "—", icon: LuDatabase },
            { label: "Tables", value: tableCount ?? "—", icon: LuDatabase },
            { label: "DAGs", value: dagCount ?? "—", icon: LuCalendarClock },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col rounded-xl border-2 border-border/60 bg-card p-5 ring-1 ring-foreground/10"
            >
              <Icon className="mb-2 h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <section className="mb-14">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
                Recent runs.
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The latest DAG runs across all pipelines.
              </p>
            </div>
            <Link
              href="/runs"
              className="flex items-center gap-1.5 rounded-lg border-2 border-border/60 px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
            >
              View all <LuArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
            {recentRuns.map((run, i) => {
              const style = STATE_STYLES[run.state] ?? {
                icon: LuClock,
                className: "text-muted-foreground",
              };
              const Icon = style.icon;
              return (
                <div
                  key={run.dag_run_id}
                  className={cn(
                    "flex items-center justify-between bg-card px-5 py-3",
                    i < recentRuns.length - 1 && "border-b border-border/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        style.className,
                        run.state === "running" && "animate-spin"
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">{run.dag_id}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {run.dag_run_id}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {run.start_date
                      ? new Date(run.start_date).toLocaleString()
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick start — poster cards */}
      <section className="mb-14">
        <div className="mb-6 text-center">
          <h2 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Get started.
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Jump into any part of the platform.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map(({ href, label, description, icon: Icon, cta }) => (
            <Link
              key={href}
              href={href}
              className="group/card flex flex-col rounded-xl border-2 border-border/60 bg-card p-6 ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-foreground">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <p className="text-lg font-bold leading-tight">{label}</p>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">
                {description}
              </p>
              <div className="mt-4 flex justify-end">
                <span className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors group-hover/card:border-primary">
                  {cta} <LuArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
