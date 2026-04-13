# OPTION B: Microservices

> Separate Spring Boot apps per domain, each with its own database, communicating via REST (OpenFeign) and events (Apache Kafka). Managed by Spring Cloud (Gateway, Eureka, Config Server).

## Shared Context

A Spring Boot app for teachers to manage courses, students, assignments, and build custom word dictionaries. Students can also log in with read-only access. Auth supports OAuth2 (Google) + username/password + TOTP 2FA. Dictionary uses MongoDB for flexible schema.

**Tech stack:** Spring Boot 4.0.3, Java 25, Spring Cloud 2025.0.x, PostgreSQL 17, MongoDB 8, Apache Kafka, Flyway, Lombok, JWT
**Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query + Zustand

---

## Why Each Infrastructure Service Exists

### Problem 1: The frontend doesn't know where services live
In a monolith, everything is at `localhost:8080`. With 4 services on different ports, the frontend would need every URL.
**Solution: API Gateway** (Spring Cloud Gateway) — single entry point. React only talks to `localhost:8080`. Gateway routes `/api/auth/**` to auth-service, `/api/courses/**` to course-service, etc. Also validates JWT once so individual services don't each need to.

### Problem 2: Services don't know where each other lives
auth-service runs on port 8081 today, 8091 tomorrow. Hardcoding URLs is fragile.
**Solution: Service Discovery** (Eureka) — each service registers itself on startup. Others look up by name, not address. Gateway also uses Eureka to route dynamically.

### Problem 3: Configuration is scattered
4+ services each have `application.yml`. Change the DB password = update 4 files.
**Solution: Config Server** (Spring Cloud Config) — one location for all config. Each service fetches its config on startup.

### Problem 4: One service failure cascades
If notification-service is down and auth-service blocks waiting, auth-service also appears down.
**Solution: Circuit Breakers** (Resilience4j) — detect failure, fail fast, return fallback instead of hanging.

### Problem 5: Debugging across services is impossible
A request hits gateway -> auth-service -> course-service. Without correlation, logs are useless.
**Solution: Distributed Tracing** (Micrometer + Zipkin) — assigns a trace ID that follows the request through every service.

| Infrastructure | Port |
|---------------|------|
| Config Server | 8888 |
| Discovery Server (Eureka) | 8761 |
| API Gateway | 8080 |
| Zipkin | 9411 |
| Kafka | 9092 |
| Kafka UI | 9090 |

---

## Project Structure (Maven Multi-Module Mono-Repo)

```
teacher-supporter/
├── pom.xml                              # PARENT POM (packaging: pom, NOT a Spring Boot app)
├── docker-compose.yml
├── .env.example
│
├── common/                              # SHARED JAR (not runnable, NO Spring starters)
│   ├── pom.xml                          # only jackson-annotations, jakarta.validation
│   └── src/main/java/com/ts/common/
│       ├── dto/
│       │   ├── UserDto.java             # user info passed between services
│       │   ├── CourseDto.java
│       │   ├── StudentDto.java
│       │   ├── AssignmentDto.java
│       │   ├── UserRegisteredEvent.java # Kafka event payload
│       │   └── AssignmentCreatedEvent.java # Kafka event payload
│       ├── exception/
│       │   ├── ApiException.java
│       │   └── ErrorResponse.java
│       └── security/
│           └── JwtConstants.java        # shared claim names, header names
│
├── config-server/                       # PORT 8888 — starts FIRST
│   ├── pom.xml
│   ├── Dockerfile
│   ├── src/main/java/com/ts/config/
│   │   └── ConfigServerApplication.java     # @EnableConfigServer
│   └── src/main/resources/
│       ├── application.yml
│       └── configurations/                  # served to other services
│           ├── auth-service.yml
│           ├── course-service.yml
│           ├── dictionary-service.yml
│           ├── notification-service.yml
│           └── api-gateway.yml
│
├── discovery-server/                    # PORT 8761 — starts SECOND
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/java/com/ts/discovery/
│       └── DiscoveryServerApplication.java  # @EnableEurekaServer
│
├── api-gateway/                         # PORT 8080 — single entry for React
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/java/com/ts/gateway/
│       ├── ApiGatewayApplication.java
│       ├── config/
│       │   ├── RouteConfig.java             # programmatic route definitions
│       │   └── CorsConfig.java
│       └── filter/
│           └── JwtAuthenticationFilter.java # GatewayFilter: validate JWT, set X-User-Id/X-User-Role
│
├── auth-service/                        # PORT 8081 — own DB: ts_auth (PostgreSQL)
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/java/com/ts/auth/
│       ├── AuthServiceApplication.java
│       ├── config/
│       │   ├── SecurityConfig.java
│       │   ├── OAuth2Config.java
│       │   └── KafkaProducerConfig.java
│       ├── controller/
│       │   ├── AuthController.java          # login, register, refresh, 2fa
│       │   └── UserController.java          # /me, /users/{id} (Feign internal only)
│       ├── dto/
│       │   ├── LoginRequest.java
│       │   ├── LoginResponse.java
│       │   ├── RegisterRequest.java         # includes activationMethod: EMAIL|SCREEN
│       │   ├── TotpVerifyRequest.java
│       │   └── TotpSetupResponse.java
│       ├── entity/
│       │   ├── User.java
│       │   ├── Role.java                    # enum: ADMIN, TEACHER, STUDENT
│       │   └── RefreshToken.java
│       ├── repository/
│       │   ├── UserRepository.java
│       │   └── RefreshTokenRepository.java
│       ├── service/
│       │   ├── AuthService.java
│       │   ├── JwtService.java
│       │   ├── TotpService.java
│       │   └── OAuth2UserService.java
│       ├── event/
│       │   └── UserRegisteredPublisher.java # -> Kafka topic: ts.user.registered
│       └── src/main/resources/db/migration/
│           ├── V1__create_users.sql
│           └── V2__create_refresh_tokens.sql
│
├── course-service/                      # PORT 8082 — own DB: ts_course (PostgreSQL)
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/java/com/ts/course/
│       ├── CourseServiceApplication.java
│       ├── config/
│       │   ├── SecurityConfig.java          # reads X-User-Id/X-User-Role from gateway headers
│       │   └── KafkaProducerConfig.java
│       ├── controller/
│       │   ├── CourseController.java
│       │   ├── StudentController.java
│       │   ├── AssignmentController.java
│       │   └── EnrollmentController.java
│       ├── entity/
│       │   ├── Course.java                  # + teacherUserId field
│       │   ├── Student.java                 # + userId field (links to auth User, NOT a FK)
│       │   ├── Assignment.java
│       │   └── Enrollment.java              # replaces join table, adds metadata
│       ├── repository/
│       │   ├── CourseRepository.java
│       │   ├── StudentRepository.java
│       │   ├── AssignmentRepository.java
│       │   └── EnrollmentRepository.java
│       ├── service/
│       │   ├── CourseService.java
│       │   ├── StudentService.java
│       │   ├── AssignmentService.java
│       │   └── EnrollmentService.java
│       ├── client/
│       │   └── AuthServiceClient.java       # OpenFeign -> auth-service /users/{id}
│       ├── event/
│       │   └── AssignmentCreatedPublisher.java # -> Kafka topic: ts.assignment.created
│       └── src/main/resources/db/migration/
│           └── V1__create_course_tables.sql
│
├── dictionary-service/                  # PORT 8083 — own DB: ts_dictionary (MongoDB)
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/java/com/ts/dictionary/
│       ├── DictionaryServiceApplication.java
│       ├── config/
│       │   ├── SecurityConfig.java
│       │   └── MongoIndexConfig.java
│       ├── controller/
│       │   └── DictionaryController.java
│       ├── document/
│       │   ├── WordDefinition.java          # @Document — each word defined ONCE
│       │   └── WordLink.java                # @Document — parent→child graph edges
│       ├── dto/
│       │   ├── WordDefinitionRequest.java
│       │   ├── WordDefinitionResponse.java
│       │   ├── WordLinkRequest.java         # { parentWordId, childWordId }
│       │   └── WordGraphResponse.java       # recursive graph node for UI
│       ├── repository/
│       │   ├── WordDefinitionRepository.java
│       │   └── WordLinkRepository.java
│       └── service/
│           └── DictionaryService.java       # includes cycle detection
│
├── notification-service/                # PORT 8084 — NO database, event-driven
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/java/com/ts/notification/
│       ├── NotificationServiceApplication.java
│       ├── config/
│       │   └── KafkaConsumerConfig.java
│       ├── listener/
│       │   ├── UserRegisteredListener.java      # @KafkaListener(topics = "ts.user.registered")
│       │   └── AssignmentCreatedListener.java   # @KafkaListener(topics = "ts.assignment.created")
│       ├── service/
│       │   └── EmailService.java
│       └── src/main/resources/templates/
│           ├── activation-email.html
│           └── assignment-notification.html
│
└── frontend/                            # React SPA (not a Maven module)
    └── (see shared frontend section in COMPARISON.md)
```

---

## Parent POM Structure

```xml
<groupId>com.ts</groupId>
<artifactId>teacher-supporter</artifactId>
<version>1.0.0-SNAPSHOT</version>
<packaging>pom</packaging>

<modules>
    <module>common</module>
    <module>config-server</module>
    <module>discovery-server</module>
    <module>api-gateway</module>
    <module>auth-service</module>
    <module>course-service</module>
    <module>dictionary-service</module>
    <module>notification-service</module>
</modules>

<properties>
    <java.version>25</java.version>
    <spring-boot.version>4.0.3</spring-boot.version>
    <spring-cloud.version>2025.0.0</spring-cloud.version>
</properties>

<dependencyManagement>
    <!-- Spring Boot BOM -->
    spring-boot-dependencies (4.0.3) — type: pom, scope: import
    <!-- Spring Cloud BOM -->
    spring-cloud-dependencies (2025.0.0) — type: pom, scope: import
    <!-- Internal shared module -->
    com.ts:common (${project.version})
</dependencyManagement>
```

Key rule: `common` module has NO Spring Boot starters — it's a plain Java JAR.

---

## Database Per Service

### auth-service -> `ts_auth` (PostgreSQL, port 5433)

```sql
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),           -- null for OAuth2-only users
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    role            VARCHAR(20) NOT NULL,   -- TEACHER, STUDENT, ADMIN
    provider        VARCHAR(20) DEFAULT 'LOCAL',
    provider_id     VARCHAR(255),
    totp_secret     VARCHAR(255),
    totp_enabled    BOOLEAN DEFAULT FALSE,
    activated       BOOLEAN DEFAULT FALSE,
    activation_code VARCHAR(64),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

### course-service -> `ts_course` (PostgreSQL, port 5434)

```sql
CREATE TABLE student (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL UNIQUE,    -- references auth User.id (NOT a FK — cross-service)
    first_name VARCHAR(255),
    last_name  VARCHAR(255),
    email      VARCHAR(255),
    phone      VARCHAR(255)
);

CREATE TABLE course (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) DEFAULT 'DRAFT',
    teacher_user_id BIGINT NOT NULL,       -- references auth User.id (NOT a FK)
    start_date      DATE,
    end_date        DATE,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE enrollment (
    id          BIGSERIAL PRIMARY KEY,
    course_id   BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    student_id  BIGINT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT NOW(),
    status      VARCHAR(50) DEFAULT 'ACTIVE',
    UNIQUE(course_id, student_id)
);

CREATE TABLE assignment (
    id           BIGSERIAL PRIMARY KEY,
    course_id    BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    status       VARCHAR(50) DEFAULT 'DRAFT',
    document_url VARCHAR(500),
    start_date   DATE,
    due_date     DATE,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

### dictionary-service -> `ts_dictionary` (MongoDB, port 27017) — Graph Model

**Every word is defined ONCE. A word can appear under multiple parents (graph, not tree). Any word can have its own definition AND be a parent of other words.**

```java
// Collection: word_definitions — each word exists exactly once
@Document(collection = "word_definitions")
public class WordDefinition {
    @Id private String id;
    private String word;
    private String createdByUserId;       // teacher's auth User.id
    private String meaning;
    private String usage;
    private String notes;
    private List<String> examples;
    private List<String> tags;
    private Map<String, Object> extra;    // flexible schema catch-all
    private Instant createdAt;
    private Instant updatedAt;
}

// Collection: word_links — directed graph edges (parent → child)
@Document(collection = "word_links")
public class WordLink {
    @Id private String id;
    private String parentWordId;          // references WordDefinition.id
    private String childWordId;           // references WordDefinition.id
    private int position;                 // ordering within parent
    private String createdByUserId;
}
// Indexes: { parentWordId: 1, position: 1 }, { childWordId: 1 }
// Unique compound: { parentWordId: 1, childWordId: 1 }
```

**Key rules:** Root = no incoming links. Has children = has outgoing links. No isCategory flag. Cycle detection on link creation.

---

## Gateway Routing

```yaml
spring.cloud.gateway.routes:
  - id: auth-service
    uri: lb://auth-service              # lb:// = load-balanced via Eureka
    predicates: Path=/api/auth/**
    filters: StripPrefix=2              # /api/auth/login -> /login

  - id: course-service
    uri: lb://course-service
    predicates: Path=/api/courses/**,/api/students/**,/api/assignments/**,/api/enrollments/**
    filters: StripPrefix=2

  - id: dictionary-service
    uri: lb://dictionary-service
    predicates: Path=/api/dictionary/**
    filters: StripPrefix=2
```

**JwtAuthenticationFilter** (GatewayFilter): Validates JWT signature, extracts `userId` + `role`, sets `X-User-Id` and `X-User-Role` headers downstream. Whitelisted paths pass through without JWT check.

---

## JWT Flow (End to End)

1. User hits `POST http://localhost:8080/api/auth/login` (gateway)
2. Gateway sees `/api/auth/**` is whitelisted -> passes through without JWT validation
3. auth-service validates credentials -> returns `{accessToken, refreshToken}`
4. React stores accessToken in memory (Zustand), refreshToken in httpOnly cookie
5. User hits `GET http://localhost:8080/api/courses/courses`
6. Gateway's JwtFilter validates JWT, sets `X-User-Id: 5`, `X-User-Role: TEACHER`
7. course-service reads headers (trusts gateway), creates SecurityContext
8. CourseController uses `@PreAuthorize("hasRole('TEACHER')")` + filters by teacherUserId

JWT payload:
```json
{ "sub": "5", "email": "teacher@example.com", "role": "TEACHER", "iat": 1713000000, "exp": 1713003600 }
```

---

## Inter-Service Communication

### Synchronous (OpenFeign + Resilience4j circuit breaker)

**course-service -> auth-service**: Validate user exists when enrolling a student.
```java
@FeignClient(name = "auth-service", fallback = AuthServiceFallback.class)
public interface AuthServiceClient {
    @GetMapping("/users/{id}")
    UserDto getUserById(@PathVariable Long id);
}
```

Circuit breaker wraps the call. If auth-service is down, fallback returns meaningful error instead of hanging.

### Asynchronous (Apache Kafka)

| Topic | Producer | Consumer (group: `notification-group`) | Action |
|-------|----------|----------------------------------------|--------|
| `ts.user.registered` | auth-service | notification-service | Send activation email |
| `ts.assignment.created` | course-service | notification-service | Notify enrolled students |

**How it works:**
- Producers use `KafkaTemplate<String, Object>` with JSON serialization (Jackson)
- Consumers use `@KafkaListener(topics = "ts.user.registered", groupId = "notification-group")`
- Messages are keyed by userId (ensures ordering per user)
- Consumer group `notification-group` means only one instance of notification-service processes each message (scalable)

**Kafka concepts you'll learn:**
- **Topics**: Named streams of events (`ts.user.registered`, `ts.assignment.created`)
- **Partitions**: Topics are split into partitions for parallel consumption
- **Consumer groups**: Multiple instances share the load; each partition is consumed by exactly one instance in the group
- **Offsets**: Kafka tracks where each consumer group has read to — if notification-service crashes, it resumes from the last committed offset (no lost messages)
- **Retention**: Events stay in Kafka for a configurable period (default 7 days) — you can replay them

**Spring Boot Kafka config** (in each service's application.yml via config-server):
```yaml
spring:
  kafka:
    bootstrap-servers: kafka:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
    consumer:
      group-id: notification-group
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: com.ts.common.dto
```

**Producer example** (auth-service):
```java
@RequiredArgsConstructor
public class UserRegisteredPublisher {
    private final KafkaTemplate<String, UserRegisteredEvent> kafkaTemplate;

    public void publish(UserRegisteredEvent event) {
        kafkaTemplate.send("ts.user.registered", event.userId(), event);
    }
}
```

**Consumer example** (notification-service):
```java
@KafkaListener(topics = "ts.user.registered", groupId = "notification-group")
public void onUserRegistered(UserRegisteredEvent event) {
    emailService.sendActivationEmail(event.email(), event.activationCode());
}
```

---

## API Endpoints

### auth-service (gateway prefix: `/api/auth`)

| Method | Path (internal) | Auth | Description |
|--------|----------------|------|-------------|
| POST | `/register` | Public | Create account (choose EMAIL or SCREEN activation) |
| POST | `/login` | Public | Login -> JWT or 2FA-required flag |
| POST | `/oauth2/google` | Public | Exchange Google OAuth2 code for JWT |
| POST | `/verify-2fa` | Public | Submit TOTP code during login |
| POST | `/activate` | Public | Activate account via code |
| POST | `/refresh` | Public | Refresh access token |
| POST | `/logout` | Auth | Invalidate refresh token |
| GET | `/me` | Auth | Current user profile |
| PUT | `/me` | Auth | Update profile |
| POST | `/me/enable-2fa` | Auth | Generate TOTP secret, return QR URI |
| POST | `/me/disable-2fa` | Auth | Disable 2FA |
| GET | `/users/{id}` | Internal | Feign-only (NOT exposed through gateway) |

### course-service (gateway prefix: `/api/courses`, `/api/students`, `/api/assignments`, `/api/enrollments`)

| Method | Path (internal) | Role | Description |
|--------|----------------|------|-------------|
| GET | `/courses` | TEACHER | List teacher's courses |
| POST | `/courses` | TEACHER | Create course |
| GET | `/courses/{id}` | TEACHER / STUDENT (enrolled) | Get course detail |
| PUT | `/courses/{id}` | TEACHER (owner) | Update |
| DELETE | `/courses/{id}` | TEACHER (owner) | Delete |
| GET | `/courses/{id}/assignments` | TEACHER / STUDENT (enrolled) | List assignments |
| POST | `/courses/{id}/assignments` | TEACHER (owner) | Create assignment |
| PUT | `/assignments/{id}` | TEACHER | Update assignment |
| DELETE | `/assignments/{id}` | TEACHER | Delete assignment |
| POST | `/enrollments` | TEACHER | Enroll student |
| DELETE | `/enrollments/{id}` | TEACHER | Remove enrollment |
| GET | `/students/me/courses` | STUDENT | My enrolled courses |
| GET | `/students/me/assignments` | STUDENT | My assignments |

### dictionary-service (gateway prefix: `/api/dictionary`)

**Words (definitions):**

| Method | Path (internal) | Role | Description |
|--------|----------------|------|-------------|
| GET | `/words` | TEACHER | List all words (paginated, `?q=` search) |
| GET | `/words/{id}` | TEACHER | Get word definition |
| POST | `/words` | TEACHER | Create word definition |
| PUT | `/words/{id}` | TEACHER | Update word definition |
| DELETE | `/words/{id}` | TEACHER | Delete word + all its links |
| GET | `/words/{id}/parents` | TEACHER | All parents of this word |
| GET | `/words/{id}/children` | TEACHER | All children of this word |

**Links (graph structure):**

| Method | Path (internal) | Role | Description |
|--------|----------------|------|-------------|
| GET | `/roots` | TEACHER | Words with no parents (root nodes) |
| GET | `/graph` | TEACHER | Full graph for current teacher |
| POST | `/links` | TEACHER | Create link `{parentWordId, childWordId}` (cycle detection) |
| DELETE | `/links/{id}` | TEACHER | Remove link (word stays, just unlinked) |
| PATCH | `/links/{id}` | TEACHER | Update link position (reorder) |

### notification-service — NO REST API (Kafka consumer only, Actuator health endpoint only)

---

## Auth Flows

Same as monolith option:
- **Sign-up**: POST `/register` -> create user -> publish `UserRegisteredEvent` to Kafka topic `ts.user.registered` -> notification-service consumes and sends email (or auth-service returns link if SCREEN)
- **Login + 2FA**: POST `/login` -> if TOTP enabled: `{requiresTwoFactor, tempToken}` -> POST `/verify-2fa` -> full JWT
- **OAuth2**: redirect to Google via gateway -> auth-service handles -> JWT returned

Key difference from monolith: auth-service publishes events to Kafka instead of calling notification directly.

---

## Docker Compose

```yaml
services:
  # ===== INFRASTRUCTURE =====
  postgres-auth:
    image: postgres:17
    environment: { POSTGRES_DB: ts_auth, POSTGRES_USER: postgres, POSTGRES_PASSWORD: root }
    ports: ["5433:5432"]

  postgres-course:
    image: postgres:17
    environment: { POSTGRES_DB: ts_course, POSTGRES_USER: postgres, POSTGRES_PASSWORD: root }
    ports: ["5434:5432"]

  mongodb:
    image: mongo:8
    ports: ["27017:27017"]

  kafka:
    image: apache/kafka:3.9                  # KRaft mode (no Zookeeper needed)
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_LOG_RETENTION_HOURS: 168          # 7 days retention

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    ports: ["9090:8080"]
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092

  zipkin:
    image: openzipkin/zipkin
    ports: ["9411:9411"]

  # ===== SPRING CLOUD =====
  config-server:
    build: ./config-server
    ports: ["8888:8888"]
    healthcheck: { test: ["CMD", "curl", "-f", "http://localhost:8888/actuator/health"] }

  discovery-server:
    build: ./discovery-server
    ports: ["8761:8761"]
    depends_on: { config-server: { condition: service_healthy } }

  api-gateway:
    build: ./api-gateway
    ports: ["8080:8080"]
    depends_on: [discovery-server]

  # ===== APPLICATION =====
  auth-service:
    build: ./auth-service
    ports: ["8081:8081"]
    depends_on: [discovery-server, postgres-auth, kafka]

  course-service:
    build: ./course-service
    ports: ["8082:8082"]
    depends_on: [discovery-server, postgres-course, kafka]

  dictionary-service:
    build: ./dictionary-service
    ports: ["8083:8083"]
    depends_on: [discovery-server, mongodb]

  notification-service:
    build: ./notification-service
    ports: ["8084:8084"]
    depends_on: [discovery-server, kafka]
```

**Total containers: 13** (6 infrastructure + 3 Spring Cloud + 4 application)

Build: `mvn clean package -DskipTests` from root, then `docker compose up --build`

**Management UIs:**
- Eureka dashboard: http://localhost:8761
- Kafka UI: http://localhost:9090 (browse topics, view messages, consumer lag)
- Zipkin: http://localhost:9411

---

## Implementation Order

| Step | What | Microservices Pattern Learned |
|------|------|------------------------------|
| 1 | Parent pom.xml + `common` module | Maven multi-module builds |
| 2 | `config-server` — verify at http://localhost:8888 | Centralized configuration |
| 3 | `discovery-server` — verify Eureka at http://localhost:8761 | Service discovery & registration |
| 4 | `auth-service` — register + login + JWT (no OAuth2/2FA yet) | JWT auth in distributed system |
| 5 | `api-gateway` — routing + JwtFilter | API Gateway pattern, route filtering |
| 6 | `course-service` — CRUD + Feign to auth + Resilience4j | Sync inter-service communication, circuit breaker |
| 7 | `notification-service` + Kafka events from auth/course | Async event-driven communication (topics, partitions, consumer groups, offsets) |
| 8 | `dictionary-service` — MongoDB CRUD, teacher-only | Polyglot persistence |
| 9 | Auth enhancements — Google OAuth2, TOTP 2FA, activation | Advanced auth patterns |
| 10 | Observability — Zipkin tracing, JSON logging | Distributed tracing |
| 11 | Docker Compose — Dockerfiles + compose | Containerized multi-service deployment |
| 12 | React frontend — all pages via gateway | Full-stack integration |

---

## Key Architectural Decisions

- **Mono-repo** (single Git repo, Maven multi-module) for learning. Production teams often use separate repos.
- **Database-per-service is non-negotiable in microservices.** Course-service does NOT join against auth-service's database. It calls via Feign or maintains its own data copy.
- **Student entity lives in course-service, NOT auth-service.** Auth owns identity (email, password, role). Course owns the student profile in the course domain. They link via `userId` but are separate records in separate databases.
- **Notification-service has no database.** Pure event consumer: reads from Kafka, sends email, done.
- **Gateway validates JWT; services trust gateway headers.** Avoids every service needing the JWT secret.
- **Kafka in KRaft mode** (no Zookeeper). Simpler setup — single container. KRaft is the default since Kafka 3.3+.
- **Kafka over RabbitMQ** because Kafka is more interview-relevant, supports event replay, and the consumer group model scales naturally.

---

## Pros / Cons

| Pros | Cons |
|------|------|
| Learn real microservices patterns (highly relevant for jobs) | Much more complex to set up and debug |
| Independent deployment per service | 13 Docker containers for dev |
| Database-per-service = true isolation | Network latency on every cross-service call |
| Can scale hot services independently | Data consistency harder (no cross-DB joins) |
| Failure isolation (one service down != all down) | More boilerplate (SecurityConfig per service, pom.xml per service) |
| Kafka: event replay, consumer groups, high throughput | Kafka has a steeper learning curve than simpler message brokers |
| Industry-standard architecture for large teams | Overkill if you're the only developer |
| ~90+ new files | |
