"use client";

import { useState, useRef } from "react";
import {
  LuUpload,
  LuFile,
  LuLoader,
  LuCircleCheck,
  LuCircleX,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

export default function IngestPage(): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bucket, setBucket] = useState("raw-data");
  const [database, setDatabase] = useState("");
  const [tableName, setTableName] = useState("");
  const [format, setFormat] = useState("csv");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    uploaded: boolean;
    location: string;
    size: number;
    registered: boolean;
    table?: string;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(f: File): void {
    setFile(f);
    setResult(null);
    setError(null);

    // Auto-detect format from extension
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext === "parquet") setFormat("parquet");
    else if (ext === "json" || ext === "jsonl") setFormat("json");
    else setFormat("csv");

    // Auto-set table name from file name
    if (!tableName) {
      const base = f.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
      setTableName(base);
    }
  }

  async function handleUpload(): Promise<void> {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", bucket);
      fd.append("format", format);
      if (database) fd.append("database", database);
      if (database && tableName) fd.append("tableName", tableName);

      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Data Ingestion
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload files to MinIO and register as Hive tables.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload section */}
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : file
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border/60 bg-card hover:border-primary/40"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFileSelect(f);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.parquet,.json,.jsonl,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            {file ? (
              <>
                <LuFile className="mb-2 h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </p>
              </>
            ) : (
              <>
                <LuUpload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a file or click to browse</p>
                <p className="text-xs text-muted-foreground">
                  CSV, Parquet, JSON supported
                </p>
              </>
            )}
          </div>

          {/* Config fields */}
          <div className="space-y-3 rounded-xl border-2 border-border/60 bg-card p-5">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Target Bucket
              </label>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="raw-data">raw-data</option>
                <option value="processed-data">processed-data</option>
                <option value="notebooks">notebooks</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="csv">CSV</option>
                <option value="parquet">Parquet</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Register as Table (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="database"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className="w-1/2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="table_name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="w-1/2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              onClick={() => void handleUpload()}
              disabled={!file || uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <LuLoader className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <LuUpload className="h-4 w-4" />
                  Upload & Register
                </>
              )}
            </button>
          </div>
        </div>

        {/* Result section */}
        <div>
          {error && (
            <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <LuCircleX className="h-4 w-4 shrink-0" />
                {error}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3 rounded-xl border-2 border-border/60 bg-card p-5">
              <div className="flex items-center gap-2">
                {result.uploaded ? (
                  <LuCircleCheck className="h-5 w-5 text-emerald-400" />
                ) : (
                  <LuCircleX className="h-5 w-5 text-red-400" />
                )}
                <h3 className="text-sm font-semibold">
                  {result.uploaded ? "Upload Successful" : "Upload Failed"}
                </h3>
              </div>

              {result.uploaded && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-mono">{result.location}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Size</span>
                    <span className="tabular-nums">{(result.size / 1024).toFixed(1)} KB</span>
                  </div>
                  {result.table && (
                    <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
                      <span className="text-muted-foreground">Table</span>
                      <span className={cn(
                        "font-mono",
                        result.registered ? "text-emerald-400" : "text-amber-400"
                      )}>
                        {result.table}
                        {result.registered ? " ✓" : " (registration failed)"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {result.error && (
                <p className="text-xs text-amber-400">{result.error}</p>
              )}
            </div>
          )}

          {!result && !error && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-border/60 bg-card px-6 py-16 text-center">
              <LuUpload className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Upload a file to see results here.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Files are stored in MinIO and optionally registered as Hive tables.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
