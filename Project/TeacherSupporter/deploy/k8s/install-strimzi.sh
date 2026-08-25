#!/usr/bin/env bash
#
# One-time ADMIN step: install the Strimzi operator + CRDs into the ts
# namespace, watching that namespace only. Run before the first
# `kubectl apply -k deploy/k8s/base` that includes kafka.yaml.
#
# Same category as namespace creation: CRDs and the operator's RBAC are
# cluster-scoped, so the Jenkins ServiceAccount cannot (and should not)
# install them. Jenkins only applies the namespaced Kafka/KafkaTopic
# resources afterwards.
#
#   ./deploy/k8s/install-strimzi.sh

set -euo pipefail

NS="${NS:-ts}"

kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

# Server-side apply, because the Strimzi bundle's CRDs are too large for
# the client-side last-applied-configuration annotation. Idempotent: safe
# to re-run, also how you take operator upgrades later.
kubectl apply --server-side --force-conflicts \
  -f "https://strimzi.io/install/latest?namespace=${NS}" -n "$NS"

kubectl -n "$NS" rollout status deployment/strimzi-cluster-operator --timeout=300s

echo
echo "Operator ready. Kafka clusters in '${NS}' will now be reconciled."
