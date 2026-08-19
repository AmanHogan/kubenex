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
      // Execute Python via JupyterHub API
      // Uses the Jupyter Server REST API to create a kernel session and execute
      try {
        // Try to get or create a kernel
        const kernelsRes = await fetch(`${JUPYTER_URL}/api/kernels`, {
          headers: {
            Authorization: `token ${JUPYTER_TOKEN}`,
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!kernelsRes.ok) {
          return NextResponse.json({
            output: `JupyterHub not reachable (${kernelsRes.status}). Use JupyterHub directly for Python notebooks: ${JUPYTER_URL}`,
            status: "error",
          });
        }

        const kernels = (await kernelsRes.json()) as { id: string }[];
        let kernelId: string;

        if (kernels.length > 0) {
          kernelId = kernels[0].id;
        } else {
          // Start a new kernel
          const newKernel = await fetch(`${JUPYTER_URL}/api/kernels`, {
            method: "POST",
            headers: {
              Authorization: `token ${JUPYTER_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: "python3" }),
          });
          if (!newKernel.ok) {
            return NextResponse.json({
              output: "Failed to start Python kernel. Open JupyterHub directly.",
              status: "error",
            });
          }
          const kernelData = (await newKernel.json()) as { id: string };
          kernelId = kernelData.id;
        }

        // Execute code via kernel REST API
        const execRes = await fetch(
          `${JUPYTER_URL}/api/kernels/${kernelId}/execute`,
          {
            method: "POST",
            headers: {
              Authorization: `token ${JUPYTER_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ code }),
            signal: AbortSignal.timeout(30000),
          }
        );

        if (!execRes.ok) {
          // Fallback message — kernel execute endpoint may not exist
          // in standard JupyterHub (needs jupyter-kernel-gateway)
          return NextResponse.json({
            output: `Python execution requires Jupyter Kernel Gateway.\nUse JupyterHub directly: ${JUPYTER_URL}`,
            status: "error",
          });
        }

        const execData = (await execRes.json()) as {
          output?: string;
          error?: string;
        };

        return NextResponse.json({
          output: execData.output ?? execData.error ?? "No output",
          status: execData.error ? "error" : "success",
        });
      } catch {
        return NextResponse.json({
          output: `Python kernel not available locally.\nOpen JupyterHub for PySpark: ${JUPYTER_URL}`,
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
