# Netflix Eureka in TeacherSupporter — A Guided Tour

> Study notes on service discovery: what problem Eureka solves, how it is configured in this codebase, and evidence for each claim.

## 1. The Problem Eureka Solves

In a microservices system, services need to call each other — but **where is each service?** IPs and ports change (containers restart, instances scale up/down). Hardcoding `http://localhost:8083` everywhere is brittle.

**Eureka is a service registry — a "phone book" for your services:**

- Each service **registers itself** on startup ("I am `course-service`, reachable at host X port Y")
- Each service **fetches the registry** to look up others **by name** instead of by address
- Eureka removes instances that stop sending heartbeats, so dead instances stop receiving traffic

This repo's own design doc says exactly this (`docs/PLAN-B-microservices.md:22`):

> **Solution: Service Discovery** (Eureka) — each service registers itself on startup. Others look up by name, not address. Gateway also uses Eureka to route dynamically.

## 2. The Server Side: `discovery-server`

There are two roles in Eureka: **one server** (the registry) and **many clients** (everyone else). The registry is the `discovery-server` module.

**Evidence A — the dependency** (`discovery-server/pom.xml:18`):

```xml
<artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
```

Note it's `-server`, while every other module has `-client`.

**Evidence B — one annotation turns the app into a registry** (`discovery-server/src/main/java/com/ts/discovery/DiscoveryServerApplication.java:8`):

```java
@SpringBootApplication
@EnableEurekaServer          // ← this is the entire "implementation"
public class DiscoveryServerApplication {
```

That's all the code there is. Eureka server is infrastructure you *configure*, not code you write.

**Evidence C — the server config** (`discovery-server/src/main/resources/application.yml`):

```yaml
server:
  port: 8761                      # conventional Eureka port
eureka:
  client:
    register-with-eureka: false   # ← don't register with yourself
    fetch-registry: false         # ← don't download the registry from yourself
```

This is the classic standalone-Eureka setup. Subtle but important: **every Eureka server is also a Eureka client by default** (because in production you'd run multiple Eureka servers that register with *each other* for HA). Since this project runs a single instance, both client behaviors are switched off — otherwise it would log errors trying to register with itself.

It also ships a web dashboard at `http://localhost:8761` where you can see every registered instance.

## 3. The Client Side: Every Other Service

**Evidence A — the client dependency** in all 5 services, e.g. `course-service/pom.xml:55`, `api-gateway/pom.xml:27`, `auth-service/pom.xml:43`:

```xml
<artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
```

With this on the classpath, **registration is automatic** — no annotation needed. On startup the service POSTs itself to Eureka and starts heartbeating (every 30s by default).

**Evidence B — where to find Eureka** (`course-service/src/main/resources/application.yml:6-9`):

```yaml
eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/   # ← address of the registry
```

**Evidence C — what name to register under** (same file, lines 2-3):

```yaml
spring:
  application:
    name: course-service       # ← this becomes the lookup key in Eureka
```

This name is the *only* address anyone else needs to know.

## 4. Purpose in Action #1: The Gateway Routes via Eureka

**Evidence** — `config-server/src/main/resources/configurations/api-gateway.yml:21-24`:

```yaml
- id: course-service-courses
  uri: lb://course-service        # ← NOT http://localhost:8083
  predicates:
    - Path=/api/courses/**
```

The `lb://` scheme means **"load-balanced lookup through the discovery client"**. When a request hits `/api/courses/**`:

1. Gateway asks its local copy of the Eureka registry: "instances of `course-service`?"
2. Eureka returns e.g. `[192.168.1.5:8083]` (or several, if scaled)
3. Spring Cloud LoadBalancer picks one (round-robin) and forwards the request

If you ran two copies of course-service, the gateway would alternate between them **with zero config changes** — that's the payoff.

## 5. Purpose in Action #2: Service-to-Service Calls (Feign)

**Evidence** — `course-service/src/main/java/com/ts/course/client/AuthServiceClient.java:8`:

```java
@FeignClient(name = "auth-service", fallback = AuthServiceFallback.class)
```

`name = "auth-service"` is a **Eureka lookup, not a URL**. course-service never knows auth-service's host/port — Feign resolves the name through the registry at call time. The README documents this flow (`README.md:539`):

| Caller | Callee | Call | How |
|---|---|---|---|
| course-service | auth-service | `GET /users/{id}` | OpenFeign (via Eureka) |

## 6. Deep Dive: OpenFeign — and How It Relates to Eureka

OpenFeign and Eureka are two different tools that **work together**:

- **Eureka** answers *"WHERE is auth-service?"* (discovery)
- **OpenFeign** answers *"HOW do I call it?"* (HTTP client)

### What OpenFeign is

"Inter-service" means one of our services calling another over HTTP (course-service → auth-service), as opposed to a browser calling the gateway. Without Feign, that call is manual boilerplate:

```java
// the manual way — repeated for every call
UserDto user = restClient.get()
        .uri("http://auth-service/users/{id}", id)
        .retrieve()
        .body(UserDto.class);
```

OpenFeign is a **declarative** HTTP client: you write only an interface describing the remote API, and Spring generates the implementation at runtime.

**Evidence** — `course-service/src/main/java/com/ts/course/client/AuthServiceClient.java:8-12`:

```java
@FeignClient(name = "auth-service", fallback = AuthServiceFallback.class)
public interface AuthServiceClient {

    @GetMapping("/users/{id}")                   // ← same annotations as a controller,
    UserDto getUserById(@PathVariable Long id);  //   but describing a REMOTE endpoint
}
```

There is **no implementation class** for this interface (the only class implementing it is the fallback). It's enabled by `@EnableFeignClients` on `CourseServiceApplication.java:9`, which scans for `@FeignClient` interfaces and creates proxy beans. You then inject the interface and call `authServiceClient.getUserById(5L)` like a local method — Feign turns it into an HTTP request and handles JSON (de)serialization invisibly.

### Where Eureka comes in

Note what's **missing** from the annotation: a URL. `name = "auth-service"` is a logical name — this is the Eureka connection. When the method is called:

```
authServiceClient.getUserById(5L)
        │
        ▼
1. Feign proxy builds the request:  GET http://auth-service/users/5
        │                                       ▲ not a real hostname!
        ▼
2. Spring Cloud LoadBalancer intercepts "auth-service"
        │
        ▼
3. Asks the (locally cached) Eureka registry: instances of "auth-service"?
   → [172.18.0.4:8081]
        │
        ▼
4. Rewrites to  GET http://172.18.0.4:8081/users/5  and sends it
```

So the chain is: **Feign (declares the call) → LoadBalancer (picks an instance) → Eureka (supplies the instance list)**.

The name must match what the target registered under — `auth-service/src/main/resources/application.yml` sets `spring.application.name: auth-service`, exactly the string in `@FeignClient(name = "auth-service")`.

### Are they inseparable? No

- **Feign without Eureka** works: `@FeignClient(name = "auth", url = "http://localhost:8081")` — fixed address, no discovery. Useful for calling external third-party APIs.
- **Eureka without Feign** works: api-gateway uses Eureka via `lb://course-service` routes but has no Feign clients at all.

They just compose well, which is why the classic Spring Cloud stack uses both.

### The `fallback` — circuit breaking

**Evidence** — `course-service/src/main/java/com/ts/course/client/AuthServiceFallback.java:7-12`:

```java
@Component
public class AuthServiceFallback implements AuthServiceClient {
    @Override
    public UserDto getUserById(Long id) {
        return null;
    }
}
```

If auth-service is down or times out, instead of the exception propagating, Feign invokes the fallback — which returns `null`, meaning "degrade gracefully, course-service keeps working without user details" (Resilience4j circuit breaker).

> **Status note (as of writing):** `AuthServiceClient` is declared but **never injected anywhere** in course-service — no service class calls it yet. The wiring is in place (per `README.md:539` it's intended for `GET /users/{id}`), but the actual usage hasn't been written.

## 7. Purpose in Action #3: Environment Portability

**Evidence** — `docker-compose.yml:137` (and 4 more like it):

```yaml
EUREKA_CLIENT_SERVICEURL_DEFAULTZONE: http://discovery-server:8761/eureka/
```

Locally the yml says `localhost:8761`; in Docker, the env var overrides it to the compose service name `discovery-server` (Spring Boot maps `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE` → `eureka.client.service-url.defaultZone`). Only this one pointer changes per environment — all the `lb://course-service` and `@FeignClient("auth-service")` references stay identical everywhere, because names resolve through whatever registry the service is pointed at.

## 8. Mental Model Summary

```
                ┌──────────────────────────────┐
                │   discovery-server :8761     │
                │   (@EnableEurekaServer)      │
                │  ┌────────────────────────┐  │
   register ───▶│  │ auth-service    → :8081│  │◀─── register
   + heartbeat  │  │ course-service  → :8083│  │     + heartbeat
                │  │ dictionary-svc  → :8084│  │
                │  └────────────────────────┘  │
                └─────────▲────────────────────┘
                          │ fetch registry (cached locally)
                ┌─────────┴─────────┐
                │ api-gateway :8080 │── lb://course-service ──▶ actual IP:port
                │ course-service    │── @FeignClient("auth-service") ──▶ actual IP:port
                └───────────────────┘
```

Three things worth knowing that the config *doesn't* show (defaults):

- **Clients cache the registry locally** (refreshed every 30s) — calls don't go through Eureka, so it's not a single point of failure for traffic; if Eureka dies, services keep calling each other using cached addresses.
- **Heartbeats every 30s**; instances missing heartbeats get evicted (~90s) — health/heartbeat (backed by Spring Boot Actuator) is how the registry stays truthful.
- **It's AP, not CP** (availability over consistency) — the registry may briefly serve stale entries rather than refuse to answer.

## 9. Hands-On Exercise

1. Start the stack and open the Eureka dashboard at `http://localhost:8761`
2. Watch services appear in the **Instances currently registered with Eureka** table as they start
3. Kill one service and watch it get evicted from the registry about a minute later
4. Scale a service to 2 instances and watch the gateway round-robin between them
5. **Feign exercise:** inject `AuthServiceClient` into a course-service class and call it, then stop auth-service and watch the fallback kick in (returns `null` instead of throwing)
