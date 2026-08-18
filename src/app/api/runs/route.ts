import { NextResponse } from "next/server";
import {
  listAllRuns,
  listDagRuns,
  deleteDagRun,
  listTaskInstances,
} from "@/lib/airflow";

/**
 * GET /api/runs?dag_id=X — list runs (all DAGs or specific DAG).
 * DELETE /api/runs — delete a specific run.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const dagId = url.searchParams.get("dag_id");
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const runs = dagId
      ? await listDagRuns(dagId, limit)
      : await listAllRuns(limit);

    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const { dag_id, dag_run_id } = (await req.json()) as {
      dag_id: string;
      dag_run_id: string;
    };

    await deleteDagRun(dag_id, dag_run_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/runs — get task instances for a specific run.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { dag_id, dag_run_id } = (await req.json()) as {
      dag_id: string;
      dag_run_id: string;
    };

    const tasks = await listTaskInstances(dag_id, dag_run_id);
    return NextResponse.json({ tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
