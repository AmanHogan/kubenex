import { NextResponse } from "next/server";

/**
 * GET /api/catalog — the Hive metastore, read through the SQL gateway.
 *
 * Query params:
 *   (none)                             → databases, each with its tables
 *   ?db=bronze&table=sales             → full table detail
 *   ?db=bronze&table=sales&sample=true → first rows of the table
 *
 * Everything here comes from live metastore queries. Two tabs in the UI have
 * no backing data on this platform and are reported as unavailable rather than
 * invented: Spark on Hive has no Unity-Catalog-style grants or policy engine.
 */

const GATEWAY_URL =
  process.env.SQL_GATEWAY_URL ??
  process.env.THRIFT_PROXY_URL ??
  "http://sql-gateway.data-platform.svc.cluster.local:8080";

/** Cap on how many tables we will DESCRIBE when building the tree. */
const MAX_DESCRIBED = 60;

interface QueryResult {
  columns: string[];
  rows: Record<string, string | null>[];
}

async function q(sql: string, timeoutMs = 20000): Promise<QueryResult> {
  const res = await fetch(`${GATEWAY_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, source: "catalog" }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error ?? `Gateway returned ${res.status}`);
  }
  return { columns: data.columns ?? [], rows: data.rows ?? [] };
}

/** First column of every row — the shape SHOW DATABASES / SHOW TABLES returns. */
function column(result: QueryResult, name: string): string[] {
  return result.rows
    .map((r) => r[name] ?? Object.values(r)[0] ?? "")
    .filter((v): v is string => Boolean(v));
}

/* ── DESCRIBE FORMATTED parsing ─────────────────────────────────────────── */

interface ParsedDescribe {
  columns: { name: string; type: string; comment: string }[];
  partitionKeys: string[];
  info: Record<string, string>;
}

/**
 * DESCRIBE FORMATTED returns one flat result set with marker rows separating
 * three sections: the column list, an optional partition block, and a block of
 * key/value table metadata. Sections are delimited by rows whose col_name
 * starts with "#", so we switch mode on those rather than guessing by position.
 */
function parseDescribe(result: QueryResult): ParsedDescribe {
  const columns: ParsedDescribe["columns"] = [];
  const partitionKeys: string[] = [];
  const info: Record<string, string> = {};

  let section: "columns" | "partition" | "info" = "columns";

  for (const row of result.rows) {
    const name = (row.col_name ?? "").trim();
    const type = (row.data_type ?? "").trim();
    const comment = (row.comment ?? "").trim();

    if (!name && !type) continue;

    if (name.startsWith("#")) {
      const marker = name.toLowerCase();
      if (marker.includes("partition")) section = "partition";
      else if (marker.includes("detailed") || marker.includes("storage")) {
        section = "info";
      }
      continue;
    }

    if (section === "columns") {
      columns.push({ name, type, comment });
    } else if (section === "partition") {
      // The partition block repeats columns already listed above; keep only
      // the names so they can be flagged on the main column list.
      if (!partitionKeys.includes(name)) partitionKeys.push(name);
    } else {
      info[name] = type;
    }
  }

  return { columns, partitionKeys, info };
}

/* ── Lineage from query history ─────────────────────────────────────────── */

const WRITE_RE = /(?:insert\s+(?:into|overwrite)\s+(?:table\s+)?|create\s+table\s+(?:if\s+not\s+exists\s+)?)([a-z0-9_]+\.[a-z0-9_]+)/gi;
const READ_RE = /(?:from|join)\s+([a-z0-9_]+\.[a-z0-9_]+)/gi;

function matches(re: RegExp, text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(re)) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * Derive lineage by reading past statements. This is real but approximate: it
 * only sees what has actually been run through the platform, and only
 * statements that name tables explicitly.
 */
async function lineageFor(
  fq: string
): Promise<{ upstream: unknown[]; downstream: unknown[]; derived: true }> {
  const upstream = new Map<string, string>();
  const downstream = new Map<string, string>();

  try {
    const res = await fetch(`${GATEWAY_URL}/history?limit=500`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    for (const entry of data.entries ?? []) {
      if (entry.status !== "success") continue;
      const sql: string = entry.statement ?? "";
      const writes = matches(WRITE_RE, sql);
      const reads = matches(READ_RE, sql).filter((t) => !writes.includes(t));

      // Something wrote into this table: everything it read is upstream.
      if (writes.includes(fq)) {
        for (const r of reads) upstream.set(r, entry.startedAt);
      }
      // Something read this table to populate another: that one is downstream.
      if (reads.includes(fq)) {
        for (const w of writes) downstream.set(w, entry.startedAt);
      }
    }
  } catch {
    // History is best-effort; an empty graph is better than a fabricated one.
  }

  const node = ([table, at]: [string, string]) => ({
    table: table.split(".")[1] ?? table,
    database: table.split(".")[0] ?? "",
    job: "SQL statement",
    jobType: "manual" as const,
    lastRun: at,
  });

  return {
    upstream: [...upstream.entries()].map(node),
    downstream: [...downstream.entries()].map(node),
    derived: true,
  };
}

/* ── Handlers ───────────────────────────────────────────────────────────── */

async function tableSummaries(db: string, budget: { left: number }) {
  const names = column(await q(`SHOW TABLES IN \`${db}\``), "tableName");

  return Promise.all(
    names.map(async (name) => {
      let columnCount = 0;
      let format = "—";
      let type = "TABLE";

      if (budget.left > 0) {
        budget.left -= 1;
        try {
          const parsed = parseDescribe(
            await q(`DESCRIBE FORMATTED \`${db}\`.\`${name}\``)
          );
          columnCount = parsed.columns.length;
          format = parsed.info["Provider"] ?? "—";
          type = parsed.info["Type"] ?? "TABLE";
        } catch {
          // A table can exist in the metastore but fail to describe (missing
          // files, bad serde). Surface it in the list rather than dropping it.
        }
      }

      return {
        name,
        type,
        format,
        description: "",
        owner: "",
        columnCount,
        rowCount: "—",
        tags: [] as string[],
      };
    })
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const db = url.searchParams.get("db");
    const table = url.searchParams.get("table");
    const sample = url.searchParams.get("sample") === "true";

    /* Sample rows. */
    if (db && table && sample) {
      const limit = Math.min(
        Number(url.searchParams.get("limit") ?? "100") || 100,
        500
      );
      const result = await q(
        `SELECT * FROM \`${db}\`.\`${table}\` LIMIT ${limit}`,
        60000
      );
      return NextResponse.json({
        columns: result.columns,
        rows: result.rows,
      });
    }

    /* Full table detail. */
    if (db && table) {
      const parsed = parseDescribe(
        await q(`DESCRIBE FORMATTED \`${db}\`.\`${table}\``)
      );
      const info = parsed.info;

      // COUNT(*) is a real scan, so it is only done for a single table on the
      // detail view — never while building the tree.
      let numRows = "—";
      try {
        const counted = await q(
          `SELECT COUNT(*) AS n FROM \`${db}\`.\`${table}\``,
          60000
        );
        numRows = counted.rows[0]?.n ?? "—";
      } catch {
        // Table may be unreadable even though its metadata resolves.
      }

      // Spark writes "UNKNOWN" (not a date) whenever a field is unset.
      const dateOrEmpty = (value: string | undefined): string => {
        if (!value || value.toUpperCase() === "UNKNOWN") return "";
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
      };

      const detail = {
        name: table,
        database: db,
        type: info["Type"] ?? "TABLE",
        format: info["Provider"] ?? "—",
        location: info["Location"] ?? "—",
        owner: info["Owner"] ?? "—",
        description: info["Comment"] ?? "",
        createdAt: dateOrEmpty(info["Created Time"]),
        updatedAt: dateOrEmpty(info["Last Access"]),
        columns: parsed.columns.map((c) => ({
          name: c.name,
          type: c.type,
          description: c.comment,
          // Hive/Spark does not model nullability or primary keys here, so
          // these are reported permissively rather than invented per column.
          nullable: true,
          isPrimaryKey: false,
          isPartitionKey: parsed.partitionKeys.includes(c.name),
        })),
        properties: info,
        partitionKeys: parsed.partitionKeys,
        serde: info["Serde Library"] ?? "—",
        inputFormat: info["InputFormat"] ?? "—",
        outputFormat: info["OutputFormat"] ?? "—",
        totalSize: info["Statistics"] ?? "—",
        numRows,
        numFiles: "—",
        permissions: [],
        policies: [],
        lineage: await lineageFor(`${db}.${table}`.toLowerCase()),
        tags: [],
        // Tells the UI to say "unavailable" instead of rendering empty tabs as
        // though the table genuinely had no grants or policies.
        governance: {
          available: false,
          reason:
            "This platform runs Spark on a Hive metastore, which has no grant or policy catalog. Permissions and policies are not tracked.",
        },
      };

      return NextResponse.json({ table: detail });
    }

    /* Database tree. */
    const dbNames = column(await q("SHOW DATABASES"), "namespace");
    const budget = { left: MAX_DESCRIBED };

    const databases = await Promise.all(
      dbNames.map(async (name) => {
        let tables: Awaited<ReturnType<typeof tableSummaries>> = [];
        try {
          tables = await tableSummaries(name, budget);
        } catch {
          // Skip a database we cannot enumerate rather than failing the page.
        }
        return {
          name,
          description: "",
          owner: "",
          location: "",
          tableCount: tables.length,
          tables,
        };
      })
    );

    return NextResponse.json({ databases });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
