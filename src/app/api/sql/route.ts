import { NextResponse } from "next/server";

const THRIFT_HOST =
  process.env.THRIFT_HOST ??
  "spark-thrift.data-platform.svc.cluster.local";
const THRIFT_PORT = process.env.THRIFT_PORT ?? "10000";

// HTTP bridge in front of the Thrift Server — see deploy/sql-gateway.
const GATEWAY_URL =
  process.env.SQL_GATEWAY_URL ??
  process.env.THRIFT_PROXY_URL ??
  "http://sql-gateway.data-platform.svc.cluster.local:8080";

/**
 * POST /api/sql — execute a Spark SQL query via the Thrift Server.
 *
 * Phase 1: shells out to beeline on the thrift pod via kubectl exec.
 * Phase 2: direct JDBC via a Node Hive2 driver, or a thin Python sidecar.
 *
 * Request body: { query: string }
 * Response: { columns: string[], rows: Record<string, string>[] }
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { query, source } = (await req.json()) as {
      query?: string;
      source?: string;
    };
    if (!query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const jdbcUrl = `jdbc:hive2://${THRIFT_HOST}:${THRIFT_PORT}`;

    const resp = await fetch(
      `${GATEWAY_URL}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdbc_url: jdbcUrl, query, source: source ?? "sql-editor" }),
      }
    );

    // The gateway returns 400 with a JSON body for statement errors; pass that
    // message straight through rather than wrapping the raw payload in text.
    if (!resp.ok) {
      const text = await resp.text();
      try {
        const parsed = JSON.parse(text) as { error?: string; durationMs?: number };
        if (parsed?.error) {
          return NextResponse.json(parsed, { status: resp.status });
        }
      } catch {
        // Not JSON — fall through to the raw-text form below.
      }
      return NextResponse.json(
        { error: `SQL gateway error: ${text}` },
        { status: 502 }
      );
    }

    const data = await resp.json();

    // The gateway reports statement errors in the body; treat them as failures
    // rather than letting an empty result render as a successful query.
    if (data?.error) {
      return NextResponse.json(data, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
