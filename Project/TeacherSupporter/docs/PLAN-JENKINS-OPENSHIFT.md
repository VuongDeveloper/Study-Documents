# Plan: CI/CD with Jenkins + OpenShift

Goal: run TeacherSupporter through the classic enterprise pipeline —

```
[ Git (GitHub) ] ──(webhook on push)──> [ Jenkins ] ──(builds & pushes)──> [ Image Registry ]
                                            │                                     │
                                       mvn verify                           (ImageStreams /
                                       (test gate)                           internal registry)
                                                                                  │
[ PostgreSQL / Kafka / MinIO ] <──(connects)── [ OpenShift ] <────(pulls image)───┘
     (in-cluster or external)                   (runs the app:
                                                 Deployments, Services,
                                                 Routes, ConfigMaps)
```

This stack (Jenkins + OpenShift) is what most banks, telcos, and large enterprises actually run.
Learning it is directly job-relevant; the concepts transfer 1:1 to vanilla Kubernetes + any CI.

Companion docs: `DEPLOYMENT-ARCHITECTURE.md` (current VM/Compose deployment),
`DEPLOY-OCI.md` (the VM path), `CICD.md` (GitHub Actions path).

---

## 0. Where does OpenShift run? (decide first — this shapes everything)

OpenShift does **not** fit in the OCI Always Free tier (OKD needs x86_64 and far more resources
than the free ARM VM offers). Realistic options:

| Option | What it is | Cost | Limits | Verdict |
|---|---|---|---|---|
| **A. OpenShift Local (CRC)** | Single-node OpenShift in a VM on your Windows machine | Free (Red Hat developer account) | Needs ~16 GB RAM free for the CRC VM (32 GB machine recommended), x86_64; cluster resets on rebuild | **Recommended if your machine has ≥32 GB RAM** — full cluster-admin, operators, everything |
| **B. Red Hat Developer Sandbox** | Free hosted OpenShift namespace at developers.redhat.com | Free, renewable | No cluster-admin, ~limited CPU/RAM quota, one project, 30-day resets | **Recommended otherwise** — zero setup, but only a vertical slice of the stack fits |
| **C. OKD on cloud VMs** | Community OpenShift, self-installed | VM costs (x86, ≥16 GB) | Heavy install, not free-tier compatible | Skip for now |

**Plan assumption:** Option A (CRC) as primary, with notes where the Sandbox (B) differs.
Jenkins runs **inside OpenShift** — that's the classic enterprise pattern (OpenShift ships a
supported Jenkins template; agents spawn as disposable pods via the Kubernetes plugin).

**Scope decision:** don't port all 14 containers on day one. Work with a **vertical slice** first:

> postgres-course → course-service → api-gateway → Route

then widen. The full stack (8 JVMs + Kafka + 2 Postgres + Mongo + MinIO) fits in CRC at
~16 GB only with trimmed JVM heaps; it does not fit in the Sandbox.

---

## Phase 1 — Learn `oc` by deploying one service manually

No Jenkins yet. Goal: understand the OpenShift objects that replace each docker-compose concept.

### Compose → OpenShift translation table

| docker-compose concept | OpenShift/Kubernetes object |
|---|---|
| `services:` entry | **Deployment** (pod template + replica count) |
| service name DNS (`postgres-course:5432`) | **Service** (stable cluster-internal DNS, same idea) |
| `ports:` published to host | **Route** (OpenShift's public HTTPS ingress — replaces Caddy entirely, TLS included) |
| `environment:` | **ConfigMap** (non-secret) + **Secret** (credentials) |
| `healthcheck:` + `depends_on: service_healthy` | **readiness/liveness probes** (Actuator endpoints); note: K8s has no `depends_on` — services must retry until dependencies appear |
| `volumes:` | **PersistentVolumeClaim** |
| `build:` | **BuildConfig** / CI-built image in a registry |
| the compose network | the namespace (**Project** in OpenShift terms) |

### Steps

1. Install tooling: `crc setup && crc start` (gives you the console URL + `oc login` command);
   install `oc` CLI. Sandbox: just `oc login` with the token from the web console.
2. `oc new-project teachersupporter`
3. Deploy Postgres from the supported image (see the SCC warning below):
   ```bash
   oc new-app --name postgres-course \
     --image=registry.redhat.io/rhel9/postgresql-16 \
     -e POSTGRESQL_USER=course -e POSTGRESQL_PASSWORD=<pw> -e POSTGRESQL_DATABASE=ts_course
   oc set volume deployment/postgres-course --add --claim-size=2Gi --mount-path=/var/lib/pgsql/data
   ```
4. Write `k8s/course-service.yaml` by hand (Deployment + Service + ConfigMap + Secret), deploy
   with `oc apply -f`. Set probes to the Actuator endpoints the compose healthchecks already use:
   ```yaml
   readinessProbe: { httpGet: { path: /actuator/health/readiness, port: 8082 } }
   livenessProbe:  { httpGet: { path: /actuator/health/liveness,  port: 8082 } }
   ```
5. Expose the gateway (later, the only Route):
   ```bash
   oc create route edge api-gateway --service=api-gateway --port=8080
   ```
   `edge` = the router terminates TLS — this replaces Caddy + Let's Encrypt from the VM plan.

### ⚠ The #1 OpenShift gotcha: arbitrary UIDs (SCCs)

OpenShift's default SecurityContextConstraint runs every container as a **random non-root UID**.
Images that assume a fixed user break — notably the official `postgres:17` Docker Hub image.
Fixes, in order of preference:

1. Use OpenShift-compatible images (`registry.redhat.io/rhel9/postgresql-16`, Bitnami images).
2. Make your own images UID-agnostic (the `eclipse-temurin` + jar images are already fine —
   Java doesn't care what UID it runs as, as long as file permissions are group-`0` readable).
3. Last resort (don't): grant `anyuid` to the service account.

This question — "your image works in Docker but crashes on OpenShift, why?" — is a genuine
interview classic. The answer is SCCs and arbitrary UIDs.

---

## Phase 2 — Stateful infrastructure in the cluster

| Compose service | OpenShift approach |
|---|---|
| postgres-auth, postgres-course | `rhel9/postgresql-16` image + PVC (Phase 1 pattern), or the Crunchy Postgres operator |
| mongodb | Bitnami MongoDB image + PVC |
| kafka (KRaft) | **Strimzi operator** — the standard way to run Kafka on Kubernetes/OpenShift (Red Hat sells it as "AMQ Streams"). One `Kafka` custom resource replaces the whole hand-tuned listener config in docker-compose. CRC only; not installable in the Sandbox |
| minio | MinIO image + PVC, or its operator |
| zipkin | plain Deployment (stateless) |
| maildev | plain Deployment, no Route (or drop it: point Spring Mail at a real relay) |
| kafka-ui | plain Deployment, no Route (access via `oc port-forward` — the SSH-tunnel equivalent) |

Sandbox fallback: no operators and a tight quota → keep Kafka & friends **outside** the cluster
(e.g. on the OCI VM from `DEPLOY-OCI.md`) and point services at external hostnames via a
Kubernetes `ExternalName` Service. Hybrid, but it keeps the slice deployable.

---

## Phase 3 — The Spring Cloud question: what survives the move?

An architectural fork, and the most instructive part of this whole plan:

| Component | On Kubernetes/OpenShift... | Decision |
|---|---|---|
| **Eureka (discovery-server)** | Redundant: Kubernetes Services already give every pod a stable DNS name + load balancing. `lb://course-service` becomes plain `http://course-service:8082` | **Track 1:** keep (fidelity to the course). **Track 2:** remove — set `eureka.client.enabled=false`, switch Feign/Gateway to static Service URLs, or use `spring-cloud-kubernetes` discovery |
| **Config Server** | Redundant: ConfigMaps/Secrets mounted as env or volumes do the same job, natively versioned via GitOps | Same two tracks: keep first, then replace `spring.config.import=configserver:` with ConfigMap-injected properties |
| **API Gateway** | **Still valuable.** Routes/Ingress do L7 routing, but the gateway carries app logic: `GatewayHeaderAuthFilter` (JWT verification at the edge), CORS, rate limiting | **Keep.** Only the gateway gets a Route |
| Resilience4j, Kafka clients, JPA, everything else | Unaffected | Keep |

**Recommended sequence: Track 1 first** (deploy as-is, Eureka and all — it works fine in-cluster),
**then Track 2 as an exercise** (strip Eureka + Config Server and watch the deployment get
simpler). Doing both is exactly the "Spring Cloud Netflix vs Kubernetes-native" tradeoff
discussion interviewers love; `docs/EUREKA.md` already covers the theory.

---

## Phase 4 — Jenkins on OpenShift

Classic setup: Jenkins controller as a pod, build agents spawned on demand as pods.

1. Deploy Jenkins (CRC — from the built-in template):
   ```bash
   oc new-app jenkins-persistent -p MEMORY_LIMIT=2Gi -p VOLUME_CAPACITY=5Gi
   ```
   This gives: Jenkins pod + PVC + Route + **OpenShift OAuth login** (Jenkins auth delegated to
   the cluster) + the Kubernetes plugin preconfigured to spawn agent pods.
   Sandbox: quota probably can't fit Jenkins — run Jenkins in Docker on the OCI VM instead
   (`docker run -d -p 8080:8080 jenkins/jenkins:lts-jdk21`) and give it an `oc` token to reach
   the Sandbox remotely. The pipeline stays identical.
2. Add credentials in Jenkins: GitHub token (checkout + webhook), registry push secret
   (if using an external registry rather than ImageStreams).
3. Configure a **maven agent pod template** (label `maven-java25`): container image with JDK 25 +
   Maven; each build runs in a fresh pod and vanishes afterwards — no snowflake build servers.
4. GitHub webhook → Jenkins (`/github-webhook/` endpoint on the Jenkins Route), so every push
   triggers the pipeline. CRC caveat: GitHub can't reach a Route on your laptop — use "Poll SCM"
   (`H/5 * * * *`) on CRC; webhooks work when Jenkins is internet-reachable (Sandbox/VM variants).

---

## Phase 5 — The Jenkinsfile (declarative pipeline)

Committed at the repo root — pipeline-as-code, versioned with the app:

```groovy
pipeline {
  agent { label 'maven-java25' }              // dynamic pod from Phase 4
  options { timestamps() }

  environment {
    REGISTRY   = 'image-registry.openshift-image-registry.svc:5000'
    NAMESPACE  = 'teachersupporter'
    TAG        = "${env.GIT_COMMIT.take(7)}"  // immutable, traceable image tags
  }

  stages {
    stage('Build & Test') {
      steps { sh 'mvn -B verify' }            // the quality gate: unit + integration tests
      post { always { junit '**/target/surefire-reports/*.xml' } }
    }

    stage('Build Images') {
      steps {
        // OpenShift-native: binary BuildConfig per service (uses the existing Dockerfiles).
        // Alternative on non-OpenShift agents: buildah/kaniko (daemonless - no docker-in-docker).
        script {
          def services = ['config-server','discovery-server','api-gateway',
                          'auth-service','course-service','dictionary-service',
                          'notification-service']
          for (s in services) {
            sh "oc start-build ${s} --from-dir=${s} --follow -n ${NAMESPACE}"
            sh "oc tag ${NAMESPACE}/${s}:latest ${NAMESPACE}/${s}:${TAG}"
          }
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          def services = ['config-server','discovery-server','api-gateway',
                          'auth-service','course-service','dictionary-service',
                          'notification-service']
          for (s in services) {
            sh "oc set image deployment/${s} ${s}=${REGISTRY}/${NAMESPACE}/${s}:${TAG} -n ${NAMESPACE}"
            sh "oc rollout status deployment/${s} -n ${NAMESPACE} --timeout=300s"
          }
        }
      }
    }

    stage('Smoke Test') {
      steps {
        sh '''
          GW=$(oc get route api-gateway -n $NAMESPACE -o jsonpath='{.spec.host}')
          curl -fsk https://$GW/actuator/health
        '''
      }
    }
  }

  post {
    failure { echo 'Build failed - deployment untouched (rollout gate held).' }
  }
}
```

Notes:

- **`oc rollout status` is the deployment gate**: OpenShift replaces pods one at a time and only
  proceeds when readiness probes pass — a failed image never takes down the running version.
  This is the zero-downtime rolling update the Compose deployment can't do.
- Image builds happen **in the cluster** (BuildConfigs), so Jenkins agents never need a Docker
  daemon — docker-in-docker is an anti-pattern; the alternatives are BuildConfig, buildah, kaniko.
- Optimization for a monorepo: only rebuild services whose directory changed
  (`git diff --name-only HEAD~1`) — nice later exercise.
- Later refinement: split CI (build/test/push) from CD and let **Argo CD** watch a config repo
  instead of Jenkins pushing deploys — that upgrade path is described in
  `DEPLOYMENT-ARCHITECTURE.md` §"what next".

---

## Phase 6 — Rollout order & verification

1. Infrastructure first (Phase 2), verify each with `oc get pods` + `oc logs`.
2. config-server → discovery-server → services → gateway (mirrors the compose healthcheck DAG;
   in K8s the services simply crash-loop-retry until their dependencies are up — that's normal
   and is the K8s way of doing `depends_on`).
3. Frontend: build the React app (`npm run build`) into an nginx-unprivileged image
   (`nginxinc/nginx-unprivileged` — the standard nginx image won't run under OpenShift SCCs),
   Deployment + Service + Route, axios base URL pointing at the gateway Route (or serve under
   one Route with path routing to avoid CORS).
4. End-to-end: login flow (note: Google OAuth redirect URIs must include the Route hostname),
   file upload to MinIO, Kafka event → notification mail, Zipkin trace across
   gateway → service → Kafka.

---

## Resource budget (CRC, ~16 GB cluster)

| Group | Pods | Est. RAM |
|---|---|---|
| 8 Spring services (`-XX:MaxRAMPercentage`, 512Mi limits) | 8 | ~4 Gi |
| Postgres ×2, Mongo, MinIO | 4 | ~1.5 Gi |
| Kafka (Strimzi, single node) | 2–3 | ~1.5 Gi |
| Jenkins controller + one agent during builds | 1–2 | ~2.5 Gi |
| Zipkin, frontend | 2 | ~0.7 Gi |
| OpenShift platform overhead | — | ~4–5 Gi |

Tight but workable. If it thrashes: drop kafka-ui/maildev, run Jenkins outside CRC, or fall back
to the vertical slice.

## Milestone checklist

- [ ] M1: CRC (or Sandbox) running, `oc login` works, one service manually deployed with probes and a Route
- [ ] M2: vertical slice serving real traffic (postgres-course → course-service → gateway → Route)
- [ ] M3: full stack up, Kafka via Strimzi, frontend Route, E2E flow passes
- [ ] M4: Jenkins deployed, webhook/poll trigger works, `mvn verify` gate green
- [ ] M5: full Jenkinsfile — push to main → tested → images built → rolling deploy → smoke test
- [ ] M6 (stretch): Track 2 — remove Eureka + Config Server, compare; and/or Argo CD for GitOps CD
