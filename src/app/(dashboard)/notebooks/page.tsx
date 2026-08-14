import { LuExternalLink, LuNotebook } from "react-icons/lu";

/**
 * Notebooks — link through to JupyterHub with embedded preview.
 * Phase 2 will embed the Jupyter iframe directly.
 */
export default function NotebooksPage(): React.JSX.Element {
  const jupyterUrl = process.env.NEXT_PUBLIC_JUPYTER_URL ?? "http://100.112.249.53:30888";

  return (
    <>
      <div className="mb-6">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Notebooks
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interactive PySpark notebooks on JupyterHub.
        </p>
      </div>

      <div className="rounded-xl border-2 border-border/60 bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LuNotebook className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">JupyterHub</h3>
            <p className="text-xs text-muted-foreground">
              PySpark connected to Spark master on the cluster
            </p>
          </div>
        </div>
        <a
          href={jupyterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open JupyterHub
          <LuExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </>
  );
}
