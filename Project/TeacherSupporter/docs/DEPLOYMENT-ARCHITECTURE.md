# Deployment Architecture

How TeacherSupporter's code gets from a git commit to a running system, and what the runtime
topology looks like on Oracle Cloud. Companion documents: `PLAN-B-microservices.md` (logical
architecture — what the services *are*), `DEPLOY-OCI.md` (step-by-step provisioning guide),
`CICD.md` (pipeline details).

> Terminology: this is the "deployment view" of the architecture — the mapping of software onto
> infrastructure. PLAN-B answers *what talks to what*; this document answers *what runs where,
> and how it got there*.

---

## 1. Delivery pipeline

### Phase 1 — current (build on the server)

```
[ GitHub repo ] ──(git clone / git pull)──> [ OCI VM (ARM64) ]
                                                  │
                                                  ├─ mvn package          (build jars)
                                                  ├─ docker compose build (build images natively arm64)
                                                  └─ docker compose up -d (run)
```

Simple and dependency-free, but the server doubles as build machine and there is no automated
test gate between "commit" and "running in prod".

### Phase 2 — target (CI builds, server only pulls)

```
[ GitHub repo ] ──(push)──> [ GitHub Actions ] ──(buildx --platform linux/arm64)──> [ GHCR ]
      │                        │                                                      │
   (source)                 mvn verify                                         (image registry)
                            (test gate)                                               │
                                                                                      │
[ Oracle Cloud ] <──(runs on)── [ Docker Compose stack ] <────────(docker compose pull)┘
 (VM + volumes)                  (runs all containers)
```

Key differences from phase 1:

- The build is **reproducible and tested** before an image ever exists.
- The server never sees source code or a JDK — it only pulls signed, versioned images.
- Cross-compilation matters: GitHub's free runners are amd64, the VM is ARM64, so images are
  built with `docker buildx --platform linux/arm64` (or a multi-arch manifest for both).

### Role mapping to other stacks (interview vocabulary)

| Role in the pipeline | This project | Common enterprise equivalent |
|---|---|---|
| Source control | GitHub | GitLab, Bitbucket |
| CI / build server | GitHub Actions | Jenkins, GitLab CI, Tekton |
| Image registry | GHCR (ghcr.io) | Docker Hub, Harbor, OCIR, Artifactory |
| Runtime orchestrator | Docker Compose (single VM) | Kubernetes, OpenShift, ECS, Nomad |
| Infrastructure | OCI Always Free A1 VM | Any IaaS / on-prem cluster |

The pipeline *shape* is identical across all of these:
`source → CI (test + build image) → registry → orchestrator pulls → runs`.
Only the tool names change.

---

## 2. Runtime topology on the OCI VM

One `VM.Standard.A1.Flex` instance (4 OCPU / 24 GB, Ubuntu 24.04 aarch64), everything in one
Docker Compose project on a single bridge network.

```
                                internet
                                    │
                          DNS: yourdomain.com ──> VM public IP
                                    │
              ┌─────────────────────┼──────────────────────────┐
              │  OCI VCN (10.0.0.0/16), public subnet          │
              │  Security list: ONLY 22, 80, 443 open          │
              │ ┌────────────────────────────────────────────┐ │
              │ │  VM: Docker Compose network                │ │
              │ │                                            │ │
   :443 ──────┼─┼─> [ Caddy ]  (TLS termination, only        │ │
              │ │      │         container publishing ports) │ │
              │ │      ├─ /            → static React build  │ │
              │ │      ├─ /api/*       → [ api-gateway:8080 ]│ │
              │ │      └─ /files/*     → [ minio:9000 ]      │ │
              │ │                          │                 │ │
              │ │   [ api-gateway ]────────┤ lb:// via       │ │
              │ │      │                   │ Eureka          │ │
              │ │      ├─> [ auth-service ]──> postgres-auth │ │
              │ │      ├─> [ course-service ]─> postgres-course, minio
              │ │      ├─> [ dictionary-service ]─> mongodb  │ │
              │ │      └─> [ notification-service ]          │ │
              │ │                                            │ │
              │ │   supporting: config-server, discovery-server (Eureka),
              │ │   kafka (KRaft), zipkin, kafka-ui, maildev │ │
              │ │                                            │ │
              │ │   volumes: postgres-auth-data,             │ │
              │ │     postgres-course-data, mongo-data,      │ │
              │ │     minio-data, caddy-data                 │ │
              │ └────────────────────────────────────────────┘ │
              └────────────────────────────────────────────────┘
                                    ▲
   :22 ── SSH ──────────────────────┘
          └─ tunnels for internal UIs: Eureka :8761, Zipkin :9411,
             Kafka UI :9090, MinIO console :9001, MailDev :1080
```

### Rules this topology encodes

1. **Single entry point.** Caddy is the only container with published ports (80/443). It
   terminates TLS (automatic Let's Encrypt), serves the React build as static files, and reverse-
   proxies `/api/*` to the gateway. Frontend and API share one origin → no CORS in production.
2. **Everything else is network-internal.** Databases, Kafka, Eureka, config-server are reachable
   only by service name on the compose network (Docker's embedded DNS resolves `postgres-auth`,
   `kafka:19092`, …). No published port = unreachable from the internet, regardless of security
   list.
3. **Operator access is SSH-only.** Dashboards (Eureka, Zipkin, Kafka UI, MinIO console, MailDev)
   are viewed through SSH tunnels; if published at all, bound to `127.0.0.1` on the host.
4. **State lives in named volumes.** Containers are disposable; `postgres-*-data`, `mongo-data`,
   `minio-data` survive `compose down` and image upgrades. Backup story = backing up these
   volumes (and eventually OCI block-volume backups).
5. **No JDWP in production.** The debug agents from the dev compose file are stripped by
   `docker-compose.prod.yml`.

### Startup ordering (encoded in compose healthchecks)

```
config-server ──healthy──> discovery-server ──> api-gateway
      │
      ├──healthy──> auth-service        (also waits: postgres-auth healthy, kafka started)
      ├──healthy──> course-service      (also waits: postgres-course, kafka, minio)
      ├──healthy──> dictionary-service  (also waits: mongodb)
      └──healthy──> notification-service(also waits: kafka)
```

---

## 3. Environment matrix

| Concern | Local dev (Windows) | Production (OCI VM) |
|---|---|---|
| Compose files | `docker-compose.yml` | `docker-compose.yml` + `docker-compose.prod.yml` |
| CPU arch | amd64 | **arm64** (base images must be multi-arch) |
| Ports | everything published to localhost | only Caddy 80/443 |
| JDWP debug agents | on (5080–5888) | **stripped** |
| Secrets | defaults in compose (`root`, `minioadmin`) | server-side `.env`, chmod 600 |
| TLS | none (http://localhost) | Caddy + Let's Encrypt |
| Frontend | Vite dev server :5173 | static build served by Caddy |
| Mail | MailDev UI :1080 | real SMTP relay (or MailDev via tunnel) |
| S3 public endpoint | `http://localhost:9000` | `https://<domain>/files` via Caddy |
| Restart policy | none | `unless-stopped` |

---

## 4. Known limits of this deployment (and what "next" looks like)

Honest weaknesses — useful both as a roadmap and as interview material ("what would you change?"):

- **Single VM = single point of failure.** No HA for Kafka (1 broker, RF=1), Postgres, or any
  service. Acceptable for a portfolio/demo; the fix is multi-node orchestration (Kubernetes) and
  managed databases.
- **Single Eureka node** — the discovery server itself isn't discoverable or replicated.
- **Deploys cause downtime.** `compose up -d` recreates changed containers in place; there's no
  rolling update or health-gated cutover. Kubernetes Deployments solve exactly this.
- **Secrets are env vars in a file** — fine for one box; a real setup uses a secret manager
  (OCI Vault, Kubernetes Secrets + external-secrets, HashiCorp Vault).
- **No backups yet** — volumes persist but aren't backed up off the VM.
- **Monitoring is passive** — Zipkin traces and Actuator health exist, but nothing alerts; a real
  setup adds Prometheus + Grafana + alerting.
