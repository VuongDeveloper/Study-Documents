# Spring Cloud Tutor — Progress

Current section: 1
Gate threshold: 9.5/10

| # | Section | Status | Best score | Attempts |
|---|---------|--------|-----------|----------|
| 1 | Architecture & service boundaries | not started | – | 0 |
| 2 | Maven multi-module build | locked | – | 0 |
| 3 | Config Server | locked | – | 0 |
| 4 | Service discovery (Eureka) | locked | – | 0 |
| 5 | Spring Cloud Gateway | locked | – | 0 |
| 6 | Spring Security fundamentals | locked | – | 0 |
| 7 | JWT with JJWT | locked | – | 0 |
| 8 | OAuth2 / Google login | locked | – | 0 |
| 9 | TOTP two-factor auth | locked | – | 0 |
| 10 | Auth at the edge | locked | – | 0 |
| 11 | JPA/Hibernate in microservices | locked | – | 0 |
| 12 | Flyway migrations | locked | – | 0 |
| 13 | Database-per-service (PostgreSQL) | locked | – | 0 |
| 14 | MongoDB | locked | – | 0 |
| 15 | Object storage (S3/MinIO) | locked | – | 0 |
| 16 | OpenFeign | locked | – | 0 |
| 17 | Resilience4j | locked | – | 0 |
| 18 | Kafka fundamentals | locked | – | 0 |
| 19 | Kafka in Spring | locked | – | 0 |
| 20 | Email pipeline | locked | – | 0 |
| 21 | Distributed tracing | locked | – | 0 |
| 22 | Actuator & health | locked | – | 0 |
| 23 | OpenAPI (springdoc) | locked | – | 0 |
| 24 | Docker & Dockerfiles | locked | – | 0 |
| 25 | Docker Compose orchestration | locked | – | 0 |
| 26 | CI/CD (GitHub Actions) | locked | – | 0 |
| 27 | React + TS + Vite | locked | – | 0 |
| 28 | Frontend data & state | locked | – | 0 |
| 29 | Forms, validation & routing | locked | – | 0 |
| 30 | Capstone: system design synthesis | locked | – | 0 |

## Attempt log
<!-- one line per quiz attempt: date | section | score | weak topics -->

## Notes
<!-- persistent observations about the learner's strengths/gaps -->
- 2026-07-16 | OCI deployment side-quest (not a curriculum section): covered VCN networking end to end. Learner now understands VCN/subnet nesting, public vs private subnets, Internet Gateway vs NAT Gateway vs Spring Cloud Gateway (three-"gateway" confusion resolved), bastion/SSH tunneling to reach private resources (MailDev 1080, Eureka 8761, Postgres, Mongo), and defense-in-depth / blast-radius reduction incl. its limits (compromised in-subnet service, → least-privilege DB creds, NSGs, secrets rotation, detection). Strong reasoning once concepts were grounded in the home-network analogy. Learns best by analogy + being asked to reason before being told.
- Deployment target: OCI Always Free tier. Watch: 24GB (possibly cut to 12GB in 2026) ARM RAM is tight for full stack (~10 JVMs + Kafka + 2 Postgres + Mongo). Sizing exercise pending when deployment begins. Never expose MailDev/Eureka/JDWP/Postgres to internet — tunnel instead.
