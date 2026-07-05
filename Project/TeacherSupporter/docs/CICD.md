# CI/CD for TeacherSupporter — a from-scratch guide

> Audience: you — a backend Java/Spring dev who has **not** used CI/CD before.
> Everything here is grounded in *this* repo (multi-module Maven, 7 Spring services,
> a Vite/React frontend, Docker, `docker-compose.yml`). Read top to bottom; the
> last section is a checklist for when you come back to actually do it.

---

## 1. The core idea in one paragraph

CI/CD is just **a robot that runs commands for you every time you push code**.
The commands are the same ones you already run by hand (`mvn verify`, `npm run build`,
`docker build`). The value is that they run *automatically*, *on a clean machine*,
*on every push and pull request* — so "it compiles on my laptop" becomes "it compiles
for everyone, provably." That's the whole thing. The rest is detail.

The pipeline, as a mental model:

```
push code  →  build  →  test  →  package (docker image)  →  deploy
            └─────────── CI ──────────┘ └────── CD (delivery) ──┘ └ CD (deployment)
```

- **CI = Continuous Integration** — build + test on every push. *Use this always.*
- **CD = Continuous Delivery** — also build a deployable artifact (Docker image), ready to ship.
- **CD = Continuous Deployment** — also push it to a running environment automatically.

Most teams (and portfolios) get the most value from **CI alone**. Add the rest later.

---

## 2. The tool: GitHub Actions

Your repo is on GitHub, so we use **GitHub Actions**. It's the most common CI tool in
job listings, free for public repos, and configured with YAML files committed to your repo.

Vocabulary (you'll see these words everywhere):

| Term | Meaning | In this repo |
|------|---------|--------------|
| **Workflow** | One YAML file in `.github/workflows/` | `ci.yml` |
| **Event / trigger** | What starts a workflow | `push`, `pull_request` |
| **Job** | A set of steps on one fresh VM | `backend`, `frontend` |
| **Runner** | The VM that executes a job | `ubuntu-latest` (GitHub-hosted) |
| **Step** | One command or pre-built action | `mvn verify` |
| **Action** | A reusable step someone published | `actions/checkout@v4` |
| **Secret** | An encrypted value (passwords, keys) | `JWT_SECRET`, `GOOGLE_CLIENT_ID` |

Key fact: **each job starts on a brand-new, empty Linux machine.** Nothing from your
laptop is there. You must install the JDK, check out the code, and download dependencies
every run. That's why "works on my machine" bugs get caught — the runner has none of
your local state.

---

## 3. Applying it to *this* project — start here

### 3.1 The minimum useful pipeline (CI)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  # ---- Backend: the whole Maven reactor (common + all services) ----
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '25'      # matches <java.version> in the parent pom
          cache: maven            # caches ~/.m2, so later runs are much faster
      - name: Build & test all modules
        run: mvn -B verify        # -B = batch mode (no progress spinner noise)

  # ---- Frontend: typecheck + production build ----
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci               # clean install from package-lock.json
      - run: npx tsc --noEmit     # typecheck only
      - run: npm run build        # ensure the production bundle compiles
```

Commit it, push, and open the **Actions** tab on GitHub. You'll see the two jobs run
in parallel with green ✓ / red ✗. On a pull request, GitHub shows the status inline and
you can require it to pass before merging (Settings → Branches → branch protection).

**Why these exact commands?**
- `mvn -B verify` compiles every module *and* runs tests. Because `common` is a shared
  dependency, this is exactly what catches "I changed a DTO and broke two services."
- `npm ci` (not `npm install`) installs the *locked* versions — reproducible builds.
- `tsc --noEmit` is the check I ran for you earlier; `npm run build` proves Vite can bundle.

### 3.2 A wrinkle specific to your repo right now

Today you have **no integration tests that need Postgres/Kafka/MinIO**, so `mvn verify`
passes on a bare runner. Good — start with the file above as-is.

The moment you add a real `@SpringBootTest` that loads the full application context, it
will try to connect to a database and **fail in CI** (the runner has no Postgres). You
have two standard ways to fix that — see §4.

There's also a **leftover `ts/` module** (`com.example.ts`) from the initial commit with
a default context-load test. If that test ever starts failing in CI, either delete the
stale module or exclude it — it's not part of the real system.

---

## 4. When your tests need infrastructure (Postgres, Kafka, MinIO)

This is the #1 thing that confuses people new to CI. Two approaches:

### Option A — Testcontainers (recommended, the modern standard)

Your test boots a *real* Postgres/Kafka in a throwaway Docker container, automatically,
from Java. Add the dependency, annotate the test, done. The GitHub runner already has
Docker installed, so **no workflow changes are needed** — `mvn verify` just works.

```java
@SpringBootTest
@Testcontainers
class CourseServiceIT {
    @Container
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:17");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", db::getJdbcUrl);
        r.add("spring.datasource.username", db::getUsername);
        r.add("spring.datasource.password", db::getPassword);
    }
    // ... your test
}
```

This is **the job-market-relevant skill** — Testcontainers is what most Spring shops use.

### Option B — Service containers (GitHub-native)

GitHub can start a Postgres alongside your job. Simpler to grasp, less flexible:

```yaml
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: ts_course
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: root
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 10s
          --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '25', cache: maven }
      - run: mvn -B verify
```

**Recommendation:** use Testcontainers (Option A). It keeps the infra definition next to
the test, works identically on your laptop and in CI, and is the thing interviewers ask about.

---

## 5. Continuous Delivery — building & pushing Docker images

Once CI is green, the next rung is producing deployable artifacts. You already have a
`Dockerfile` per service, so this is mostly wiring. Push images to **GitHub Container
Registry (ghcr.io)** — free and tied to your repo.

Add a second workflow, `.github/workflows/release.yml`, that runs only on `main`:

```yaml
name: Release images

on:
  push:
    branches: [main]

jobs:
  images:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write            # needed to push to ghcr.io
    strategy:
      matrix:                    # build all services with one job definition
        service:
          - api-gateway
          - auth-service
          - course-service
          - dictionary-service
          - notification-service
          - config-server
          - discovery-server
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # auto-provided, no setup
      - uses: docker/build-push-action@v6
        with:
          context: ./${{ matrix.service }}
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/${{ matrix.service }}:latest
```

> Note: your services build with Maven, and most likely each `Dockerfile` expects a
> pre-built JAR or does a multi-stage Maven build. If a `Dockerfile` assumes the JAR
> already exists, you'll either make it multi-stage (build inside Docker) or run
> `mvn package` before `docker build`. Check one `Dockerfile` when you get to this step.

The `matrix` feature is worth understanding: it runs the *same* job once per list entry,
in parallel — perfect for a microservices repo where every service builds the same way.

---

## 6. Continuous Deployment — actually running it somewhere

This is the hardest and most optional step, because it needs a **target environment**
and **real secrets**. The progression, easiest → hardest:

1. **Manual pull** — on any server with Docker, point a `docker-compose.yml` at the
   `ghcr.io/...:latest` images instead of `build:` blocks, then `docker compose pull && up -d`.
2. **SSH deploy from CI** — a workflow step SSHes into a VPS and runs the above. Uses an
   SSH key stored as a GitHub secret.
3. **Managed platform** — Kubernetes, AWS ECS, Render, Railway, Fly.io, etc. Bigger topic.

For a portfolio, stopping at **§5 (delivery)** is completely respectable. If you want one
deployment story to show, a single cheap VPS + option 1 or 2 is the least effort.

---

## 7. Secrets — never commit passwords

Your app already reads sensitive values from the environment, with dev defaults:

- `JWT_SECRET` (auth-service, api-gateway)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth2 login)
- MinIO / DB credentials

In CI/CD these go in **GitHub → Settings → Secrets and variables → Actions**, then are
referenced as `${{ secrets.JWT_SECRET }}`. Rules:

- Secrets are **encrypted** and **masked** in logs (printing one shows `***`).
- The `GITHUB_TOKEN` used for ghcr.io in §5 is **auto-created per run** — you don't set it up.
- For *building and testing*, you rarely need the real secrets (the dev defaults in the
  config are fine). You need them only for *deployment*.

---

## 8. Common beginner gotchas (save yourself the debugging)

- **"It worked locally."** The runner is empty. If a step depends on a tool, install it
  explicitly in the workflow.
- **Slow builds.** Always set `cache: maven` / `cache: npm`. First run is slow; later runs reuse `~/.m2`.
- **Flaky context-load tests.** A bare `@SpringBootTest` tries to reach a DB. Either give
  it Testcontainers (§4) or don't load the full context in unit tests.
- **Frontend path.** The frontend lives in `frontend/`, so set `working-directory` (done in §3.1).
- **Java version mismatch.** The runner must use Java 25 to match `<java.version>`; `setup-java` handles it.
- **`npm ci` needs a lockfile.** You have `frontend/package-lock.json` committed — good. Keep it in git.

---

## 9. Your checklist for when you come back

Do these in order; stop whenever you've got enough for now.

- [ ] **Step 1 (CI):** create `.github/workflows/ci.yml` from §3.1, push, watch the Actions tab go green.
- [ ] Turn on branch protection for `main` so the CI check is required before merge.
- [ ] **Step 2 (real tests):** add one Testcontainers integration test (§4 Option A) for, say, `course-service`, and confirm CI still passes.
- [ ] **Step 3 (delivery):** add `.github/workflows/release.yml` from §5; check one `Dockerfile` to confirm how the JAR is built; watch images appear under the repo's *Packages*.
- [ ] **Step 4 (optional, deploy):** pick a target (cheap VPS is simplest) and wire up §6.
- [ ] Add the secrets from §7 to GitHub when you reach the deploy step.

When you're ready, I can scaffold any of these files tuned to your exact `Dockerfile`s and
modules — just say which step.

---

## 10. One-line summary to remember

> **CI/CD is automation that runs your build, tests, and packaging on every push.**
> Start with `mvn verify` + `npm run build` in a GitHub Actions file. Everything else is an extension of that.
