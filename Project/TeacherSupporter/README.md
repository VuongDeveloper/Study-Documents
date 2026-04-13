# TeacherSupporter - Microservices Platform

A Spring Boot microservices platform that helps teachers manage courses, students, assignments, and personal word dictionaries. The system supports multiple authentication flows (local + OAuth2 Google, with optional TOTP-based 2FA), event-driven notifications via Kafka, and a flexible graph-based dictionary powered by MongoDB.

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

| Category          | Technology                                     |
|-------------------|------------------------------------------------|
| Language          | Java 21 (Eclipse Temurin)                      |
| Framework         | Spring Boot 3.4.4                              |
| Cloud             | Spring Cloud 2024.0.1                          |
| Service Discovery | Netflix Eureka                                 |
| API Gateway       | Spring Cloud Gateway                           |
| Configuration     | Spring Cloud Config Server (native)            |
| Security          | Spring Security, JWT (jjwt 0.12.6), TOTP 2FA  |
| Messaging         | Apache Kafka 3.9                               |
| Databases         | PostgreSQL 17, MongoDB 8                       |
| Inter-service     | OpenFeign (sync), Kafka (async)                |
| API Docs          | SpringDoc OpenAPI 2.8.6 (Swagger UI)           |
| Tracing           | Zipkin                                         |
| Build             | Maven 3.9+ (multi-module)                      |
| Containerization  | Docker, Docker Compose                         |
| Frontend (planned)| React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui |
| Caching (future)  | Redis                                          |

---

## Services

| Service              | Port       | Description                              | Database                  |
|----------------------|------------|------------------------------------------|---------------------------|
| config-server        | 8888       | Centralized configuration for all services | -                       |
| discovery-server     | 8761       | Eureka service registry and dashboard    | -                         |
| api-gateway          | 8080       | Single entry point, JWT validation, routing | -                      |
| auth-service         | 8081       | Authentication, OAuth2 Google, TOTP 2FA  | PostgreSQL (`ts_auth`)    |
| course-service       | 8082       | Courses, students, assignments, enrollments | PostgreSQL (`ts_course`) |
| dictionary-service   | 8083       | Word definitions, graph links, flexible schema | MongoDB (`ts_dictionary`) |
| notification-service | 8084       | Email notifications (Kafka consumer)     | - (stateless)             |
| kafka                | 9092       | Event streaming broker                   | -                         |
| kafka-ui             | 9090       | Kafka management web UI                  | -                         |
| zipkin               | 9411       | Distributed tracing dashboard            | -                         |
| maildev              | 1025/1080  | Dev email server (SMTP / Web UI)         | -                         |
| postgres-auth        | 5433       | Auth database                            | -                         |
| postgres-course      | 5434       | Course database                          | -                         |
| mongodb              | 27017      | Dictionary database                      | -                         |

---

## Prerequisites

- **Java 21** (Eclipse Temurin recommended)
- **Maven 3.9+**
- **Docker** and **Docker Compose**
- **Node.js 20+** (for frontend, when available)

---

## Getting Started

### Quick Start (Docker)

```bash
# Clone the repo
git clone <repo-url>
cd TeacherSupporter

# Build all services
mvn clean package -DskipTests

# Start everything
docker compose up --build

# Access the services:
# API Gateway:        http://localhost:8080
# Eureka Dashboard:   http://localhost:8761
# Kafka UI:           http://localhost:9090
# Zipkin:             http://localhost:9411
# MailDev:            http://localhost:1080
# Swagger (auth):     http://localhost:8081/swagger-ui.html
# Swagger (course):   http://localhost:8082/swagger-ui.html
# Swagger (dictionary): http://localhost:8083/swagger-ui.html
```

### Local Development (without Docker)

When developing a single service, start only the infrastructure containers and run the Spring Boot services from your IDE.

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

---

## API Documentation

All requests go through the API Gateway at `http://localhost:8080`. The gateway strips the `/api/{service}` prefix before forwarding.

| Gateway Prefix         | Target Service       |
|------------------------|----------------------|
| `/api/auth/**`         | auth-service         |
| `/api/courses/**`      | course-service       |
| `/api/students/**`     | course-service       |
| `/api/assignments/**`  | course-service       |
| `/api/enrollments/**`  | course-service       |
| `/api/dictionary/**`   | dictionary-service   |
| `/oauth2/**`           | auth-service         |

### Authentication Endpoints

All paths below are relative to the gateway prefix `/api/auth`.

| Method | Path                    | Auth Required | Description                              |
|--------|-------------------------|---------------|------------------------------------------|
| POST   | `/register`             | No            | Register a new user (TEACHER or STUDENT) |
| POST   | `/login`                | No            | Login with email and password            |
| POST   | `/verify-2fa`           | No            | Submit TOTP code after login (if 2FA enabled) |
| POST   | `/activate`             | No            | Activate account with activation code    |
| POST   | `/refresh`              | No            | Refresh an expired access token          |
| POST   | `/logout`               | No            | Revoke a refresh token                   |
| GET    | `/me`                   | Yes           | Get current authenticated user profile   |
| POST   | `/me/enable-2fa`        | Yes           | Generate TOTP secret and QR code URI     |
| POST   | `/me/enable-2fa/verify` | Yes           | Confirm 2FA setup with a TOTP code       |
| POST   | `/me/disable-2fa`       | Yes           | Disable two-factor authentication        |
| GET    | `/users/{id}`           | Yes           | Get user by ID (internal / feign)        |

### Course Endpoints

All paths below are relative to the gateway prefix `/api/courses`.

| Method | Path                      | Auth / Role | Description                        |
|--------|---------------------------|-------------|------------------------------------|
| GET    | `/courses`                | TEACHER     | List courses owned by the teacher (paginated) |
| GET    | `/courses/{id}`           | Any         | Get a single course by ID          |
| POST   | `/courses`                | TEACHER     | Create a new course                |
| PUT    | `/courses/{id}`           | TEACHER     | Update a course                    |
| DELETE | `/courses/{id}`           | TEACHER     | Delete a course                    |
| GET    | `/courses/{id}/assignments` | Any       | List assignments for a course      |
| POST   | `/courses/{id}/assignments` | TEACHER   | Create an assignment in a course   |

### Student Endpoints

All paths below are relative to the gateway prefix `/api/students`.

| Method | Path                  | Auth / Role | Description                              |
|--------|-----------------------|-------------|------------------------------------------|
| GET    | `/students/me/courses`     | STUDENT     | List courses the student is enrolled in  |
| GET    | `/students/me/assignments` | STUDENT     | List assignments for enrolled courses    |

### Assignment Endpoints

All paths below are relative to the gateway prefix `/api/assignments`.

| Method | Path                 | Auth / Role | Description              |
|--------|----------------------|-------------|--------------------------|
| GET    | `/assignments/{id}`  | Any         | Get a single assignment  |
| PUT    | `/assignments/{id}`  | TEACHER     | Update an assignment     |
| DELETE | `/assignments/{id}`  | TEACHER     | Delete an assignment     |

### Enrollment Endpoints

All paths below are relative to the gateway prefix `/api/enrollments`.

| Method | Path                  | Auth / Role | Description                            |
|--------|-----------------------|-------------|----------------------------------------|
| POST   | `/enrollments`        | TEACHER     | Enroll a student in a course           |
| DELETE | `/enrollments/{id}`   | TEACHER     | Remove a student from a course         |
| GET    | `/enrollments`        | Any         | List enrollments for a course (query param `courseId`) |

### Dictionary Endpoints

All paths below are relative to the gateway prefix `/api/dictionary`.

| Method | Path                     | Auth / Role | Description                          |
|--------|--------------------------|-------------|--------------------------------------|
| GET    | `/words`                 | TEACHER     | Search words (optional query param `q`, paginated) |
| GET    | `/words/{id}`            | TEACHER     | Get a word definition                |
| POST   | `/words`                 | TEACHER     | Create a word definition             |
| PUT    | `/words/{id}`            | TEACHER     | Update a word definition             |
| DELETE | `/words/{id}`            | TEACHER     | Delete a word definition             |
| GET    | `/words/{id}/parents`    | TEACHER     | Get parent words in the graph        |
| GET    | `/words/{id}/children`   | TEACHER     | Get child words in the graph         |
| GET    | `/roots`                 | TEACHER     | Get all root words (no parents)      |
| GET    | `/graph`                 | TEACHER     | Get the full word graph for the user |
| POST   | `/links`                 | TEACHER     | Create a parent-child link           |
| DELETE | `/links/{id}`            | TEACHER     | Delete a link                        |
| PATCH  | `/links/{id}`            | TEACHER     | Update link position (`{"position": N}`) |

### Example curl Commands

**Register a new teacher:**

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@test.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "role": "TEACHER",
    "activationMethod": "SCREEN"
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

1. Client sends `POST /api/auth/register` with email, password, role (`TEACHER` or `STUDENT`), and `activationMethod` (`EMAIL` or `SCREEN`).
2. The service creates a user record with `activated = false` and generates an activation code.
3. **If `activationMethod = EMAIL`:** A `ts.user.registered` Kafka event is published. The notification-service consumes it and sends an activation email via MailDev (or a real SMTP server in production). The user clicks the link to activate.
4. **If `activationMethod = SCREEN`:** The activation link is returned directly in the response body. The client can call `POST /api/auth/activate?code=<code>` immediately.
5. Once activated, the user can log in.

### Login with 2FA

1. Client sends `POST /api/auth/login` with email and password.
2. If 2FA is **not** enabled, the response contains `accessToken` and `refreshToken`.
3. If 2FA **is** enabled, the response contains `totpRequired = true` and a `tempToken`.
4. Client prompts the user for their TOTP code from an authenticator app.
5. Client sends `POST /api/auth/verify-2fa` with the `tempToken` and `code`.
6. On success, the response contains `accessToken` and `refreshToken`.

### OAuth2 Google Login

1. Client redirects to `/oauth2/authorization/google` through the gateway.
2. Spring Security handles the OAuth2 authorization code flow with Google.
3. On success, a user record is created (or matched) with `provider = GOOGLE`.
4. JWT tokens are issued and returned to the client.

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

| Topic                   | Producer         | Consumer              | Payload                        |
|-------------------------|------------------|-----------------------|--------------------------------|
| `ts.user.registered`    | auth-service     | notification-service  | userId, email, firstName, activationCode, activationMethod |
| `ts.assignment.created` | course-service   | notification-service  | assignmentId + assignment details |

### Synchronous Communication

| Caller          | Target        | Method   | Protocol                   |
|-----------------|---------------|----------|----------------------------|
| course-service  | auth-service  | `GET /users/{id}` | OpenFeign (via Eureka) |

The course-service uses OpenFeign with a fallback to fetch user details from the auth-service. This is used, for example, when enrolling students to validate that the user exists and has the STUDENT role.

---

## Project Structure

```
TeacherSupporter/
├── api-gateway/                # Spring Cloud Gateway
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── auth-service/               # Authentication & user management
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
├── common/                     # Shared DTOs and event classes
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
├── notification-service/       # Kafka consumer, email sender
│   ├── Dockerfile
│   ├── pom.xml
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

| Variable                                 | Purpose                                |
|------------------------------------------|----------------------------------------|
| `SPRING_CONFIG_IMPORT`                   | Config Server URL                      |
| `EUREKA_CLIENT_SERVICEURL_DEFAULTZONE`   | Eureka URL                             |
| `SPRING_DATASOURCE_URL`                  | PostgreSQL JDBC URL                    |
| `SPRING_DATA_MONGODB_URI`                | MongoDB connection URI                 |
| `SPRING_KAFKA_BOOTSTRAP_SERVERS`         | Kafka broker address                   |
| `SPRING_MAIL_HOST` / `SPRING_MAIL_PORT`  | SMTP server for notifications          |
| `JWT_SECRET`                             | JWT signing key                        |

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
4. If needed, register a new Kafka consumer configuration or update the existing `KafkaConsumerConfig`.

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
