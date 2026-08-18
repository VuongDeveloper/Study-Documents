#!/usr/bin/env bash
#
# Turn a freshly installed Ubuntu laptop into a headless Docker server.
#
# This is the bare-metal counterpart to deploy/cloud-init.yml (which does the same
# job on an OCI VM). Unlike cloud-init it is *idempotent*: safe to re-run, and it
# reports what it changed. Run it as your normal user; it calls sudo where needed.
#
#   chmod +x deploy/bootstrap-laptop-server.sh
#   ./deploy/bootstrap-laptop-server.sh
#
# See docs/DEPLOY-HOMELAB.md for the reasoning behind each step.

set -euo pipefail

LAN_CIDR="${LAN_CIDR:-192.168.1.0/24}"   # override: LAN_CIDR=192.168.0.0/24 ./bootstrap-laptop-server.sh
SWAP_GB="${SWAP_GB:-4}"
HOSTNAME_NEW="${HOSTNAME_NEW:-ts-server}"

say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[0;32mok\033[0m   %s\n' "$*"; }
warn() { printf '   \033[0;33mwarn\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 0. Preflight — report the facts that decide the rest of the setup
# ---------------------------------------------------------------------------
preflight() {
  say "Preflight"
  echo "   arch      : $(uname -m)   (expect x86_64 -> no arm64 cross-build needed)"
  echo "   ubuntu    : $(lsb_release -ds)"
  echo "   ram       : $(free -h | awk '/^Mem:/{print $2}')"
  echo "   disk /    : $(df -h / | awk 'NR==2{print $4" free of "$2}')"
  echo "   graphical : $(systemctl get-default)"

  if lsblk -f 2>/dev/null | grep -q crypto_LUKS; then
    warn "FULL DISK ENCRYPTION detected. This box cannot reboot unattended -- it will"
    warn "stop at a passphrase prompt with no keyboard attached. See DEPLOY-HOMELAB.md §1."
  else
    ok "no LUKS: unattended reboot will work"
  fi

  local wan_ip router_ip
  wan_ip="$(curl -fsS --max-time 8 https://api.ipify.org || echo unknown)"
  router_ip="$(ip route | awk '/^default/{print $3; exit}')"
  echo "   public IP : ${wan_ip}"
  echo "   gateway   : ${router_ip}"
  warn "Compare '${wan_ip}' with the WAN IP shown in your router admin page."
  warn "If they differ you are behind CGNAT: port-forwarding will NOT work (see §5)."
}

# ---------------------------------------------------------------------------
# 1. Stay awake: a laptop's default is to sleep, which is fatal for a server
# ---------------------------------------------------------------------------
configure_power() {
  say "Power / lid behaviour"

  sudo mkdir -p /etc/systemd/logind.conf.d
  sudo tee /etc/systemd/logind.conf.d/99-server.conf >/dev/null <<'EOF'
# Laptop-as-server: closing the lid must not suspend the machine.
[Login]
HandleLidSwitch=ignore
HandleLidSwitchDocked=ignore
HandleLidSwitchExternalPower=ignore
IdleAction=ignore
EOF
  sudo systemctl restart systemd-logind
  ok "lid switch ignored"

  # Belt and braces: make the sleep targets unreachable entirely.
  sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null
  ok "sleep/suspend/hibernate targets masked"

  # A desktop install runs GNOME (~1 GB RAM) and its own power daemon, which
  # overrides logind. Dropping to multi-user.target removes both problems.
  if [ "$(systemctl get-default)" = "graphical.target" ]; then
    warn "Desktop session active. To reclaim ~1 GB RAM and stop GNOME overriding"
    warn "the lid setting:  sudo systemctl set-default multi-user.target && sudo reboot"
  fi

  # Optional: spare the battery, which sits at 100% on AC forever otherwise.
  local bat=/sys/class/power_supply/BAT0/charge_control_end_threshold
  if [ -w "$bat" ] || sudo test -w "$bat" 2>/dev/null; then
    echo 80 | sudo tee "$bat" >/dev/null && ok "battery charge capped at 80%"
  fi
}

# ---------------------------------------------------------------------------
# 2. Remote access
# ---------------------------------------------------------------------------
configure_ssh() {
  say "SSH server"
  sudo apt-get install -y -qq openssh-server >/dev/null
  sudo systemctl enable --now ssh >/dev/null
  ok "sshd running on port 22"

  if [ ! -s "$HOME/.ssh/authorized_keys" ]; then
    warn "No authorized_keys yet. From Git Bash on Windows, run:"
    warn "  ssh-copy-id ${USER}@$(hostname -I | awk '{print $1}')"
    warn "Do that BEFORE disabling password login."
  else
    ok "authorized_keys present ($(wc -l < "$HOME/.ssh/authorized_keys") key(s))"
    sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
EOF
    sudo systemctl reload ssh
    ok "password login disabled (key-only)"
  fi
}

# ---------------------------------------------------------------------------
# 3. Firewall
# ---------------------------------------------------------------------------
configure_firewall() {
  say "Firewall (ufw)"
  sudo apt-get install -y -qq ufw >/dev/null

  # Order matters: every allow rule goes in BEFORE enable, or enabling the
  # firewall drops the SSH session that is running this script.
  sudo ufw default deny incoming
  sudo ufw default allow outgoing

  # SSH over the tailnet is the primary route in. The LAN rule is the fallback
  # for when Tailscale itself is the broken thing -- scoped to the subnet, so
  # port 22 is still closed to everything else.
  sudo ufw allow in on tailscale0 to any port 22 proto tcp
  sudo ufw allow from "$LAN_CIDR" to any port 22 proto tcp

  # k3s: pod and service networks must be exempt or CoreDNS and pod-to-pod
  # traffic fail in ways that look like application bugs, not firewall drops.
  sudo ufw allow from 10.42.0.0/16 to any   # pod CIDR
  sudo ufw allow from 10.43.0.0/16 to any   # service CIDR

  # kubectl from Windows. Tailnet only -- never expose the API server to the LAN.
  sudo ufw allow in on tailscale0 to any port 6443 proto tcp

  # The image registry has no TLS and no auth. Tailnet and loopback only.
  sudo ufw allow in on tailscale0 to any port 5000 proto tcp

  # Ingress (Traefik) over the tailnet, for reaching the app from Windows.
  sudo ufw allow in on tailscale0 to any port 80 proto tcp

  sudo ufw --force enable

  # Reminder, because it bites everyone once: ufw does NOT filter published
  # Docker ports. Docker inserts its DNAT rules into the FORWARD chain, which
  # never traverses INPUT where these rules live. `-p 5000:5000` is reachable
  # from the LAN despite the rule above. Bind to 127.0.0.1 to actually close it.
  sudo ufw status verbose
}

# ---------------------------------------------------------------------------
# 4. Docker + swap (mirrors deploy/cloud-init.yml)
# ---------------------------------------------------------------------------
configure_docker() {
  say "Docker Engine"
  if command -v docker >/dev/null; then
    ok "already installed: $(docker --version)"
  else
    curl -fsSL https://get.docker.com | sudo sh
    ok "installed $(docker --version)"
  fi

  if ! id -nG "$USER" | grep -qw docker; then
    sudo usermod -aG docker "$USER"
    warn "added $USER to the docker group -- log out and back in for it to apply"
  else
    ok "$USER is in the docker group"
  fi
  sudo systemctl enable --now docker >/dev/null
  ok "docker enabled at boot"
}

configure_swap() {
  say "Swap (want at least ${SWAP_GB} GB)"
  # Check total swap from any source -- a partition, zram, or an existing swapfile.
  # Looking only for /swapfile would miss an installer-created swap partition and
  # pointlessly stack a second swap area on top of it.
  local have_kb want_kb
  have_kb=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)
  want_kb=$((SWAP_GB * 1024 * 1024))

  if [ "$have_kb" -ge "$want_kb" ]; then
    ok "$(numfmt --to=iec $((have_kb * 1024))) of swap already active -- nothing to create"
    swapon --show
  elif swapon --show | grep -q '^/swapfile'; then
    ok "/swapfile already active ($(swapon --show=SIZE --noheadings --bytes /swapfile | numfmt --to=iec))"
  else
    sudo fallocate -l "${SWAP_GB}G" /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
    sudo swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    ok "created and enabled /swapfile"
  fi
  # Swap is insurance against the JVM startup spike, not a place to live.
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
  sudo sysctl -q -p /etc/sysctl.d/99-swappiness.conf
  ok "vm.swappiness=10"
}

# ---------------------------------------------------------------------------
# 5. Housekeeping
# ---------------------------------------------------------------------------
configure_maintenance() {
  say "Unattended security updates"
  sudo apt-get install -y -qq unattended-upgrades >/dev/null
  sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  # No automatic reboots: this box wakes up into a passphrase prompt or a
  # half-started compose stack if it reboots while you are not looking.
  sudo sed -i 's|^//\?Unattended-Upgrade::Automatic-Reboot .*|Unattended-Upgrade::Automatic-Reboot "false";|' \
    /etc/apt/apt.conf.d/50unattended-upgrades
  ok "security updates on, auto-reboot off"

  say "Hostname"
  if [ "$(hostname)" != "$HOSTNAME_NEW" ]; then
    sudo hostnamectl set-hostname "$HOSTNAME_NEW"
    ok "hostname -> $HOSTNAME_NEW (reachable as ${HOSTNAME_NEW}.local via mDNS)"
  else
    ok "hostname already $HOSTNAME_NEW"
  fi
}

main() {
  preflight
  sudo apt-get update -qq
  configure_power
  configure_ssh
  configure_firewall
  configure_docker
  configure_swap
  configure_maintenance

  say "Done"
  echo "   Next: choose an exposure strategy (Tailscale / Cloudflare Tunnel / port-forward)"
  echo "   -> docs/DEPLOY-HOMELAB.md §5"
}

main "$@"
