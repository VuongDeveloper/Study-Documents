# Jenkins controller for ts-server, with the build toolchain baked in.
#
# Homelab compromise, stated openly: builds run ON the controller (2 executors),
# not on agent pods. On a 2-core box, agent pods would cost more CPU than they
# save. Migrating to the Kubernetes plugin is a later, self-contained exercise.
#
#   docker build -t ts-jenkins:1 deploy/jenkins
#   see run.sh for the docker run line
FROM jenkins/jenkins:lts-jdk21

USER root

# --- JDK 25 (Temurin) -- the project targets Java 25 ------------------------
RUN apt-get update && apt-get install -y --no-install-recommends wget gpg apt-transport-https \
 && wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(. /etc/os-release && echo $VERSION_CODENAME) main" \
      > /etc/apt/sources.list.d/adoptium.list \
 && apt-get update && apt-get install -y --no-install-recommends temurin-25-jdk \
 && rm -rf /var/lib/apt/lists/*

# --- Maven 3.9 (Debian's apt maven is 3.8, too old for some plugins) --------
ARG MAVEN_VERSION=3.9.9
RUN wget -qO /tmp/mvn.tgz https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz \
 && tar -xzf /tmp/mvn.tgz -C /opt && ln -s /opt/apache-maven-${MAVEN_VERSION} /opt/maven \
 && rm /tmp/mvn.tgz

# --- kubectl: the deploy stage talks to k3s with this ------------------------
RUN wget -qO /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/$(wget -qO- https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl

# Jenkins itself keeps running on the bundled JDK 21; only *builds* see JDK 25.
# JAVA_HOME is therefore NOT changed here -- the Jenkinsfile sets it per stage.
ENV MAVEN_HOME=/opt/maven \
    JDK25_HOME=/usr/lib/jvm/temurin-25-jdk-amd64 \
    PATH=/opt/maven/bin:${PATH}

USER jenkins

# Plugins pre-installed so the first boot needs no wizard clicks beyond unlock.
RUN jenkins-plugin-cli --plugins \
      git workflow-aggregator pipeline-stage-view junit timestamper credentials-binding
