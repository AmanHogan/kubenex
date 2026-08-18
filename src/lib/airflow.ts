/**
 * Airflow REST API client — proxies to the Airflow webserver.
 * All DAG/run/task operations go through here.
 *
 * Airflow REST API docs: https://airflow.apache.org/docs/apache-airflow/stable/stable-rest-api-ref.html
 */

const AIRFLOW_BASE =
  process.env.AIRFLOW_URL ??
  "http://airflow.data-platform.svc.cluster.local:8080";
const AIRFLOW_USER = process.env.AIRFLOW_USER ?? "admin";
const AIRFLOW_PASS = process.env.AIRFLOW_PASSWORD ?? "";

function headers(): HeadersInit {
  const auth = Buffer.from(`${AIRFLOW_USER}:${AIRFLOW_PASS}`).toString(
    "base64"
  );
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function airflow(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  return fetch(`${AIRFLOW_BASE}/api/v1${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers as Record<string, string>) },
    cache: "no-store",
    signal: opts.signal ?? AbortSignal.timeout(5000),
  });
}

/* ── DAGs ─────────────────────────────────────────── */

export interface Dag {
  dag_id: string;
  description: string | null;
  is_paused: boolean;
  is_active: boolean;
  schedule_interval: { value: string } | string | null;
  tags: { name: string }[];
  next_dagrun: string | null;
}

/** List all DAGs. */
export async function listDags(): Promise<Dag[]> {
  const res = await airflow("/dags?limit=100");
  if (!res.ok) throw new Error(`Airflow listDags: ${res.status}`);
  const data = await res.json();
  return data.dags ?? [];
}

/** Pause or unpause a DAG. */
export async function toggleDag(
  dagId: string,
  isPaused: boolean
): Promise<void> {
  const res = await airflow(`/dags/${dagId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_paused: isPaused }),
  });
  if (!res.ok) throw new Error(`Airflow toggleDag: ${res.status}`);
}

/* ── DAG Runs ─────────────────────────────────────── */

export interface DagRun {
  dag_run_id: string;
  dag_id: string;
  state: string;
  execution_date: string;
  start_date: string | null;
  end_date: string | null;
  logical_date: string;
  run_type: string;
  note: string | null;
}

/** List runs for a DAG (most recent first). */
export async function listDagRuns(
  dagId: string,
  limit = 25
): Promise<DagRun[]> {
  const res = await airflow(
    `/dags/${dagId}/dagRuns?limit=${limit}&order_by=-start_date`
  );
  if (!res.ok) throw new Error(`Airflow listDagRuns: ${res.status}`);
  const data = await res.json();
  return data.dag_runs ?? [];
}

/** List runs across ALL DAGs. */
export async function listAllRuns(limit = 50): Promise<DagRun[]> {
  // Try GET with ~ wildcard first (Airflow 2.4+)
  const res = await airflow(
    `/dags/~/dagRuns?limit=${limit}&order_by=-start_date`
  );
  if (res.ok) {
    const data = await res.json();
    return data.dag_runs ?? [];
  }

  // Fallback: list each DAG's runs individually
  const dagsRes = await airflow("/dags?limit=100");
  if (!dagsRes.ok) throw new Error(`Airflow listAllRuns: ${dagsRes.status}`);
  const dagsData = await dagsRes.json();
  const dags = (dagsData.dags ?? []) as { dag_id: string }[];

  const allRuns: DagRun[] = [];
  for (const dag of dags.slice(0, 20)) {
    try {
      const runs = await listDagRuns(dag.dag_id, Math.ceil(limit / dags.length));
      allRuns.push(...runs);
    } catch {
      // skip unreachable DAG
    }
  }

  return allRuns
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))
    .slice(0, limit);
}

/** Trigger a new DAG run. */
export async function triggerDag(
  dagId: string,
  conf: Record<string, unknown> = {}
): Promise<DagRun> {
  const res = await airflow(`/dags/${dagId}/dagRuns`, {
    method: "POST",
    body: JSON.stringify({ conf }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airflow triggerDag: ${res.status} — ${text}`);
  }
  return res.json();
}

/** Delete a DAG run. */
export async function deleteDagRun(
  dagId: string,
  dagRunId: string
): Promise<void> {
  const res = await airflow(`/dags/${dagId}/dagRuns/${dagRunId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Airflow deleteDagRun: ${res.status}`);
}

/* ── Task Instances ───────────────────────────────── */

export interface TaskInstance {
  task_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  duration: number | null;
  try_number: number;
}

/** List task instances for a specific run. */
export async function listTaskInstances(
  dagId: string,
  dagRunId: string
): Promise<TaskInstance[]> {
  const res = await airflow(
    `/dags/${dagId}/dagRuns/${dagRunId}/taskInstances`
  );
  if (!res.ok) throw new Error(`Airflow listTaskInstances: ${res.status}`);
  const data = await res.json();
  return data.task_instances ?? [];
}

/** Get task logs. */
export async function getTaskLog(
  dagId: string,
  dagRunId: string,
  taskId: string,
  tryNumber = 1
): Promise<string> {
  const res = await airflow(
    `/dags/${dagId}/dagRuns/${dagRunId}/taskInstances/${taskId}/logs/${tryNumber}`,
    { headers: { Accept: "text/plain" } }
  );
  if (!res.ok) throw new Error(`Airflow getTaskLog: ${res.status}`);
  return res.text();
}
