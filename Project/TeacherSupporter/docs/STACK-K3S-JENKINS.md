# Deployment tech stack — ts-server (k3s + Jenkins)

The concrete stack for TeacherSupporter on the home server, chosen against measured hardware
(`SERVER-CAPABILITIES.md`): **2 physical cores, 19.4 GB RAM, SATA SSD, Wi-Fi**.

Supersedes `PLAN-JENKINS-OPENSHIFT.md` §0 and Phase 4, which assumed OpenShift Local on a 32 GB
machine. Phases 1, 2, 3, 5 and 6 of that document still apply — the Kubernetes objects are
identical.

---

## 1. The stack at a glance

| Layer | Choice | Why this, on this hardware |
|---|---|---|
| **OS** | Ubuntu 24.04 LTS | already running, cgroup v2 |
| **Cluster** | **k3s** (single node) | CNCF-certified Kubernetes, ~1 GB, no VM, no VT-x needed |
| **Container runtime** | containerd (bundled in k3s) | Docker stays on the host, for *building* only |
| **Ingress** | Traefik (bundled in k3s) | zero setup; `Ingress` resources are portable regardless of controller |
| **Storage** | `local-path` (bundled) | single node — PVCs are directories on the SSD |
| **Image build** | **Jib** (Maven plugin) | no Docker daemon in CI, layer-cached, fast on 2 cores, UID-agnostic output |
| **Registry** | `registry:2` on the host | avoids pushing 7 images over residential Wi-Fi every build |
| **CI/CD** | **Jenkins** in Docker on the host | survives cluster rebuilds; lower CPU than in-cluster agents |
| **Manifests** | **Kustomize** (built into kubectl) | base + overlays, no extra tooling |
| **Secrets** | Kubernetes Secrets, created by script | not committed; Sealed Secrets later |
| **Messaging** | **Strimzi** operator → Kafka (KRaft, 1 broker, RF=1) | the industry-standard way to run Kafka on K8s |
| **Databases** | Postgres ×2, MongoDB, MinIO — Bitnami images + PVCs | run as arbitrary UID → OpenShift-portable |
| **Observability** | kube-prometheus-stack + existing Zipkin | added last; droppable under load |
| **Remote access** | Tailscale — `kubectl` from Windows over the tailnet | no exposed API server |
| **Public URL** (optional) | Cloudflare Tunnel → Traefik | CGNAT-proof, outbound-only |
| **GitOps** (stretch) | Argo CD | replaces Jenkins' deploy stage |

---

## 2. The pipeline

```
[ GitHub ]──push──>[ Jenkins (Docker on ts-server) ]
                          │
                          ├─ mvn verify                    ← test gate
                          ├─ mvn jib:build                 ← 7 images, no Docker daemon
                          │        └──push──> [ registry:2  localhost:5000 ]
                          │                          │
                          └─ kubectl apply -k         │  (k3s pulls)
                             kubectl rollout status   │
                                     │                │
                                     v                v
                          [ k3s ]  Deployments · Services · Ingress · PVCs
                                   Strimzi Kafka · Postgres ×2 · Mongo · MinIO
                                     │
                          Traefik Ingress ──> reachable over Tailscale
                                          └──> (optional) Cloudflare Tunnel → public
```

Same shape as every enterprise pipeline: **source → CI (test + build image) → registry →
orchestrator pulls → rolling deploy**. Only the tool names differ from Jenkins+OpenShift or
Actions+EKS.

---

## 3. Decisions that need explaining

### 3.1 Jib instead of `docker build`

Your Dockerfiles work, so this is a change worth justifying. Three reasons, in order of weight:

1. **No Docker daemon in CI.** Your own plan doc calls docker-in-docker an anti-pattern
   (`PLAN-JENKINS-OPENSHIFT.md` line 238). Jib builds and pushes images from pure Java — Jenkins
   needs no daemon, no privileged container, no socket mount.
2. **Fast on slow CPUs.** Jib builds layers directly from the Maven output and reuses unchanged
   layers. A rebuild after a one-line change pushes only the application layer, not a fresh
   `mvn package` + `COPY` + full image export. On 2 cores this is the difference between a 2-minute
   and a 6-minute image stage.
3. **UID-agnostic by default.** Jib images run as a non-root user with group-`0`-readable files,
   which is exactly what OpenShift's SCCs require. You get OpenShift portability for free.

```xml
<plugin>
  <groupId>com.google.cloud.tools</groupId>
  <artifactId>jib-maven-plugin</artifactId>
  <version>3.4.4</version>
  <configuration>
    <from><image>eclipse-temurin:25-jre-alpine</image></from>
    <to><image>localhost:5000/${project.artifactId}:${project.version}</image></to>
    <allowInsecureRegistries>true</allowInsecureRegistries>
    <container>
      <jvmFlags><jvmFlag>-XX:MaxRAMPercentage=75.0</jvmFlag></jvmFlags>
    </container>
  </configuration>
</plugin>
```

**Keep the Dockerfiles.** They stay useful for local Compose work and as the fallback if Jib
fights you. This is additive, not a migration.

### 3.2 Local registry, not GHCR

k3s uses its own containerd image store — **images built by Docker on the host are invisible to
k3s**. That surprises everyone once. You need either an explicit import or a registry; the registry
is what the pipeline wants anyway.

GHCR would work, but every build would push ~700 MB of layers up a residential Wi-Fi uplink. A
local registry keeps the inner loop at LAN speed.

```bash
docker run -d --restart=unless-stopped --name registry -p 5000:5000 \
  -v registry-data:/var/lib/registry registry:2
```

k3s must be told the registry is plain HTTP, or containerd tries HTTPS and every pull
fails with a TLS error against a registry that has no certificate:

```yaml
# /etc/rancher/k3s/registries.yaml
mirrors:
  "localhost:5000":
    endpoint:
      - "http://localhost:5000"
```

Then `sudo systemctl restart k3s` — containerd only reads this file at startup.

**Why `localhost:5000` and not `ts-server:5000`.** On this box `ts-server` resolves only
over IPv6 (the Tailscale ULA, via MagicDNS) and the registry binds IPv4. `localhost` needs
no resolver, cannot drift, and is correct for any node-local service on a single-node
cluster. The cost: the name is only meaningful *on the node*, which matters in §3.3 below.

Add GHCR later if you want images reachable off-box.

### 3.3 Jenkins in Docker, not in k3s

The classic enterprise pattern is Jenkins-in-cluster with disposable agent pods, and it's better
interview material. Two reasons to start outside it anyway:

- **If you break k3s, Jenkins still runs** and can rebuild it. You will break k3s a few times.
- **Agent pods cost CPU you don't have.** Spawning a pod per build adds scheduling and image-pull
  overhead on two cores.

Migrating Jenkins into k3s later is a clean, self-contained exercise — do it once the pipeline is
green, as the thing that teaches you the Kubernetes plugin.

```bash
docker run -d --restart=unless-stopped --name jenkins \
  --network host \
  -v jenkins_home:/var/jenkins_home \
  -v /home/vuongdang/.kube:/var/jenkins_home/.kube:ro \
  jenkins/jenkins:lts-jdk21
```

**`--network host` is load-bearing, not a shortcut.** Jib's `<to><image>` is both the push
target and the name k3s pulls by, and they must agree — so the image has to be called
`localhost:5000/...`. But inside a bridge-networked container, `localhost` is the *container*,
not the host, and the push fails with connection refused. Host networking makes the two
`localhost`s the same machine. The alternative — naming the image after the host IP — makes
the manifests depend on an address that changes with the network.

Note this also drops `-p 8080:8080`: with host networking Jenkins binds the host's port 8080
directly, so publishing a port is both unnecessary and an error.

### 3.4 Kustomize, not Helm

Kustomize ships inside `kubectl` (`kubectl apply -k`), so there's nothing to install and no
templating language to learn. `base/` holds the real manifests; `overlays/dev` and `overlays/prod`
patch replica counts, resource limits and image tags.

Helm matters when you're *publishing* charts for others. You're deploying your own app — Kustomize
is the right size. You'll still use Helm to *install* third-party charts like
kube-prometheus-stack.

### 3.5 Strimzi for Kafka

Costs ~2 GB (operator + broker + entity operator), which you have. Worth it because a single
`Kafka` custom resource replaces the hand-tuned listener configuration in your compose file, and
because Strimzi *is* the answer in Kubernetes shops — Red Hat sells it as AMQ Streams.

Lighter fallback if CPU contention bites: a plain KRaft StatefulSet, one broker, no operator.

---

## 4. Two details that will cost you an hour if missed

### 4.1 Install k3s with a TLS SAN for the tailnet

By default k3s issues an API-server certificate valid only for `127.0.0.1` and the LAN IP, and
writes a kubeconfig pointing at `https://127.0.0.1:6443`. `kubectl` from Windows over Tailscale
then fails certificate validation.

Install with the tailnet address included:

```bash
curl -sfL https://get.k3s.io | sh -s - \
  --tls-san 100.85.66.43 \
  --tls-san ts-server \
  --write-kubeconfig-mode 644
```

Then copy `/etc/rancher/k3s/k3s.yaml` to Windows as `~/.kube/config` and change
`server: https://127.0.0.1:6443` to `server: https://100.85.66.43:6443`.

Adding a SAN afterwards means deleting `/var/lib/rancher/k3s/server/tls/` and restarting — easier
to get right the first time.

### 4.2 ufw and k3s

k3s needs its pod and service networks exempted, or DNS and pod-to-pod traffic break in ways that
look like application bugs:

```bash
sudo ufw allow from 10.42.0.0/16 to any   # pod CIDR
sudo ufw allow from 10.43.0.0/16 to any   # service CIDR
sudo ufw allow in on tailscale0 to any port 6443 proto tcp
```

Fold these into the `configure_firewall()` policy you're writing in
`deploy/bootstrap-laptop-server.sh`.

---

## 5. Resource budget

| Component | RAM |
|---|---|
| k3s control plane + OS | 1.5 GB |
| Jenkins controller | 2.0 GB |
| Maven build (transient) | 1.5 GB |
| 8 Spring services @ 512Mi | 4.0 GB |
| Postgres ×2, Mongo, MinIO | 1.5 GB |
| Strimzi Kafka | 2.0 GB |
| Registry, Zipkin, frontend | 0.7 GB |
| kube-prometheus-stack | 1.5 GB |
| **Total** | **~14.7 GB of 19.4 GB** |

Fits. **CPU is the limit, not memory** — do not run a build while demoing the stack.

---

## 6. Build order

Each step ends with something that works. Don't skip ahead.

| # | Milestone | Done when |
|---|---|---|
| 1 | k3s installed, `kubectl` works from Windows over Tailscale | `kubectl get nodes` returns Ready |
| 2 | Local registry running, k3s trusts it | a test image pushes and a pod pulls it |
| 3 | **Vertical slice**: postgres-course → course-service → Ingress | HTTP request from Windows returns real data |
| 4 | Jenkins running, builds the slice, deploys it | push to main → new pod rolls out |
| 5 | Remaining services, one at a time | `kubectl get pods` all Ready |
| 6 | Strimzi Kafka, notification flow works | event → mail |
| 7 | Frontend + single Ingress host | app usable in a browser |
| 8 | Observability | Grafana shows RED metrics |
| 9 | *Stretch:* Jenkins into k3s; Argo CD; drop Eureka/Config Server | — |

Milestone 3 is the important one — it proves the whole chain with one service instead of fourteen.

---

## 7. What stays OpenShift-only

Do these on the free Red Hat Developer Sandbox; they cost none of this machine's CPU.

| Concept | k3s equivalent you'll have built |
|---|---|
| Route | Ingress |
| SCC / arbitrary UID | *(none — but Jib images already comply)* |
| BuildConfig | Jenkins + Jib |
| ImageStream | registry tags |
| `oc new-app` | `kubectl apply -k` |
| Web console + OAuth | k9s / `kubectl` |

Because Jib produces UID-agnostic images, the same manifests should deploy to the Sandbox with
only the Ingress→Route swap. That's the portability test worth running once.
