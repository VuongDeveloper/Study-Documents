# Object storage: MinIO → Garage

Branch `storage/garage`. `main` keeps MinIO; this document records why and how the
storage backend was swapped, and how to move data. Sibling branches do the same
exercise with RustFS and Alarik.

## 1. Why replace MinIO

- MinIO put its community edition into **maintenance mode in late 2025** (no
  features, no PR review, no guaranteed security fixes) and **archived the
  repository in early 2026**. The embedded web console had already been removed
  from community builds; the vendor's effort moved to the commercial AIStor line.
- The project pulled `minio/minio:latest` in both Compose and Kubernetes. For an
  archived project that tag is frozen forever: no CVE fixes, and if the image is
  ever withdrawn a node without a cached copy cannot start the service.
- Running unmaintained software that holds user uploads is not a defensible
  choice in an interview, even for a homelab.

## 2. Why Garage

TeacherSupporter runs on one node (k3s on `ts-server`, 4 cores) and on a laptop
under Docker Compose. Requirements: S3 API through the AWS SDK v2, path-style
addressing, presigned GET URLs, one bucket, a few GB.

| | Garage | RustFS | Alarik | SeaweedFS | Ceph RGW |
|---|---|---|---|---|---|
| Maturity | production since 2020, v2.4 stable | pre-GA beta | beta | mature | mature |
| Footprint | ~30 MiB RSS, one 27 MB image | MinIO-class | small | several processes | cluster |
| Single-node bootstrap | `--single-node --default-bucket` flags | env vars | compose | one command | no |
| Web console | no (admin API + third-party UIs) | yes | yes | yes | no |
| Fit for this box | **best** | wait for GA | too young | heavier than needed | absurd |

Garage is the only option here that is both lightweight enough for the node and
mature enough to defend. It has no console, which does not matter: every object
in this system goes through course-service.

## 3. What changed

Nothing in Java except comments. The S3 API was the contract; the backend is a
config change.

| Area | Before | After |
|---|---|---|
| `docker-compose.yml` | `minio/minio:latest`, console on 9001, `mc ready` healthcheck, `service_started` dependency | `dxflrs/garage:v2.4.0` pinned, `--single-node --default-bucket`, admin API on 9003, `garage status` healthcheck, `service_healthy` dependency |
| `deploy/garage/garage.toml` | – | new: sqlite engine, `replication_factor = 1`, `s3_region = "garage"`, admin API with dev tokens |
| config-server `course-service.yml` | region `us-east-1`, `minioadmin` | region `garage`, fixed dev key `GKts…dev0` |
| `deploy/k8s/base/minio.yaml` | Deployment + PVC `minio-data` + Service | `garage.yaml`: ConfigMap + Deployment + PVC `garage-data` + Service + **Ingress for `/ts-submissions`** |
| `deploy/k8s/base/course-service.yaml` | `APP_S3_ENDPOINT=http://minio:9000`, secret `minio-app`, no public endpoint | `http://garage:3900`, `APP_S3_REGION=garage`, `APP_S3_PUBLIC_ENDPOINT=http://ts-server.tailbfe002.ts.net`, secret `garage-app` |
| `deploy/k8s/create-secrets.sh` | `minio` / `minio-app` secrets from `MINIO_USER/PASSWORD` | `garage` / `garage-app` secrets from `S3_ACCESS_KEY/S3_SECRET_KEY` |

### 3.1 Bootstrap without an init container

Garage 2.x has two server flags made for exactly this case:

```
/garage server --single-node --default-bucket
```

- `--single-node` assigns a one-node layout (zone `dc1`, capacity = disk) and
  applies it on first start.
- `--default-bucket` reads `GARAGE_DEFAULT_BUCKET`, `GARAGE_DEFAULT_ACCESS_KEY`
  and `GARAGE_DEFAULT_SECRET_KEY`, creates the bucket and the key, grants the
  key read/write/owner on the bucket **and** the right to create buckets (which
  `S3StorageService.ensureBucketExists` needs on a fresh install). It is
  idempotent across restarts.

So the whole `mc alias set … / mc mb …` ceremony MinIO needed becomes three
environment variables. Key IDs must be `GK` + 24 characters; secrets 64 hex chars.

### 3.2 The region gotcha

SigV4 does not sign only the payload: the *credential scope* it signs contains
`date/region/s3/aws4_request`. Garage compares the region in every signature
with `s3_region` in its config and answers **400 Bad Request
(`AuthorizationHeaderMalformed`)** on a mismatch. So `APP_S3_REGION` must be
`garage`. There is no AWS region involved; the string is just part of the
signature. Verified: the check script below passes with `garage` and fails on
`head_bucket` with 400 when run with `us-east-1`.

### 3.3 Presigned URLs on the cluster (a bug MinIO also had)

course-service signs download URLs with `app.s3.public-endpoint`, because the
browser, not the service, opens them. On Kubernetes that variable was never set,
so URLs were signed for `localhost:9000` and did not work. `garage.yaml` adds an
Ingress that forwards `/ts-submissions` (the bucket name, which is the first
path segment in path-style URLs) to Garage **without rewriting** — SigV4 signs
both the `Host` header and the path, so a proxy may not touch either —
and course-service now signs for `http://ts-server.tailbfe002.ts.net`.

## 4. Migrating existing objects

Object keys are what Postgres stores (`submissions.file_key`), never URLs, so
data moves without touching the database. With both backends running:

```bash
# one-time rclone remotes (any machine that can reach both endpoints)
rclone config create old s3 provider=Minio endpoint=http://localhost:9000 \
  access_key_id=minioadmin secret_access_key=minioadmin region=us-east-1
rclone config create new s3 provider=Other endpoint=http://localhost:9000 \
  access_key_id=GKts0000000000000000dev0 \
  secret_access_key=ts0000000000000000000000000000000000000000000000000000000000dev0 \
  region=garage force_path_style=true

rclone sync old:ts-submissions new:ts-submissions --progress   # repeat until no diff
rclone check old:ts-submissions new:ts-submissions              # byte-for-byte compare
```

Cut-over order: (1) sync, (2) stop uploads (scale course-service to 0 or put it
in read-only), (3) final `rclone sync`, (4) switch the `APP_S3_*` variables and
roll course-service, (5) delete the old `minio-data` volume/PVC once a download
smoke test passes. On the cluster the two endpoints are `http://minio:9000` and
`http://garage:3900` from a temporary `rclone/rclone` pod.

## 5. Verification performed on this branch

Against a real `dxflrs/garage:v2.4.0` container started exactly as Compose does
(`--single-node --default-bucket`, same `garage.toml`, same key), a boto3 script
mirroring `S3StorageService` ran:

```
head_bucket ts-submissions -> exists
put_object submissions/1/2/<uuid>-hello.txt -> ok
presigned url host/path: http://127.0.0.1:39000/ts-submissions/submissions/1/2/<uuid>-hello.txt
GET presigned -> 200 bytes match: True
create_bucket ts-check-fdc62059 -> ok
delete_bucket ts-check-fdc62059 -> ok
ALL CHECKS PASSED
```

plus `docker compose config` (parses) and `kubectl kustomize deploy/k8s/base`
(renders). The manifests were **not applied** to the cluster; the Ingress path
trick is reasoned from Traefik's longest-prefix matching, not observed.

## 6. Operating notes

- Health: `curl http://localhost:9003/health` → `Garage is fully operational`.
  Metrics: `/metrics` on the same port with the `metrics_token`.
- CLI from Compose: `docker compose exec garage /garage -c /etc/garage.toml status`
  (also `bucket list`, `key info GKts…`). From k3s: `kubectl -n ts exec deploy/garage -- /garage -c /etc/garage.toml status`.
- Every `rpc_secret`, `admin_token`, `metrics_token` and the key pair in this
  branch are **development values** committed on purpose so the stack boots
  with zero setup. Anything reachable from the internet gets new ones
  (`openssl rand -hex 32`, `openssl rand -base64 32`) via the `garage` Secret
  and `GARAGE_RPC_SECRET`.

## 7. Rollback

`git checkout main` — MinIO service, manifests and credentials are untouched
there. Data written to Garage is not readable by MinIO; sync it back with the
same `rclone` command in reverse if needed.
