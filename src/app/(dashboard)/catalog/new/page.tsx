"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuPlus,
  LuTrash2,
  LuArrowLeft,
  LuCircleCheck,
  LuCircleX,
  LuLoader,
  LuTable,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

/** Spark SQL types offered in the column builder. */
const TYPES = [
  "STRING",
  "INT",
  "BIGINT",
  "DOUBLE",
  "FLOAT",
  "DECIMAL(10,2)",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "BINARY",
];

/** Delta is unavailable — the Thrift server has no delta jars installed. */
const FORMATS = ["PARQUET", "CSV", "JSON", "ORC"];

interface Column {
  name: string;
  type: string;
  comment: string;
}

type Mode = "schema" | "existing";

/** Spark identifiers: letters, digits, underscore; not starting with a digit. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quote(value: string): string {
  return value.replace(/'/g, "''");
}

export default function CreateTablePage(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("schema");
  const [databases, setDatabases] = useState<string[]>([]);
  const [database, setDatabase] = useState("");
  const [table, setTable] = useState("");
  const [format, setFormat] = useState("PARQUET");
  const [location, setLocation] = useState("");
  const [comment, setComment] = useState("");
  const [columns, setColumns] = useState<Column[]>([
    { name: "", type: "STRING", comment: "" },
  ]);
  const [partitionBy, setPartitionBy] = useState<string[]>([]);
  const [csvHeader, setCsvHeader] = useState(true);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const loadDatabases = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "SHOW DATABASES", source: "catalog" }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const names = (data.rows ?? []).map(
        (r: Record<string, string>) => Object.values(r)[0]
      );
      setDatabases(names);
      setDatabase((prev) => prev || names[0] || "");
    } catch {
      // Leave the dropdown empty; the DDL preview still works.
    }
  }, []);

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  function updateColumn(i: number, patch: Partial<Column>): void {
    setColumns((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  const namedColumns = columns.filter((c) => c.name.trim());

  /** Build the DDL shown in the preview and sent on submit. */
  function buildDdl(): string {
    const target = `${database || "<database>"}.${table || "<table>"}`;

    if (mode === "existing") {
      const opts = [`path '${quote(location)}'`];
      if (format === "CSV") {
        opts.push(`header '${csvHeader}'`, "inferSchema 'true'");
      }
      return [
        `CREATE TABLE IF NOT EXISTS ${target}`,
        `USING ${format}`,
        `OPTIONS (${opts.join(", ")})`,
        comment ? `COMMENT '${quote(comment)}'` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    const cols = namedColumns.map((c) => {
      const cmt = c.comment ? ` COMMENT '${quote(c.comment)}'` : "";
      return `  ${c.name} ${c.type}${cmt}`;
    });

    return [
      `CREATE TABLE IF NOT EXISTS ${target} (`,
      cols.join(",\n") || "  <no columns defined>",
      `)`,
      `USING ${format}`,
      partitionBy.length ? `PARTITIONED BY (${partitionBy.join(", ")})` : null,
      location ? `LOCATION '${quote(location)}'` : null,
      comment ? `COMMENT '${quote(comment)}'` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const ddl = buildDdl();

  /** Everything that must hold before the statement can be run. */
  const problems: string[] = [];
  if (!database) problems.push("Pick a database.");
  if (!table.trim()) problems.push("Table name is required.");
  else if (!IDENT.test(table.trim()))
    problems.push("Table name must be letters, digits, or underscore.");
  if (mode === "schema") {
    if (namedColumns.length === 0) problems.push("Add at least one column.");
    const bad = namedColumns.find((c) => !IDENT.test(c.name.trim()));
    if (bad) problems.push(`Invalid column name: "${bad.name}".`);
    const names = namedColumns.map((c) => c.name.trim().toLowerCase());
    if (new Set(names).size !== names.length)
      problems.push("Column names must be unique.");
  } else if (!location.trim()) {
    problems.push("A storage location is required.");
  }

  async function handleCreate(): Promise<void> {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ddl, source: "create-table" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setResult({ ok: false, message: data.error ?? "Create failed" });
        return;
      }
      setResult({
        ok: true,
        message: `Created ${database}.${table}.`,
      });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/catalog"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LuArrowLeft className="h-3 w-3" />
            Back to Catalog
          </Link>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Create Table
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define a new table, or register data already in object storage.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 flex gap-2">
        {(
          [
            ["schema", "Define schema"],
            ["existing", "From existing data"],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setMode(value);
              setResult(null);
            }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              mode === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,420px)]">
        {/* ── Form ── */}
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-border/60 bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Database
                </span>
                <select
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {databases.length === 0 && <option value="">Loading…</option>}
                  {databases.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Table name
                </span>
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder="customers"
                  spellCheck={false}
                  className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Format
                </span>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {mode === "existing" ? "Location (required)" : "Location (optional)"}
                </span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="s3a://raw-data/customers/"
                  spellCheck={false}
                  className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            {mode === "existing" && format === "CSV" && (
              <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={csvHeader}
                  onChange={(e) => setCsvHeader(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                First row is a header
              </label>
            )}

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Comment (optional)
              </span>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Raw customer records"
                className="w-full rounded-lg border-2 border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          {/* Columns — only when defining a schema by hand. */}
          {mode === "schema" && (
            <div className="rounded-xl border-2 border-border/60 bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Columns
                </span>
                <button
                  onClick={() =>
                    setColumns((prev) => [
                      ...prev,
                      { name: "", type: "STRING", comment: "" },
                    ])
                  }
                  className="flex items-center gap-1 rounded-lg border-2 border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <LuPlus className="h-3 w-3" />
                  Add column
                </button>
              </div>

              <div className="space-y-2">
                {columns.map((c, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_150px_1fr_32px] items-center gap-2"
                  >
                    <input
                      value={c.name}
                      onChange={(e) => updateColumn(i, { name: e.target.value })}
                      placeholder="column_name"
                      spellCheck={false}
                      className="rounded-lg border-2 border-border/60 bg-background px-2.5 py-1.5 font-mono text-xs focus:border-primary focus:outline-none"
                    />
                    <select
                      value={c.type}
                      onChange={(e) => updateColumn(i, { type: e.target.value })}
                      className="rounded-lg border-2 border-border/60 bg-background px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      value={c.comment}
                      onChange={(e) =>
                        updateColumn(i, { comment: e.target.value })
                      }
                      placeholder="comment (optional)"
                      className="rounded-lg border-2 border-border/60 bg-background px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        setColumns((prev) =>
                          prev.length === 1
                            ? prev
                            : prev.filter((_, j) => j !== i)
                        )
                      }
                      disabled={columns.length === 1}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                      title="Remove column"
                    >
                      <LuTrash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {namedColumns.length > 0 && (
                <div className="mt-4">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Partition by
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {namedColumns.map((c) => {
                      const on = partitionBy.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          onClick={() =>
                            setPartitionBy((prev) =>
                              on
                                ? prev.filter((n) => n !== c.name)
                                : [...prev, c.name]
                            )
                          }
                          className={cn(
                            "rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors",
                            on
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── DDL preview ── */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border-2 border-border/60 bg-card">
            <div className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
              Generated SQL
            </div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed">
              {ddl}
            </pre>
          </div>

          {problems.length > 0 && (
            <ul className="space-y-1 rounded-xl border-2 border-border/60 bg-card px-4 py-3 text-xs text-muted-foreground">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}

          <button
            onClick={() => void handleCreate()}
            disabled={running || problems.length > 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {running ? (
              <LuLoader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LuTable className="h-3.5 w-3.5" />
            )}
            {running ? "Creating…" : "Create table"}
          </button>

          {result && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-xl border-2 px-4 py-3 text-xs",
                result.ok
                  ? "border-border/60 bg-card text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              )}
            >
              {result.ok ? (
                <LuCircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <LuCircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="break-words">{result.message}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
