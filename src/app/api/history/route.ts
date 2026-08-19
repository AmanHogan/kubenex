import { NextResponse } from "next/server";

/**
 * GET /api/history — recent SQL executions, newest first.
 *
 * History is recorded by the SQL gateway rather than here, so every statement
 * is captured no matter which surface ran it (SQL editor, notebook cell,
 * ingest job) — including ones that never reach this route.
 *
 * Query params: ?limit=100&source=sql-editor
 */
const GATEWAY_URL =
  process.env.SQL_GATEWAY_URL ??
  process.env.THRIFT_PROXY_URL ??
  "http://sql-gateway.data-platform.svc.cluster.local:8080";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") ?? "100";
    const source = url.searchParams.get("source");

    const params = new URLSearchParams({ limit });
    if (source && source !== "all") params.set("source", source);

    const res = await fetch(`${GATEWAY_URL}/history?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `SQL gateway error: ${res.status}`, entries: [] },
        { status: 502 }
      );
    }

    return NextResponse.json(await res.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, entries: [] }, { status: 502 });
  }
}
