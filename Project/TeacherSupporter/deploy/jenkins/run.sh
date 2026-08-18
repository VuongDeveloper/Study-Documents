#!/usr/bin/env bash
# Build and (re)start the Jenkins controller on ts-server. Idempotent.
#   ./deploy/jenkins/run.sh
set -euo pipefail
cd "$(dirname "$0")"

docker build -t ts-jenkins:1 .

docker rm -f jenkins 2>/dev/null || true

# --network host: Jenkins sees the registry at localhost:5000 and the k3s API at
#   127.0.0.1:6443 exactly as the host does. No port mapping, no DNS games.
#   Jenkins UI is therefore on the host's :8080 -- reachable over Tailscale/LAN,
#   and blocked from the internet by CGNAT + ufw like everything else.
# jenkins_home volume: jobs, credentials, build history survive image rebuilds.
# --memory 2g: matches the resource budget in docs/STACK-K3S-JENKINS.md §5.
docker run -d --name jenkins --restart=unless-stopped \
  --network host \
  --memory 2g \
  -e JAVA_OPTS="-Xmx1g" \
  -v jenkins_home:/var/jenkins_home \
  ts-jenkins:1

echo "Jenkins starting. Initial admin password:"
echo "  docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword"
echo "UI: http://ts-server:8080  (over Tailscale)"
