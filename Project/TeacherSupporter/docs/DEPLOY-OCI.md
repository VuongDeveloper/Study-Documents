# Deploying TeacherSupporter on Oracle Cloud Free Tier

Every step is shown **two ways**: Console UI and OCI CLI. They are equivalent — pick either per step.
The only thing you cannot do by CLI is create the Oracle account itself.

Target: **one VM.Standard.A1.Flex instance (ARM64), 4 OCPUs / 24 GB RAM, Ubuntu 24.04** — the
maximum Always Free compute, enough for the full stack (~7 GB RAM in practice).

> **Why learn both?** The Console teaches you the *concepts* (what a VCN, subnet, security list
> *is*); the CLI is what you'd script in a real job (and it's how Terraform works under the hood —
> every CLI command maps 1:1 to an API call). Interviewers ask "how would you automate this?" —
> the answer is "the same API the CLI calls."

---

## 0. Prerequisites

### 0.1 Oracle account (UI only)

1. Sign up at <https://www.oracle.com/cloud/free/>.
2. **Home region is permanent — choose carefully.** From Vietnam: `ap-singapore-1` (Singapore) or
   `ap-tokyo-1` / `ap-osaka-1` are the low-latency picks.
3. Known issue: A1 instances frequently show **"Out of host capacity"** in popular regions.
   Mitigations: retry off-peak, use the CLI retry loop in §3.4, or upgrade to Pay-As-You-Go
   (you keep all Always Free allowances; capacity priority improves).

### 0.2 Install the OCI CLI (on your Windows machine)

PowerShell (official installer):

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.ps1'))
oci --version
```

Alternative: `pip install oci-cli` (needs Python 3.9+).

> **Tip:** OCI CLI commands take JSON arguments. PowerShell's quoting mangles inline JSON, so run
> the CLI from **Git Bash** (which you have), or pass JSON via `--from-json file://x.json`.
> All commands below use bash syntax.

### 0.3 Authenticate the CLI

```bash
oci setup config
```

It asks for:

| Prompt | Where to find it (UI) |
|---|---|
| User OCID | Console → profile icon (top right) → **My profile** → OCID |
| Tenancy OCID | Profile icon → **Tenancy** → OCID |
| Region | e.g. `ap-singapore-1` |
| Generate API key pair? | Yes |

Then upload the generated **public** key: Console → My profile → **API keys** → Add API key →
paste `~/.oci/oci_api_key_public.pem`.

Or upload it by CLI (bootstrapping via browser session):

```bash
oci session authenticate   # opens browser login — alternative to API keys entirely
```

Verify:

```bash
oci iam region list --output table
```

### 0.4 Shell variables used throughout

```bash
export C=<tenancy-or-compartment-OCID>        # root tenancy OCID works fine for a personal account
oci iam availability-domain list -c $C --output table
export AD=<one AD name from above>            # e.g. "Xxxx:AP-SINGAPORE-1-AD-1"
```

---

## 1. Networking: VCN, subnet, internet access

Concepts (same in AWS/GCP — transferable knowledge):

- **VCN** — your private network (like AWS VPC).
- **Subnet** — an IP range inside it where the VM lives.
- **Internet Gateway + route rule** — without these, the VCN has no path to the internet.
- **Security List** — the cloud-level firewall (like AWS security groups, but attached to the subnet).

### 1.1 The shortcut (recommended): VCN Wizard

**UI:** Networking → Virtual cloud networks → **Start VCN Wizard** → "Create VCN with Internet
Connectivity" → name `ts-vcn`, accept defaults (VCN CIDR `10.0.0.0/16`, public subnet
`10.0.0.0/24`) → Create. This creates VCN + public subnet + internet gateway + route rule in one shot.

**CLI equivalent (the wizard, spelled out):**

```bash
# 1. VCN
oci network vcn create -c $C --display-name ts-vcn --cidr-block 10.0.0.0/16
export VCN=<vcn OCID from output>

# 2. Internet gateway
oci network internet-gateway create -c $C --vcn-id $VCN --display-name ts-igw --is-enabled true
export IGW=<igw OCID>

# 3. Route rule: 0.0.0.0/0 -> internet gateway (on the VCN's default route table)
export RT=$(oci network vcn get --vcn-id $VCN --query 'data."default-route-table-id"' --raw-output)
oci network route-table update --rt-id $RT --force \
  --route-rules '[{"destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","networkEntityId":"'$IGW'"}]'

# 4. Public subnet
oci network subnet create -c $C --vcn-id $VCN --display-name ts-public \
  --cidr-block 10.0.0.0/24
export SUBNET=<subnet OCID>
```

### 1.2 Firewall rules: allow 22, 80, 443 — nothing else

Do **not** open 8080, 8761, 9000, 9090, 5433… — internal services stay internal; you'll reach
their UIs through an SSH tunnel (§5.4). The default security list already allows SSH (22); add 80/443.

**UI:** Networking → Virtual cloud networks → ts-vcn → Security Lists → *Default Security List* →
**Add Ingress Rules**:

| Source CIDR | Protocol | Dest. port |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

**CLI:** security-list update *replaces* the whole rule set, so fetch, keep the defaults, append:

```bash
export SL=$(oci network vcn get --vcn-id $VCN --query 'data."default-security-list-id"' --raw-output)

# inspect current rules first
oci network security-list get --security-list-id $SL --query 'data."ingress-security-rules"'

# full replacement: default 3 rules (SSH + ICMP x2) + 80 + 443
oci network security-list update --security-list-id $SL --force --ingress-security-rules '[
  {"protocol":"6","source":"0.0.0.0/0","tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
  {"protocol":"1","source":"0.0.0.0/0","icmpOptions":{"type":3,"code":4}},
  {"protocol":"1","source":"10.0.0.0/16","icmpOptions":{"type":3}},
  {"protocol":"6","source":"0.0.0.0/0","tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
  {"protocol":"6","source":"0.0.0.0/0","tcpOptions":{"destinationPortRange":{"min":443,"max":443}}}
]'
```

> **The double-firewall gotcha:** OCI has TWO firewalls — this security list (cloud level) AND
> `iptables` rules baked into Oracle's OS images (host level). Docker-published ports bypass the
> host iptables (Docker writes its own NAT rules), so the compose setup "just works" — but if you
> ever run something natively (e.g. Caddy outside Docker), you must also open the port on the host.
> Debugging order when something is unreachable: `ss -tlnp` (listening?) → host iptables → security
> list → routing. That sequence is a stock interview question.

---

## 2. SSH key

You almost certainly have one; check `~/.ssh/id_ed25519.pub`. If not:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519
```

The **public** key goes to the instance in the next step (UI: paste it; CLI: `--ssh-authorized-keys-file`).

---

## 3. The compute instance

### 3.1 Find the Ubuntu ARM image

**UI:** the instance-create form lists images; pick **Canonical Ubuntu 24.04** and it auto-selects
the aarch64 build once you choose the A1 shape.

**CLI:**

```bash
oci compute image list -c $C \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
  --shape VM.Standard.A1.Flex \
  --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].{name:"display-name", id:id}'
export IMG=<image OCID>
```

### 3.2 (Optional but recommended) cloud-init: install Docker automatically

Save as `cloud-init.yml` — the instance runs this on first boot:

```yaml
#cloud-config
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker ubuntu
  - fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  - echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

(4 GB swap is insurance against JVM startup memory spikes — 8 JVMs starting at once is the peak.)

### 3.3 Launch

**UI:** Compute → Instances → **Create instance**
- Name: `ts-server`
- Image: Canonical Ubuntu 24.04
- Shape: **Ampere → VM.Standard.A1.Flex → 4 OCPUs, 24 GB**
- Networking: ts-vcn / ts-public subnet, **Assign a public IPv4 address**
- SSH keys: paste your public key
- Boot volume: **150 GB** (images + Kafka logs + DB volumes; you have 200 GB free quota)
- Advanced → Management → Cloud-init script: paste `cloud-init.yml` (optional)

**CLI:**

```bash
oci compute instance launch -c $C \
  --availability-domain "$AD" \
  --display-name ts-server \
  --shape VM.Standard.A1.Flex \
  --shape-config '{"ocpus":4,"memoryInGBs":24}' \
  --image-id $IMG \
  --subnet-id $SUBNET \
  --assign-public-ip true \
  --boot-volume-size-in-gbs 150 \
  --ssh-authorized-keys-file ~/.ssh/id_ed25519.pub \
  --user-data-file cloud-init.yml
export INST=<instance OCID>
```

### 3.4 If you hit "Out of host capacity" — the CLI retry loop

This is where the CLI beats the UI outright. Capacity frees up unpredictably; script the retry:

```bash
until oci compute instance launch -c $C \
    --availability-domain "$AD" --display-name ts-server \
    --shape VM.Standard.A1.Flex --shape-config '{"ocpus":4,"memoryInGBs":24}' \
    --image-id $IMG --subnet-id $SUBNET --assign-public-ip true \
    --boot-volume-size-in-gbs 150 \
    --ssh-authorized-keys-file ~/.ssh/id_ed25519.pub \
    --user-data-file cloud-init.yml; do
  echo "no capacity, retrying in 5 min..."; sleep 300
done
```

Also try the other ADs in your region (`oci iam availability-domain list`) — capacity differs per AD.

### 3.5 Get the public IP and connect

**UI:** Compute → Instances → ts-server → the public IP is on the details page.

**CLI:**

```bash
oci compute instance list-vnics --instance-id $INST \
  --query 'data[0]."public-ip"' --raw-output
```

```bash
ssh ubuntu@<PUBLIC_IP>
docker ps        # confirms cloud-init installed Docker (wait a few minutes after first boot)
free -h          # confirms 24 GB + 4 GB swap
```

If you skipped cloud-init, install Docker manually:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # then log out and back in
```

---

## 4. Prepare the app for ARM64 + production

Everything so far was generic OCI; this section is TeacherSupporter-specific.

### 4.1 Check the base image is multi-arch — verified 2026-07-26: no change needed

All 7 Dockerfiles use `eclipse-temurin:25-jre-alpine`. Checked against Docker Hub:

```bash
$ docker manifest inspect eclipse-temurin:25-jre-alpine
linux/amd64
linux/arm64  v8     # <-- present, so the Alpine tag is fine on Ampere A1
```

So **leave the Dockerfiles alone**. Docker picks the `linux/arm64` manifest automatically when it
pulls on the A1 host. The rule to remember: never assume a tag is multi-arch, `docker manifest
inspect` it. (Alpine + JDK on arm64 used to be a real gap; it isn't anymore for Temurin.)

Verify the third-party images the same way — `provectuslabs/kafka-ui` and `maildev/maildev:2.2.1`
are the usual arm64 offenders — and consider not deploying them at all (dev tools; see §6).

### 4.2 Build strategy

| Strategy | How | When |
|---|---|---|
| **A. Build on the VM** | clone repo on server, `mvn package`, `docker compose build` — native arm64, zero extra setup | Start here |
| **B. Build in CI** | GitHub Actions `docker buildx --platform linux/arm64` → push GHCR → server does `compose pull` | The production pattern; do it as the CI/CD exercise (`docs/CICD.md`) |

For strategy A the server needs JDK 25 + Maven for the jar build
(`sudo apt install -y openjdk-25-jdk maven` — if 24.04 doesn't carry JDK 25 yet, use
[SDKMAN](https://sdkman.io): `sdk install java 25-tem && sdk install maven`), then:

```bash
git clone <your-repo-url> && cd TeacherSupporter
mvn -DskipTests package
```

### 4.3 Production compose override — `docker-compose.prod.yml`

Never edit `docker-compose.yml` for prod; layer an override. It must:

1. **Remove every JDWP debug line** (`JAVA_TOOL_OPTIONS: -agentlib:jdwp=...`). An open debug port
   is unauthenticated remote code execution.
2. **Remove all published `ports:` except the reverse proxy's 80/443.** Containers reach each
   other by service name on the compose network (`postgres-auth:5432`, `kafka:19092`) — host port
   mappings exist only for local dev convenience.
3. **Real secrets** from a server-side `.env` (`chmod 600 .env`, never committed):
   `POSTGRES_PASSWORD`, MinIO credentials, `GOOGLE_CLIENT_ID/SECRET`, JWT signing key.
4. `restart: unless-stopped` everywhere.
5. Cap each JVM: `JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=25.0"` plus compose `mem_limit` so one
   leaky service can't starve the box.

Run with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

(`-d` detached is correct on a server; per-service foreground terminals are a local-dev workflow.)

### 4.4 App-specific fixups

- **`APP_S3_PUBLIC_ENDPOINT`** currently `http://localhost:9000` — must become a public URL,
  because presigned URLs are opened by the *browser*. Route `https://<domain>/files/*` → `minio:9000`
  through the reverse proxy.
- **Google OAuth**: add `https://<domain>/...` redirect URIs in Google Cloud Console; `localhost`
  URIs won't work from the internet.
- **MailDev** accepts and displays all mail with zero auth. Either keep it unpublished (view via
  SSH tunnel) or switch `SPRING_MAIL_HOST` to a real free SMTP relay (Brevo free tier / Gmail app
  password).
- **Kafka UI / Zipkin / MinIO console / Eureka dashboard**: never publish; use SSH tunnels (§5.4).

---

## 5. The edge: domain, TLS, frontend

### 5.1 Domain

Point a domain (or free DuckDNS subdomain) A-record at the instance's public IP. Needed for TLS
and for Google OAuth redirect URIs.

### 5.2 Caddy as the single internet-facing container

Add to `docker-compose.prod.yml`:

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./frontend-dist:/srv:ro
      - caddy-data:/data
```

`Caddyfile` — Caddy fetches and renews Let's Encrypt certificates automatically:

```
yourdomain.com {
    handle /api/* {
        reverse_proxy api-gateway:8080
    }
    handle /files/* {
        reverse_proxy minio:9000
    }
    handle {
        root * /srv
        try_files {path} /index.html   # SPA fallback for React Router
        file_server
    }
}
```

### 5.3 Frontend build

The React app builds to static files — no Node server in production:

```bash
cd frontend
npm ci && npm run build      # output: dist/ -> copy to server as frontend-dist/
```

Point the axios base URL at `/api` (relative) instead of `http://localhost:8080` — same origin,
which also ends most CORS pain.

### 5.4 Reaching internal UIs (Eureka, Kafka UI, Zipkin, MinIO, MailDev)

Never expose them. From your Windows machine:

```bash
ssh -L 8761:localhost:8761 -L 9411:localhost:9411 -L 9090:localhost:9090 ubuntu@<PUBLIC_IP>
```

…then browse `http://localhost:8761` etc. locally. (This requires those services to keep a
`ports:` mapping bound to the server's localhost only, e.g. `"127.0.0.1:8761:8761"` — a good
pattern: bound to loopback, invisible to the internet, reachable via tunnel.)

---

## 6. Operate

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose ps                        # health at a glance
docker compose logs -f api-gateway      # tail one service
docker stats --no-stream                # memory per container
```

Startup order is driven by the compose healthchecks (`depends_on: service_healthy`) — config-server
first, then everything else. Full cold start of 8 JVMs on 4 ARM cores takes a few minutes; watch
Eureka (via tunnel) until all services register.

---

## 7. Teardown / cost hygiene

Always Free never bills, but if you upgraded to PAYG, know how to tear down:

**UI:** Compute → Instances → ts-server → **Terminate** (tick "permanently delete boot volume") →
then delete the VCN (Networking → VCNs → ts-vcn → Delete, which cascades subnets/IGW once empty).

**CLI:**

```bash
oci compute instance terminate --instance-id $INST --preserve-boot-volume false
oci network subnet delete --subnet-id $SUBNET --force
oci network internet-gateway delete --ig-id $IGW --force
oci network vcn delete --vcn-id $VCN --force
```

---

## Quick reference: UI ↔ CLI map

| Task | Console path | CLI command |
|---|---|---|
| Auth setup | My profile → API keys | `oci setup config` |
| List ADs | (region picker) | `oci iam availability-domain list` |
| Create VCN | Networking → VCN Wizard | `oci network vcn create` |
| Internet gateway | VCN → Internet Gateways | `oci network internet-gateway create` |
| Route rule | VCN → Route Tables | `oci network route-table update` |
| Subnet | VCN → Subnets | `oci network subnet create` |
| Firewall rules | VCN → Security Lists | `oci network security-list update` |
| Find image | (instance form) | `oci compute image list` |
| Launch VM | Compute → Create instance | `oci compute instance launch` |
| Public IP | instance details page | `oci compute instance list-vnics` |
| Terminate | instance → Terminate | `oci compute instance terminate` |
