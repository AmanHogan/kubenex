import { NextResponse } from "next/server";

/**
 * POST /api/execute — execute code in a specific language.
 *
 * Supports:
 *   - sql: proxies to Spark Thrift via /api/sql
 *   - python: proxies to JupyterHub kernel gateway API
 *
 * Body: { language: "sql" | "python", code: string }
 */

const JUPYTER_URL =
  process.env.JUPYTER_URL ?? "http://jupyterhub.data-platform.svc.cluster.local:8000";
const JUPYTER_TOKEN = process.env.JUPYTER_TOKEN ?? "";

type ExecResult = {
  output: string;
  status: "success" | "error";
};

/**
 * Jupyter's REST API requires an `_xsrf` token (double-submit cookie) on
 * every state-changing request (POST/DELETE). Fetch it once by hitting a
 * plain page and parsing the Set-Cookie response.
 */
async function getXsrfCookies(): Promise<{ cookieHeader: string; xsrfToken: string }> {
  const res = await fetch(`${JUPYTER_URL}/tree`, {
    signal: AbortSignal.timeout(5000),
  });

  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie")?.split(/,(?=[^;]+?=)/) ?? []);

  const jar: Record<string, string> = {};
  for (const raw of setCookie) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }

  const xsrfToken = jar["_xsrf"];
  if (!xsrfToken) {
    throw new Error(`JupyterHub not reachable (no _xsrf cookie from ${JUPYTER_URL}/tree)`);
  }

  const cookieHeader = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  return { cookieHeader, xsrfToken };
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(JUPYTER_TOKEN ? { Authorization: `token ${JUPYTER_TOKEN}` } : {}),
    ...extra,
  };
}

/** Reuse an existing idle kernel if one exists, otherwise start a new one. */
async function getOrCreateKernel(cookieHeader: string, xsrfToken: string): Promise<string> {
  const listRes = await fetch(`${JUPYTER_URL}/api/kernels`, {
    headers: authHeaders({ Cookie: cookieHeader }),
    signal: AbortSignal.timeout(5000),
  });

  if (!listRes.ok) {
    throw new Error(`JupyterHub not reachable (${listRes.status})`);
  }

  const kernels = (await listRes.json()) as { id: string }[];
  if (kernels.length > 0) return kernels[0].id;

  const createRes = await fetch(`${JUPYTER_URL}/api/kernels`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      "X-XSRFToken": xsrfToken,
    }),
    body: JSON.stringify({ name: "python3" }),
    signal: AbortSignal.timeout(10000),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Failed to start Python kernel (${createRes.status}): ${body}`);
  }

  const kernel = (await createRes.json()) as { id: string };
  return kernel.id;
}

/**
 * Run code on a Jupyter kernel over its WebSocket channel — the only way to
 * actually execute code against a kernel (there is no REST execute endpoint
 * on stock Jupyter). Speaks the Jupyter messaging protocol directly:
 * send one execute_request on the shell channel, collect stdout/results/
 * errors off the iopub channel until that request's kernel goes idle again.
 */
async function runPythonInKernel(code: string): Promise<ExecResult> {
  const { cookieHeader, xsrfToken } = await getXsrfCookies();
  const kernelId = await getOrCreateKernel(cookieHeader, xsrfToken);

  const wsBase = JUPYTER_URL.replace(/^http/, "ws");
  const wsUrl = JUPYTER_TOKEN
    ? `${wsBase}/api/kernels/${kernelId}/channels?token=${encodeURIComponent(JUPYTER_TOKEN)}`
    : `${wsBase}/api/kernels/${kernelId}/channels`;

  const msgId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  return new Promise<ExecResult>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let output = "";
    let hasError = false;
    let settled = false;

    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error("Python execution timed out after 30s"));
    }, 30000);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          header: {
            msg_id: msgId,
            username: "kubenex",
            session: sessionId,
            msg_type: "execute_request",
            version: "5.3",
            date: new Date().toISOString(),
          },
          parent_header: {},
          metadata: {},
          content: {
            code,
            silent: false,
            store_history: true,
            user_expressions: {},
            allow_stdin: false,
            stop_on_error: true,
          },
          buffers: [],
          channel: "shell",
        })
      );
    });

    ws.addEventListener("message", (ev) => {
      let msg: {
        channel: string;
        msg_type: string;
        parent_header?: { msg_id?: string };
        content: Record<string, unknown>;
      };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      if (msg.channel !== "iopub" || msg.parent_header?.msg_id !== msgId) return;

      switch (msg.msg_type) {
        case "stream":
          output += String(msg.content.text ?? "");
          break;
        case "execute_result":
        case "display_data": {
          const data = msg.content.data as Record<string, string> | undefined;
          if (data?.["text/plain"]) output += data["text/plain"] + "\n";
          break;
        }
        case "error": {
          hasError = true;
          const ename = String(msg.content.ename ?? "Error");
          const evalue = String(msg.content.evalue ?? "");
          const traceback = (msg.content.traceback as string[] | undefined) ?? [];
          const clean = traceback.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "")).join("\n");
          output += `${clean || `${ename}: ${evalue}`}\n`;
          break;
        }
        case "status":
          if (msg.content.execution_state === "idle") {
            finish({ output: output || "No output", status: hasError ? "error" : "success" });
          }
          break;
      }
    });

    ws.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("WebSocket connection to the kernel failed"));
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { language, code } = (await req.json()) as {
      language: string;
      code: string;
    };

    if (!code.trim()) {
      return NextResponse.json({ output: "", status: "success" });
    }

    if (language === "sql") {
      // Proxy to our existing SQL route
      const sqlRes = await fetch(new URL("/api/sql", req.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: code, source: "notebook" }),
      });
      const sqlData = await sqlRes.json();

      if (!sqlRes.ok || sqlData?.error) {
        return NextResponse.json({
          output: sqlData.error ?? "SQL execution failed",
          status: "error",
          durationMs: sqlData.durationMs ?? null,
        });
      }

      // Return the result set structurally so the notebook can render a real
      // table. `output` is kept as a text fallback for anything that only
      // knows how to show a string (and for the Python branch below).
      const rows = sqlData.rows as Record<string, string | null>[] | undefined;
      const cols = sqlData.columns as string[] | undefined;

      if (rows && cols && rows.length > 0) {
        const preview = rows
          .slice(0, 100)
          .map((r) => cols.map((c) => String(r[c] ?? "")).join(" | "))
          .join("\n");

        return NextResponse.json({
          status: "success",
          output: `${cols.join(" | ")}\n${cols.map(() => "---").join(" | ")}\n${preview}`,
          columns: cols,
          rows,
          rowCount: sqlData.rowCount ?? rows.length,
          truncated: sqlData.truncated ?? false,
          durationMs: sqlData.durationMs ?? null,
        });
      }

      // DDL/DML and empty result sets: no grid, just an acknowledgement.
      return NextResponse.json({
        status: "success",
        output: sqlData.message ?? "OK — statement executed, no rows returned.",
        columns: cols ?? [],
        rows: [],
        rowCount: 0,
        truncated: false,
        durationMs: sqlData.durationMs ?? null,
      });
    }

    if (language === "python") {
      try {
        const result = await runPythonInKernel(code);
        return NextResponse.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({
          output: `${message}\nOpen JupyterHub directly: ${JUPYTER_URL}`,
          status: "error",
        });
      }
    }

    return NextResponse.json({
      output: `Unsupported language: ${language}`,
      status: "error",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
