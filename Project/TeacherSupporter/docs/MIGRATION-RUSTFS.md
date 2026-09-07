# Migration: MinIO → RustFS

Branch `storage/rustfs`. `main` still runs MinIO; this branch is one of three
candidate replacements (see also `storage/garage`, `storage/alarik`).

## Why replace MinIO

- MinIO's community edition entered *maintenance mode* in late 2025 (no new
  features, no PR review, no guaranteed security patches), had its web console
  stripped from the free build, and the repository was archived in 2026. The
  vendor's effort moved to the commercial AIStor product.
- `main` pulls `minio/minio:latest`, an image that will never receive another
  patch and may disappear from Docker Hub. Anything self-hosted must be
  pinned and maintained upstream.

## Why RustFS

- Designed as a **drop-in MinIO replacement**: same S3 API surface, same
  9000/9001 port convention, MinIO-style health endpoints
  (`/minio/health/live` and `/ready` both answer 200), same erasure-coding
  deployment model if you ever go multi-node. Apache-2.0.
- Largest community of the MinIO successors (≈24k GitHub stars, 90+
  contributors) and the fastest release cadence.
- Ships a web console (`http://localhost:9001/rustfs/console/`).

**Risk, stated plainly:** RustFS is pre-GA. As of September 2026 the current
release is `1.0.0-rc.5` (release candidates since August; betas before that).
The image label says `build-type=prerelease`. The project's own docs
recommend waiting for 1.0 GA before production use. For this homelab and for
Compose-based development that is acceptable; for a paying workload you
would pick Garage (mature, small) today and revisit RustFS at GA.

Because of that, the image is pinned to an exact tag everywhere
(`rustfs/rustfs:1.0.0-rc.5`, digest
`sha256:c36b3efea3d1e503f1a2581abd0e7611e0e5820dd30e1850a52384b3fc52bda4`).
Never use `latest` — it moves weekly.

## What changed

| Where | Change |
|---|---|
| `docker-compose.yml` | `minio` service → `rustfs` (pinned tag, `RUSTFS_*` env, `curl -f /health` healthcheck, volume `rustfs-data`); course-service now waits `service_healthy` and uses `rustfsadmin` credentials |
| `config-server/.../course-service.yml` | credential defaults, comments; region stays `us-east-1` (see below) |
| `course-service` | comments only — `S3Config`, `Submission`. **No logic change.** |
| `deploy/k8s/base/rustfs.yaml` | replaces `minio.yaml`: Deployment (Recreate, `fsGroup: 10001`, readiness + liveness on `/health`), new PVC `rustfs-data`, Service `rustfs` |
| `deploy/k8s/base/course-service.yaml` | `APP_S3_ENDPOINT=http://rustfs:9000`; **adds `APP_S3_PUBLIC_ENDPOINT`** (it was missing, so presigned download links in the cluster were signed for `localhost:9000` and broken); secret `rustfs-app` |
| `deploy/k8s/create-secrets.sh` | secrets `rustfs` (`RUSTFS_ACCESS_KEY/SECRET_KEY`) and `rustfs-app` (`APP_S3_*`); override vars are now `S3_USER`/`S3_PASSWORD`, with `MINIO_USER`/`MINIO_PASSWORD` still honoured |
| `README.md`, `docs/*.md` | running-stack references renamed |

Not touched: `docs/book*` (the textbook still describes MinIO in ch. 9 and
35; update it when a branch is merged).

### Why the Java code did not change

`S3StorageService` uses four S3 calls: `HeadBucket`, `CreateBucket`,
`PutObject` and a presigned `GetObject`. All four were exercised against
RustFS 1.0.0-rc.5 with the AWS SDK's SigV4 signer in path-style mode and
behaved exactly as with MinIO, including `CreateBucket` with the root
credentials (so the `@PostConstruct` auto-create still works) and a 404 on
`HeadBucket` for a missing bucket (the code relies on
`NoSuchBucketException`).

Region: SigV4 writes the region into every signature's credential scope.
RustFS, like MinIO, does not validate it — `us-east-1` and a made-up
`eu-west-9` both worked — so the AWS default stays and the same
configuration would work against real S3 with only endpoint and keys
changed.

### PVC: new name, not reused

RustFS's default build cannot read MinIO's on-disk layout (the
MinIO-compatible reader is behind a preview `rio-v2` feature flag and the
docs warn MinIO-encrypted objects are unreadable regardless). Reusing
`minio-data` would mount a directory of unreadable objects, so the claim is
`rustfs-data` and objects are migrated over the S3 API.

## Migrating existing objects

Local Compose data is disposable: `docker compose down -v` and start fresh.

For the cluster (or anywhere with real data), migrate over the API while
both stores run:

```bash
# 1. deploy RustFS alongside MinIO (apply rustfs.yaml, keep minio.yaml for now)
# 2. copy bucket to bucket -- rclone works against any S3 endpoint
rclone config create minio  s3 provider=Minio  endpoint=http://minio:9000  \
    access_key_id=minioadmin  secret_access_key=minioadmin
rclone config create rustfs s3 provider=Other  endpoint=http://rustfs:9000 \
    access_key_id=rustfsadmin secret_access_key=rustfsadmin
rclone sync minio:ts-submissions rustfs:ts-submissions --progress
# 3. point course-service at rustfs (this branch), roll it
# 4. rclone sync once more to catch uploads made during the roll
# 5. delete minio Deployment/Service, then: kubectl -n ts delete pvc minio-data
```

Object keys are stored in Postgres (`submissions.file_key`), never URLs, so
nothing in the database changes: the same key resolves on the new store and
fresh presigned URLs are minted per download.

RustFS also documents an in-place binary swap over an existing MinIO data
directory, but only with the preview feature enabled and only for
unencrypted objects. The API copy above is backend-neutral and is the path
to prefer.

## Rollback

```bash
git checkout main          # MinIO compose + manifests
docker compose down -v && docker compose up -d
```

In the cluster, re-apply `minio.yaml` from `main` and point
`APP_S3_ENDPOINT` back; objects copied with rclone remain readable by MinIO.

## Verification performed (2026-09-07)

`docker compose up -d rustfs` on this branch, healthcheck reached
`healthy` in about 20 s, then a boto3 script mirroring `S3StorageService`
(path-style, SigV4, region `us-east-1`, credentials `rustfsadmin`):

```
head_bucket: 404 404
create_bucket: ok
head_bucket after create: 200
put_object: ok key=submissions/1/2/<uuid>-hello.txt
presigned url: http://localhost:9000/ts-submissions/submissions/1/2/<uuid>-hello.txt ...
presigned GET: 200 41 bytes, identical=True
list_objects_v2: ['submissions/1/2/<uuid>-hello.txt']
ALL CHECKS PASSED
console /rustfs/console/ -> 200
```

`kubectl kustomize deploy/k8s/base` renders 35 objects with the new names
(not applied to any cluster). `docker compose config` parses.

Not verified: a full stack run with course-service uploading through the
UI, and the Kubernetes manifests on the live `ts-server` cluster.
