# API Gateway — How It Works

The `api-gateway` module is the **single entry point** for all client traffic. It is built on
**Spring Cloud Gateway** (reactive/WebFlux) and has four jobs:

1. **Route** requests to the right microservice (discovered via Eureka, client-side load-balanced).
2. **Authenticate** every non-public request by validating the JWT.
3. **Translate** the validated JWT into trusted `X-User-Id` / `X-User-Role` headers for downstream services.
4. **Handle CORS** centrally so individual services never need to.

Every claim below is backed by a file/line reference from this repository.

---

## 1. The gateway is a reactive Spring Cloud Gateway app on port 8080

**Evidence:**

- `api-gateway/pom.xml:19-22` — the module depends on `spring-cloud-starter-gateway`
  (the reactive gateway starter; the pom's own description at line 15 reads
  *"Spring Cloud Gateway - routing, CORS, and JWT authentication filter"*).
- `api-gateway/src/main/resources/application.yml:6-7` — explicitly forces the reactive stack:

  ```yaml
  main:
    web-application-type: reactive
  ```

- `config-server/src/main/resources/configurations/api-gateway.yml:1-2` — `server.port: 8080`.
- `docker-compose.yml:126-132` — the `api-gateway` container maps `8080:8080`
  (plus `5080` for remote debugging), making it the only business port exposed to clients.

The main class is a plain Spring Boot launcher with no extra annotations
(`api-gateway/src/main/java/com/ts/gateway/ApiGatewayApplication.java:6-12`) — all gateway
behavior comes from the starter dependency plus configuration.

---

## 2. Routes live in the Config Server, not in the gateway module

The gateway module contains **no route definitions**. At startup it pulls its configuration
from the Config Server, which serves the route table.

**Evidence:**

- `api-gateway/src/main/resources/application.yml:4-5`:

  ```yaml
  config:
    import: optional:configserver:http://localhost:8888
  ```

- `api-gateway/src/main/java/com/ts/gateway/config/RouteConfig.java:5-11` — the class is an
  intentionally empty placeholder with the comment:
  *"Route definitions are managed externally via the Config Server (api-gateway.yml)."*
- The actual route table: `config-server/src/main/resources/configurations/api-gateway.yml:3-56`
  under `spring.cloud.gateway.routes`.

This means routes can be changed without rebuilding the gateway jar — only the config-server
content (and a gateway restart/refresh) is needed.

---

## 3. Routing model: Path predicate → `lb://` service URI → `StripPrefix`

Each route follows the same pattern (`config-server/.../api-gateway.yml:6-56`):

```yaml
- id: course-service-courses
  uri: lb://course-service          # ← Eureka lookup + client-side load balancing
  predicates:
    - Path=/api/courses/**          # ← which incoming URLs match
  filters:
    - StripPrefix=2                 # ← remove the first 2 path segments before forwarding
```

### Route table summary

| Route id | Predicate | Target | StripPrefix |
|---|---|---|---|
| `auth-service` | `/api/auth/**` | `lb://auth-service` | 2 |
| `auth-oauth2` | `/oauth2/**` | `lb://auth-service` | — |
| `auth-oauth2-callback` | `/login/oauth2/**` | `lb://auth-service` | — |
| `course-service-courses` | `/api/courses/**` | `lb://course-service` | 2 |
| `course-service-students` | `/api/students/**` | `lb://course-service` | 2 |
| `course-service-assignments` | `/api/assignments/**` | `lb://course-service` | 2 |
| `course-service-enrollments` | `/api/enrollments/**` | `lb://course-service` | 2 |
| `course-service-submissions` | `/api/submissions/**` | `lb://course-service` | 2 |
| `dictionary-service` | `/api/dictionary/**` | `lb://dictionary-service` | 2 |

### What `lb://` means

`lb://course-service` tells the gateway: *resolve the name `course-service` via the discovery
client (Eureka) and load-balance across its instances*. This works because:

- `api-gateway/pom.xml:25-28` — the gateway is a Eureka client
  (`spring-cloud-starter-netflix-eureka-client`).
- `api-gateway/src/main/resources/application.yml:8-11` — it registers with / queries
  Eureka at `http://localhost:8761/eureka/`.

See `docs/EUREKA.md` for how service registration works on the other side.

### How `StripPrefix=2` and the "doubled segment" URLs fit together

`StripPrefix=2` removes the first **two** path segments before forwarding. The downstream
controllers are mapped with their resource name as the first segment
(e.g. `@RequestMapping("/courses")` at
`course-service/src/main/java/com/ts/course/controller/CourseController.java:23`), so the
frontend intentionally **repeats** the segment:

```
Client calls:       GET /api/courses/courses/5
                        └─1──┘└──2───┘            StripPrefix=2 removes "/api/courses"
Gateway forwards:   GET /courses/5   →  course-service  →  @RequestMapping("/courses")
```

**Evidence:** `frontend/src/api/courses.ts:23` calls `` `/courses/courses/${id}` `` on an axios
client whose `baseURL` is `/api` (`frontend/src/api/client.ts:8-10`), producing
`/api/courses/courses/5`. The first `courses` selects the **route**; the second survives the
strip and matches the **controller**.

### Why the OAuth2 routes have no StripPrefix

`/oauth2/**` and `/login/oauth2/**` (`api-gateway.yml:13-20`) are Spring Security's standard
OAuth2 authorization/callback endpoints inside auth-service. Spring Security expects those
exact paths, so the gateway forwards them **unmodified** — no `StripPrefix` filter is declared.

---

## 4. A global JWT filter guards every request

`JwtAuthenticationFilter` is the security heart of the gateway. It runs for **every** request,
before routing happens.

**Evidence** (all in `api-gateway/src/main/java/com/ts/gateway/filter/JwtAuthenticationFilter.java`):

- **It's global and runs first:** line 29 — `implements GlobalFilter, Ordered`; lines 50-52 —
  `getOrder()` returns `-1`, so it executes before the standard routing filters.
- **Public whitelist:** lines 31-40 — login, register, activate, refresh, change-password,
  `/oauth2/**`, `/login/oauth2/**`, and `/actuator/**` skip authentication entirely
  (matched with an `AntPathMatcher`, lines 42, 92-94).
- **Bearer token required for everything else:** lines 62-65 — missing or malformed
  `Authorization: Bearer …` header → immediate rejection.
- **Signature verification:** lines 69-74 — the token is parsed with
  `Jwts.parser().verifyWith(signingKey)`. The key is an HMAC-SHA key built in the constructor
  (lines 45-47) from the `app.jwt.secret` property — which comes from
  `config-server/.../api-gateway.yml:57-59` (`${JWT_SECRET:…}` — overridable by env var).
  This is the **same shared secret** auth-service signs with, so the gateway can verify
  tokens without calling auth-service.
- **Failure handling:** lines 86-89 and 96-106 — any parse/expiry/signature failure returns
  `401 Unauthorized` with a small JSON body, and the request never reaches a backend service.
- **JWT library:** `api-gateway/pom.xml:42-56` — `jjwt-api` / `jjwt-impl` / `jjwt-jackson`.

---

## 5. JWT → trusted headers: downstream services never parse tokens

After validating the token, the gateway extracts the user identity and **mutates the request**,
injecting two headers before forwarding:

**Evidence:**

- `JwtAuthenticationFilter.java:76-84`:

  ```java
  String userId = claims.getSubject();
  String role   = claims.get(JwtConstants.CLAIM_ROLE, String.class);

  ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
          .header(JwtConstants.HEADER_USER_ID, userId)     // X-User-Id
          .header(JwtConstants.HEADER_USER_ROLE, role)     // X-User-Role
          .build();
  ```

- Header names are shared constants in the `common` module —
  `common/src/main/java/com/ts/common/security/JwtConstants.java:9-11`
  (`X-User-Id`, `X-User-Role`, claim name `role`).
- Downstream consumption — course-service trusts these headers and builds its Spring Security
  context from them, with **no JWT code at all**:
  `course-service/src/main/java/com/ts/course/config/GatewayHeaderAuthFilter.java:24-35` reads
  `X-User-Id` / `X-User-Role` and sets a `UsernamePasswordAuthenticationToken` with
  `ROLE_<role>` authority.

**Design consequence:** JWT verification happens in exactly **one place** (the gateway).
Services behind it assume the perimeter is trusted — which is why they must never be exposed
directly; only the gateway's port 8080 is published in `docker-compose.yml:130-132`.

---

## 6. CORS is handled centrally at the gateway

**Evidence:** `api-gateway/src/main/java/com/ts/gateway/config/CorsConfig.java:16-37` registers
a reactive `CorsWebFilter` for `/**` that:

- allows origins `http://localhost:3000` and `http://localhost:5173` (Vite dev server),
- allows GET/POST/PUT/DELETE/PATCH/OPTIONS, all headers, and credentials.

Because the browser only ever talks to the gateway, no downstream service needs its own
CORS configuration.

---

## 7. The frontend funnels everything through the gateway

**Evidence:** `frontend/src/api/client.ts`:

- line 8-10 — axios `baseURL: '/api'` → every call hits a gateway `/api/**` route.
- lines 12-18 — a request interceptor attaches `Authorization: Bearer <accessToken>` from the
  auth store, which is exactly what `JwtAuthenticationFilter` expects.
- lines 20-41 — a response interceptor catches `401`, calls `/api/auth/refresh`
  (a **public** path in the gateway whitelist, `JwtAuthenticationFilter.java:35`), and retries
  the original request with the new token.

---

## 8. Observability: tracing and metrics

**Evidence:**

- `api-gateway/pom.xml:58-72` — Actuator + `micrometer-tracing-bridge-brave` +
  `zipkin-reporter-brave`.
- `config-server/.../api-gateway.yml:60-73` — 100% trace sampling, Zipkin endpoint
  `http://localhost:9411/api/v2/spans`, actuator exposes `health,info,metrics,prometheus`,
  and the log pattern includes `traceId`/`spanId` so gateway log lines correlate with
  downstream service logs.

Note: `/actuator/**` is in the public-path whitelist (`JwtAuthenticationFilter.java:39`), so
health checks and Prometheus scraping work without a token.

---

## End-to-end request walkthrough

`GET /api/courses/courses/5` with a valid token:

```
Browser (axios, baseURL=/api, Bearer token attached)        client.ts:8-18
   │
   ▼
API Gateway :8080
   1. CorsWebFilter — origin check                          CorsConfig.java:16-37
   2. JwtAuthenticationFilter (order -1)                    JwtAuthenticationFilter.java:50-52
      • /api/courses/… not in PUBLIC_PATHS → auth required        :31-40
      • verify signature with shared HS256 secret                 :69-74
      • mutate request: +X-User-Id, +X-User-Role                  :79-84
   3. Route match: Path=/api/courses/** → lb://course-service     api-gateway.yml:21-26
   4. Eureka resolves course-service instance, StripPrefix=2
   │      /api/courses/courses/5  →  /courses/5
   ▼
course-service
   5. GatewayHeaderAuthFilter reads X-User-Id/X-User-Role   GatewayHeaderAuthFilter.java:24-35
   6. CourseController @RequestMapping("/courses")          CourseController.java:23
```

An invalid/missing token stops at step 2 with `401 {"error":"Unauthorized", …}`
(`JwtAuthenticationFilter.java:96-106`) and never touches a backend service.

---

## Key takeaways

| Concern | Where it lives | Key file |
|---|---|---|
| Route table | Config Server | `config-server/.../api-gateway.yml` |
| Service discovery | Eureka (`lb://` URIs) | `api-gateway/.../application.yml` |
| Authentication | Gateway global filter | `JwtAuthenticationFilter.java` |
| Identity propagation | `X-User-Id` / `X-User-Role` headers | `JwtConstants.java` |
| CORS | Gateway-only | `CorsConfig.java` |
| Tracing/metrics | Micrometer + Zipkin + Actuator | `api-gateway/pom.xml`, `api-gateway.yml` |
