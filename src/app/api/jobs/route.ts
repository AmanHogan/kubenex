import { NextResponse } from "next/server";
import {
  listDags,
  triggerDag,
  toggleDag,
  listDagRuns,
} from "@/lib/airflow";

/**
 * GET /api/jobs — list all DAGs with their latest run info.
 * POST /api/jobs — trigger a DAG run or toggle pause state.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const dags = await listDags();

    // Fetch latest run for each DAG
    const dagsWithRuns = await Promise.all(
      dags.map(async (dag) => {
        try {
          const runs = await listDagRuns(dag.dag_id, 1);
          return { ...dag, latest_run: runs[0] ?? null };
        } catch {
          return { ...dag, latest_run: null };
        }
      })
    );

    return NextResponse.json({ dags: dagsWithRuns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { action, dag_id, is_paused, conf } = body as {
      action: "trigger" | "toggle";
      dag_id: string;
      is_paused?: boolean;
      conf?: Record<string, unknown>;
    };

    if (action === "trigger") {
      const run = await triggerDag(dag_id, conf ?? {});
      return NextResponse.json({ run });
    }

    if (action === "toggle" && typeof is_paused === "boolean") {
      await toggleDag(dag_id, is_paused);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
