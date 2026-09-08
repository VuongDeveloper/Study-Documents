# Object storage migration: MinIO → Alarik

Branch `storage/alarik`. `main` keeps MinIO; `git checkout main` is the rollback.

## Why leave MinIO

MinIO Community Edition stopped being a safe dependency in 2025–2026: the web
console was stripped from the free build, the repository went into maintenance
mode in December 2025 (no features, no PR review, no guaranteed security
patches) and was archived read-only in early 2026, with development moved to
the commercial AIStor line. The project pulled `minio/minio:latest` in both
docker-compose and Kubernetes — a frozen tag with no patches, and one that a
fresh node cannot pull if the image is ever withdrawn. The compose file also
still passed `--console-address :9001`, a port recent community builds no
longer serve.

## Why Alarik, and why to be careful

Alarik (https://alarik.io, Apache 2.0, Swift/SwiftNIO) is a single-binary
S3-compatible store with a built-in web console, per-user access keys,
presigned URLs, versioning, lifecycle rules and, in cluster mode, Reed-Solomon
erasure coding. Its published `warp` benchmarks lead MinIO on small objects.

Risks, stated plainly: it is **1.0.0-beta** (tag `1.0.0-beta-16`, 2026-09-03),
built by one small company, in a language rare in infrastructure tooling, with
about 500 GitHub stars. No health endpoint is documented (the one used here was
found empirically). For a homelab and a portfolio the trade is acceptable; for
production the recommendation in the book (Chapter 35) stands — Garage today,
RustFS once it reaches GA, Ceph at scale.

## What the migration touched

The application code did not change. course-service talks the S3 API through
AWS SDK v2 with path-style addressing and stores object *keys* in Postgres, so
the backend is an endpoint, a region and a key pair. Only comments moved in
`S3Config.java` and `Submission.java`.

| Where | Change |
|---|---|
| `docker-compose.yml` | `minio` → `alarik` (API, host 9000 → container 8080) + `alarik-console` (host 9001). Env-provisioned admin, S3 key (`DEFAULT_ACCESS_KEY/SECRET_KEY`) and bucket (`DEFAULT_BUCKETS=ts-submissions`), so the stack boots unattended. Healthcheck on `/api/v1/health`. Volume `alarik-data:/app/Storage`. course-service now `depends_on: alarik: service_healthy`. |
| `config-server/.../course-service.yml` | Credential defaults `tsaccesskey/tssecretkey123`, comments on SigV4 region scope and the public endpoint. |
| `deploy/k8s/base/alarik.yaml` | Replaces `minio.yaml`: Deployment (pinned image, Recreate), new PVC `alarik-data`, Service `alarik:8080`, readiness/liveness on `/api/v1/health`, **Ingress routing `/ts-submissions` on both hosts straight to the store** so presigned download URLs work from a browser. |
| `deploy/k8s/base/course-service.yaml` | `APP_S3_ENDPOINT=http://alarik:8080`; adds `APP_S3_PUBLIC_ENDPOINT=http://ts-server.tailbfe002.ts.net` (was missing — every download link in the cluster was signed for `localhost:9000`). Secret `alarik-app`. |
| `deploy/k8s/create-secrets.sh` | Secrets `alarik` (console login, JWT, S3 key) and `alarik-app` (the same key under `APP_S3_*`). Override env: `ALARIK_ADMIN_USERNAME`, `ALARIK_ADMIN_PASSWORD`, `ALARIK_JWT`, `ALARIK_ACCESS_KEY`, `ALARIK_SECRET_KEY`. |

### Two things worth understanding

**The region is a signature input.** SigV4's credential scope is
`<date>/<region>/s3/aws4_request`; Alarik verifies against `ALARIK_REGION` and
answers HTTP 400 to any other region — verified with `eu-west-1` against a
server set to `us-east-1`. The project keeps `us-east-1` on both sides.

**The Ingress path is the bucket name, unstripped.** A path-style presigned URL
is `http://<host>/<bucket>/<key>?X-Amz-…`, and the signature covers the Host
header *and* the canonical URI. Any prefix that Traefik strips would change the
URI the store sees and invalidate every signature. Routing
`PathPrefix(/ts-submissions)` through untouched keeps host and path exactly as
course-service signed them. Traefik picks the longest prefix per host, so this
wins over the frontend's `/` and never touches the gateway's `/api`.

## Verification performed (2026-09-07)

`docker compose up -d alarik alarik-console` from this file: `alarik` reports
healthy (`/api/v1/health` 200), the console answers on :9001, and the log shows
`Seeded default bucket 'ts-submissions'`. Image
`ghcr.io/achtungsoftware/alarik:1.0.0-beta-16`
(digest `sha256:e658728db18b26921065d60a289551db7e15743dead1312ca8e654b3e9ea8d12`).
Then boto3 with path-style SigV4 against :9000, replaying exactly what
`S3StorageService` does:

```
head_bucket(ts-submissions): exists            # seeded by DEFAULT_BUCKETS
head_bucket(probe-65e324c2): HTTP 404 404      # -> NoSuchBucket path in code
create_bucket(probe-65e324c2): ok -> exists    # S3 CreateBucket supported
put_object: submissions/1/2/<uuid>-hello.txt
get_object same bytes: True
presigned: http://127.0.0.1:9000/ts-submissions/submissions/1/2/...?X-Amz-Algo...
presigned GET status: 200 same bytes: True     # anonymous browser-style fetch
cleanup ok; buckets now: ['ts-submissions']
```

`docker compose config` parses; `kubectl kustomize deploy/k8s/base` renders
36 objects with no `minio` left. Torn down with `docker compose down -v`.
Not verified: the full stack end to end (only the storage service was started),
and the Ingress against the live cluster (rendered offline, not applied).

## Moving existing objects

Both stores speak S3, so `rclone` does it while both run:

```bash
rclone config create minio  s3 provider=Minio endpoint=http://localhost:9000 \
    access_key_id=minioadmin secret_access_key=minioadmin
rclone config create alarik s3 provider=Other endpoint=http://localhost:9000 \
    access_key_id=tsaccesskey secret_access_key=tssecretkey123 region=us-east-1
rclone sync minio:ts-submissions alarik:ts-submissions --checksum -P
```

(Run MinIO on another host port for the copy, or point the first remote at
the old cluster Service via `kubectl port-forward svc/minio 9002:9000`.) Keys
are unchanged, so Postgres rows keep resolving. In Kubernetes the old
`minio-data` PVC is left in place until the copy is verified; delete it by hand.

## Console

Compose: http://localhost:9001, login `alarik` / `alarikadmin` (override with
`ALARIK_ADMIN_*`). Kubernetes: not published — `kubectl port-forward` the pod
if needed; the application never talks to the console.
