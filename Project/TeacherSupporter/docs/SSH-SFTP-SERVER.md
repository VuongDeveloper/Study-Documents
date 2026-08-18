# SSH and SFTP on the Ubuntu server

How to run the laptop as an SSH shell server *and* a locked-down SFTP file server.

Companion: `DEPLOY-HOMELAB.md` (turning the laptop into a server at all — power, firewall,
reachability), `DEPLOY-OCI.md` §5.4 (SSH tunnels to internal dashboards).

---

## 1. The one thing to understand first

**SFTP is not a separate server.** It is a *subsystem* of OpenSSH — a program `sshd` launches
inside an already-authenticated, already-encrypted SSH session when the client asks for the
`sftp` subsystem instead of a shell.

```
client ──TCP:22──> sshd ──authenticate──> ┬─ request "shell"        -> bash
                                          └─ request "sftp"         -> internal-sftp
```

Consequences that save you a lot of wasted effort:

- Installing `openssh-server` **already gave you SFTP.** There is nothing else to install, no
  second daemon, no second port, no second firewall rule. Test it right now:
  ```bash
  sftp you@ts-server.local
  ```
- **Anyone who can SSH in can already use SFTP**, with exactly their filesystem permissions. So
  "add an SFTP user" is really "add a user who is *only* allowed SFTP" — a restriction, not a
  feature.
- **Do not install `vsftpd`/`proftpd`.** FTP and FTPS are a different, older protocol family with
  their own ports, their own passive-mode NAT misery, and their own attack surface. SFTP over
  SSH has none of that. The names look related; the protocols share nothing.

> **Interview framing:** "FTPS is FTP with TLS bolted on — two connections, a control channel and
> a data channel, which is why it fights with NAT. SFTP is a file-transfer protocol tunnelled
> inside SSH — one connection, one port, authentication and encryption already solved." That
> distinction is a standard screening question.

---

## 2. Baseline: SSH itself

```bash
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
systemctl status ssh
```

### 2.1 Key-based login

From Git Bash on Windows:

```bash
ssh-keygen -t ed25519                 # if you don't have one
ssh-copy-id you@ts-server.local       # installs the *public* key
ssh you@ts-server.local               # should not prompt for a password
```

Only once that works, turn passwords off:

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

`sshd -t` parses the config and refuses to proceed on error. **Always run it before reloading, and
keep your current SSH session open while you test a new one in a second terminal.** A syntax error
plus a closed session on a headless box means walking over to it with a keyboard.

### 2.2 Ubuntu 24.04 changed how sshd starts

24.04 uses **socket activation**: `ssh.socket` listens on port 22 and spawns `sshd` per
connection. This breaks the old muscle memory — setting `Port 2222` in `sshd_config` now does
nothing, because the socket unit owns the port:

```bash
sudo systemctl edit ssh.socket
```

```ini
[Socket]
ListenStream=          # the empty value clears the inherited default of 22
ListenStream=2222
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart ssh.socket
```

(The blank `ListenStream=` is required — systemd list-type directives *append* unless you reset
them first, so without it you'd listen on both 22 and 2222.)

Changing the port is cosmetic against a targeted attacker but does cut log noise from bots
enormously. Key-only auth is the control that actually matters.

### 2.3 fail2ban

Worth it the moment port 22 is reachable from the internet:

```bash
sudo apt install -y fail2ban
sudo tee /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

`backend = systemd` matters on Ubuntu — there is no `/var/log/auth.log` to tail by default any
more; authentication events live in the journal.

---

## 3. A restricted SFTP-only user

The goal: an account that can upload and download files in one directory and **cannot** get a
shell, cannot see the rest of the filesystem, and cannot use SSH port-forwarding.

### 3.1 Create the account

```bash
sudo groupadd -f sftpusers
sudo useradd -m -G sftpusers -s /usr/sbin/nologin alice
sudo passwd alice
```

`-s /usr/sbin/nologin` denies an interactive shell. Note it does *not* by itself deny SFTP (that's
handled by `internal-sftp` below) nor port-forwarding — a nologin shell still permits
`ssh -L` tunnels. Both need explicit denial.

### 3.2 The chroot jail and its ownership rule

This is where almost everyone's first attempt fails.

**`ChrootDirectory` and every directory above it must be owned by `root` and must not be
writable by group or others.** `sshd` enforces this, because a user who can rename their own jail
root can escape it. The consequence is unintuitive: *the user cannot write to their own home
directory* — so you give them a subdirectory inside it that they do own.

```bash
sudo mkdir -p /srv/sftp/alice/upload

# the jail root: root-owned, user cannot modify it
sudo chown root:root /srv/sftp /srv/sftp/alice
sudo chmod 755 /srv/sftp /srv/sftp/alice

# the one place alice may write
sudo chown alice:sftpusers /srv/sftp/alice/upload
sudo chmod 750 /srv/sftp/alice/upload
```

Symptom when you get this wrong: the client connects, authenticates, then immediately reports
`Connection closed` or `Broken pipe` with no useful message. The real reason is always in the
server's journal:

```bash
sudo journalctl -u ssh -n 30
# "fatal: bad ownership or modes for chroot directory /srv/sftp/alice"
```

### 3.3 sshd configuration

Append to the **end** of `/etc/ssh/sshd_config`:

```
Subsystem sftp internal-sftp

Match Group sftpusers
    ChrootDirectory /srv/sftp/%u
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    PasswordAuthentication yes
```

Line by line:

| Directive | Why |
|---|---|
| `Subsystem sftp internal-sftp` | Replaces Ubuntu's default `/usr/lib/openssh/sftp-server`. `internal-sftp` runs **in the sshd process**, so it needs no binaries or shared libraries copied inside the jail. With the external binary you'd have to populate `/lib`, `/usr/lib`, `/dev/null`… inside every chroot. |
| `ChrootDirectory /srv/sftp/%u` | `%u` expands to the username, so one block serves every member of the group. |
| `ForceCommand internal-sftp` | Overrides whatever the client asks for. Even if the shell were changed to `/bin/bash`, this account still only gets SFTP. |
| `AllowTcpForwarding no` | Without this, a file-transfer account can run `ssh -L 5433:postgres-auth:5432` and reach your databases. This is the line people forget. |
| `PasswordAuthentication yes` | Re-enables passwords **for this group only**, since §2.1 turned them off globally. Drop this line if you issue keys instead — see §3.4. |

**Two placement rules for `Match`:**

1. A `Match` block extends to the next `Match` or end of file. Anything you write after it is
   *inside* it. Put Match blocks last, always.
2. Ubuntu's `sshd_config` has `Include /etc/ssh/sshd_config.d/*.conf` near the **top**, so a Match
   block placed in a drop-in file is parsed before the main file's global settings — which then
   land inside your Match block. Keep drop-ins for global settings (like §2.1) and put Match
   blocks in the main file.

Apply and verify:

```bash
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T -C user=alice,host=localhost,addr=127.0.0.1 | grep -Ei 'chroot|forcecommand|forwarding'
```

`sshd -T -C` prints the **effective** config for a hypothetical connection, with all Match blocks
resolved. It answers "would this rule actually apply to alice?" without needing to log in — by far
the fastest way to debug Match logic.

### 3.4 Keys for a chrooted user

If you prefer keys over passwords, `~/.ssh/authorized_keys` inside the jail is awkward (the home
directory is root-owned and read-only to the user). Keep the keys outside the jail entirely:

```bash
sudo mkdir -p /etc/ssh/authorized_keys
sudo tee /etc/ssh/authorized_keys/alice < alice_key.pub
sudo chmod 644 /etc/ssh/authorized_keys/alice
```

Add to the Match block: `AuthorizedKeysFile /etc/ssh/authorized_keys/%u`, and drop the
`PasswordAuthentication yes` line. Bonus: the user cannot add their own keys, so access stays
under your control.

### 3.5 Test it

```bash
sftp alice@ts-server.local
sftp> pwd            # /            <- the jail root, not /srv/sftp/alice
sftp> ls             # upload
sftp> put file.txt upload/
sftp> exit

ssh alice@ts-server.local    # must be refused / immediately closed
```

`pwd` returning `/` is the confirmation that the chroot took effect — inside the jail, the real
path `/srv/sftp/alice` *is* the root of the visible filesystem.

---

## 4. Connecting from the Windows machine

Verified on this workstation: **OpenSSH_for_Windows 9.5p2** is already in `C:\Windows\System32\OpenSSH`
(`ssh`, `sftp`, `scp`, `ssh-keygen`), and `~/.ssh/id_ed25519` already exists. Nothing to install.

### 4.1 Find the server

On the Ubuntu laptop:

```bash
hostname -I | awk '{print $1}'    # e.g. 192.168.1.50
hostname                          # e.g. ts-server
```

From Windows, try the mDNS name first — Windows 10/11 resolves `.local` natively:

```powershell
ping ts-server.local
```

If that fails, use the IP address and set a DHCP reservation for it (`DEPLOY-HOMELAB.md` §3) so it
doesn't move.

### 4.2 Install your public key — `ssh-copy-id` does not exist on Windows

That's the one missing piece: Microsoft's OpenSSH build ships the client tools but *not*
`ssh-copy-id`. Pipe the key over a password-authenticated session instead:

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" |
  ssh you@ts-server.local "mkdir -p -m 700 ~/.ssh && tr -d '\r' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

The `tr -d '\r'` is not decoration. PowerShell emits **CRLF** line endings, and a stray carriage
return inside `authorized_keys` makes `sshd` read the key as malformed — it silently falls back to
asking for your password, with nothing obviously wrong in the file. This is the single most common
Windows→Linux key-auth failure.

The `-m 700` on `mkdir` matters too: `sshd` refuses to read `~/.ssh` if it is group- or
world-writable, and reports only `Permission denied (publickey)`.

Git Bash *does* ship `ssh-copy-id`, so from a Git Bash prompt this also works and handles both
details for you:

```bash
ssh-copy-id you@ts-server.local
```

### 4.3 A `~/.ssh/config` entry

I've added a `ts-server` block to `C:\Users\VuongDang\.ssh\config` — **edit the `User` line** to
your actual Ubuntu username. After that, `ssh ts-server` is the whole command, and every tool that
reads OpenSSH config (`sftp`, `scp`, `rsync`, VS Code Remote-SSH) picks it up automatically.

```
Host ts-server
    HostName ts-server.local
    User your-ubuntu-username
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 15
    ServerAliveCountMax 10
```

`ServerAliveInterval` (matching your existing `git.integrosys.com` block) makes the client send a
keepalive every 15s, so a home router's NAT table doesn't silently drop an idle session and leave
you with a frozen terminal.

### 4.4 Everyday commands

```powershell
ssh ts-server                                 # shell
sftp ts-server                                # interactive file transfer
scp .\local-file.txt ts-server:~/             # one-off copy up
scp ts-server:~/remote-file.txt .             # one-off copy down
```

Inside `sftp`: `ls`/`cd`/`pwd` act on the **remote** side, `lls`/`lcd`/`lpwd` on the **local** side,
`put` uploads, `get` downloads, `put -r dir/` recurses.

### 4.5 Keep the key unlocked with ssh-agent

If your key has a passphrase, Windows' built-in agent caches it across reboots:

```powershell
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add "$env:USERPROFILE\.ssh\id_ed25519"
```

### 4.6 GUI and editor options

| Tool | Notes |
|---|---|
| **VS Code Remote-SSH** | Edit files on the server as if local, with a terminal attached. Reads the same `~/.ssh/config`, so `ts-server` appears in the host list. Best option for working on the deployment. |
| **WinSCP** | Two-pane GUI, and the only easy way to get a *drive letter* for the server. Not currently installed — `winget install WinSCP.WinSCP`. |
| **FileZilla** | Cross-platform; you must select `sftp://` explicitly or it defaults to plain FTP. |
| File Explorer | **Cannot mount SFTP.** Windows has no SFTP filesystem driver; use WinSCP's drive mapping or `sshfs-win`. |

For repeated deploys, prefer `rsync` (from Git Bash) over interactive SFTP — it transfers only
changed blocks and is scriptable:

```bash
rsync -avz --delete frontend/dist/ ts-server:~/TeacherSupporter/frontend-dist/
```

---

## 5. Reaching the server from outside your home

You need SSH and SFTP from your company's network, not just the LAN. That means two independent
obstacles, and it is worth being clear that they are separate problems:

```
[ you, at the office ]                              [ home ]
        │                                              │
   (a) company egress filter                      (b) ISP CGNAT + your router
       typically allows 80/443 only                    usually no inbound path at all
```

**Obstacle (a) is the one people forget.** Corporate firewalls commonly block *outbound* port 22.
If yours does, no amount of port-forwarding at home will help. Test it from the office before
building anything:

```powershell
Test-NetConnection -ComputerName github.com -Port 22
```

`TcpTestSucceeded : False` means outbound 22 is blocked, and any design that relies on it is dead
on arrival.

**Obstacle (b)** is the CGNAT check from `DEPLOY-HOMELAB.md` §1.2.

The good news: one solution clears both at once.

### 5.1 Tailscale — the recommendation

A WireGuard mesh where *both* machines make **outbound** connections to a coordination server, then
talk to each other directly. Nothing listens on the public internet at either end.

Why it survives both obstacles: it first tries a direct UDP path (port 41641, NAT-traversed via
STUN), and when a restrictive firewall blocks that — the normal case on a corporate network — it
falls back automatically to a **DERP relay over TCP 443**, which looks like ordinary HTTPS. You get
an encrypted tunnel out of the office without asking anyone to open anything.

On the Ubuntu server:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale set --hostname ts-server
tailscale ip -4          # your stable 100.x.y.z address
```

On the Windows machine:

```powershell
winget install tailscale.tailscale
```

Sign both into the same account (Google/GitHub/Microsoft). Then, from anywhere in the world:

```powershell
ssh you@ts-server        # MagicDNS resolves the tailnet hostname
sftp you@ts-server
```

Point your existing config block at it so `ssh ts-server` works both at home and at the office:

```
Host ts-server
    HostName ts-server          # MagicDNS name, not ts-server.local
    User your-ubuntu-username
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 15
    ServerAliveCountMax 10
```

What this buys you over port-forwarding:

- **Zero public attack surface.** Port 22 stays closed to the internet. No bot scans, no fail2ban
  arms race, no SSH CVE that suddenly matters at 2am.
- **CGNAT is irrelevant** — you never needed an inbound path.
- **Your home IP is never exposed**, and it can change freely.
- **Free tier covers this** (100 devices, 3 users), and SFTP, `scp`, `rsync` and VS Code
  Remote-SSH all work unchanged, because it is still plain SSH — just over a different network.

### 5.1.1 Do these two things or remote access will break later

**Disable key expiry on the server node.** Tailscale expires a node's key after 180 days by
default and requires an interactive browser re-authentication. On your laptop that's a mild
annoyance; on a headless server it means the box drops off the tailnet — and if it happens while
you're at the office, you cannot fix it remotely, because fixing it *is* the thing you've lost
access to. You'd be waiting until you're physically home.

Admin console → **Machines** → `ts-server` → ⋯ → **Disable key expiry**.

Worth understanding *why* this is safe to switch off here: key expiry exists to bound the damage
from a stolen laptop. A server sitting in your house has a different threat model, and you can
revoke the node instantly from the admin console if you ever need to — revocation, not expiry, is
the control that matters for a machine that never leaves the building.

**Confirm it starts at boot.** The installer enables `tailscaled`, but verify rather than assume —
a server that rejoins the tailnet only after a manual command is not a server you can rely on from
the office:

```bash
systemctl is-enabled tailscaled     # -> enabled
sudo reboot
# then, from Windows, after a minute:
ssh ts-server
```

**Test from outside before you trust it.** Tether your Windows machine to your phone — which puts
you on a genuinely different network, exactly like the office — and confirm `ssh ts-server` and
`sftp ts-server` both work. Do this while you are still at home and able to fix things at the
keyboard.

Two things to know before you commit:

- **You must install it on the office machine.** If that's a company-managed laptop, check policy
  first; some MDM setups block unapproved VPN clients, and a corporate VPN client already running
  can conflict with the tailnet's routes.
- **`tailscale up --ssh`** is an optional mode where Tailscale itself terminates SSH and authorises
  by tailnet identity instead of your `authorized_keys`. Convenient, but it moves your access
  control into Tailscale's ACLs. Prefer plain key auth over the tailnet until you have a reason.

### 5.2 Cloudflare Tunnel + Access — if you cannot install Tailscale

`cloudflared` on the server holds an outbound connection to Cloudflare's edge; you reach it through
Cloudflare over 443. Requires a domain on Cloudflare.

```bash
cloudflared tunnel create ts-server
cloudflared tunnel route dns ts-server ssh.yourdomain.com
```

```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: ssh.yourdomain.com
    service: ssh://localhost:22
  - service: http_status:404
```

Client side, in `~/.ssh/config`:

```
Host ssh.yourdomain.com
    ProxyCommand cloudflared access ssh --hostname %h
```

The distinctive advantage: with a Cloudflare **Access** policy you can enable a
**browser-rendered terminal** — SSH in a browser tab, no client software at all, which is the only
option if the office machine is locked down completely. Note the limitation: the browser terminal
is shell-only. **SFTP needs the `cloudflared` binary installed**, so it doesn't rescue you from a
no-installs-allowed policy.

### 5.3 Port forwarding — why it's last

Requires a real public IP (§1.2), exposes port 22 to the whole internet, publishes your home
address, and *still* fails if the office blocks outbound 22.

If you do it anyway: forward an unusual **external** port to internal 22 so bots don't find it
instantly, keep key-only auth, and run fail2ban.

```
router: external 44322/tcp  ->  192.168.1.50:22
```

```
Host ts-home
    HostName yourname.duckdns.org
    Port 44322
    User your-ubuntu-username
```

A refinement worth knowing about: **`sslh`** multiplexes port 443 between HTTPS and SSH by peeking
at the first bytes of each connection, so one public 443 serves both Caddy and SSH — traffic that a
corporate egress filter almost always permits. That's the manual version of what Tailscale's DERP
fallback does for you automatically, which is a good argument for just using Tailscale.

### 5.4 If the company blocks Tailscale — Funnel, and its limits

"Blocked" means two different things, and only one of them has a Funnel-shaped answer.

| What's blocked | Does Funnel help? |
|---|---|
| You can't **install** the client (MDM, no admin rights) | **Yes** — Funnel gives you a public hostname you reach with the `ssh.exe` already in Windows |
| The **network** drops Tailscale traffic (DNS/IP blocklist) | **No** — `*.ts.net` and the DERP relays are the same infrastructure, blocked by the same rule |

Funnel exposes a tailnet service to the *public* internet through Tailscale's edge, so the client
side needs nothing installed. On the server:

```bash
tailscale funnel --bg --tcp 443 tcp://localhost:22
tailscale funnel status
```

Then from any machine with a stock SSH client:

```powershell
ssh -p 443 you@ts-server.your-tailnet.ts.net
```

Three caveats, and together they're why this is a fallback rather than the plan:

- **Only ports 443, 8443 and 10000** are permitted as public listeners — hence forwarding 443 to
  local 22 rather than exposing 22 itself.
- **Funnel's ingress routes by TLS SNI**, and raw SSH never sends a TLS ClientHello. Raw-TCP
  Funnel is consequently documented as TLS-oriented and is
  [reported to behave inconsistently across the allowed ports](https://github.com/tailscale/tailscale/issues/14625).
  Don't make it your only way in.
- **It puts SSH on the public internet**, which discards the main reason to choose Tailscale.
  Better than forwarding your home router (your IP stays hidden and Tailscale's edge absorbs the
  scanning), but it is no longer a zero-attack-surface setup. Keep key-only auth and fail2ban on.

Bandwidth is also rate-limited and non-configurable — fine for a shell, poor for moving large files.

### 5.5 The simplest answer: your own connection

If the office network blocks Tailscale outright, don't fight it. Tether to your phone, or use any
personal connection, and plain Tailscale works immediately — **no Funnel, no public exposure,
nothing to reconfigure on the server.**

This works because Tailscale never needed an inbound path. Mobile carriers put you behind CGNAT
too, and it makes no difference: both ends dial out, so the tunnel forms over any connection that
allows general internet access. The only requirement is that Tailscale is installed on whichever
machine you're typing on — which is trivially satisfied on your own laptop, where no corporate
policy applies.

Watch the data plan for large SFTP transfers; a shell session costs almost nothing.

### 5.6 What this means for the firewall

With Tailscale, tunnelled traffic arrives on the `tailscale0` interface rather than your Ethernet
interface, so ufw can distinguish the two. That lets you allow SSH from the tailnet and from the
LAN while leaving it closed to the internet:

```bash
sudo ufw allow in on tailscale0 to any port 22 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
```

This is the posture to aim for: remote access from anywhere, and still nothing listening on a
public address.

---

## 6. Where SFTP fits in this project — and where it doesn't

Useful for **operator tasks**: shipping the built React `dist/`, copying a `.env` onto the box,
pulling database dumps off it.

**Not** the right tool for application file storage. The stack already has MinIO for course
materials (`DEPLOYMENT-ARCHITECTURE.md` §2), and that's the correct choice: the app gets an S3 API,
presigned URLs, and bucket policies, none of which SFTP offers. Resist the temptation to have a
Spring service shell out to SFTP — you'd be reimplementing object storage over a file protocol.

Also note the security asymmetry with §4.1 of `DEPLOY-HOMELAB.md`: SSH/SFTP on port 22 is a **host**
service, so `ufw` genuinely does control it — unlike Docker-published ports, which bypass ufw
entirely. Port 22 is one of the few things on this box your firewall rules really govern, which is
why exposing it to `0.0.0.0/0` versus your LAN is a decision worth making deliberately.

---

## 7. Troubleshooting order

Work outside-in; each step rules out a layer.

```bash
# 1. Is sshd listening at all, and on what?
sudo ss -tlnp | grep -E ':22|sshd'

# 2. Does the firewall permit it?
sudo ufw status verbose

# 3. What does the server think happened? (the single most useful command here)
sudo journalctl -u ssh -f

# 4. What does the client see? -vvv prints the full handshake and auth attempts
ssh -vvv alice@ts-server.local

# 5. Which rules actually apply to this user?
sudo sshd -T -C user=alice,host=localhost,addr=127.0.0.1
```

Common failures and their real causes:

| Symptom | Cause |
|---|---|
| `Connection closed` right after auth | chroot ownership (§3.2) — check the journal |
| `Permission denied (publickey)` | wrong key, or `~/.ssh` perms not `700` / `authorized_keys` not `600` |
| SFTP works, `ssh` also works | `ForceCommand internal-sftp` missing, or the Match block never matched |
| Nothing on port 22 after a port change | you edited `sshd_config` but 24.04 uses `ssh.socket` (§2.2) |
| Works on LAN, not remotely | NAT/CGNAT at home, or the office blocks outbound 22 — see §5 |
| Tailscale connects but SSH times out | ufw isn't allowing `tailscale0` — see §5.6 |
| `tailscale status` shows `relay "sin"` not `direct` | normal on a corporate network; DERP fallback is working, expect slightly higher latency |
