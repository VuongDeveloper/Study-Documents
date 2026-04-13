CREATE TABLE course (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255),
    description VARCHAR(255),
    status      VARCHAR(255),
    start_date  DATE,
    end_date    DATE
);

CREATE TABLE student (
    id         BIGSERIAL PRIMARY KEY,
    first_name VARCHAR(255),
    last_name  VARCHAR(255),
    email      VARCHAR(255),
    phone      VARCHAR(255)
);

-- Many-to-many: Course (owning) <-> Student
CREATE TABLE course_student (
    course_id  BIGINT NOT NULL REFERENCES course (id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES student (id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, student_id)
);

CREATE INDEX idx_course_student_student ON course_student (student_id);

-- One-to-many: Course -> Assignment
CREATE TABLE assignment (
    id           BIGSERIAL PRIMARY KEY,
    course_id    BIGINT NOT NULL REFERENCES course (id) ON DELETE CASCADE,
    title        VARCHAR(255),
    description  VARCHAR(255),
    status       VARCHAR(255),
    document_url VARCHAR(255),
    start_date   DATE,
    due_date     DATE
);

CREATE INDEX idx_assignment_course ON assignment (course_id);
