"use client";

import { useState, useEffect } from "react";
import {
  LuExternalLink,
  LuNotebook,
  LuPlay,
  LuPlus,
  LuTrash2,
  LuLoader,
  LuCircleCheck,
  LuCircleX,
  LuHouse,
  LuStar,
  LuTrash,
  LuUsers,
  LuFile,
  LuFileSpreadsheet,
  LuFolderOpen,
  LuFolderClosed,
  LuChevronRight,
  LuChevronDown,
  LuArrowLeft,
  LuSearch,
  LuCalendarClock,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface WorkspaceItem {
  id: string;
  name: string;
  type: "notebook" | "csv" | "folder" | "file";
  owner: string;
  createdAt: string;
  updatedAt: string;
  cells?: Cell[];
  starred?: boolean;
}

type CellLanguage = "sql" | "python" | "markdown";

/** Structured result set from a SQL cell, rendered as a grid. */
interface CellResult {
  columns: string[];
  rows: Record<string, string | null>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number | null;
}

interface Cell {
  id: string;
  type: "code" | "markdown";
  language: CellLanguage;
  source: string;
  output: string | null;
  /** Set for SQL cells that returned a result set; null otherwise. */
  result?: CellResult | null;
  status: "idle" | "running" | "success" | "error";
}

const LANGUAGES: { value: CellLanguage; label: string }[] = [
  { value: "sql", label: "SQL" },
  { value: "python", label: "Python" },
  { value: "markdown", label: "Markdown" },
];

/* ─── Helpers ─── */

let cellCounter = 0;
function newCell(language: CellLanguage = "sql"): Cell {
  return { id: `cell-${++cellCounter}`, type: language === "markdown" ? "markdown" : "code", language, source: "", output: null, result: null, status: "idle" };
}

const ICON_MAP: Record<string, typeof LuNotebook> = {
  notebook: LuNotebook,
  csv: LuFileSpreadsheet,
  folder: LuFolderClosed,
  file: LuFile,
};

type TreeNode = "home" | "shared" | "workspace" | "favorites" | "trash";

const STORAGE_KEY = "kubenex-workspace";

function loadItems(): WorkspaceItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultItems();
    const items = JSON.parse(raw) as WorkspaceItem[];
    // Backfill language field for cells saved before multi-language support
    return items.map((item) => ({
      ...item,
      cells: item.cells?.map((c) => ({ ...c, language: c.language ?? "sql" })),
    }));
  } catch {
    return getDefaultItems();
  }
}

function saveItems(items: WorkspaceItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getDefaultItems(): WorkspaceItem[] {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  return [
    {
      id: "folder-drafts", name: "Drafts", type: "folder",
      owner: "ahoganbailey@gmail.com", createdAt: now, updatedAt: now,
    },
    {
      id: "nb-1", name: "Customer-Analysis", type: "notebook",
      owner: "ahoganbailey@gmail.com", createdAt: yesterday, updatedAt: now,
      cells: [
        { id: "ca-0", type: "markdown", language: "markdown" as CellLanguage, source: "## Customer Analysis\nQuery the bronze sales table and explore customer data.", output: null, status: "idle" },
        { id: "ca-1", type: "code", language: "sql" as CellLanguage, source: "SELECT * FROM bronze.sales LIMIT 10", output: null, status: "idle" },
        { id: "ca-2", type: "code", language: "python" as CellLanguage, source: "# PySpark analysis\ndf = spark.sql('SELECT region, SUM(quantity) as total FROM bronze.sales GROUP BY region')\ndf.show()", output: null, status: "idle" },
      ],
    },
    {
      id: "csv-1", name: "customer.csv", type: "csv",
      owner: "ahoganbailey@gmail.com", createdAt: yesterday, updatedAt: yesterday,
    },
    {
      id: "nb-2", name: "Getting Started", type: "notebook",
      owner: "ahoganbailey@gmail.com", createdAt: yesterday, updatedAt: yesterday,
      cells: [
        { id: "gs-1", type: "code", language: "sql" as CellLanguage, source: "-- Welcome to Kubenex\nSHOW DATABASES", output: null, status: "idle" },
      ],
    },
  ];
}

/** Tiny markdown→HTML renderer (no deps). Handles headers, bold, italic, code, lists. */
function simpleMarkdown(src: string): string {
  return src
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*?<\/li>\s*)+)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

/* ─── Component ─── */

export default function WorkspacePage(): React.JSX.Element {
  const jupyterUrl = process.env.NEXT_PUBLIC_JUPYTER_URL ?? "http://100.112.249.53:30888";

  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [activeNode, setActiveNode] = useState<TreeNode>("home");
  const [openNotebook, setOpenNotebook] = useState<WorkspaceItem | null>(null);
  const [search, setSearch] = useState("");
  const [runningAll, setRunningAll] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleCron, setScheduleCron] = useState("0 3 * * *");
  const [scheduleResult, setScheduleResult] = useState<
    { ok: boolean; message: string } | null
  >(null);
  const [homeExpanded, setHomeExpanded] = useState(true);

  useEffect(() => { setItems(loadItems()); }, []);
  useEffect(() => { if (items.length > 0) saveItems(items); }, [items]);

  /* ─── File explorer actions ─── */

  function createNotebook(): void {
    const name = `Untitled Notebook ${items.filter((i) => i.type === "notebook").length + 1}`;
    const nb: WorkspaceItem = {
      id: `nb-${Date.now()}`, name, type: "notebook",
      owner: "ahoganbailey@gmail.com",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      cells: [newCell()],
    };
    setItems((prev) => [nb, ...prev]);
    setOpenNotebook(nb);
  }

  function deleteItem(id: string): void {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (openNotebook?.id === id) setOpenNotebook(null);
  }

  function toggleStar(id: string): void {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, starred: !i.starred } : i)));
  }

  /* ─── Notebook editor ─── */

  function updateCell(cellId: string, patch: Partial<Cell>): void {
    if (!openNotebook) return;
    const updatedCells = (openNotebook.cells ?? []).map((c) => c.id === cellId ? { ...c, ...patch } : c);
    const updated = { ...openNotebook, cells: updatedCells, updatedAt: new Date().toISOString() };
    setOpenNotebook(updated);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function runCell(cell: Cell): Promise<void> {
    if (!cell.source.trim()) return;

    // Markdown cells don't need execution — just mark as rendered
    if (cell.language === "markdown") {
      updateCell(cell.id, { status: "success", output: null, result: null });
      return;
    }

    updateCell(cell.id, { status: "running", output: null, result: null });
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: cell.language, code: cell.source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      updateCell(cell.id, {
        status: data.status === "error" ? "error" : "success",
        output: data.output ?? "No output",
        result:
          data.columns && data.columns.length > 0
            ? {
                columns: data.columns,
                rows: data.rows ?? [],
                rowCount: data.rowCount ?? 0,
                truncated: data.truncated ?? false,
                durationMs: data.durationMs ?? null,
              }
            : null,
      });
    } catch (err) {
      updateCell(cell.id, { status: "error", output: err instanceof Error ? err.message : "Execution failed", result: null });
    }
  }

  async function runAll(): Promise<void> {
    if (!openNotebook?.cells) return;
    setRunningAll(true);
    for (const cell of openNotebook.cells) {
      if (cell.source.trim()) await runCell(cell);
    }
    setRunningAll(false);
  }

  async function handleSchedule(): Promise<void> {
    if (!openNotebook) return;
    const statements = (openNotebook.cells ?? [])
      .filter((c) => (c.language ?? "sql") === "sql" && c.source.trim())
      .map((c) => c.source.trim());

    if (statements.length === 0) {
      setScheduleResult({
        ok: false,
        message: "This notebook has no SQL cells to schedule.",
      });
      return;
    }

    setScheduling(true);
    setScheduleResult(null);
    try {
      const res = await fetch("/api/scheduled-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleName.trim() || openNotebook.name,
          schedule: scheduleCron.trim(),
          statements,
          sourceNotebook: openNotebook.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScheduleResult({ ok: false, message: data.error ?? "Could not schedule" });
        return;
      }
      setScheduleResult({
        ok: true,
        message: `Scheduled as ${data.dagId} — ${data.statements} statement${data.statements === 1 ? "" : "s"}. It appears in Jobs once Airflow rescans.`,
      });
    } catch (err) {
      setScheduleResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setScheduling(false);
    }
  }

  function addCell(): void {
    if (!openNotebook) return;
    const c = newCell();
    const updated = { ...openNotebook, cells: [...(openNotebook.cells ?? []), c], updatedAt: new Date().toISOString() };
    setOpenNotebook(updated);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  function deleteCell(cellId: string): void {
    if (!openNotebook) return;
    const remaining = (openNotebook.cells ?? []).filter((c) => c.id !== cellId);
    const updated = { ...openNotebook, cells: remaining.length === 0 ? [newCell()] : remaining, updatedAt: new Date().toISOString() };
    setOpenNotebook(updated);
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  /* ─── Filter ─── */

  const tabItems =
    activeNode === "favorites" ? items.filter((i) => i.starred) :
    activeNode === "shared" ? [] :
    activeNode === "trash" ? [] :
    items;

  const filtered = search.trim()
    ? tabItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : tabItems;

  /* ─── Notebook editor view ─── */

  if (openNotebook) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpenNotebook(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <LuArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold">{openNotebook.name}</h1>
              <p className="text-xs text-muted-foreground">Last edited {new Date(openNotebook.updatedAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void runAll()} disabled={runningAll} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {runningAll ? <LuLoader className="h-3.5 w-3.5 animate-spin" /> : <LuPlay className="h-3.5 w-3.5" />}
              Run All
            </button>
            <button
              onClick={() => {
                setScheduleName(openNotebook.name);
                setScheduleResult(null);
                setScheduleOpen(true);
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              <LuCalendarClock className="h-3.5 w-3.5" /> Schedule
            </button>
            <a href={jupyterUrl} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <LuExternalLink className="h-3.5 w-3.5" /> JupyterHub
            </a>
          </div>
        </div>

        {scheduleOpen && (
          <div className="mb-4 rounded-xl border-2 border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Schedule this notebook</span>
              <button
                onClick={() => setScheduleOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Its SQL cells run in order on this schedule. Python and Markdown cells are skipped.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Job name</span>
                <input
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                  className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Cron schedule</span>
                <input
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>
            <button
              onClick={() => void handleSchedule()}
              disabled={scheduling}
              className="mt-3 flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {scheduling ? <LuLoader className="h-3.5 w-3.5 animate-spin" /> : <LuCalendarClock className="h-3.5 w-3.5" />}
              {scheduling ? "Scheduling…" : "Create job"}
            </button>
            {scheduleResult && (
              <div className={cn("mt-3 flex items-start gap-2 rounded-lg border-2 px-3 py-2 text-xs", scheduleResult.ok ? "border-border/60 bg-muted/20 text-foreground" : "border-destructive/40 bg-destructive/10 text-destructive")}>
                {scheduleResult.ok ? <LuCircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <LuCircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{scheduleResult.message}</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {(openNotebook.cells ?? []).map((rawCell, idx) => {
            // Backfill language for cells saved before multi-language support
            const cell = { ...rawCell, language: rawCell.language ?? "sql" } as Cell;
            const StatusIcon = cell.status === "running" ? LuLoader : cell.status === "success" ? LuCircleCheck : cell.status === "error" ? LuCircleX : LuNotebook;
            const isMarkdown = cell.language === "markdown";
            const isRenderedMd = isMarkdown && cell.status === "success";

            return (
              <div key={cell.id} className="overflow-hidden rounded-xl border-2 border-border/60 bg-card ring-1 ring-foreground/10">
                {/* Cell toolbar */}
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground tabular-nums">[{idx + 1}]</span>

                    {/* Language selector */}
                    <select
                      value={cell.language}
                      onChange={(e) => updateCell(cell.id, {
                        language: e.target.value as CellLanguage,
                        type: e.target.value === "markdown" ? "markdown" : "code",
                      })}
                      className="rounded border border-border/40 bg-transparent px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground focus:outline-none"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>

                    <StatusIcon className={cn("h-3 w-3", cell.status === "running" && "animate-spin text-foreground", cell.status === "success" && "text-foreground", cell.status === "error" && "text-destructive", cell.status === "idle" && "text-muted-foreground")} />
                  </div>
                  <div className="flex items-center gap-1">
                    {isMarkdown ? (
                      <button
                        onClick={() => {
                          // Toggle between edit and render for markdown
                          if (isRenderedMd) updateCell(cell.id, { status: "idle" });
                          else void runCell(cell);
                        }}
                        className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {isRenderedMd ? "Edit" : "Render"}
                      </button>
                    ) : (
                      <button onClick={() => void runCell(cell)} disabled={cell.status === "running"} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50" title={`Run ${cell.language.toUpperCase()} (⌘+Enter)`}>
                        <LuPlay className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteCell(cell.id)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Delete cell">
                      <LuTrash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cell body */}
                {isRenderedMd ? (
                  /* Rendered markdown */
                  <div
                    className="prose prose-invert prose-sm max-w-none px-4 py-3 cursor-pointer"
                    onClick={() => updateCell(cell.id, { status: "idle" })}
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(cell.source) }}
                  />
                ) : (
                  /* Code/markdown editor */
                  <textarea
                    value={cell.source}
                    onChange={(e) => updateCell(cell.id, { source: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void runCell(cell);
                      }
                    }}
                    placeholder={
                      cell.language === "sql" ? "-- Write SQL here (⌘+Enter to run)" :
                      cell.language === "python" ? "# Write Python here (⌘+Enter to run)" :
                      "Write Markdown here (⌘+Enter to render)"
                    }
                    className={cn(
                      "block w-full resize-none border-0 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none",
                      cell.language !== "markdown" && "font-mono"
                    )}
                    rows={Math.max(3, cell.source.split("\n").length)}
                    spellCheck={cell.language === "markdown"}
                  />
                )}

                {/* Output (for code cells) — a result set renders as a grid,
                    anything else (Python stdout, errors, DDL acks) as text. */}
                {!isMarkdown && cell.status !== "error" && cell.result && cell.result.columns.length > 0 && cell.result.rows.length > 0 ? (
                  <div className="border-t border-border/40 bg-muted/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border/40">
                            {cell.result.columns.map((col) => (
                              <th key={col} className="whitespace-nowrap px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cell.result.rows.map((row, i) => (
                            <tr key={i} className="border-b border-border/20 last:border-0">
                              {cell.result!.columns.map((col) => (
                                <td key={col} className="whitespace-nowrap px-4 py-1.5 font-mono text-xs">
                                  {row[col] ?? <span className="text-muted-foreground/50">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-3 border-t border-border/40 px-4 py-1.5 text-[11px] text-muted-foreground">
                      <span>{cell.result.rowCount} row{cell.result.rowCount !== 1 ? "s" : ""}</span>
                      {cell.result.durationMs !== null && (
                        <span className="tabular-nums">{cell.result.durationMs} ms</span>
                      )}
                      {cell.result.truncated && <span>truncated</span>}
                    </div>
                  </div>
                ) : cell.output && !isMarkdown ? (
                  <div className={cn("border-t border-border/40 px-4 py-3 font-mono text-xs leading-relaxed", cell.status === "error" ? "bg-destructive/5 text-destructive" : "bg-muted/10 text-muted-foreground")}>
                    <pre className="overflow-x-auto whitespace-pre">{cell.output}</pre>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Add cell buttons */}
        <div className="mt-3 flex gap-2">
          <button onClick={() => addCell()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/40 bg-card/50 py-2.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">
            <LuPlus className="h-3 w-3" /> SQL Cell
          </button>
          <button onClick={() => { const c = newCell("python"); const updated = { ...openNotebook, cells: [...(openNotebook.cells ?? []), c], updatedAt: new Date().toISOString() }; setOpenNotebook(updated); setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i))); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/40 bg-card/50 py-2.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">
            <LuPlus className="h-3 w-3" /> Python Cell
          </button>
          <button onClick={() => { const c = newCell("markdown"); const updated = { ...openNotebook, cells: [...(openNotebook.cells ?? []), c], updatedAt: new Date().toISOString() }; setOpenNotebook(updated); setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i))); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/40 bg-card/50 py-2.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">
            <LuPlus className="h-3 w-3" /> Markdown
          </button>
        </div>
      </div>
    );
  }

  /* ─── Workspace file explorer ─── */

  return (
    <div className="flex gap-0">
      {/* Left tree nav — Databricks style */}
      <div className="w-52 shrink-0 border-r border-border/40 pr-4">
        <h2 className="mb-3 text-sm font-bold">Workspace</h2>
        <nav className="space-y-0.5">
          {/* Home with expand */}
          <button
            onClick={() => { setHomeExpanded(!homeExpanded); setActiveNode("home"); }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              activeNode === "home" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {homeExpanded ? <LuChevronDown className="h-3 w-3" /> : <LuChevronRight className="h-3 w-3" />}
            <LuHouse className="h-4 w-4" />
            Home
          </button>

          {/* Shared with me */}
          <button
            onClick={() => setActiveNode("shared")}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 pl-7 text-sm font-medium transition-colors",
              activeNode === "shared" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <LuUsers className="h-4 w-4" />
            Shared with me
          </button>

          {/* Workspace folder */}
          <button
            onClick={() => setActiveNode("workspace")}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 pl-7 text-sm font-medium transition-colors",
              activeNode === "workspace" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <LuFolderClosed className="h-4 w-4" />
            Workspace
          </button>

          {/* Favorites */}
          <button
            onClick={() => setActiveNode("favorites")}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 pl-7 text-sm font-medium transition-colors",
              activeNode === "favorites" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <LuStar className="h-4 w-4" />
            Favorites
          </button>

          {/* Trash */}
          <button
            onClick={() => setActiveNode("trash")}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 pl-7 text-sm font-medium transition-colors",
              activeNode === "trash" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <LuTrash className="h-4 w-4" />
            Trash
          </button>
        </nav>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 pl-6">
        {/* Breadcrumb + actions */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Workspace</span>
            <LuChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Users</span>
            <LuChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">ahoganbailey@gmail.com</span>
            <button onClick={() => {}} className="ml-1 text-muted-foreground hover:text-foreground">
              <LuStar className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <a href={jupyterUrl} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <LuExternalLink className="h-3.5 w-3.5" /> JupyterHub
            </a>
            <button onClick={createNotebook} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Create
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <LuSearch className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <option>Type</option>
            <option>Notebook</option>
            <option>Folder</option>
            <option>File</option>
          </select>
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <option>Owner</option>
          </select>
          <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <option>Last modified</option>
          </select>
        </div>

        {/* File table */}
        <div className="overflow-hidden rounded-xl border-2 border-border/60 ring-1 ring-foreground/10">
          {/* Header */}
          <div className="grid grid-cols-[2fr_100px_1fr_140px_140px_60px] items-center border-b border-border/40 bg-muted/30 px-5 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name ↕</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Type</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Owner</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Created at</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Last updated at</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card px-6 py-12 text-center">
              {activeNode === "favorites" ? (
                <><LuStar className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">No favorites yet.</p></>
              ) : activeNode === "shared" ? (
                <><LuUsers className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Nothing shared with you.</p></>
              ) : activeNode === "trash" ? (
                <><LuTrash className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Trash is empty.</p></>
              ) : search ? (
                <p className="text-sm text-muted-foreground">No matching items.</p>
              ) : (
                <><LuNotebook className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">No items. Click Create to get started.</p></>
              )}
            </div>
          ) : (
            filtered.map((item, i) => {
              const Icon = ICON_MAP[item.type] ?? LuFile;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group grid grid-cols-[2fr_100px_1fr_140px_140px_60px] items-center bg-card px-5 py-2.5 transition-colors hover:bg-muted/20",
                    i < filtered.length - 1 && "border-b border-border/20"
                  )}
                >
                  <button
                    onClick={() => { if (item.type === "notebook") setOpenNotebook(item); }}
                    className="flex items-center gap-3 text-left min-w-0"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className={cn("truncate text-sm font-medium", item.type === "notebook" && "text-primary hover:underline")}>
                      {item.name}
                    </span>
                  </button>
                  <span className="text-xs capitalize text-muted-foreground">{item.type}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.owner}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => toggleStar(item.id)} className={cn("rounded-md p-1 hover:bg-accent", item.starred ? "text-foreground" : "text-muted-foreground hover:text-foreground")} title="Star">
                      <LuStar className={cn("h-3.5 w-3.5", item.starred && "fill-current")} />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Delete">
                      <LuTrash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
