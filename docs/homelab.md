# Homelab Architecture

Reference for the k3s cluster behind Kubenex. Verified against the live cluster
on 19 Aug 2026.

## Quick reference

All services answer on the Tailscale address of the control-plane node,
`100.112.249.53`.

| Service | Port | Namespace |
|---|---|---|
| Airflow | 30880 | data-platform |
| JupyterHub | 30888 | data-platform |
| Spark Master UI | 30808 | data-platform |
| Spark Thrift (JDBC) | 30100 | data-platform |
| Spark Thrift UI | 32570 | data-platform |
| SQL Gateway | 30500 | data-platform |
| MinIO S3 API | 32000 | data-platform |
| MinIO Console | 32001 | data-platform |
| Jenkins | 30300 | cicd |
| Docker Registry | 32261 | cicd |
| ArgoCD | 30789 | argocd |
| Headlamp | 32526 | kube-system |

## Physical and virtual layout

```mermaid
flowchart TB
  subgraph LAN["Home LAN — 192.168.4.0/24, gateway 192.168.4.1"]
    subgraph HOSTS["Proxmox hosts"]
      P1["pve1<br/>192.168.4.210"]
      P2["pve2<br/>192.168.4.211"]
      P3["pve3<br/>192.168.4.212"]
    end

    subgraph VMS["k3s VMs — static IPs via netplan"]
      SRV["k3s-server, control-plane<br/>192.168.4.220"]
      AG1["k3s-agent<br/>192.168.4.221"]
      AG2["k3s-agent-2<br/>192.168.4.222"]
    end
  end

  P3 -. "VMID 100" .-> AG2
  HOSTS -.->|"host the"| VMS
```

Only `k3s-agent-2` has a confirmed host (pve3, VMID 100); the placement of the
other two VMs has not been verified.

Each VM pins its own address in `/etc/netplan/50-cloud-init.yaml` and its
`--node-ip` flag. Those two must agree, and `node-ip` must be set in exactly one
place — see the failure modes at the bottom.

## Cluster workloads

```mermaid
flowchart LR
  subgraph CICD["cicd · argocd — delivery"]
    direction TB
    JENKINS["jenkins"]
    REGISTRY["registry"]
    ARGO["argocd"]
  end

  subgraph APPS["application namespaces"]
    direction TB
    C4["c4-diagram<br/>+ mongodb"]
    COMMIT["commitments<br/>+ mongodb"]
    TRACK["tracker<br/>+ mongodb"]
    PORT["portfolio<br/>mongodb"]
    PVEVIZ["proxmox-visualizer"]
  end

  subgraph DP["data-platform — lakehouse"]
    direction TB
    SPARK["spark-master<br/>+ worker + thrift"]
    GATEWAY["sql-gateway"]
    AIRFLOW["airflow"]
    JUPYTER["jupyterhub"]
    MINIO["minio"]
    PG["postgres"]
  end

  subgraph PLAT["platform — ingress and ops"]
    direction TB
    TRAEFIK["traefik"]
    METALLB["metallb"]
    HEADLAMP["headlamp"]
    CFD["cloudflared"]
  end

  JENKINS -->|"pushes images"| REGISTRY
  ARGO -->|"GitOps sync"| APPS
  ARGO -->|"GitOps sync"| DP
  REGISTRY -->|"images pulled by"| APPS
  TRAEFIK -->|"routes to"| APPS
  AIRFLOW -->|"orchestrates"| SPARK
  GATEWAY --> SPARK
  SPARK --> MINIO
  SPARK --> PG
```

## Lakehouse data path

This is the chain a query travels from the Kubenex UI to storage.

```mermaid
flowchart LR
  UI["Kubenex<br/>Next.js"]
  GW["sql-gateway<br/>FastAPI + PyHive<br/>NodePort 30500"]
  TH["spark-thrift<br/>Hive protocol :10000"]
  SM["spark-master :7077"]
  SW["spark-worker"]
  MS[("postgres<br/>hive_metastore")]
  QH[("postgres<br/>query_history")]
  S3[("MinIO<br/>S3 API :9000")]

  UI -->|"POST /query"| GW
  GW -->|"Thrift"| TH
  GW -->|"records every statement"| QH
  TH --> SM
  SM --> SW
  TH -->|"table metadata"| MS
  SW -->|"s3a://"| S3
  TH -->|"s3a://"| S3
```

Spark reads MinIO over `s3a://` directly — the `hadoop-aws` connector and AWS
SDK bundle are installed on the Thrift server. `bronze.sales` is a Parquet table at
`s3a://raw-data/test/sales.parquet`. There are no Delta jars installed, so table
formats are limited to Parquet, CSV, JSON, and ORC.

## How traffic reaches a service

```mermaid
flowchart TB
  LAPTOP["MacBook"]
  PUBLIC["Public internet"]

  subgraph OVERLAY["Tailscale overlay, 100.x"]
    TSNODE["k3s-server<br/>100.112.249.53"]
  end

  subgraph CF["Cloudflare"]
    TUNNEL["Cloudflare Tunnel"]
  end

  subgraph CLUSTER["k3s"]
    CFD["cloudflared"]
    NP["NodePort services<br/>30000-32767"]
    LB["MetalLB<br/>192.168.4.240+"]
    TR["traefik ingress"]
    SVC["cluster services"]
  end

  LAPTOP -->|"WireGuard"| TSNODE
  TSNODE --> NP
  NP --> SVC

  PUBLIC -->|"published hostnames"| TUNNEL
  TUNNEL -->|"outbound only"| CFD
  CFD --> TR
  TR --> SVC

  LB --> SVC
```

Nothing inbound is exposed to the internet directly: the tunnel is established
outbound by `cloudflared`, and everything else is reachable only over Tailscale
or the LAN.

## Persistent storage

All volumes use the `local-path` provisioner, which is **node-bound** — a volume
lives on the node where it was first scheduled, and a pod that moves loses it.
This is why Kubenex query history goes to Postgres rather than a local SQLite
file.

| Claim | Size | Namespace |
|---|---|---|
| minio | 20 Gi | data-platform |
| postgres-data | 10 Gi | data-platform |
| airflow-logs | 5 Gi | data-platform |
| jupyter-notebooks | 5 Gi | data-platform |
| registry-data | 20 Gi | cicd |
| jenkins | 8 Gi | cicd |
| mongodb-data / backups | 2–5 Gi each | c4-diagram, commitments, portfolio, tracker |

Postgres holds four databases: `airflow`, `dataplatform` (Kubenex query
history), `hive_metastore`, and `mlflow`.

## Security posture

The SQL gateway has **no authentication**. Anything that can reach its NodePort
can execute arbitrary Spark SQL, including DDL. That is acceptable only because
the port is reachable solely from the LAN and the private Tailscale network —
it must not be exposed through the Cloudflare tunnel or any public ingress.

Credentials are never stored in this repository. Postgres and MinIO secrets are
supplied to workloads through Kubernetes secrets via `secretKeyRef`, and local
development values live in `.env.local`, which is gitignored.

## Failure modes worth remembering

**`node-ip` defined twice.** If `node-ip` appears in both
`/etc/rancher/k3s/config.yaml` and the systemd unit's `--node-ip` flag, k3s
concatenates them into `"IP,IP"`. The kubelet rejects that — a comma pair must be
one IPv4 and one IPv6 — and k3s shuts itself down **cleanly, with exit code 0**,
every 14 seconds. `systemctl status` reports `Result=success`, so it does not
look like a crash. Set `node-ip` in exactly one place.

**Cloud-init rewrites netplan on reboot.** Unless
`/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg` exists containing
`network: {config: disabled}`, a reboot reverts the VM to its original address
and the cluster loses itself. Apply this on all three nodes before rebooting
anything.

**Airflow sizing.** Airflow idles around 1.4 GiB. A 2 GiB limit leaves too little
headroom and the container is OOM-killed the moment a heavier page loads. It now
runs with a 4 GiB limit and a 2 GiB request.
