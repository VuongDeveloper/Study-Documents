# Database Design Decisions

## Why 3 Different Databases?

This project uses **polyglot persistence** — the right database for the right job.

| Database | What It Stores | Why This DB |
|----------|---------------|-------------|
| **PostgreSQL** | Users, tokens, courses, students, assignments, enrollments | Fixed schemas, strong relationships, ACID transactions, referential integrity |
| **MongoDB** | Word definitions, word links (dictionary) | Flexible per-word schema, graph traversal (`$graphLookup`), text search |
| **Redis** | JWT blacklist, response cache | Sub-millisecond reads, auto-expiring keys (TTL), in-memory |

---

## PostgreSQL — Why Not MySQL or MongoDB?

### PostgreSQL over MySQL
- **Partial unique indexes**: `CREATE UNIQUE INDEX idx ON student(user_id) WHERE user_id IS NOT NULL` — MySQL can't do conditional uniqueness
- **Better JSON support** (`jsonb` type) if you ever need semi-structured fields in relational tables
- **Advanced indexing** (GIN, GiST, BRIN) for future full-text search on course descriptions
- **Stricter SQL compliance** — fewer surprises as queries grow complex
- Most demanded relational DB in Java/Spring job postings (alongside MySQL)

### PostgreSQL over "MongoDB for everything"
- **Referential integrity**: `assignment.course_id REFERENCES course(id) ON DELETE CASCADE` — delete a course, all assignments auto-delete. MongoDB can't enforce this at the database level
- **ACID transactions**: User registration creates a user row AND refresh token atomically. PostgreSQL guarantees this. MongoDB multi-document transactions exist but are slower and discouraged as a primary pattern
- **Many-to-many relationships**: Course ↔ Student enrollment is a classic relational pattern. In MongoDB you'd either embed (duplicate data, update nightmares) or use references (manual joins, no FK enforcement — you're building a relational DB badly)

---

## MongoDB — Why Not PostgreSQL JSONB for Dictionary?

Your requirement: *"not strict the form for every single word"*

Teacher A defines `Dog` with `{meaning, usage, etymology, difficulty}`.
Teacher B defines `Ephemeral` with `{meaning, synonyms, antonyms, example_sentences, mnemonic}`.

### In PostgreSQL you'd need one of these bad options:

**Option 1: JSONB column**
```sql
CREATE TABLE word (id BIGSERIAL, word VARCHAR, data JSONB);
```
Works, but: no type checking on nested fields, indexing is possible but verbose (`CREATE INDEX ON word USING GIN (data)`), and you lose the natural document feel.

**Option 2: EAV pattern (entity-attribute-value)**
```sql
CREATE TABLE word_attribute (word_id BIGINT, key VARCHAR, value TEXT);
-- { word_id: 1, key: "meaning", value: "A domesticated mammal" }
-- { word_id: 1, key: "difficulty", value: "2" }
```
Terrible query performance, loses typing (everything is a string), extremely verbose queries to reconstruct a full word.

**Option 3: Many nullable columns**
```sql
CREATE TABLE word (id BIGSERIAL, word VARCHAR, meaning TEXT, usage TEXT, 
    etymology TEXT, synonyms TEXT[], difficulty INT, mnemonic TEXT, ...);
```
Wasteful (most columns NULL for most words), hard to extend (need migrations to add new fields), doesn't support truly arbitrary per-word fields.

### MongoDB handles this naturally:
```json
{ "word": "Dog", "meaning": "...", "extra": { "etymology": "Old English", "difficulty": 2 } }
{ "word": "Ephemeral", "meaning": "...", "extra": { "synonyms": ["fleeting"], "mnemonic": "..." } }
```

Additional MongoDB advantages for dictionary:
- **Text index** built-in: search across word, meaning, notes without Elasticsearch
- **`$graphLookup`** aggregation: traverse word parent-child links recursively in a single query (useful for building the full tree)
- **Learning value**: polyglot persistence is a real-world microservices pattern worth learning

---

## Redis — Why Not Just Use PostgreSQL?

### JWT Blacklist
When a user logs out, their token is blacklisted until it naturally expires (15 min). Every authenticated request checks: "is this token blacklisted?"

- **PostgreSQL**: Thousands of reads/minute hitting disk for a tiny table that's mostly empty. Needs a scheduled cleanup job to delete expired entries.
- **Redis**: In-memory, sub-millisecond reads. `SET token "blacklisted" EX 900` — auto-deletes after 900 seconds (the token's remaining lifetime). Zero maintenance.

### Response Cache
Frequently-read, rarely-changed data (e.g., teacher's course list):
- `@Cacheable("courses")` stores the result in Redis
- Next request hits Redis (microseconds) instead of PostgreSQL (milliseconds)
- Cache invalidated on write (`@CacheEvict`)

---

## Table Design — Auth

### `users`

```sql
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    role            VARCHAR(20) NOT NULL,
    provider        VARCHAR(20) DEFAULT 'LOCAL',
    provider_id     VARCHAR(255),
    totp_secret     VARCHAR(255),
    totp_enabled    BOOLEAN DEFAULT FALSE,
    activated       BOOLEAN DEFAULT FALSE,
    activation_code VARCHAR(64),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
```

| Column | Decision | Reason |
|--------|----------|--------|
| `password_hash` | **Nullable** | OAuth2-only users (Google login) have no password. Making this NOT NULL would require a dummy password for Google users — a security anti-pattern |
| `role` | **VARCHAR, not PostgreSQL ENUM** | PG enums can't be altered easily. Adding `TEACHING_ASSISTANT` later requires `ALTER TYPE ... ADD VALUE` which can't run inside a transaction. VARCHAR + app-level validation is more flexible |
| `provider` + `provider_id` | **Two columns** | Supports multiple OAuth2 providers later (Google, GitHub, Microsoft). `provider_id` is the external ID (Google's "sub" claim). Future: add unique constraint `(provider, provider_id)` to prevent duplicate accounts |
| `totp_secret` | **VARCHAR, encrypted at app level** | Must be stored to verify future TOTP codes. Encrypted with AES-256 before saving. If someone dumps the DB, they can't generate valid codes without the encryption key |
| `activation_code` | **Short code, not full URL** | We store just the code (UUID, 64 chars). The URL is constructed at the app level (`base_url + code`). Changing the frontend URL doesn't require a migration |
| `id` | **BIGSERIAL not UUID** | Sequential IDs are faster for B-tree indexes (no random page writes). UUIDs cause index fragmentation. For a non-distributed single-DB, BIGSERIAL is optimal |

### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

| Decision | Reason |
|----------|--------|
| **Separate table, not embedded in users** | A user can have multiple active refresh tokens (logged in on phone + laptop). One-to-many relationship |
| **ON DELETE CASCADE** | When a user is deleted, all their tokens are automatically cleaned up |
| **`expires_at` column** | Allows cleanup job: `DELETE FROM refresh_tokens WHERE expires_at < NOW()`. Also used for validation without decoding the token |

---

## Table Design — Course

### `student`

```sql
CREATE TABLE student (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL UNIQUE,
    first_name VARCHAR(255),
    last_name  VARCHAR(255),
    email      VARCHAR(255),
    phone      VARCHAR(255)
);
```

| Decision | Reason |
|----------|--------|
| **`user_id` is NOT a FK** (microservices) | It references auth-service's database. Cross-database FKs don't exist. App layer (Feign) validates the user exists. In the monolith option, it IS a real FK |
| **`email` duplicated from `users`** | Intentional denormalization. Course-service needs email to display it without calling auth-service for every student list query. Synced on creation; future: Kafka event propagates email changes |
| **`user_id` is UNIQUE** | One user = one student profile. Prevents accidental duplicate student records for the same person |

### `course`

```sql
CREATE TABLE course (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) DEFAULT 'DRAFT',
    teacher_user_id BIGINT NOT NULL,
    start_date      DATE,
    end_date        DATE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

| Decision | Reason |
|----------|--------|
| **`description` is TEXT, not VARCHAR** | Course descriptions can be long (paragraphs). TEXT has no length limit in PostgreSQL (same storage as VARCHAR, just no constraint) |
| **`status` is VARCHAR with default 'DRAFT'** | Workflow: DRAFT → ACTIVE → ARCHIVED. VARCHAR for same reason as `role` — easy to add new statuses |
| **`teacher_user_id`** instead of a FK to a `teacher` table | Teachers are just users with role=TEACHER. No separate teacher entity needed. One less table, one less join |

### `enrollment` (replaces the old `course_student` join table)

```sql
CREATE TABLE enrollment (
    id          BIGSERIAL PRIMARY KEY,
    course_id   BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    student_id  BIGINT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT NOW(),
    status      VARCHAR(50) DEFAULT 'ACTIVE',
    UNIQUE(course_id, student_id)
);
```

| Decision | Reason |
|----------|--------|
| **Full entity, not a join table** | The old `course_student` was a pure join table (just two FKs). But enrollments have metadata: *when* enrolled? Is it *active* or *dropped*? The moment you need extra columns on a many-to-many, you promote it to a first-class entity. Standard JPA pattern |
| **Has its own `id` PK** | Enables `DELETE /api/enrollments/{id}` — cleaner than `DELETE /api/enrollments?courseId=X&studentId=Y` |
| **`UNIQUE(course_id, student_id)`** | Prevents enrolling the same student twice in the same course |
| **`ON DELETE CASCADE` on both FKs** | Delete a course → all enrollments gone. Delete a student → all enrollments gone. No orphan rows |

### `assignment`

```sql
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

| Decision | Reason |
|----------|--------|
| **`document_url` is VARCHAR(500)** | Stores a URL to an external file (Google Drive, S3, etc.). 500 chars accommodates long S3 presigned URLs. We store the URL, not the file itself — file storage is a separate concern |
| **`course_id` NOT NULL** | Every assignment belongs to a course. Orphan assignments make no sense |

---

## Table Design — Dictionary (MongoDB)

### `word_definitions` collection

```javascript
{
  _id: ObjectId("..."),
  word: "Dog",
  createdByUserId: "5",
  meaning: "A domesticated carnivorous mammal",
  usage: "noun",
  notes: "Man's best friend",
  examples: ["The dog barked loudly"],
  tags: ["animal", "pet"],
  extra: { etymology: "Old English docga", difficulty: 2 },
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

| Decision | Reason |
|----------|--------|
| **Common fields (`meaning`, `usage`, `notes`, `examples`, `tags`) + flexible `extra` map** | Common fields are indexed and typed. `extra` is the catch-all for arbitrary per-word data. This balances structure with flexibility |
| **`extra` is `Map<String, Object>`** | Teacher can add anything: `{ etymology: "...", difficulty: 3, image_url: "..." }`. No schema change needed |
| **`createdByUserId` on every document** | Multi-tenant isolation. Every query filters by teacher. Each teacher sees only their own words |

### `word_links` collection

```javascript
{
  _id: ObjectId("..."),
  parentWordId: "w_animals",
  childWordId: "w_dog",
  position: 0,
  createdByUserId: "5"
}
```

| Decision | Reason |
|----------|--------|
| **Separate collection for links** | Decouples word content from graph structure. Moving a word = changing a link, not modifying the word definition. Deleting a link doesn't affect the word |
| **`position` field** | Controls ordering of children within a parent (for UI drag-and-drop reorder). Without this, children appear in insertion order |
| **`createdByUserId` on links too** | Same teacher isolation. Also enables: "show me all links I created" |

### MongoDB Indexes

```javascript
// word_definitions
db.word_definitions.createIndex({ createdByUserId: 1 })
// Why: Every query filters by teacher. Without this, full collection scan.

db.word_definitions.createIndex(
  { word: "text", meaning: "text", notes: "text" }
)
// Why: Enables full-text search across multiple fields in one query.
// Usage: db.word_definitions.find({ $text: { $search: "dog mammal" } })

// word_links
db.word_links.createIndex({ parentWordId: 1, position: 1 })
// Why: "Give me all children of X, ordered" is the #1 query (rendering tree UI).
// Single indexed scan, no in-memory sort.

db.word_links.createIndex({ childWordId: 1 })
// Why: "Give me all parents of X" — for breadcrumbs UI and cycle detection.

db.word_links.createIndex(
  { parentWordId: 1, childWordId: 1 },
  { unique: true }
)
// Why: Prevents linking the same child to the same parent twice.
// Without this, duplicate API calls create phantom edges.
```

---

## Summary: Data Flow Diagram

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│   Redis      │     │  PostgreSQL: ts_auth                     │
│              │     │  ┌────────┐  ┌────────────────┐          │
│  JWT blacklist│     │  │ users  │  │ refresh_tokens │          │
│  Cache       │     │  └────────┘  └────────────────┘          │
└─────────────┘     └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │  PostgreSQL: ts_course                    │
                    │  ┌─────────┐ ┌────────┐ ┌────────────┐   │
                    │  │ student │ │ course │ │ enrollment │   │
                    │  └─────────┘ └────────┘ └────────────┘   │
                    │  ┌────────────┐                           │
                    │  │ assignment │                           │
                    │  └────────────┘                           │
                    └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │  MongoDB: ts_dictionary                   │
                    │  ┌──────────────────┐ ┌────────────┐     │
                    │  │ word_definitions │ │ word_links │     │
                    │  └──────────────────┘ └────────────┘     │
                    └──────────────────────────────────────────┘
```
