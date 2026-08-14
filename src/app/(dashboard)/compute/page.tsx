import { LuCpu, LuHardDrive, LuServer, LuActivity } from "react-icons/lu";

/**
 * Compute — view Spark cluster resources and pod status.
 * Will call /api/compute to proxy Spark REST API + k8s pod info.
 */
export default function ComputePage(): React.JSX.Element {
  const pods = [
    { name: "spark-master", status: "Running", cpu: "200m / 1", mem: "512Mi / 1Gi" },
    { name: "spark-worker", status: "Running", cpu: "500m / 2", mem: "3Gi / 4Gi" },
    { name: "spark-thrift", status: "Running", cpu: "300m / 1", mem: "1Gi / 2Gi" },
    { name: "postgres", status: "Running", cpu: "100m / 500m", mem: "256Mi / 512Mi" },
    { name: "airflow", status: "Running", cpu: "300m / 1", mem: "1Gi / 2Gi" },
    { name: "jupyterhub", status: "Running", cpu: "500m / 2", mem: "2Gi / 4Gi" },
    { name: "minio", status: "Running", cpu: "200m / 1", mem: "512Mi / 1Gi" },
  ] as const;

  return (
    <>
      <div className="mb-6">
        <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Compute Resources
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spark cluster and data-platform pod status.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-border/60 bg-card p-5">
          <LuServer className="mb-2 h-4 w-4 text-muted-foreground" />
          <p className="text-2xl font-bold">7</p>
          <p className="mt-1 text-xs text-muted-foreground">Running Pods</p>
        </div>
        <div className="rounded-xl border-2 border-border/60 bg-card p-5">
          <LuCpu className="mb-2 h-4 w-4 text-muted-foreground" />
          <p className="text-2xl font-bold">4 cores</p>
          <p className="mt-1 text-xs text-muted-foreground">Spark Compute</p>
        </div>
        <div className="rounded-xl border-2 border-border/60 bg-card p-5">
          <LuHardDrive className="mb-2 h-4 w-4 text-muted-foreground" />
          <p className="text-2xl font-bold">20 Gi</p>
          <p className="mt-1 text-xs text-muted-foreground">MinIO Storage</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border-2 border-border/60 bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pod
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                CPU (req / limit)
              </th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Memory (req / limit)
              </th>
            </tr>
          </thead>
          <tbody>
            {pods.map((pod) => (
              <tr
                key={pod.name}
                className="border-b border-border/30 last:border-0"
              >
                <td className="px-4 py-2.5 font-mono text-xs font-medium">
                  {pod.name}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    <LuActivity className="h-3 w-3" />
                    {pod.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {pod.cpu}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {pod.mem}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
