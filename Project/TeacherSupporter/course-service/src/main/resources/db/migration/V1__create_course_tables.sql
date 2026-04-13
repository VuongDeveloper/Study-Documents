CREATE TABLE student (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL UNIQUE,
    first_name VARCHAR(255),
    last_name  VARCHAR(255),
    email      VARCHAR(255),
    phone      VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE course (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    teacher_user_id BIGINT NOT NULL,
    start_date      DATE,
    end_date        DATE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_course_teacher ON course(teacher_user_id);

CREATE TABLE enrollment (
    id          BIGSERIAL PRIMARY KEY,
    course_id   BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    student_id  BIGINT NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT NOW(),
    status      VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    UNIQUE(course_id, student_id)
);

CREATE INDEX idx_enrollment_course ON enrollment(course_id);
CREATE INDEX idx_enrollment_student ON enrollment(student_id);

CREATE TABLE assignment (
    id           BIGSERIAL PRIMARY KEY,
    course_id    BIGINT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    status       VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    document_url VARCHAR(500),
    start_date   DATE,
    due_date     DATE,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assignment_course ON assignment(course_id);
