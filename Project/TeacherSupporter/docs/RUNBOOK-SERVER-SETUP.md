# Runbook — Ubuntu laptop → server, start to finish

Sequential, copy-pasteable. Every phase ends with a **Verify** step; don't move on until it passes.

Reference material lives in `DEPLOY-HOMELAB.md` (why each step exists) and `SSH-SFTP-SERVER.md`
(SSH/SFTP detail). This file is just the order of operations.

**Confirmed for this machine:** no LUKS encryption, behind CGNAT, amd64.

Legend: 🖥️ = typed at the Ubuntu laptop's keyboard · 🪟 = run on the Windows machine ·
🔒 = run over SSH on the Ubuntu box.

---

## Phase 0 — Verify the prerequisites 🖥️

You've done these; confirm rather than assume.

```bash
lsblk -f | grep crypto_LUKS || echo "OK: no disk encryption"
systemctl status systemd-logind --no-pager | head -3
cat /etc/systemd/logind.conf.d/99-server.conf 2>/dev/null || echo "MISSING: lid config"
systemctl list-unit-files | grep -E 'sleep|suspend' | grep masked || echo "MISSING: sleep targets not masked"
systemctl get-default
```

**Verify:** lid config prints three `HandleLidSwitch*=ignore` lines, sleep targets show `masked`.

If `get-default` says `graphical.target`, consider `sudo systemctl set-default multi-user.target`
— it frees ~1 GB of RAM and removes GNOME's competing power daemon. Reboot to apply.

---

## Phase 1 — SSH server 🖥️

The only phase requiring the laptop's keyboard. Four commands, then you're done with it.

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
whoami; hostname -I
```

**Verify:** note the username and IP — e.g. `vuong` and `192.168.1.50`. You need both next.

---

## Phase 2 — Connect and install your key 🪟

Set a variable so the rest is copy-paste without editing:

```powershell
$SRV = "vuong@192.168.1.50"      # <-- your username and IP from Phase 1
ssh $SRV
```

Accept the host fingerprint (`yes`), enter your Ubuntu password, then `exit`.

Install your public key (Windows has no `ssh-copy-id`):

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" |
  ssh $SRV "mkdir -p -m 700 ~/.ssh && tr -d '\r' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

`tr -d '\r'` strips the CRLF that PowerShell adds — without it `sshd` reads the key as malformed
and silently keeps asking for your password.

**Verify:** `ssh $SRV` connects with **no password prompt**.

---

## Phase 3 — Copy the bootstrap script over 🪟

From the repo directory. Optional — Phases 4–7 are the same commands run by hand.

```powershell
scp deploy/bootstrap-laptop-server.sh ${SRV}:~/
```

```bash
sed -i 's/\r$//' bootstrap-laptop-server.sh
chmod +x bootstrap-laptop-server.sh
```

**Verify:** `head -1 bootstrap-laptop-server.sh` shows `#!/usr/bin/env bash` with no trailing `^M`.

---

## Phase 4 — Docker 🔒

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker
```

Group membership only applies to a **new** login:

```bash
exit
```

```powershell
ssh $SRV
```

**Verify:**

```bash
docker run --rm hello-world      # must work WITHOUT sudo
```

---

## Phase 5 — Swap 🔒

Insurance against the memory spike when eight JVMs start at once.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
```

**Verify:** `free -h` shows a 4 GB Swap row. `swapon --show` lists `/swapfile`.

---

## Phase 6 — Harden SSH and enable auto-updates 🔒

Only after Phase 2's key login is proven working.

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

`sshd -t` validates the config first; the `&&` means a syntax error aborts before the reload.

**Verify — keep this session open** and from a *second* Windows terminal:

```powershell
ssh $SRV                                          # still works (key)
ssh -o PubkeyAuthentication=no $SRV               # must be REFUSED
```

Then maintenance:

```bash
sudo apt install -y unattended-upgrades
sudo tee /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
sudo hostnamectl set-hostname ts-server
```

---

## Phase 7 — Tailscale 🔒

This is what gives you SSH/SFTP from the office, a café, or a phone tether.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Open the printed URL in a browser and sign in. Then:

```bash
sudo tailscale set --hostname ts-server
tailscale status
tailscale ip -4
systemctl is-enabled tailscaled        # must print: enabled
```

On Windows:

```powershell
winget install tailscale.tailscale
```

Sign in with the same account.

### 7.1 Disable key expiry — do not skip

Admin console → **Machines** → `ts-server` → ⋯ → **Disable key expiry**.

Node keys expire after 180 days and need interactive browser re-auth. On a headless server that's
a lockout you cannot fix remotely — the access you'd use to fix it is the access you lost.

### 7.2 Set your username in the SSH config 🪟

Edit `C:\Users\VuongDang\.ssh\config` and replace `your-ubuntu-username` in **both** the
`ts-server` and `ts-lan` blocks.

**Verify — from a phone tether, not your home Wi-Fi:**

```powershell
ssh ts-server
sftp ts-server
```

Test this while you're still at home and can reach the keyboard if something's wrong.

---

## Phase 8 — Firewall 🔒

Fill in the `configure_firewall()` function in `deploy/bootstrap-laptop-server.sh` (the
`TODO(human)` block), or apply the equivalent by hand.

**Order matters:** `ufw enable` applies `default deny incoming` immediately, to your live SSH
session included. Add the SSH allow rules *first*. Preview without applying:

```bash
sudo ufw --dry-run enable | grep -i '22\|tailscale'
```

Confirm the interface your remote access arrives on exists first:

```bash
ip link show tailscale0
```

**Verify:** `sudo ufw status verbose`, then reconnect over both `ts-lan` and `ts-server`.

---

## Phase 9 — Reboot test

The real proof. A server that needs hand-holding after a power cut isn't finished.

```bash
sudo reboot
```

Wait ~60 seconds, then from Windows:

```powershell
ssh ts-server        # tailnet rejoined by itself
ssh ts-lan           # LAN path still fine
```

On the box:

```bash
uptime
systemctl is-active docker tailscaled ssh
swapon --show
```

**Verify:** all three services `active`, swap present, both SSH routes working — with nobody
having touched the laptop.

Also set **"Restore on AC power loss"** in the BIOS so it powers on by itself after an outage.

---

## Done. What you have

- SSH + SFTP from home (LAN) and from anywhere (Tailscale), key-only auth
- Nothing listening on a public address; CGNAT and the firewall both agree
- Docker ready, swap sized for the JVM fleet, security updates automatic
- Survives reboot unattended

**Next:** deploying the actual stack — `DEPLOY-HOMELAB.md` §6 (JDK/Maven, clone, compose overrides,
memory limits, the systemd unit that starts everything at boot).
