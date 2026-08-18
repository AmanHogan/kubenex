import { NextResponse } from "next/server";

/**
 * GET /api/compute — fetch Spark cluster info from Spark Master REST API.
 *
 * Spark Master API: http://<spark-master>:8080/json/
 * NOTE: The Spark Master JSON API uses ALL LOWERCASE field names
 * (activeapps, coresused, memoryused, memoryperslave, etc.)
 */

const SPARK_MASTER_URL =
  process.env.SPARK_MASTER_URL ??
  "http://spark-master.data-platform.svc.cluster.local:8080";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(): Promise<NextResponse> {
  try {
    let raw: any = null;

    try {
      const res = await fetch(`${SPARK_MASTER_URL}/json/`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        raw = await res.json();
      }
    } catch {
      // Spark Master not reachable
    }

    if (!raw) {
      return NextResponse.json({
        cluster: null,
        message: "Spark Master not reachable",
      });
    }

    // Spark JSON API uses all-lowercase keys
    const workers = raw.workers ?? raw.aliveworkers ?? [];
    const activeApps = raw.activeapps ?? raw.activeApps ?? [];
    const completedApps = raw.completedapps ?? raw.completedApps ?? [];

    return NextResponse.json({
      cluster: {
        status: raw.status ?? "UNKNOWN",
        totalCores: raw.cores ?? 0,
        usedCores: raw.coresused ?? raw.coresUsed ?? 0,
        totalMemoryMB: raw.memory ?? 0,
        usedMemoryMB: raw.memoryused ?? raw.memoryUsed ?? 0,
        workers: workers.map((w: any) => ({
          id: w.id,
          host: w.host,
          state: w.state,
          cores: w.cores ?? 0,
          coresUsed: w.coresused ?? w.coresUsed ?? 0,
          memoryMB: w.memory ?? 0,
          memoryUsedMB: w.memoryused ?? w.memoryUsed ?? 0,
        })),
        activeApps: activeApps.map((a: any) => ({
          id: a.id,
          name: a.name,
          cores: a.cores ?? 0,
          memoryPerExecutorMB: a.memoryperslave ?? a.memoryPerExecutorMB ?? 0,
          state: a.state,
          startTime: new Date(a.starttime ?? a.startTime ?? 0).toISOString(),
          durationMs: a.duration ?? 0,
        })),
        completedApps: completedApps.slice(0, 10).map((a: any) => ({
          id: a.id,
          name: a.name,
          state: a.state,
          startTime: new Date(a.starttime ?? a.startTime ?? 0).toISOString(),
          durationMs: a.duration ?? 0,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
