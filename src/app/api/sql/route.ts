import { NextResponse } from "next/server";

const THRIFT_HOST =
  process.env.THRIFT_HOST ??
  "spark-thrift.data-platform.svc.cluster.local";
const THRIFT_PORT = process.env.THRIFT_PORT ?? "10000";

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
    const { query } = (await req.json()) as { query?: string };
    if (!query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const jdbcUrl = `jdbc:hive2://${THRIFT_HOST}:${THRIFT_PORT}`;

    const resp = await fetch(
      `${process.env.THRIFT_PROXY_URL ?? "http://localhost:3001"}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdbc_url: jdbcUrl, query }),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Thrift proxy error: ${text}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
