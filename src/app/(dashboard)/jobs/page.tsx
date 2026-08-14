import { LuCalendarClock, LuCircleCheck, LuClock } from "react-icons/lu";

/**
 * Jobs — Airflow DAG monitoring and triggers.
 * Will call /api/jobs to proxy the Airflow REST API.
 */
export default function JobsPage(): React.JSX.Element {
  return (
    <>
      <div className="mb-6">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Jobs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor and trigger Airflow DAG runs.
        </p>
      </div>

      <div className="rounded-xl border-2 border-border/60 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <LuCalendarClock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">medallion_etl</h3>
              <p className="text-xs text-muted-foreground">
                Bronze → Silver → Gold pipeline
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <LuCircleCheck className="h-3 w-3" />
            Active
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/40 px-5 py-4">
          <div className="pr-4">
            <p className="text-xs text-muted-foreground">Schedule</p>
            <p className="mt-1 text-sm font-medium">Daily at 03:00</p>
          </div>
          <div className="px-4">
            <p className="text-xs text-muted-foreground">Last Run</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              <LuClock className="h-3 w-3 text-muted-foreground" />
              Pending first run
            </p>
          </div>
          <div className="pl-4">
            <p className="text-xs text-muted-foreground">Tasks</p>
            <p className="mt-1 text-sm font-medium">
              bronze_ingest → silver_transform → gold_aggregate
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
