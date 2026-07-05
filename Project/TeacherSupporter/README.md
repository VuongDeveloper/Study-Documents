# TeacherSupporter - Microservices Platform

A Spring Boot microservices platform that helps teachers manage courses, students, assignments, and personal word dictionaries. The system supports multiple authentication flows (local + OAuth2 Google, with optional TOTP-based 2FA), role-based access control (ADMIN / TEACHER / STUDENT) with admin-driven user provisioning and invitations, event-driven notifications via Kafka, a flexible graph-based dictionary powered by MongoDB, and a React single-page frontend.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Services](#services)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Quick Start (Docker)](#quick-start-docker)
  - [Local Development (without Docker)](#local-development-without-docker)
- [API Documentation](#api-documentation)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Admin User Endpoints](#admin-user-endpoints)
  - [Course Endpoints](#course-endpoints)
  - [Student Endpoints](#student-endpoints)
  - [Assignment Endpoints](#assignment-endpoints)
  - [Enrollment Endpoints](#enrollment-endpoints)
  - [Dictionary Endpoints](#dictionary-endpoints)
  - [Example curl Commands](#example-curl-commands)
- [Authentication Flows](#authentication-flows)
- [Dictionary Data Model](#dictionary-data-model)
- [Event-Driven Communication](#event-driven-communication)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Development Guide](#development-guide)
- [Deployment](#deployment)

---

## Architecture Overview

```
[React Frontend :3000]
        |
[API Gateway :8080] ──── [Eureka :8761] ──── [Config Server :8888]
        |
   ┌────┼────────────┬──────────────┐
   |    |             |              |
[Auth   |        [Course       [Dictionary
Service |        Service        Service
:8081]  |        :8082]         :8083]
   |    |             |         (MongoDB)
   |    |             |
[Kafka :9092]────────────── [Notification
                             Service :8084]
   |                              |
[PostgreSQL       [PostgreSQL   [MailDev
ts_auth :5433]   ts_course :5434] :1025/:1080]
```

All client requests enter through the **API Gateway** (port 8080), which validates JWTs and routes to downstream services discovered via **Eureka**. Each application service pulls its configuration from the **Config Server** on startup. Asynchronous communication between services is handled by **Apache Kafka**.

---

## Tech Stack

| Category          | Technology                                                    |
| ----------------- | ------------------------------------------------------------- |
| Language          | Java 25 (Eclipse Temurin)                                     |
| Framework         | Spring Boot 3.5.6                                             |
| Cloud             | Spring Cloud 2025.0.0                                         |
| Service Discovery | Netflix Eureka                                                |
| API Gateway       | Spring Cloud Gateway                                          |
| Configuration     | Spring Cloud Config Server (native)                           |
| Security          | Spring Security, JWT (jjwt 0.12.6), TOTP 2FA, OAuth2 (Google) |
| Messaging         | Apache Kafka 3.9                                              |
| Databases         | PostgreSQL 17, MongoDB 8                                      |
| Migrations        | Flyway (auth-service, course-service)                         |
| Inter-service     | OpenFeign (sync), Kafka (async)                               |
| API Docs          | SpringDoc OpenAPI 2.8.6 (Swagger UI)                          |
| Tracing           | Zipkin                                                        |
| Build             | Maven 3.9+ (multi-module)                                     |
| Containerization  | Docker, Docker Compose                                        |
| Frontend          | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui        |
| Caching (future)  | Redis                                                         |

---

## Services

| Service              | Port      | Description                                    | Database                    |
| -------------------- | --------- | ---------------------------------------------- | --------------------------- |
| config-server        | 8888      | Centralized configuration for all services     | -                           |
| discovery-server     | 8761      | Eureka service registry and dashboard          | -                           |
| api-gateway          | 8080      | Single entry point, JWT validation, routing    | -                           |
| auth-service         | 8081      | Authentication, OAuth2 Google, TOTP 2FA        | PostgreSQL (`ts_auth`)    |
| course-service       | 8082      | Courses, students, assignments, enrollments    | PostgreSQL (`ts_course`)  |
| dictionary-service   | 8083      | Word definitions, graph links, flexible schema | MongoDB (`ts_dictionary`) |
| notification-service | 8084      | Email notifications (Kafka consumer)           | - (stateless)               |
| kafka                | 9092      | Event streaming broker                         | -                           |
| kafka-ui             | 9090      | Kafka management web UI                        | -                           |
| zipkin               | 9411      | Distributed tracing dashboard                  | -                           |
| maildev              | 1025/1080 | Dev email server (SMTP / Web UI)               | -                           |
| postgres-auth        | 5433      | Auth database                                  | -                           |
| postgres-course      | 5434      | Course database                                | -                           |
| mongodb              | 27017     | Dictionary database                            | -                           |
| frontend (Vite)      | 3000      | React single-page app (dev server)             | -                           |

> **Remote debugging:** in `docker-compose.yml` each Spring service also exposes a JDWP port (`config-server` 5888, `discovery-server` 5761, `api-gateway` 5080, `auth` 5081, `course` 5082, `dictionary` 5083, `notification` 5084). Attach your IDE debugger to `localhost:<port>`.
>
> **Kafka listeners:** the broker advertises two listeners — `kafka:19092` for in-container traffic (used by all services and Kafka UI) and `localhost:9092` for access from the host.

---

## Prerequisites

- **Java 25** (Eclipse Temurin recommended)
- **Maven 3.9+**
- **Docker** and **Docker Compose**
- **Node.js 20+** (for the React frontend)
- A **Google OAuth2 client** (optional) — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to enable Google login

---

## Getting Started

### Quick Start (Docker)

```bash
# Clone the repo
git clone <repo-url>
cd TeacherSupporter

# Build all services
mvn clean package -DskipTests

# (Optional) enable Google OAuth2 login
export GOOGLE_CLIENT_ID=<your-client-id>
export GOOGLE_CLIENT_SECRET=<your-client-secret>

# Start everything
docker compose up --build

# Access the services:
# API Gateway:        http://localhost:8080
# Frontend (dev):     http://localhost:3000   (run separately, see below)
# Eureka Dashboard:   http://localhost:8761
# Kafka UI:           http://localhost:9090
# Zipkin:             http://localhost:9411
# MailDev:            http://localhost:1080
# Swagger (auth):     http://localhost:8081/swagger-ui.html
# Swagger (course):   http://localhost:8082/swagger-ui.html
# Swagger (dictionary): http://localhost:8083/swagger-ui.html
```

A default administrator (`admin@teachersupporter.com`) is seeded by Flyway migration `V4__seed_default_admin.sql` on first start; its password is set there as a BCrypt hash. Use this account to provision other users via the **Admin Users** screen / `/api/auth/admin/users` endpoints.

### Local Development (without Docker)

When developing a single service, start only the infrastructure containers and run the Spring Boot services from your IDE.

> **Datasource ports:** the Config Server now defaults the JDBC URLs to `localhost:5432`. The Dockerized databases are published on host ports `5433` (auth) and `5434` (course), so when running a service from your IDE against the containers, override `SPRING_DATASOURCE_URL` accordingly (e.g. `jdbc:postgresql://localhost:5433/ts_auth`). Inside Docker Compose this is already handled by the per-service `SPRING_DATASOURCE_URL` overrides.

**Step 1 -- Start infrastructure**

```bash
docker compose up postgres-auth postgres-course mongodb kafka kafka-ui maildev zipkin
```

**Step 2 -- Start Config Server first**

```bash
cd config-server
mvn spring-boot:run
```

Wait until the Config Server is healthy (check `http://localhost:8888/actuator/health`).

**Step 3 -- Start Discovery Server**

```bash
cd discovery-server
mvn spring-boot:run
```

Wait until Eureka is up at `http://localhost:8761`.

**Step 4 -- Start application services in any order**

```bash
# In separate terminals:
cd api-gateway     && mvn spring-boot:run
cd auth-service    && mvn spring-boot:run
cd course-service  && mvn spring-boot:run
cd dictionary-service    && mvn spring-boot:run
cd notification-service  && mvn spring-boot:run
```

### Per-Service Terminals (Docker, recommended for learning)

Run every service in its own foreground terminal so each service's logs stay isolated. Uses `--no-deps` so each `docker compose up` starts only that service — you bring services up in the right order yourself.

**Prerequisite:** build the JARs first.

```bash
mvn clean package -DskipTests
```

**Terminal 1 -- Infrastructure (bundled, rarely needs per-service debugging)**

```bash
docker compose up postgres-auth postgres-course mongodb kafka kafka-ui zipkin maildev minio
```

Wait until Postgres and Kafka are ready.

**Terminal 2 -- Config Server**

```bash
docker compose up --no-deps --build config-server
```

Wait for `Started ConfigServerApplication`.

**Terminal 3 -- Discovery Server**

```bash
docker compose up --no-deps --build discovery-server
```

Wait until Eureka is up at `http://localhost:8761`.

**Terminals 4-8 -- Application services (any order)**

```bash
# Terminal 4
docker compose up --no-deps --build api-gateway

# Terminal 5
docker compose up --no-deps --build auth-service

# Terminal 6
docker compose up --no-deps --build course-service

# Terminal 7
docker compose up --no-deps --build dictionary-service

# Terminal 8
docker compose up --no-deps --build notification-service
```

**Terminal 9 -- Frontend (React + Vite)**

```bash
cd frontend
npm install   # first time only
npm run dev
```

Vite serves the SPA at `http://localhost:3000` (configured in `vite.config.ts`). It proxies `/api` and `/oauth2` calls to the gateway at `http://localhost:8080`.

Flyway runs automatically when `auth-service` and `course-service` start — look for `Successfully applied N migrations` in their logs.

**Tips:**

- Use Windows Terminal tabs (Ctrl+T) or split panes to keep the 8 terminals manageable.
- After the first build, drop `--build` on unchanged services for faster restarts.
- `Ctrl+C` in a terminal stops just that service; `docker compose stop <service>` from any terminal does the same without killing the foreground process.
- `docker compose down` tears the whole stack down.

---

## API Documentation

All requests go through the API Gateway at `http://localhost:8080`. The gateway strips the `/api/{service}` prefix before forwarding.

| Gateway Prefix          | Target Service                          |
| ----------------------- | --------------------------------------- |
| `/api/auth/**`        | auth-service                            |
| `/api/auth/admin/**`  | auth-service (ADMIN)                    |
| `/api/courses/**`     | course-service                          |
| `/api/students/**`    | course-service                          |
| `/api/assignments/**` | course-service                          |
| `/api/enrollments/**` | course-service                          |
| `/api/dictionary/**`  | dictionary-service                      |
| `/oauth2/**`          | auth-service                            |
| `/login/oauth2/**`    | auth-service (OAuth2 redirect callback) |

### Authentication Endpoints

All paths below are relative to the gateway prefix `/api/auth`.

| Method | Path                      | Auth Required | Description                                                       |
| ------ | ------------------------- | ------------- | ----------------------------------------------------------------- |
| POST   | `/register`             | No            | Self-register a new user (always created as STUDENT)              |
| POST   | `/login`                | No            | Login with email and password                                     |
| POST   | `/verify-2fa`           | No            | Submit TOTP code after login (if 2FA enabled)                     |
| POST   | `/change-password`      | No            | Set a new password using a `tempToken` (forced password change) |
| POST   | `/activate`             | No            | Activate account with activation code                             |
| POST   | `/refresh`              | No            | Refresh an expired access token                                   |
| POST   | `/logout`               | No            | Revoke a refresh token                                            |
| GET    | `/me`                   | Yes           | Get current authenticated user profile                            |
| POST   | `/me/enable-2fa`        | Yes           | Generate TOTP secret and QR code URI                              |
| POST   | `/me/enable-2fa/verify` | Yes           | Confirm 2FA setup with a TOTP code                                |
| POST   | `/me/disable-2fa`       | Yes           | Disable two-factor authentication                                 |
| GET    | `/users/{id}`           | Yes           | Get user by ID (internal / feign)                                 |

### Admin User Endpoints

All paths below are relative to the gateway prefix `/api/auth/admin` and require the **ADMIN** role.

| Method | Path            | Description                                                                                                                                                                                                                                          |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/users`      | Provision a user.`authMethod=PASSWORD` creates the account with a generated temporary password (emailed, must be changed on first login); `authMethod=GOOGLE` creates a pending invitation (emailed) the user accepts by signing in with Google. |
| GET    | `/users`      | List all users (paginated)                                                                                                                                                                                                                           |
| PATCH  | `/users/{id}` | Update a user's role (cannot assign `ADMIN`)                                                                                                                                                                                                       |
| DELETE | `/users/{id}` | Delete a user (cannot delete an admin)                                                                                                                                                                                                               |

### Course Endpoints

All paths below are relative to the gateway prefix `/api/courses`.

| Method | Path                          | Auth / Role | Description                                   |
| ------ | ----------------------------- | ----------- | --------------------------------------------- |
| GET    | `/courses`                  | TEACHER     | List courses owned by the teacher (paginated) |
| GET    | `/courses/{id}`             | Any         | Get a single course by ID                     |
| POST   | `/courses`                  | TEACHER     | Create a new course                           |
| PUT    | `/courses/{id}`             | TEACHER     | Update a course                               |
| DELETE | `/courses/{id}`             | TEACHER     | Delete a course                               |
| GET    | `/courses/{id}/assignments` | Any         | List assignments for a course                 |
| POST   | `/courses/{id}/assignments` | TEACHER     | Create an assignment in a course              |

### Student Endpoints

All paths below are relative to the gateway prefix `/api/students`.

| Method | Path                         | Auth / Role | Description                             |
| ------ | ---------------------------- | ----------- | --------------------------------------- |
| GET    | `/students/me/courses`     | STUDENT     | List courses the student is enrolled in |
| GET    | `/students/me/assignments` | STUDENT     | List assignments for enrolled courses   |

### Assignment Endpoints

All paths below are relative to the gateway prefix `/api/assignments`.

| Method | Path                  | Auth / Role | Description             |
| ------ | --------------------- | ----------- | ----------------------- |
| GET    | `/assignments/{id}` | Any         | Get a single assignment |
| PUT    | `/assignments/{id}` | TEACHER     | Update an assignment    |
| DELETE | `/assignments/{id}` | TEACHER     | Delete an assignment    |

### Enrollment Endpoints

All paths below are relative to the gateway prefix `/api/enrollments`.

| Method | Path                  | Auth / Role | Description                                              |
| ------ | --------------------- | ----------- | -------------------------------------------------------- |
| POST   | `/enrollments`      | TEACHER     | Enroll a student in a course                             |
| DELETE | `/enrollments/{id}` | TEACHER     | Remove a student from a course                           |
| GET    | `/enrollments`      | Any         | List enrollments for a course (query param `courseId`) |

### Dictionary Endpoints

All paths below are relative to the gateway prefix `/api/dictionary`.

| Method | Path                     | Auth / Role | Description                                          |
| ------ | ------------------------ | ----------- | ---------------------------------------------------- |
| GET    | `/words`               | TEACHER     | Search words (optional query param `q`, paginated) |
| GET    | `/words/{id}`          | TEACHER     | Get a word definition                                |
| POST   | `/words`               | TEACHER     | Create a word definition                             |
| PUT    | `/words/{id}`          | TEACHER     | Update a word definition                             |
| DELETE | `/words/{id}`          | TEACHER     | Delete a word definition                             |
| GET    | `/words/{id}/parents`  | TEACHER     | Get parent words in the graph                        |
| GET    | `/words/{id}/children` | TEACHER     | Get child words in the graph                         |
| GET    | `/roots`               | TEACHER     | Get all root words (no parents)                      |
| GET    | `/graph`               | TEACHER     | Get the full word graph for the user                 |
| POST   | `/links`               | TEACHER     | Create a parent-child link                           |
| DELETE | `/links/{id}`          | TEACHER     | Delete a link                                        |
| PATCH  | `/links/{id}`          | TEACHER     | Update link position (`{"position": N}`)           |

### Example curl Commands

**Register a new user** (self-registration always becomes a STUDENT; the `role` field is still required by request validation but ignored — use admin provisioning to create TEACHERs):

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@test.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "role": "STUDENT",
    "activationMethod": "SCREEN"
  }'
```

**Provision a teacher (as ADMIN):**

```bash
curl -X POST http://localhost:8080/api/auth/admin/users \
  -H "Authorization: Bearer <admin_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@test.com",
    "firstName": "Jane",
    "lastName": "Roe",
    "role": "TEACHER",
    "authMethod": "PASSWORD"
  }'
```

**Login:**

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@test.com",
    "password": "password123"
  }'
```

**Create a course (with Bearer token):**

```bash
curl -X POST http://localhost:8080/api/courses/courses \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Math 101",
    "description": "Introduction to Mathematics"
  }'
```

**Create a word definition:**

```bash
curl -X POST http://localhost:8080/api/dictionary/words \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "word": "Photosynthesis",
    "meaning": "The process by which plants convert light to energy",
    "usage": "Plants perform photosynthesis in their leaves.",
    "tags": ["biology", "plants"]
  }'
```

---

## Authentication Flows

### Sign-up

1. Client sends `POST /api/auth/register` with email, password, and `activationMethod` (`EMAIL` or `SCREEN`). Self-registration always creates a **STUDENT** — the `TEACHER` and `ADMIN` roles are assigned only through admin provisioning.
2. The service creates a user record with `activated = false` and generates an activation code.
3. **If `activationMethod = EMAIL`:** A `ts.user.registered` Kafka event is published. The notification-service consumes it and sends an activation email via MailDev (or a real SMTP server in production). The user clicks the link to activate.
4. **If `activationMethod = SCREEN`:** The activation link is returned directly in the response body. The client can call `POST /api/auth/activate?code=<code>` immediately.
5. On activation the service publishes a `ts.user.activated` event. The course-service consumes it and provisions a `Student` row for new STUDENT users.
6. Once activated, the user can log in.

### Admin User Provisioning

1. An ADMIN calls `POST /api/auth/admin/users` with the target email, name, role, and `authMethod`.
2. **`authMethod = PASSWORD`:** the user is created immediately (activated, `mustChangePassword = true`) with a randomly generated temporary password. An `AdminProvisionedUserEvent` is published to `ts.user.admin-provisioned`; the notification-service emails the temporary password.
3. **`authMethod = GOOGLE`:** a pending `user_invitation` (7-day expiry) is stored instead of a user. The same event triggers an invitation email containing an invite link.
4. When the invited user signs in with Google, the OAuth2 success handler consumes the matching invitation and creates the account with the invited role.

### Forced Password Change

1. A user provisioned with a temporary password logs in via `POST /api/auth/login`.
2. Because `mustChangePassword = true`, the response contains `mustChangePassword = true` and a short-lived `tempToken` (instead of access/refresh tokens).
3. The client collects a new password and calls `POST /api/auth/change-password` with the `tempToken` and `newPassword`.
4. On success the flag is cleared and the response contains the normal `accessToken` / `refreshToken`.

### Login with 2FA

1. Client sends `POST /api/auth/login` with email and password.
2. If 2FA is **not** enabled, the response contains `accessToken` and `refreshToken`.
3. If 2FA **is** enabled, the response contains `totpRequired = true` and a `tempToken`.
4. Client prompts the user for their TOTP code from an authenticator app.
5. Client sends `POST /api/auth/verify-2fa` with the `tempToken` and `code`.
6. On success, the response contains `accessToken` and `refreshToken`.

### OAuth2 Google Login

1. Client redirects to `/oauth2/authorization/google` through the gateway.
2. Spring Security handles the OAuth2 authorization code flow with Google; the callback returns to `/login/oauth2/code/google` (routed to the auth-service).
3. The `OAuth2LoginSuccessHandler` matches an existing user by Google `sub` or email (linking the provider if needed), or creates a new one. A pending invitation for that email is consumed to assign its role; otherwise the new user defaults to STUDENT.
4. JWT access/refresh tokens are minted and the user is redirected to the frontend at `app.oauth2.success-redirect-uri` (`http://localhost:3000/oauth/callback` by default) with the tokens as query parameters.

---

## Dictionary Data Model

The dictionary uses a **directed acyclic graph (DAG)** model stored in MongoDB with two collections:

### Collections

- **`word_definitions`** -- Each document represents a single word with its meaning, usage, examples, notes, tags, and a flexible `extra` map for arbitrary key-value data.
- **`word_links`** -- Each document represents a directed edge from a parent word to a child word, with a `position` field for ordering children.

### Graph Properties

- A word can have **multiple parents** (e.g., "Cell" can be a child of both "Biology" and "Physics").
- A word can be **both a definition and a parent** of other words.
- **Cycle detection** is enforced: the service prevents creating a link that would form a cycle (e.g., A -> B -> C -> A).
- **Root words** are words that have no incoming links (no parents). Use `GET /roots` to retrieve them.
- **Full graph** can be fetched via `GET /graph`, which returns all words and links for the authenticated user.
- **Error messages** are externalized to `messages.properties` and resolved via Spring's `MessageSource` (using the request locale), so validation/lookup errors can be localized.

### Example Graph

```
[Science]
   ├── [Biology]
   │      ├── [Cell]
   │      └── [Photosynthesis]
   └── [Physics]
          ├── [Cell]          (shared child)
          └── [Gravity]
```

---

## Event-Driven Communication

### Kafka Topics

| Topic                         | Producer       | Consumer             | Payload                                                                                                   |
| ----------------------------- | -------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `ts.user.registered`        | auth-service   | notification-service | userId, email, firstName, activationCode, activationMethod                                                |
| `ts.user.activated`         | auth-service   | course-service       | userId, email, firstName, lastName, role — course-service provisions a `Student` row for STUDENT users |
| `ts.user.admin-provisioned` | auth-service   | notification-service | email, role, authMethod, inviteToken, tempPassword — sends invitation or temp-password email             |
| `ts.assignment.created`     | course-service | notification-service | assignmentId + assignment details                                                                         |

Kafka consumers use Spring Kafka's `ErrorHandlingDeserializer` (wrapping the JSON/String delegates) so a poison message can't halt the consumer; trusted packages are restricted to `com.ts.common.dto`.

### Synchronous Communication

| Caller         | Target       | Method              | Protocol               |
| -------------- | ------------ | ------------------- | ---------------------- |
| course-service | auth-service | `GET /users/{id}` | OpenFeign (via Eureka) |

The course-service uses OpenFeign with a fallback to fetch user details from the auth-service. This is used, for example, when enrolling students to validate that the user exists and has the STUDENT role.

---

## Project Structure

```
TeacherSupporter/
├── api-gateway/                # Spring Cloud Gateway
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── auth-service/               # Auth, OAuth2, 2FA, admin user mgmt & invitations
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/                    # Flyway migrations under src/main/resources/db/migration
├── common/                     # Shared DTOs and Kafka event records
│   ├── pom.xml
│   └── src/
├── config-server/              # Spring Cloud Config Server
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
│       └── main/resources/
│           ├── application.yml
│           └── configurations/     # Per-service config files
│               ├── api-gateway.yml
│               ├── auth-service.yml
│               ├── course-service.yml
│               ├── dictionary-service.yml
│               └── notification-service.yml
├── course-service/             # Course, student, assignment, enrollment
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── dictionary-service/         # Word definitions & graph links (MongoDB)
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── discovery-server/           # Eureka service registry
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── notification-service/       # Kafka consumer, email sender (HTML templates)
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── frontend/                   # React 19 + Vite + TypeScript SPA
│   ├── package.json
│   └── src/
├── docker-compose.yml          # Full stack orchestration
├── pom.xml                     # Parent POM (multi-module)
└── docs/                       # Additional documentation
```

---

## Configuration

### How Config Server Works

1. The Config Server runs on port 8888 and serves configuration files from `config-server/src/main/resources/configurations/`.
2. Each service has a corresponding YAML file (e.g., `auth-service.yml`, `course-service.yml`).
3. On startup, every service sets `spring.config.import=configserver:http://config-server:8888` to fetch its configuration.
4. The Config Server must be **healthy before** any other service starts. Docker Compose enforces this with a `service_healthy` condition.

### Environment Variable Overrides

In `docker-compose.yml`, environment variables override Config Server values. Common overrides:

| Variable                                        | Purpose                                          |
| ----------------------------------------------- | ------------------------------------------------ |
| `SPRING_CONFIG_IMPORT`                        | Config Server URL                                |
| `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE`        | Eureka URL                                       |
| `SPRING_DATASOURCE_URL`                       | PostgreSQL JDBC URL                              |
| `SPRING_DATA_MONGODB_URI`                     | MongoDB connection URI                           |
| `SPRING_KAFKA_BOOTSTRAP_SERVERS`              | Kafka broker address                             |
| `SPRING_MAIL_HOST` / `SPRING_MAIL_PORT`     | SMTP server for notifications                    |
| `JWT_SECRET`                                  | JWT signing key                                  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth2 client credentials (auth-service)  |
| `JAVA_TOOL_OPTIONS`                           | JDWP remote-debug agent (per-service debug port) |

---

## Development Guide

### Adding a New Service

1. Create a new Maven module directory at the project root.
2. Add the module to the parent `pom.xml` `<modules>` section.
3. Set `spring-boot-starter-parent` or use the parent POM's dependency management.
4. Add dependencies: `spring-cloud-starter-config`, `spring-cloud-starter-netflix-eureka-client`, and the `common` module.
5. Create a configuration file in `config-server/src/main/resources/configurations/<service-name>.yml`.
6. Add the service to `docker-compose.yml` with a Dockerfile, port mapping, and environment variables.
7. Add a gateway route in `config-server/src/main/resources/configurations/api-gateway.yml`.

### Adding a New Kafka Event

1. Define the event record in the `common` module (e.g., `com.ts.common.dto.MyNewEvent`).
2. In the **producer** service, create a publisher component that uses `KafkaTemplate` to send to a topic (naming convention: `ts.<domain>.<action>`).
3. In the **consumer** service, create a listener class annotated with `@KafkaListener(topics = "ts.<domain>.<action>")`.
4. Consumer settings (group ID, deserializers, trusted packages) live in the service's YAML under `spring.kafka.consumer` in the Config Server — no Java `@Configuration` class is needed. Add the new event's package to `spring.json.trusted.packages` if it lives outside `com.ts.common.dto`.

### Adding a New API Endpoint

1. Add the request/response DTOs in the service's `dto` package.
2. Create or update a `@RestController` with the new endpoint method.
3. Add business logic in the corresponding `@Service` class.
4. If the endpoint needs to be exposed through the gateway, add or update the route predicate in `api-gateway.yml`.
5. Secure the endpoint with `@PreAuthorize` if it requires a specific role.

### Running Tests

```bash
# Run all tests across all modules
mvn test

# Run tests for a specific service
mvn test -pl auth-service

# Run a single test class
mvn test -pl course-service -Dtest=CourseServiceTest
```

---

## Deployment

### Building Docker Images

```bash
# Build all JARs
mvn clean package -DskipTests

# Build and start containers
docker compose up --build -d

# View logs
docker compose logs -f auth-service
```

### Production Considerations

- Replace `JWT_SECRET` with a strong, externalized secret (e.g., from a vault).
- Replace MailDev with a real SMTP provider.
- Use managed database services (RDS, Atlas) instead of Docker containers.
- Enable TLS termination at the gateway or load balancer.
- Configure Kafka with replication factor > 1 for durability.
- Add health check endpoints and connect them to your orchestrator (Kubernetes readiness/liveness probes).
- Set up centralized logging (ELK stack or similar) alongside Zipkin tracing.
