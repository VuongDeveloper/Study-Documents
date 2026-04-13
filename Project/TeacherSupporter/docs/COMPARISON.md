# Architecture Comparison: Modular Monolith vs Microservices

## Side-by-Side

| Aspect | Option A: Modular Monolith | Option B: Microservices |
|--------|---------------------------|------------------------|
| **Architecture** | 1 Spring Boot app, package-based modules | 8 Spring Boot apps + Spring Cloud |
| **Startup time** | ~5 seconds (1 JVM) | ~60 seconds (8 JVMs + 6 infra containers) |
| **Docker containers** | 5 (app, postgres, mongo, redis, maildev) | 13 (4 app + 3 cloud + 6 infra) |
| **Databases** | 1 PostgreSQL + 1 MongoDB | 2 PostgreSQL + 1 MongoDB |
| **Module communication** | Direct Java method calls | REST (OpenFeign) + Kafka events |
| **Deploy** | 1 JAR | 8 JARs + orchestration |
| **Debugging** | Single stack trace | Distributed tracing (Zipkin) |
| **New files to create** | ~60 | ~90+ |
| **Boilerplate** | Low (1 SecurityConfig shared) | High (SecurityConfig per service, pom.xml per service) |
| **Config management** | application.yml + profiles | Config Server (centralized) |
| **Service discovery** | N/A (everything is in-process) | Eureka |
| **API routing** | Direct (port 8080) | API Gateway (port 8080) routes to services |
| **Failure handling** | Try-catch | Circuit breaker (Resilience4j) |
| **Messaging** | Direct method calls | Apache Kafka (async events) |
| **Job market relevance** | Good for senior monolith roles | Excellent for microservices/cloud roles |
| **Learning value** | Domain modeling, auth, full-stack | All of monolith + distributed systems patterns |
| **Complexity** | Lower | Significantly higher |
| **Risk** | Lower (fewer moving parts) | Higher (more things can break) |
| **Team scalability** | 1-3 developers | Multiple teams can own services |
| **Independent scaling** | No (all modules scale together) | Yes (scale dictionary independently of auth) |
| **Can migrate later?** | Yes, split into microservices | Already there |

---

## What's Identical in Both Options

### Auth features
- OAuth2 login via Google
- Username/password login
- TOTP 2FA (Google Authenticator compatible)
- Sign-up with activation link (email or screen, user chooses)
- JWT access + refresh tokens
- Roles: ADMIN, TEACHER, STUDENT

### API endpoints
Same REST endpoints, same request/response shapes. The difference is whether they're in 1 app or 4 apps.

### Database schema
Same tables and documents. Monolith uses 1 PostgreSQL database; microservices splits into 2 PostgreSQL databases.

### Dictionary (MongoDB) — Graph Model
Two collections: `word_definitions` (each word defined once, flexible schema via `Map<String, Object> extra`) and `word_links` (directed parent→child edges). A word can appear under multiple parents and can simultaneously have its own definition AND be a parent. Cycle detection prevents A→B→C→A loops.

### React frontend
**Completely identical.** The frontend only talks to `localhost:8080`. It has no idea whether that's a single app or a gateway routing to 4 services.

---

## React Frontend (Shared by Both)

**Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query 5, Zustand 5, React Hook Form + Zod, qrcode.react, @dnd-kit/core

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── lib/
    │   └── utils.ts                     # shadcn cn() function
    ├── api/
    │   ├── client.ts                    # axios instance -> http://localhost:8080
    │   ├── auth.ts                      # login, register, refresh, 2fa
    │   ├── courses.ts                   # course CRUD
    │   ├── students.ts                  # student CRUD
    │   ├── assignments.ts               # assignment CRUD
    │   └── dictionary.ts                # dictionary CRUD + tree
    ├── stores/
    │   └── authStore.ts                 # Zustand store (tokens + user info)
    ├── hooks/
    │   ├── useAuth.ts                   # TanStack Query auth hooks
    │   └── useCourses.ts               # TanStack Query course hooks
    ├── components/
    │   ├── ui/                          # shadcn/ui components (button, input, dialog, table, etc.)
    │   ├── layout/
    │   │   ├── AppLayout.tsx            # Sidebar + header + outlet
    │   │   ├── Sidebar.tsx              # Role-aware nav (teachers see Dictionary, students don't)
    │   │   └── Header.tsx               # User menu, logout, 2FA settings
    │   ├── auth/
    │   │   ├── ProtectedRoute.tsx       # Redirect if unauthenticated
    │   │   └── RoleGuard.tsx            # Redirect if wrong role
    │   └── common/
    │       ├── DataTable.tsx            # Reusable paginated table (TanStack Table + shadcn)
    │       └── ConfirmDialog.tsx
    └── pages/
        ├── auth/
        │   ├── LoginPage.tsx            # Email/password + "Sign in with Google" button
        │   ├── SignUpPage.tsx            # Registration with role + activation method choice
        │   ├── ActivatePage.tsx          # Reads ?token= from URL
        │   ├── TwoFactorSetupPage.tsx   # QR code + verify first code
        │   └── TwoFactorVerifyPage.tsx  # 6-digit input during login
        ├── dashboard/
        │   └── DashboardPage.tsx        # Role-aware: teachers see management, students see courses
        ├── students/
        │   ├── StudentListPage.tsx      # TEACHER only
        │   ├── StudentFormPage.tsx
        │   └── StudentDetailPage.tsx
        ├── courses/
        │   ├── CourseListPage.tsx
        │   ├── CourseFormPage.tsx
        │   └── CourseDetailPage.tsx      # Shows enrolled students + assignments
        ├── assignments/
        │   ├── AssignmentListPage.tsx
        │   ├── AssignmentFormPage.tsx
        │   └── AssignmentDetailPage.tsx
        └── dictionary/
            ├── DictionaryPage.tsx        # Split-pane: tree + detail panel (TEACHER only)
            ├── WordTreeView.tsx          # Recursive collapsible tree with drag-and-drop
            ├── WordDetailPanel.tsx       # View/edit selected word
            └── WordFormDialog.tsx        # Create/edit dialog with dynamic fields
```

### Routes (role-aware)
```
Public:  /login, /signup, /activate, /2fa/verify
Both:    / (Dashboard), /courses, /courses/:id, /assignments, /assignments/:id, /2fa/setup
Teacher: /students/*, /courses/new, /courses/:id/edit, /assignments/new, /dictionary
Student: read-only views of their enrolled courses and assignments
```

### Dictionary UI
Split-pane layout with shadcn/ui ResizablePanel:
- Left panel: Collapsible tree view with @dnd-kit drag-and-drop
- Right panel: Word detail with inline editing
- Cmd+K quick search via shadcn Command component

---

## Enhancements (Both Options)

| Enhancement | What | Why |
|-------------|------|-----|
| **Virtual Threads** | `spring.threads.virtual.enabled: true` | Free throughput boost for I/O-bound ops |
| **Structured Concurrency** | Java 25 `StructuredTaskScope` | Parallel DB queries with proper cancellation |
| **Redis** | Cache + JWT blacklist | Fast token invalidation, reduce DB load |
| **Testcontainers** | Real PostgreSQL + MongoDB + Kafka in tests | Reliable integration tests |
| **GraalVM Native** | Spring Boot AOT + native profile | Sub-second startup in containers |
| **WebSocket** | STOMP for real-time notifications | Live assignment updates |
| **Distributed Tracing** | Micrometer + Zipkin (Option B mainly) | Cross-service debugging |
| **Circuit Breaker** | Resilience4j (Option B mainly) | Graceful degradation when a service is down |

---

## My Recommendation

**If your primary goal is learning microservices for job interviews: Option B.**
You'll learn API Gateway, service discovery, circuit breakers, distributed tracing, Kafka (topics, partitions, consumer groups, offsets) — all keywords that show up in microservices job descriptions.

**If your primary goal is shipping a working app quickly: Option A.**
You can always split into microservices later. The package structure is already modular.

**Hybrid approach:** Start with Option A to get a working app fast, then extract services one at a time (auth first, then dictionary) to learn the migration path. This is actually how most real-world microservices are born.
