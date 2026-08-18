# Deploying TeacherSupporter on a home Ubuntu laptop

Turning a freshly installed Ubuntu laptop into a headless server for the compose stack.

Companion documents: `DEPLOY-OCI.md` (the same job on an Oracle Cloud VM),
`DEPLOYMENT-ARCHITECTURE.md` (runtime topology), `CICD.md` (pipeline).
Automation: `deploy/bootstrap-laptop-server.sh` — the bare-metal equivalent of
`deploy/cloud-init.yml`.

> **What actually differs from the cloud VM.** Only three things, but they matter:
>
> | Concern | OCI VM | Home laptop |
> |---|---|---|
> | CPU arch | arm64 → multi-arch images required | **amd64** → same as dev machine and CI, no cross-build |
> | Firewall | security list (cloud) **+** host iptables | **host `ufw` only** — one layer, and Docker punches through it |
> | Reachability | public IPv4, DNS A-record | behind NAT, probably **CGNAT** → needs a tunnel |
> | Uptime | VM never sleeps | **laptop suspends on lid close by default** |
>
> Everything else — compose, Caddy, volumes, SSH tunnels for internal UIs — is identical.
> Sections 4 onward of `DEPLOY-OCI.md` apply verbatim, minus the arm64 paragraphs.

---

## 1. Before anything else: two facts that can change the plan

Run these first. Each has an answer that means "stop and reconsider."

> **Answered for this machine (2026-08-09):**
> - **No LUKS encryption** → the box reboots unattended. Set BIOS *"Restore on AC power loss"* so
>   it also comes back by itself after an outage; combined with §6.2's systemd unit, the stack
>   self-heals from a power cut.
> - **Behind CGNAT** → no inbound path exists, ever. **Option C in §5 is permanently off the
>   table**; don't spend time on port forwarding or DuckDNS. Tailscale (§5.1) for operator access,
>   Cloudflare Tunnel (§5.2) later if you want a public demo URL — both are outbound-only and
>   unaffected by CGNAT.

### 1.1 Is the disk encrypted?

```bash
lsblk -f | grep crypto_LUKS
```

If that prints anything, you ticked "Encrypt the new Ubuntu installation" during setup. On a
headless server this is a real problem: **every reboot halts at a passphrase prompt** before the
network comes up. A power cut at 3am means the box stays down until you physically type on it.

Three ways out, in order of sanity:

1. **Reinstall without encryption.** Cleanest, and the machine sits in your house anyway.
2. **`dropbear-initramfs`** — a tiny SSH server in the initramfs so you can unlock it remotely.
   Still needs *you*; it just doesn't need you to be in the room.
3. **Clevis + TPM2 auto-unlock** — the disk unlocks itself if the TPM measurements match.
   Convenient, but it means the disk decrypts for anyone who boots the laptop, which defeats most
   of the point of having encrypted it.

### 1.2 Do you have a real public IP?

```bash
curl https://api.ipify.org        # what the internet sees
ip route | awk '/^default/{print $3}'   # your router's LAN address
```

Now open your router's admin page and find its **WAN IP**. If the WAN IP is *not* the same as
`api.ipify.org` returned — or it starts with `100.64.`–`100.127.` — your ISP has you behind
**CGNAT**. You share one public address with hundreds of other subscribers, so port-forwarding
80/443 on your router does nothing: there is no inbound path to your router in the first place.

This is the default for most residential fibre in Vietnam (VNPT, Viettel, FPT). It is not a
misconfiguration you can fix; it decides which option you pick in §5.

---

## 2. Keep the laptop awake

A laptop's factory behaviour is to suspend when the lid closes. A suspended server answers no
requests, so this is the first thing to change — and it's the step people most often get *almost*
right, because two different subsystems both want to handle the lid.

### 2.1 The authoritative setting: systemd-logind

```bash
sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/99-server.conf <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchDocked=ignore
HandleLidSwitchExternalPower=ignore
IdleAction=ignore
EOF
sudo systemctl restart systemd-logind
```

Why three `HandleLidSwitch*` keys and not one — logind picks a *different* key depending on the
machine's state at the moment the lid closes:

| Key | Applies when |
|---|---|
| `HandleLidSwitchExternalPower` | plugged into AC ← **your normal case** |
| `HandleLidSwitch` | running on battery (e.g. during a power cut) |
| `HandleLidSwitchDocked` | docked, or an external monitor is attached |

Setting only `HandleLidSwitch` is the classic mistake: it works on battery and silently does
nothing while the laptop is plugged in, which is exactly when it's serving.

`IdleAction=ignore` covers the separate case of the machine going idle with the lid *open*.

### 2.2 The hard guarantee: remove the sleep states

The logind setting says "don't suspend when the lid closes." Masking the targets says "this
machine cannot suspend, by any path, for any reason":

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

After this, even `systemctl suspend` typed by hand fails. On a server that's the behaviour you
want. Reverse it any time with `systemctl unmask`.

### 2.3 If you installed Ubuntu **Desktop**, there's a third actor

GNOME's power daemon runs its own idle-suspend logic on top of logind, and it's the usual reason
"I set logind to ignore and it still slept":

```bash
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing'
```

The better move is to stop running a desktop at all. GNOME costs roughly 1 GB of RAM — real money
when you're fitting 8 JVMs on the box — and it's the thing fighting you over the lid:

```bash
sudo systemctl set-default multi-user.target
sudo reboot
```

You still have the machine locally on a text console (`Ctrl+Alt+F1`), and you can go back with
`sudo systemctl set-default graphical.target`. Everything else happens over SSH.

### 2.4 Verify

Close the lid, then from your Windows machine:

```bash
ping ts-server.local        # keeps replying
ssh user@ts-server.local    # still connects
```

On the server, confirm nothing suspended while you weren't watching:

```bash
journalctl -b -u systemd-logind | grep -i lid    # should log the event, not a suspend
uptime                                            # no unexplained gaps
```

### 2.5 No, you don't have to stay logged in

Setting a login password does not gate SSH. `sshd` is a **system service**: systemd starts it at
boot, as root, before any human logs in, and it creates its own session for each connection. The
console can sit at the login screen — or be locked, or have the lid shut — and SSH still answers.
That's the whole model of a Unix server: services belong to the machine, not to a logged-in user.
"Log in as `you`" over SSH and "log in as `you`" at the keyboard are two independent sessions of
the same account.

So do **not** enable auto-login, and don't leave a desktop session open "so SSH keeps working."

Three things genuinely do require a human at the machine, though, and they're worth knowing apart
from the password:

1. **LUKS full-disk encryption** (§1.1) — the passphrase is needed to mount the root filesystem,
   which happens *before* systemd starts anything. Nothing is running yet, so there is nothing to
   SSH into.
2. **A per-user Wi-Fi connection.** In NetworkManager, a connection saved without *"All users may
   connect to this network"* is stored against your user profile and only activates once you log
   in — so the laptop has no network at the login screen. Check with `nmcli -f NAME,UUID con show`
   and fix with:
   ```bash
   sudo nmcli connection modify "<name>" connection.permissions ''
   ```
   Empty permissions means system-wide. Ethernet is normally system-wide already, which is one
   more reason to prefer the cable.
3. **An encrypted home directory** (ecryptfs — rare, only if you ticked "encrypt my home folder" on
   an older installer). `~/.ssh/authorized_keys` lives inside the encrypted home, so key auth fails
   until you log in at the console. Put the keys in `/etc/ssh/authorized_keys/<user>` via
   `AuthorizedKeysFile` if you hit this.

> **Physical caveat:** a closed laptop vents through a much smaller gap. Under a sustained
> 14-container load the fans will run hard and the CPU may thermal-throttle. Either leave the lid
> open (the display sleeps on its own and costs nothing) or prop the chassis so air can move.
> Also set **"Restore on AC power loss"** in the BIOS so the machine boots itself after an outage.

---

## 3. Network identity

The server needs an address that doesn't move. Two options; the first is better because it keeps
one source of truth.

**Preferred — DHCP reservation on the router.** Find the laptop's MAC (`ip link show`), then in the
router's DHCP settings bind that MAC to a fixed address such as `192.168.1.50`. The laptop keeps
using DHCP and knows nothing about it, so there's no config on the box to drift.

**Alternative — static IP via netplan.** Only if the router can't reserve. Note that Ubuntu
Desktop renders netplan through NetworkManager while Server uses systemd-networkd, so check
`ls /etc/netplan/` and match the existing file's `renderer:` before editing.

```yaml
# /etc/netplan/01-static.yaml   (chmod 600, or netplan warns)
network:
  version: 2
  ethernets:
    enp3s0:                       # your interface, from `ip link show`
      dhcp4: false
      addresses: [192.168.1.50/24]
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

```bash
sudo netplan try      # applies, then auto-reverts in 120s unless you confirm
```

`netplan try` rather than `netplan apply`: if you get the gateway wrong over SSH, `apply` locks you
out and `try` hands the connection back.

**Use Ethernet if you possibly can.** Wi-Fi power-saving on Linux laptops drops idle connections in
ways that are miserable to debug, and Ethernet is one less thing between you and the stack.

Ubuntu also advertises itself over mDNS, so `ts-server.local` resolves from Windows without any DNS
setup — good enough for LAN work.

---

## 4. Run the bootstrap script

The steps above plus Docker, swap, SSH hardening and unattended upgrades are scripted:

```bash
chmod +x deploy/bootstrap-laptop-server.sh
LAN_CIDR=192.168.1.0/24 ./deploy/bootstrap-laptop-server.sh
```

It is idempotent — re-running it reports state rather than redoing work.

> If it fails with `bad interpreter: /bin/bash^M`, the file picked up Windows line endings on its
> way through git. Fix with `sed -i 's/\r$//' deploy/bootstrap-laptop-server.sh`, and add
> `*.sh text eol=lf` to `.gitattributes` so it can't happen again.

### 4.1 The firewall gotcha that matters most

**Docker bypasses ufw.** This surprises nearly everyone, and on a home server it's the difference
between "internal service" and "exposed to your whole LAN":

- `ufw` filters the kernel's `INPUT` chain — traffic addressed to the *host*.
- A published container port (`-p 8761:8761`) is DNAT'd and traverses the `FORWARD` chain instead,
  through Docker's own `DOCKER`/`DOCKER-USER` rules, which Docker inserts *ahead* of ufw's.

So `ufw deny 8761` does not close the Eureka dashboard. The rule to internalise: **on a Docker
host, ufw governs host services; the compose file governs container exposure.**

The fix is the one `DEPLOYMENT-ARCHITECTURE.md` §2 already prescribes — bind internal services to
loopback in `docker-compose.prod.yml`:

```yaml
ports: ["127.0.0.1:8761:8761"]   # reachable only via SSH tunnel
```

Same rule, sharper consequences than on OCI: there, the cloud security list would have caught your
mistake. Here nothing does.

---

## 5. Getting to it from the internet

Pick based on your §1.2 answer. Note these are not exclusive — the normal end state is **A for
operator access plus B for the public demo URL**.

| | Works behind CGNAT | Survives a corporate egress filter | Public URL | Exposes home IP | Best for |
|---|---|---|---|---|---|
| **A. Tailscale** | yes | yes (DERP relay over 443) | no | no | SSH/SFTP from anywhere, day-to-day dev |
| **B. Cloudflare Tunnel** | yes | yes (all traffic over 443) | yes | no | a demo link for your CV |
| ~~**C. Port forward + DDNS**~~ | **no** | **no** if the office blocks outbound 22 | yes | yes | ~~only with a real public IP~~ **ruled out — see §1** |

> **Two firewalls, not one.** Your home NAT is only half the problem. Company networks typically
> permit outbound 80/443 and little else, so an SSH design that depends on port 22 leaving the
> office will fail there no matter how correct your home setup is. `SSH-SFTP-SERVER.md` §5 covers
> this end in detail; the short version is that A and B both tunnel over 443 and C does not.

### A. Tailscale — start here

A WireGuard mesh: every device makes an *outbound* connection to the coordination server, so no
inbound port is ever needed and NAT is irrelevant.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Install it on your Windows machine too and the server is reachable at a stable `100.x.y.z` from
anywhere, with nothing published to the internet. This is the correct posture while you're still
building: zero attack surface, works from a café, and you can add public exposure later without
undoing it.

### B. Cloudflare Tunnel — when you want a link to share

`cloudflared` holds an outbound connection to Cloudflare's edge; Cloudflare terminates TLS and
forwards requests down that tunnel. No open ports, home IP never revealed.

```bash
cloudflared tunnel login
cloudflared tunnel create ts-server
cloudflared tunnel route dns ts-server app.yourdomain.com
```

```yaml
# ~/.cloudflared/config.yml
tunnel: ts-server
credentials-file: /home/you/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: app.yourdomain.com
    service: http://localhost:80      # your Caddy container
  - service: http_status:404
```

```bash
sudo cloudflared service install   # runs at boot
```

Two consequences specific to this stack:

- **Cloudflare's free tier caps request bodies at ~100 MB.** Course-material uploads to MinIO above
  that will fail at the edge, not in your app.
- **Caddy no longer needs Let's Encrypt** — Cloudflare provides the public certificate. Keep Caddy
  for routing (`/api/*`, `/files/*`, SPA fallback) and let it serve plain HTTP on :80 behind the
  tunnel.

### C. Port forward + DDNS — only if §1.2 said you have a real public IP

Forward router ports 80 and 443 to `192.168.1.50`, register a DuckDNS subdomain, run its updater on
the server, and let Caddy fetch Let's Encrypt certificates exactly as in `DEPLOY-OCI.md` §5.2.

Understand what you're accepting: your home address is now in certificate-transparency logs and
Shodan within hours, and the box is on the same LAN as your personal devices. If you go this route,
put the server on a guest/VLAN network and keep fail2ban on SSH.

---

## 6. Running the stack

From here `DEPLOY-OCI.md` §4–§6 applies as written, with two simplifications:

- **Skip §4.1 entirely.** The laptop is amd64. `docker manifest inspect` checks for arm64 support
  are moot, and `provectuslabs/kafka-ui` / `maildev` work without qualification.
- **Skip buildx cross-compilation in CI.** GitHub's free runners are amd64 and so is the target, so
  `docker build` in Actions produces images this box runs directly.

Build tooling on the server (strategy A — build on the box):

```bash
curl -s https://get.sdkman.io | bash && source ~/.sdkman/bin/sdkman-init.sh
sdk install java 25-tem && sdk install maven
git clone <your-repo-url> && cd TeacherSupporter
mvn -DskipTests package
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 6.1 Memory budget — the real constraint

Fourteen containers, eight of them JVMs. A JVM defaults to a quarter of *host* RAM for its heap and
has no idea it's sharing, so eight of them will happily promise 200% of the machine.

```yaml
# docker-compose.prod.yml, per Java service
environment:
  JAVA_TOOL_OPTIONS: "-XX:MaxRAMPercentage=25.0"
mem_limit: 512m
```

`MaxRAMPercentage` is container-aware — it reads the cgroup limit, not the host's total — so with
`mem_limit: 512m` the heap caps near 128 MB and the rest covers metaspace, threads and JIT code.

Rough guidance: **16 GB is comfortable, 8 GB means trimming.** On 8 GB, drop the dev-only
containers first (`kafka-ui`, `zipkin`, `maildev` — three services and no user-facing loss), and
switch to `multi-user.target` per §2.3.

### 6.2 Start on boot

`restart: unless-stopped` handles container crashes and reboots, but it doesn't remember your
`-f docker-compose.prod.yml` override. A unit file encodes the whole command:

```ini
# /etc/systemd/system/teachersupporter.service
[Unit]
Description=TeacherSupporter stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/you/TeacherSupporter
ExecStart=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml down

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now teachersupporter
```

---

## 7. Honest limits

Everything in `DEPLOYMENT-ARCHITECTURE.md` §4 still applies (single point of failure, no HA, no
rolling deploys, no backups), plus what's specific to running at home:

- **Your electricity and internet are now the SLA.** A power cut or an ISP router reboot takes the
  demo down while an interviewer is looking at it.
- **Residential ISP terms often forbid running servers**, and asymmetric upload (frequently
  10–20 Mbps) caps what you can serve.
- **Consumer SSDs with Kafka + two Postgres instances write constantly.** Watch endurance with
  `sudo smartctl -a /dev/nvme0n1 | grep -i wear`.

The pragmatic split: **laptop for development, staging and CI runners; OCI Always Free for the
public demo URL you put on your CV.** They cost nothing together, and running both teaches you the
part interviewers actually probe — that the pipeline shape (`source → CI → registry → orchestrator`)
is identical regardless of where the metal lives.
