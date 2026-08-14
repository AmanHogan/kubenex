import {
  LuDatabase,
  LuSquareTerminal,
  LuNotebook,
  LuCalendarClock,
  LuServer,
  LuActivity,
} from "react-icons/lu";

const STATS = [
  { label: "Spark Workers", value: "1", icon: LuServer, status: "healthy" },
  { label: "Databases", value: "4", icon: LuDatabase, status: "healthy" },
  { label: "Tables", value: "1", icon: LuDatabase, status: "healthy" },
  { label: "DAGs", value: "1", icon: LuCalendarClock, status: "healthy" },
] as const;

const QUICK_LINKS = [
  {
    href: "/sql",
    label: "SQL Editor",
    description: "Write and run SQL queries against your Spark cluster.",
    icon: LuSquareTerminal,
  },
  {
    href: "/notebooks",
    label: "Notebooks",
    description: "Interactive PySpark notebooks via JupyterHub.",
    icon: LuNotebook,
  },
  {
    href: "/catalog",
    label: "Data Catalog",
    description: "Browse databases, tables, and schemas.",
    icon: LuDatabase,
  },
  {
    href: "/jobs",
    label: "Jobs",
    description: "Monitor and trigger Airflow DAG runs.",
    icon: LuCalendarClock,
  },
] as const;

export default function OverviewPage(): React.JSX.Element {
  return (
    <>
      <div className="mb-8">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Welcome to Kubenex.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your bare-metal data platform, forged on Kubernetes.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Cluster Status
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map(({ label, value, icon: Icon, status }) => (
            <div
              key={label}
              className="rounded-xl border-2 border-border/60 bg-card p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <LuActivity className="h-3 w-3" />
                  {status}
                </span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Quick Start
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map(({ href, label, description, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="group rounded-xl border-2 border-border/60 bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold">{label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {description}
              </p>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
