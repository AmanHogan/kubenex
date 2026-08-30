"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuFolder,
  LuFile,
  LuDatabase,
  LuChevronRight,
  LuDownload,
  LuEye,
  LuRefreshCw,
  LuUpload,
  LuTable,
  LuX,
} from "react-icons/lu";
import { cn } from "@/lib/utils";

interface BucketInfo {
  name: string;
  creationDate: string | null;
}

interface FolderInfo {
  prefix: string;
  name: string;
}

interface ObjectInfo {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
}

/** Byte count as a short human-readable string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Extensions we can usefully show as text in the preview pane. */
const PREVIEWABLE = /\.(csv|tsv|txt|json|jsonl|ndjson|md|log|ya?ml|xml|sql|py)$/i;

/** Extensions Spark can register as a table without a schema definition. */
const TABLE_FORMATS: Record<string, string> = {
  csv: "CSV",
  tsv: "CSV",
  json: "JSON",
  jsonl: "JSON",
  ndjson: "JSON",
  parquet: "PARQUET",
  orc: "ORC",
};

function tableFormatFor(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TABLE_FORMATS[ext] ?? null;
}

export default function StoragePage(): React.JSX.Element {
  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [bucket, setBucket] = useState<string | null>(null);
  const [prefix, setPrefix] = useState("");
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    key: string;
    text: string;
    truncated: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchBuckets = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch("/api/storage");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBuckets(data.buckets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load buckets");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchObjects = useCallback(
    async (b: string, p: string): Promise<void> => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ bucket: b, prefix: p });
        const res = await fetch(`/api/storage?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setFolders(data.folders ?? []);
        setObjects(data.objects ?? []);
        setTruncated(data.truncated ?? false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load objects");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (bucket === null) void fetchBuckets();
    else void fetchObjects(bucket, prefix);
  }, [bucket, prefix, fetchBuckets, fetchObjects]);

  async function handlePreview(key: string): Promise<void> {
    if (!bucket) return;
    setPreviewLoading(true);
    setPreview({ key, text: "", truncated: false });
    try {
      const params = new URLSearchParams({ bucket, key, action: "preview" });
      const res = await fetch(`/api/storage?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview({ key, text: data.text ?? "", truncated: data.truncated });
    } catch (err) {
      setPreview({
        key,
        text: err instanceof Error ? err.message : "Preview failed",
        truncated: false,
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleUpload(file: File): Promise<void> {
    if (!bucket) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bucket", bucket);
      form.append("prefix", prefix);
      const res = await fetch("/api/storage", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await fetchObjects(bucket, prefix);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(key: string): Promise<void> {
    if (!bucket) return;
    const params = new URLSearchParams({ bucket, key, action: "download" });
    const res = await fetch(`/api/storage?${params}`);
    const data = await res.json();
    if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
  }

  // Breadcrumb segments for the current prefix, each with the prefix to jump to.
  const segments = prefix
    .split("/")
    .filter(Boolean)
    .map((name, i, all) => ({ name, to: all.slice(0, i + 1).join("/") + "/" }));

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Storage
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse object storage backing the lakehouse.
          </p>
        </div>
        <div className="flex items-center gap-2">
        {bucket && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
            <LuUpload className="h-3 w-3" />
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <button
          onClick={() =>
            bucket === null ? void fetchBuckets() : void fetchObjects(bucket, prefix)
          }
          className="flex items-center gap-1.5 rounded-lg border-2 border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <LuRefreshCw className="h-3 w-3" />
          Refresh
        </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => {
            setBucket(null);
            setPrefix("");
            setPreview(null);
          }}
          className={cn(
            "rounded-md px-2 py-1 transition-colors hover:bg-muted",
            bucket === null ? "font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          Buckets
        </button>
        {bucket && (
          <>
            <LuChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <button
              onClick={() => {
                setPrefix("");
                setPreview(null);
              }}
              className={cn(
                "rounded-md px-2 py-1 transition-colors hover:bg-muted",
                prefix === "" ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {bucket}
            </button>
          </>
        )}
        {segments.map((s, i) => (
          <span key={s.to} className="flex items-center gap-1">
            <LuChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <button
              onClick={() => {
                setPrefix(s.to);
                setPreview(null);
              }}
              className={cn(
                "rounded-md px-2 py-1 transition-colors hover:bg-muted",
                i === segments.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {s.name}
            </button>
          </span>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl border-2 border-border/60 bg-card"
            />
          ))}
        </div>
      ) : bucket === null ? (
        /* ── Bucket list ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {buckets.map((b) => (
            <button
              key={b.name}
              onClick={() => {
                setBucket(b.name);
                setPrefix("");
              }}
              className="group flex items-start gap-3 rounded-xl border-2 border-border/60 bg-card px-4 py-3.5 text-left transition-colors hover:border-primary"
            >
              <LuDatabase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{b.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Created {formatDate(b.creationDate)}
                </p>
              </div>
            </button>
          ))}
          {buckets.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center">
              <LuDatabase className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No buckets found.</p>
            </div>
          )}
        </div>
      ) : folders.length === 0 && objects.length === 0 ? (
        <div className="rounded-xl border-2 border-border/60 bg-card px-6 py-12 text-center">
          <LuFolder className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This location is empty.</p>
        </div>
      ) : (
        /* ── Object list ── */
        <div className="overflow-hidden rounded-xl border-2 border-border/60">
          <div className="grid grid-cols-[1fr_110px_190px_90px] gap-4 border-b border-border/40 bg-muted/50 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Name</span>
            <span className="text-right">Size</span>
            <span>Last modified</span>
            <span className="text-right">Actions</span>
          </div>

          {folders.map((f) => (
            <button
              key={f.prefix}
              onClick={() => {
                setPrefix(f.prefix);
                setPreview(null);
              }}
              className="grid w-full grid-cols-[1fr_110px_190px_90px] items-center gap-4 border-b border-border/40 bg-card px-5 py-2.5 text-left transition-colors hover:bg-muted/30"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <LuFolder className="h-3.5 w-3.5 shrink-0 text-primary" />
                {f.name}
              </span>
              <span className="text-right text-xs text-muted-foreground">—</span>
              <span className="text-xs text-muted-foreground">—</span>
              <span />
            </button>
          ))}

          {objects.map((o) => (
            <div
              key={o.key}
              className="grid grid-cols-[1fr_110px_190px_90px] items-center gap-4 border-b border-border/40 bg-card px-5 py-2.5 transition-colors hover:bg-muted/30"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <LuFile className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">{o.name}</span>
              </span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {formatSize(o.size)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDate(o.lastModified)}
              </span>
              <span className="flex items-center justify-end gap-1">
                {tableFormatFor(o.name) && (
                  <Link
                    href={`/catalog/new?location=${encodeURIComponent(`s3a://${bucket}/${o.key}`)}&format=${tableFormatFor(o.name)}`}
                    title="Create a table from this file"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LuTable className="h-3.5 w-3.5" />
                  </Link>
                )}
                {PREVIEWABLE.test(o.name) && (
                  <button
                    onClick={() => void handlePreview(o.key)}
                    title="Preview"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <LuEye className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => void handleDownload(o.key)}
                  title="Download"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <LuDownload className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}

          {truncated && (
            <div className="bg-card px-5 py-2 text-xs text-muted-foreground">
              Showing the first 500 entries.
            </div>
          )}
        </div>
      )}

      {/* Preview pane */}
      {preview && (
        <div className="mt-4 overflow-hidden rounded-xl border-2 border-border/60 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
            <span className="truncate font-mono text-xs text-muted-foreground">
              {preview.key}
            </span>
            <button
              onClick={() => setPreview(null)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LuX className="h-3.5 w-3.5" />
            </button>
          </div>
          <pre className="max-h-96 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
            {previewLoading ? "Loading…" : preview.text}
          </pre>
          {preview.truncated && (
            <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
              Preview truncated to the first 64 KB.
            </div>
          )}
        </div>
      )}
    </>
  );
}
