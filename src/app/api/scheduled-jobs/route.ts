import { NextResponse } from "next/server";

/**
 * Scheduled jobs — SQL saved from a notebook and run on a cron schedule.
 *
 *   GET    /api/scheduled-jobs        → list
 *   POST   /api/scheduled-jobs        → create
 *   DELETE /api/scheduled-jobs?id=1   → remove
 *
 * Definitions live in Postgres behind the SQL gateway. A factory DAG in Airflow
 * reads that table and generates one DAG per job, so creating a schedule never
 * requires this app to hold Kubernetes credentials or write to the DAG folder.
 */
const GATEWAY_URL =
  process.env.SQL_GATEWAY_URL ??
  process.env.THRIFT_PROXY_URL ??
  "http://sql-gateway.data-platform.svc.cluster.local:8080";

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${GATEWAY_URL}/jobs`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok || data?.error) {
      return NextResponse.json(
        { error: data?.error ?? `Gateway returned ${res.status}`, jobs: [] },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, jobs: [] }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      name?: string;
      schedule?: string;
      statements?: string[];
      sourceNotebook?: string;
    };

    const res = await fetch(`${GATEWAY_URL}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: body.name,
        schedule: body.schedule,
        statements: body.statements ?? [],
        source_notebook: body.sourceNotebook,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (!res.ok || data?.error) {
      return NextResponse.json(
        { error: data?.error ?? "Could not create job" },
        { status: res.status === 409 ? 409 : 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const res = await fetch(`${GATEWAY_URL}/jobs/${id}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok || data?.error) {
      return NextResponse.json(
        { error: data?.error ?? "Could not delete job" },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
