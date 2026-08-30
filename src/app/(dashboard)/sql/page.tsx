"use client";

import { useEffect, useState } from "react";
import { LuPlay, LuSquareTerminal, LuTable, LuChartBar } from "react-icons/lu";
import ResultChart from "@/components/result-chart";
import { cn } from "@/lib/utils";

/**
 * SQL Editor — write and run SQL against Spark Thrift Server.
 * Phase 1: textarea + run button + results table.
 * Phase 2: Monaco editor, query history, saved queries.
 */
export default function SqlEditorPage(): React.JSX.Element {
  const [query, setQuery] = useState("SELECT * FROM bronze.sales");
  const [results, setResults] = useState<Record<string, string>[] | null>(
    null
  );
  const [columns, setColumns] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "chart">("table");

  // Query History hands a statement over via sessionStorage rather than a URL
  // param, which would break on long queries. Consume it once on mount.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("kubenex:pending-query");
      if (pending) {
        setQuery(pending);
        sessionStorage.removeItem("kubenex:pending-query");
      }
    } catch {
      // sessionStorage can be unavailable in private mode; ignore.
    }
  }, []);

  async function handleRun(): Promise<void> {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Query failed");
        return;
      }
      setColumns(data.columns ?? []);
      setResults(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          SQL Editor
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run queries against Spark SQL via the Thrift Server.
        </p>
      </div>

      <div className="mb-4 rounded-xl border-2 border-border/60 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LuSquareTerminal className="h-3.5 w-3.5" />
            <span>Spark SQL</span>
          </div>
          <button
            onClick={handleRun}
            disabled={running || !query.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <LuPlay className="h-3 w-3" />
            {running ? "Running…" : "Run"}
          </button>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              void handleRun();
            }
          }}
          rows={6}
          spellCheck={false}
          className="w-full resize-y bg-transparent px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder="SELECT * FROM bronze.sales"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mb-3 flex gap-1">
          {([["table", "Table", LuTable], ["chart", "Chart", LuChartBar]] as const).map(
            ([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          )}
        </div>
      )}

      {results && view === "chart" && results.length > 0 && (
        <ResultChart columns={columns} rows={results} />
      )}

      {results && (view === "table" || results.length === 0) && (
        <div className="overflow-x-auto rounded-xl border-2 border-border/60 bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/30 last:border-0"
                >
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="whitespace-nowrap px-4 py-2 font-mono text-xs"
                    >
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            {results.length} row{results.length !== 1 ? "s" : ""} returned
          </div>
        </div>
      )}
    </>
  );
}
