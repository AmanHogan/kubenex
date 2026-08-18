"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LuDatabase,
  LuTable,
  LuChevronDown,
  LuChevronRight,
  LuRefreshCw,
  LuSearch,
  LuShield,
  LuUser,
  LuArrowLeft,
  LuMapPin,
  LuKey,
  LuTag,
  LuColumns3,
  LuClock,
  LuFileText,
  LuGitBranch,
  LuLock,
  LuScrollText,
  LuEye,
  LuPencil,
  LuTrash2,
  LuPlus,
  LuCheck,
  LuX,
  LuCircle,
  LuArrowRight,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface Column {
  name: string;
  type: string;
  description: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isPartitionKey: boolean;
}

interface Permission {
  principal: string;
  principalType: "user" | "group" | "role";
  privileges: string[];
  grantedBy: string;
  grantedAt: string;
}

interface Policy {
  name: string;
  type: "retention" | "classification" | "masking" | "quality";
  description: string;
  status: "active" | "inactive";
  config: Record<string, string>;
  createdAt: string;
}

interface LineageNode {
  table: string;
  database: string;
  job: string;
  jobType: "airflow_dag" | "spark_job" | "manual";
  lastRun: string;
}

interface TableDetail {
  name: string;
  database: string;
  type: string;
  format: string;
  location: string;
  owner: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  properties: Record<string, string>;
  partitionKeys: string[];
  serde: string;
  inputFormat: string;
  outputFormat: string;
  totalSize: string;
  numRows: string;
  numFiles: string;
  permissions: Permission[];
  policies: Policy[];
  lineage: { upstream: LineageNode[]; downstream: LineageNode[] };
  tags: string[];
}

interface TableSummary {
  name: string;
  type: string;
  format: string;
  description: string;
  owner: string;
  columnCount: number;
  rowCount: string;
  tags: string[];
}

interface DatabaseSummary {
  name: string;
  description: string;
  owner: string;
  location: string;
  tableCount: number;
  tables: TableSummary[];
}

type TabId = "overview" | "sample" | "details" | "permissions" | "policies" | "lineage";

const TABS: { id: TabId; label: string; icon: typeof LuColumns3 }[] = [
  { id: "overview", label: "Overview", icon: LuColumns3 },
  { id: "sample", label: "Sample Data", icon: LuTable },
  { id: "details", label: "Details", icon: LuFileText },
  { id: "permissions", label: "Permissions", icon: LuLock },
  { id: "policies", label: "Policies", icon: LuScrollText },
  { id: "lineage", label: "Lineage", icon: LuGitBranch },
];

/* ─── Helpers ─── */

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const POLICY_COLORS: Record<string, string> = {
  masking: "bg-purple-500/10 text-purple-400 ring-purple-500/20",
  retention: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  quality: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  classification: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
};

/* ─── Component ─── */

export default function CatalogPage(): React.JSX.Element {
  const [databases, setDatabases] = useState<DatabaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDb, setExpandedDb] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Table detail view
  const [selectedTable, setSelectedTable] = useState<{ db: string; table: string } | null>(null);
  const [tableDetail, setTableDetail] = useState<TableDetail | null>(null);
  const [sampleData, setSampleData] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [detailLoading, setDetailLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);

  const fetchCatalog = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/catalog");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDatabases(data.databases ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  // Fetch table detail
  async function openTable(db: string, table: string): Promise<void> {
    setSelectedTable({ db, table });
    setActiveTab("overview");
    setDetailLoading(true);
    setSampleData(null);
    try {
      const res = await fetch(`/api/catalog?db=${db}&table=${table}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTableDetail(data.table);
    } catch {
      setTableDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function fetchSample(): Promise<void> {
    if (!selectedTable || sampleData) return;
    setSampleLoading(true);
    try {
      const res = await fetch(`/api/catalog?db=${selectedTable.db}&table=${selectedTable.table}&sample=true`);
      const data = await res.json();
      setSampleData({ columns: data.columns ?? [], rows: data.rows ?? [] });
    } catch {
      setSampleData({ columns: [], rows: [] });
    } finally {
      setSampleLoading(false);
    }
  }

  function handleTabChange(tab: TabId): void {
    setActiveTab(tab);
    if (tab === "sample") void fetchSample();
  }

  function goBack(): void {
    setSelectedTable(null);
    setTableDetail(null);
    setSampleData(null);
  }

  const totalTables = databases.reduce((sum, db) => sum + db.tableCount, 0);

  // Filter
  const filtered = search.trim()
    ? databases
        .map((db) => ({
          ...db,
          tables: db.tables.filter(
            (t) =>
              t.name.toLowerCase().includes(search.toLowerCase()) ||
              t.description.toLowerCase().includes(search.toLowerCase()) ||
              db.name.toLowerCase().includes(search.toLowerCase())
          ),
        }))
        .filter((db) => db.tables.length > 0 || db.name.toLowerCase().includes(search.toLowerCase()))
    : databases;

  /* ───────────── Table Detail View ───────────── */

  if (selectedTable) {
    const td = tableDetail;

    return (
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <button onClick={goBack} className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <LuArrowLeft className="h-3.5 w-3.5" /> Back to Catalog
          </button>

          {detailLoading ? (
            <div className="h-24 animate-pulse rounded-xl border-2 border-border/60 bg-card" />
          ) : td ? (
            <div className="rounded-xl border-2 border-border/60 bg-card p-6 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{td.database}</span>
                    <LuChevronRight className="h-3 w-3 text-muted-foreground" />
                    <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
                      {td.name}
                    </h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{td.description}</p>

                  {/* Tags */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {td.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/5">
                        <LuTag className="h-2.5 w-2.5" /> {tag}
                      </span>
                    ))}
                    <span className="inline-flex items-center rounded-md bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/5">
                      {td.type === "EXTERNAL_TABLE" ? "External" : "Managed"}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-muted/30 px-2 py-0.5 text-[11px] font-mono text-muted-foreground ring-1 ring-foreground/5">
                      {td.format}
                    </span>
                  </div>
                </div>

                {/* Meta stats */}
                <div className="ml-6 grid grid-cols-2 gap-x-8 gap-y-2 text-right">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Owner</div>
                    <div className="flex items-center justify-end gap-1 text-sm"><LuUser className="h-3 w-3 text-muted-foreground" /> {td.owner.split("@")[0]}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rows</div>
                    <div className="text-sm font-medium tabular-nums">{td.numRows}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Size</div>
                    <div className="text-sm font-medium">{td.totalSize}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Updated</div>
                    <div className="text-sm text-muted-foreground">{relTime(td.updatedAt)}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 px-6 py-4 text-sm text-destructive">
              Table {selectedTable.db}.{selectedTable.table} not found. Try bronze.sales or bronze.customers for the full experience.
            </div>
          )}
        </div>

        {/* Tabs */}
        {td && (
          <>
            <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border/30 pb-px">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="min-h-[400px]">
              {activeTab === "overview" && <OverviewTab detail={td} />}
              {activeTab === "sample" && <SampleTab data={sampleData} loading={sampleLoading} />}
              {activeTab === "details" && <DetailsTab detail={td} />}
              {activeTab === "permissions" && <PermissionsTab permissions={td.permissions} />}
              {activeTab === "policies" && <PoliciesTab policies={td.policies} />}
              {activeTab === "lineage" && <LineageTab lineage={td.lineage} tableName={`${td.database}.${td.name}`} />}
            </div>
          </>
        )}
      </div>
    );
  }

  /* ───────────── Database List View ───────────── */

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Catalog
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse schemas, tables, and column metadata from the Hive metastore.
          </p>
        </div>
        <button
          onClick={() => void fetchCatalog()}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <LuRefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Search + stats */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <LuSearch className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search databases and tables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span>{databases.length} databases</span>
          <span>·</span>
          <span>{totalTables} tables</span>
        </div>
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
        <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
          <LuDatabase className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? "No matching databases or tables." : "No databases found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((db) => {
            const isExpanded = expandedDb === db.name;
            return (
              <div key={db.name} className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
                {/* Database header */}
                <button
                  onClick={() => {
                    setExpandedDb(isExpanded ? null : db.name);
                  }}
                  className="flex w-full items-center gap-3 bg-card px-5 py-3.5 text-left transition-colors hover:bg-muted/20"
                >
                  {isExpanded ? <LuChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <LuChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <LuDatabase className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{db.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">— {db.description}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><LuUser className="h-3 w-3" /> {db.owner}</span>
                    <span>{db.tableCount} table{db.tableCount !== 1 ? "s" : ""}</span>
                  </div>
                </button>

                {/* Table list */}
                {isExpanded && (
                  <div className="border-t border-border/20">
                    {db.tables.length === 0 ? (
                      <p className="bg-muted/10 px-12 py-4 text-xs text-muted-foreground">No tables in this database.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_100px_80px_80px_100px] bg-muted/20 px-5 py-2 pl-14">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Table</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Format</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Columns</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rows</span>
                        </div>
                        {db.tables.map((table) => (
                          <button
                            key={table.name}
                            onClick={() => void openTable(db.name, table.name)}
                            className="grid w-full grid-cols-[1fr_100px_80px_80px_100px] items-center border-t border-border/10 bg-card px-5 py-2.5 pl-14 text-left transition-colors hover:bg-muted/10"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <LuTable className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="text-sm font-medium text-primary hover:underline">{table.name}</span>
                                {table.tags.map((tag) => (
                                  <span key={tag} className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                                ))}
                              </div>
                              <p className="mt-0.5 truncate pl-5 text-[11px] text-muted-foreground">{table.description}</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{table.type === "EXTERNAL_TABLE" ? "External" : "Managed"}</span>
                            <span className="font-mono text-xs text-muted-foreground">{table.format}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{table.columnCount}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{table.rowCount}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB COMPONENTS
   ═══════════════════════════════════════════════ */

/* ─── Overview Tab ─── */

function OverviewTab({ detail: td }: { detail: TableDetail }): React.JSX.Element {
  return (
    <div className="space-y-6">
      {/* Column schema */}
      <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
        <div className="flex items-center justify-between bg-card px-5 py-3 border-b border-border/20">
          <h3 className="text-sm font-semibold">Schema — {td.columns.length} columns</h3>
          {td.partitionKeys.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Partitioned by: <span className="font-mono font-medium text-foreground">{td.partitionKeys.join(", ")}</span>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20">
                <th className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Column</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nullable</th>
                <th className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {td.columns.map((col) => (
                <tr key={col.name} className="border-t border-border/10 hover:bg-muted/5">
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{col.name}</span>
                      {col.isPrimaryKey && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-amber-500/20">
                          <LuKey className="h-2.5 w-2.5" /> PK
                        </span>
                      )}
                      {col.isPartitionKey && (
                        <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-blue-500/20">
                          <LuColumns3 className="h-2.5 w-2.5" /> Partition
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{col.type}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{col.nullable ? "Yes" : "No"}</td>
                  <td className="px-5 py-2 text-xs text-muted-foreground">{col.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick info cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border-2 border-border/60 bg-card p-4 ring-1 ring-foreground/10">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <LuMapPin className="h-3 w-3" /> Storage Location
          </div>
          <p className="truncate font-mono text-xs text-foreground" title={td.location}>{td.location}</p>
        </div>
        <div className="rounded-xl border-2 border-border/60 bg-card p-4 ring-1 ring-foreground/10">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <LuClock className="h-3 w-3" /> Created
          </div>
          <p className="text-xs text-foreground">{fmtDate(td.createdAt)}</p>
        </div>
        <div className="rounded-xl border-2 border-border/60 bg-card p-4 ring-1 ring-foreground/10">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <LuClock className="h-3 w-3" /> Last Updated
          </div>
          <p className="text-xs text-foreground">{fmtDate(td.updatedAt)}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Sample Data Tab ─── */

function SampleTab({ data, loading }: { data: { columns: string[]; rows: Record<string, unknown>[] } | null; loading: boolean }): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground animate-pulse">Loading sample data…</div>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
        <LuTable className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No sample data available. Table may be empty or inaccessible.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between bg-card px-5 py-3 border-b border-border/20">
        <h3 className="text-sm font-semibold">First {data.rows.length} rows</h3>
        <span className="text-xs text-muted-foreground">via SELECT * FROM table LIMIT {data.rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20">
              <th className="px-3 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-10">#</th>
              {data.columns.map((col) => (
                <th key={col} className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="border-t border-border/10 hover:bg-muted/5">
                <td className="px-3 py-1.5 text-center text-[11px] text-muted-foreground tabular-nums">{i + 1}</td>
                {data.columns.map((col) => (
                  <td key={col} className="px-4 py-1.5 font-mono text-xs whitespace-nowrap">
                    {row[col] === null ? <span className="italic text-muted-foreground/50">null</span> : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Details Tab ─── */

function DetailsTab({ detail: td }: { detail: TableDetail }): React.JSX.Element {
  const propEntries = Object.entries(td.properties);

  return (
    <div className="space-y-6">
      {/* Storage info */}
      <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
        <div className="bg-card px-5 py-3 border-b border-border/20">
          <h3 className="text-sm font-semibold">Storage Information</h3>
        </div>
        <div className="divide-y divide-border/10">
          {([
            ["Table Type", td.type === "EXTERNAL_TABLE" ? "EXTERNAL TABLE" : "MANAGED TABLE"],
            ["Format", td.format.toUpperCase()],
            ["Location", td.location],
            ["SerDe Library", td.serde],
            ["Input Format", td.inputFormat],
            ["Output Format", td.outputFormat],
            ["Partition Keys", td.partitionKeys.length > 0 ? td.partitionKeys.join(", ") : "None"],
            ["Total Size", td.totalSize],
            ["Number of Rows", td.numRows],
            ["Number of Files", td.numFiles],
            ["Owner", td.owner],
            ["Created", fmtDate(td.createdAt)],
            ["Last Updated", fmtDate(td.updatedAt)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[200px_1fr] bg-card px-5 py-2">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className="font-mono text-xs text-foreground break-all">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table properties */}
      <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
        <div className="bg-card px-5 py-3 border-b border-border/20">
          <h3 className="text-sm font-semibold">Table Properties ({propEntries.length})</h3>
        </div>
        <div className="divide-y divide-border/10">
          {propEntries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[300px_1fr] bg-card px-5 py-2">
              <span className="font-mono text-xs text-muted-foreground">{key}</span>
              <span className="font-mono text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Permissions Tab ─── */

function PermissionsTab({ permissions }: { permissions: Permission[] }): React.JSX.Element {
  const PRIV_ICONS: Record<string, typeof LuEye> = {
    SELECT: LuEye,
    INSERT: LuPencil,
    ALTER: LuPencil,
    DROP: LuTrash2,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{permissions.length} grants</h3>
        <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <LuPlus className="h-3 w-3" /> Grant Access
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20">
              <th className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Principal</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Privileges</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Granted By</th>
              <th className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Granted At</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((p, i) => (
              <tr key={i} className="border-t border-border/10 hover:bg-muted/5">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    {p.principalType === "user" ? <LuUser className="h-3.5 w-3.5 text-muted-foreground" /> : p.principalType === "group" ? <LuShield className="h-3.5 w-3.5 text-muted-foreground" /> : <LuLock className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium">{p.principal}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                    p.principalType === "user" ? "bg-blue-500/10 text-blue-400 ring-blue-500/20" :
                    p.principalType === "group" ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" :
                    "bg-purple-500/10 text-purple-400 ring-purple-500/20"
                  )}>
                    {p.principalType}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {p.privileges.map((priv) => {
                      const Icon = PRIV_ICONS[priv] ?? LuCircle;
                      return (
                        <span key={priv} className="inline-flex items-center gap-0.5 rounded bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-foreground/5">
                          <Icon className="h-2.5 w-2.5" /> {priv}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.grantedBy}</td>
                <td className="px-5 py-2.5 text-xs text-muted-foreground">{fmtDate(p.grantedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Policies Tab ─── */

function PoliciesTab({ policies }: { policies: Policy[] }): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{policies.length} policies</h3>
        <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <LuPlus className="h-3 w-3" /> Add Policy
        </button>
      </div>

      <div className="space-y-3">
        {policies.map((policy, i) => (
          <div key={i} className="rounded-xl border-2 border-border/60 bg-card p-5 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">{policy.name}</h4>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", POLICY_COLORS[policy.type] ?? "bg-muted/30 text-muted-foreground ring-foreground/5")}>
                    {policy.type}
                  </span>
                  <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                    policy.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                      : "bg-muted/30 text-muted-foreground ring-foreground/10"
                  )}>
                    {policy.status === "active" ? <LuCheck className="h-2.5 w-2.5" /> : <LuX className="h-2.5 w-2.5" />}
                    {policy.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{policy.description}</p>
              </div>
              <span className="text-[11px] text-muted-foreground">{fmtDate(policy.createdAt)}</span>
            </div>

            {/* Config */}
            <div className="mt-3 rounded-lg bg-muted/10 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Configuration</div>
              <div className="space-y-1">
                {Object.entries(policy.config).map(([key, value]) => (
                  <div key={key} className="flex gap-3 text-xs">
                    <span className="font-mono text-muted-foreground min-w-[120px]">{key}:</span>
                    <span className="font-mono text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Lineage Tab ─── */

function LineageTab({ lineage, tableName }: { lineage: { upstream: LineageNode[]; downstream: LineageNode[] }; tableName: string }): React.JSX.Element {
  return (
    <div className="space-y-6">
      {/* Visual lineage diagram */}
      <div className="overflow-hidden rounded-xl border-2 border-border/60 bg-card ring-1 ring-foreground/10">
        <div className="bg-card px-5 py-3 border-b border-border/20">
          <h3 className="text-sm font-semibold">Data Lineage</h3>
        </div>
        <div className="flex items-center justify-center gap-4 px-8 py-8">
          {/* Upstream */}
          <div className="flex flex-col items-end gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Upstream</div>
            {lineage.upstream.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/40 px-4 py-3 text-xs text-muted-foreground">No upstream</div>
            ) : (
              lineage.upstream.map((node, i) => (
                <div key={i} className="rounded-lg border-2 border-border/60 bg-muted/10 px-4 py-2.5 text-right ring-1 ring-foreground/5">
                  <div className="font-mono text-xs font-medium">{node.database}.{node.table}</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <LuGitBranch className="h-2.5 w-2.5" /> {node.job}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{relTime(node.lastRun)}</div>
                </div>
              ))
            )}
          </div>

          {/* Arrows → Current Table → Arrows */}
          <div className="flex items-center gap-3">
            <LuArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Current table */}
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-6 py-4 text-center ring-2 ring-primary/20">
            <LuTable className="mx-auto mb-1 h-5 w-5 text-primary" />
            <div className="font-mono text-sm font-semibold text-primary">{tableName}</div>
          </div>

          <div className="flex items-center gap-3">
            <LuArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Downstream */}
          <div className="flex flex-col items-start gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Downstream</div>
            {lineage.downstream.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/40 px-4 py-3 text-xs text-muted-foreground">No downstream</div>
            ) : (
              lineage.downstream.map((node, i) => (
                <div key={i} className="rounded-lg border-2 border-border/60 bg-muted/10 px-4 py-2.5 ring-1 ring-foreground/5">
                  <div className="font-mono text-xs font-medium">{node.database}.{node.table}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <LuGitBranch className="h-2.5 w-2.5" /> {node.job}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{relTime(node.lastRun)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Lineage details table */}
      <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
        <div className="bg-card px-5 py-3 border-b border-border/20">
          <h3 className="text-sm font-semibold">Dependencies</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20">
              <th className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Direction</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Table</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Job</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last Run</th>
            </tr>
          </thead>
          <tbody>
            {lineage.upstream.map((node, i) => (
              <tr key={`up-${i}`} className="border-t border-border/10 hover:bg-muted/5">
                <td className="px-5 py-2"><span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-blue-500/20">upstream</span></td>
                <td className="px-3 py-2 font-mono text-xs">{node.database}.{node.table}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{node.job}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{node.jobType.replace("_", " ")}</td>
                <td className="px-5 py-2 text-xs text-muted-foreground">{fmtDate(node.lastRun)}</td>
              </tr>
            ))}
            {lineage.downstream.map((node, i) => (
              <tr key={`down-${i}`} className="border-t border-border/10 hover:bg-muted/5">
                <td className="px-5 py-2"><span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">downstream</span></td>
                <td className="px-3 py-2 font-mono text-xs">{node.database}.{node.table}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{node.job}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{node.jobType.replace("_", " ")}</td>
                <td className="px-5 py-2 text-xs text-muted-foreground">{fmtDate(node.lastRun)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
