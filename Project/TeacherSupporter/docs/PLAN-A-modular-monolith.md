# OPTION A: Modular Monolith

> Single Spring Boot app, one JVM, package-based module boundaries. Simpler to build, deploy, and debug. Good for small teams and learning the domain before splitting.

## Shared Context

A Spring Boot app for teachers to manage courses, students, assignments, and build custom word dictionaries. Students can also log in with read-only access. Auth supports OAuth2 (Google) + username/password + TOTP 2FA. Dictionary uses MongoDB for flexible schema.

**Tech stack:** Spring Boot 4.0.3, Java 25, PostgreSQL 17, MongoDB 8, Redis, Flyway, Lombok, JWT
**Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query + Zustand

---

## Project Structure

```
teacher-supporter/
├── pom.xml                              # Spring Boot parent
├── docker-compose.yml
├── Dockerfile
├── src/main/java/com/example/ts/
│   ├── TsApplication.java
│   │
│   ├── common/
│   │   ├── dto/
│   │   │   ├── ApiResponse.java             # Generic wrapper {success, data, message, timestamp}
│   │   │   └── PageResponse.java            # Paginated wrapper
│   │   ├── exception/
│   │   │   ├── GlobalExceptionHandler.java  # @RestControllerAdvice
│   │   │   ├── ResourceNotFoundException.java
│   │   │   └── BadRequestException.java
│   │   ├── config/
│   │   │   ├── JacksonConfig.java           # ObjectMapper (Java time, snake_case)
│   │   │   └── OpenApiConfig.java           # Swagger/OpenAPI 3
│   │   └── audit/
│   │       └── Auditable.java               # @MappedSuperclass: createdAt, updatedAt
│   │
│   ├── auth/
│   │   ├── entity/
│   │   │   ├── AppUser.java
│   │   │   ├── RefreshToken.java
│   │   │   ├── Role.java                    # enum: ADMIN, TEACHER, STUDENT
│   │   │   └── AuthProvider.java            # enum: LOCAL, GOOGLE
│   │   ├── repository/
│   │   │   ├── AppUserRepository.java       # findByEmail, findByActivationToken
│   │   │   └── RefreshTokenRepository.java
│   │   ├── dto/
│   │   │   ├── SignUpRequest.java           # email, password, displayName, role, activationMethod (EMAIL|SCREEN)
│   │   │   ├── LoginRequest.java            # email, password
│   │   │   ├── LoginResponse.java           # accessToken, refreshToken, requiresTwoFactor, tempToken
│   │   │   ├── TwoFactorVerifyRequest.java  # tempToken, code
│   │   │   ├── TwoFactorSetupResponse.java  # qrCodeUri, secret
│   │   │   └── TokenRefreshRequest.java
│   │   ├── service/
│   │   │   ├── AuthService.java             # signup, login, OAuth2 callback, token refresh
│   │   │   ├── JwtService.java              # generate/validate JWT (access + refresh)
│   │   │   ├── TotpService.java             # TOTP secret, QR URI, verify code
│   │   │   ├── CustomUserDetailsService.java
│   │   │   ├── CustomOAuth2UserService.java
│   │   │   └── TokenBlacklistService.java   # Redis-backed JWT blacklist
│   │   ├── config/
│   │   │   ├── SecurityConfig.java          # SecurityFilterChain, stateless, role-based
│   │   │   ├── JwtAuthenticationFilter.java # OncePerRequestFilter, reads Bearer token
│   │   │   └── OAuth2SuccessHandler.java    # Issues JWT after Google OAuth2 login
│   │   └── controller/
│   │       └── AuthController.java
│   │
│   ├── student/
│   │   ├── entity/Student.java              # existing entity + userId FK to AppUser
│   │   ├── repository/StudentRepository.java
│   │   ├── dto/
│   │   │   ├── StudentRequest.java          # @Valid: firstName, lastName, email, phone
│   │   │   └── StudentResponse.java
│   │   ├── service/
│   │   │   ├── StudentService.java          # interface
│   │   │   └── StudentServiceImpl.java      # CRUD + pagination
│   │   └── controller/StudentController.java
│   │
│   ├── course/
│   │   ├── entity/Course.java               # existing entity
│   │   ├── repository/CourseRepository.java
│   │   ├── dto/
│   │   │   ├── CourseRequest.java
│   │   │   └── CourseResponse.java
│   │   ├── service/
│   │   │   ├── CourseService.java
│   │   │   └── CourseServiceImpl.java
│   │   └── controller/CourseController.java
│   │
│   ├── assignment/
│   │   ├── entity/Assignment.java           # existing entity
│   │   ├── repository/AssignmentRepository.java
│   │   ├── dto/
│   │   │   ├── AssignmentRequest.java
│   │   │   └── AssignmentResponse.java
│   │   ├── service/
│   │   │   ├── AssignmentService.java
│   │   │   └── AssignmentServiceImpl.java
│   │   └── controller/AssignmentController.java
│   │
│   ├── dictionary/
│   │   ├── document/
│   │   │   ├── WordDefinition.java          # @Document — each word defined ONCE
│   │   │   └── WordLink.java                # @Document — parent→child graph edges
│   │   ├── repository/
│   │   │   ├── WordDefinitionRepository.java
│   │   │   └── WordLinkRepository.java
│   │   ├── dto/
│   │   │   ├── WordDefinitionRequest.java
│   │   │   ├── WordDefinitionResponse.java
│   │   │   ├── WordLinkRequest.java         # { parentWordId, childWordId }
│   │   │   └── WordGraphResponse.java       # recursive graph node for UI
│   │   ├── service/
│   │   │   ├── DictionaryService.java
│   │   │   └── DictionaryServiceImpl.java   # includes cycle detection
│   │   ├── config/MongoIndexConfig.java
│   │   └── controller/DictionaryController.java
│   │
│   └── notification/
│       ├── service/
│       │   ├── NotificationService.java     # interface
│       │   └── EmailNotificationService.java # JavaMailSender
│       └── dto/EmailRequest.java
│
├── src/main/resources/
│   ├── application.yml
│   ├── application-dev.yml
│   ├── application-prod.yml
│   ├── db/migration/
│   │   ├── schema/V1__schema-entities.sql       # existing
│   │   ├── schema/V2__add-audit-columns.sql     # createdAt, updatedAt on all tables
│   │   └── schema/V3__auth-tables.sql           # app_user, refresh_token, student.user_id
│   └── templates/email/
│       └── activation.html                      # Thymeleaf email template
│
└── frontend/                                    # React SPA (see shared frontend section)
```

---

## Database Schema

### Single PostgreSQL database: `TS`

Existing tables (V1 — already created):
- `course` (id, name, description, status, start_date, end_date)
- `student` (id, first_name, last_name, email, phone)
- `course_student` (course_id, student_id) — many-to-many join table
- `assignment` (id, course_id, title, description, status, document_url, start_date, due_date)

V2 migration — audit columns:
```sql
ALTER TABLE student ADD COLUMN created_at TIMESTAMP DEFAULT now(), ADD COLUMN updated_at TIMESTAMP DEFAULT now();
ALTER TABLE course ADD COLUMN created_at TIMESTAMP DEFAULT now(), ADD COLUMN updated_at TIMESTAMP DEFAULT now();
ALTER TABLE assignment ADD COLUMN created_at TIMESTAMP DEFAULT now(), ADD COLUMN updated_at TIMESTAMP DEFAULT now();
```

V3 migration — auth tables:
```sql
CREATE TABLE app_user (
    id                      BIGSERIAL PRIMARY KEY,
    email                   VARCHAR(255) UNIQUE NOT NULL,
    password_hash           VARCHAR(255),          -- NULL for OAuth2-only users
    display_name            VARCHAR(255),
    role                    VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
    provider                VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
    provider_id             VARCHAR(255),
    enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    totp_secret             VARCHAR(255),
    totp_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    activation_token        VARCHAR(255),
    activation_token_expiry TIMESTAMP,
    created_at              TIMESTAMP DEFAULT now(),
    updated_at              TIMESTAMP DEFAULT now()
);

-- Link student records to user accounts
ALTER TABLE student ADD COLUMN user_id BIGINT REFERENCES app_user(id);
CREATE UNIQUE INDEX idx_student_user ON student(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE refresh_token (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token      VARCHAR(512) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_refresh_token_user ON refresh_token(user_id);
CREATE INDEX idx_app_user_email ON app_user(email);
```

### MongoDB database: `ts` — Graph Model (2 collections)

**Every word is defined ONCE. A word can appear under multiple parents (graph, not tree). Any word can have its own definition AND be a parent of other words.**

```java
// Collection: word_definitions — each word exists exactly once
@Document(collection = "word_definitions")
public class WordDefinition {
    @Id private String id;
    private String word;
    private String createdByUserId;       // teacher's AppUser.id
    // Flexible fields — no strict form per word
    private String meaning;
    private String usage;
    private String notes;
    private List<String> examples;
    private List<String> tags;
    private Map<String, Object> extra;    // catch-all for arbitrary fields
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
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
// Unique compound: { parentWordId: 1, childWordId: 1 } (prevent duplicate links)
```

**Key design rules:**
- A word with no incoming links (not a childWordId in any link) = root word
- A word with outgoing links (is a parentWordId) = has children (acts as category)
- A word can have BOTH a definition AND children — no isCategory flag
- Cycle detection: before creating a link, traverse ancestors of parent to ensure child isn't already an ancestor

---

## Dependencies (pom.xml)

```
spring-boot-starter-data-jpa
spring-boot-starter-mongodb
spring-boot-starter-security
spring-boot-starter-webmvc
spring-boot-starter-mail
spring-boot-starter-validation
spring-boot-starter-oauth2-client
spring-boot-starter-data-redis
springdoc-openapi-starter-webmvc-ui (2.8.6)
jjwt-api / jjwt-impl / jjwt-jackson (0.12.6)
dev.samstevens.totp:totp (1.7.1)
flyway-database-postgresql
postgresql (runtime)
lombok
Testcontainers (postgresql, mongodb, junit-jupiter) — test scope
```

---

## API Endpoints (all on port 8080)

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | Public | Register (choose EMAIL or SCREEN activation) |
| GET | `/api/auth/activate?token=` | Public | Activate account via token |
| POST | `/api/auth/login` | Public | Login, returns JWT or 2FA-required flag |
| POST | `/api/auth/login/2fa` | Public | Verify TOTP code, get full JWT |
| POST | `/api/auth/refresh` | Public | Refresh access token |
| POST | `/api/auth/logout` | Auth | Invalidate refresh token |
| GET | `/api/auth/2fa/setup` | Auth | Get TOTP secret + QR URI |
| POST | `/api/auth/2fa/enable` | Auth | Verify first code, enable 2FA |
| POST | `/api/auth/2fa/disable` | Auth | Disable 2FA |
| GET | `/api/auth/me` | Auth | Current user profile |
| GET | `/oauth2/authorization/google` | Public | Redirect to Google (Spring handles) |

### Students — `/api/students`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/students` | TEACHER | List all (paginated, `?page=0&size=20`) |
| GET | `/api/students/{id}` | TEACHER | Get by ID |
| POST | `/api/students` | TEACHER | Create |
| PUT | `/api/students/{id}` | TEACHER | Update |
| DELETE | `/api/students/{id}` | TEACHER | Delete |
| GET | `/api/students/{id}/courses` | TEACHER | Courses for a student |
| GET | `/api/students/search?q=` | TEACHER | Search by name/email |
| GET | `/api/students/me/courses` | STUDENT | My enrolled courses |
| GET | `/api/students/me/assignments` | STUDENT | My assignments |

### Courses — `/api/courses`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/courses` | TEACHER | List all (paginated) |
| GET | `/api/courses/{id}` | TEACHER, STUDENT (enrolled) | Get by ID |
| POST | `/api/courses` | TEACHER | Create |
| PUT | `/api/courses/{id}` | TEACHER | Update |
| DELETE | `/api/courses/{id}` | TEACHER | Delete |
| POST | `/api/courses/{id}/students/{studentId}` | TEACHER | Enroll student |
| DELETE | `/api/courses/{id}/students/{studentId}` | TEACHER | Remove student |
| GET | `/api/courses/{id}/students` | TEACHER | List enrolled students |
| GET | `/api/courses/{id}/assignments` | TEACHER, STUDENT | List assignments |

### Assignments — `/api/assignments`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/assignments` | TEACHER | List all (filterable by `?courseId=`) |
| GET | `/api/assignments/{id}` | TEACHER, STUDENT (enrolled) | Get by ID |
| POST | `/api/assignments` | TEACHER | Create (requires courseId) |
| PUT | `/api/assignments/{id}` | TEACHER | Update |
| DELETE | `/api/assignments/{id}` | TEACHER | Delete |

### Dictionary — `/api/dictionary` (TEACHER only)

**Words (definitions):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dictionary/words` | List all words for current teacher (paginated, searchable `?q=`) |
| GET | `/api/dictionary/words/{id}` | Get single word definition |
| POST | `/api/dictionary/words` | Create new word definition |
| PUT | `/api/dictionary/words/{id}` | Update word definition |
| DELETE | `/api/dictionary/words/{id}` | Delete word + all its links |
| GET | `/api/dictionary/words/{id}/parents` | All categories this word belongs to |
| GET | `/api/dictionary/words/{id}/children` | All children of this word |

**Links (graph structure):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dictionary/roots` | Words with no parents (root nodes) |
| GET | `/api/dictionary/graph` | Full graph for current teacher (recursive) |
| POST | `/api/dictionary/links` | Create link `{parentWordId, childWordId}` (with cycle detection) |
| DELETE | `/api/dictionary/links/{id}` | Remove a link (word stays, just unlinked) |
| PATCH | `/api/dictionary/links/{id}` | Update link position (reorder within parent) |

---

## Auth Flows

### Sign-up
1. POST `/api/auth/signup` with `{email, password, displayName, role, activationMethod}`
2. Create AppUser (enabled=false), generate UUID activation token (24h expiry)
3. If `activationMethod=EMAIL` -> send email via NotificationService, return `{"message": "Check your email"}`
4. If `activationMethod=SCREEN` -> return `{"activationLink": "http://host/api/auth/activate?token=xxx"}`
5. GET activation link sets enabled=true, emailVerified=true
6. If role=STUDENT, auto-create linked Student record

### Login (local)
1. POST `/api/auth/login` with `{email, password}`
2. Verify credentials
3. If `totpEnabled=true` -> return `{requiresTwoFactor: true, tempToken: "..."}` (short-lived JWT with `twoFactorPending` claim)
4. Client sends POST `/api/auth/login/2fa` with `{tempToken, code}`
5. Verify TOTP -> return full access + refresh tokens

### OAuth2 (Google)
1. Frontend redirects to `/oauth2/authorization/google`
2. Spring handles Google OAuth2 dance
3. CustomOAuth2UserService finds or creates AppUser (provider=GOOGLE, enabled=true)
4. OAuth2SuccessHandler generates JWT, redirects to frontend with tokens

### Security Config
```
/api/auth/**, /oauth2/**, /swagger-ui/**, /v3/api-docs/** -> permitAll
/api/dictionary/** -> hasRole("TEACHER")
everything else -> authenticated
CSRF disabled (stateless JWT), Session: STATELESS
JwtAuthenticationFilter before UsernamePasswordAuthenticationFilter
```

---

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:17
    environment: { POSTGRES_DB: TS, POSTGRES_USER: postgres, POSTGRES_PASSWORD: root }
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  mongodb:
    image: mongo:8
    ports: ["27017:27017"]
    volumes: [mongodata:/data/db]

  redis:
    image: redis:8-alpine
    ports: ["6379:6379"]

  maildev:
    image: maildev/maildev:2.2.1
    ports: ["1080:1080", "1025:1025"]   # Web UI + SMTP

  app:
    build: .
    ports: ["8080:8080"]
    depends_on: [postgres, mongodb, redis, maildev]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/TS
      SPRING_MONGODB_URI: mongodb://mongodb:27017/ts
      SPRING_MAIL_HOST: maildev
      SPRING_MAIL_PORT: 1025
      JWT_SECRET: ${JWT_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}

volumes:
  pgdata:
  mongodata:
```

**Total containers: 5** (app + postgres + mongo + redis + maildev)

---

## Implementation Order

| Step | What | Depends On |
|------|------|------------|
| 1 | pom.xml updates + common package (dto, exception handler, audit) | Nothing |
| 2 | Student/Course/Assignment CRUD (repository, service, controller, DTOs) + V2 migration | Step 1 |
| 3 | Notification module (email service) | Step 1 |
| 4 | Auth module + V3 migration + SecurityConfig + JWT + OAuth2 + 2FA | Steps 1, 3 |
| 5 | Dictionary module (MongoDB) | Step 4 (needs auth for teacher-only) |
| 6 | Docker Compose + Dockerfile | Steps 1-5 |
| 7 | React frontend | Steps 1-5 (API ready) |
| 8 | Enhancements (virtual threads, Redis caching, Testcontainers, WebSocket) | Steps 1-7 |

---

## Pros / Cons

| Pros | Cons |
|------|------|
| Simple to develop and debug (one process, one stack trace) | All modules scale together (can't scale dictionary independently) |
| No network latency between modules (direct method calls) | One bad deploy breaks everything |
| No serialization overhead between modules | Single database = tight coupling over time |
| Easy to refactor module boundaries | Less relevant to microservices job interviews |
| Fast to get running (~5s startup) | Harder to assign modules to different teams |
| ~60 new files to create | Cannot independently deploy modules |
| 5 Docker containers | |
