#!/usr/bin/env bash
#
# Create the Secrets the ts namespace needs. Deliberately NOT a manifest:
# secrets do not belong in git. Re-runnable -- it replaces what is there.
#
#   ./deploy/k8s/create-secrets.sh
#
# Values match docker-compose.yml so behaviour is identical to local dev.
# Override any of them from the environment before running.

set -euo pipefail

NS="${NS:-ts}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-root}"
# Object store credentials (RustFS replaced MinIO -- docs/MIGRATION-RUSTFS.md).
# The override names changed with the product; MINIO_USER/MINIO_PASSWORD are
# still honoured as a fallback so an existing shell profile keeps working.
S3_USER="${S3_USER:-${MINIO_USER:-rustfsadmin}}"
S3_PASSWORD="${S3_PASSWORD:-${MINIO_PASSWORD:-rustfsadmin}}"
# Default matches the fallback baked into config-server's api-gateway.yml /
# auth-service.yml so dev behaviour is unchanged. Override in anything public.
JWT_SECRET="${JWT_SECRET:-mySecretKeyThatIsAtLeast256BitsLongForHS256Algorithm123456}"

kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

# Four secrets, not two: the same credential is spelled differently by the
# server that owns it and the client that consumes it. Postgres wants
# POSTGRES_USER; Spring wants SPRING_DATASOURCE_USERNAME. Keeping them as
# separate secrets means each pod's envFrom pulls in only names it understands,
# rather than a grab-bag it has to ignore half of.
#
# --dry-run=client | apply is the idempotent-create idiom: `kubectl create secret`
# alone fails if the secret exists, and there is no `kubectl create --force`.

# --- postgres, server side ---
kubectl -n "$NS" create secret generic postgres-course \
  --from-literal=POSTGRES_USER="$PG_USER" \
  --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" \
  --from-literal=POSTGRES_DB=ts_course \
  --dry-run=client -o yaml | kubectl apply -f -

# --- postgres, client side (course-service) ---
kubectl -n "$NS" create secret generic postgres-course-app \
  --from-literal=SPRING_DATASOURCE_USERNAME="$PG_USER" \
  --from-literal=SPRING_DATASOURCE_PASSWORD="$PG_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- rustfs, server side ---
kubectl -n "$NS" create secret generic rustfs \
  --from-literal=RUSTFS_ACCESS_KEY="$S3_USER" \
  --from-literal=RUSTFS_SECRET_KEY="$S3_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- rustfs, client side (course-service) ---
kubectl -n "$NS" create secret generic rustfs-app \
  --from-literal=APP_S3_ACCESS_KEY="$S3_USER" \
  --from-literal=APP_S3_SECRET_KEY="$S3_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# The old MinIO secrets are harmless but stale; remove them once the
# rustfs Deployment is Ready:
#   kubectl -n "$NS" delete secret minio minio-app --ignore-not-found

# --- postgres-auth, server side ---
kubectl -n "$NS" create secret generic postgres-auth \
  --from-literal=POSTGRES_USER="$PG_USER" \
  --from-literal=POSTGRES_PASSWORD="$PG_PASSWORD" \
  --from-literal=POSTGRES_DB=ts_auth \
  --dry-run=client -o yaml | kubectl apply -f -

# --- postgres-auth, client side (auth-service) ---
kubectl -n "$NS" create secret generic postgres-auth-app \
  --from-literal=SPRING_DATASOURCE_USERNAME="$PG_USER" \
  --from-literal=SPRING_DATASOURCE_PASSWORD="$PG_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- google oauth (auth-service) ---
# Real values come from .env / the environment; the placeholders keep the pod
# bootable when they are absent -- Google login then fails at click time, not
# the whole service at startup. Mirrors the ${GOOGLE_CLIENT_ID:placeholder}
# defaults in config-server's auth-service.yml.
kubectl -n "$NS" create secret generic google-oauth \
  --from-literal=GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-placeholder}" \
  --from-literal=GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-placeholder}" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- jwt, shared by api-gateway (validates) and auth-service (signs) ---
kubectl -n "$NS" create secret generic jwt \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

echo
kubectl -n "$NS" get secrets
