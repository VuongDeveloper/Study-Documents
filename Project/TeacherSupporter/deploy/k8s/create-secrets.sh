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
# Alarik (S3-compatible object store; replaced MinIO -- docs/MIGRATION-ALARIK.md).
# Two credential pairs: the console login, and the S3 access key that Alarik
# provisions on first start and course-service authenticates with.
ALARIK_ADMIN_USERNAME="${ALARIK_ADMIN_USERNAME:-alarik}"
ALARIK_ADMIN_PASSWORD="${ALARIK_ADMIN_PASSWORD:-alarikadmin}"
ALARIK_JWT="${ALARIK_JWT:-change-me-alarik-console-jwt-secret}"
ALARIK_ACCESS_KEY="${ALARIK_ACCESS_KEY:-tsaccesskey}"
ALARIK_SECRET_KEY="${ALARIK_SECRET_KEY:-tssecretkey123}"
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

# --- alarik, server side ---
# DEFAULT_ACCESS_KEY / DEFAULT_SECRET_KEY are honoured on FIRST start only
# (the key is persisted under /app/Storage); rotating them later means
# creating a new key in the console and updating alarik-app.
kubectl -n "$NS" create secret generic alarik \
  --from-literal=ADMIN_USERNAME="$ALARIK_ADMIN_USERNAME" \
  --from-literal=ADMIN_PASSWORD="$ALARIK_ADMIN_PASSWORD" \
  --from-literal=JWT="$ALARIK_JWT" \
  --from-literal=DEFAULT_ACCESS_KEY="$ALARIK_ACCESS_KEY" \
  --from-literal=DEFAULT_SECRET_KEY="$ALARIK_SECRET_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- alarik, client side (course-service) ---
kubectl -n "$NS" create secret generic alarik-app \
  --from-literal=APP_S3_ACCESS_KEY="$ALARIK_ACCESS_KEY" \
  --from-literal=APP_S3_SECRET_KEY="$ALARIK_SECRET_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

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
