# ts-server — what this hardware can and cannot run

Measured on the box, 2026-08-09. This exists to replace guesswork in
`PLAN-JENKINS-OPENSHIFT.md` §0, which was written assuming a 32 GB Windows machine.

---

## 1. The measurements

| | Value | Assessment |
|---|---|---|
| CPU | Intel i5-7200U @ 2.5 GHz (3.1 turbo) | **2 physical cores / 4 threads**, 15 W Kaby Lake, 2017 |
| L3 cache | 3 MiB | small — hurts when many JVMs compete |
| RAM | 19.4 GiB (18.5 available) | **generous** |
| Swap | 8 GiB (`/swap.img`) | fine |
| Disk | LITEON CV3-DE256 SATA SSD, 238 GB | 204 GB free, **237 MB/s** sequential write |
| Network | Wi-Fi `wlp2s0`, 270 Mbit/s link, signal 68 | adequate; Ethernet unused |
| Virtualization | `vmx` **absent from CPU flags** | VT-x **disabled in BIOS** → no KVM |
| cgroups | v2 | modern, what k3s wants |
| Idle | load 0.07, 45–52 °C | healthy, plenty of thermal headroom |

### The one sentence that matters

**RAM is abundant, CPU is the binding constraint.** Every capability question below resolves to
"do I have spare cores?", not "do I have spare memory." That is the opposite of what the existing
plan doc assumes, and it changes which platform makes sense.

Two physical cores is roughly a third of a modern desktop. For scale, this CPU benchmarks near the
4-OCPU Ampere VM you'd planned on OCI — same ballpark, slightly weaker — so the stack is viable,
but nothing here will be fast.

---

## 2. What this box CAN run

### 2.1 Comfortably

| Workload | RAM | Notes |
|---|---|---|
| **k3s** (single-node Kubernetes) | ~0.5–1 GB | Runs as a normal process, no VM. Uses SQLite instead of etcd by default — lighter and fine for one node. Needs no VT-x. |
| **Docker / Compose**, the current 14-container stack | ~7 GB | Already proven: Docker 29.7.2 installed and working |
| **Jenkins** controller | 1–2 GB | Docker container or a k3s pod, your choice |
| **Local image registry** (`registry:2`) | ~100 MB | Avoids pushing over Wi-Fi to GHCR on every build |
| **Prometheus + Grafana** | ~1.3 GB | The observability milestone from the capstone doc |
| **Argo CD** | ~0.5 GB | GitOps CD, the Jenkins-push alternative |
| **Strimzi** (Kafka operator) | ~2 GB | Operator + one broker + entity operator |
| **GitHub Actions self-hosted runner** | ~0.5 GB | If you want the Actions path too |

### 2.2 Full-stack memory budget

Everything at once, with `MaxRAMPercentage` and 512Mi limits per Java service:

| Group | Est. RAM |
|---|---|
| k3s control plane + OS | 1.5 GB |
| 8 Spring services @ 512Mi | 4.0 GB |
| Postgres ×2, Mongo, MinIO | 1.5 GB |
| Kafka via Strimzi | 2.0 GB |
| Jenkins controller + one build agent | 3.0 GB |
| Zipkin, frontend, registry | 0.7 GB |
| **Total** | **~12.7 GB of 19.4 GB** |

**It fits, with ~6 GB spare.** Memory is genuinely not your problem.

### 2.3 Realistic timings on 2 cores

Estimates, not measurements — expect this order of magnitude:

| Operation | Expected |
|---|---|
| `mvn -DskipTests package` (7 modules) | 3–6 min |
| `mvn verify` with tests | 10–20 min |
| Building 7 Docker images | 5–10 min |
| Cold start, 8 Spring services | 3–6 min until all are Ready |
| Full Jenkins pipeline end to end | **20–35 min** |

Slow, but this is a learning and portfolio system, not a production SLA. The pipeline being slow
teaches you exactly why real teams cache Maven repos, use layered jars, and rebuild only changed
modules.

---

## 3. What this box CANNOT run

### 3.1 OpenShift Local (CRC) — hard blocker

| CRC requirement | This box | Result |
|---|---|---|
| 4 **physical** CPU cores | 2 | ❌ below minimum |
| 10.5 GB free RAM for the VM | 19.4 GB | ✅ |
| Hardware virtualization (KVM) | VT-x disabled, no `/dev/kvm` | ❌ (fixable in BIOS) |
| 35 GB disk | 204 GB free | ✅ |

Enabling VT-x in the BIOS would fix the second failure, **but the core count still fails**, and
CRC would then be running an entire OpenShift control plane inside a VM on two cores. Not viable.

### 3.2 OKD / Single-Node OpenShift — hard blocker

SNO requires 8 vCPU and 16 GB *for the node itself*. Multi-node OKD needs three machines. Neither
is close.

### 3.3 MicroShift — not a realistic path here

Red Hat's lightweight edge OpenShift *would* fit the hardware (2 cores, 2 GB minimum) and gives you
real `oc`, Routes and SCCs. But it's supported on **RHEL 9 only** — there is no supported Ubuntu
build. It also omits the web console, BuildConfigs, ImageStreams and the operator framework, so you
would get part of the OpenShift vocabulary while fighting an unsupported install. Not worth it.

### 3.4 Anything needing a hypervisor

VT-x is off, so no KVM, no VirtualBox, no nested clusters. Enabling it requires the BIOS, which
requires a keyboard and monitor on the machine. `systemctl reboot --firmware-setup` will boot
straight into firmware, but you still need to be standing there to navigate it.

**Nothing in your plan needs VT-x.** Docker and k3s run natively on the Linux kernel. Leave it.

### 3.5 Things that "work" but you shouldn't do

- **Building while demoing.** A Maven build saturates both cores; the running stack will fail
  liveness probes and start restarting pods. Treat build and serve as mutually exclusive.
- **Multi-node k3d/kind clusters.** Technically possible, but the "nodes" share two cores, so you
  get scheduling complexity with no real isolation lesson.
- **Kafka with replication factor > 1.** One broker is all the CPU supports; RF=1 is already what
  your compose file does.
- **The full stack plus Prometheus plus Jenkins plus a build, simultaneously.** RAM is fine; the
  cores are not.

---

## 4. What this means for the plan

`PLAN-JENKINS-OPENSHIFT.md` §0 chose CRC as the primary target. That decision is now invalid. The
replacement:

| Concern | Decision |
|---|---|
| Local cluster | **k3s on ts-server** — real Kubernetes API, ~1 GB, no VM |
| OpenShift-specific learning | **Red Hat Developer Sandbox** (free, hosted) — costs zero local CPU |
| Jenkins | On ts-server, in Docker or in k3s |
| Registry | Local `registry:2`, or GHCR |

### What transfers unchanged between k3s and OpenShift

Deployments, Services, ConfigMaps, Secrets, PVCs, readiness/liveness probes, rolling updates,
`kubectl`/`oc` verbs, the Jenkinsfile shape, Strimzi, Argo CD. This is the overwhelming majority of
the plan doc — Phases 1, 2, 3, 5 and 6 apply as written.

### What is genuinely OpenShift-only

A short list, and the reason the Sandbox is worth an evening:

1. **Routes** — OpenShift's ingress object, replaces Ingress; `oc create route edge` does TLS for you
2. **SCCs / arbitrary UIDs** — the "works in Docker, crashes on OpenShift" interview classic
3. **BuildConfigs + ImageStreams** — in-cluster builds, no Docker daemon on agents
4. **`oc` extras** — `oc new-app`, `oc start-build`, `oc rollout`
5. **The web console and OAuth integration**

Note that #2 is worth designing for even on k3s: keep images UID-agnostic (run as non-root, make
files group-`0` readable) and they will run on OpenShift unmodified. That costs nothing now and
saves a rewrite later.

---

## 5. Recommended sequencing given the CPU

Because builds and runtime compete for the same two cores, do these in order rather than
in parallel:

1. **k3s + the vertical slice** — postgres-course → course-service → api-gateway → Ingress.
   Small enough to iterate on quickly while you learn the objects.
2. **Jenkins** with a pipeline that builds only that slice. Get the loop green before widening it.
3. **Widen to the full stack**, one service at a time.
4. **Strimzi Kafka**, once the stateless services are stable.
5. **Observability** (Prometheus/Grafana) last — it's additive and can be dropped under load.
6. **Sandbox track** in parallel with any of the above, since it uses none of this machine.
