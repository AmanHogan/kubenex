#!/usr/bin/env bash
# Deploy (or redeploy) the SQL gateway. Safe to re-run — the ConfigMap is
# regenerated from app.py and the deployment is restarted to pick it up.
set -euo pipefail
cd "$(dirname "$0")"

kubectl -n data-platform create configmap sql-gateway-code \
  --from-file=app.py \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f deployment.yaml
kubectl -n data-platform rollout restart deploy/sql-gateway
kubectl -n data-platform rollout status deploy/sql-gateway --timeout=5m
